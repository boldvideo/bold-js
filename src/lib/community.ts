import { AxiosInstance, AxiosError } from "axios";
import { camelizeKeys } from "../util/camelize";
import type {
  Post,
  Comment,
  ReactionResponse,
  ListPostsOptions,
  CreatePostData,
  UpdatePostData,
  CreateCommentData,
  PaginatedResponse,
} from "./types";

type ApiClient = AxiosInstance;

/**
 * Error thrown by Community API operations
 */
export class CommunityAPIError extends Error {
  readonly status?: number;
  readonly originalError?: Error;

  constructor(method: string, url: string, error: unknown) {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const message = error.response?.data?.error || error.message;
      super(`${method} ${url} failed (${status}): ${message}`);
      this.status = status;
      this.originalError = error;
    } else if (error instanceof Error) {
      super(`${method} ${url} failed: ${error.message}`);
      this.originalError = error;
    } else {
      super(`${method} ${url} failed: ${String(error)}`);
    }
    this.name = "CommunityAPIError";
  }
}

function requireViewerId(viewerId?: string) {
  if (!viewerId) throw new Error("Viewer ID is required (X-Viewer-ID)");
}

function viewerHeaders(viewerId?: string): Record<string, string> | undefined {
  return viewerId ? { "X-Viewer-ID": viewerId } : undefined;
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function get<T>(
  client: ApiClient,
  url: string,
  viewerId?: string
): Promise<T> {
  try {
    const res = await client.get(url, { headers: viewerHeaders(viewerId) });
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new CommunityAPIError("GET", url, error);
  }
}

async function post<T>(
  client: ApiClient,
  url: string,
  data?: Record<string, unknown>,
  viewerId?: string
): Promise<T> {
  try {
    const res = await client.post(url, data, { headers: viewerHeaders(viewerId) });
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new CommunityAPIError("POST", url, error);
  }
}

async function put<T>(
  client: ApiClient,
  url: string,
  data?: Record<string, unknown>,
  viewerId?: string
): Promise<T> {
  try {
    const res = await client.put(url, data, { headers: viewerHeaders(viewerId) });
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new CommunityAPIError("PUT", url, error);
  }
}

async function del<T>(
  client: ApiClient,
  url: string,
  viewerId?: string
): Promise<T> {
  try {
    const res = await client.delete(url, { headers: viewerHeaders(viewerId) });
    return camelizeKeys(res.data) as T;
  } catch (error) {
    throw new CommunityAPIError("DELETE", url, error);
  }
}

// --- Posts ---

/**
 * List community posts with optional filters and pagination
 */
export function listPosts(client: ApiClient) {
  return async (opts: ListPostsOptions = {}): Promise<PaginatedResponse<Post>> => {
    return get<PaginatedResponse<Post>>(
      client,
      `community/posts${toQuery({
        category: opts.category,
        page: opts.page,
        page_size: opts.pageSize,
      })}`,
      opts.viewerId
    );
  };
}

/**
 * Get a single post by ID
 */
export function getPost(client: ApiClient) {
  return async (id: string, viewerId?: string) => {
    if (!id) throw new Error("Post ID is required");
    return get<{ data: Post }>(client, `community/posts/${id}`, viewerId);
  };
}

/**
 * Create a new community post
 */
export function createPost(client: ApiClient) {
  return async (viewerId: string, data: CreatePostData) => {
    requireViewerId(viewerId);
    if (!data?.content) throw new Error("Post content is required");
    return post<{ data: Post }>(
      client,
      "community/posts",
      { post: { content: data.content, category: data.category } },
      viewerId
    );
  };
}

/**
 * Update an existing post (owner or admin only)
 */
export function updatePost(client: ApiClient) {
  return async (viewerId: string, id: string, data: UpdatePostData) => {
    requireViewerId(viewerId);
    if (!id) throw new Error("Post ID is required");
    const body: Record<string, unknown> = {};
    if (data.content !== undefined) body.content = data.content;
    if (data.category !== undefined) body.category = data.category;
    return put<{ data: Post }>(
      client,
      `community/posts/${id}`,
      { post: body },
      viewerId
    );
  };
}

/**
 * Delete a post (owner or admin only)
 */
export function deletePost(client: ApiClient) {
  return async (viewerId: string, id: string) => {
    requireViewerId(viewerId);
    if (!id) throw new Error("Post ID is required");
    return del<{ data?: unknown }>(client, `community/posts/${id}`, viewerId);
  };
}

/**
 * Toggle reaction on a post (like/unlike)
 */
export function reactToPost(client: ApiClient) {
  return async (viewerId: string, id: string) => {
    requireViewerId(viewerId);
    if (!id) throw new Error("Post ID is required");
    return post<ReactionResponse>(
      client,
      `community/posts/${id}/react`,
      undefined,
      viewerId
    );
  };
}

// --- Comments ---

/**
 * Create a comment on a post
 */
export function createComment(client: ApiClient) {
  return async (viewerId: string, postId: string, data: CreateCommentData) => {
    requireViewerId(viewerId);
    if (!postId) throw new Error("Post ID is required");
    if (!data?.content) throw new Error("Comment content is required");
    const body: Record<string, unknown> = { content: data.content };
    if (data.parentId) body.parent_id = data.parentId;
    return post<{ data: Comment }>(
      client,
      `community/posts/${postId}/comments`,
      { comment: body },
      viewerId
    );
  };
}

/**
 * Delete a comment (owner or admin only)
 */
export function deleteComment(client: ApiClient) {
  return async (viewerId: string, id: string) => {
    requireViewerId(viewerId);
    if (!id) throw new Error("Comment ID is required");
    return del<{ data?: unknown }>(client, `community/comments/${id}`, viewerId);
  };
}

/**
 * Toggle reaction on a comment (like/unlike)
 */
export function reactToComment(client: ApiClient) {
  return async (viewerId: string, id: string) => {
    requireViewerId(viewerId);
    if (!id) throw new Error("Comment ID is required");
    return post<ReactionResponse>(
      client,
      `community/comments/${id}/react`,
      undefined,
      viewerId
    );
  };
}
