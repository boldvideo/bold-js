import { AxiosInstance } from "axios";
import { camelizeKeys } from "../util/camelize";
import type { Viewer, ViewerProgress, ListProgressOptions } from "./types";

type ApiClient = AxiosInstance;

// Re-use the get helper pattern from fetchers.ts
async function get<T>(client: ApiClient, url: string): Promise<T> {
  try {
    const res = await client.get(url);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    console.error(`Error fetching from ${url}`, error);
    throw error;
  }
}

async function post<T>(client: ApiClient, url: string, data?: Record<string, unknown>): Promise<T> {
  try {
    const res = await client.post(url, data);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    console.error(`Error posting to ${url}`, error);
    throw error;
  }
}

async function patch<T>(client: ApiClient, url: string, data: Record<string, unknown>): Promise<T> {
  try {
    const res = await client.patch(url, data);
    return camelizeKeys(res.data) as T;
  } catch (error) {
    console.error(`Error patching ${url}`, error);
    throw error;
  }
}

// --- Viewer CRUD ---

export function fetchViewers(client: ApiClient) {
  return async () => {
    return get<{ viewers: Viewer[] }>(client, 'viewers');
  };
}

export function fetchViewer(client: ApiClient) {
  return async (id: string) => {
    if (!id) throw new Error('Viewer ID is required');
    return get<{ viewer: Viewer }>(client, `viewers/${id}`);
  };
}

export function createViewer(client: ApiClient) {
  return async (data: { name: string; email?: string; externalId?: string; traits?: Record<string, unknown> }) => {
    if (!data.name) throw new Error('Viewer name is required');
    return post<{ viewer: Viewer }>(client, 'viewers', {
      viewer: {
        name: data.name,
        email: data.email,
        external_id: data.externalId,
        traits: data.traits,
      }
    });
  };
}

export function updateViewer(client: ApiClient) {
  return async (id: string, data: { name?: string; email?: string; externalId?: string; traits?: Record<string, unknown> }) => {
    if (!id) throw new Error('Viewer ID is required');
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.email !== undefined) body.email = data.email;
    if (data.externalId !== undefined) body.external_id = data.externalId;
    if (data.traits !== undefined) body.traits = data.traits;
    return patch<{ viewer: Viewer }>(client, `viewers/${id}`, { viewer: body });
  };
}

// --- Progress Tracking (flat methods) ---

export function fetchViewerProgress(client: ApiClient) {
  return async (viewerId: string, options?: ListProgressOptions) => {
    if (!viewerId) throw new Error('Viewer ID is required');
    const params = new URLSearchParams();
    if (options?.completed !== undefined) params.set('completed', String(options.completed));
    if (options?.collectionId) params.set('collection_id', options.collectionId);
    const query = params.toString();
    const url = query ? `viewers/${viewerId}/progress?${query}` : `viewers/${viewerId}/progress`;
    return get<{ progress: ViewerProgress[]; meta: { total: number; completed: number; inProgress: number } }>(client, url);
  };
}

export function fetchProgress(client: ApiClient) {
  return async (viewerId: string, videoId: string) => {
    if (!viewerId) throw new Error('Viewer ID is required');
    if (!videoId) throw new Error('Video ID is required');
    return get<{ progress: ViewerProgress }>(client, `viewers/${viewerId}/progress/${videoId}`);
  };
}

export function saveProgress(client: ApiClient) {
  return async (viewerId: string, videoId: string, data: { currentTime: number; duration: number }) => {
    if (!viewerId) throw new Error('Viewer ID is required');
    if (!videoId) throw new Error('Video ID is required');
    if (data.currentTime === undefined) throw new Error('currentTime is required');
    if (data.duration === undefined) throw new Error('duration is required');
    return post<{ progress: ViewerProgress }>(client, `viewers/${viewerId}/progress/${videoId}`, {
      progress: {
        current_time: data.currentTime,
        duration: data.duration,
      }
    });
  };
}
