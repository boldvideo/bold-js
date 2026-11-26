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

The scope line says “Looking at this video” or “Looking at your library”. Playback time is sent with the question, not shown on that line. The video title, Key points, Quiz me, and up to three `conversationStarters` come before the conversation. Explain this part appears after playback pauses or a backward seek of 3–60 seconds. Position-only integrations infer pauses after two seconds without movement, past 15 seconds, after observing playback.

A conversation from another place is set aside, with one Continue row. Asking there starts a new conversation. Following a source, navigating during an answer, or choosing Continue keeps the conversation visible. Sources use your `navigate` function for ordinary clicks; modified clicks keep native browser behavior. Matching sources seek the page's player. Pass `videoHref` to make sources on other videos navigable.

The provider saves only a completed conversation's ID and timestamp in `sessionStorage`, per endpoint and `viewerKey`, for 12 hours. Reloading loads it through the transport. This is not a guarantee that the upstream has persisted it. A different `viewerKey` gets a fresh provider immediately. Include the account in this key when a viewer can switch accounts, especially with a custom transport. Browser storage is optional; blocked storage does not break chat.

Every question gets `crypto.randomUUID()`. Retry replaces the last interrupted or retryable turn, keeping the original prompt, focus, conversation ID and request ID. This does not promise exactly-once processing by your backend. Stop aborts the transport signal and retains partial text. Late events from stopped or replaced attempts cannot change the current turn.

## The handler: authorization, ownership and Stop

`createAssistantHandler({ bold, authorize })` returns a web-standard `(request: Request) => Promise<Response>`.

- POST accepts `{ prompt, conversationId?, focus?: { videoId, currentTime? }, requestId? }` and streams SDK events unchanged as SSE, including unknown future events.
- GET lists the authorized viewer's conversations. GET `?offset=20` pages them; GET `?conversation=id` loads one.
- `authorize` supplies identity and access for **each** request. Browser-supplied identity and grants are ignored. Check same-origin/CSRF rules as appropriate for your app's cookie authentication.
- `access.answer` permits answers from collection IDs. `point` permits links without quoting. `mention` permits offer references without fetching content. Missing access fails closed with a developer error; explicit `{}` grants nothing.
- Continue and load first check the viewer's own conversation list, up to 100 pages of 100 items. Other viewers' IDs return 404. Detail lookup alone is not an ownership check.
- Stop aborts `ask`'s `signal`. The handler passes cancellation to `bold.ai.chat`. Your HTTP adapter must propagate client disconnects to `Request.signal`; cancelling the response body also aborts upstream work.

Use an open-mode account with a server key that can list conversations. With Bold's **Require verified AI access** enabled, the handler returns `verified_ai_access_unsupported`, and the panel displays its message unchanged. There is no credential fallback. Loading bound history that needs a focus is unsupported by the current `load(id)` contract.

`bold` is structural, not a runtime SDK import. Use a current SDK with `ai.listConversations({ viewer })`, `ai.getConversation`, and chat cancellation support. The repository checks those contracts against its SDK types.

## Settings, labels and theming

The provider reads `account.ai.name`, `account.ai.avatarUrl` (also `avatar_url`) and `account.ai.greeting`, falling back to `aiName`, `aiAvatar`, `aiGreeting`, then defaults. No avatar means the name's first letter. It reads `themeConfig.light.accent` and `themeConfig.dark.accent`. Your app decides whether to render the assistant; settings do not grant access.

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

Opening and closing take 200 ms. Reduced-motion disables transitions. The closed panel stays mounted and inert, preserving drafts and scroll position. Panel code preloads while idle and on launcher hover/focus. Markdown loads in a separate chunk.

## Props

