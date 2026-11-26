import type { Access, AssistantEvent, ConversationDetail, ConversationPage, Focus } from "../core/types";
import { version } from "../../package.json";

export interface ChatRequest {
  prompt: string;
  conversationId?: string;
  focus?: Focus;
  requestId?: string;
  viewer: string;
  access: Access;
  clientName: string;
  clientVersion: string;
  signal: AbortSignal;
}
/** No SDK runtime dependency. All three operations are required on the server. */
export interface AssistantBold {
  ai: {
    chat(options: ChatRequest): Promise<AsyncIterable<AssistantEvent>>;
    listConversations(options: { viewer: string; limit?: number; offset?: number }): Promise<ConversationPage>;
    getConversation(id: string, options: { viewer: string; access: Access }): Promise<ConversationDetail>;
  };
}
export interface AssistantHandlerOptions {
  bold: AssistantBold;
  authorize(request: Request, context: { focus?: Focus }):
    Response | { viewer: string; access: Access } | Promise<Response | { viewer: string; access: Access }>;
}

function error(status: number, code: string, message: string, retryable = false) {
  return Response.json({ type: "error", code, message, retryable }, { status, headers: { "Cache-Control": "no-store" } });
}
function upstreamError(cause: unknown) {
  const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined;
  const safeStatus = typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
  return error(safeStatus, "upstream_error", "The assistant request could not be completed.", safeStatus === 429 || safeStatus >= 500);
}
function safeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
}
function readAsk(value: unknown): Omit<ChatRequest, "viewer" | "access" | "clientName" | "clientVersion" | "signal"> | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.prompt !== "string" || !body.prompt.trim()) return null;
  if (body.conversationId !== undefined && !safeId(body.conversationId)) return null;
  if (body.requestId !== undefined && !safeId(body.requestId)) return null;
  let focus: Focus | undefined;
  if (body.focus !== undefined) {
    if (!body.focus || typeof body.focus !== "object") return null;
    const input = body.focus as Record<string, unknown>;
    if (!safeId(input.videoId)) return null;
    if (input.currentTime !== undefined && (typeof input.currentTime !== "number" || !Number.isFinite(input.currentTime) || input.currentTime < 0)) return null;
    focus = { videoId: input.videoId, currentTime: input.currentTime as number | undefined };
  }
  // Identity, grants and SDK options never come from browser-supplied fields.
  return { prompt: body.prompt, focus, conversationId: body.conversationId as string | undefined,
    requestId: body.requestId as string | undefined };
}

async function owns(bold: AssistantBold, viewer: string, id: string, signal: AbortSignal): Promise<boolean> {
  // Bold's continue/load endpoints are tenant-scoped, not viewer-scoped. The
  // viewer's list proves ownership. Remove this when Bold checks the viewer itself.
  const seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    signal.throwIfAborted();
    const offset = page * 100;
    const result = await bold.ai.listConversations({ viewer, limit: 100, offset });
    if (!Array.isArray(result?.conversations) || result.pagination?.limit !== 100 ||
        result.pagination.offset !== offset || typeof result.pagination.hasMore !== "boolean" ||
        result.conversations.length > 100 || result.conversations.some(item => !safeId(item?.conversationId))) {
      throw new Error("Invalid ownership page");
    }
    if (result.conversations.some(item => item.conversationId === id)) return true;
    if (!result.pagination.hasMore) return false;
    const signature = JSON.stringify(result.conversations.map(item => item.conversationId));
    if (seen.has(signature)) throw new Error("Repeated ownership page");
    seen.add(signature);
  }
  return false;
}

