import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AssistantProvider, AssistantDock, AssistantVideoPending, useAssistantVideo } from "../dist/index.js";
import "../dist/styles.css";

function Video({ id, at }: { id: string; at: number }) {
  const player = useAssistantVideo({ id, title: `Paper craft video ${id.slice(-1)}`,
    chapters: "WEBVTT\n\n00:00:00.000 --> 00:02:00.000\nFolding the base",
    conversationStarters: ["How do I align the edges?", "Which fold comes first?", "How do I check the base?", "Not shown"],
  });
  return <><h1>Paper craft video {id.slice(-1)}</h1><video key={id} controls muted playsInline src="/clip.mp4" {...player.props} ref={player.ref}
    onLoadedMetadata={event => { event.currentTarget.currentTime = at; }} /><p>Practice measuring, folding and joining a paper model.</p></>;
}
function App() {
  const [route, setRoute] = useState({ id: "", at: 0, pending: false });
  const [hidden, setHidden] = useState(false);
  const navigation = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function navigate(href: string) {
    clearTimeout(navigation.current);
    const url = new URL(href, location.href);
    const id = url.pathname.split("/")[2] ?? "";
    history.pushState({}, "", href);
    if (!id) { setRoute({ id: "", at: 0, pending: false }); return; }
    setRoute(previous => ({ ...previous, pending: true }));
    navigation.current = setTimeout(() => setRoute({ id, at: Number(url.searchParams.get("t") ?? 0), pending: false }), 1000);
  }
  useEffect(() => {
    const url = new URL(location.href);
    setRoute({ id: url.pathname.split("/")[2] ?? "", at: Number(url.searchParams.get("t") ?? 0), pending: false });
    return () => clearTimeout(navigation.current);
  }, []);
  return <AssistantProvider endpoint="/api/assistant" viewerKey="proof-viewer" settings={{ aiName: "Guide", aiGreeting: "What would you like to make?" }}>
    <main id="page-box"><nav aria-label="Library navigation">
      <button id="library" onClick={() => navigate("/")}>Library</button>
      {[1, 2, 3].map(n => <button id={`video-${n}`} key={n} onClick={() => navigate(`/watch/video-${n}`)}>Video {n}</button>)}
      <button id="hide-dock" onClick={() => setHidden(!hidden)}>Toggle dock visibility</button>
    </nav>
    <label>Search the page <input id="page-input" /></label>
    {route.pending ? <><AssistantVideoPending /><p aria-busy="true">Loading video…</p></>
      : route.id ? <Video key={route.id} id={route.id} at={route.at} /> : <><h1>Paper craft library</h1><p>Four invented videos, one place to ask.</p></>}
    </main>
    <AssistantDock hidden={hidden} navigate={navigate} videoHref={(id, at) => `/watch/${id}?t=${at}`} />
  </AssistantProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
