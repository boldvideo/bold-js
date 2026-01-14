import type { AIEvent, AIResponse, ChatOptions, SearchOptions, RecommendationsOptions, RecommendationsResponse, AskOptions, RecommendOptions, RecommendResponse, Conversation } from './types';
import { camelizeKeys } from '../util/camelize';

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
      
      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }
      
      // When stream ends, flush any remaining buffer
      if (done) {
        buffer += decoder.decode(); // Flush decoder
      }

      const lines = buffer.split(/\r?\n\r?\n/);
      // Keep incomplete chunk in buffer only if stream is still open
      buffer = done ? '' : (lines.pop() || '');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const json = trimmed.slice(5).trim();
        if (!json) continue;

        try {
          const raw = JSON.parse(json);
          const event = camelizeKeys(raw) as AIEvent;
          yield event;
          // Terminate on message_complete or error
          if (event.type === 'message_complete' || event.type === 'error') {
            await reader.cancel();
            return;
          }
        } catch (err) {
          console.error('[bold-js] Failed to parse SSE JSON:', json, err);
        }
      }
      
      if (done) break;
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
async function jsonRequest<T = AIResponse>(
  path: string,
  body: Record<string, unknown>,
  config: AIConfig
): Promise<T> {
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

  const raw = await response.json();
  return camelizeKeys(raw) as T;
}

/**
 * Make GET request to AI endpoint
 */
async function getRequest<T>(
  path: string,
  config: AIConfig
): Promise<T> {
  const url = buildURL(config.baseURL, path);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...config.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
  }

  const raw = await response.json();
  return camelizeKeys(raw) as T;
}

/**
 * AI client interface for type-safe method overloading
 */
export interface AIClient {
  /**
   * Chat - Conversational AI for Q&A
   * 
   * If `videoId` is provided, scopes to that video. Otherwise searches your entire library.
   *
   * @example
   * // Library-wide Q&A
   * const stream = await bold.ai.chat({ prompt: "How do I price my SaaS?" });
   * for await (const event of stream) {
   *   if (event.type === "text_delta") process.stdout.write(event.delta);
   * }
   *
   * @example
   * // Video-scoped Q&A
   * const stream = await bold.ai.chat({ videoId: "vid_xyz", prompt: "What does she mean?" });
   *
   * @example
   * // Non-streaming
   * const response = await bold.ai.chat({ prompt: "How do I price my SaaS?", stream: false });
   * console.log(response.content);
   */
  chat(options: ChatOptions & { stream: false }): Promise<AIResponse>;
  chat(options: ChatOptions & { stream?: true }): Promise<AsyncIterable<AIEvent>>;
  chat(options: ChatOptions): Promise<AsyncIterable<AIEvent> | AIResponse>;

  /**
   * @deprecated Use chat() instead. Will be removed in a future version.
   */
  ask(options: AskOptions & { stream: false }): Promise<AIResponse>;
  ask(options: AskOptions & { stream?: true }): Promise<AsyncIterable<AIEvent>>;
  ask(options: AskOptions): Promise<AsyncIterable<AIEvent> | AIResponse>;

  /**
   * @deprecated Use chat() instead. Will be removed in a future version.
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
   * Recommendations - AI-powered video recommendations
   *
   * @example
   * // Streaming (default)
   * const stream = await bold.ai.recommendations({ topics: ["sales", "negotiation"] });
   * for await (const event of stream) {
   *   if (event.type === "recommendations") console.log(event.recommendations);
   * }
   *
   * @example
   * // Non-streaming
   * const response = await bold.ai.recommendations({ topics: ["sales"], stream: false });
   * console.log(response.guidance);
   */
  recommendations(options: RecommendationsOptions & { stream: false }): Promise<RecommendationsResponse>;
  recommendations(options: RecommendationsOptions & { stream?: true }): Promise<AsyncIterable<AIEvent>>;
  recommendations(options: RecommendationsOptions): Promise<AsyncIterable<AIEvent> | RecommendationsResponse>;

