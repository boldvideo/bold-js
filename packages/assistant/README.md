# @boldvideo/assistant

**A React assistant for your Bold video library.** One floating panel follows the viewer between pages, reads the video on screen, and answers with numbered sources they can play.

Works with React 18 and 19. No SDK or player runtime dependency. The `core`, `server` and `testing` entries work without React or a DOM.

## Install

```sh
npm install @boldvideo/assistant
```

Import `@boldvideo/assistant/styles.css` once, in your root layout or app entry.

## Three-piece quick start

**1. A server route.** Keep the Bold key on the server. Use your app's session and access checks. Export both methods to enable history.

```ts
// app/api/assistant/route.ts
import { createClient } from "@boldvideo/bold-js";
import { createAssistantHandler } from "@boldvideo/assistant/server";
import { getViewer, mayWatch } from "@/lib/auth";

const bold = createClient(process.env.BOLD_API_KEY!);
const handler = createAssistantHandler({
  bold,
  async authorize(request, { focus }) {
    const viewer = await getViewer(request);
    if (!viewer) return new Response(null, { status: 401 });
    if (focus && !(await mayWatch(viewer, focus.videoId))) {
      return new Response(null, { status: 403 });
    }
    return { viewer: viewer.id, access: { answer: viewer.collectionIds } };
  },
});
export const POST = handler;
export const GET = handler;
```

**2. The app shell.** Keep the provider above changing pages. `settings` is the object returned by `bold.settings()`. This shell is a client component; fetch its settings and viewer on the server.

```tsx
"use client";
import { useRouter } from "next/navigation";
import { AssistantProvider, AssistantDock } from "@boldvideo/assistant";
import type { AssistantSettings } from "@boldvideo/assistant";
import type { ReactNode } from "react";
import "@boldvideo/assistant/styles.css";

export function Shell({ children, settings, viewerId }: {
  children: ReactNode; settings: AssistantSettings; viewerId: string;
}) {
  const router = useRouter();
  return <AssistantProvider endpoint="/api/assistant" settings={settings} viewerKey={viewerId}>
    {children}
    <AssistantDock navigate={router.push}
      videoHref={(id, at) => `/watch/${encodeURIComponent(id)}?t=${at}`} />
  </AssistantProvider>;
}
```

**3. The video page.** Spread the hook's props and ref onto `BoldPlayer` or a native `<video>`. Read `t` from your page's URL and pass it as the player's `startTime` for cross-page source links.

```tsx
"use client";
import { BoldPlayer, type BoldPlayerVideo } from "@boldvideo/player";
import { useAssistantVideo } from "@boldvideo/assistant";

export function Video({ video, startTime = 0 }: { video: BoldPlayerVideo; startTime?: number }) {
  const player = useAssistantVideo(video);
  return <BoldPlayer video={video} startTime={startTime} {...player.props} ref={player.ref} />;
}
```

For asynchronous video routes, render `<AssistantVideoPending />` in **every** route loading shell and nested Suspense fallback. It keeps the previous video visible and dimmed until the next page registers. Without a pending marker, unmounting a video means leaving for the library after a 120 ms settle window. No router-specific loading detection is hidden in the package.

The dock floats; it does not resize the page. It starts closed and remembers the viewer's open/closed choice per tab. `/` opens and focuses the question box unless you are typing elsewhere. Escape closes from inside the panel. On narrow screens it becomes a bottom sheet. Use `hidden` on routes where it must not appear; do not unmount it just to hide it.

## Conversations follow the page

