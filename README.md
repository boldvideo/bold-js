<div align="center">
    <a href="https://boldvideo.com?utm_source=github.com&utm_medium=readme&utm_campaign=bold-js" align="center">
		<img src="https://boldvideo.com/bold-js-github-header.svg"  alt="Bold Logo">
	</a>
	<h1 align="center rainbow">@boldvideo/bold-js</h1>
    <p align="center">
        The JavaScript SDK for interacting with the <a href="https://boldvideo.com?utm_source=github.com&utm_medium=readme&utm_campaign=bold-js" target="_blank">Bold API</a>, to power your own business video platform.
    </p>
</div>

<p align="center">
  <a href="https://npmjs.com/package/@boldvideo/bold-js">
    <img src="https://img.shields.io/npm/v/@boldvideo/bold-js/latest.svg?style=flat-square" alt="Bold JS" />
  </a>
  <a href="https://npmjs.com/package/@boldvideo/bold-js" rel="nofollow">
    <img src="https://img.shields.io/npm/dt/@boldvideo/bold-js.svg?style=flat-square" alt="npm">
  </a>
</p>

<p align="center">
  <a href="https://twitter.com/intent/follow?screen_name=veryboldvideo">
    <img src="https://img.shields.io/badge/Follow-%40veryboldvideo-09b3af?style=appveyor&logo=twitter" alt="Follow @veryboldvideo" />
  </a>
  <a href="https://https://app.boldvideo.io/register?utm_source=github.com&utm_medium=readme&utm_campaign=bold-js">
    <img src="https://img.shields.io/badge/Try%20Bold-Free-09b3af?style=appveyor&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAmCAYAAADTGStiAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAGFSURBVHgBxZg9SwNBEIZ34xUpVLCwEQQRtRARxV+g4M8QLO0sBPtgZS129gr+AbEWWyshOUSCkipBjB8cBHPrM4GVQ84qZuaFJTebj+feyczu3fmxEIIbXjnjjZEy7hm3feeunfdPf33B/xO4TBk/fMoZHXMCHU1wVBP3m8Cb2mDRI/AN4K9xouJ0NA9ovzih5Vj0jutZXHcl0HIsmkicW4uBJtiR2kUr8KQJGPVMwJ62sgJ//hxrtROQNsvnDO30JbGaY9xeROggVnLcY/FYAPwcJ7Qc7xahKmAAe33vz0vmRysK6rASQs2FUC3Oq1U1xZVSWVukvCWxWlXjbgnYFc6nVMEiXK+wQx0MjhX346gPWmtOe5MQjQPdsQBLylctUi3gholjnE6bgFHVCpxZgR+s/uOGVTvdWLTTCyvXurpj3J7IfbOqY0BpLrcx3mea22Id6LZAJdYA56T3COhy8dFE4kYkHN7xcgnwDGD79/sJH6i54SQ1ItfLXZx1GC2CehmsqG96m37o1gSKagAAAABJRU5ErkJggg==" alt="Try Bold Video" />
  </a>
</p>

---

## Installation

```bash
npm install @boldvideo/bold-js
```

## Quick Start

```typescript
import { createClient } from '@boldvideo/bold-js';

const bold = createClient('your-api-key');

// Fetch videos
const videos = await bold.videos.list();

// AI-powered recommendations
const recs = await bold.ai.recommendations({ 
  topics: ['sales', 'negotiation'],
  stream: false 
});
console.log(recs.guidance);
```

---

## API Reference

### Videos

```typescript
// List latest videos (default: 12)
const videos = await bold.videos.list();

// With limit (backwards compatible)
const videos = await bold.videos.list(20);

// With filters
const videos = await bold.videos.list({ 
  limit: 20,
  tag: 'sales',
  collectionId: 'col_123',
  viewerId: 'viewer_123'  // Include watch progress
});

// Paginated index (uses /videos endpoint)
const videos = await bold.videos.list({ 
  page: 2,
  tag: 'sales',
  collectionId: 'col_123'
});

// Get a single video by ID or slug
const video = await bold.videos.get('video-id');
const videoBySlug = await bold.videos.get('my-video-slug');

// Search videos
const results = await bold.videos.search('pricing strategies');
```

### Secure playback

Videos with `playbackPolicy: 'signed'` require a playback token. Bare Mux stream
and image URLs return 403 for these videos. Use the standalone helpers instead
of building Mux URLs by hand:

```typescript
import { createClient, streamUrl, muxPlayerProps, thumbnailUrl } from '@boldvideo/bold-js';

const bold = createClient('YOUR_API_KEY'); // Keep your tenant API key server-side.
const { data: video } = await bold.videos.get('video-id');
const src = streamUrl(video); // For an HLS player.
const playerProps = muxPlayerProps(video); // Spread into <MuxPlayer {...playerProps} />.
const poster = thumbnailUrl(video, { width: 640, height: 360, time: 0, fitMode: 'crop' });
```

`streamUrl` preserves the API's URL, falling back to a Mux HLS URL with any supplied
`playbackToken`. `muxPlayerProps` returns just `{ playbackId }` for public videos;
signed videos also get available playback/storyboard tokens and an explicit poster
from `thumbnail`. `thumbnailUrl` builds a Mux image URL for public videos. For signed
videos it returns the stored public `thumbnail` unchanged and **ignores all options**:
signed Mux images cannot be sized or seeked using query parameters.

The helpers accept `Video`, citations, search sources, recommendations, or your own
object with the needed camelCase fields (`PlaybackSource`). AI sources carrying a
token are treated as signed even without a policy; an explicit public policy takes
precedence for player props and thumbnails. URL helpers return `undefined` when the
required URL, playback ID, or signed thumbnail is missing; player props omit missing
fields. They format supplied data, not validate credentials: a signed video without
a token cannot play via a constructed bare URL. For a source without a thumbnail or
storyboard token, re-fetch the full video to obtain the available fields.

