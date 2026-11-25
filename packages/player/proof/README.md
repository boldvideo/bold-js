# Does the fallback actually work?

This folder answers that by breaking a real stream in front of a real browser.

`fault-proxy.mjs` is a local server that sits between the player and Mux. It rewrites the HLS playlists so the manifest, the rendition playlists, the media segments and the MP4 each pass through it, and it can fail any of them on demand: an error status, a reset connection, a request that is never answered, an HTML error page with status 200.

`run.mjs` opens the built package (`harness.tsx`, which imports `../dist`) in a browser through that proxy, presses play, and decides pass or fail from two independent sides:

- the video element: which source it is on, whether frames are being decoded, whether the position advances, whether the error dialog was ever visible;
- the proxy's own request log: that the stream really failed, and that MP4 bytes really were served.

## Run it

```bash
pnpm install                          # in the repository root
pnpm --filter @boldvideo/player run build
cd packages/player/proof
npm install                           # Playwright
npx playwright install webkit         # once
bun build harness.tsx --outdir react --target browser --production
node fault-proxy.mjs &                # http://localhost:4477
./all.sh                              # every engine, then the table
```

`node run.mjs <engine> [scenario ...]` runs one engine, or a few scenarios of it. Engines:

| Engine | What it stands for |
| --- | --- |
| `chrome` | Installed Google Chrome, hls.js |
| `webkit` | Safari's engine, hls.js |
| `webkit-native` | Safari's engine with Media Source Extensions removed, so the browser plays HLS itself, as iPhones before iOS 17.1 do |

`SOURCE=playback-id node run.mjs chrome ...` gives the player a bare playback ID, as an app would, and redirects the two `stream.mux.com` URLs it builds to the proxy. It runs in Chrome only: the other engines fetch media outside the reach of request interception.

The "stream dies during playback" scenario needs a video longer than the default 36-second demo clip, which is fully buffered at once. Pass one with `LONG_ASSET=<mux playback id>`. Add `LONG_SUBS=<url of that video's subtitle file>` and the run also switches captions on before cutting the stream, then checks they are still on, and loaded, on the MP4.

Results land in `out/<engine>-<source>/results.json`, with a screenshot per scenario. `node summarize.mjs` prints one table across all of them. The last full run is in [`results.txt`](./results.txt).
