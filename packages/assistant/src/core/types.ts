/** Copied SDK shapes; test/sdk-types.ts checks these without a runtime dependency. */
export interface CitationSource {
  id: string | null;
  videoId: string | null;
  title: string | null;
  text: string;
  timestamp: number | null;
  timestampEnd: number | null;
  playbackId: string | null;
  playbackToken?: string | null;
  speaker?: string | null;
  cited?: boolean;
  sourceType?: "transcript" | "moment" | "resource" | "attachment" | null;
  documentType?: string | null;
  resourceId?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  collectionId?: string | null;
  attachmentId?: string | number | null;
  attachmentFilename?: string | null;
}

export type AssistantSource = (CitationSource | { videoId: string; timestamp: number }) & {
  title?: string | null;
  playbackId?: string | null;
  playbackToken?: string | null;
  slug?: string | null;
  canonicalUrl?: string | null;
  timestampUrl?: string | null;
};

export interface Focus { videoId: string; currentTime?: number }
export interface Access {
  answer?: string[];
  point?: string[];
  mention?: { collectionId: string; offer?: string }[];
}
export interface AnswerScope {
  answeredFrom: "focus" | "library" | "none";
  widenedFrom: "focus" | null;
  reason: "not_covered" | "requested" | null;
  focus: { videoId: string; title: string } | null;
}
export interface Pointer {
  videoId: string;
  title: string;
  collectionId: string;
  canonicalUrl: string | null;
  moments: { timestamp: number; timestampEnd: number; timestampUrl: string | null }[];
}
export interface LockedMatch {
  offer: string;
  collectionIds: string[];
  videoCount: number;
  titles: string[];
}
export type Usage = { inputTokens: number; outputTokens: number } | {
  promptTokens: number; completionTokens: number; totalCost?: number;
};
export interface Recommendation {
  topic: string;
  videos: {
    videoId: string; title: string; playbackId: string; playbackToken?: string | null;
    relevance: number; reason: string;
  }[];
}
export interface ContextMessage { role: "user" | "assistant"; content: string }
export interface AssistantError { type: "error"; code: string; message: string; retryable: boolean }

/** Closed union deliberately: a new SDK event must fail the drift check. */
export type AssistantEvent =
  | { type: "message_start"; conversationId?: string; videoId?: string }
  | { type: "conversation_created"; conversationId: string }
  | { type: "progress"; stage: string; message: string; scope?: "focus" | "library" }
  | ({ type: "scope" } & AnswerScope)
  | { type: "pointers"; pointers: Pointer[] }
  | { type: "locked_matches"; lockedMatches: LockedMatch[] }
  | { type: "sources"; sources: AssistantSource[] }
  | { type: "citation_map"; citationMap: Record<string, CitationSource> }
  | { type: "answer"; content: string; sources?: AssistantSource[]; citationMap?: Record<string, number>; usage?: Usage | null }
  | { type: "text_delta"; delta: string }
  | { type: "recommendations"; recommendations: Recommendation[] }
  | ({
      type: "message_complete"; messageId?: string; interactionId?: string | null;
      conversationId?: string; citations?: AssistantSource[]; scope?: AnswerScope;
      pointers?: Pointer[]; lockedMatches?: LockedMatch[]; context?: ContextMessage[];
      recommendations?: Recommendation[]; guidance?: string;
    } & (
      | { responseType?: "answer" | "clarification"; content: string; sources?: AssistantSource[]; usage?: Usage | null }
      | { responseType: "retrieval"; content?: never; sources: CitationSource[]; usage?: never; confidence: string; metadata: Record<string, unknown> }
    ))
  | AssistantError
  | { type: "image_analysis"; status: "analyzing" }
  | { type: "image_analysis"; status: "complete"; description: string };

export interface AskRequest {
  prompt: string;
  conversationId?: string;
  focus?: Focus;
  /** One ID per deliberate question; reuse for a retry. */
  requestId: string;
}

export interface ConversationSummary {
  conversationId: string;
  scope: "library" | "video" | null;
  title: string | null;
  preview: string | null;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  channel: "portal" | "embed" | "api" | "mcp" | "unknown";
  client: string | null;
  video: { id: string; title: string; thumbnailUrl: string | null; url: string | null } | null;
}
export interface ConversationPage {
  conversations: ConversationSummary[];
  pagination: { limit: number; offset: number; hasMore: boolean };
}
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: AssistantSource[];
  insertedAt: string;
  interactionId?: string | null;
  focus?: Focus;
  scope?: AnswerScope;
  pointers?: Pointer[];
  lockedMatches?: LockedMatch[];
}
export interface ConversationDetail {
  conversationId: string;
  messages: ConversationMessage[];
  metadata: { originalQuery: string; status: string; confidence: string; chunksFound: number };
  createdAt: string;
  updatedAt: string;
}

export interface AssistantTransport {
  /** Unknown future event types pass through at runtime; reduceThread ignores them. */
  ask(request: AskRequest, options: { signal: AbortSignal }): AsyncIterable<AssistantEvent>;
  list?(options?: { offset?: number }): Promise<ConversationPage>;
  load?(conversationId: string): Promise<ConversationDetail>;
}
