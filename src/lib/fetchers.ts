import { Video, Playlist, Settings } from './types'
import { AxiosInstance } from 'axios'

type Response<T> = {
  data: T
}

type ApiClient = AxiosInstance;

async function get<TResponse>(client: ApiClient, url: string): Promise<TResponse> {
  const res = await client.get(url);
  return res.data as TResponse;
}

export function fetchSettings(client: ApiClient) {
  return async (videoLimit = 12) => get<Response<Settings>>(client, `settings?limit=${videoLimit}`);
}

export function fetchVideos(client: ApiClient) {
  return async (videoLimit = 12) => get<Response<Video[]>>(client, `videos/latest?limit=${videoLimit}`);
}

export function fetchVideo(client: ApiClient) {
  return async (id: string) => get<Response<Video>>(client, `videos/${id}`);
}

export function fetchPlaylists(client: ApiClient) {
  return async () => get<Response<Playlist[]>>(client, "playlists");
}

export function fetchPlaylist(client: ApiClient) {
  return async (id: string) => get<Response<Playlist>>(client, `playlists/${id}`);
}
