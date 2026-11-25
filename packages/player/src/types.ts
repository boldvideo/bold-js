import type { CSSProperties } from "react";

/**
 * The fields of a Bold video the player reads. A `Video` from
 * `@boldvideo/bold-js` satisfies it as is; so does any object with an `id`
 * and either a `playbackId` or a `streamUrl`.
 */
export interface BoldPlayerVideo {
  id: string;
  title?: string | null;
  duration?: number | null;
  /** Mux playback ID. */
  playbackId?: string | null;
  /** Signed-playback credential. Do not log it. */
  playbackToken?: string | null;
  /** Signed-playback credential for timeline preview images. */
  storyboardToken?: string | null;
  /** HLS stream, used when there is no `playbackId`. */
  streamUrl?: string | null;
  thumbnail?: string | null;
  /** Chapters as WebVTT text. */
  chapters?: string | null;
  /** Chapters as a WebVTT URL, used when `chapters` is absent. */
  chaptersUrl?: string | null;
  subtitles?: {
    url: string;
    label?: string | null;
    language?: string | null;
  } | null;
  downloadUrls?: {
    /** The static MP4 rendition the player falls back to. */
    legacyMp4?: string | null;
  } | null;
  /** Default playback rate set by the library owner. */
  playbackSpeed?: number | null;
}

/**
 * The parts of Bold's settings the player reads. The object `bold.settings()`
 * returns satisfies it as is.
 */
export interface BoldPlayerSettings {
  /** Logo for light backgrounds. */
  logoUrl?: string | null;
  /** Logo for dark backgrounds; preferred, since the player's controls are dark. */
  logoDarkUrl?: string | null;
  account?: { name?: string | null } | null;
  themeConfig?: {
    light?: { accent?: string | null } | null;
    dark?: { accent?: string | null } | null;
  } | null;
  portal?: {
    display?: { showChapters?: boolean | null } | null;
  } | null;
  /** Player options set for the account. */
  player?: { branding?: BoldPlayerBranding | null } | null;
}

/**
 * Whose logo the player carries in its corner.
 *
 * - `"none"`: no logo.
 * - `"bold"`: Bold's wordmark and Bold's accent colour.
 * - `"account"`: the account's own logo, from its settings.
 */
export type BoldPlayerBranding = "none" | "bold" | "account";

/**
 * Where playback events are sent. A bold-js client fits (`createClient(...)`
 * has `trackEvent`), as does any object with the same method.
 */
export interface BoldTracker {
  trackEvent: (video: BoldPlayerVideo, event: Event) => void;
}

/** Passed to `onFallback` when playback moves from the stream to the MP4. */
export interface BoldPlayerFallback {
  /** What failed, e.g. `manifestLoadError` or `fragLoadError`. */
  reason: string;
  /** Position in seconds that playback resumes from. */
  resumeAt: number;
}

export interface BoldPlayerProps {
  /** The video to play, as returned by `bold.videos.get()`. */
  video: BoldPlayerVideo;
  /** Sends playback analytics to Bold. Pass your bold-js client. */
  bold?: BoldTracker;
  /** Try to start immediately. Browsers may refuse; the poster then stays up. */
  autoPlay?: boolean;
  /** Start position in seconds. Changing it later seeks. */
  startTime?: number;
  /**
   * Your Bold settings, from `bold.settings()`. The player takes its accent
   * colour, whether to show chapters, and its branding from them.
   */
  settings?: BoldPlayerSettings;
  /** Whose logo the player carries. Default: what `settings` say, else `"none"`. */
  branding?: BoldPlayerBranding;
  /** Colour of the progress bar and highlighted controls. Any CSS colour. Wins over `settings`. */
  accentColor?: string;
  /** Show the video's title in the player's top left corner. Default `false`. */
  showTitle?: boolean;
  /** Poster image. Defaults to the video's thumbnail. */
  poster?: string;
  /** Show the video's subtitles as a captions track. Default `true`. */
  captions?: boolean;
  /** Show the video's chapters on the timeline. Default: what `settings` say, else `true`. */
  chapters?: boolean;
  /** Continue from the static MP4 when the stream fails. Default `true`. */
  mp4Fallback?: boolean;
  className?: string;
  /** Also the place for Video.js skin properties such as `--media-border-radius`. */
  style?: CSSProperties;
  onLoadedMetadata?: (event: Event) => void;
  onPlay?: (event: Event) => void;
  onPause?: (event: Event) => void;
  onTimeUpdate?: (event: Event) => void;
  onEnded?: (event: Event) => void;
  /** Called once when playback moves from the stream to the MP4. */
  onFallback?: (fallback: BoldPlayerFallback) => void;
}

/**
 * What the player's `ref` receives. Shaped like a media element, so code
 * written against `<video>` (transcript sync, seeking from a citation) works
 * unchanged.
 */
export interface BoldPlayerHandle {
  /** The underlying `<video>`, or `null` before it mounts. */
  readonly media: HTMLVideoElement | null;
  /** Setting it before the video has loaded seeks once it has. */
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  /** Listeners added before the video mounts are attached once it does. */
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}
