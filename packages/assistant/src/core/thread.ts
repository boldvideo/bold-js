import type {
  AnswerScope, AskRequest, AssistantError, AssistantEvent, AssistantSource,
  CitationSource, ConversationDetail, Focus, LockedMatch, Pointer, Recommendation, Usage,
} from "./types";

export interface ProgressStep {
  stage: string;
  state: "active" | "done";
  scope?: "focus" | "library";
  /** Server wording, unchanged. Locally inferred steps have no message. */
  message?: string;
  found?: { passages: number; videos: number };
}
export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "loading" | "answer" | "complete" | "stopped" | "error";
  focus?: Focus;
  scope?: AnswerScope;
  interactionId?: string | null;
  messageId?: string;
  sources: AssistantSource[];
  citationMap: Record<string, CitationSource>;
  /** The answer event's zero-based source indices are distinct from sentence metadata. */
  citationIndices?: Record<string, number>;
  /** Keep indices bound to the answer's sources even when completion replaces sources. */
  citationSources?: AssistantSource[];
  steps: ProgressStep[];
  pointers?: Pointer[];
  lockedMatches?: LockedMatch[];
  recommendations?: Recommendation[];
  usage?: Usage | null;
  error?: AssistantError;
}
export interface Thread {
  messages: ThreadMessage[];
  conversationId?: string;
  activeRequestId?: string;
  isStreaming: boolean;
}
export type ThreadEvent = AssistantEvent
  | { type: "question_asked"; request: AskRequest; fresh?: boolean; retry?: boolean }
  | { type: "viewer_stopped" | "stream_ended"; requestId: string }
  | { type: "thread_reset" }
  | { type: "conversation_loaded"; conversation: ConversationDetail }
  /** Use this envelope for async delivery so late events cannot change another turn. */
  | { type: "event_received"; requestId: string; event: AssistantEvent };

export const emptyThread: Thread = { messages: [], isStreaming: false };

function finishSteps(steps: ProgressStep[]): ProgressStep[] {
  return steps.flatMap((step): ProgressStep[] => {
    if (step.state === "done") return [step];
    if (step.stage === "reading" || step.stage === "searching") return [{ ...step, state: "done" }];
    return [];
  });
}

function withScope(message: ThreadMessage, scope: AnswerScope): ThreadMessage {
  return {
    ...message, scope,
    steps: scope.widenedFrom === "focus"
      ? message.steps.map(step => step.stage === "reading"
        ? { ...step, state: "done" } : step)
      : message.steps,
  };
}