/** One URL for ask, list and load. The host must abort Request.signal on disconnect. */
export function createAssistantHandler({ bold, authorize }: AssistantHandlerOptions) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST" && request.method !== "GET") {
      return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
    }
    try {
      const url = new URL(request.url);
      const ask = request.method === "POST" ? readAsk(await request.json().catch(() => null)) : undefined;
      if (ask === null) return error(400, "invalid_request", "Provide a prompt and valid conversation, request and focus fields.");
      const id = ask?.conversationId ?? url.searchParams.get("conversation");
      if (id !== null && id !== undefined && !safeId(id)) return error(400, "invalid_request", "Provide a valid conversation ID.");
      const offsetText = url.searchParams.get("offset") ?? "0";
      const offset = Number(offsetText);
      if (!/^\d+$/.test(offsetText) || !Number.isSafeInteger(offset)) return error(400, "invalid_request", "Offset must be a nonnegative integer.");
      const authorized = await authorize(request, ask?.focus ? { focus: ask.focus } : {});
      if (authorized instanceof Response) return authorized;
      if (!authorized?.access || typeof authorized.access !== "object" || Array.isArray(authorized.access)) {
        const message = "authorize must decide access explicitly; return access: {} to grant nothing.";
        console.error(`[bold-assistant] ${message}`);
        return error(500, "access_required", message);
      }
      if (typeof authorized.viewer !== "string" || !authorized.viewer.trim()) {
        return error(500, "viewer_required", "authorize must return a nonempty viewer identity.");
      }
      const { viewer, access } = authorized;
      if (id && !await owns(bold, viewer, id, request.signal)) {
        return error(404, "conversation_not_found", "Conversation not found.");
      }
      request.signal.throwIfAborted();
      if (!ask) {
        const data = id ? await bold.ai.getConversation(id, { viewer, access })
          : await bold.ai.listConversations({ viewer, offset });
        return Response.json(data, { headers: { "Cache-Control": "no-store" } });
      }
      const cancelled = new AbortController();
      // AbortSignal.any is unavailable on the earliest supported Node 20 versions.
      const forwardAbort = () => cancelled.abort(request.signal.reason);
      request.signal.addEventListener("abort", forwardAbort, { once: true });
      let iterator: AsyncIterator<AssistantEvent> | undefined;
      let first: IteratorResult<AssistantEvent>;
      try {
        const events = await bold.ai.chat({ ...ask, viewer, access,
          clientName: "@boldvideo/assistant", clientVersion: version, signal: cancelled.signal });
        iterator = events[Symbol.asyncIterator]();
        // Lazy async generators can fail before their first yield, too.
        first = await iterator.next();
      } catch (cause) {
        request.signal.removeEventListener("abort", forwardAbort);
        await iterator?.return?.();
        throw cause;
      }
      const upstream = iterator;
      const encoder = new TextEncoder();
      const encode = (event: AssistantEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
      let initial = true;
      let ended = false;
      let onAbort: () => void;
      const cleanup = () => {
        request.signal.removeEventListener("abort", onAbort);
        request.signal.removeEventListener("abort", forwardAbort);
      };
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          onAbort = () => {
            if (ended) return;
            ended = true;
            controller.error(request.signal.reason);
            cleanup();
            void upstream.return?.().catch(() => {});
          };
          request.signal.addEventListener("abort", onAbort, { once: true });
          if (request.signal.aborted) onAbort();
        },
        async pull(controller) {
          if (ended) return;
          try {
            const next = initial ? first : await upstream.next();
            initial = false;
            if (ended) return;
            if (next.done) { ended = true; cleanup(); controller.close(); }
            // No event whitelist: every pull enqueues, closes, or errors.
            else controller.enqueue(encode(next.value));
          } catch (cause) {
            if (ended) return;
            const response = upstreamError(cause);
            controller.enqueue(encode({ ...await response.json(), status: response.status }));
            ended = true;
            cleanup();
            controller.close();
            await upstream.return?.();
          }
        },
        async cancel() {
          ended = true;
          cancelled.abort();
          cleanup();
          await upstream.return?.();
        },
      });
      return new Response(body, { headers: {
        "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no",
      } });
    } catch (cause) {
      return upstreamError(cause);
    }
  };
}
