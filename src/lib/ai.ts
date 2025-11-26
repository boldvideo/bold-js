import type { CoachEvent, CoachOptions, AskOptions } from './types';

interface AIConfig {
  baseURL: string;
  headers: Record<string, string>;
}

/**
 * Parse SSE stream into typed events
 *
 * Note: Requires native fetch (Node 18+ or browser)
 */
async function* parseSSE(response: Response): AsyncIterable<CoachEvent> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Split on \n\n or \r\n\r\n (SSE spec + HTTP CRLF)
      const lines = buffer.split(/\r?\n\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const json = trimmed.slice(5).trim(); // Remove "data:" prefix
        if (!json) continue;

        try {
          const event = JSON.parse(json) as CoachEvent;
          yield event;
          if (event.type === 'complete') {
            await reader.cancel(); // Clean shutdown
            return;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Make streaming request to AI endpoint
 */
async function streamRequest(
  path: string,
  body: Record<string, unknown>,
  config: AIConfig
): Promise<AsyncIterable<CoachEvent>> {
  // Ensure baseURL has trailing slash - URL constructor drops final segment without it
  const baseURL = config.baseURL.endsWith('/') ? config.baseURL : `${config.baseURL}/`;
  const url = new URL(path, baseURL);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...config.headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
  }

  return parseSSE(response);
}

/**
 * Create AI methods bound to client config
 */
export function createAI(config: AIConfig) {
  return {
    /**
     * Coach - Library-wide RAG assistant
     *
     * Requires native fetch (Node 18+ or browser)
     *
     * @example
     * const stream = await bold.ai.coach({ message: "How do I price my SaaS?" });
     * for await (const event of stream) {
     *   if (event.type === "token") console.log(event.content);
     * }
     */
    async coach(options: CoachOptions): Promise<AsyncIterable<CoachEvent>> {
      const path = options.conversationId
        ? `coach/${options.conversationId}`
        : 'coach';

      const body: Record<string, unknown> = { message: options.message };
      if (options.collectionId) body.collection_id = options.collectionId;

      return streamRequest(path, body, config);
    },

    /**
     * Ask - Video-specific Q&A
     *
     * Requires native fetch (Node 18+ or browser)
     *
     * @example
     * const stream = await bold.ai.ask("video-id", { message: "What is this about?" });
     * for await (const event of stream) {
     *   if (event.type === "token") console.log(event.content);
     * }
     */
    async ask(videoId: string, options: AskOptions): Promise<AsyncIterable<CoachEvent>> {
      const path = `videos/${videoId}/ask`;
      return streamRequest(path, { message: options.message }, config);
    },
  };
}
