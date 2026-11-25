import { describe, expect, it } from "vitest";
import { chaptersTrackSrc, trackLanguage } from "./tracks";

describe("chaptersTrackSrc", () => {
  it("inlines the video's WebVTT chapters", () => {
    const src = chaptersTrackSrc({ id: "v", chapters: "WEBVTT\n\n00:00:00.000 --> 00:01:00.000\nIntro" });
    expect(src).toMatch(/^data:text\/vtt;charset=utf-8,WEBVTT/);
    expect(decodeURIComponent(src!)).toContain("Intro");
  });

  it("uses the chapters URL when there is no text", () => {
    expect(chaptersTrackSrc({ id: "v", chaptersUrl: "https://bold.example/chapters" })).toBe(
      "https://bold.example/chapters"
    );
  });

  it("is undefined without chapters, or with text that is not WebVTT", () => {
    expect(chaptersTrackSrc({ id: "v" })).toBeUndefined();
    expect(chaptersTrackSrc({ id: "v", chapters: "00:00 Intro" })).toBeUndefined();
  });
});

describe("trackLanguage", () => {
  it("turns Bold's language codes into BCP 47 tags", () => {
    expect(trackLanguage("en_us")).toBe("en-US");
    expect(trackLanguage("de")).toBe("de");
    expect(trackLanguage(null)).toBe("en");
  });
});