Tokens last **12 hours**. `Video.playbackTokenExpiresAt` is an optional nullable
ISO8601 timestamp. Re-fetch the video with `bold.videos.get()` for fresh tokens;
there is no refresh endpoint or automatic refresh timer. Token fields are null for
public videos. Do not log tokens or tokenized URLs.

### Playlists

```typescript
// List all playlists
const playlists = await bold.playlists.list();

// Get a single playlist with videos
const playlist = await bold.playlists.get('playlist-id');
```

### Settings

```typescript
// Fetch channel settings, menus, and featured playlists
const settings = await bold.settings();

// Access portal hero configuration
if (settings.portal.hero.type === 'custom') {
  // Render custom hero section
}

// Menu items with external link handling
settings.menuItems.forEach(item => {
  // item.blank: true opens in a new window/tab
  // item.isExt: true indicates an external URL
  // item.icon: optional icon path (can be null)
});
```

---

## Viewers API

Manage external users and track their video watch progress. Ideal for course platforms integrating with Bold Video.

### Viewer Management

```typescript
// Create a viewer (e.g., when user signs up)
const { data: viewer } = await bold.viewers.create({
  name: 'John Doe',
  externalId: 'user_123',  // Your platform's user ID
  email: 'john@example.com',
  traits: { plan: 'pro', company_name: 'Acme Inc' }
});

// Find viewer by external ID (common for syncing users)
const { data: viewer } = await bold.viewers.lookup({ externalId: 'user_123' });

// Or find by email
const { data: viewer } = await bold.viewers.lookup({ email: 'john@example.com' });

// Update viewer
await bold.viewers.update(viewer.id, { 
  traits: { plan: 'enterprise' }  // Note: traits are replaced, not merged
});

// List all viewers
const { data: viewers } = await bold.viewers.list();
```

### Progress Tracking

```typescript
// Save progress as video plays (call every 5-10 seconds)
await bold.viewers.saveProgress(viewerId, videoId, {
  currentTime: 120,  // seconds
  duration: 600      // total video duration
});

// Mark video complete by setting currentTime = duration
await bold.viewers.saveProgress(viewerId, videoId, {
  currentTime: 600,
  duration: 600
});

// Get progress for a specific video
const { data: progress } = await bold.viewers.getProgress(viewerId, videoId);
console.log(`${progress.percentage}% complete`);

// List all progress for a viewer (e.g., for a course dashboard)
const { data: progress, meta } = await bold.viewers.listProgress(viewerId, {
  collectionId: 'course-collection-id',  // Filter to a course
  completed: false  // Only in-progress videos
});
console.log(`Completed ${meta.completed} of ${meta.total} videos`);
```

---

## Notification Preferences

Read or partially update a viewer's email and push notification channels with
the tenant API-key client:

```typescript
const preferences = await bold.notifications.getPreferences('viewer-uuid');
console.log(preferences.channels.email, preferences.channels.push);

// Only push is changed; the existing email preference is preserved.
await bold.notifications.updatePreferences('viewer-uuid', {
  channels: { push: true }
});
```

---

## Session Management

Use BOLD Session Management as a headless password-sharing prevention layer.
Your app still owns login, membership, product access, and staff/admin checks.
Call BOLD only after your app has decided the viewer may access protected
content.

### Runtime Sessions

Runtime session calls use the customer's upstream JWT, not a BOLD API key. This
factory is safe for browser/native runtime code when the upstream JWT is already
available to that runtime.

```typescript
import { createAuthClient } from '@boldvideo/bold-js';

const auth = createAuthClient({
  tenantSlug: 'hrtu',
  upstreamJwt: outsetaJwt
});

const result = await auth.sessions.create({
  deviceId: browserDeviceId,
  platform: 'web',
  userAgent: navigator.userAgent
});

let sessionId: string | undefined;

if ('challengeRequired' in result) {
  // Show an email-code challenge UI, then verify the code.
  const verified = await auth.challenges.verify(result.challengeId, '123456');
  sessionId = verified.sessionId ?? undefined;
} else if (result.sessionId) {
  sessionId = result.sessionId;
}

if (sessionId) {
  localStorage.setItem('bold_session_id', sessionId);
}

if (sessionId) {
  // Register the session for push notifications.
  await auth.notifications.registerDevice(sessionId, {
    provider: 'expo', // 'expo' | 'fcm' | 'apns'
    token: expoPushToken
  });

  const verification = await auth.sessions.verify(sessionId);
  if (!verification.valid) {
    // session_not_found, session_revoked, or session_expired
  }
}
```

For refreshed JWTs, pass an override per call:

```typescript
await auth.sessions.verify(sessionId, { upstreamJwt: freshJwt });
```

Viewer self-management methods require policy support:

```typescript
const { data: sessions } = await auth.sessions.list();
await auth.sessions.revoke(sessionId);
await auth.sessions.revokeOthers(currentSessionId);
```

When Session Management is not available for the account, device registration
returns a typed error:

```typescript
import { SessionManagementUnavailableError } from '@boldvideo/bold-js';

try {
  await auth.notifications.registerDevice(sessionId, {
    provider: 'fcm',
    token: fcmToken
  });
} catch (error) {
  if (error instanceof SessionManagementUnavailableError) {
    console.log(error.status, error.code, error.retryable);
  }
}
```

### Server-Side Session Management

Customer servers can inspect BOLD device state, revoke sessions, and manage
per-viewer device-limit overrides or exemptions by upstream external ID using
the normal BOLD tenant API key. Keep this API key server-side. Do not put a
BOLD tenant key or admin key in browser code.

