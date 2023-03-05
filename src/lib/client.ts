import axios, { AxiosInstance } from "axios";

import { fetchVideo, fetchVideos, fetchSettings, fetchPlaylist, fetchPlaylists } from './fetchers'
import { trackEvent, trackPageView } from './tracking'

type ClientOptions = {
  baseURL?: string
  debug: boolean
}

function createClient(apiKey: string, options: ClientOptions = {debug: false}) {
  const { debug } = options;
  const apiClientOptions = {
    baseURL: options.baseURL ?? "https://app.boldvideo.io/api/v1/",
    headers: {
      Authorization: apiKey,
    },
  };

  const apiClient: AxiosInstance = axios.create(apiClientOptions);

  const userId = [...Array(30)]
    .map(() => Math.random().toString(36)[2])
    .join("");

  return {
    settings: fetchSettings(apiClient),
    videos: {
      list: fetchVideos(apiClient),
      get: fetchVideo(apiClient),
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
