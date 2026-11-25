import { describe, expect, it } from "vitest";
import { failureReason, mp4FallbackUrl, shouldFallBackToMp4 } from "./fallback";

describe("mp4FallbackUrl", () => {
  it("uses the static rendition the Bold API returns", () => {
    expect(
      mp4FallbackUrl({ id: "v", playbackId: "abc", downloadUrls: { legacyMp4: "https://cdn.example/v.mp4" } })
    ).toBe("https://cdn.example/v.mp4");
  });

  it("derives it from the playback ID when the API did not return one", () => {
    expect(mp4FallbackUrl({ id: "v", playbackId: "abc" })).toBe("https://stream.mux.com/abc/highest.mp4");
  });

  it("carries a signed playback token, once", () => {
    expect(mp4FallbackUrl({ id: "v", playbackId: "abc", playbackToken: "t.k.n" })).toBe(
      "https://stream.mux.com/abc/highest.mp4?token=t.k.n"
    );
    expect(
      mp4FallbackUrl({
        id: "v",
        playbackToken: "t.k.n",
        downloadUrls: { legacyMp4: "https://stream.mux.com/abc/highest.mp4?token=already" },
      })
    ).toBe("https://stream.mux.com/abc/highest.mp4?token=already");
  });

  it("is undefined for a video with neither", () => {
    expect(mp4FallbackUrl({ id: "v", streamUrl: "https://cdn.example/v.m3u8" })).toBeUndefined();
  });
});

describe("shouldFallBackToMp4", () => {
  const hlsError = (status?: number, details = "manifestLoadError") => ({
    code: 2,
    data: { details, response: status === undefined ? undefined : { code: status } },
  });

  it.each([500, 502, 503, 504, 404, 0])("falls back on HTTP %i", (status) => {
    expect(shouldFallBackToMp4(hlsError(status))).toBe(true);
  });

  it("falls back when there is no HTTP response at all (timeout, parse error)", () => {
    expect(shouldFallBackToMp4(hlsError(undefined, "manifestLoadTimeOut"))).toBe(true);
    expect(shouldFallBackToMp4(hlsError(undefined, "manifestParsingError"))).toBe(true);
  });

  it("falls back on a native media error, which carries no HTTP detail", () => {
    expect(shouldFallBackToMp4({ code: 4 })).toBe(true);
    expect(shouldFallBackToMp4({ code: 3 })).toBe(true);
  });

  it.each([401, 403])("does not fall back on HTTP %i (token rejected)", (status) => {
    expect(shouldFallBackToMp4(hlsError(status))).toBe(false);
  });

  it("does not fall back when the viewer aborted the load", () => {
    expect(shouldFallBackToMp4({ code: 1 })).toBe(false);
  });
});

describe("failureReason", () => {
  it("names the hls.js failure, else the media error code", () => {
    expect(failureReason({ code: 2, data: { details: "fragLoadError" } })).toBe("fragLoadError");
    expect(failureReason({ code: 4 })).toBe("media-error-4");
    expect(failureReason({})).toBe("stream-error");
  });
});
