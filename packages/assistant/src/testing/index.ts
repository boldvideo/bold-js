import type { AskRequest, AssistantEvent, AssistantTransport, CitationSource, ConversationDetail, ConversationSummary } from "../core/types";
import type { AssistantBold, ChatRequest } from "../server/index";

type Events = Iterable<AssistantEvent> | AsyncIterable<AssistantEvent>;

/** Deterministic stream, including cancellation while waiting between events. */
export function createReplayTransport(events: Events | ((request: AskRequest) => Events), { delayMs = 0 }: { delayMs?: number } = {}): AssistantTransport {
  return {
    async *ask(request, { signal }) {
      signal.throwIfAborted();
      for await (const event of typeof events === "function" ? events(request) : events) {
        signal.throwIfAborted();
        if (delayMs > 0) {
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(signal.reason); };
            const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, delayMs);
            signal.addEventListener("abort", abort, { once: true });
          });
        }
        signal.throwIfAborted();
        yield event;
      }
    },
  };
}

export interface FakeConversation {
  viewer: string;
  summary: ConversationSummary;
  detail: ConversationDetail;
}

/** Seed history per viewer. answer can inspect grants or simulate an upstream failure. */
export function createFakeBold({ answer = syntheticAnswer, conversations = [] }: {
  answer?: Events | ((request: ChatRequest) => Events | Promise<Events>);
  conversations?: readonly FakeConversation[];
} = {}): AssistantBold {
  return {
    ai: {
      async chat(request) {
        request.signal.throwIfAborted();
        const events = typeof answer === "function" ? await answer(request) : answer;
        return createReplayTransport(events).ask({ ...request, requestId: request.requestId ?? "fake-request" }, { signal: request.signal });
      },
      async listConversations({ viewer, offset = 0, limit = 20 }) {
        const owned = conversations.filter(item => item.viewer === viewer);
        return { conversations: owned.slice(offset, offset + limit).map(item => item.summary),
          pagination: { offset, limit, hasMore: offset + limit < owned.length } };
      },
      async getConversation(id) {
        // Like the real tenant-scoped endpoint, deliberately does not enforce viewer ownership.
        const found = conversations.find(item => item.detail.conversationId === id);
        if (!found) throw Object.assign(new Error("Conversation not found"), { status: 404 });
        return found.detail;
      },
    },
  };
}

const citationMap: Record<string, CitationSource> = {};
for (let video = 0; video < 4; video++) {
  for (let sentence = 0; sentence < 64; sentence++) {
    const id = `c_${video}_${sentence}`;
    citationMap[id] = {
      id, videoId: `video-${video + 1}`, title: `Paper craft video ${video + 1}`,
      text: `Practice fold ${sentence + 1} on sheet ${video + 1} before joining the edges.`,
      timestamp: 20 + sentence * 11, timestampEnd: 24 + sentence * 11,
      playbackId: `synthetic-playback-${video + 1}`, sourceType: "transcript",
    };
  }
}
const sources = Array.from({ length: 4 }, (_, video) => ({
  ...citationMap[`c_${video}_0`], id: `chunk-${video + 1}`, timestamp: 15, timestampEnd: 80,
  text: `This invented video describes measuring, folding and joining paper for model ${video + 1}.`,
}));
const sentences = [
  "Measure the first edge before folding [c_0_0]. ",
  "Leave room for the joining tab [c_0_1]. ",
  "Compare both corners against the guide [c_1_0]. ",
  "Press the crease with a flat ruler [c_1_2]. ",
  "Rotate the sheet to check its balance [c_2_0]. ",
  "Keep the loose flap outside the seam [c_2_3]. ",
  "Try the joint without glue first [c_3_0]. ",
  "Support the base while it dries [c_3_4]. ",
  "Review the later alignment check [c_0_14]. ",
  "Combine the two finishing methods [c_1_15, c_3_18].",
];

/** Entirely invented: 256 sentence citations, 4 minute-sized chunks, 11 cited sentences. */
export const syntheticAnswer: readonly AssistantEvent[] = [
  { type: "message_start", conversationId: "synthetic-conversation" },
  { type: "conversation_created", conversationId: "synthetic-conversation" },
  { type: "progress", stage: "searching", message: "Searching the videos", scope: "library" },
  { type: "sources", sources },
  { type: "citation_map", citationMap },
  ...sentences.map(delta => ({ type: "text_delta" as const, delta })),
  { type: "answer", content: sentences.join("") },
  { type: "message_complete", content: sentences.join(""), interactionId: "synthetic-answer",
    conversationId: "synthetic-conversation", sources },
];