- The scope line tells viewers where the assistant is looking: “Looking at this video” or “Looking at your library”. Playback time travels with the question. It does not appear on that line.
- The video title, Key points and Quiz me appear above the conversation. An empty conversation also shows up to three `conversationStarters`.
- Playback hints appear after a pause or a backward seek of 3–60 seconds. For players that report only position, the hook infers a pause after two seconds without movement. It must first observe playback past 15 seconds.
- A conversation from another page is hidden behind one Continue row. Asking on the new page starts a new conversation. Choose Continue to keep the old conversation.
- Following a source keeps its conversation visible. Moving between pages while an answer streams also keeps the conversation visible.
- Ordinary source clicks use your `navigate` function. Modified clicks, such as Ctrl-click, keep the browser's normal behavior. A source in the current video seeks the page's player. Supply `videoHref` to link to other videos.
- After an answer completes, the provider saves its conversation ID and a timestamp in `sessionStorage`. It saves no message text. The entry belongs to the endpoint and `viewerKey`, and expires after 12 hours.
- Reloading asks the transport to load the saved conversation. The server must have stored it for this to succeed. Chat still works when browser storage is blocked.
- Changing `viewerKey` immediately starts a fresh provider. Include the account in the key when viewers can switch accounts. This also applies to custom transports.
- Each question gets a request ID from `crypto.randomUUID()`. Retry replaces the last interrupted or retryable question and answer. It keeps the original prompt, video focus, conversation ID and request ID. Your backend decides whether repeated requests run more than once.
- Stop aborts the transport's signal and keeps the partial answer. Late events from stopped or replaced requests cannot change the current answer.

## The handler: authorization, ownership and Stop

`createAssistantHandler({ bold, authorize })` returns a web-standard `(request: Request) => Promise<Response>`.

- POST accepts `{ prompt, conversationId?, focus?: { videoId, currentTime? }, requestId? }`. It streams server-sent events (SSE). SDK events pass through unchanged, including future event types.
- GET lists the authorized viewer's conversations. GET `?offset=20` loads the next page. GET `?conversation=id` loads one conversation.
- `authorize` supplies identity and access for **each** request. Browser-supplied identity and access grants are ignored. For cookie authentication, enforce your app's same-origin and cross-site request forgery (CSRF) checks.
- `access.answer` permits answers from collection IDs. `point` permits links without quoting. `mention` permits offer references without fetching content. Missing access fails closed with a developer error; explicit `{}` grants nothing.
- Continue and load first check the viewer's own conversation list, up to 100 pages of 100 items. Other viewers' IDs return 404. Detail lookup alone is not an ownership check.
- Stop aborts `ask`'s `signal`. The handler passes cancellation to `bold.ai.chat`. Your HTTP adapter must propagate client disconnects to `Request.signal`; cancelling the response body also aborts upstream work.

Use a server key that can list conversations. The account must use open mode: Bold's **Require verified AI access** setting must be off. When it is on, the handler returns `verified_ai_access_unsupported`. The panel shows that message unchanged. It does not try another credential. The current `load(id)` API cannot load conversations that require a video focus.

Pass an object with the required methods as `bold`. The handler does not import the SDK at runtime. A current SDK client supplies `ai.listConversations({ viewer })`, `ai.getConversation` and chat cancellation. Type checks keep these method signatures aligned with the SDK.

## Settings, labels and theming

The provider reads branding from `settings` in this order:

- Name: `account.ai.name`, then `aiName`, then the default label.
- Avatar: `account.ai.avatarUrl` or `account.ai.avatar_url`, then `aiAvatar`. Without an image, it shows the name's first letter.
- Greeting: `account.ai.greeting`, then `aiGreeting`, then the default label.
- Accent colours: `themeConfig.light.accent` and `themeConfig.dark.accent`.

Your app decides whether to show the assistant. Settings do not grant access.

All default UI strings live in exported `defaultAssistantLabels`. Override any of them with one `labels` prop. Some are functions, for example `found(passages, videos)` and `source(number, title, at)`. Server progress/error messages, video titles and starter questions are data and appear unchanged.

```tsx
<AssistantProvider endpoint="/api/assistant" viewerKey="viewer"
  labels={{ send: "Ask", stop: "Stop writing", found: (p, v) => `${p} passages · ${v} videos` }}>
  {children}
</AssistantProvider>
```

Set these public CSS variables on an ancestor or in `AssistantPanel.style`. Light and dark defaults follow `prefers-color-scheme`; explicit variables win. All colours, font and radii derive from this list. Internal `--ba-*` aliases are not customization points.