```typescript
import { createClient } from '@boldvideo/bold-js';

const bold = createClient(process.env.BOLD_TENANT_API_KEY!);

const { data: state } =
  await bold.sessionManagement.getViewerSessionManagementStateByExternalId(
    outsetaPersonUid
  );

if (state.canUpdateDeviceLimitOverride) {
  await bold.sessionManagement.setViewerDeviceLimitOverrideByExternalId(
    outsetaPersonUid,
    5
  );

  await bold.sessionManagement.clearViewerDeviceLimitOverrideByExternalId(
    outsetaPersonUid
  );
}

if (state.canUpdateSessionManagementExemption) {
  await bold.sessionManagement.setViewerSessionManagementExemptionByExternalId(
    outsetaPersonUid,
    true
  );
}

const { data: sessions } =
  await bold.sessionManagement.listViewerSessionsByExternalId(outsetaPersonUid);

for (const session of sessions) {
  if (session.travelVerdict === 'impossible_travel') {
    // Bold flagged this sign-in as physically implausible.
  }
}

await bold.sessionManagement.revokeAllViewerSessionsByExternalId(
  outsetaPersonUid,
  { reason: 'outseta:membership_changed' }
);
```

`setViewerDeviceLimitOverrideByExternalId` requires a positive safe integer.
Use `clearViewerDeviceLimitOverrideByExternalId` for explicit clearing.

Each session item carries `travelVerdict: 'impossible_travel' | null` — Bold's
authoritative impossible-travel signal, exposed by these admin-scoped
session-management methods. It is a **label only**: the SDK never returns
coordinates, the raw IP, or derived distance/speed. It is `null` when the
sign-in was not flagged (and for backends that predate the field).

The server-side session-management methods cannot update JWT config, account
feature flags, session TTL, or email template setup. Those remain BOLD operator
controls.

---

## Community API

Build community features with posts, comments, and reactions. All write operations require a `viewerId` (the viewer performing the action).

### Posts

```typescript
// List posts (optionally filter by category)
const { data: posts } = await bold.community.posts.list({ 
  category: 'announcements',
  limit: 20,
  offset: 0,
  viewerId: 'viewer-uuid'  // Include viewerReacted in response
});

// Get a single post with comments
const { data: post } = await bold.community.posts.get('post-id', 'viewer-uuid');

// Create a post and notify viewers by their customer external IDs.
const { data: newPost, mentions } = await bold.community.posts.create('viewer-uuid', {
  content: 'Hello community! **Markdown** supported.',
  category: 'general',
  mentions: ['customer-user-123']
});
console.log(mentions?.skipped); // malformed or unresolved external IDs

// Update a post (owner or admin only)
await bold.community.posts.update('viewer-uuid', 'post-id', {
  content: 'Updated content'
});

// Delete a post (owner or admin only)
await bold.community.posts.delete('viewer-uuid', 'post-id');

// Pin or unpin a post (server only). Use a community moderation key: a
// single-purpose key that can pin and unpin posts and nothing else, so it is
// safe to keep in your server's environment. Ask Bold support to issue one.
// Check that the acting member may moderate first; authorship is not enough.
const admin = createClient(process.env.BOLD_API_KEY, {
  adminApiKey: process.env.BOLD_COMMUNITY_MODERATION_KEY,
});
const { data: pinned } = await admin.community.posts.setPinned('post-id', true);
console.log(pinned.pinned, pinned.pinnedAt); // re-pinning keeps the original pinnedAt
await admin.community.posts.setPinned('post-id', false);

// React to a post (toggle like/unlike)
const reaction = await bold.community.posts.react('viewer-uuid', 'post-id');
console.log(reaction.reacted, reaction.reactionsCount);
```

### Comments

```typescript
// Create a comment on a post
const { data: comment } = await bold.community.comments.create(
  'viewer-uuid',
  'post-id',
  { content: 'Great post!', mentions: ['customer-user-456'] }
);

// Reply to a comment (nested)
const { data: reply } = await bold.community.comments.create(
  'viewer-uuid',
  'post-id',
  { content: 'I agree!', parentId: 'parent-comment-id' }
);

// Delete a comment (owner or admin only)
await bold.community.comments.delete('viewer-uuid', 'comment-id');

// React to a comment (toggle)
const reaction = await bold.community.comments.react('viewer-uuid', 'comment-id');

// Read nested reaction state on comments/replies (viewerId enables viewerHasReacted)
const { data: post } = await bold.community.posts.get('post-id', 'viewer-uuid');
for (const thread of post.comments.items ?? []) {
  console.log(thread.createdAt, thread.reactions.count, thread.reactions.viewerHasReacted);
}
```

### Mention Inbox

```typescript
const { data: mentionItems, meta } = await bold.community.mentions.list(
  'viewer-uuid',
  { page: 1, pageSize: 20 }
);

const { data: unread } =
  await bold.community.mentions.unreadCount('viewer-uuid');

await bold.community.mentions.markRead('viewer-uuid', {
  ids: mentionItems.map((mention) => mention.id)
});

// Or mark every unread mention as read.
await bold.community.mentions.markRead('viewer-uuid', { all: true });
```

The optional `mentions` result is returned on post/comment creation only when
the request included a `mentions` array. Bold processes at most 25 supplied
external IDs; malformed, unresolved, or beyond-cap IDs appear in `skipped`,
while duplicates and self-mentions are omitted silently. A skipped ID never
fails content creation.

Mention `excerpt` values are plain, unsanitized content. Escape or sanitize
them before rendering as HTML.

---

## AI Methods

Chat, search, and recommendations support both streaming (default) and non-streaming modes.

### Voice sessions

Talk to a single video without managing WebRTC, microphone tracks, or caption fragments.
Voice requires the account's AI and voice features, a video transcript, and a browser
with microphone permission in a secure context (HTTPS, or localhost for development).
The factory is synchronous and safe to call during server rendering; only `start()`
uses browser APIs. No framework or additional dependencies are required.

