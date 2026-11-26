import { describe, expect, it, vi } from "vitest";
import { AIAPIError } from "@boldvideo/bold-js";
import { createAssistantHandler, type AssistantBold, type AssistantHandlerOptions, type ChatRequest } from "../src/server";
import { createFakeBold, syntheticAnswer, type FakeConversation } from "../src/testing";
import { createFetchTransport, emptyThread, reduceThread, type AssistantEvent } from "../src/core";

function conversation(id: string, viewer = "viewer"): FakeConversation {
  return { viewer,
    summary: { conversationId: id, scope: "library", title: "A question", preview: "An answer", status: "complete",
      messageCount: 2, createdAt: "2026-01-01", updatedAt: "2026-01-01", channel: "api", client: null, video: null },
    detail: { conversationId: id, messages: [], metadata: { originalQuery: "A question", status: "complete", confidence: "high", chunksFound: 0 },
      createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  };
}
const authorize = () => ({ viewer: "viewer", access: { answer: ["allowed"] } });
const post = (body: unknown = { prompt: "A question" }, signal?: AbortSignal) => new Request("https://app.example/assistant", { method: "POST", body: JSON.stringify(body), signal });
const get = (query = "") => new Request(`https://app.example/assistant${query}`);

describe("assistant handler", () => {
  it("passes the fixture and unknown events byte-for-byte without stalling", async () => {
    const unknown = { type: "future_event", nested: { untouched_field: "yes" } } as unknown as AssistantEvent;
    const events = [unknown, ...syntheticAnswer, unknown];
    const handler = createAssistantHandler({ bold: createFakeBold({ answer: events }), authorize });
    const response = await handler(post());
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(await response.text()).toBe(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
    const many = [...Array.from({ length: 3000 }, () => unknown), { type: "text_delta", delta: "Reached the end" } as const];
    const result = await createAssistantHandler({ bold: createFakeBold({ answer: many }), authorize })(post());
    expect(await result.text()).toBe(many.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
  });

  it("runs fetch transport, handler, fake Bold and reducer together", async () => {
    const seed = conversation("owned");
    const handler = createAssistantHandler({ bold: createFakeBold({ conversations: [seed] }), authorize });
    const transport = createFetchTransport("https://app.example/assistant", { fetch: (url, init) => handler(new Request(url, init)) });
    expect((await transport.list!()).conversations).toEqual([seed.summary]);
    expect(await transport.load!("owned")).toEqual(seed.detail);
    const request = { prompt: "A question", requestId: "request" };
    let thread = reduceThread(emptyThread, { type: "question_asked", request });
    for await (const event of transport.ask(request, { signal: new AbortController().signal })) thread = reduceThread(thread, event);
    expect(thread.messages[1].status).toBe("complete");
    expect(Object.keys(thread.messages[1].citationMap)).toHaveLength(256);
    expect(thread.messages[1].content).toContain("[c_0_1]");
  });

  it("passes a refusal through and refuses absent access, but accepts explicit empty grants", async () => {
    const bold = createFakeBold();
    const refused = new Response("Sign in", { status: 401, headers: { "X-Reason": "login" } });
    expect(await createAssistantHandler({ bold, authorize: () => refused })(post())).toBe(refused);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = (() => ({ viewer: "viewer" })) as unknown as AssistantHandlerOptions["authorize"];
    const response = await createAssistantHandler({ bold, authorize: missing })(post());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "access_required", message: expect.stringContaining("decide access") });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("decide access"));
    log.mockRestore();
    const empty = createAssistantHandler({ bold, authorize: () => ({ viewer: "viewer", access: {} }) });
    expect((await empty(post())).status).toBe(200);
    expect((await createAssistantHandler({ bold, authorize: () => ({ viewer: "", access: {} }) })(get())).status).toBe(500);
  });

  it("takes identity/grants only from authorize and carries focus, attribution and request ID", async () => {
    let observed!: ChatRequest;
    const bold = createFakeBold({ answer: request => { observed = request; return []; } });
    const handler = createAssistantHandler({ bold, authorize: (_request, context) => {
      expect(context).toEqual({ focus: { videoId: "video", currentTime: 37 } });
      return authorize();
    } });
    await handler(post({ prompt: "A question", focus: { videoId: "video", currentTime: 37 }, requestId: "request",
      viewer: "attacker", access: { answer: ["forbidden"] }, stream: false, clientName: "spoofed" }));
    expect(observed).toMatchObject({ viewer: "viewer", access: { answer: ["allowed"] }, prompt: "A question",
      focus: { videoId: "video", currentTime: 37 }, requestId: "request", clientName: "@boldvideo/assistant", clientVersion: "0.1.0" });
    expect("stream" in observed).toBe(false);
  });

  it("denies continuing and loading another viewer's conversation, permits owned history", async () => {
    const mine = conversation("mine"), other = conversation("other", "another-viewer");
    const bold = createFakeBold({ conversations: [mine, other] });
    // The fake detail API is tenant-wide, so it cannot accidentally hide a missing ownership check.
    expect(await bold.ai.getConversation("other", { viewer: "viewer", access: {} })).toEqual(other.detail);
    const handler = createAssistantHandler({ bold, authorize });
    for (const request of [post({ prompt: "Continue", conversationId: "other" }), get("?conversation=other"), get("?conversation=missing")]) {
      const response = await handler(request);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ type: "error", code: "conversation_not_found", message: "Conversation not found.", retryable: false });
    }
    expect((await handler(post({ prompt: "Continue", conversationId: "mine" }))).status).toBe(200);
    expect(await (await handler(get("?conversation=mine"))).json()).toEqual(mine.detail);
    expect(await (await handler(get())).json()).toEqual({ conversations: [mine.summary], pagination: { limit: 20, offset: 0, hasMore: false } });
  });

  it("pages ownership beyond the first hundred and stops at the sanity bound", async () => {
    const conversations = Array.from({ length: 10001 }, (_, i) => conversation(`conversation-${i}`));
    const handler = createAssistantHandler({ bold: createFakeBold({ conversations }), authorize });
    expect((await handler(get("?conversation=conversation-105"))).status).toBe(200);
    expect((await handler(get("?conversation=conversation-9999"))).status).toBe(200);
    expect((await handler(get("?conversation=conversation-10000"))).status).toBe(404);
    expect((await (await handler(get("?offset=100"))).json()).conversations[0].conversationId).toBe("conversation-100");
  });

  it("finds owned conversations when the upstream caps pages at twenty", async () => {
    const conversations = Array.from({ length: 45 }, (_, i) => conversation(`conversation-${i}`));
    conversations.push(conversation("other", "another-viewer"));
    const bold = createFakeBold({ conversations });
    const list = bold.ai.listConversations;
    bold.ai.listConversations = options => list({ ...options, limit: 20 });
    const handler = createAssistantHandler({ bold, authorize });
    expect(await (await handler(get("?conversation=conversation-44"))).json()).toEqual(conversations[44].detail);
    const continued = await handler(post({ prompt: "Continue", conversationId: "conversation-20" }));
    expect(continued.status).toBe(200);
    expect(await continued.text()).toContain('"type":"message_complete"');
    expect((await handler(get("?conversation=other"))).status).toBe(404);

    // Pagination echoes are not a cursor; advance by the actual items returned.
    bold.ai.listConversations = async options => ({ ...await list({ ...options, limit: 20 }),
      pagination: { limit: 100, offset: 0, hasMore: true } });
    expect((await handler(get("?conversation=conversation-44"))).status).toBe(200);
    // A server reporting hasMore on an empty page must terminate, not fail at a repeated-page guard.
    expect((await handler(get("?conversation=missing"))).status).toBe(404);
  });

  it.each(["invalid-item", "repeated-page", "missing-pagination", "upstream-error"])("fails closed on %s", async kind => {
    const bold = createFakeBold();
    bold.ai.listConversations = async ({ offset = 0 }) => {
      if (kind === "upstream-error") throw Object.assign(new Error("sensitive"), { status: 503 });
      if (kind === "missing-pagination") return { conversations: [] } as never;
      return { conversations: [conversation(kind === "invalid-item" ? "../invalid" : "not-target").summary],
        pagination: { limit: 100, offset, hasMore: true } };
    };
    const response = await createAssistantHandler({ bold, authorize })(get("?conversation=target"));
    expect(response.status).toBe(kind === "upstream-error" ? 503 : 502);
    expect(await response.text()).not.toContain("sensitive");
  });

  it("explains verified-access refusals without exposing upstream details or bypassing ownership", async () => {
    const refuse = () => { throw new AIAPIError("GET", "https://api.example/private", new Response(null, { status: 403 }), undefined,
      { code: "verified_ai_route_unsupported", message: "Sensitive upstream details", retryable: true }); };
    const forbiddenFallback = () => { throw Object.assign(new Error("Ownership was bypassed"), { status: 418 }); };
    const bold = createFakeBold({ answer: forbiddenFallback });
    bold.ai.getConversation = forbiddenFallback;
    bold.ai.listConversations = refuse;
    const handler = createAssistantHandler({ bold, authorize });
    const owned = createFakeBold({ conversations: [conversation("owned")], answer: refuse });
    owned.ai.getConversation = refuse;
    const ownedHandler = createAssistantHandler({ bold: owned, authorize });
    for (const response of await Promise.all([
      handler(get()), handler(get("?conversation=owned")), handler(post({ prompt: "Continue", conversationId: "owned" })),
      ownedHandler(get("?conversation=owned")), ownedHandler(post()),
    ])) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ type: "error", code: "verified_ai_access_unsupported",
        message: 'The assistant cannot run while Bold\'s "Require verified AI access" setting is on for this account. Turn it off in Bold\'s AI settings.', retryable: false });
    }
  });

  it("passes fresh access to history and authorizes GET with no focus", async () => {
    const bold = createFakeBold({ conversations: [conversation("owned")] });
    const original = bold.ai.getConversation;
    bold.ai.getConversation = (id, context) => {
      expect(context).toEqual({ viewer: "viewer", access: { answer: ["allowed"] } });
      return original(id, context);
    };
    const handler = createAssistantHandler({ bold, authorize: (request, context) => {
      expect(request.method).toBe("GET"); expect(context).toEqual({}); return authorize();
    } });
    expect((await handler(get("?conversation=owned"))).status).toBe(200);
  });

  it.each([false, true])("sanitizes upstream failures before streaming (lazy=%s)", async lazy => {
    const failure = Object.assign(new Error("key=private-value; stack; upstream body"), { status: 429 });
    const bold = createFakeBold({ answer: lazy ? async function* () { throw failure; } : () => { throw failure; } });
    const response = await createAssistantHandler({ bold, authorize })(post());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ type: "error", code: "upstream_error", message: "The assistant request could not be completed.", retryable: true });
  });

  it("sanitizes thrown failures after headers while preserving typed error events", async () => {
    const bold = createFakeBold({ answer: async function* () {
      yield { type: "text_delta", delta: "Partial" } as const;
      throw Object.assign(new Error("private-value"), { status: 429 });
    } });
    const response = await createAssistantHandler({ bold, authorize })(post());
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('"delta":"Partial"');
    expect(body).toContain('"code":"upstream_error"');
    expect(body).toContain('"status":429');
    expect(body).not.toContain("private-value");
    const event: AssistantEvent = { type: "error", code: "unavailable", message: "Try later", retryable: true };
    const typed = await createAssistantHandler({ bold: createFakeBold({ answer: [event] }), authorize })(post());
    expect(await typed.text()).toBe(`data: ${JSON.stringify(event)}\n\n`);
  });

  it.each(["request", "body"])("aborts upstream during a blocked next on %s cancellation", async mode => {
    let observed!: AbortSignal;
    let cleaned = false;
    const bold = createFakeBold({ answer: async function* (request) {
      observed = request.signal;
      try {
        yield { type: "text_delta", delta: "First" } as const;
        await new Promise<void>((_resolve, reject) => {
          if (request.signal.aborted) reject(request.signal.reason);
          else request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
        });
      } finally { cleaned = true; }
    } });
    const abort = new AbortController();
    const response = await createAssistantHandler({ bold, authorize })(post(undefined, abort.signal));
    const reader = response.body!.getReader();
    await reader.read();
    const pending = reader.read();
    if (mode === "request") {
      abort.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    } else { await reader.cancel(); await pending; }
    expect(observed.aborted).toBe(true);
    await vi.waitFor(() => expect(cleaned).toBe(true));
  });

  it("aborts during chat setup and does not start an already-aborted request", async () => {
    let observed: AbortSignal | undefined;
    let started!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const bold = createFakeBold({ answer: request => new Promise((_resolve, reject) => {
      observed = request.signal; started();
      request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
    }) });
    const abort = new AbortController();
    const handler = createAssistantHandler({ bold, authorize });
    const pending = handler(post(undefined, abort.signal));
    await began; abort.abort();
    expect((await pending).status).toBe(502);
    expect(observed?.aborted).toBe(true);
    observed = undefined;
    expect((await handler(post(undefined, abort.signal))).status).toBe(502);
    expect(observed).toBeUndefined();
  });

  it("rejects unsupported methods and malformed input", async () => {
    const handler = createAssistantHandler({ bold: createFakeBold(), authorize });
    const method = await handler(new Request("https://app.example/assistant", { method: "PUT" }));
    expect(method.status).toBe(405); expect(method.headers.get("Allow")).toBe("GET, POST");
    for (const body of [null, {}, { prompt: " " }, { prompt: "x", conversationId: "../unsafe" }, { prompt: "x", requestId: [] },
      { prompt: "x", focus: null }, { prompt: "x", focus: {} }, { prompt: "x", focus: { videoId: "v", currentTime: -1 } }]) {
      expect((await handler(post(body))).status).toBe(400);
    }
    for (const query of ["?conversation=", "?conversation=..%2Funsafe", "?offset=-1", "?offset=1.5", "?offset=9007199254740992"]) {
      expect((await handler(get(query))).status).toBe(400);
    }
    expect((await handler(new Request("https://app.example/assistant", { method: "POST", body: "invalid" }))).status).toBe(400);
  });
});
