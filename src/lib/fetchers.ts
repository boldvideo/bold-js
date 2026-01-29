import { Video, Playlist, Settings, ListVideosOptions } from "./types";
import { AxiosInstance } from "axios";
import { camelizeKeys } from "../util/camelize";

type Response<T> = {
  data: T;
};

type ApiClient = AxiosInstance;

function toQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function get<TResponse>(
  client: ApiClient,
  url: string
): Promise<TResponse> {
  try {
    const res = await client.get(url);
    if (res.status !== 200) {
      throw new Error(`Unexpected response status: ${res.status}`);
    }
    return camelizeKeys(res.data) as TResponse;
  } catch (error) {
    console.error(`Error fetching data from URL: ${url}`, error);
    throw error;
  }
}

export function fetchSettings(client: ApiClient) {
  return async (videoLimit = 12) => {
    try {
      return await get<Response<Settings>>(
        client,
        `settings?limit=${videoLimit}`
      );
    } catch (error) {
      console.error(`Error fetching settings with limit: ${videoLimit}`, error);
      throw error;
    }
  };
}

export function fetchVideos(client: ApiClient) {
  return async (arg: number | ListVideosOptions = 12) => {
    try {
      if (typeof arg === "number") {
        return await get<Response<Video[]>>(
          client,
          `videos/latest${toQuery({ limit: arg })}`
        );
      }

      const opts = arg as ListVideosOptions;
      const hasPage = "page" in opts && opts.page !== undefined;

      if (hasPage && ("limit" in opts || "viewerId" in opts)) {
        throw new Error(
          "videos.list(): cannot use `page` with `limit` or `viewerId` (these belong to different endpoints)"
        );
      }

      if (hasPage) {
        const { page, tag, collectionId } = opts as { page?: number; tag?: string; collectionId?: string };
        return await get<Response<Video[]>>(
          client,
          `videos${toQuery({
            page,
            tag,
            collection_id: collectionId,
          })}`
        );
      }

      const { limit, tag, collectionId, viewerId } = opts as {
        limit?: number;
        tag?: string;
        collectionId?: string;
        viewerId?: string;
      };
      return await get<Response<Video[]>>(
        client,
        `videos/latest${toQuery({
          limit: limit ?? 12,
          tag,
          collection_id: collectionId,
          viewer_id: viewerId,
        })}`
      );
    } catch (error) {
      console.error(`Error fetching videos`, error);
      throw error;
    }
  };
}

export function searchVideos(client: ApiClient) {
  return async (term: string) => {
    try {
      return await get<Response<Video[]>>(client, `videos?query=${term}`);
    } catch (error) {
      console.error(`Error searching for videos with term: ${term}`, error);
      throw error;
    }
  };
}

/**
 * Fetches a single video by ID or slug.
 * @param id - The video ID (UUID) or slug
 * @returns The video data
 */
export function fetchVideo(client: ApiClient) {
  return async (id: string) => {
    try {
      return await get<Response<Video>>(client, `videos/${id}`);
    } catch (error) {
      console.error(`Error fetching video with ID: ${id}`, error);
      throw error;
    }
  };
}

export function fetchPlaylists(client: ApiClient) {
  return async () => {
    try {
      return await get<Response<Playlist[]>>(client, "playlists");
    } catch (error) {
      console.error("Error fetching playlists", error);
      throw error;
    }
  };
}

export function fetchPlaylist(client: ApiClient) {
  return async (id: string) => {
    try {
      return await get<Response<Playlist>>(client, `playlists/${id}`);
    } catch (error) {
      console.error(`Error fetching playlist with ID: ${id}`, error);
      throw error;
    }
  };
}
