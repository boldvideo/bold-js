// The page the proof run opens: the built package, exactly as an app would
// import it, playing whatever the run passes in.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BoldPlayer, type BoldPlayerVideo } from "../dist/index.js";
import "../dist/styles.css";

const params = new URLSearchParams(location.search);
const subs = params.get("subs");
const video: BoldPlayerVideo = {
  id: "proof-video",
  title: "Proof video",
  subtitles: subs ? { url: subs, label: "English", language: "en_us" } : null,
  ...(params.get("id")
    ? { playbackId: params.get("id") }
    : { streamUrl: params.get("hls"), downloadUrls: { legacyMp4: params.get("mp4") } }),
};

// Stands in for a bold-js client: same method, posts where the proxy logs it.
const bold = {
  trackEvent(v: BoldPlayerVideo, event: Event) {
    const t = (event.target as HTMLMediaElement | null)?.currentTime ?? 0;
    navigator.sendBeacon("/api/bold/analytics", JSON.stringify({ n: event.type, vid: v.id, time: Math.round(t) }));
  },
};

function App() {
  const [status, setStatus] = useState("source: HLS");
  return (
    <>
      <BoldPlayer
        video={video}
        bold={bold}
        accentColor={params.get("accent") ?? undefined}
        branding={(params.get("branding") as "bold" | "account" | null) ?? undefined}
        settings={
          params.get("logo")
            ? { logoDarkUrl: params.get("logo"), account: { name: "Acme" }, themeConfig: { dark: { accent: "#f59e0b" } } }
            : undefined
        }
        startTime={Number(params.get("start")) || undefined}
        onFallback={({ reason, resumeAt }) => setStatus(`source: MP4 (stream failed: ${reason}, resumed at ${resumeAt.toFixed(1)}s)`)}
      />
      <div id="status">{status}</div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
