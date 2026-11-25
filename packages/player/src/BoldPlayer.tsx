import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { isMediaErrorCapable, useMedia } from "@videojs/react";
import { VideoPlayer, VideoSkin, usePlayer } from "@videojs/react/video";
// The hls.js engine by name: the fallback reads hls.js error detail, and
// hls.js is the engine that still plays on iPhones before iOS 17.1.
import { MuxVideo, type MuxVideoProps } from "@videojs/react/media/mux-video/hls-js";
import {
  MANIFEST_LOAD_POLICY,
  failureReason,
  mp4FallbackUrl,
  shouldFallBackToMp4,
  type StreamErrorLike,
} from "./fallback";
import { BrandMark, resolveAccent } from "./brand";
import { chaptersTrackSrc, trackLanguage } from "./tracks";
import type { BoldPlayerHandle, BoldPlayerProps, BoldPlayerVideo } from "./types";

type Source = NonNullable<MuxVideoProps["source"]>;

const ENGINE: Source["engine"] = {
  hlsJs: { manifestLoadPolicy: MANIFEST_LOAD_POLICY },
};

/** The video's HLS stream as a Video.js source, or `null` when it has none. */
function streamSource(video: BoldPlayerVideo): Source | null {
  if (video.playbackId) {
    return {
      playbackId: video.playbackId,
      ...(video.playbackToken ? { playback: { token: video.playbackToken } } : {}),
      ...(video.storyboardToken ? { storyboard: { token: video.storyboardToken } } : {}),
      engine: ENGINE,
    };
  }
  return video.streamUrl ? { src: video.streamUrl, engine: ENGINE } : null;
}

/** Where the viewer was when the stream died, so the MP4 picks up from there. */
interface Mp4Fallback {
  /** The stream that failed. A fallback never carries over to another video. */
  streamKey: string;
  resumeAt: number;
  resumePlaying: boolean;
  playbackRate: number;
  /** The viewer had captions switched on. */
  captionsOn: boolean;
}

/**
 * Watches the player for a fatal stream error. Rendered inside the player
 * because that is where its media and error state live.
 *
 * It listens on the media itself, not on the error in player state, so it can
 * clear the error before React renders it. The skin then never opens its
 * error dialog for a failure the MP4 is about to recover.
 */
function StreamFailureWatch({
  streamKey,
  armed,
  onFailure,
}: {
  streamKey: string;
  armed: boolean;
  onFailure: (error: StreamErrorLike) => void;
}) {
  const media = useMedia();
  const dismissError = usePlayer((state) => state.dismissError);
  // The stream this watch has already failed over from. Set synchronously:
  // the effect below is torn down a moment after the switch, and an error
  // from the MP4 in that gap must reach the viewer, not be cleared.
  const failedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!armed || !media || !isMediaErrorCapable(media)) return;
    const onError = () => {
      const error = media.error as StreamErrorLike | null;
      if (failedKey.current === streamKey) return;
      if (!error || !shouldFallBackToMp4(error)) return;
      failedKey.current = streamKey;
      // The player records the error in its own listener for this same event,
      // which may run before or after this one. Clear it now for the first
      // case and in a microtask for the second; both land before React renders.
      dismissError();
      queueMicrotask(dismissError);
      onFailure(error);
    };
    // The media object is an EventTarget; its typings list only a few events.
    const target = media as unknown as EventTarget;
    target.addEventListener("error", onError);
    return () => target.removeEventListener("error", onError);
  }, [armed, media, streamKey, dismissError, onFailure]);

  return null;
}

/**
 * The Bold video player. Give it a video from bold-js and it plays the HLS
 * stream with the video's poster, chapters and captions, reports playback to
 * Bold when given a client, and continues from the static MP4 if the stream
 * cannot be loaded.
 */
