import type { StuckMoment } from "./moment";

export interface AssistantVideo {
  videoId: string;
  canonicalVideoId?: string | null;
  title?: string | null;
  currentTime?: number;
  getCurrentTime?: () => number;
  chapters?: string | null;
  conversationStarters?: readonly string[];
  onSeek?: (seconds: number, interactionId?: string | null) => void;
  playing?: boolean;
  moment?: StuckMoment | null;
}
export interface VideoSnapshot { video: AssistantVideo | null; switching: boolean }
const SETTLE_MS = 120;

/** One store per provider. Use a stable owner token per page to reject stale cleanup. */
export function createVideoStore() {
  let state: VideoSnapshot = { video: null, switching: false };
  let owner: unknown;
  let stale = false;
  let pending = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function commit(video: AssistantVideo | null) {
    // A released page is unresolved even before its fallback mounts.
    const switching = video !== null ? stale : pending > 0;
    if (state.video === video && state.switching === switching) return;
    state = { video, switching };
    for (const listener of [...listeners]) listener();
  }
  function settle() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (stale && pending === 0) { stale = false; commit(null); }
      else commit(state.video);
    }, SETTLE_MS);
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(video: AssistantVideo, registration: unknown = video.videoId) {
      owner = registration;
      stale = false;
      clearTimeout(timer);
      const current = state.video;
      const keys = Object.keys(video) as (keyof AssistantVideo)[];
      const same = current && Object.keys(current).length === keys.length && keys.every(key => current[key] === video[key]);
      commit(same ? current : { ...video });
    },
    release(registration: unknown) {
      if (owner !== registration || state.video === null) return;
      stale = true;
      commit(state.video);
      settle();
    },
    beginPending() { pending++; commit(state.video); },
    endPending() { pending = Math.max(0, pending - 1); settle(); },
    dispose() { clearTimeout(timer); listeners.clear(); },
  };
}
