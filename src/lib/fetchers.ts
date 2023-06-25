import { Video, Playlist, Settings } from "./types";
import { AxiosInstance } from "axios";

type Response<T> = {
  data: T;
};

type ApiClient = AxiosInstance;

async function get<TResponse>(
  client: ApiClient,
  url: string
): Promise<TResponse> {
  try {
    const res = await client.get(url);
    if (res.status !== 200) {
      throw new Error(`Unexpected response status: ${res.status}`);
    }
    return res.data as TResponse;
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
  return async (videoLimit = 12) => {
    try {
      return await get<Response<Video[]>>(
        client,
        `videos/latest?limit=${videoLimit}`
      );
    } catch (error) {
      console.error(`Error fetching videos with limit: ${videoLimit}`, error);
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
