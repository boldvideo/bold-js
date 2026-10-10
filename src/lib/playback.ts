import type { PlaybackSource, ThumbnailOptions } from './types';

function isSigned(video: PlaybackSource): boolean {
  return video.playbackPolicy === 'signed' ||
    (video.playbackPolicy !== 'public' && Boolean(video.playbackToken));
}

/**
 * Return the API stream URL, or build a Mux HLS URL with the supplied playback token.
 * Returns undefined without a URL or playback ID; does not validate credentials.
 * @example
 * const src = streamUrl({ playbackId: 'playback-id', playbackToken: 'PLAYBACK_TOKEN' });
 */
export function streamUrl(video: PlaybackSource): string | undefined {
  if (video.streamUrl) return video.streamUrl;
  if (!video.playbackId) return undefined;
  const url = `https://stream.mux.com/${encodeURIComponent(video.playbackId)}.m3u8`;
  return video.playbackToken ? `${url}?token=${encodeURIComponent(video.playbackToken)}` : url;
}

/**
 * Props to spread into Mux Player. Public videos use only the playback ID.
 * Signed videos use supplied tokens and the stored thumbnail as an explicit poster.
 * Missing fields are omitted; token-bearing AI sources are treated as signed.
 * @example
 * const props = muxPlayerProps({ playbackId: 'playback-id', playbackToken: 'PLAYBACK_TOKEN' });
 */
export function muxPlayerProps(video: PlaybackSource): {
  playbackId?: string;
  tokens?: { playback: string; storyboard?: string };
  poster?: string;
} {
  const props: ReturnType<typeof muxPlayerProps> = {};
  if (video.playbackId) props.playbackId = video.playbackId;
  if (isSigned(video)) {
    if (video.playbackToken) {
      props.tokens = { playback: video.playbackToken };
      if (video.storyboardToken) props.tokens.storyboard = video.storyboardToken;
    }
    if (video.thumbnail) props.poster = video.thumbnail;
  }
  return props;
}

/**
 * Build a public Mux thumbnail URL, or return the stored thumbnail for signed videos.
 * Signed videos ignore options. Returns undefined when the required ID/image is absent.
 * @example
 * const poster = thumbnailUrl({ playbackId: 'playback-id' }, { width: 640, time: 0 });
 */
export function thumbnailUrl(video: PlaybackSource, opts: ThumbnailOptions = {}): string | undefined {
  if (isSigned(video)) return video.thumbnail || undefined;
  if (!video.playbackId) return undefined;
  const params = new URLSearchParams();
  if (opts.width !== undefined) params.set('width', String(opts.width));
  if (opts.height !== undefined) params.set('height', String(opts.height));
  if (opts.time !== undefined) params.set('time', String(opts.time));
  if (opts.fitMode !== undefined) params.set('fit_mode', opts.fitMode);
  const query = params.toString();
  const url = `https://image.mux.com/${encodeURIComponent(video.playbackId)}/thumbnail.jpg`;
  return query ? `${url}?${query}` : url;
}