| Variable | Light default | Dark default |
| --- | --- | --- |
| `--bold-assistant-surface` | `#fff` | `#202225` |
| `--bold-assistant-text` | `#202124` | `#eeeef0` |
| `--bold-assistant-muted` | `#62656b` | `#a6a9b0` |
| `--bold-assistant-accent` | light accent below | dark accent below |
| `--bold-assistant-accent-light` | settings, else `#335c50` | — |
| `--bold-assistant-accent-dark` | — | settings, else `#a2c9bb` |
| `--bold-assistant-border` | `#dedfe2` | `#414449` |
| `--bold-assistant-radius` | `18px` | same |
| `--bold-assistant-font` | `system-ui, sans-serif` | same |
| `--bold-assistant-shadow` | `0 12px 48px rgb(0 0 0 / .16)` | same |
| `--bold-assistant-z-index` | `50` | same |

Opening and closing take 200 ms. Reduced-motion disables transitions. A closed panel cannot receive clicks or keyboard focus. It stays mounted to keep drafts and scroll position. Panel code preloads while idle or when the launcher receives hover or focus. Markdown loads in a separate chunk.

## Props

| Component | Prop | Meaning |
| --- | --- | --- |
| `AssistantProvider` | `endpoint` **or** `transport` | Same-origin route URL, or an `AssistantTransport`. Never a Bold key. |
| | `viewerKey` | Required identity/cache key. Change it when the viewer or account changes. |
| | `settings`, `labels`, `children` | Branding fields, wording overrides, app contents. |
| `AssistantDock` | `navigate(href)` | Client-side navigation; absent means normal link navigation. |
| | `videoHref(videoId, seconds)` | Your video URL. Source links add `interactionId` when available. |
| | `hidden` | Hide without losing state. Default `false`. |
| | `expandHref` | Optional full-page link. The app supplies that page. |
| `AssistantPanel` | `navigate`, `videoHref`, `expandHref` | Same navigation as the dock, without a floating container. |
| | `onClose`, `inputRef`, `className`, `style` | Optional close action, composer ref, root class and styles. Give the panel a bounded height. |
| `AssistantAnswer` | `message`, `navigate`, `videoHref` | Default Markdown, progress and sources for one public `ThreadMessage`. |
| `AssistantVideoPending` | none | Marks a video-loading fallback until it unmounts. |

## Hooks

| Hook | Returns |
| --- | --- |
| `useAssistant()` | The conversation, current page, history and branding. Fields are listed below. |
| `useAssistantVideo(video, options?)` | `{ props: { onTimeUpdate, onPlay, onPause }, ref }`. Input has `id`, optional `title`, `chapters`, `conversationStarters`, `canonicalVideoId`. Options allow `currentTime` and `onSeek(seconds, interactionId)` instead of a player ref. Pass `null` to unregister. |
| `useAssistantSources(message, { navigate?, videoHref? })` | `passages`, `citationsById`, `passageNumberByCitationId`, `sourceLink(id, wholePassage?)`. Link result includes `href`, `onClick`, `number`, `seconds`, `source`, `passage`, `canSeek`. |

### Conversation

| `useAssistant()` field | What it is |
| --- | --- |
| `messages` | Questions and answers as `ThreadMessage` objects. Each answer includes its sources, progress and errors. |
| `conversationId` | The server's conversation ID, once received. |
| `activeRequestId` | The request ID of the answer being streamed. Absent when no request is active. |
| `isStreaming` | Whether an answer is being received. |
| `ask(prompt, { fresh? })` | Send a question. Set `fresh: true` to start a new conversation. |
| `stop()` | Cancel the request and keep the partial answer. |
| `retry()` | Retry the last stopped or retryable question with the same request ID. |
| `canRetry` | Whether that question can be retried. |
| `startNew()` | Clear the current conversation. |
| `open(id)` | Load a saved conversation. Resolves to `true` on success and `false` on failure. |

Ask and retry errors appear in `messages`. History errors appear in `history.error`. These actions report failures through state rather than rejected promises.

