# Browser and packed-package proof

This rig imports the built assistant, not its source. Its server is the real `createAssistantHandler`, using `createFakeBold` to replay `syntheticAnswer`. All content is invented. No key or live Bold request is involved. The fake records cancellation and request IDs and seeds viewer-owned history after completed answers.

## Run the seven proofs

Install Node 20+, pnpm, Bun, ffmpeg, and `agent-browser` with Chromium. From the repository root:

```sh
pnpm install
pnpm run build
bash packages/assistant/proof/build.sh
```

Run `bun packages/assistant/proof/server.ts` in another terminal. It listens on port 4488; `PORT` overrides it. In an Amp orb, use a supervised service instead:

```sh
amp orb service start assistant-proof --command 'bun packages/assistant/proof/server.ts' --port 4488 --portal
```

Then run from `packages/assistant/proof`:

```sh
node run.mjs
```

`PROOF_URL` overrides the server URL. `CAPTURES` overrides the screenshot directory (default: the repository's `.amp/in/artifacts`). `build.sh` generates a local two-minute MP4 so playback assertions exercise a real video element without an external media host.

The script checks:

1. A library answer followed by three video routes: every animation frame records scope, top block, thread visibility, switching, and set-aside. The frame log is losslessly run-length encoded with inclusive frame ranges. Once a video appears, no frame returns to library scope during video switching.
2. Set-aside hides the old thread; Continue, following a source, and navigating during an answer retain it.
3. Arriving paused offers nothing; actual play/pause and backward seek produce the expected moment; playback clears it.
4. Nearby sentences share a passage number; clicking the second chip seeks the actual player to 30 seconds; a two-passage sentence has two chips.
5. Opening and closing leave the underlying page's bounding box identical at 1440×900 and 390×844. Close restores focus at both widths.
6. `/`, Escape, editing another field, focus return, and closed-panel inertness.
7. The minified client files contain no Bold API host, Authorization header or API-key marker. This is a boundary check, not a general secret scanner.

Extra checks cover Stop at the fake Bold signal, retry UUID reuse, the unchanged verified-access error, history list/load/reload, dark colour, reduced motion, and drafts surviving `hidden`. A focused citation must remain the same focused DOM node while more text streams in. Rapid navigation must cancel the previous route, including when returning to the library. The gzip measurement is the minified lazy panel chunk, including Markdown dependencies, with React in a shared chunk.

## Install the actual tarball in Next.js

From the repository root, choose two **new** scratch directories:

```sh
mkdir -p .amp/in/orb-backup
npm pack ./packages/assistant --pack-destination .amp/in/orb-backup/
node packages/assistant/proof/packed-app.mjs 18 .amp/in/orb-backup/boldvideo-assistant-0.1.0.tgz .amp/in/orb-backup/next18
node packages/assistant/proof/packed-app.mjs 19 .amp/in/orb-backup/boldvideo-assistant-0.1.0.tgz .amp/in/orb-backup/next19
```

The script installs the archive with npm, creates App Router pages and the real handler/fake Bold route, and runs a production build. It pins React 18.3.1 with Next 14.2.35 and React 19.3.1 with Next 16.4.6. It explicitly uses TypeScript's `bundler` resolver: Next 14's generated legacy resolver cannot find exports-map subpath declarations.

Start each generated app with `npm run start -- --hostname 127.0.0.1 --port 4498` (use 4499 for the other). In an orb, use `amp orb service start` with that command. Run:

```sh
node packages/assistant/proof/check-packed.mjs http://localhost:4498
node packages/assistant/proof/check-packed.mjs http://localhost:4499
```

The check reads server HTML before JavaScript, waits for hydration and the lazy composer, asks a question, checks a numbered citation and its URL, and rejects browser errors or React hydration warnings. It does not click that packed-app citation; actual seeking is covered by proof 4.

## Limits and failed runs

The captured runs are in [results.txt](./results.txt), with the final review-fix verification appended after the initial run. Chromium at a narrow width is not a real phone or Safari test. This rig does not verify a live Bold account, production authentication, a deployment adapter's disconnect handling, an upstream persistence guarantee, or npm publication.

Next 14 is used only for disposable React 18 compatibility testing. Its install reports two dependency vulnerabilities (one high, one critical); npm has no newer Next 14 patch. Do not deploy this generated legacy app. Neither Next nor its dependencies are assistant dependencies.

During development, Next 14 first failed declaration lookup with its default resolver; the fixture now sets `moduleResolution: "bundler"`. A packed React 19 check initially raced the lazy panel after the wrapper hydrated; the check now waits for the composer. One full browser run timed out waiting for keyboard focus while other browser/recording work ran. The subsequent full run and a separate 30-cycle narrow/wide keyboard run passed; the original timeout was not reproduced or conclusively attributed. A recording initially hovered a source row before streaming created it; the completed recording was inspected after sources appeared.
