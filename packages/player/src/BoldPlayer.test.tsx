import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoldPlayerHandle, BoldPlayerProps, BoldPlayerVideo } from "./types";

// Video.js is replaced by stand-ins that record what the player hands it.
// How the real thing behaves is covered by the browser runs in proof/.
const h = vi.hoisted(() => ({
  mediaProps: null as null | Record<string, unknown>,
  playerProps: null as null | Record<string, unknown>,
  skinProps: null as null | Record<string, unknown>,
  media: null as unknown as HTMLVideoElement,
  // The player's media object: where stream errors are reported.
  host: Object.assign(new EventTarget(), { error: null as unknown }),
  dismissError: vi.fn(),
}));

vi.mock("@videojs/react", () => ({
  useMedia: () => h.host,
  isMediaErrorCapable: (media: object) => "error" in media,
}));

vi.mock("@videojs/react/video", async () => {
  const React = await import("react");
  return {
    VideoPlayer: ({ children, ...props }: { children: ReactNode }) => {
      h.playerProps = props;
      return React.createElement(React.Fragment, null, children);
    },
    VideoSkin: ({ children, ...props }: { children: ReactNode }) => {
      h.skinProps = props;
      return React.createElement("div", null, children);
    },
    usePlayer: (selector: (state: { dismissError: () => void }) => unknown) =>
      selector({ dismissError: h.dismissError }),
  };
});

vi.mock("@videojs/react/media/mux-video/hls-js", async () => {
  const React = await import("react");
  return {
    MuxVideo: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
      h.mediaProps = props;
      React.useEffect(() => {
        const ref = props.ref as (media: HTMLVideoElement | null) => void;
        ref(h.media);
        return () => ref(null);
      }, [props.ref]);
      return React.createElement("div", { "data-media": "" }, children);
    },
  };
});

import { BoldPlayer } from "./BoldPlayer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIDEO: BoldPlayerVideo = {
  id: "video-1",
  title: "Lesson one",
  duration: 120,
  playbackId: "playback-1",
  thumbnail: "https://img.example/poster.png",
};
const MP4 = "https://stream.mux.com/playback-1/highest.mp4";