### The place on screen

| `useAssistant()` field | What it is |
| --- | --- |
| `video` | The registered video and playback state, or `null` in the library. |
| `place` | `"library"` or `"video:ID"`, using the registered video's ID. |
| `switching` | Whether a video page is loading. Disable question submission while this is `true`. |
| `setAside` | Whether the current conversation belongs to another page and should be hidden. |
| `continueConversation()` | Keep that conversation on the current page. Use this for the Continue button. |

### History

`history` is `null` unless the transport provides both `list` and `load`. Hide the history button when it is `null`. Otherwise it has these fields:

| Field | What it is |
| --- | --- |
| `history.items` | The loaded conversation summaries. |
| `history.loading` | Whether a list request or conversation load is pending. |
| `history.error` | The current list or load error message, or `null`. |
| `history.hasMore` | Whether another page of summaries is available. |
| `history.refresh()` | Load the first page and replace the list. Call this when opening history. |
| `history.more()` | Load the next page and append it. Call when `hasMore` is `true`. |

Use `open(item.conversationId)` to display a conversation from the list.

### Branding

| `useAssistant()` field | What it is |
| --- | --- |
| `labels` | Default UI wording with your provider overrides applied. |
| `name` | The assistant's display name. |
| `avatar` | Its image URL, or `null`. |
| `greeting` | The empty library panel's greeting. |
| `style` | CSS variables derived from the settings' accent colours. Apply these to your panel. |

### Video registration and rendering helpers

- Keep `video.conversationStarters` and callback inputs stable. All playback times are seconds.
- The player ref needs `currentTime`, `paused`, `play()` and `pause()`. The hook imports neither the SDK nor the player.
- If you need your own playback callbacks, call them alongside the returned handlers. Do not overwrite those handlers.

The dock exposes `data-state="open|closed"`. The dock and panel expose `data-place="video|library"`. They add `data-switching` while loading and `data-set-aside` when a conversation is set aside.

Every hook and helper the default panel uses is public. Custom renderers can use `formatAssistantTime`, `assistantChapterAt`, `assistantSafeHref`, `remarkAssistantCitations` and `preloadAssistantPanel`.

`remarkAssistantCitations({ resolve })` turns citation IDs into native links, buttons or spans. Your `resolve(id)` returns `{ text, title, href?, canSeek }`. Return `undefined` to leave a token unresolved. `AssistantCitationOptions` describes these options. Citation elements keep keyboard focus as new text streams in. Without options, the plugin emits `#bold-citation-ID` links for your renderer.

## Build your own panel

Mount this inside `AssistantProvider`. It uses only hooks: plain text answers, playable numbered passages, set-aside handling, Send and Stop. Add Markdown or history when you need them. This exact example is rendered in the test suite.

```tsx
import { useState } from "react";
import { useAssistant, useAssistantSources } from "@boldvideo/assistant";
import type { ThreadMessage } from "@boldvideo/assistant/core";

function Message({ message }: { message: ThreadMessage }) {
  const { passages, sourceLink } = useAssistantSources(message, {
    videoHref: (id, at) => `/watch/${id}?t=${at}`,
  });
  return <article><p>{message.content}</p>{passages.map(p => {
    const link = sourceLink(p.citationIds[0], true);
    return <a key={p.number} href={link.href} onClick={link.onClick}>{p.number}</a>;
  })}</article>;
}
export function MyPanel() {
  const a = useAssistant();
  const [question, setQuestion] = useState("");
  return <section style={a.style}>
    <p>{a.video ? a.labels.lookingAtVideo : a.labels.lookingAtLibrary}</p>
    {a.setAside ? <button onClick={a.continueConversation}>{a.labels.continue}</button>
      : a.messages.map(m => <Message key={m.id} message={m} />)}
    <form onSubmit={e => {
      e.preventDefault(); if (a.isStreaming || a.switching) return;
      void a.ask(question); setQuestion("");
    }}>
      <label>{a.labels.question}<textarea value={question} onChange={e => setQuestion(e.target.value)} /></label>
      <button disabled={a.isStreaming || a.switching || !question.trim()}>{a.labels.send}</button>
      {a.isStreaming && <button type="button" onClick={a.stop}>{a.labels.stop}</button>}
    </form>
  </section>;
}
```