  /**
   * @deprecated Use recommendations() instead. Will be removed in a future version.
   */
  recommend(options: RecommendOptions & { stream: false }): Promise<RecommendResponse>;
  recommend(options: RecommendOptions & { stream?: true }): Promise<AsyncIterable<AIEvent>>;
  recommend(options: RecommendOptions): Promise<AsyncIterable<AIEvent> | RecommendResponse>;

  /**
   * Get conversation history by ID
   *
   * @example
   * const conversation = await bold.ai.getConversation("550e8400-e29b-41d4-a716-446655440000");
   * for (const msg of conversation.messages) {
   *   console.log(`${msg.role}: ${msg.content}`);
   * }
   */
  getConversation(conversationId: string): Promise<Conversation>;
}

/**
 * Create AI methods bound to client config
 */
export function createAI(config: AIConfig): AIClient {
  async function chat(options: ChatOptions): Promise<AsyncIterable<AIEvent> | AIResponse> {
    const isVideoScoped = !!options.videoId;
    
    const basePath = isVideoScoped
      ? `ai/videos/${options.videoId}/chat`
      : 'ai/chat';
    
    const path = options.conversationId
      ? `${basePath}/${options.conversationId}`
      : basePath;

    const body: Record<string, unknown> = { prompt: options.prompt };
    if (options.collectionId) body.collection_id = options.collectionId;
    if (options.tags) body.tags = options.tags;
    if (isVideoScoped && options.currentTime !== undefined) {
      body.current_time = options.currentTime;
    }

    if (options.stream === false) {
      body.stream = false;
      return jsonRequest(path, body, config);
    }

    return streamRequest(path, body, config);
  }

  async function ask(options: AskOptions): Promise<AsyncIterable<AIEvent> | AIResponse> {
    return chat(options);
  }

  async function coach(options: AskOptions): Promise<AsyncIterable<AIEvent> | AIResponse> {
    return chat(options);
  }

  async function search(options: SearchOptions): Promise<AsyncIterable<AIEvent> | AIResponse> {
    const path = 'ai/search';

    const body: Record<string, unknown> = { prompt: options.prompt };
    if (options.limit) body.limit = options.limit;
    if (options.collectionId) body.collection_id = options.collectionId;
    if (options.videoId) body.video_id = options.videoId;
    if (options.tags) body.tags = options.tags;
    if (options.context) body.context = options.context;

    if (options.stream === false) {
      body.stream = false;
      return jsonRequest(path, body, config);
    }

    return streamRequest(path, body, config);
  }

  async function recommendations(options: RecommendationsOptions): Promise<AsyncIterable<AIEvent> | RecommendationsResponse> {
    const path = 'ai/recommendations';

    const body: Record<string, unknown> = { topics: options.topics };
    if (options.limit) body.limit = options.limit;
    if (options.collectionId) body.collection_id = options.collectionId;
    if (options.tags) body.tags = options.tags;
    if (options.includeGuidance !== undefined) body.include_guidance = options.includeGuidance;
    if (options.context) body.context = options.context;

    if (options.stream === false) {
      body.stream = false;
      return jsonRequest<RecommendationsResponse>(path, body, config);
    }

    return streamRequest(path, body, config);
  }

  async function recommend(options: RecommendOptions): Promise<AsyncIterable<AIEvent> | RecommendResponse> {
    return recommendations(options);
  }

  async function getConversation(conversationId: string): Promise<Conversation> {
    if (!conversationId) {
      throw new Error('conversationId is required');
    }
    return getRequest<Conversation>(`ai/chat/${conversationId}`, config);
  }

  return {
    chat: chat as AIClient['chat'],
    ask: ask as AIClient['ask'],
    coach: coach as AIClient['coach'],
    search: search as AIClient['search'],
    recommendations: recommendations as AIClient['recommendations'],
    recommend: recommend as AIClient['recommend'],
    getConversation,
  };
}
