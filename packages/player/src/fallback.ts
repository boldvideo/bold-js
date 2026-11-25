/**
 * HLS to MP4 fallback.
 *
 * Every Bold video can play two ways: the adaptive HLS stream and one static
 * MP4 rendition. When the stream cannot be loaded (a manifest outage, a broken
 * rendition playlist, segments that stop arriving), the player carries on from
 * the MP4 at the position the viewer had reached.
 */
import type { BoldPlayerVideo } from "./types";

const MUX_STREAM_ORIGIN = "https://stream.mux.com";

/**
 * hls.js waits forever for a manifest's first byte by default, so a host that
 * accepts the connection and never answers would hang the player instead of
 * failing over. Two tries, eight seconds each.
 */
export const MANIFEST_LOAD_POLICY = {
  default: {
    maxTimeToFirstByteMs: 8000,
    maxLoadTimeMs: 10000,
    timeoutRetry: { maxNumRetry: 1, retryDelayMs: 0, maxRetryDelayMs: 0 },
    errorRetry: { maxNumRetry: 1, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
  },
};

/** What the player reports when playback dies: a media error, plus hls.js detail when it has one. */
export interface StreamErrorLike {
  /** `MediaError.code`: 1 aborted, 2 network, 3 decode, 4 source not supported. */
  code?: number;
  message?: string;
  /** hls.js `ErrorData` when the failure came from hls.js. */
  data?: unknown;
}

const MEDIA_ERR_ABORTED = 1;

function httpStatusOf(error: StreamErrorLike): number | undefined {
  const response = (error.data as { response?: { code?: unknown } } | undefined)
    ?.response;
  return typeof response?.code === "number" ? response.code : undefined;
}

/**
 * Whether a fatal stream error should move playback to the MP4.
 *
 * Everything does, except the two cases the MP4 cannot fix: the viewer aborted
 * the load, or the host refused the request (401/403: an expired or invalid
 * playback token, which the MP4 shares).
 */
export function shouldFallBackToMp4(error: StreamErrorLike): boolean {
  if (error.code === MEDIA_ERR_ABORTED) return false;
  const status = httpStatusOf(error);
  return status !== 401 && status !== 403;
}

/** A short, stable label for what failed, for logs and `onFallback`. */
export function failureReason(error: StreamErrorLike): string {
  const details = (error.data as { details?: unknown } | undefined)?.details;
  if (typeof details === "string" && details) return details;
  return typeof error.code === "number"
    ? `media-error-${error.code}`
    : "stream-error";
}

function withToken(url: string, token?: string | null): string {
  if (!token || /[?&]token=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}

/**
 * The MP4 a video falls back to: the static rendition the Bold API returns as
 * `downloadUrls.legacyMp4`, or the same file derived from the playback ID.
 * Signed videos reuse the playback token.
 */
export function mp4FallbackUrl(video: BoldPlayerVideo): string | undefined {
  const url =
    video.downloadUrls?.legacyMp4 ||
    (video.playbackId
      ? `${MUX_STREAM_ORIGIN}/${encodeURIComponent(video.playbackId)}/highest.mp4`
      : undefined);
  return url ? withToken(url, video.playbackToken) : undefined;
}
