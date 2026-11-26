import type { AssistantEvent, AssistantTransport, ConversationDetail, ConversationPage } from "./types";

/** Same-origin endpoint, never a Bold server key. Headers may be refreshed per request. */
export function createFetchTransport(endpoint: string, options: {
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
} = {}): AssistantTransport {
  const fetcher = options.fetch ?? globalThis.fetch;
  async function headers(accept: string) {
    const value = typeof options.headers === "function" ? await options.headers() : options.headers;
    const result = new Headers(value);
    result.set("Accept", accept);
    return result;
  }
  function url(key: string, value: string) {
    const [path, query = ""] = endpoint.split("?");
    const params = new URLSearchParams(query);
    params.delete("conversation");
    params.delete("offset");
    params.set(key, value);
    return `${path}?${params}`;
  }
  async function check(response: Response) {
    if (response.ok) return;
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const error = await response.json().catch(() => null);
      if (error?.type === "error" && typeof error.code === "string"
        && typeof error.message === "string" && typeof error.retryable === "boolean") {
        throw Object.assign(new Error(error.message), error, { status: response.status });
      }
    }
    // Do not echo an HTML error page or an upstream response body.
    throw Object.assign(new Error(`Assistant request failed (${response.status})`), { status: response.status });
  }
  async function get<T>(target: string): Promise<T> {
    const response = await fetcher(target, { headers: await headers("application/json") });
    await check(response);
    return response.json() as Promise<T>;
  }
  return {
    list: (args = {}) => get<ConversationPage>(url("offset", String(args.offset ?? 0))),
    load: id => get<ConversationDetail>(url("conversation", id)),
    async *ask(request, { signal }) {
      signal.throwIfAborted();
      const requestHeaders = await headers("text/event-stream");
      requestHeaders.set("Content-Type", "application/json");
      const response = await fetcher(endpoint, {
        method: "POST", headers: requestHeaders, body: JSON.stringify(request), signal,
      });
      await check(response);
      if (!response.body) throw new Error("Assistant response has no stream");
      const reader = response.body.getReader();
      const abort = () => { void reader.cancel().catch(() => {}); };
      signal.addEventListener("abort", abort, { once: true });
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
          // Normalize only complete CRLF pairs: a CR may end a network chunk.
          buffer = buffer.replace(/\r\n/g, "\n");
          const blocks = buffer.split("\n\n");
          buffer = done ? "" : blocks.pop()!;
          for (const block of blocks) {
            signal.throwIfAborted();
            const data = block.split("\n").filter(line => line.startsWith("data:"))
              .map(line => line.slice(5).replace(/^ /, "")).join("\n");
            if (!data) continue;
            if (data === "[DONE]") return;
            const event = JSON.parse(data) as AssistantEvent;
            yield event;
            if (event.type === "message_complete" || event.type === "error") return;
          }
          if (done) return;
        }
      } finally {
        signal.removeEventListener("abort", abort);
        try { await reader.cancel(); } finally { reader.releaseLock(); }
      }
    },
  };
}