/** Pure replay. Unknown event types return the same state, including during a turn. */
export function reduceThread(state: Thread, fact: ThreadEvent | { type: string }): Thread {
  const event = fact as ThreadEvent;
  if (event.type === "thread_reset") return emptyThread;
  if (event.type === "conversation_loaded") {
    const { conversation } = event;
    const messages: ThreadMessage[] = conversation.messages
      .filter(message => message.role !== "system")
      .map(message => ({
        ...message, role: message.role as "user" | "assistant",
        status: "complete", citationMap: {}, steps: [],
      }));
    if (!messages.some(message => message.role === "user") && conversation.metadata.originalQuery) {
      messages.unshift({
        id: `user-${conversation.conversationId}`, role: "user",
        content: conversation.metadata.originalQuery, status: "complete",
        sources: [], citationMap: {}, steps: [],
      });
    }
    return { messages, conversationId: conversation.conversationId, isStreaming: false };
  }
  if (event.type === "question_asked") {
    const { request } = event;
    let previous = event.fresh ? emptyThread : stopThread(state);
    if (event.retry) {
      const question = state.messages.at(-2);
      const answer = state.messages.at(-1);
      if (state.isStreaming || question?.id !== `user-${request.requestId}`
        || question.content !== request.prompt || answer?.role !== "assistant"
        || !(answer.status === "stopped" || (answer.status === "error" && answer.error?.retryable))) return state;
      previous = { ...previous, conversationId: request.conversationId, messages: previous.messages.slice(0, -2) };
    }
    const base = { sources: [], citationMap: {}, steps: [] };
    return {
      conversationId: request.conversationId ?? previous.conversationId,
      activeRequestId: request.requestId, isStreaming: true,
      messages: [...previous.messages,
        { ...base, id: `user-${request.requestId}`, role: "user", content: request.prompt,
          focus: request.focus, status: "complete" },
        { ...base, id: `assistant-${request.requestId}`, role: "assistant", content: "", status: "loading",
          steps: [request.focus
            ? { stage: "reading", state: "active", scope: "focus" }
            : { stage: "planning", state: "active", scope: "library" }] },
      ],
    };
  }
  if (event.type === "event_received") {
    return event.requestId === state.activeRequestId ? reduceThread(state, event.event) : state;
  }
  if (event.type === "viewer_stopped" || event.type === "stream_ended") {
    return event.requestId === state.activeRequestId ? stopThread(state) : state;
  }
  if (!state.isStreaming) return state;
  let message = state.messages[state.messages.length - 1];
  let conversationId = state.conversationId;
  let terminal = false;
  switch (event.type) {
    case "message_start":
    case "conversation_created":
      // Once accepted, a conflicting ID cannot relocate this conversation.
      return conversationId || !event.conversationId ? state : { ...state, conversationId: event.conversationId };
    case "progress": {
      if (message.content) return state;
      const last = message.steps[message.steps.length - 1];
      const steps = last?.state === "active" && last.stage === event.stage
        ? message.steps.slice(0, -1) : finishSteps(message.steps);
      message = { ...message, steps: [...steps, { stage: event.stage, message: event.message, scope: event.scope, state: "active" }] };
      break;
    }
    case "scope": {
      const { type: _, ...scope } = event;
      message = withScope(message, scope);
      break;
    }
    case "pointers": message = { ...message, pointers: event.pointers }; break;
    case "locked_matches": message = { ...message, lockedMatches: event.lockedMatches }; break;
    case "recommendations": message = { ...message, recommendations: event.recommendations }; break;
    case "citation_map": message = { ...message, citationMap: event.citationMap }; break;
    case "sources": {
      const videos = new Set(event.sources.map(source => source.videoId).filter(Boolean)).size;
      const found = { passages: event.sources.length, videos };
      const steps: ProgressStep[] = message.steps.some(step => step.stage === "searching")
        ? message.steps.map(step => step.stage === "searching" ? { ...step, state: "done", found } : step)
        : [...message.steps.filter(step => step.state === "done"),
          { stage: "searching", state: "done", scope: "library", found },
          ...message.steps.filter(step => step.state === "active")];
      message = { ...message, sources: event.sources, steps };
      break;
    }
    case "text_delta": {
      let steps = message.steps;
      if (!message.content) {
        steps = message.scope?.answeredFrom === "focus" ? [] : steps.filter(step => step.state === "done");
        if (!message.scope || message.scope.answeredFrom === "library") {
          const synthesizing = message.steps.find(step => step.stage === "synthesizing");
          steps = [...steps, synthesizing ?? { stage: "synthesizing", state: "active", scope: "library" }];
        }
      }
      message = { ...message, content: message.content + event.delta, status: "answer", steps };
      break;
    }
    case "answer":
      message = { ...message, content: event.content, status: "answer",
        sources: event.sources ?? message.sources, citationIndices: event.citationMap,
        citationSources: event.sources ?? (message.sources.length ? message.sources : undefined), usage: event.usage };
      break;
    case "message_complete":
      if (event.scope) message = withScope(message, event.scope);
      message = { ...message, content: event.content ?? message.content, status: "complete",
        messageId: event.messageId, interactionId: event.interactionId,
        sources: event.sources ?? event.citations ?? message.sources,
        pointers: event.pointers ?? message.pointers, lockedMatches: event.lockedMatches ?? message.lockedMatches,
        recommendations: event.recommendations ?? message.recommendations,
        usage: event.usage ?? message.usage, steps: message.steps.filter(step => step.state === "done") };
      conversationId ??= event.conversationId;
      terminal = true;
      break;
    case "error":
      message = { ...message, error: event, status: "error", steps: message.steps.filter(step => step.state === "done") };
      terminal = true;
      break;
    default: return state;
  }
  return { ...state, conversationId, messages: [...state.messages.slice(0, -1), message],
    isStreaming: !terminal, activeRequestId: terminal ? undefined : state.activeRequestId };
}

function stopThread(state: Thread): Thread {
  if (!state.isStreaming) return state;
  const message = state.messages[state.messages.length - 1];
  return { ...state, isStreaming: false, activeRequestId: undefined,
    messages: [...state.messages.slice(0, -1), { ...message, status: "stopped",
      steps: message.steps.filter(step => step.state === "done") }] };
}
