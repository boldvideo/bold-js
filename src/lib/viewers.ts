import { AxiosInstance, AxiosError } from "axios";
import { camelizeKeys, type CamelizeOptions } from "../util/camelize";
import type {
  Viewer,
  ViewerProgress,
  ListProgressOptions,
  CreateViewerData,
  UpdateViewerData,
  SaveProgressData,
  ProgressListMeta,
} from "./types";

type ApiClient = AxiosInstance;

const VIEWER_CAMELIZE_OPTIONS: CamelizeOptions = { preserveKeys: ['traits'] };

export class ViewerAPIError extends Error {
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
    this.name = 'ViewerAPIError';
  }
}

async function get<T>(client: ApiClient, url: string, options?: CamelizeOptions): Promise<T> {
  try {
    const res = await client.get(url);
    return camelizeKeys(res.data, options) as T;
  } catch (error) {
    throw new ViewerAPIError('GET', url, error);
  }
}

async function post<T>(client: ApiClient, url: string, data?: Record<string, unknown>, options?: CamelizeOptions): Promise<T> {
  try {
    const res = await client.post(url, data);
    return camelizeKeys(res.data, options) as T;
  } catch (error) {
    throw new ViewerAPIError('POST', url, error);
  }
}

async function patch<T>(client: ApiClient, url: string, data: Record<string, unknown>, options?: CamelizeOptions): Promise<T> {
  try {
    const res = await client.patch(url, data);
    return camelizeKeys(res.data, options) as T;
  } catch (error) {
    throw new ViewerAPIError('PATCH', url, error);
  }
}

// --- Viewer CRUD ---

export function fetchViewers(client: ApiClient) {
  return async () => {
    return get<{ data: Viewer[] }>(client, 'viewers', VIEWER_CAMELIZE_OPTIONS);
  };
}

export function fetchViewer(client: ApiClient) {
  return async (id: string) => {
    if (!id) throw new Error('Viewer ID is required');
    return get<{ data: Viewer }>(client, `viewers/${id}`, VIEWER_CAMELIZE_OPTIONS);
  };
}

export type ViewerLookupParams =
  | { externalId: string; email?: never }
  | { email: string; externalId?: never };

export function lookupViewer(client: ApiClient) {
  return async (params: ViewerLookupParams) => {
    const qs = new URLSearchParams();
    if ('externalId' in params && params.externalId) {
      qs.set('external_id', params.externalId);
    }
    if ('email' in params && params.email) {
      qs.set('email', params.email);
    }
    if (!qs.toString()) {
      throw new Error('Either externalId or email is required');
    }
    return get<{ data: Viewer }>(client, `viewers/lookup?${qs.toString()}`, VIEWER_CAMELIZE_OPTIONS);
  };
}

export function createViewer(client: ApiClient) {
  return async (data: CreateViewerData) => {
    if (!data.name) throw new Error('Viewer name is required');
    return post<{ data: Viewer }>(client, 'viewers', {
      viewer: {
        name: data.name,
        email: data.email,
        external_id: data.externalId,
        traits: data.traits,
      }
    }, VIEWER_CAMELIZE_OPTIONS);
  };
}

export function updateViewer(client: ApiClient) {
  return async (id: string, data: UpdateViewerData) => {
    if (!id) throw new Error('Viewer ID is required');
    const body: Record<string, unknown> = {};
    if (data.name !== undefined) body.name = data.name;
    if (data.email !== undefined) body.email = data.email;
    if (data.externalId !== undefined) body.external_id = data.externalId;
    if (data.traits !== undefined) body.traits = data.traits;
    return patch<{ data: Viewer }>(client, `viewers/${id}`, { viewer: body }, VIEWER_CAMELIZE_OPTIONS);
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
    return get<{ data: ViewerProgress[]; meta: ProgressListMeta }>(client, url);
  };
}

export function fetchProgress(client: ApiClient) {
  return async (viewerId: string, videoId: string) => {
    if (!viewerId) throw new Error('Viewer ID is required');
    if (!videoId) throw new Error('Video ID is required');
    return get<{ data: ViewerProgress }>(client, `viewers/${viewerId}/progress/${videoId}`);
  };
}

export function saveProgress(client: ApiClient) {
  return async (viewerId: string, videoId: string, data: SaveProgressData) => {
    if (!viewerId) throw new Error('Viewer ID is required');
    if (!videoId) throw new Error('Video ID is required');
    if (!Number.isFinite(data.currentTime) || data.currentTime < 0) {
      throw new Error('currentTime must be a non-negative number');
    }
    if (!Number.isFinite(data.duration) || data.duration <= 0) {
      throw new Error('duration must be a positive number');
    }
    return post<{ data: ViewerProgress }>(client, `viewers/${viewerId}/progress/${videoId}`, {
      progress: {
        current_time: data.currentTime,
        duration: data.duration,
      }
    });
  };
}
