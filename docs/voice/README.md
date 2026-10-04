# Published voice SDK verification

This operator-only page uses the existing SDK without application code. It is not a
customer integration or an authorization proxy. Never deploy it with credentials.
The real-session button makes a billable broker request; the explicitly labelled
synthetic loopback uses a local peer and never contacts Bold or a provider.

## Prepare an exact release

From the repository after `pnpm install --frozen-lockfile`:

```sh
node docs/voice/prepare.mjs 2.1.0
```

The script installs that exact npm release with lifecycle scripts disabled into a
fresh OS temporary directory, bundles its published ESM entry using the repository's
existing esbuild (via tsup), and copies the page into `site/`. It does not use local
`src/` or `dist/`, alter the repository lockfile, or load third-party browser scripts.
Keep the generated package-lock for dependency provenance during acceptance.

Serve **only the printed `site/` directory**, not the repository or temporary root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/bold-voice-XXXXXX/site
```

On the same computer, open `http://localhost:8765`. For a real iPhone, serve the
same static directory through a trusted HTTPS origin reachable by the phone;
plain HTTP over a LAN does not allow microphone capture. In an Amp orb, start the
server using `amp orb service start` and use `--portal` when remote access is needed.
Stop the server and delete the generated temporary root after testing.

Use only a designated disposable tenant, transcript-bearing video, and test viewer.
Enter credentials directly in the operator's browser, not a URL, source file,
terminal command, screenshot, or issue. The form does not use browser storage.
Do not save browser state or HAR files. Close the tab after testing. The real broker
must permit the page's origin through CORS; do not disable browser security to
work around it. A customer application must keep tenant credentials server-side and
perform authentication and entitlement checks in its proxy.

## Synthetic browser plumbing

Click **Run synthetic loopback**. Allow microphone capture and speak briefly so
the remote peer can measure nonzero input. The check negotiates two real browser
RTCPeerConnections, sends oscillator audio back to the SDK, sends synthetic caption
deltas over the data channel, verifies timestamp 1:23 → 83, checks mute/playback
coordination and context, and verifies synchronous microphone release and graceful
close acknowledgement. Its `finally` block restores fetch/media methods and releases
both peers and audio resources. It does not verify a physical speaker or a provider.

For reproducible Chromium automation in an orb:

```sh
agent-browser --session voice-check --args '--use-fake-device-for-media-stream,--use-fake-ui-for-media-stream' open http://localhost:8765
agent-browser --session voice-check --args '--use-fake-device-for-media-stream,--use-fake-ui-for-media-stream' click '#loopback'
agent-browser --session voice-check --args '--use-fake-device-for-media-stream,--use-fake-ui-for-media-stream' wait --fn 'window.checkResult !== undefined'
agent-browser --session voice-check --args '--use-fake-device-for-media-stream,--use-fake-ui-for-media-stream' eval 'window.checkResult'
agent-browser --session voice-check --args '--use-fake-device-for-media-stream,--use-fake-ui-for-media-stream' close
```

The automated lifecycle suite is wired into `pnpm test`. To exercise the same tests
against the installed release instead of the checkout build, replace `ROOT` below
with the temporary root printed by prepare (not its `site/` directory):

```sh
ROOT=/tmp/bold-voice-XXXXXX
mkdir "$ROOT/test"
cp test/voice.test.mjs "$ROOT/test/"
ln -s "$ROOT/node_modules/@boldvideo/bold-js/dist" "$ROOT/dist"
node --test "$ROOT/test/voice.test.mjs"
```

## Real provider/device acceptance still required

Run these on desktop Chromium and real Safari/iPhone, without fake media flags:

1. Record package version, browser/OS/device versions, and date. Start from a click.
   Speak and hear an answer grounded
   in the test video's transcript. Check captions and timestamp segments in the
   optional private panel. Use a matching local video to check seek/play/pause,
   microphone and assistant suppression during playback, and manual mute restoration.
2. End normally; verify the microphone indicator clears. Retain `sessionId` privately
   for support and usage reconciliation. SDK `end()` confirms local cleanup, not
   provider shutdown or final billing.
3. Cancel during the permission prompt and during negotiation. Grant delayed
   permission after cancelling; verify no microphone remains active. Deny permission
   in a fresh browser context. Exercise End, Dispose, and actual navigation/pagehide.
4. Use preconfigured missing-transcript and exhausted-allowance fixtures. Verify
   `VoiceAPIError` metadata, one request (no automatic retry), and microphone release.
   Do not spend down a real allowance just to construct the fixture.
5. Drop the network during setup and while live; record time until cleanup, end
   reason and callbacks. Transient `disconnected` is not immediate failure; the SDK
   closes on peer `failed`/data-channel close, or its limits. Confirm device release.
6. Record only the broker's `max_seconds`/`idle_seconds` (never SDP) and measure both
   limits, including silence, video playback, and backgrounding. Page timers may be
   suspended; backend enforcement must remain authoritative.
7. Run with the authenticated test viewer and inline profile, then without either.
   Verify the resolved viewer in backend usage. Forwarding context is not proof of
   viewer authentication or entitlement; the host owns those checks.

Only retain metadata: version/browser, synthetic vs real, status/reason/error code,
session ID, granted limits, elapsed duration, cleanup result, and reconciliation
outcome. Never attach dialogue, audio, SDP, profile values, credentials, or full
network captures. The on-page event log omits caption text and error messages;
the optional caption panel is private and must not appear in shared screenshots.

## Contract and observed results — 2026-10-04

The following describes the published SDK's wire format. The automated checks use
synthetic responses; they do not establish compatibility with a live service.

- POST `ai/voice/sessions` uses the SDK's baseURL/headers/Authorization. JSON fields
  are `video_id`, `sdp`, optional `viewer` and `viewer_profile` (profile keys unchanged).
  Undefined viewer/profile are omitted; the SDK does not derive identity.
- Success is unwrapped `{ session_id, sdp, max_seconds, idle_seconds }`. The SDK
  retains `session_id` after end for support and usage reconciliation.
- Broker errors retain HTTP status, `code`, `retryable`, `resets_on` → `resetsOn`,
  and raw Retry-After → `retryAfter`. Setup rejects and calls `onError`; explicit
  cancellation resolves `start()` without becoming live. Dispose is silent.

| Check | Result |
| --- | --- |
| Checkout lint / full suite | Passed; 106 tests, zero failures |
| Published `@boldvideo/bold-js@2.0.0` voice suite | Passed; 42 tests, zero failures |
| Linux headless Chromium 154.0.0.0, fake microphone | Synthetic loopback passed; input measured at remote peer and output at SDK both >0.02 RMS; timestamps, playback context, mute, acknowledged close and stopped tracks verified |
| Same browser, mocked 402 allowance response | `voice_allowance_exceeded`, ended status, microphone track ended; Start re-enabled and End disabled |
| Same browser, delayed microphone permission | End settled cancellation; late microphone track stopped |
| Real broker/provider and physical audio | **Not run**; requires a configured test account and physical audio devices |
| Real Safari/iPhone | **Not run**; Chromium is not Safari evidence |
| Provider shutdown / usage reconciliation | **Not run**; synthetic session IDs cannot establish this |

These baseline results were recorded against `2.0.0`. Version `2.1.0` releases the
documentation updates without changing the SDK runtime or public API. Rerun the
checks above for the exact release being evaluated; a version bump does not establish
real-provider or device acceptance.
Complete real-provider and device verification before relying on these results
for a production integration.
