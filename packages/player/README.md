# @boldvideo/player

**The video player for [Bold](https://www.boldvideo.com).** One React component that takes a video from the Bold API and plays it, with everything a program's library needs already wired up.

[![npm](https://img.shields.io/npm/v/@boldvideo/player?style=flat-square)](https://www.npmjs.com/package/@boldvideo/player)

```tsx
<BoldPlayer video={video} />
```

Bold hosts every lecture and call you've recorded and answers your members from them, with the minute you said it. This is the player those answers land in: it opens at the minute, shows your chapters, and keeps playing when the stream has a bad day.

## What you get

- **Plays any Bold video.** Adaptive HLS, poster, timeline previews, captions, playback speed, picture-in-picture, fullscreen, keyboard shortcuts. Built on [Video.js 10](https://videojs.org).
- **Opens at the minute.** `startTime` starts playback where an answer points, and changing it seeks. The `ref` lets your transcript, chapter list or citations move the player.
- **Chapters on the timeline.** The video's chapters show up as segments, with titles as you scrub.
- **Analytics to Bold.** Hand it your bold-js client and loads, plays, pauses and progress are reported for you.
- **Keeps playing when the stream fails.** If the HLS stream cannot be loaded, the player continues from the video's static MP4 at the same second, with captions, without showing an error. [Tested against real failures](#when-the-stream-fails).
- **Signed playback.** Videos with secure playback work with the tokens the API returns.
- **Your settings, your brand.** Hand it your Bold settings and it takes your accent colour from them, and your logo when you want it shown. One prop overrides the colour.

## Install

```bash
npm install @boldvideo/player
```

Works with React 18 and 19. Video.js is included; there is nothing else to install.

## Quick start

Import the stylesheet once, in your root layout or app entry:

```tsx
import "@boldvideo/player/styles.css";
```

Fetch a video with [bold-js](https://www.npmjs.com/package/@boldvideo/bold-js) and render it:

```tsx
import { createClient } from "@boldvideo/bold-js";
import { BoldPlayer } from "@boldvideo/player";

const bold = createClient(process.env.BOLD_API_KEY!);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: video } = await bold.videos.get(id);
  return <BoldPlayer video={video} />;
}
```

That is a Next.js server component. The player is a client component, so the page needs no `"use client"` of its own.

## Analytics

Pass an SDK client as `bold` and the player reports load, play, pause and progress to Bold.

The player runs in the browser, and your API key must not. So the browser's client sends events to a route on your own site, and that route passes them to Bold with the key. In Next.js:

```ts
// app/api/bold/event/route.ts
export async function POST(request: Request) {
  // Only accept events from pages on this site.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return new Response(null, { status: 403 });
  }

  await fetch("https://app.boldvideo.io/api/v1/event", {
    method: "POST",
    headers: { Authorization: process.env.BOLD_API_KEY!, "Content-Type": "application/json" },
    body: await request.text(),
  }).catch(() => {});

  return new Response(null, { status: 204 });
}
```

```tsx
// components/player.tsx
"use client";

import { createClient, type Video } from "@boldvideo/bold-js";
import { BoldPlayer } from "@boldvideo/player";

// "browser" is not a Bold credential. Events go to the route above,
// which adds the real key on the server.
const bold = createClient("browser", { baseURL: "/api/bold" });

export function Player({ video }: { video: Video }) {
  return <BoldPlayer video={video} bold={bold} />;
}
```

Do not create the client in the browser with your real key, for example through a `NEXT_PUBLIC_` variable: anything in the browser bundle can be read by every visitor.

`bold` can be any object with a `trackEvent(video, event)` method, if you would rather send the events yourself.

## Open at the minute

Start where the answer is:

```tsx
<BoldPlayer video={video} startTime={754} autoPlay />
```

Changing `startTime` later seeks. For anything more, the `ref` is shaped like a media element, so code written against `<video>` works unchanged:

```tsx
import { useRef } from "react";
import { BoldPlayer, type BoldPlayerHandle } from "@boldvideo/player";

const player = useRef<BoldPlayerHandle>(null);

<BoldPlayer ref={player} video={video} />
<button onClick={() => (player.current!.currentTime = 90)}>Jump to 1:30</button>
```

It has `currentTime` (read and write), `duration`, `paused`, `readyState`, `play()`, `pause()`, `addEventListener()` and `removeEventListener()`, plus `media` for the underlying `<video>`. A seek made before the video has loaded is applied once it has.

## Settings and branding

Give the player your Bold settings and it follows them:

```tsx
const { data: settings } = await bold.settings();

<BoldPlayer video={video} settings={settings} />
```

From the settings it takes the accent colour of your theme and whether chapters are shown.

`branding` puts a logo in the player's top right corner, shown and hidden with the controls:

| `branding` | Logo | Accent colour |
| --- | --- | --- |
| `"none"` (default) | none | from your settings |
| `"account"` | your logo, from your settings | from your settings |
| `"bold"` | Bold's wordmark | Bold's |

```tsx
<BoldPlayer video={video} settings={settings} branding="account" />
<BoldPlayer video={video} branding="bold" />
```

When the settings carry `player.branding`, the player follows that and the prop is only needed to override it.

Anything else is yours to set:

```tsx
<BoldPlayer
  video={video}
  accentColor="#e11d48"
  showTitle
  style={{ "--media-border-radius": "12px" } as React.CSSProperties}
/>
```

`accentColor` wins over the settings and the branding. `showTitle` puts the video's title in the top left corner. The player fills its container's width at 16:9; `className` and `style` go on its root element, which also accepts the [Video.js skin properties](https://videojs.org/docs/framework/react/guides/customize-skins) such as `--media-border-radius` and `--media-font-family`.

Chapters and captions come from the video and can be switched off with `chapters={false}` and `captions={false}`.

## Astro and other frameworks

The player is a React component, so it runs anywhere React does. In Astro, add the [React integration](https://docs.astro.build/en/guides/integrations-guide/react/) and hydrate it:

```astro
---
import { createClient } from "@boldvideo/bold-js";
import { BoldPlayer } from "@boldvideo/player";
import "@boldvideo/player/styles.css";

const bold = createClient(import.meta.env.BOLD_API_KEY);
const { data: video } = await bold.videos.get(Astro.params.id);
---

<BoldPlayer client:load video={video} accentColor="#41c6a6" />
```

## Props

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `video` | `BoldPlayerVideo` | required | A video from bold-js, or any object with an `id` and a `playbackId` or `streamUrl`. |
| `bold` | `{ trackEvent }` | | Sends playback analytics to Bold. |
| `autoPlay` | `boolean` | `false` | Try to start immediately. Browsers may refuse unmuted autoplay; the poster then stays up. |
| `startTime` | `number` | | Start position in seconds. Changing it later seeks. |
| `settings` | `BoldPlayerSettings` | | Your settings from `bold.settings()`: accent colour, chapters, branding. |
| `branding` | `"none" \| "account" \| "bold"` | from `settings`, else `"none"` | Whose logo the player carries. |
| `accentColor` | `string` | | Colour of the progress bar and highlighted controls. Wins over `settings`. |
| `showTitle` | `boolean` | `false` | Show the video's title in the top left corner. |
| `poster` | `string` | `video.thumbnail` | Poster image. |
| `captions` | `boolean` | `true` | Offer the video's captions. |
| `chapters` | `boolean` | from `settings`, else `true` | Show the video's chapters on the timeline. |
| `mp4Fallback` | `boolean` | `true` | Continue from the static MP4 when the stream fails. |
| `className`, `style` | | | Applied to the player's root element. |
| `onLoadedMetadata`, `onPlay`, `onPause`, `onTimeUpdate`, `onEnded` | `(event: Event) => void` | | Native media events. |
| `onFallback` | `({ reason, resumeAt }) => void` | | Called once when playback moves to the MP4. |

The player reads these fields of the video: `id`, `title`, `playbackId`, `playbackToken`, `storyboardToken`, `streamUrl`, `thumbnail`, `chapters`, `chaptersUrl`, `subtitles`, `downloadUrls.legacyMp4`, `playbackSpeed`.

## When the stream fails

Every Bold video has an adaptive HLS stream and one static MP4. If the stream cannot be loaded, the player continues from the MP4 at the position the viewer had reached, at the speed they had chosen, with captions still on if they were on. The viewer sees no error. The player logs a warning and calls `onFallback`.

It falls back when the manifest, the rendition playlists or the media segments fail: an error status, a dropped connection, a host that never answers (given up on after two eight-second tries), or an error page served with status 200. With captions on, a captions playlist that cannot be loaded counts too. It does not fall back when the host rejects the playback token (401 or 403), because the MP4 uses the same token and would fail the same way. If the MP4 fails too, the player shows its error message; it does not go back and forth.

Each of those cases is run in real browsers against a proxy that breaks the stream on demand. The rig and the last results are in [`proof/`](./proof).

Things to know:

- The MP4 is one fixed quality, usually the highest. A session that has fallen back stays on the MP4.
- Mid-playback, the viewer keeps watching from the buffer while the stream is retried. If the buffer runs out first, there is a pause of some seconds before the MP4 takes over.
- The fallback covers a failing manifest, playlist or segment. The manifest and the MP4 are served from the same host, so it cannot cover that whole host being unreachable.
- iPhones before iOS 17.1 play HLS natively, and the native player does not report every failure. There, a manifest that returns an error falls back; an error page served with status 200 and segments that stop arriving do not.

## Signed playback

Videos with secure playback carry `playbackToken` and `storyboardToken` from the Bold API. The player uses them for the stream, the timeline previews and the MP4 fallback. Tokens expire; fetch the video again for fresh ones.

## Development

This package lives in the [bold-js repository](https://github.com/boldvideo/bold-js) under `packages/player`.

```bash
pnpm install
cd packages/player
pnpm test        # unit tests
pnpm run lint    # typecheck
pnpm run build   # dist/index.js, dist/index.d.ts, dist/styles.css
```

It tracks one Video.js 10 minor (`~10.7.0`), and `dist/styles.css` bundles that version's skin, so the styles always match the JavaScript that renders them.

Releases use [changesets](https://github.com/changesets/changesets), the same as the SDK.

## License

MIT
