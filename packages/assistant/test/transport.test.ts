import { afterEach, describe, expect, it, vi } from "vitest";
import { createFetchTransport, type AssistantEvent } from "../src/core";
import { createReplayTransport, syntheticAnswer } from "../src/testing";

const request = { prompt: "A question", requestId: "request" };
const signal = () => new AbortController().signal;
async function collect<T>(stream: AsyncIterable<T>) { const values: T[] = []; for await (const value of stream) values.push(value); return values; }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("fetch transport", () => {
  it("preserves typed route errors for questions and history, but not malformed bodies", async () => {
    const error = { type: "error", code: "verified_ai_access_unsupported", message: "Turn off verified access.", retryable: false };
    const transport = createFetchTransport("/assistant", { fetch: async () => Response.json(error, { status: 403 }) });
    await expect(collect(transport.ask(request, { signal: signal() }))).rejects.toMatchObject({ ...error, status: 403 });
    await expect(transport.list!()).rejects.toMatchObject(error);
    await expect(transport.load!("owned")).rejects.toMatchObject(error);
    for (const body of ["broken", "null", "{}", JSON.stringify({ ...error, code: null }),
      JSON.stringify({ ...error, message: null }), JSON.stringify({ ...error, retryable: null })]) {
      const invalid = createFetchTransport("/assistant", { fetch: async () => new Response(body, { status: 502, headers: { "Content-Type": "application/json" } }) });
      await expect(invalid.list!()).rejects.toMatchObject({ message: "Assistant request failed (502)" });
    }
  });

  it("decodes split UTF-8, CRLF, multiline data, unknown events and a final unterminated block", async () => {
    const text = ': heartbeat\r\n\r\nevent: delta\r\ndata: {"type":"text_delta",\r\ndata: "delta":"A café"}\r\n\r\ndata: {"type":"future","extra":1}\r\n\r\ndata: {"type":"text_delta","delta":"!"}';
    const bytes = new TextEncoder().encode(text);
    const transport = createFetchTransport("/assistant", { fetch: async () => new Response(new ReadableStream({
      start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); },
    })) });
    expect(await collect(transport.ask(request, { signal: signal() }))).toEqual([
      { type: "text_delta", delta: "A café" }, { type: "future", extra: 1 }, { type: "text_delta", delta: "!" },
    ]);
  });

  it("sends ask, list and load with refreshed headers and encoded query parameters", async () => {
    const sent: Request[] = [];
    const fetch: typeof globalThis.fetch = async (url, init) => {
      sent.push(new Request(`https://app.example${url}`, init));
      return init?.method === "POST" ? new Response('data: {"type":"message_complete","content":"Answer"}\n\n') : Response.json({ ok: true });
    };
    let auth = "first";
    const transport = createFetchTransport("/assistant?language=en", { fetch, headers: () => ({ "X-Viewer": auth }) });
    await collect(transport.ask(request, { signal: signal() }));
    auth = "second";
    await transport.list!({ offset: 100 });
    await transport.load!("id/&?");
    expect(await sent[0].json()).toEqual(request);
    expect(sent[0].headers.get("Content-Type")).toBe("application/json");
    expect(sent[0].headers.get("X-Viewer")).toBe("first");
    expect(sent[1].url).toBe("https://app.example/assistant?language=en&offset=100");
    expect(sent[1].headers.get("X-Viewer")).toBe("second");
    expect(new URL(sent[2].url).searchParams.get("conversation")).toBe("id/&?");
    vi.stubGlobal("fetch", fetch);
    await createFetchTransport("/assistant").list!();
    expect(sent[3].url).toBe("https://app.example/assistant?offset=0");
    await createFetchTransport("/assistant", { fetch, headers: { "X-Static": "yes" } }).list!({});
    expect(sent[4].headers.get("X-Static")).toBe("yes");
  });

  it.each([
    ['data: [DONE]\n\n', []],
    ['data: {"type":"error","code":"failed","message":"Try later","retryable":true}\n\n', [{ type: "error", code: "failed", message: "Try later", retryable: true }]],
    ['', []],
  ])("stops at terminal events and EOF: %s", async (text, expected) => {
    const transport = createFetchTransport("/assistant", { fetch: async () => new Response(text) });
    expect(await collect(transport.ask(request, { signal: signal() }))).toEqual(expected);
  });

  it("rejects errors without exposing response bodies and releases malformed streams", async () => {
    const failed = createFetchTransport("/assistant", { fetch: async () => new Response("sensitive upstream text", { status: 403 }) });
    await expect(collect(failed.ask(request, { signal: signal() }))).rejects.toMatchObject({ status: 403, message: "Assistant request failed (403)" });
    await expect(failed.list!()).rejects.toMatchObject({ status: 403 });
    const empty = createFetchTransport("/assistant", { fetch: async () => new Response(null) });
    await expect(collect(empty.ask(request, { signal: signal() }))).rejects.toThrow("no stream");
    let cancelled = false;
    const invalid = createFetchTransport("/assistant", { fetch: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("data: invalid\n\n")); },
      cancel() { cancelled = true; },
    })) });
    await expect(collect(invalid.ask(request, { signal: signal() }))).rejects.toThrow();
    expect(cancelled).toBe(true);
  });

  it("does not deliver already-buffered events after abort", async () => {
    const transport = createFetchTransport("/assistant", { fetch: async () => new Response(
      'data: {"type":"text_delta","delta":"First"}\n\ndata: {"type":"text_delta","delta":"Second"}\n\n'
    ) });
    const abort = new AbortController();
    const iterator = transport.ask(request, { signal: abort.signal })[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ type: "text_delta", delta: "First" });
    abort.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels on early iteration exit and aborts a blocked read", async () => {
    let cancelled = 0;
    const transport = createFetchTransport("/assistant", { fetch: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"text_delta","delta":"First"}\n\n')); },
      cancel() { cancelled++; },
    })) });
    for await (const event of transport.ask(request, { signal: signal() })) { expect(event.type).toBe("text_delta"); break; }
    expect(cancelled).toBe(1);
    const abort = new AbortController();
    const iterator = transport.ask(request, { signal: abort.signal })[Symbol.asyncIterator]();
    await iterator.next();
    const pending = iterator.next();
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(2);
    await expect(collect(transport.ask(request, { signal: abort.signal }))).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("replay transport", () => {
  it("replays independent requests, function answers and cancellation between events", async () => {
    const replay = createReplayTransport(syntheticAnswer);
    expect(await collect(replay.ask(request, { signal: signal() }))).toEqual(syntheticAnswer);
    expect(await collect(replay.ask(request, { signal: signal() }))).toEqual(syntheticAnswer);
    const dynamic = createReplayTransport(req => [{ type: "text_delta", delta: req.prompt }]);
    expect(await collect(dynamic.ask(request, { signal: signal() }))).toEqual([{ type: "text_delta", delta: "A question" }]);
    const abort = new AbortController();
    const iterator = replay.ask(request, { signal: abort.signal })[Symbol.asyncIterator]();
    await iterator.next(); abort.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
  });

  it("honors cancellation during delay and removes timers", async () => {
    vi.useFakeTimers();
    const transport = createReplayTransport([{ type: "text_delta", delta: "One" }], { delayMs: 100 });
    const abort = new AbortController();
    const pending = collect(transport.ask(request, { signal: abort.signal }));
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(50);
    abort.abort(); await rejected;
    expect(vi.getTimerCount()).toBe(0);
    const completed = collect(transport.ask(request, { signal: signal() }));
    await vi.advanceTimersByTimeAsync(100);
    expect(await completed).toEqual([{ type: "text_delta", delta: "One" }]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