## Testing your route

No key or network is needed to exercise the real handler:

```ts
import { createAssistantHandler } from "@boldvideo/assistant/server";
import { createFakeBold, syntheticAnswer } from "@boldvideo/assistant/testing";
import { createFetchTransport } from "@boldvideo/assistant/core";

const handler = createAssistantHandler({
  bold: createFakeBold({ answer: syntheticAnswer }),
  authorize: () => ({ viewer: "test-viewer", access: { answer: ["test-library"] } }),
});
const transport = createFetchTransport("https://example.test/assistant", {
  fetch: (url, init) => handler(new Request(url, init)),
});
for await (const event of transport.ask({ prompt: "How do I fold the base?", requestId: "test-question" }, {
  signal: new AbortController().signal,
})) console.log(event.type);
```

`createFakeBold({ conversations })` seeds viewer-owned history; chat does not persist it automatically. Each seed has `viewer`, `summary` and `detail`. `createReplayTransport(events, { delayMs })` tests streaming and cancellation without the HTTP handler. `syntheticAnswer` contains four invented videos, 256 sentence citations, and nearby sentences that merge into one passage.

The [browser rig](./proof) uses the real fetch transport and handler. Its committed results cover every-frame navigation, set-aside exceptions, actual video play/pause/seeking, source numbers, floating layout, keyboard, bundle checks and packed-app compatibility.

## Core without React

- A `Thread` holds the conversation state. `reduceThread` updates it from events. Replaying the same events rebuilds the same state.
- Start a question with `question_asked`. Wrap each asynchronous answer event in `event_received` with its `requestId`.
- Send `viewer_stopped` on cancellation and `stream_ended` when the stream ends. Use `thread_reset` to clear the conversation and `conversation_loaded` to restore history.
- Set `retry: true` on `question_asked` to replace the last matching interrupted or retryable question. Reject obsolete attempts separately when they reuse a request ID.
- A passage groups nearby cited sentences from one video. `buildPassages(content, message, { gapSeconds? })` merges sentences when the gap from one sentence's end to the next one's start is at most 45 seconds.
- Pass the whole message to `buildPassages`, including `citationSources` and `citationIndices`. Other source arrays can change order when an answer completes.
- `citationPlayStart` starts a citation one second before its sentence, without leaving the passage. Source rows start at the passage's beginning.
- Numeric citations keep their numbers. Unresolved tokens stay unresolved. The panel lists up to three cited videos and shows every resolved citation inline.
- `createVideoStore` tracks the current video. It provides `set`, `release`, `beginPending`, `endPending`, `subscribe`, `getSnapshot` and `dispose`.
- `AssistantVideo.moment` holds a paused position or a range the viewer replayed. For players that report only position, use `momentAfterMove`, `momentAfterStandingStill` and `PAUSE_AFTER_MS`.
- `shouldSetAside` decides whether a conversation belongs on the current page. It takes the place, messages, streaming state, continued place and followed answer ID. That ID can be the server's interaction ID or the local message ID. Update the continued place when navigation occurs during streaming.
- Core progress steps contain facts. React supplies their visible wording.

## Out of scope

- Version 0.1.0 has no full-page layout, players inside source rows, voice, checkout or viewer-personalized suggestions.
- Build a full-page panel from the same hooks. Use your app's player and navigation.
- Your app owns authorization. The package does not change your backend or guess what a viewer can access.
- The default panel does not show purchase offers. Public messages still include `lockedMatches`, pointers and recommendations for custom interfaces.

## Development

```sh
pnpm install
pnpm run build # SDK declarations for compatibility checks
pnpm --filter @boldvideo/assistant run lint
pnpm --filter @boldvideo/assistant exec vitest run --coverage
pnpm --filter @boldvideo/assistant run build
```

MIT.
