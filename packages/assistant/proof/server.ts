import { createAssistantHandler } from "../dist/server/index.js";
import { createFakeBold, createReplayTransport, syntheticAnswer } from "../dist/testing/index.js";
import type { FakeConversation } from "../dist/testing/index.js";

const conversations: FakeConversation[] = [];
const requests: { requestId?: string; prompt: string; focus: unknown; aborted: boolean }[] = [];
const bold = createFakeBold({ conversations, answer: async function* (request) {
  const log = { requestId: request.requestId, prompt: request.prompt, focus: request.focus ?? null, aborted: false };
  requests.push(log);
  request.signal.addEventListener("abort", () => { log.aborted = true; }, { once: true });
  if (request.prompt === "verified access") throw { code: "verified_ai_route_unsupported", status: 403 };
  if (request.prompt === "retry failure" && requests.filter(r => r.requestId === request.requestId).length === 1) throw { status: 503 };
  const id = request.conversationId ?? `conversation-${request.requestId}`;
  const scope = { answeredFrom: "library" as const, widenedFrom: request.focus ? "focus" as const : null,
    reason: request.focus ? "not_covered" as const : null,
    focus: request.focus ? { videoId: request.focus.videoId, title: "Paper craft" } : null };
  const events = syntheticAnswer.map(event => {
    if (event.type === "message_start" || event.type === "conversation_created") return { ...event, conversationId: id };
    if (event.type === "message_complete") return { ...event, conversationId: id, interactionId: `answer-${request.requestId}`, scope };
    return event;
  });
  const replay = createReplayTransport(events, { delayMs: 100 });
  for await (const event of replay.ask({ prompt: request.prompt, requestId: request.requestId! }, { signal: request.signal })) {
    if (event.type === "message_complete") {
      const now = new Date().toISOString();
      const existing = conversations.find(c => c.detail.conversationId === id);
      if (!existing) conversations.unshift({ viewer: request.viewer,
        summary: { conversationId: id, title: request.prompt, preview: "A paper craft answer", scope: request.focus ? "video" : "library",
          status: "complete", messageCount: 2, createdAt: now, updatedAt: now, channel: "api", client: null,
          video: request.focus ? { id: request.focus.videoId, title: "Paper craft", thumbnailUrl: null, url: null } : null },
        detail: { conversationId: id, createdAt: now, updatedAt: now,
          metadata: { originalQuery: request.prompt, status: "complete", confidence: "high", chunksFound: 4 },
          messages: [{ id: `saved-${request.requestId}`, role: "assistant", content: "Measure the edge before folding [1].",
            sources: [{ videoId: "video-1", timestamp: 20, title: "Paper craft video 1" }], insertedAt: now, scope }] },
      });
    }
    yield event;
  }
} });
const handler = createAssistantHandler({ bold, authorize: () => ({ viewer: "proof-viewer", access: { answer: ["paper-craft"] } }) });

Bun.serve({ port: Number(process.env.PORT ?? 4488), async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/assistant") return handler(request);
  if (url.pathname === "/__requests") return Response.json(requests);
  if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
  if (url.pathname === "/clip.mp4") return new Response(Bun.file(`${import.meta.dir}/dist/clip.mp4`));
  if (url.pathname.startsWith("/dist/") && !url.pathname.includes("..")) return new Response(Bun.file(`${import.meta.dir}${url.pathname}`));
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assistant proof</title>
    <link rel="stylesheet" href="/dist/harness.css"><style>body{margin:0;background:#f3f3f0;color:#252a28;font:16px system-ui}main{max-width:1000px;margin:48px auto;padding:24px}nav{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}nav button{padding:10px;border:1px solid #bbb;border-radius:6px;background:white}label{display:block}video{width:70%;background:#243c36;border-radius:10px}@media(max-width:600px){main{margin:16px auto}video{width:100%}}</style></head>
    <body><div id="root"></div><script type="module" src="/dist/harness.js"></script></body></html>`, { headers: { "Content-Type": "text/html" } });
} });
console.log("Assistant proof server ready; synthetic data only.");
