import type { BoldPlayerVideo } from "./types";

/** A `<track>` source for the video's chapters: its WebVTT text inlined, else its URL. */
export function chaptersTrackSrc(video: BoldPlayerVideo): string | undefined {
  const vtt = video.chapters?.trim();
  if (vtt?.startsWith("WEBVTT")) {
    return `data:text/vtt;charset=utf-8,${encodeURIComponent(vtt)}`;
  }
  return video.chaptersUrl || undefined;
}

/** Bold stores languages as `en_us`; `<track srclang>` wants `en-US`. */
export function trackLanguage(language?: string | null): string {
  if (!language) return "en";
  const [base, region] = language.split(/[_-]/);
  return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : base.toLowerCase();
}