| Component | Prop | Meaning |
| --- | --- | --- |
| `AssistantProvider` | `endpoint` **or** `transport` | Same-origin route URL, or an `AssistantTransport`. Never a Bold key. |
| | `viewerKey` | Required identity/cache key. Change it when the viewer or account changes. |
| | `settings`, `labels`, `children` | Structural branding, partial wording overrides, app contents. |
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
| `useAssistant()` | `messages`, `isStreaming`, `conversationId`, `ask(prompt, { fresh? })`, `stop()`, `retry()`, `canRetry`, `startNew()`, `open(id)`; `video`, `switching`, `place`, `setAside`, `continueConversation()`; history and presentation below. |
| `useAssistantVideo(video, options?)` | `{ props: { onTimeUpdate, onPlay, onPause }, ref }`. Input has `id`, optional `title`, `chapters`, `conversationStarters`, `canonicalVideoId`. Options allow `currentTime` and `onSeek(seconds, interactionId)` instead of a player ref. Pass `null` to unregister. |
| `useAssistantSources(message, { navigate?, videoHref? })` | `passages`, `citationsById`, `passageNumberByCitationId`, `sourceLink(id, wholePassage?)`. Link result includes `href`, `onClick`, `number`, `seconds`, `source`, `passage`, `canSeek`. |

`useAssistant` also returns `hasHistory`, `history`, `historyLoading`, `historyError`, `historyHasMore`, `listHistory(more?)`; `labels`, `name`, `avatar`, `greeting`, `style`; and the public place helpers `continuedAt`, `continueHere(place)`, `followed`, `follow(answerId, videoId)`. History exists only when the transport supplies **both** `list` and `load`. `open` resolves to a success boolean. Ask/retry/list errors are state, not rejected action promises.

Keep `video.conversationStarters` and callback inputs stable. Times are seconds throughout. The hook reads the structural player's `currentTime`, `paused`, `play()` and `pause()`; it imports neither the SDK nor player. If you also need playback callbacks, compose them with the returned handlers instead of overwriting them.

State is inspectable: the dock has `data-state="open|closed"`; dock and panel have `data-place="video|library"`, and presence attributes `data-switching` and `data-set-aside`. All hooks and helpers used by the default panel are exported. `formatAssistantTime`, `assistantChapterAt`, `assistantSafeHref`, `remarkAssistantCitations`, and `preloadAssistantPanel` are available for custom rendering.

`remarkAssistantCitations({ resolve })` optionally turns citation IDs into native links, buttons or spans. `resolve(id)` returns `{ text, title, href?, canSeek }`, or `undefined` for an unresolved token. `AssistantCitationOptions` describes it. The panel delegates citation clicks instead of replacing link components on each streaming update, so keyboard focus survives new text. Without options, the plugin emits `#bold-citation-ID` links for your renderer.

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

`reduceThread` folds facts into a replayable `Thread`. Begin with `question_asked`; deliver async events inside `event_received` with `requestId`. Stop/EOF use `viewer_stopped`/`stream_ended`. Reset uses `thread_reset`; history uses `conversation_loaded`. `question_asked` with `retry: true` replaces only the final interrupted/retryable matching question. Async callers must additionally reject obsolete attempts that reuse its ID.

`buildPassages(content, message, { gapSeconds? })` groups cited sentences in the same video with an end-to-start gap of at most 45 seconds. Pass the whole message, including `citationSources` and `citationIndices`: completion may reorder other sources. `citationPlayStart` gives a chip one second of lead-in, clamped to its passage; rows start at the passage. Numeric references keep their numbers. Unresolved tokens are not guessed. The panel lists up to three cited videos; every resolved citation still appears inline.

`createVideoStore` supplies `set`, `release`, `beginPending`, `endPending`, `subscribe`, `getSnapshot`, `dispose`. `AssistantVideo.moment` can carry a factual paused/relistened position. `shouldSetAside` accepts place, messages, streaming, continued place and a followed answer's interaction ID or local message ID. Keep its continuation latch current while streaming. `momentAfterMove`, `momentAfterStandingStill` and `PAUSE_AFTER_MS` support position-only players. Progress remains facts in core; UI wording belongs in React.

## Out of scope

No full-page layout, player inside source rows, voice, checkout or viewer-personalized suggestions in 0.1.0. Apps can build a full-page panel from the same hooks and use their own player/navigation. Authorization stays in the app; `lockedMatches`, pointers and recommendations remain in public messages for custom interfaces. The default panel does not render purchase offers. No backend changes or entitlement guesses are hidden here.

## Development

```sh
pnpm install
pnpm run build # SDK declarations for compatibility checks
pnpm --filter @boldvideo/assistant run lint
pnpm --filter @boldvideo/assistant exec vitest run --coverage
pnpm --filter @boldvideo/assistant run build
```

The first 0.1.0 publication is manual and must happen before merging this package's release work. Later versions use the repository's changesets flow. MIT.
