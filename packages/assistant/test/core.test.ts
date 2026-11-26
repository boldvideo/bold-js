import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPassages, citationPlayStart, createVideoStore, DEFAULT_PASSAGE_GAP_SECONDS,
  emptyThread, momentAfterMove, momentAfterStandingStill, PAUSE_AFTER_MS,
  reduceThread, shouldSetAside,
  type AnswerScope, type AssistantEvent, type CitationSource, type ConversationDetail, type ThreadEvent,
} from "../src/core";
import { syntheticAnswer } from "../src/testing";

const question = (requestId = "one", videoId?: string): ThreadEvent => ({
  type: "question_asked", request: { prompt: "How does the fold work?", requestId, focus: videoId ? { videoId } : undefined },
});
const scope = (answeredFrom: AnswerScope["answeredFrom"] = "library"): AnswerScope => ({
  answeredFrom, widenedFrom: "focus", reason: "not_covered", focus: { videoId: "a", title: "A lesson" },
});
const citation = (id: string, start: number, end = start + 4, videoId = "a", text = `Sentence ${id}.`): CitationSource => ({
  id, timestamp: start, timestampEnd: end, videoId, text, title: "A lesson", playbackId: "playback",
});
const fold = (...events: ThreadEvent[]) => events.reduce(reduceThread, emptyThread);

