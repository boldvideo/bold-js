import axios, { AxiosInstance } from "axios";

import { fetchVideo, fetchVideos, searchVideos, fetchSettings, fetchPlaylist, fetchPlaylists } from './fetchers'
import { trackEvent, trackPageView } from './tracking'
import { DEFAULT_API_BASE_URL } from './constants'

export type ClientOptions = {
  baseURL?: string
  debug?: boolean
  headers?: Record<string, string>
}

function createClient(apiKey: string, options: ClientOptions = {}) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('API key is missing or invalid');
  }

  const { debug = false, headers = {} } = options;
  const apiClientOptions = {
    baseURL: options.baseURL ?? DEFAULT_API_BASE_URL,
    headers: {
      Authorization: apiKey,
      ...headers,
    },
  };

  let apiClient: AxiosInstance;

  try {
    apiClient = axios.create(apiClientOptions);
  } catch (error) {
    console.error("Error creating API client", error);
    throw error;
  }

  const userId = [...Array(30)]
    .map(() => Math.random().toString(36)[2])
    .join("");

  return {
    settings: fetchSettings(apiClient),
    videos: {
      list: fetchVideos(apiClient),
      get: fetchVideo(apiClient),
      search: searchVideos(apiClient),
    },
    playlists: {
      list: fetchPlaylists(apiClient),
      get: fetchPlaylist(apiClient),
    },
    trackEvent: trackEvent(apiClient, userId, { debug }),
    trackPageView: trackPageView(apiClient, userId, { debug }),
  };
}

export { createClient };
