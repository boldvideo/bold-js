// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, StrictMode, useState, type ReactNode, type RefCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AssistantProvider, AssistantPanel, useAssistant, useAssistantVideo, AssistantVideoPending, preloadAssistantPanel, useAssistantSources, assistantSafeHref } from "../src";
import { createReplayTransport, syntheticAnswer } from "../src/testing";
import { createAssistantHandler } from "../src/server";
import { createFakeBold } from "../src/testing";
import { createFetchTransport, type AssistantTransport, type AssistantEvent, type AskRequest, type ConversationDetail } from "../src/core";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import * as publicAPI from "../src";

let root: Root;
let host: HTMLDivElement;
let api: ReturnType<typeof useAssistant>;
function Probe() { api = useAssistant(); return <output>{api.messages.map(m => m.content).join("|")}</output>; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const detail = (id: string): ConversationDetail => ({ conversationId: id, messages: [],
  metadata: { originalQuery: id, status: "complete", confidence: "high", chunksFound: 0 }, createdAt: "", updatedAt: "" });
const replay = createReplayTransport(syntheticAnswer);
function tree(children: ReactNode = <Probe />, transport: AssistantTransport = replay, viewerKey = "viewer") {
  return <StrictMode><AssistantProvider transport={transport} viewerKey={viewerKey}>{children}</AssistantProvider></StrictMode>;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

describe("public React contracts", () => {
  it("renders and asks through the exact hooks-only README example", async () => {
    const readme = readFileSync("README.md", "utf8");
    const code = readme.split("## Build your own panel")[1].match(/```tsx\n([\s\S]*?)```/)![1];
    expect(code.trim().split("\n").length).toBeLessThan(40);
    const compiled = ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
    const exports: { MyPanel?: React.ComponentType } = {};
    new Function("require", "exports", compiled)((id: string) => {
      if (id === "react") return React;
      if (id === "react/jsx-runtime") return jsx;
      if (id === "@boldvideo/assistant") return publicAPI;
      throw new Error(`Unexpected README import: ${id}`);
    }, exports);
    const MyPanel = exports.MyPanel!;
    await act(async () => root.render(tree(<MyPanel />)));
    const input = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "How do I fold the base?");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(host.querySelector("article")?.textContent).toContain("How do I fold the base?");
    expect(host.querySelector("a")?.getAttribute("href")).toContain("/watch/video-1?t=20");
    expect(host.querySelector("a")?.textContent).toBe("1");
  });

  it("aborts Stop and rejects a late same-ID attempt while retrying the question", async () => {
    const waits = [deferred<AssistantEvent>(), deferred<AssistantEvent>()];
    const requests: AskRequest[] = [], signals: AbortSignal[] = [];
    const transport: AssistantTransport = { async *ask(request, { signal }) {
      const n = requests.length; requests.push(request); signals.push(signal);
      yield { type: "text_delta", delta: n ? "New " : "Old " };
      yield await waits[n].promise;
    } };
    await act(async () => root.render(tree(<Probe />, transport)));
    let first!: Promise<void>, second!: Promise<void>;
    await act(async () => { first = api.ask("A question"); });
    expect(api.isStreaming).toBe(true);
    await act(async () => api.stop());
    expect(signals[0].aborted).toBe(true);
    expect(api.messages[1].status).toBe("stopped");
    await act(async () => { second = api.retry(); });
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0].requestId).toMatch(/^[\da-f-]{36}$/);
    await act(async () => { waits[0].resolve({ type: "message_complete", content: "Stale" }); await first; });
    expect(api.messages).toHaveLength(2);
    expect(api.messages[1].content).toBe("New ");
    expect(api.isStreaming).toBe(true);
    await act(async () => { waits[1].resolve({ type: "message_complete", content: "Correct" }); await second; });
    expect(api.messages[1].content).toBe("Correct");
    expect(api.isStreaming).toBe(false);
  });

  it("guards resume, competing loads, reset, and a different viewer", async () => {
    const loads: ReturnType<typeof deferred<ConversationDetail>>[] = [];
    const transport = { ...replay, list: async () => ({ conversations: [], pagination: { limit: 20, offset: 0, hasMore: false } }),
      load: () => { const wait = deferred<ConversationDetail>(); loads.push(wait); return wait.promise; } };
    sessionStorage.setItem('bold-assistant:thread:["transport","viewer"]', JSON.stringify({ id: "saved", at: Date.now() }));
    await act(async () => root.render(tree(<Probe />, transport)));
    expect(loads.length).toBe(2); // StrictMode replay must restart an interrupted restore.
    await act(async () => api.ask("New question"));
    await act(async () => loads.forEach(load => load.resolve(detail("Old history"))));
    expect(api.messages[0].content).toBe("New question");
    let a!: Promise<boolean>, b!: Promise<boolean>;
    await act(async () => { a = api.open("a"); b = api.open("b"); });
    await act(async () => { loads[3].resolve(detail("b")); await b; loads[2].resolve(detail("a")); await a; });
    expect(api.messages[0].content).toBe("b");
    let pending!: Promise<boolean>;
    await act(async () => { pending = api.open("old"); api.startNew(); });
    await act(async () => { loads[4].resolve(detail("old")); await pending; });
    expect(api.messages).toEqual([]);
    await act(async () => { pending = api.open("other"); });
    await act(async () => root.render(tree(<Probe />, transport, "next-viewer")));
    await act(async () => { loads[5].resolve(detail("other")); await pending; });
    expect(api.messages).toEqual([]);
    expect(sessionStorage.getItem('bold-assistant:thread:["transport","next-viewer"]')).toBeNull();
  });

  it("adopts the retry's conversation instead of an abandoned attempt's identity", async () => {
    const requests: AskRequest[] = [];
    const transport: AssistantTransport = { async *ask(request) {
      requests.push(request);
      const first = requests.length === 1;
      yield { type: "conversation_created", conversationId: first ? "abandoned" : "kept" };
      if (first) yield { type: "error", code: "offline", message: "Offline", retryable: true };
      else yield { type: "message_complete", content: "Answer" };
    } };
    await act(async () => root.render(tree(<Probe />, transport)));
    await act(async () => api.ask("Question"));
    await act(async () => api.retry());
    expect(requests[1]).toEqual(requests[0]);
    expect(api.conversationId).toBe("kept");
    expect(JSON.parse(sessionStorage.getItem('bold-assistant:thread:["transport","viewer"]')!).id).toBe("kept");
    await act(async () => api.ask("Follow up"));
    expect(requests[2].conversationId).toBe("kept");
  });

  it.each(["video", "library"])("continues when an answer completes before navigation settles at %s", async destination => {
    vi.useFakeTimers();
    function Video({ id }: { id: string }) { useAssistantVideo({ id }); return null; }
    const wait = deferred<AssistantEvent>();
    const transport: AssistantTransport = { async *ask() { yield { type: "text_delta", delta: "Partial" }; yield await wait.promise; } };
    await act(async () => root.render(tree(<><Video id="a" /><Probe /></>, transport)));
    let question!: Promise<void>;
    await act(async () => { question = api.ask("Question"); });
    await act(async () => root.render(tree(<>{destination === "video" && <AssistantVideoPending />}<Probe /></>, transport)));
    expect(api.switching).toBe(true);
    await act(async () => { wait.resolve({ type: "message_complete", content: "Answer" }); await question; });
    if (destination === "video") await act(async () => root.render(tree(<><Video id="b" /><Probe /></>, transport)));
    else await act(async () => vi.advanceTimersByTime(120));
    expect(api.place).toBe(destination === "video" ? "video:b" : "library");
    expect(api.setAside).toBe(false);
    // A later, unrelated navigation must not consume the old continuation again.
    await act(async () => root.render(tree(<><Video id="c" /><Probe /></>, transport)));
    expect(api.setAside).toBe(true);
  });

  it("keeps followed canonical sources on aliased video routes, including the next request", async () => {
    const requests: AskRequest[] = [];
    const transport: AssistantTransport = { async *ask(request, options) {
      requests.push(request); yield* replay.ask(request, options);
    } };
    function Video() { useAssistantVideo({ id: "route-alias", canonicalVideoId: "video-1" }); return null; }
    await act(async () => root.render(tree(<Probe />, transport)));
    await act(async () => api.ask("Question"));
    const id = api.conversationId;
    await act(async () => api.follow(api.messages[1].id, "video-1"));
    await act(async () => root.render(tree(<><Video /><Probe /></>, transport)));
    expect(api.setAside).toBe(false);
    await act(async () => api.ask("Follow up"));
    expect(requests[1].conversationId).toBe(id);
    expect(api.messages).toHaveLength(4);
  });

  it("keeps a library answer that finishes in the initial video fallback and blocks unfocused asks", async () => {
    function Video() { useAssistantVideo({ id: "a" }); return null; }
    const wait = deferred<AssistantEvent>();
    const requests: AskRequest[] = [];
    const transport: AssistantTransport = { async *ask(request) {
      requests.push(request); yield { type: "text_delta", delta: "Partial" }; yield await wait.promise;
    } };
    await act(async () => root.render(tree(<Probe />, transport)));
    let question!: Promise<void>;
    await act(async () => { question = api.ask("Question"); });
    await act(async () => root.render(tree(<><AssistantVideoPending /><Probe /></>, transport)));
    expect(api.switching).toBe(true);
    await act(async () => { wait.resolve({ type: "message_complete", content: "Answer" }); await question; });
    await act(async () => api.ask("Too early"));
    expect(requests).toHaveLength(1);
    await act(async () => root.render(tree(<><Video /><Probe /></>, transport)));
    expect(api.switching).toBe(false);
    expect(api.setAside).toBe(false);
  });

  it("publishes seeking when an independent child player attaches and detaches", async () => {
    let toggle!: (shown: boolean) => void;
    function Child({ playerRef }: { playerRef: RefCallback<HTMLVideoElement> }) {
      const [shown, setShown] = useState(false); toggle = setShown;
      return shown ? <video ref={playerRef} /> : null;
    }
    function Video() { const player = useAssistantVideo({ id: "a" }); return <Child playerRef={player.ref} />; }
    await act(async () => root.render(tree(<><Video /><Probe /></>)));
    expect(api.video?.onSeek).toBeUndefined();
    await act(async () => toggle(true));
    expect(api.video?.onSeek).toBeTypeOf("function");
    await act(async () => toggle(false));
    expect(api.video?.onSeek).toBeUndefined();
  });

  it("does not let a completed history list hide an outstanding load", async () => {
    const load = deferred<ConversationDetail>();
    const transport = { ...replay, list: async () => ({ conversations: [], pagination: { limit: 20, offset: 0, hasMore: false } }), load: () => load.promise };
    await act(async () => root.render(tree(<Probe />, transport)));
    let opening!: Promise<boolean>;
    await act(async () => { opening = api.open("saved"); });
    await act(async () => api.listHistory());
    expect(api.historyLoading).toBe(true);
    await act(async () => { load.resolve(detail("saved")); await opening; });
    expect(api.historyLoading).toBe(false);
    expect(api.conversationId).toBe("saved");
  });

  it("restores a saved conversation under StrictMode and persists only its ID", async () => {
    const transport = { ...replay, list: async () => ({ conversations: [], pagination: { limit: 20, offset: 0, hasMore: false } }), load: async (id: string) => detail(id) };
    sessionStorage.setItem('bold-assistant:thread:["transport","viewer"]', JSON.stringify({ id: "saved", at: Date.now() }));
    await act(async () => root.render(tree(<Probe />, transport)));
    expect(api.messages[0].content).toBe("saved");
    await act(async () => api.ask("Do not store this question"));
    expect(sessionStorage.getItem('bold-assistant:thread:["transport","viewer"]')).not.toContain("question");
  });

  it("holds video scope through pending pages, sets aside, and keeps a stream after navigation", async () => {
    vi.useFakeTimers();
    function Video({ id }: { id: string }) { useAssistantVideo({ id, title: id }); return null; }
    const wait = deferred<AssistantEvent>();
    const transport: AssistantTransport = { async *ask() { yield { type: "text_delta", delta: "Partial" }; yield await wait.promise; } };
    await act(async () => root.render(tree(<Probe />, transport)));
    let question!: Promise<void>;
    await act(async () => { question = api.ask("Library question"); });
    await act(async () => root.render(tree(<><Video id="a" /><Probe /></>, transport)));
    await act(async () => { wait.resolve({ type: "message_complete", content: "Answer" }); await question; });
    expect(api.setAside).toBe(false);
    await act(async () => root.render(tree(<><AssistantVideoPending /><Probe /></>, transport)));
    await act(async () => vi.advanceTimersByTime(1500));
    expect(api.video?.videoId).toBe("a"); expect(api.switching).toBe(true);
    await act(async () => root.render(tree(<><Video id="b" /><Probe /></>, transport)));
    expect(api.video?.videoId).toBe("b"); expect(api.setAside).toBe(true);
    await act(async () => api.continueConversation()); expect(api.setAside).toBe(false);
    await act(async () => api.startNew()); expect(api.messages).toEqual([]);
  });

  it("renders handler errors unchanged and hides history without both operations", async () => {
    const handler = createAssistantHandler({ authorize: () => ({ viewer: "viewer", access: {} }),
      bold: createFakeBold({ answer: () => { throw { code: "verified_ai_route_unsupported", status: 403 }; } }) });
    // Node's Request rejects jsdom's AbortSignal; this case tests error display, not cancellation.
    const transport = createFetchTransport("https://app.example/assistant", { fetch: (url, init) => handler(new Request(url, { ...init, signal: undefined })) });
    await preloadAssistantPanel();
    await act(async () => root.render(tree(<><Probe /><AssistantPanel /></>, transport)));
    await act(async () => api.ask("A question"));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(api.messages[1].error?.message);
    expect(host.textContent).toContain('Require verified AI access');
    expect(api.canRetry).toBe(false);
    await act(async () => root.render(tree(<AssistantPanel />, replay, "another")));
    expect(host.querySelector('[aria-label="Earlier conversations"]')).toBeNull();
  });

  it("uses provider labels while leaving server progress unchanged", async () => {
    await preloadAssistantPanel();
    await act(async () => root.render(<AssistantProvider transport={replay} viewerKey="viewer"
      labels={{ question: "Ask here", send: "Ask now", found: (p, v) => `${p} excerpts across ${v} videos` }}>
      <Probe /><AssistantPanel />
    </AssistantProvider>));
    expect(host.querySelector("label")?.textContent).toBe("Ask here");
    expect(host.querySelector('[type="submit"]')?.textContent).toBe("Ask now");
    await act(async () => api.ask("Question"));
    expect(host.querySelector(".bold-assistant-progress")?.textContent).toContain("Searching the videos");
    expect(host.querySelector(".bold-assistant-progress")?.textContent).toContain("4 excerpts across 4 videos");
  });

  it("resolves indexed citations after completion and keeps modified links native", async () => {
    let sources!: ReturnType<typeof useAssistantSources>;
    const navigate = vi.fn();
    function Sources() { const assistant = useAssistant(); const message = assistant.messages.at(-1);
      return message?.role === "assistant" ? <Links message={message} /> : null; }
    function Links({ message }: { message: Parameters<typeof useAssistantSources>[0] }) {
      sources = useAssistantSources(message, { videoHref: (id, at) => `/watch/${id}?t=${at}`, navigate });
      const link = sources.sourceLink("c_one");
      return <a href={link.href} onClick={link.onClick}>Source</a>;
    }
    const transport = createReplayTransport([
      { type: "answer", content: "Answer [c_one]", citationMap: { c_one: 0 }, sources: [{ videoId: "right", timestamp: 31 }] },
      { type: "message_complete", content: "Answer [c_one]", sources: [{ videoId: "wrong", timestamp: 90 }] },
    ]);
    await act(async () => root.render(tree(<><Probe /><Sources /></>, transport)));
    await act(async () => api.ask("A question"));
    expect(sources.passages[0].videoId).toBe("right");
    const link = host.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/watch/right?t=31");
    // Stop jsdom's unimplemented navigation after React has handled the modified click.
    host.addEventListener("click", event => event.preventDefault(), { once: true });
    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => link.click());
    expect(navigate).toHaveBeenCalledWith("/watch/right?t=31");
    expect(assistantSafeHref("java\nscript:alert(1)")).toBeUndefined();
  });
});
