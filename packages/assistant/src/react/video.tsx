import { useCallback, useContext, useEffect, useMemo, useRef, type RefCallback } from "react";
import { momentAfterMove, momentAfterStandingStill, PAUSE_AFTER_MS, type AssistantVideo, type StuckMoment } from "../core";
import { VideoContext } from "./provider";

export interface AssistantVideoInput {
  id: string;
  canonicalVideoId?: string | null;
  title?: string | null;
  chapters?: string | null;
  conversationStarters?: readonly string[];
}
export interface AssistantPlayerHandle {
  currentTime: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
}
export interface AssistantVideoOptions {
  currentTime?: number;
  onSeek?: (seconds: number, interactionId?: string | null) => void;
}

/** Spread props and ref on BoldPlayer or a native video. No player dependency. */
export function useAssistantVideo(video: AssistantVideoInput | null, options: AssistantVideoOptions = {}) {
  const store = useContext(VideoContext);
  if (!store) throw new Error("Use AssistantProvider above useAssistantVideo.");
  const owner = useRef({});
  const player = useRef<AssistantPlayerHandle | null>(null);
  const mounted = useRef(false);
  const latest = useRef({ video, options });
  latest.current = { video, options };
  const state = useRef<{ id?: string; time?: number; played: boolean; events: boolean; moment: StuckMoment | null }>({ played: false, events: false, moment: null });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const getCurrentTime = useCallback(() => latest.current.options.currentTime ?? player.current?.currentTime ?? state.current.time ?? 0, []);
  const onSeek = useCallback((seconds: number, interactionId?: string | null) => {
    if (latest.current.options.onSeek) latest.current.options.onSeek(seconds, interactionId);
    else if (player.current) {
      player.current.currentTime = seconds;
      void player.current.play().catch(() => {});
    }
  }, []);
  const publish = useCallback(() => {
    const { video } = latest.current;
    if (!video) return;
    const registration: AssistantVideo = {
      videoId: video.id, canonicalVideoId: video.canonicalVideoId, title: video.title,
      chapters: video.chapters, conversationStarters: video.conversationStarters,
      currentTime: state.current.time, getCurrentTime,
      onSeek: latest.current.options.onSeek || player.current ? onSeek : undefined,
      playing: player.current ? !player.current.paused : undefined, moment: state.current.moment,
    };
    store.set(registration, owner.current);
  }, [store, getCurrentTime, onSeek]);
  const update = useCallback(() => {
    clearTimeout(timer.current);
    const seconds = getCurrentTime();
    const s = state.current;
    if (s.time !== undefined) {
      const moved = momentAfterMove(s.moment, s.time, seconds);
      s.moment = moved.moment;
      if (!s.events) s.played ||= moved.played;
    }
    s.time = seconds;
    publish();
    if (!s.events) timer.current = setTimeout(() => {
      s.moment = momentAfterStandingStill(s.moment, seconds, s.played);
      publish();
    }, PAUSE_AFTER_MS);
  }, [getCurrentTime, publish]);
  const props = useMemo(() => ({
    onTimeUpdate: () => update(),
    onPlay: () => {
      state.current.events = true;
      state.current.played = true;
      if (state.current.moment?.kind === "paused") state.current.moment = null;
      update();
    },
    onPause: () => {
      state.current.events = true;
      update();
      state.current.moment = momentAfterStandingStill(state.current.moment, getCurrentTime(), state.current.played);
      publish();
    },
  }), [update, getCurrentTime, publish]);
  const ref: RefCallback<AssistantPlayerHandle> = useCallback(value => {
    player.current = value;
    // A child player can mount without rendering this hook's owner again.
    queueMicrotask(() => { if (mounted.current) publish(); });
  }, [publish]);
  useEffect(() => {
    if (state.current.id !== video?.id) {
      clearTimeout(timer.current);
      state.current = { id: video?.id, played: false, events: false, moment: null };
    }
    if (video) {
      if (options.currentTime !== undefined && options.currentTime !== state.current.time) update();
      else publish();
    }
  });
  useEffect(() => {
    const token = owner.current;
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); store.release(token); };
  }, [store, video?.id]);
  return { props, ref };
}

/** Put this in every route or Suspense fallback on the way to a video page. */
export function AssistantVideoPending() {
  const store = useContext(VideoContext);
  if (!store) throw new Error("Use AssistantProvider above AssistantVideoPending.");
  useEffect(() => { store.beginPending(); return () => store.endPending(); }, [store]);
  return null;
}

/** The chapter containing a position, from the video's WebVTT chapters. */
export function assistantChapterAt(chapters: string | null | undefined, seconds: number): string {
  for (const block of (chapters ?? "").split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/);
    const index = lines.findIndex(line => line.includes("-->"));
    if (index < 0) continue;
    const times = lines[index].split("-->").map(value => value.trim().split(/\s/)[0].split(":").reduce((n, part) => n * 60 + Number(part), 0));
    if (seconds >= times[0] && seconds < times[1]) return lines.slice(index + 1).join(" ");
  }
  return "";
}
