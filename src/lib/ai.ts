import type { AIEvent, AIResponse, AskOptions, SearchOptions, ChatOptions } from './types';

export interface AIConfig {
  baseURL: string;
  headers: Record<string, string>;
}

/**
 * Parse SSE stream into typed events
 */
async function* parseSSE(response: Response): AsyncIterable<AIEvent> {
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
      const lines = buffer.split(/\r?\n\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const json = trimmed.slice(5).trim();
        if (!json) continue;

        try {
          const event = JSON.parse(json) as AIEvent;
          yield event;
          if (event.type === 'message_complete' || event.type === 'error') {
            await reader.cancel();
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
 * Build full URL from base and path
 */
function buildURL(baseURL: string, path: string): URL {
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  return new URL(path, base);
}

/**
 * Make streaming request to AI endpoint
 */
async function streamRequest(
  path: string,
  body: Record<string, unknown>,
  config: AIConfig
): Promise<AsyncIterable<AIEvent>> {
  const url = buildURL(config.baseURL, path);

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
 * Make non-streaming request to AI endpoint
 */
async function jsonRequest(
  path: string,
  body: Record<string, unknown>,
  config: AIConfig
): Promise<AIResponse> {
  const url = buildURL(config.baseURL, path);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<AIResponse>;
}

/**
 * AI client interface for type-safe method overloading
 */
export interface AIClient {
  /**
   * Ask - Library-wide RAG assistant
   *
   * @example
   * // Streaming (default)
   * const stream = await bold.ai.ask({ prompt: "How do I price my SaaS?" });
   * for await (const event of stream) {
   *   if (event.type === "text_delta") process.stdout.write(event.delta);
   * }
   *
   * @example
   * // Non-streaming
   * const response = await bold.ai.ask({ prompt: "How do I price my SaaS?", stream: false });
   * console.log(response.content);
   */
  ask(options: AskOptions & { stream: false }): Promise<AIResponse>;
  ask(options: AskOptions & { stream?: true }): Promise<AsyncIterable<AIEvent>>;
  ask(options: AskOptions): Promise<AsyncIterable<AIEvent> | AIResponse>;

  /**
   * Coach - Alias for ask() (Library-wide RAG assistant)
   */
  coach(options: AskOptions & { stream: false }): Promise<AIResponse>;
  coach(options: AskOptions & { stream?: true }): Promise<AsyncIterable<AIEvent>>;
  coach(options: AskOptions): Promise<AsyncIterable<AIEvent> | AIResponse>;

  /**
   * Search - Semantic search with light synthesis
   *
   * @example
   * const stream = await bold.ai.search({ prompt: "pricing strategies", limit: 10 });
   * for await (const event of stream) {
   *   if (event.type === "sources") console.log("Found:", event.sources.length, "results");
   * }
   */
  search(options: SearchOptions & { stream: false }): Promise<AIResponse>;
  search(options: SearchOptions & { stream?: true }): Promise<AsyncIterable<AIEvent>>;
  search(options: SearchOptions): Promise<AsyncIterable<AIEvent> | AIResponse>;

  /**
   * Chat - Video-scoped conversation
   *
   * @example
   * const stream = await bold.ai.chat("video-id", { prompt: "What is discussed at 5 minutes?" });
   * for await (const event of stream) {
   *   if (event.type === "text_delta") process.stdout.write(event.delta);
   * }
   */
  chat(videoId: string, options: ChatOptions & { stream: false }): Promise<AIResponse>;
  chat(videoId: string, options: ChatOptions & { stream?: true }): Promise<AsyncIterable<AIEvent>>;
  chat(videoId: string, options: ChatOptions): Promise<AsyncIterable<AIEvent> | AIResponse>;
}

/**
 * Create AI methods bound to client config
 */
export function createAI(config: AIConfig): AIClient {
  async function ask(options: AskOptions): Promise<AsyncIterable<AIEvent> | AIResponse> {
    const path = options.conversationId
      ? `ai/ask/${options.conversationId}`
      : 'ai/ask';

    const body: Record<string, unknown> = { prompt: options.prompt };
    if (options.collectionId) body.collection_id = options.collectionId;

    if (options.stream === false) {
      body.stream = false;
      return jsonRequest(path, body, config);
    }

    return streamRequest(path, body, config);
  }

  async function coach(options: AskOptions): Promise<AsyncIterable<AIEvent> | AIResponse> {
    return ask(options);
  }

  async function search(options: SearchOptions): Promise<AsyncIterable<AIEvent> | AIResponse> {
    const path = 'ai/search';

    const body: Record<string, unknown> = { prompt: options.prompt };
    if (options.limit) body.limit = options.limit;
    if (options.collectionId) body.collection_id = options.collectionId;
    if (options.videoId) body.video_id = options.videoId;

    if (options.stream === false) {
      body.stream = false;
      return jsonRequest(path, body, config);
    }

    return streamRequest(path, body, config);
  }

  async function chat(videoId: string, options: ChatOptions): Promise<AsyncIterable<AIEvent> | AIResponse> {
    const path = options.conversationId
      ? `ai/videos/${videoId}/chat/${options.conversationId}`
      : `ai/videos/${videoId}/chat`;

    const body: Record<string, unknown> = { prompt: options.prompt };

    if (options.stream === false) {
      body.stream = false;
      return jsonRequest(path, body, config);
    }

    return streamRequest(path, body, config);
  }

  return {
    ask: ask as AIClient['ask'],
    coach: coach as AIClient['coach'],
    search: search as AIClient['search'],
    chat: chat as AIClient['chat'],
  };
}
