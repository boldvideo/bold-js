import type { AIEvent, AIResponse, ChatOptions, SearchOptions, RecommendationsOptions, RecommendationsResponse, AskOptions, RecommendOptions, RecommendResponse, Conversation, ImageInput, MultimodalCapability } from './types';
import { camelizeKeys } from '../util/camelize';

export interface AIConfig {
  baseURL: string;
  headers: Record<string, string>;
}

/**
 * Typed error thrown by AI HTTP failures (non-2xx responses or fetch errors).
 * Mirrors ViewerAPIError / CommunityAPIError but adapted for fetch.
 */
export class AIAPIError extends Error {
  readonly status?: number;
  readonly originalError?: Error;

  constructor(method: string, url: string, response?: Response, error?: unknown) {
    let status: number | undefined;
    let message: string;

    if (response) {
      status = response.status;
      message = response.statusText || `HTTP ${response.status}`;
    } else if (error instanceof Error) {
      message = error.message;
    } else if (error !== undefined) {
      message = String(error);
    } else {
      message = 'unknown error';
    }

    super(
      status !== undefined
        ? `${method} ${url} failed (${status}): ${message}`
        : `${method} ${url} failed: ${message}`,
    );
    this.name = 'AIAPIError';
    this.status = status;
    if (error instanceof Error) this.originalError = error;
  }
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

      for (const block of lines) {
        if (!block.trim()) continue;

        const blockLines = block.split(/\r?\n/);
        const dataLine = blockLines.find(l => l.trim().startsWith('data:'));
        if (!dataLine) continue;

        const json = dataLine.trim().slice(5).trim();
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
    throw new AIAPIError('POST', url.toString(), response);
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
    throw new AIAPIError('POST', url.toString(), response);
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
    throw new AIAPIError('GET', url.toString(), response);
  }

  const raw = await response.json();
  return camelizeKeys(raw) as T;
}

/**
 * Encode a Blob to a raw base64 string (no data URL prefix).
 * Isomorphic: prefers FileReader.readAsDataURL when available, falls back to
 * arrayBuffer() + btoa() for environments without FileReader (Node, Deno, edge).
 */
async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('FileReader did not produce a string result'));
          return;
        }
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Avoid `String.fromCharCode(...bytes)` — splat blows up for large buffers.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)) as number[],
    );
  }
  if (typeof btoa === 'undefined') {
    throw new Error('Cannot encode image: neither FileReader nor btoa is available');
  }
  return btoa(binary);
}

/**
 * Normalize an ImageInput to the snake_case wire shape the server expects.
 * Pre-encoded items are renamed in place; File/Blob are encoded via blobToBase64.
 */
async function encodeImageInput(
  img: ImageInput,
): Promise<{ type: 'base64'; media_type: string; data: string }> {
  if (!(img instanceof Blob) && typeof img === 'object' && 'mediaType' in img) {
    return { type: 'base64', media_type: img.mediaType, data: img.data };
  }
  // File | Blob
  const blob = img as Blob;
  const mediaType = blob.type || 'image/png';
  const data = await blobToBase64(blob);
  return { type: 'base64', media_type: mediaType, data };
}

/**
 * Convert a File or Blob into an ImageInput ready to drop into `images: [...]`.
 * Returns the camelCase shape (`mediaType`); the wire rename happens during
 * request building.
 */
async function imageFromFile(file: File | Blob): Promise<ImageInput> {
  const mediaType = file.type || 'image/png';
  const data = await blobToBase64(file);
  return { type: 'base64', mediaType, data };
}

type CanvasLike =
  | HTMLCanvasElement
  | OffscreenCanvas
  | {
      toBlob?: (cb: (b: Blob | null) => void, type?: string, quality?: number) => void;
      convertToBlob?: (options?: { type?: string; quality?: number }) => Promise<Blob>;
    };

/**
 * Convert a canvas (HTMLCanvasElement, OffscreenCanvas, or any object exposing
 * toBlob / convertToBlob) to an ImageInput.
 */
async function imageFromCanvas(
  canvas: CanvasLike,
  options?: { type?: string; quality?: number },
): Promise<ImageInput> {
  const type = options?.type ?? 'image/png';
  const quality = options?.quality;

  const c = canvas as {
    toBlob?: (cb: (b: Blob | null) => void, type?: string, quality?: number) => void;
    convertToBlob?: (o?: { type?: string; quality?: number }) => Promise<Blob>;
  };

  let blob: Blob | null;
  if (typeof c.convertToBlob === 'function') {
    blob = await c.convertToBlob({ type, quality });
  } else if (typeof c.toBlob === 'function') {
    blob = await new Promise<Blob | null>((resolve) =>
      c.toBlob!((b) => resolve(b), type, quality),
    );
  } else {
    throw new TypeError(
      'imageFromCanvas: canvas must expose toBlob() or convertToBlob()',
    );
  }

  if (!blob) {
    throw new Error('imageFromCanvas: canvas produced no blob');
  }

  return imageFromFile(blob);
}

/**
 * Pure validator that checks a File/Blob against the multimodal capability
 * limits the caller fetched from `bold.settings()`. Returns `{ valid: true }`
 * when limits are missing, disabled, or do not constrain media types.
 */
function validateImage(
  file: File | Blob,
  limits: MultimodalCapability,
): { valid: boolean; error?: string } {
  if (!limits || limits.enabled === false) return { valid: true };
  const accepted = limits.acceptedMediaTypes;
  if (!accepted || accepted.length === 0) return { valid: true };
  const mediaType = file.type || '';
  if (!accepted.includes(mediaType)) {
    return {
      valid: false,
      error: `Unsupported media type "${mediaType || '(unknown)'}". Accepted: ${accepted.join(', ')}`,
    };
  }
  return { valid: true };
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

  /**
   * Convert a File or Blob into a base64 ImageInput payload for use with
   * `images: [...]` on chat / ask / coach / search.
   */
  imageFromFile(file: File | Blob): Promise<ImageInput>;

  /**
   * Convert an HTMLCanvasElement / OffscreenCanvas (or any object exposing
   * toBlob / convertToBlob) into a base64 ImageInput payload.
   */
  imageFromCanvas(
    canvas:
      | HTMLCanvasElement
      | OffscreenCanvas
      | {
          toBlob?: (cb: (b: Blob | null) => void, type?: string, quality?: number) => void;
          convertToBlob?: (options?: { type?: string; quality?: number }) => Promise<Blob>;
        },
    options?: { type?: string; quality?: number },
  ): Promise<ImageInput>;

  /**
   * Pure client-side validator. Pass the multimodal limits from
   * `(await bold.settings()).data.account.multimodal`. Returns `{ valid: true }`
   * when limits are missing or disabled.
   */
  validateImage(
    file: File | Blob,
    limits: MultimodalCapability,
  ): { valid: boolean; error?: string };
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
    imageFromFile,
    imageFromCanvas,
    validateImage,
  };
}