export const BoldPlayer = forwardRef<BoldPlayerHandle, BoldPlayerProps>(
  function BoldPlayer(
    {
      video,
      bold,
      autoPlay = false,
      startTime,
      settings,
      branding = settings?.player?.branding ?? "none",
      accentColor,
      showTitle = false,
      poster,
      captions = true,
      chapters = settings?.portal?.display?.showChapters ?? true,
      mp4Fallback = true,
      className,
      style,
      onLoadedMetadata,
      onPlay,
      onPause,
      onTimeUpdate,
      onEnded,
      onFallback,
    },
    ref
  ) {
    const mediaRef = useRef<HTMLVideoElement | null>(null);
    const pendingSeek = useRef<number>(startTime ?? 0);
    const listeners = useRef(new Map<string, Set<EventListener>>());
    const loadTrackedFor = useRef<string | null>(null);
    const ownCaptions = useRef<HTMLTrackElement | null>(null);
    const [fallback, setFallback] = useState<Mp4Fallback | null>(null);
    // Whether the stream brought captions of its own, per stream; unknown until it loads.
    const [streamCaptions, setStreamCaptions] = useState<{ streamKey: string; present: boolean } | null>(null);

    const hls = streamSource(video);
    const mp4Url = mp4Fallback ? mp4FallbackUrl(video) : undefined;
    const streamKey = `${video.id}|${video.playbackId ?? video.streamUrl ?? ""}`;
    const activeFallback = fallback?.streamKey === streamKey ? fallback : null;

    // Callers pass a fresh `video` object and fresh callbacks on most renders.
    // Reading them through a ref keeps the handlers below stable.
    const latest = useRef({ video, bold, onFallback });
    latest.current = { video, bold, onFallback };

    const attachMedia = useCallback((el: HTMLVideoElement | null) => {
      const previous = mediaRef.current;
      if (previous === el) return;
      for (const [type, set] of listeners.current) {
        for (const listener of set) {
          previous?.removeEventListener(type, listener);
          el?.addEventListener(type, listener);
        }
      }
      mediaRef.current = el;
    }, []);

    useImperativeHandle(
      ref,
      (): BoldPlayerHandle => ({
        get media() {
          return mediaRef.current;
        },
        get currentTime() {
          return mediaRef.current?.currentTime ?? 0;
        },
        set currentTime(seconds: number) {
          const el = mediaRef.current;
          if (el && el.readyState >= 1) el.currentTime = seconds;
          else pendingSeek.current = seconds;
        },
        get duration() {
          return mediaRef.current?.duration ?? 0;
        },
        get paused() {
          return mediaRef.current?.paused ?? true;
        },
        get readyState() {
          return mediaRef.current?.readyState ?? 0;
        },
        play: async () => {
          await mediaRef.current?.play();
        },
        pause: () => mediaRef.current?.pause(),
        addEventListener(type, listener) {
          let set = listeners.current.get(type);
          if (!set) listeners.current.set(type, (set = new Set()));
          set.add(listener);
          mediaRef.current?.addEventListener(type, listener);
        },
        removeEventListener(type, listener) {
          listeners.current.get(type)?.delete(listener);
          mediaRef.current?.removeEventListener(type, listener);
        },
      }),
      []
    );

    // Bold's subtitles are usually in the stream already. Adding them again
    // would list every language twice, so the video's own subtitle file is
    // only loaded when the stream has none, or when playing the MP4.
    const noteStreamCaptions = useCallback(() => {
      const el = mediaRef.current;
      if (!el) return;
      const present = Array.from(el.textTracks).some(
        (track) =>
          (track.kind === "subtitles" || track.kind === "captions") &&
          track !== ownCaptions.current?.track
      );
      setStreamCaptions((current) =>
        current?.streamKey === streamKey && current.present === present
          ? current
          : { streamKey, present }
      );
    }, [streamKey]);

    // Some engines add the stream's captions a moment after it has loaded.
    useEffect(() => {
      const tracks = mediaRef.current?.textTracks;
      if (!tracks || activeFallback || streamCaptions?.streamKey !== streamKey) return;
      tracks.addEventListener("addtrack", noteStreamCaptions);
      return () => tracks.removeEventListener("addtrack", noteStreamCaptions);
    }, [activeFallback, streamCaptions, streamKey, noteStreamCaptions]);

    // Captions the viewer had on stay on: the MP4's captions are a different
    // track from the stream's, so switch the new one on once, as it appears.
    useEffect(() => {
      if (activeFallback?.captionsOn && ownCaptions.current) {
        ownCaptions.current.track.mode = "showing";
      }
    }, [activeFallback]);

    // A later start position from the page, such as a citation click.
    const firstStartTime = useRef(true);
    useEffect(() => {
      if (firstStartTime.current) {
        firstStartTime.current = false;
        return;
      }
      if (startTime === undefined) return;
      const el = mediaRef.current;
      if (el && el.readyState >= 1) el.currentTime = startTime;
      else pendingSeek.current = startTime;
    }, [startTime]);

    const track = useCallback((event: Event) => {
      const { video, bold } = latest.current;
      bold?.trackEvent(video, event);
    }, []);

    const handleStreamFailure = useCallback(
      (error: StreamErrorLike) => {
        const el = mediaRef.current;
        // Read before the source changes: swapping it resets the element.
        const resumeAt = el?.currentTime ?? 0;
        setFallback({
          streamKey,
          resumeAt,
          resumePlaying: el ? !el.paused && !el.ended : false,
          playbackRate: el?.playbackRate ?? 1,
          captionsOn: el
            ? Array.from(el.textTracks).some(
                (track) =>
                  (track.kind === "subtitles" || track.kind === "captions") &&
                  track.mode === "showing"
              )
            : false,
        });
        const reason = failureReason(error);
        console.warn("[bold-player] stream failed, continuing from MP4", {
          videoId: latest.current.video.id,
          reason,
        });
        latest.current.onFallback?.({ reason, resumeAt });
      },
      [streamKey]
    );

    const handleLoadedMetadata = (event: Event) => {
      const el = mediaRef.current;
      if (!el) return;
      // One load per video: the MP4 loading after a fallback is the same view.
      if (loadTrackedFor.current !== video.id) {
        loadTrackedFor.current = video.id;
        track(event);
      }
      if (!activeFallback) noteStreamCaptions();
      if (activeFallback) {
        el.playbackRate = activeFallback.playbackRate;
      } else if (video.playbackSpeed && video.playbackSpeed > 0) {
        el.playbackRate = video.playbackSpeed;
      }
      const seekTo = activeFallback?.resumeAt || pendingSeek.current;
      pendingSeek.current = 0;
      if (seekTo > 0) el.currentTime = seekTo;
      if (activeFallback?.resumePlaying) {
        void el.play().catch(() => {
          // The browser refused to resume without a gesture; the play button stays.
        });
      }
      onLoadedMetadata?.(event);
    };

    if (!hls) return null;

    const source: Source =
      activeFallback && mp4Url ? { src: mp4Url, type: "video/mp4" } : hls;
    const accent = resolveAccent(accentColor, settings, branding);
    const chaptersSrc = chapters ? chaptersTrackSrc(video) : undefined;
    const streamHasNoCaptions =
      streamCaptions?.streamKey === streamKey && !streamCaptions.present;
    const subtitles =
      captions && (activeFallback || streamHasNoCaptions) ? video.subtitles : undefined;

    return (
      // The skin shows the player's title over the video. An explicit one,
      // even an empty one, also keeps the name the asset has inside Mux from
      // surfacing there.
      <VideoPlayer
        title={showTitle ? (video.title ?? "") : ""}
        poster={poster ?? video.thumbnail ?? undefined}
      >
        <StreamFailureWatch
          streamKey={streamKey}
          armed={Boolean(mp4Url) && !activeFallback}
          onFailure={handleStreamFailure}
        />
        <VideoSkin
          className={className ? `bold-player ${className}` : "bold-player"}
          style={
            accent
              ? ({ "--media-accent-color": accent, ...style } as CSSProperties)
              : style
          }
        >
          <MuxVideo
            ref={attachMedia}
            source={source}
            autoPlay={autoPlay}
            playsInline
            crossOrigin="anonymous"
            fallback={null}
            onLoadedMetadata={(e) => handleLoadedMetadata(e.nativeEvent)}
            onPlay={(e) => {
              track(e.nativeEvent);
              onPlay?.(e.nativeEvent);
            }}
            onPause={(e) => {
              track(e.nativeEvent);
              onPause?.(e.nativeEvent);
            }}
            onTimeUpdate={(e) => {
              track(e.nativeEvent);
              onTimeUpdate?.(e.nativeEvent);
            }}
            onEnded={(e) => onEnded?.(e.nativeEvent)}
          >
            {chaptersSrc && <track kind="chapters" src={chaptersSrc} default />}
            {subtitles?.url && (
              <track
                ref={ownCaptions}
                kind="subtitles"
                src={subtitles.url}
                srcLang={trackLanguage(subtitles.language)}
                label={subtitles.label || "Captions"}
              />
            )}
          </MuxVideo>
          <BrandMark branding={branding} settings={settings} />
        </VideoSkin>
      </VideoPlayer>
    );
  }
);