describe("BoldPlayer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    h.mediaProps = h.playerProps = h.skinProps = null;
    h.dismissError.mockReset();
    h.host.error = null;
    h.media = document.createElement("video");
    streamTextTracks([]);
    // A fallback logs a warning by design; keep it out of the test output.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    act(() => root.unmount());
    container.remove();
  });

  function renderPlayer(props: Partial<BoldPlayerProps> & { ref?: React.Ref<BoldPlayerHandle> } = {}) {
    act(() => root.render(<BoldPlayer video={VIDEO} {...props} />));
  }

  const source = () => h.mediaProps?.source as Record<string, unknown>;

  function fire(handler: string, type: string) {
    const nativeEvent = new Event(type);
    Object.defineProperty(nativeEvent, "target", { value: h.media });
    act(() => (h.mediaProps as Record<string, (e: unknown) => void>)[handler]({ nativeEvent }));
  }

  function setMediaState(state: { currentTime: number; paused: boolean; readyState?: number }) {
    for (const [key, value] of Object.entries(state)) {
      Object.defineProperty(h.media, key, { configurable: true, writable: true, value });
    }
  }

  // The text tracks the stream itself brought, as the element would list them.
  // (jsdom has no TextTrackList, so every test gets one.)
  function streamTextTracks(kinds: string[]) {
    const tracks = Object.assign(new EventTarget(), {
      [Symbol.iterator]: () => kinds.map((kind) => ({ kind }))[Symbol.iterator](),
    });
    Object.defineProperty(h.media, "textTracks", { configurable: true, value: tracks });
  }

  function failStream(error: unknown) {
    h.host.error = error;
    act(() => {
      h.host.dispatchEvent(new Event("error"));
    });
  }

  describe("source", () => {
    it("plays the video's stream by playback ID, with its poster", () => {
      renderPlayer();
      expect(source()).toMatchObject({ playbackId: "playback-1" });
      expect(source().playback).toBeUndefined();
      expect(h.playerProps?.poster).toBe("https://img.example/poster.png");
      expect(h.playerProps?.title).toBe("");
    });

    it("shows the video's title when asked", () => {
      renderPlayer({ showTitle: true });
      expect(h.playerProps?.title).toBe("Lesson one");
    });

    it("passes signed-playback tokens through", () => {
      renderPlayer({ video: { ...VIDEO, playbackToken: "play.tok", storyboardToken: "story.tok" } });
      expect(source()).toMatchObject({
        playbackId: "playback-1",
        playback: { token: "play.tok" },
        storyboard: { token: "story.tok" },
      });
    });

    it("plays a stream URL when the video has no playback ID", () => {
      renderPlayer({ video: { id: "v", streamUrl: "https://cdn.example/v.m3u8" } });
      expect(source()).toMatchObject({ src: "https://cdn.example/v.m3u8" });
    });

    it("renders nothing for a video with no stream", () => {
      renderPlayer({ video: { id: "v" } });
      expect(container.innerHTML).toBe("");
    });

    it("gives up waiting for a manifest that never answers", () => {
      renderPlayer();
      const engine = source().engine as { hlsJs: { manifestLoadPolicy: { default: { maxTimeToFirstByteMs: number } } } };
      expect(engine.hlsJs.manifestLoadPolicy.default.maxTimeToFirstByteMs).toBe(8000);
    });
  });

  describe("chapters, captions, colour", () => {
    const withTracks: BoldPlayerVideo = {
      ...VIDEO,
      chapters: "WEBVTT\n\n00:00:00.000 --> 00:01:00.000\nIntro",
      subtitles: { url: "https://cdn.example/en.vtt", label: "English", language: "en_us" },
    };

    const subtitlesTrack = () => container.querySelector('track[kind="subtitles"]');

    it("adds the video's chapters as a track", () => {
      renderPlayer({ video: withTracks });
      expect(container.querySelector('track[kind="chapters"]')?.getAttribute("src")).toMatch(/^data:text\/vtt/);
    });

    it("adds the video's subtitles when the stream has no captions of its own", () => {
      streamTextTracks(["metadata", "chapters"]);
      renderPlayer({ video: withTracks });
      expect(subtitlesTrack()).toBeNull(); // not known yet

      fire("onLoadedMetadata", "loadedmetadata");

      expect(subtitlesTrack()?.getAttribute("src")).toBe("https://cdn.example/en.vtt");
      expect(subtitlesTrack()?.getAttribute("srclang")).toBe("en-US");
      expect(subtitlesTrack()?.getAttribute("label")).toBe("English");
    });

    it("does not list captions twice when the stream already has them", () => {
      streamTextTracks(["metadata", "subtitles"]);
      renderPlayer({ video: withTracks });
      fire("onLoadedMetadata", "loadedmetadata");

      expect(subtitlesTrack()).toBeNull();
    });

    it("loads the video's subtitles on the MP4, which has none inside it", () => {
      streamTextTracks(["subtitles"]);
      renderPlayer({ video: withTracks });
      fire("onLoadedMetadata", "loadedmetadata");
      setMediaState({ currentTime: 0, paused: true });

      failStream({ code: 2, data: { response: { code: 503 } } });

      expect(subtitlesTrack()?.getAttribute("src")).toBe("https://cdn.example/en.vtt");
    });

    it("keeps captions on across the switch if the viewer had them on", () => {
      const tracks = Object.assign(new EventTarget(), {
        [Symbol.iterator]: () => [{ kind: "subtitles", mode: "showing" }][Symbol.iterator](),
      });
      Object.defineProperty(h.media, "textTracks", { configurable: true, value: tracks });
      // jsdom has no TextTrack behind a <track>; give the element one.
      const track = { mode: "disabled" };
      Object.defineProperty(HTMLTrackElement.prototype, "track", { configurable: true, get: () => track });
      renderPlayer({ video: withTracks });
      fire("onLoadedMetadata", "loadedmetadata");
      setMediaState({ currentTime: 30, paused: false });

      failStream({ code: 2, data: { response: { code: 503 } } });

      expect(track.mode).toBe("showing");
      delete (HTMLTrackElement.prototype as { track?: unknown }).track;
    });

    it("leaves them out when asked", () => {
      streamTextTracks([]);
      renderPlayer({ video: withTracks, chapters: false, captions: false });
      fire("onLoadedMetadata", "loadedmetadata");
      expect(container.querySelector("track")).toBeNull();
    });

    it("sets the accent colour on the skin, alongside the caller's style", () => {
      renderPlayer({ accentColor: "#ff5500", style: { maxWidth: 640 }, className: "mine" });
      expect(h.skinProps?.style).toEqual({ "--media-accent-color": "#ff5500", maxWidth: 640 });
      expect(h.skinProps?.className).toBe("bold-player mine");
    });
  });

  describe("branding and settings", () => {
    const settings = {
      logoUrl: "https://cdn.example/logo-light.png",
      logoDarkUrl: "https://cdn.example/logo-dark.png",
      account: { name: "Acme Academy" },
      themeConfig: { light: { accent: "#111111" }, dark: { accent: "#f59e0b" } },
    };
    const brand = () => container.querySelector(".bold-player-brand");
    const accent = () => (h.skinProps?.style as Record<string, string> | undefined)?.["--media-accent-color"];

    it("carries no logo by default", () => {
      renderPlayer();
      expect(brand()).toBeNull();
      expect(accent()).toBeUndefined();
    });

    it("takes its accent colour from the account's settings", () => {
      renderPlayer({ settings });
      expect(accent()).toBe("#f59e0b");
      expect(brand()).toBeNull();
    });

    it("shows Bold's wordmark and accent when branded as Bold", () => {
      renderPlayer({ branding: "bold", settings });
      expect(brand()?.querySelector("svg")?.getAttribute("aria-label")).toBe("Bold");
      expect(accent()).toBe("#41c6a6");
    });

    it("shows the account's own logo when branded as the account", () => {
      renderPlayer({ branding: "account", settings });
      const logo = brand()?.querySelector("img");
      expect(logo?.getAttribute("src")).toBe("https://cdn.example/logo-dark.png");
      expect(logo?.getAttribute("alt")).toBe("Acme Academy");
      expect(accent()).toBe("#f59e0b");
    });

    it("shows no logo for an account that has none, never Bold's", () => {
      renderPlayer({ branding: "account", settings: { themeConfig: settings.themeConfig } });
      expect(brand()).toBeNull();
    });

    it("lets the settings switch branding on, and the prop override them", () => {
      renderPlayer({ settings: { ...settings, player: { branding: "bold" } } });
      expect(brand()).not.toBeNull();

      renderPlayer({ settings: { ...settings, player: { branding: "bold" } }, branding: "none" });
      expect(brand()).toBeNull();
    });

    it("lets accentColor win over everything", () => {
      renderPlayer({ branding: "bold", settings, accentColor: "#ff0000" });
      expect(accent()).toBe("#ff0000");
    });

    it("hides chapters when the account's settings say so, unless asked", () => {
      const video = { ...VIDEO, chapters: "WEBVTT\n\n00:00:00.000 --> 00:01:00.000\nIntro" };
      const hidden = { portal: { display: { showChapters: false } } };
      renderPlayer({ video, settings: hidden });
      expect(container.querySelector('track[kind="chapters"]')).toBeNull();

      renderPlayer({ video, settings: hidden, chapters: true });
      expect(container.querySelector('track[kind="chapters"]')).not.toBeNull();
    });
  });

  describe("analytics", () => {
    it("reports load, play, progress and pause to the Bold client", () => {
      const trackEvent = vi.fn();
      renderPlayer({ bold: { trackEvent } });

      fire("onLoadedMetadata", "loadedmetadata");
      fire("onPlay", "play");
      fire("onTimeUpdate", "timeupdate");
      fire("onPause", "pause");

      expect(trackEvent.mock.calls.map(([, event]) => event.type)).toEqual([
        "loadedmetadata",
        "play",
        "timeupdate",
        "pause",
      ]);
      expect(trackEvent).toHaveBeenLastCalledWith(VIDEO, expect.any(Event));
    });

    it("reports one load per video, not a second one when the MP4 loads", () => {
      const trackEvent = vi.fn();
      renderPlayer({ bold: { trackEvent } });
      setMediaState({ currentTime: 0, paused: true });

      fire("onLoadedMetadata", "loadedmetadata");
      failStream({ code: 2, data: { response: { code: 503 } } });
      fire("onLoadedMetadata", "loadedmetadata");

      expect(trackEvent.mock.calls.filter(([, e]) => e.type === "loadedmetadata")).toHaveLength(1);
    });

    it("plays without a Bold client", () => {
      renderPlayer();
      expect(() => fire("onPlay", "play")).not.toThrow();
    });
  });

  describe("start position and playback speed", () => {
    it("starts at startTime and at the video's default speed", () => {
      renderPlayer({ startTime: 40, video: { ...VIDEO, playbackSpeed: 1.25 } });
      setMediaState({ currentTime: 0, paused: true });

      fire("onLoadedMetadata", "loadedmetadata");

      expect(h.media.currentTime).toBe(40);
      expect(h.media.playbackRate).toBe(1.25);
    });

    it("seeks when startTime changes later", () => {
      renderPlayer({ startTime: 40 });
      setMediaState({ currentTime: 40, paused: false, readyState: 4 });

      renderPlayer({ startTime: 95 });

      expect(h.media.currentTime).toBe(95);
    });
  });

  describe("ref", () => {
    it("is shaped like a media element", () => {
      const ref = createRef<BoldPlayerHandle>();
      renderPlayer({ ref });
      setMediaState({ currentTime: 12, paused: false, readyState: 4 });

      expect(ref.current?.media).toBe(h.media);
      expect(ref.current?.currentTime).toBe(12);
      expect(ref.current?.paused).toBe(false);

      ref.current!.currentTime = 30;
      expect(h.media.currentTime).toBe(30);
    });

    it("holds a seek made before the video has loaded", () => {
      const ref = createRef<BoldPlayerHandle>();
      renderPlayer({ ref });
      setMediaState({ currentTime: 0, paused: true, readyState: 0 });

      ref.current!.currentTime = 75;
      expect(h.media.currentTime).toBe(0);

      fire("onLoadedMetadata", "loadedmetadata");
      expect(h.media.currentTime).toBe(75);
    });

    it("delivers events to listeners, and stops after removal", () => {
      const ref = createRef<BoldPlayerHandle>();
      renderPlayer({ ref });
      const listener = vi.fn();

      ref.current!.addEventListener("timeupdate", listener);
      h.media.dispatchEvent(new Event("timeupdate"));
      ref.current!.removeEventListener("timeupdate", listener);
      h.media.dispatchEvent(new Event("timeupdate"));

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("MP4 fallback", () => {
    it("moves to the MP4 on a fatal stream error, clears the error, and says so", () => {
      const onFallback = vi.fn();
      renderPlayer({ onFallback });
      setMediaState({ currentTime: 0, paused: true });

      failStream({ code: 2, data: { details: "manifestLoadError", response: { code: 503 } } });

      expect(source()).toEqual({ src: MP4, type: "video/mp4" });
      expect(h.dismissError).toHaveBeenCalled();
      expect(onFallback).toHaveBeenCalledExactlyOnceWith({ reason: "manifestLoadError", resumeAt: 0 });
    });

    it("resumes the MP4 where the viewer was, at their speed, and keeps playing", () => {
      renderPlayer();
      setMediaState({ currentTime: 312.5, paused: false });
      h.media.playbackRate = 1.5;
      const play = vi.fn().mockResolvedValue(undefined);
      h.media.play = play;

      failStream({ code: 2, data: { details: "fragLoadError", response: { code: 503 } } });
      // The element resets on a new source.
      setMediaState({ currentTime: 0, paused: true });
      h.media.playbackRate = 1;
      fire("onLoadedMetadata", "loadedmetadata");

      expect(h.media.currentTime).toBe(312.5);
      expect(h.media.playbackRate).toBe(1.5);
      expect(play).toHaveBeenCalledTimes(1);
    });

    it("does not start the MP4 if the viewer had not pressed play", () => {
      renderPlayer({ startTime: 40 });
      setMediaState({ currentTime: 0, paused: true });
      const play = vi.fn().mockResolvedValue(undefined);
      h.media.play = play;

      failStream({ code: 2, data: { response: { code: 503 } } });
      fire("onLoadedMetadata", "loadedmetadata");

      expect(h.media.currentTime).toBe(40);
      expect(play).not.toHaveBeenCalled();
    });

    it("stays on the stream when the playback token is rejected", () => {
      renderPlayer();
      failStream({ code: 2, data: { response: { code: 403 } } });

      expect(source()).toMatchObject({ playbackId: "playback-1" });
      expect(h.dismissError).not.toHaveBeenCalled();
    });

    it("leaves an error from the MP4 itself for the viewer to see", () => {
      renderPlayer();
      failStream({ code: 2, data: { response: { code: 503 } } });
      h.dismissError.mockClear();

      failStream({ code: 4 });

      expect(source()).toEqual({ src: MP4, type: "video/mp4" });
      expect(h.dismissError).not.toHaveBeenCalled();
    });

    it("signs the MP4 with the video's playback token", () => {
      renderPlayer({ video: { ...VIDEO, playbackToken: "play.tok" } });
      failStream({ code: 2, data: { response: { code: 503 } } });

      expect(source().src).toBe(`${MP4}?token=play.tok`);
    });

    it("can be switched off", () => {
      renderPlayer({ mp4Fallback: false });
      failStream({ code: 2, data: { response: { code: 503 } } });

      expect(source()).toMatchObject({ playbackId: "playback-1" });
      expect(h.dismissError).not.toHaveBeenCalled();
    });

    it("starts the next video on its stream again", () => {
      renderPlayer();
      failStream({ code: 2, data: { response: { code: 503 } } });
      expect(source().src).toBe(MP4);

      renderPlayer({ video: { ...VIDEO, id: "video-2", playbackId: "playback-2" } });

      expect(source()).toMatchObject({ playbackId: "playback-2" });
    });
  });
});