For an operator-only page that tests an exact published npm release, see the
[voice acceptance harness](https://github.com/boldvideo/bold-js/tree/main/docs/voice).
Its documented synthetic checks do not establish real-provider or Safari/iPhone acceptance.

Use the account settings to decide whether to show voice controls. Missing or false
values keep voice hidden; the broker still enforces access when a session starts.

```typescript
const settings = await bold.settings();
const voiceEnabled = settings.data.account.voice?.enabled === true;
```

```typescript
const session = bold.ai.voice.createSession({
  videoId: 'lesson-slug',
  viewer: 'customer-123', // Optional viewer UUID or external ID
  onStatus: (status) => { statusLabel.textContent = status; },
  onCaptions: (turns) => {
    // Each turn has a stable id, speaker ('user' or 'assistant'), text,
    // startedAt/updatedAt in milliseconds, and seekable timestamp segments.
    captions.textContent = turns.map(turn => `${turn.speaker}: ${turn.text}`).join('\n');
  },
  onEnded: (reason) => console.log('Voice ended:', reason),
  onError: (error) => { errorLabel.textContent = error.message; },
});

// Start directly from a user gesture. Handle rejection even when using onError.
startButton.onclick = () => { void session.start().catch(() => {}); };
muteButton.onclick = () => session.setMuted(!session.muted);
endButton.onclick = () => { void session.end(); };

// Optional animation-frame polling: normalized RMS amplitudes, not volume settings.
const { input, output } = session.getAudioLevels();

// In your component unmount / video replacement callback, call session.dispose().
```

`createSession(options)` returns a **single-use** `VoiceSession`. Create a new handle
to reconnect. The broker request happens inside `start()`, after microphone permission
and SDP negotiation; callers do not supply SDP. Optional `viewerProfile` accepts a
string or an object of string, number, and boolean values, forwarded without changing
its keys. Viewer profiles require the account's viewers feature.

- Readonly state: `status`, `sessionId` (null until the broker responds), `muted`.
- Statuses: `idle → connecting → live → ending → ended`; remote shutdown may go
  directly to `ended`.
- `start(): Promise<void>` resolves when live, or when cancelled by `end()`/`dispose()`.
  Check `session.status` if subsequent code requires a live connection. Setup failures
  reject and call `onError`. Concurrent starts share one attempt.
- `setMuted(boolean)` disables microphone tracks locally, including when set before start.
- `setPlaybackState({ playing, currentTime })` mutes microphone and assistant audio
  while a video plays, restores the viewer's microphone mute choice when paused,
  and shares the video position with the assistant. Call on play, pause, ended, and
  seeked events (not every timeupdate). `currentTime` must be finite, non-negative
  seconds; context is deduplicated at whole-second precision. Pre-start updates are
  applied to new media immediately; only the latest context is sent when live.
  Calls after ending are ignored. This method does not operate your video player.
- `end(): Promise<void>` stops microphone/audio immediately and waits up to three seconds
  for close acknowledgement. It is idempotent; completion does not confirm final billing.
- `dispose()` silently releases everything immediately, including during setup or end.
  The SDK also disposes on `pagehide`; it cannot detect framework unmounts for you.
- End reasons: `user`, `idle`, `time`, `server`, `connection`, `error`.

Connection setup has a 60-second deadline **after microphone permission**; cancelling
also settles an unresolved permission prompt and stops any microphone tracks granted
later. There are no automatic retries of paid session creation. The SDK enforces the
server's maximum duration and idle limit while the page runs. Audible input/output or
transcript deltas and video playback count as activity; incoming silent audio frames do not.
Pausing the video restarts the idle window; playback never extends the maximum duration. Browser timers
can be throttled or suspended, so backend limits remain authoritative for billing.

Broker failures are `VoiceAPIError` instances with optional `status`, `code`, `retryable`,
`retryAfter` (raw HTTP header), `resetsOn`, and `originalError`. This includes
`voice_allowance_exceeded` (402), `voice_session_limit` (409), and `rate_limited` (429).
Microphone, playback, and WebRTC failures are ordinary `Error` instances. Provider error
events call `onError` but do not automatically end a live session.

**Captions and seek buttons.** Fragments from the same speaker within 1,500ms extend
the same turn, including when speakers overlap. `turn.segments` contains
`{ type: 'text', text }` and `{ type: 'timestamp', text, seconds }` entries. Render a
timestamp as a button whose click sets your video player's `currentTime` to `seconds`.
Both `m:ss` and `h:mm:ss` are supported, including `0:00`. Caption text is untrusted;
use text nodes or your framework's escaped text rendering, not `innerHTML`.
The pure helpers `appendVoiceCaption(turns, speaker, delta, now)` and
`splitVoiceTimestamps(text)` are also exported. The SDK does not control your video
player or inject an app-specific greeting.

If the provider requests a delegation, the SDK responds with a fixed English
transcript-only instruction: “Only this video transcript is available. Answer from it,
or say the video does not cover it.” This protocol response is also sent in non-English
sessions; `VoiceSessionOptions` does not expose language or instruction overrides.

**React cleanup.** Keep the handle in a ref, create it in an effect, and start it from
a click handler. Create a fresh handle for each mount/video (including Strict Mode's
effect replay); do not start microphone capture in an effect.

```tsx
const voiceRef = useRef<VoiceSession | null>(null);

useEffect(() => {
  const session = bold.ai.voice.createSession({
    videoId,
    onStatus: setStatus,
    onCaptions: setCaptions, // useState<readonly VoiceCaptionTurn[]>([])
    onError: (error) => setError(error.message),
  });
  voiceRef.current = session;
  return () => {
    session.dispose();
    voiceRef.current = null;
  };
}, [bold, videoId]); // Keep the bold client stable across renders.

// In a button handler:
const startVoice = () => { void voiceRef.current?.start().catch(() => {}); };
```

Import `VoiceSession` and `VoiceCaptionTurn` as types from `@boldvideo/bold-js`, and
React hooks from `react`. Reset your displayed status/captions on video changes as needed.

### Chat

Library-wide conversational AI for deep Q&A across your entire video library.

```typescript
// Streaming (default)
const stream = await bold.ai.chat({ prompt: 'How do I price my SaaS?' });

for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
  if (event.type === 'sources') console.log('Sources:', event.sources);
}

// Non-streaming
const response = await bold.ai.chat({ 
  prompt: 'What are the best closing techniques?',
  stream: false 
});
console.log(response.content);
```

**Options:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | `string` | The user's question (required) |
| `focus` | `{ videoId: string; currentTime?: number }` | Answer from this video first, then widen to the library on a miss |
| `stream` | `boolean` | `true` (default) for SSE, `false` for JSON |
| `synthesize` | `boolean` | `true` (default); `false` returns library retrieval results without synthesis |
| `conversationId` | `string` | Pass to continue existing conversation |
| `collectionId` | `string` | Filter to a specific collection |
| `collectionIds` | `string[]` | Legacy library answer allow-list when `access` is omitted |
| `access` | `ChatAccess` | Advanced: explicit collection grants from a trusted server (see below) |
| `viewer` | `string` | Optional in open mode; gated chat/history require a resolved viewer. Identity/context, not authentication or proof of purchases |
| `viewerProfile` | `string \| Record<string, string \| number \| boolean>` | Optional viewer context |
| `tags` | `string[]` | Filter by tags |
| `videoId` | `string` | Deprecated: legacy video-only route; use `focus` for video-first library chat |
| `currentTime` | `number` | Legacy playback position in seconds (top-level `videoId` without `focus`); ignored when `focus` is present—use `focus.currentTime` |

### Video focus and collection access

Start with just the question and the current video's `videoId`:

```typescript
const stream = await bold.ai.chat({
  prompt: 'What is the main idea here?',
  focus: { videoId },
});

for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
}
```

Streaming and synthesis are on by default (`stream: true`, `synthesize: true`).
With `focus`, chat answers from that video first. If the video does not cover the
question, it widens directly to the library without asking a clarification question.
`focus.currentTime` is optional; add it in seconds when playback position matters.
Top-level `currentTime` is ignored whenever `focus` is present, even if top-level
`videoId` is also supplied. Focused requests must use `focus.currentTime`.
The focus video must still pass its own video authorization gate.

In open mode (the default), without `focus` or legacy `videoId`, chat uses normal library Q&A. Omitting `access`
uses the whole public, published, ready library, subject to legacy collection filters
(`collectionId`/`collectionIds`). This default is not a gated-product entitlement policy.
Focus always selects `/ai/chat`, even when top-level `videoId` is also set;
`videoId` alone keeps its legacy video-only route.

To continue, keep the returned `conversationId` and send the **current** `focus` and,
if used, `access` on every turn. They are per-turn inputs, not sticky conversation
settings. In open mode, a later turn can change or omit them. Gated conversations
instead require the same bound grants and focus video, as described below.

#### Advanced: collection access (trusted server)

For gated products, send explicit collection grants derived by a trusted server
from your entitlement checks. Access is a caller assertion: Bold does not validate
it against `viewer`. Do not accept grant lists directly from untrusted viewer input.
Use real collection IDs from that trusted integration:

```typescript
const stream = await bold.ai.chat({
  prompt: 'Where else can I learn about this?',
  focus: { videoId, currentTime: 312 },
  access: {
    answer: [answerCollectionId],
    point: [pointCollectionId],
    mention: [{ collectionId: lockedCollectionId, offer: 'membership' }],
  },
});

for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
  if (event.type === 'scope' && event.widenedFrom === 'focus') {
    console.log('Looked beyond this lesson:', event.answeredFrom);
  }
  if (event.type === 'pointers') {
    for (const pointer of event.pointers) console.log(pointer.title, pointer.canonicalUrl, pointer.moments);
  }
  if (event.type === 'locked_matches') {
    // Resolve the opaque offer key in your own UI; Bold supplies no price or checkout URL.
    for (const match of event.lockedMatches) console.log(match.offer, match.videoCount, match.titles);
  }
}
```

- `access.answer` permits answers from those collections. `point` permits links
  and moments, not answers. `mention` permits locked-match titles/counts, not transcript text.
- With `access` present, omitted or empty lists mean **none**, and `collectionIds`
  is ignored by the server. For example, `access: {}` grants no collection access.
  With `access` absent, absent or empty `collectionIds` means the whole public,
  published, ready library, subject to other legacy filters. Collection grants do
  not bypass the focus video's authorization gate.
- The server accepts at most 200 entries per list; optional offer keys are 1–64 characters.
  Overlapping permissions resolve as `answer` > `point` > `mention`.
- Answers and pointers end resolution; locked-match offers are not appended after
  an answer or pointers. Resolve an opaque offer key in your own UI, not as a price
  or checkout URL supplied by Bold.

#### Gated tenants: Require verified AI access

The tenant-level **Require verified AI access** setting in Mission Control is off
by default and takes effect only when deliberately enabled. For gated chat, create
a **fresh server-only key** with the `verified_ai_access` capability. Existing,
browser and private keys do not automatically qualify. Never expose this key to a browser.

Your trusted server must check the viewer's purchases and permission to access the
focus video before supplying grants. Neither `viewer` nor an API credential proves
purchases. Gated creation, continuation and history require a resolved viewer and
explicit `access` on every request, including `access: {}` for focus-only access:

```typescript
// Server only: these values come from your verified identity/entitlement checks.
const serverBold = createClient(verifiedAiAccessKey);
const focus = { videoId };
const access = {}; // No library grants; the focus video still needs authorization.
const answer = await serverBold.ai.chat({
  prompt: 'What is the main idea here?',
  viewer, focus, access, stream: false,
});

if (answer.conversationId) {
  const history = await serverBold.ai.getConversation(answer.conversationId, {
    viewer, access, focus,
  });
  console.log(history.messages);
}
```

The server binds a conversation to its tenant/viewer and a digest of normalized
collection grants plus the focus video ID, not `focus.currentTime`. Continue with
the same `conversationId`, viewer and scope; playback time may change. Changed
grants or a changed/dropped focus video require a **new conversation**: omit
`conversationId` on the next chat request after rechecking entitlements. Do not
retry the old conversation or silently broaden access to work around rejection.

Unbound older conversations are unavailable while gated. Bound conversations
remain protected even after the setting is disabled. While gated, legacy
video-only chat, search, recommendations, voice and conversation listing are
unavailable; use unified `chat` with `focus`. Cross-conversation memory is not used.

**Handling gate failures.** Rejections arrive as JSON before an SSE stream starts,
so catch the awaited `chat`/`getConversation` call. `AIAPIError` exposes optional
`status`, `code` and `retryable`; its message includes the server's explanation.
Gate errors have `retryable: false`. The SDK does not automatically retry or switch
to an open endpoint. Non-JSON failures retain the HTTP status/message fallback.

| HTTP | Code | Action |
|------|------|--------|
| 403 | `verified_ai_access_required` | Use a fresh server-only verified-access key; do not move the call to a browser |
| 400 | `ai_access_required` | Send explicit grants, including `{}` for no library grants |
| 409 | `ai_access_scope_changed` | Recheck entitlements and start a new conversation with the current viewer/access/focus |
| 400 | `viewer_required` | Supply a viewer that the server can resolve |
| 404 | `viewer_not_found`, `conversation_not_found`, `video_not_found` | Check the identity, tenant and requested resource; do not broaden access on failure |
| 400 | `invalid_access`, `invalid_focus` | Correct the request shape |
| 403 | `verified_ai_route_unsupported` | Use unified chat with focus instead of an unsupported gated route |
| 503 | `ai_access_unavailable` | Access policy could not be verified; fail closed, without an open-mode fallback |

#### Response contracts and rendering

- `viewer` is a viewer UUID or external ID. `viewerProfile` accepts a string or
  an object of string, number and boolean values. `synthesize` optionally controls
  library synthesis; the SDK preserves `false` as well as `true`. With `false`,
  JSON (`AIRetrievalResponse`) and SSE `message_complete` return
  `responseType: 'retrieval'`, sources, confidence and metadata, without answer
  content or synthesis usage. Without `focus`/`access`, JSON calls with omitted or
  `true` synthesis retain `AIResponse`, an interface with required `content` and
  `usage` and `sources: Segment[]`. Opt-in `focus`/`access` answers use `AIChatResponse`: content remains a
  string, but `usage` can be null for pointers/locked matches. `AIChatUsage` is
  either `{ inputTokens, outputTokens }` or `{ promptTokens, completionTokens,
  totalCost? }`, matching the server fields without inventing totals. Check null
  and the field names before displaying usage, including on SSE terminal events.
  With a dynamic synthesis boolean, also narrow by `responseType` before reading content.
- `progress` includes `reading` and `widening` and an optional `scope` of `focus`
  or `library`. Render **unknown stages as a generic working state**.
- `scope.answeredFrom` is `focus`, `library` or `none`. Render a library scope line
  when widened; pointers link to owned content, while locked matches use your offer UI.
  JSON responses and `message_complete` also expose `scope`, `pointers`, and `lockedMatches`.
  Conversation messages retain these fields and user-message `focus` when present.
  Pointer `canonicalUrl` and moment `timestampUrl` may be null without a portal URL.
- Event type strings remain snake_case (`citation_map`, `locked_matches`), while
  payload properties are camelCase (`citationMap`, `lockedMatches`). Citation-map
  entry keys are opaque: look up `[c_a1b2]` using `citationMap['c_a1b2']` unchanged.
  The `citation_map` event maps IDs to source metadata; the final `answer` event
  maps IDs to zero-based indices into its sources array. These are different maps;
  neither is included in `message_complete` or the JSON answer response.
  Opt-in JSON answers, SSE events and conversation history use `AISource[]`, not
  `Segment[]`: focus sources may contain only `videoId` and `timestamp`, and library
  metadata such as `title` and `playbackId` may be null. Enriched focus citations
  expose optional `title`, `playbackId`, `playbackToken`, `slug`, `canonicalUrl` and
  `timestampUrl`; these fields may be absent or null, not guaranteed playback credentials.
  Check property presence
  (for example, `'text' in source`) and nullable fields before using them. Existing
  SSE/history consumers that assume every source is a `Segment` must add narrowing;
  the legacy source guarantee above applies only to non-opt-in JSON answers.
- Unknown event types still pass through at runtime. The parser stops at
  `message_complete` or `error`; ignore events your application does not recognize.

### Recommendations

Get AI-powered video recommendations based on topics — ideal for personalized learning paths, exam prep, and content discovery.

```typescript
// Streaming (default)
const stream = await bold.ai.recommendations({ 
  topics: ['contract law', 'ethics', 'client management'],
});

for await (const event of stream) {
  if (event.type === 'recommendations') {
    event.recommendations.forEach(rec => {
      console.log(`${rec.topic}:`);
      rec.videos.forEach(v => console.log(`  - ${v.title} (${v.relevance})`));
    });
  }
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta); // AI guidance
  }
}

// Non-streaming
const response = await bold.ai.recommendations({ 
  topics: ['sales', 'marketing'],
  stream: false 
});
console.log(response.guidance);
console.log(response.recommendations);
```

**Options:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `topics` | `string[]` | Topics to find content for (required) |
| `stream` | `boolean` | `true` (default) for SSE, `false` for JSON |
| `limit` | `number` | Max videos per topic (default: 5, max: 20) |
| `collectionId` | `string` | Filter to a specific collection |
| `tags` | `string[]` | Filter by tags |
| `includeGuidance` | `boolean` | Include AI learning path narrative (default: true) |
| `context` | `AIContextMessage[]` | Previous conversation turns for follow-ups |

### Search

Fast semantic search with a brief AI-generated summary.

```typescript
const stream = await bold.ai.search({ 
  prompt: 'pricing strategies',
  limit: 10 
});

for await (const event of stream) {
  if (event.type === 'sources') {
    console.log(`Found ${event.sources.length} results`);
  }
}
```

### AI interaction tracking

`chat` (library-wide or video-scoped), `ask`, `coach`, and `search` accept an
optional `requestId` UUID, sent as `request_id`. Generate it once per intentional
user action and reuse it when retrying that action. A new question, follow-up, or
intentional repeated search gets a new UUID. The SDK does not generate IDs or retry
requests automatically.

`search` also accepts `searchMode: 'preview' | 'settled'`, sent as `search_mode`.
Omitting it preserves the server's `settled` default. Use `preview` for interim
searches and `settled` for the final submitted search; treat that final submission
as a new action with its own UUID.

```typescript
const action = {
  prompt: 'pricing strategies',
  requestId: crypto.randomUUID(),
  searchMode: 'settled' as const,
  stream: false as const,
};
const response = await bold.ai.search(action);
// If retrying this action, pass the same action.requestId.
console.log(response.interactionId);
```

JSON `AIResponse` and SSE `message_complete` events expose
`interactionId?: string | null` (camelized from `interaction_id`). Search previews
may return `null`; older servers may omit it. These IDs support **analytics
deduplication only**, not response replay or model-call deduplication. Persistence
is best-effort and asynchronous: receiving an ID is **not a durable acknowledgement**.

This does not change `videos.search()`, which calls `/videos?query=…`; the SDK does
not wrap the separate keyword `/search` endpoint.

Chat, video chat, `ask`/`coach`, and AI search also accept optional attribution:
`channel: 'portal' | 'embed' | 'api' | 'mcp' | 'unknown'`, `clientName: string`, and
`clientVersion: string`. These are sent as top-level `channel`, `client_name`, and
`client_version`. Omitted fields stay omitted; the backend normalizes missing or
malformed channel values to `unknown`. Attribution does not affect `requestId`
deduplication. Set `channel: 'portal'` explicitly in portal server proxies; these
labels are analytics metadata, not authorization signals.

### Video-Scoped Chat

Chat about a specific video by passing `videoId`. Uses only that video's transcript as context.

```typescript
const stream = await bold.ai.chat({ 
  videoId: 'video-id',
  prompt: 'What is discussed at the 5 minute mark?' 
});

for await (const event of stream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
}

// With playback context (coming soon)
const stream = await bold.ai.chat({ 
  videoId: 'video-id',
  prompt: 'What does she mean by that?',
  currentTime: 847  // seconds
});
```

### Get Conversation History

In open mode, the existing one-argument call is unchanged:

```typescript
const conversation = await bold.ai.getConversation('550e8400-e29b-41d4-a716-446655440000');

console.log(`Created: ${conversation.createdAt}`);
for (const msg of conversation.messages) {
  console.log(`${msg.role}: ${msg.content}`);
}
```

For bound/gated history, use `getConversation(id, { viewer, access, focus })` with
the conversation's authorized scope and a server-only verified-access key, as in
the gated example above. The optional `GetConversationOptions` fields use the same
SDK shapes as chat. The SDK sends `viewer` as a query value and `access`/`focus` as
URL-encoded JSON in the GET query, preserving explicit `access: {}`; credentials
stay in the client's authentication headers, not the query.

### Rate an AI Answer

Use the optional `messageId` from a non-streaming `AIResponse` or a streaming
`message_complete` event to rate an assistant answer:

```typescript
const answer = await bold.ai.chat({ prompt: 'How do I get started?', stream: false });
if (answer.messageId) {
  const feedback = await bold.ai.rateMessage(answer.messageId, {
    rating: 'down',
    reasons: ['too_short'],
    note: 'Please include an example.',
  });
  await bold.ai.clearRating(feedback.messageId);
}
```

`rating` is `'up'` or `'down'`. Optional `reasons` accepts `'wrong'`,
`'not_in_video'`, `'too_short'`, `'off_topic'`, and `'other'`; `note` is optional.
`rateMessage` returns `MessageFeedback` with `messageId`, `rating`, `reasons`,
and a nullable `note`. `clearRating` resolves without a value. Both throw
`AIAPIError` with status 404 when the message is not on the caller's account.

### Multi-turn Conversations

Use the `context` parameter for follow-up questions:

```typescript
const first = await bold.ai.search({ 
  prompt: 'How do indie designers find clients?',
  stream: false 
});

const followUp = await bold.ai.search({
  prompt: 'What about cold outreach specifically?',
  context: first.context,
  stream: false
});
```

---

## Conversation Starters

Fetch conversation starter prompts, resolved per collection when available and
falling back to the account-level starters otherwise:

```typescript
// Account-level starters (no collectionIds)
const { data: starters } = await bold.conversationStarters.list();

// Resolve starters for one or more collections
const { data: starters } = await bold.conversationStarters.list({
  collectionIds: ['collection-uuid-1', 'collection-uuid-2']
});

starters.forEach((starter) => {
  console.log(starter.text, starter.source, starter.collectionId);
});
```

---

## Analytics

### Explicit AI engagement (browser or server)

`bold.trackEngagement(options: TrackEngagementOptions): Promise<void>` sends
`POST /api/v1/event` independently of legacy `trackEvent` and its throttle.
Import `TrackEngagementOptions` from `@boldvideo/bold-js`.

| SDK field | Wire field | Meaning |
|---|---|---|
| `event` | `n` | `source_open` or `video_progress` |
| `interactionId` | `interaction_id` | Required interaction UUID from an AI response |
| `openId` | `playback_id` | Required new UUID per deliberate source open; **not a Mux playbackId** |
| `videoId` | `vid` | Required source video ID |
| `viewer?` | `viewer` | Existing viewer UUID or external ID |
| `watchedSeconds` | `watched_seconds` | Required for `video_progress`, absent for `source_open`; cumulative elapsed **playing wall-clock seconds for this open** |

```typescript
// On a deliberate source open, skip if the response has no interaction ID.
if (response.interactionId) {
  const open = {
    interactionId: response.interactionId,
    openId: crypto.randomUUID(),
    videoId: source.videoId,
  };
  void bold.trackEngagement({ ...open, event: 'source_open' });

  // Later, after the caller has measured 12.5 seconds spent playing:
  void bold.trackEngagement({ ...open, event: 'video_progress', watchedSeconds: 12.5 });
}
```

`source_open` only establishes the open; progress requires that open. Maintain the
counter in the caller, excluding paused/buffering time. Do not send absolute
playhead positions, seek deltas, or per-sample increments. Retries/reordered
progress use the same `openId`; the backend keeps the cumulative maximum. Generate
a fresh `openId` when the user deliberately opens a source again.

Calls are best-effort and safe to fire and forget: transport errors are caught,
and no automatic retry or shared throttle is applied. A resolved promise (including
HTTP 202) is **not a durable acknowledgement**. The backend validates tenant, viewer,
and source attribution; it retries capture/open races for at most 30 seconds and
does not create placeholder interactions. Server proxies must derive API keys and
viewer references from trusted tenant/session context, not browser claims.

### Legacy playback and page views

Track video events and page views for analytics.

```typescript
// Track video events (play, pause, complete, etc.)
bold.trackEvent({
  type: 'play',
  videoId: 'video-id',
  timestamp: 0
});

// Track page views
bold.trackPageView({
  path: '/videos/my-video',
  referrer: document.referrer
});
```

---

## TypeScript

All types are exported for full TypeScript support:

```typescript
import type { 
  Video, 
  Playlist, 
  Settings,
  Portal,
  PortalHero,
  MenuItem,
  AIEvent,
  AIResponse,
  AIChatResponse,
  AIChatUsage,
  AIRetrievalResponse,
  ChatOptions,
  SearchOptions,
  RecommendationsOptions,
  RecommendationsResponse,
  Recommendation,
  Conversation,
  GetConversationOptions,
  ConversationMessage,
  Source,
  Viewer,
  ViewerProgress,
  ViewerLookupParams,
  ListProgressOptions,
  ListVideosOptions,
  ListVideosLatestOptions,
  ListVideosIndexOptions,
  NotificationChannels,
  NotificationPreferencesResponse,
  NotificationChannelUpdate,
  UpdateNotificationPreferencesData,
  NotificationProvider,
  RegisterDeviceData,
  RegisterDeviceResponse,
  // Community API
  Post,
  PostAuthor,
  Comment,
  ReactionResponse,
  Mention,
  MentionSkippedReport,
  CommunityPostCreateResponse,
  CommunityCommentCreateResponse,
  ListPostsOptions,
  ListMentionsOptions,
  MentionsUnreadCountResponse,
  MarkMentionsReadData,
  MarkMentionsReadResponse,
  CreatePostData,
  UpdatePostData,
  CreateCommentData,
  // Conversation Starters
  ConversationStarter,
  ConversationStarterSource,
  ListConversationStartersOptions
} from '@boldvideo/bold-js';
```

---

## Migration from v1.7.x

### Breaking: All response types now use camelCase

**All API responses** (videos, playlists, settings, AI) are now transformed to use idiomatic TypeScript/JavaScript naming:

```typescript
// Before (v1.7.x and earlier)
video.playback_id
video.published_at
video.stream_url
video.meta_data
settings.featured_playlists
settings.menu_items
settings.theme_config
playlist.is_private

// After (v1.8.0)
video.playbackId
video.publishedAt
video.streamUrl
video.metaData
settings.featuredPlaylists
settings.menuItems
settings.themeConfig
playlist.isPrivate
```

### Method Changes

| Old | New | Notes |
|-----|-----|-------|
| `bold.ai.ask(opts)` | `bold.ai.chat(opts)` | `ask()` still works but is deprecated |
| `bold.ai.coach(opts)` | `bold.ai.chat(opts)` | `coach()` still works but is deprecated |
| `bold.ai.chat(videoId, opts)` | `bold.ai.chat({ videoId, ...opts })` | Pass `videoId` in options |
| `bold.ai.recommend(opts)` | `bold.ai.recommendations(opts)` | `recommend()` still works but is deprecated |

### Type Renames

| Old Type | New Type |
|----------|----------|
| `AskOptions` | `ChatOptions` |
| `RecommendOptions` | `RecommendationsOptions` |
| `RecommendResponse` | `RecommendationsResponse` |

The old types are still exported as aliases for backward compatibility.

---

## Related Links

- **[Bold API Documentation](https://docs.boldvideo.io/docs/api)**
- **[GitHub Repository](https://github.com/boldvideo/bold-js)**
- **[npm Package](https://www.npmjs.com/package/@boldvideo/bold-js)**

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## Security

See [SECURITY.md](SECURITY.md) for security policies and reporting vulnerabilities.

## License

MIT