describe("thread replay", () => {
  it("folds the shared fixture and keeps sentence metadata separate from retrieved chunks", () => {
    const thread = fold(question(), ...syntheticAnswer);
    expect(thread.isStreaming).toBe(false);
    expect(thread.conversationId).toBe("synthetic-conversation");
    expect(thread.messages).toHaveLength(2);
    const answer = thread.messages[1];
    expect(answer.interactionId).toBe("synthetic-answer");
    expect(answer.sources).toHaveLength(4);
    expect(Object.keys(answer.citationMap)).toHaveLength(256);
    expect(answer.content.match(/\[c_/g)).toHaveLength(10);
    expect(answer.steps.every(step => step.state === "done")).toBe(true);
    const presentation = buildPassages(answer.content, answer);
    expect(presentation.passages).toHaveLength(7);
    expect(presentation.citationsById.size).toBe(11);
    expect(new Set(presentation.passages.map(p => p.videoId)).size).toBe(4);
    expect(presentation.passageNumberByCitationId.get("c_0_0")).toBe(1);
    expect(presentation.passageNumberByCitationId.get("c_0_1")).toBe(1);
    expect(citationPlayStart(presentation.passages[0], { id: "c_0_1", timestamp: 31 })).toBe(30);
    expect(answer.sources.every(s => "timestampEnd" in s && s.timestampEnd! - s.timestamp! === 65)).toBe(true);
  });

  it("keeps per-turn focus/attribution, final content, and a consistent conversation ID", () => {
    const thread = fold(question("one", "a"),
      { type: "message_start" }, { type: "message_start", conversationId: "owned" },
      { type: "conversation_created", conversationId: "other" },
      { type: "text_delta", delta: "Draft" },
      { type: "message_complete", content: "Final", conversationId: "conflict", interactionId: "answer-one" },
      question("two", "b"), { type: "message_complete", content: "Second", interactionId: "answer-two" });
    expect(thread.conversationId).toBe("owned");
    expect(thread.messages.map(m => m.content)).toEqual(["How does the fold work?", "Final", "How does the fold work?", "Second"]);
    expect(thread.messages.filter(m => m.role === "user").map(m => m.focus?.videoId)).toEqual(["a", "b"]);
    expect(thread.messages.filter(m => m.role === "assistant").map(m => m.interactionId)).toEqual(["answer-one", "answer-two"]);
    expect(fold(question(), { type: "message_complete", content: "", conversationId: "fallback" }).conversationId).toBe("fallback");
  });

  it("settles stops, EOF and errors without erasing partial answers or affecting replacements", () => {
    let thread = fold(question(), { type: "viewer_stopped", requestId: "one" });
    expect(thread.messages[1]).toMatchObject({ content: "", status: "stopped", steps: [] });
    expect(reduceThread(thread, { type: "text_delta", delta: "late" })).toBe(thread);
    thread = fold(question(), { type: "text_delta", delta: "Partial" }, question("two"));
    expect(thread.messages[1]).toMatchObject({ content: "Partial", status: "stopped" });
    for (const fact of [
      { type: "event_received", requestId: "one", event: { type: "message_complete", content: "late" } },
      { type: "viewer_stopped", requestId: "one" },
      { type: "stream_ended", requestId: "one" },
    ] as ThreadEvent[]) expect(reduceThread(thread, fact)).toBe(thread);
    thread = reduceThread(thread, { type: "event_received", requestId: "two", event: { type: "text_delta", delta: "New" } });
    thread = reduceThread(thread, { type: "stream_ended", requestId: "two" });
    expect(thread.messages[3]).toMatchObject({ content: "New", status: "stopped" });
    const failure: AssistantEvent = { type: "error", code: "offline", message: "Try later", retryable: true };
    thread = fold(question(), { type: "sources", sources: [citation("c_a", 10)] },
      { type: "text_delta", delta: "Keep this" }, failure);
    expect(thread.messages[1]).toMatchObject({ content: "Keep this", status: "error", error: failure });
    expect(thread.messages[1].steps.every(s => s.state === "done")).toBe(true);
    expect(fold(question(), failure).messages[1].content).toBe("");
    expect(reduceThread(thread, { type: "thread_reset" })).toBe(emptyThread);
    const fresh = reduceThread(thread, { type: "question_asked", fresh: true, request: { prompt: "New topic", requestId: "fresh" } });
    expect(fresh.messages).toHaveLength(2);
    expect(fresh.conversationId).toBeUndefined();
  });

  it("records scope, pointers, locked matches and retrieval-only completion", () => {
    const pointers = [{ videoId: "b", title: "Another lesson", collectionId: "collection", canonicalUrl: null, moments: [] }];
    const lockedMatches = [{ offer: "course", collectionIds: ["other"], videoCount: 1, titles: ["A lesson"] }];
    const recommendations = [{ topic: "Folding", videos: [] }];
    const thread = fold(question("one", "a"), { type: "scope", ...scope("none") },
      { type: "pointers", pointers }, { type: "locked_matches", lockedMatches },
      { type: "recommendations", recommendations }, { type: "text_delta", delta: "A pointer" },
      { type: "message_complete", responseType: "retrieval", sources: [], confidence: "high", metadata: {} });
    expect(thread.messages[1]).toMatchObject({ content: "A pointer", pointers, lockedMatches, recommendations,
      scope: scope("none"), steps: [{ stage: "reading", state: "done", scope: "focus" }] });
    const final = fold(question(), { type: "answer", content: "Draft", sources: [], citationMap: { c_a: 1 }, usage: { inputTokens: 2, outputTokens: 1 } },
      { type: "message_complete", responseType: "clarification", content: "Which fold?", scope: scope(),
        pointers, lockedMatches, recommendations, citations: [citation("c_a", 10)], usage: { promptTokens: 3, completionTokens: 2 } });
    expect(final.messages[1]).toMatchObject({ content: "Which fold?", citationIndices: { c_a: 1 }, scope: scope(), pointers, lockedMatches,
      recommendations, sources: [citation("c_a", 10)], usage: { promptTokens: 3, completionTokens: 2 } });
  });

  it("reduces progress stages without retaining transient steps or replacing answer text", () => {
    expect(fold(question("one", "a")).messages[1].steps).toEqual([
      { stage: "reading", state: "active", scope: "focus" },
    ]);
    expect(fold(question()).messages[1].steps).toEqual([
      { stage: "planning", state: "active", scope: "library" },
    ]);
    const reading = "  Assistant: Lecture en cours…  ";
    let thread = fold(question("one", "a"),
      { type: "progress", stage: "reading", message: reading, scope: "focus" },
      { type: "progress", stage: "searching", message: "Search" },
      { type: "progress", stage: "searching", message: "Search again" },
      { type: "progress", stage: "planning", message: " " });
    expect(thread.messages[1].steps.at(-1)).toEqual({ stage: "planning", state: "active", message: " " });
    thread = reduceThread(thread, { type: "progress", stage: "working", message: "Work" });
    expect(thread.messages[1].steps).toEqual([
      { stage: "reading", state: "done", scope: "focus", message: reading },
      { stage: "searching", state: "done", message: "Search again" },
      { stage: "working", state: "active", message: "Work" },
    ]);
    thread = reduceThread(thread, { type: "sources", sources: [] });
    expect(thread.messages[1].steps[1]).toEqual({ stage: "searching", state: "done",
      message: "Search again", found: { passages: 0, videos: 0 } });
    thread = reduceThread(thread, { type: "sources", sources: [citation("c_a", 10)] });
    expect(thread.messages[1].steps[1]).toEqual({ stage: "searching", state: "done",
      message: "Search again", found: { passages: 1, videos: 1 } });
    thread = reduceThread(thread, { type: "sources", sources: [citation("c_a", 10), citation("c_b", 20),
      citation("c_c", 30, 35, "b"), { ...citation("c_doc", 0), videoId: null }] });
    expect(thread.messages[1].steps[1]).toEqual({ stage: "searching", state: "done",
      message: "Search again", found: { passages: 4, videos: 2 } });
    thread = reduceThread(thread, { type: "sources", sources: [] });
    expect(thread.messages[1].sources).toEqual([]);
    expect(thread.messages[1].steps[1]).toEqual({ stage: "searching", state: "done",
      message: "Search again", found: { passages: 0, videos: 0 } });
    const widened = reduceThread(thread, { type: "scope", ...scope() });
    expect(widened.messages[1].scope?.widenedFrom).toBe("focus");
    expect(widened.messages[1].steps[0]).toEqual({ stage: "reading", state: "done", scope: "focus", message: reading });
    thread = reduceThread(thread, { type: "scope", ...scope("focus"), widenedFrom: null });
    thread = reduceThread(thread, { type: "text_delta", delta: "Text" });
    expect(thread.messages[1].steps).toEqual([]);
    expect(reduceThread(thread, { type: "progress", stage: "searching", message: "Late" })).toBe(thread);
    expect(reduceThread(thread, { type: "future_event" })).toBe(thread);
    expect(fold(question(), { type: "scope", ...scope() }, { type: "text_delta", delta: "Text" }).messages[1].steps.at(-1))
      .toEqual({ stage: "synthesizing", state: "active", scope: "library" });
    const synthesis = fold(question(), { type: "progress", stage: "synthesizing", message: "Server: Drafting", scope: "library" },
      { type: "text_delta", delta: "Text" });
    expect(synthesis.messages[1].steps).toEqual([
      { stage: "synthesizing", state: "active", scope: "library", message: "Server: Drafting" },
    ]);
    const withoutSteps = { ...thread, messages: [thread.messages[0], { ...thread.messages[1], content: "", steps: [] }] };
    expect(reduceThread(withoutSteps, { type: "progress", stage: "new", message: "" }).messages[1].steps[0])
      .toEqual({ stage: "new", state: "active", message: "" });
  });

  it("loads history without inventing citation metadata, and supplies a missing original question", () => {
    const conversation: ConversationDetail = { conversationId: "history", createdAt: "now", updatedAt: "now",
      metadata: { originalQuery: "Original", status: "complete", confidence: "high", chunksFound: 1 },
      messages: [
        { id: "system", role: "system", content: "Internal", sources: [], insertedAt: "now" },
        { id: "answer", role: "assistant", content: "Saved", sources: [], insertedAt: "now" },
      ] };
    const thread = fold(question(), { type: "conversation_loaded", conversation });
    expect(thread.messages.map(m => m.content)).toEqual(["Original", "Saved"]);
    expect(thread.isStreaming).toBe(false);
    expect(thread.messages[1].citationMap).toEqual({});
    conversation.messages.unshift({ id: "question", role: "user", content: "Asked", insertedAt: "now", sources: [] });
    expect(fold({ type: "conversation_loaded", conversation }).messages.map(m => m.content)).toEqual(["Asked", "Saved"]);
    conversation.messages = [];
    conversation.metadata.originalQuery = "";
    expect(fold({ type: "conversation_loaded", conversation }).messages).toEqual([]);
  });
});

describe("passages", () => {
  it("uses cited text over retrieval flags and resolves zero-based indices to the right video", () => {
    const early = { ...citation("c_first", 12), cited: false };
    const thread = fold(question(), { type: "citation_map", citationMap: { c_first: early } },
      { type: "answer", content: "Used [c_first]", citationMap: { c_first: 0 }, sources: [{ ...early, cited: true }] });
    expect(buildPassages(thread.messages[1].content, thread.messages[1]).passages).toHaveLength(1);
    const resolved = buildPassages("[c_first] [c_second]", {
      sources: [{ videoId: "first-video", timestamp: 12 }, { videoId: "second-video", timestamp: 91 }],
      citationIndices: { c_first: 0, c_second: 1 },
    });
    expect(resolved.passages.map(p => [p.videoId, p.start])).toEqual([["first-video", 12], ["second-video", 91]]);
  });

  it("keeps answer citation indices bound to their sources after completion", () => {
    const a = { videoId: "first-video", timestamp: 12 }, b = { videoId: "second-video", timestamp: 91 };
    for (const finalSources of [{ sources: [b, a] }, { citations: [b, a] }]) {
      const thread = fold(question(), { type: "answer", content: "[c_a] [1]", sources: [a, b], citationMap: { c_a: 0 } },
        { type: "message_complete", content: "[c_a] [1]", ...finalSources });
      const answer = thread.messages[1];
      expect(answer.sources).toEqual([b, a]);
      const result = buildPassages(answer.content, answer);
      expect(result.citationsById.get("c_a")).toEqual(a);
      expect(result.citationsById.get("1")).toEqual(b);
      const metadata = citation("c_a", 33, 38, "third-video");
      expect(buildPassages(answer.content, { ...answer, citationMap: { c_a: metadata } }).citationsById.get("c_a"))
        .toEqual(metadata);
    }
    for (const sources of [undefined, []]) {
      const answer = fold(question(), { type: "answer", content: "[c_a]", sources, citationMap: { c_a: 0 } },
        { type: "message_complete", content: "[c_a]", sources: [a] }).messages[1];
      expect(buildPassages(answer.content, answer).citationsById.get("c_a")).toEqual(sources ? undefined : a);
    }
    const inherited = fold(question(), { type: "sources", sources: [a, b] },
      { type: "answer", content: "[c_a]", citationMap: { c_a: 0 } },
      { type: "message_complete", content: "[c_a]", sources: [b, a] }).messages[1];
    expect(buildPassages(inherited.content, inherited).citationsById.get("c_a")).toEqual(a);
  });

  it("reserves literal labels without splitting nearby stable citations or duplicating numbers", () => {
    const result = buildPassages("[2] [c_a] [c_b] [c_c]", {
      sources: [citation("unused", 0), citation("numeric", 0, 4, "b")],
      citationMap: { c_a: citation("c_a", 20), c_b: citation("c_b", 31), c_c: citation("c_c", 200) },
    });
    expect(result.passages.map(p => [p.number, p.videoId, p.start])).toEqual([[2, "b", 0], [1, "a", 20], [3, "a", 200]]);
    expect(result.passageNumberByCitationId.get("c_b")).toBe(1);
  });

  it("merges transitively in spoken order, numbers by first mention, and keeps sentence playback", () => {
    const citationMap = Object.freeze({
      c_a: Object.freeze(citation("c_a", 20, 24, "a", " First. ")),
      c_b: citation("c_b", 110, 114, "a", "Last."),
      c_c: citation("c_c", 65, 69, "a", "Middle."),
      c_d: citation("c_d", 2, 6, "b", "Other."),
      c_e: citation("c_e", 300),
    });
    const result = buildPassages("[c_b] [c_d] [c_a] [c_c] [c_e] [c_b]", { citationMap });
    expect(result.passages.map(p => [p.number, p.videoId, p.start, p.end])).toEqual([[1, "a", 20, 114], [2, "b", 2, 6], [3, "a", 300, 304]]);
    expect(result.passages[0].excerpt).toBe("First. … Middle. … Last.");
    expect([...result.passageNumberByCitationId]).toEqual([["c_a", 1], ["c_c", 1], ["c_b", 1], ["c_d", 2], ["c_e", 3]]);
    expect(citationPlayStart(result.passages[0], { id: "c_b", timestamp: 110 })).toBe(109);
    for (const selected of [null, undefined, { id: "c_a", timestamp: 20 }, { id: "c_a", timestamp: null }, { id: "c_d", timestamp: 2 }]) {
      expect(citationPlayStart(result.passages[0], selected)).toBe(20);
    }
  });

  it("uses the gap boundary, skips duplicates/uncited entries, and marks only omitted speech", () => {
    expect(DEFAULT_PASSAGE_GAP_SECONDS).toBe(45);
    const citationMap = {
      c_a: citation("c_a", 0, 4, "a", "First."), c_b: citation("c_b", 7, 10, "a", "Second."),
      c_c: citation("c_c", 55, 59, "a", "Second."), c_d: citation("c_d", 105, 108),
      c_e: { ...citation("c_e", 0), cited: false }, c_f: citation("c_f", 12, 13, "a", " "),
    };
    const result = buildPassages("[c_a, c_b c_c] [c_d] [c_f] [c_missing]", { citationMap });
    expect(result.passages.map(p => [p.start, p.end])).toEqual([[0, 59], [105, 108]]);
    expect(result.passages[0].excerpt).toBe("First. Second.");
    expect(buildPassages("[c_a] [c_b]", { citationMap }, { gapSeconds: 2 }).passages).toHaveLength(2);
    expect(buildPassages("No citations", {}).passages).toEqual([]);
    const overlapping = buildPassages("[c_a] [c_b] [c_c] [c_d]", { citationMap: {
      c_a: citation("c_a", 0, 20, "a", "Long."), c_b: citation("c_b", 5, 6, "a", "Nested."),
      c_c: citation("c_c", 10, 12, "a", "Still covered."), c_d: citation("c_d", 25, 30, "a", "After gap."),
    } });
    expect(overlapping.passages[0].excerpt).toBe("Long. Nested. Still covered. … After gap.");
  });

  it("preserves numeric references and supports sparse sources and non-playable documents", () => {
    const sources = [citation("c_a", 10), citation("c_b", 20), { videoId: "b", timestamp: 0 }];
    const result = buildPassages("[2] [1] [3]", { sources });
    expect(result.passages.map(p => p.number)).toEqual([2, 1, 3]);
    expect(result.passages[2]).toMatchObject({ start: 0, end: 0, title: null, excerpt: "" });
    const mapped = buildPassages("[c_b] [c_a]", { sources, citationIndices: { c_b: 1 } });
    expect(mapped.passages).toHaveLength(1);
    const mixed = buildPassages("[1] [c_b] [c_x]", { sources, citationIndices: { c_b: 1 }, citationMap: { c_x: citation("c_x", 50) } });
    expect(mixed.passages.map(p => p.number)).toEqual([1, 2]);
    expect(buildPassages("[c_x] [c_y] [c_z] [c_nan]", { citationMap: {
      c_x: { ...citation("c_x", 0), videoId: null }, c_y: { ...citation("c_y", 0), timestamp: null },
      c_z: { ...citation("c_z", -3), timestampEnd: null }, c_nan: citation("c_nan", NaN),
    } }).passages.map(p => p.start)).toEqual([0]);
    expect(buildPassages("[1] [9]", {}).passages).toEqual([]);
    expect(buildPassages("[c_missing]", { sources: [{ videoId: "a", timestamp: 0 }] }).passages).toEqual([]);
  });
});

describe("stuck moment", () => {
  it("distinguishes playback, pause, re-listening and jumps at their boundaries", () => {
    expect(PAUSE_AFTER_MS).toBe(2000);
    expect(momentAfterStandingStill(null, 40, false)).toBeNull();
    expect(momentAfterStandingStill(null, 14.99, true)).toBeNull();
    const paused = momentAfterStandingStill(null, 15, true);
    expect(paused).toEqual({ kind: "paused", at: 15 });
    expect(momentAfterMove(paused, 15, 16)).toEqual({ moment: null, played: true });
    for (const change of [0, -0.1, -2.99]) expect(momentAfterMove(paused, 70, 70 + change)).toEqual({ moment: paused, played: false });
    for (const change of [-3, -60]) expect(momentAfterMove(null, 70, 70 + change).moment).toEqual({ kind: "relistened", from: 70 + change, to: 70 });
    for (const change of [3, 50, -60.01]) expect(momentAfterMove(paused, 70, 70 + change)).toEqual({ moment: null, played: false });
    const relistened = momentAfterMove(null, 70, 59).moment;
    expect(momentAfterMove(relistened, 69, 70).moment).toBe(relistened);
    expect(momentAfterStandingStill(relistened, 60, true)).toBe(relistened);
    expect(momentAfterMove(relistened, 70, 70.1).moment).toBeNull();
    expect(momentAfterMove(null, 30, 30.1).played).toBe(true);
  });
});

describe("video store", () => {
  afterEach(() => vi.useRealTimers());
  it("holds A throughout a slow B load, then clears only after leaving video pages", () => {
    vi.useFakeTimers();
    const store = createVideoStore();
    const states: (string | null)[] = [];
    const unsubscribe = store.subscribe(() => states.push(store.getSnapshot().video?.videoId ?? null));
    const initial = store.getSnapshot();
    store.beginPending();
    expect(store.getSnapshot()).toBe(initial);
    store.set({ videoId: "a" }); store.endPending();
    const a = store.getSnapshot();
    store.set({ videoId: "a" });
    expect(store.getSnapshot()).toBe(a);
    store.release("a");
    vi.advanceTimersByTime(100);
    store.beginPending();
    expect(store.getSnapshot()).toMatchObject({ video: { videoId: "a" }, switching: true });
    vi.advanceTimersByTime(2000);
    store.beginPending(); store.endPending();
    vi.advanceTimersByTime(200);
    expect(store.getSnapshot().video?.videoId).toBe("a");
    store.set({ videoId: "b", currentTime: 2 }); store.endPending();
    vi.advanceTimersByTime(120);
    expect(states).not.toContain(null);
    expect(store.getSnapshot().switching).toBe(false);
    store.release("a");
    store.release("b");
    vi.advanceTimersByTime(119);
    expect(store.getSnapshot().video?.videoId).toBe("b");
    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()).toEqual({ video: null, switching: false });
    store.release("b"); store.endPending();
    vi.advanceTimersByTime(120);
    unsubscribe(); store.set({ videoId: "c" });
    expect(states.at(-1)).toBeNull();
    store.dispose();
  });

  it("rejects late same-video cleanup and reports shallow field changes only", () => {
    vi.useFakeTimers();
    const store = createVideoStore();
    const old = {}, current = {};
    store.set({ videoId: "a", currentTime: 1 }, old);
    const first = store.getSnapshot();
    store.set({ videoId: "a", currentTime: 1 }, current);
    expect(store.getSnapshot()).toBe(first);
    store.release(old);
    vi.advanceTimersByTime(200);
    expect(store.getSnapshot()).toBe(first);
    store.set({ videoId: "a", currentTime: 2 }, current);
    expect(store.getSnapshot()).not.toBe(first);
    store.set({ videoId: "a" }, current);
    expect(store.getSnapshot().video?.currentTime).toBeUndefined();
    store.beginPending(); store.release(current);
    expect(store.getSnapshot().switching).toBe(true);
    store.endPending();
    vi.advanceTimersByTime(100);
    store.endPending(); // restarts the settle window
    vi.advanceTimersByTime(100);
    expect(store.getSnapshot().video).not.toBeNull();
    store.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("set aside", () => {
  it("compares the last question's place and keeps each of the three exceptions", () => {
    const messages = fold(question(), { type: "message_complete", content: "Answer", interactionId: "followed" }).messages;
    const input = { messages, place: "video:b" as const, streaming: false };
    expect(shouldSetAside(input)).toBe(true);
    expect(shouldSetAside({ ...input, messages: [] })).toBe(false);
    expect(shouldSetAside({ ...input, place: "library" })).toBe(false);
    expect(shouldSetAside({ ...input, streaming: true })).toBe(false);
    expect(shouldSetAside({ ...input, continuedAt: "video:b" })).toBe(false);
    expect(shouldSetAside({ ...input, continuedAt: "video:c" })).toBe(true);
    expect(shouldSetAside({ ...input, followedAnswerId: "followed" })).toBe(false);
    expect(shouldSetAside({ ...input, followedAnswerId: "elsewhere" })).toBe(true);
    const beside = fold(question("one", "a"), { type: "scope", ...scope() }, { type: "message_complete", content: "" }).messages;
    expect(shouldSetAside({ ...input, messages: beside, place: "video:a" })).toBe(false);
    expect(shouldSetAside({ ...input, messages: beside, canonicalVideoId: "a" })).toBe(false);
    expect(shouldSetAside({ ...input, messages: beside, place: "library" })).toBe(true);
    expect(shouldSetAside({ ...input, messages: fold(question("one", "b")).messages.slice(0, 1) })).toBe(false);
  });
});
