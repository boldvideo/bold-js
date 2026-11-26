# @boldvideo/assistant

**Unreleased and private.** This is the TypeScript foundation for a Bold assistant. It has no React, DOM access, runtime dependencies or root export. Do not publish it yet.

- `@boldvideo/assistant/core`: replayable thread state, cited passages, pause/re-listen detection, the current-video store, the set-aside rule and fetch transport.
- `@boldvideo/assistant/server`: one web-standard handler for chat and viewer-owned history. Takes a structural SDK client; imports no SDK at runtime.
- `@boldvideo/assistant/testing`: `createReplayTransport`, `createFakeBold`, and `syntheticAnswer` (four invented videos and 256 sentence citations), with no key or network.

The later React entry will add the provider, hooks, dock, panel and stylesheet. Browser storage, navigation, rendering, entitlements and checkout are not implemented here.

## Server integration

The handler requires a client with `ai.listConversations({ viewer, limit?, offset? })` and cancellation via `ai.chat({ signal })`. These are not yet available in the current workspace SDK. The structural types describe the upcoming contract; lint explicitly tracks the two missing capabilities. The existing chat, history detail and copied event types are checked against the SDK now.

```ts
// A server route. The key never enters the browser bundle.
import { createAssistantHandler } from "@boldvideo/assistant/server";

const handler = createAssistantHandler({
  bold, // an SDK client created with the server key
  async authorize(request, { focus }) {
    const viewer = await getViewer(request);
    if (!viewer) return new Response(null, { status: 401 });
    // Also check that this viewer may watch focus.videoId, when supplied.
    return {
      viewer: viewer.id,
      access: { answer: viewer.collectionIds },
    };
  },
});

export const POST = handler;
export const GET = handler;
```

Missing access returns 500 and logs a developer-facing message. Explicit `access: {}` grants nothing. Continue and load first check the viewer's own list, requesting 100 items per page for at most 100 pages. The offset advances by the number of items returned, so smaller server page limits work. An empty page or `hasMore: false` ends the search; absent IDs return 404. Invalid items or repeated ownership pages fail closed. The host must propagate browser disconnection to `request.signal`; cancelling the response body also aborts upstream work.

Events, including unknown types and typed error events, are serialized unchanged as `data: <JSON>\n\n`. Thrown errors before streaming return sanitized JSON with the upstream HTTP status; after headers, they become a sanitized SSE error. This is event passthrough, not preservation of the original HTTP wire formatting (the SDK supplies objects).

## Core contracts for custom panels

`createFetchTransport(endpoint, { fetch?, headers? })` serves all three operations. Custom `AssistantTransport` objects may omit `list`/`load`; a panel should offer history only when both exist. `ask(request, { signal })` is an async iterable; request IDs belong to intentional actions and can be reused on retries. Headers can be a value or a function refreshed for each request.

`events.reduce(reduceThread, emptyThread)` replays a thread. Start a turn with `{ type: "question_asked", request }`. In an async provider, wrap received events in `{ type: "event_received", requestId, event }` so late events cannot overwrite a replacement. Stop and unexpected EOF use `viewer_stopped` and `stream_ended`, each with `requestId`. Reset uses `thread_reset`; loading uses `conversation_loaded` with the detail object. Guard stale async history responses in the caller before dispatch. Do not overlap attempts with the same request ID. A completed stream is not a guarantee of durable persistence.

Progress steps are data: `stage`, `state`, optional `scope`, and the server's `message` unchanged, including prefixes and whitespace. Locally inferred steps have no message. A searching step's `found: { passages, videos }` counts retrieved sources and distinct nonempty video IDs, not the groups returned by `buildPassages`. The answer's `scope.widenedFrom` records whether it widened from the focus. Panels choose all labels, translations and fallback wording from these facts; core supplies no UI copy.

`buildPassages(content, { citationMap?, sources?, citationIndices? }, { gapSeconds? })` returns `passages`, `citationsById` and `passageNumberByCitationId`. The sentence map and the answer's zero-based source indices are separate. Only cited sentences merge; the default end-to-start gap is 45 seconds. Passages follow first mention, excerpts follow spoken order, and numeric references remain unmerged, reserving their labels. `citationPlayStart(passage, { id, timestamp })` seeks to that citation with one second of lead-in, clamped to the passage start. Non-video documents remain in `citationsById`, without playable passages. Loaded history can resolve only metadata the SDK actually returns; unresolved stable tokens are not guessed.

`createVideoStore()` exposes `set`, `release`, `beginPending`, `endPending`, `subscribe`, `getSnapshot` and `dispose`. Register `AssistantVideo` with `videoId` and optional playback/title fields. Pass a stable page token as `set(video, token)` and `release(token)` when two page instances can show the same video; the default owner is the video ID. Balance pending markers in every loading fallback. Stale video stays present while a page is pending, with a 120 ms settle window. Keep callback/array references stable. Dispose the store when its provider goes away.

`shouldSetAside` accepts messages, the current `place` (`library` or `video:<id>`), `streaming`, and optional `followedAnswerId`, `continuedAt`, and `canonicalVideoId`. Keep `continuedAt` equal to the current place while streaming, retain it after completion, and reset it when replacing the conversation. That latch prevents an answer disappearing when it finishes after navigation.

`momentAfterMove` and `momentAfterStandingStill` use seconds and no timers. The caller waits `PAUSE_AFTER_MS` before reporting a stationary position; it must have observed playback first. The React integration can instead use real play/pause events.

## Development

From the repository root:

```sh
pnpm install
pnpm run build # SDK declarations for drift checks
pnpm --filter @boldvideo/assistant run lint
pnpm --filter @boldvideo/assistant exec vitest run --coverage
pnpm --filter @boldvideo/assistant run build
```

MIT.
