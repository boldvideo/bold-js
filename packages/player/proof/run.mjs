// Drives a real browser against the fault proxy and records, for every
// failure shape, what the player did and what the server actually served.
//
//   node run.mjs <engine> [scenario ...]
//     engine: chrome | webkit | webkit-native
//
// SOURCE=playback-id (chrome only) gives the player a bare playback ID, as an
// app would, and redirects its requests for stream.mux.com to the proxy.
import { chromium, webkit } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const [engine = "chrome", ...only] = process.argv.slice(2);
const BY_ID = process.env.SOURCE === "playback-id";
const target = BY_ID ? "playback-id" : "urls";
const PROXY = "http://localhost:4477";
const ASSET = process.env.ASSET ?? "BV3YZtogl89mg9VcNBhhnHm02Y34zI1nlMuMQfAbl3dM";
// A long video, for the case where the stream dies while someone is watching.
const LONG_ASSET = process.env.LONG_ASSET ?? ASSET;
// That video's subtitle file (video.subtitles.url), to check captions carry over to the MP4.
const LONG_SUBS = process.env.LONG_SUBS;
// Each run gets its own server-side log, so nothing carries over between runs.
const RUN = Date.now().toString(36);
const OUT = new URL(`./out/${engine}-${target}/`, import.meta.url).pathname;

const SCENARIOS = [
  { id: "control", title: "Stream healthy (control)", faults: {}, expect: "hls" },
  { id: "master-503", title: "Manifest returns 503", faults: { master: "503" }, expect: "mp4" },
  { id: "master-503-late-play", title: "Manifest returns 503, viewer presses play 5s later", faults: { master: "503" }, expect: "mp4", playAfterMs: 5000 },
  { id: "master-404", title: "Manifest returns 404", faults: { master: "404" }, expect: "mp4" },
  { id: "master-reset", title: "Manifest connection is reset", faults: { master: "reset" }, expect: "mp4" },
  { id: "master-hang", title: "Manifest host accepts the request and never answers", faults: { master: "hang" }, expect: "mp4", timeoutMs: 60000 },
  { id: "master-garbage", title: "Manifest is an HTML error page served with status 200", faults: { master: "garbage" }, expect: "mp4" },
  { id: "rendition-503", title: "Manifest loads, every rendition playlist returns 503", faults: { rendition: "503" }, expect: "mp4", timeoutMs: 90000 },
  { id: "segments-503", title: "Playlists load, every media segment returns 503", faults: { segment: "503" }, expect: "mp4", timeoutMs: 180000 },
  { id: "mid-playback", title: "Stream dies 8s into playback", faults: {}, midFaults: { master: "503", rendition: "503", segment: "503" }, expect: "mp4", timeoutMs: 240000, long: true },
  { id: "master-403", title: "Manifest returns 403 (playback token rejected)", faults: { master: "403" }, expect: "no-fallback" },
  { id: "both-down", title: "Manifest and MP4 both return 503", faults: { master: "503", mp4: "503" }, expect: "error" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setFaults = (sid, faults) => fetch(`${PROXY}/__faults/${sid}`, { method: "POST", body: JSON.stringify(faults) });
const getLog = async (sid) => (await fetch(`${PROXY}/__log/${sid}`)).json();

const readVideo = () => {
  const v = document.querySelector("video");
  if (!v) return null;
  const src = v.currentSrc || "";
  return {
    // Proxy URLs, or in playback-ID mode the stream.mux.com URLs the player built itself.
    source: /\/mp4\/|\/highest\.mp4/.test(src) ? "mp4" : src.startsWith("blob:") || /\/hls\/|\.m3u8/.test(src) ? "hls" : "none",
    engine: src.startsWith("blob:") ? "hls.js" : /\/hls\/|\.m3u8/.test(src) ? "native HLS" : /\/mp4\/|\/highest\.mp4/.test(src) ? "progressive" : "-",
    currentTime: Number(v.currentTime.toFixed(2)),
    paused: v.paused,
    readyState: v.readyState,
    width: v.videoWidth,
    frames: v.getVideoPlaybackQuality?.().totalVideoFrames ?? null,
    error: v.error?.code ?? null,
    dialogOpen: !!document.querySelector(".media-dialog-popup[data-open]"),
    dialogOpens: window.__dialogOpens ?? 0,
  };
};

const pressPlay = () => {
  const v = document.querySelector("video");
  v.muted = true; // headless browsers refuse audible playback without a gesture
  v.play().catch(() => {});
};

async function runScenario(browser, scenario) {
  const sid = `${engine}-${target}-${scenario.id}-${RUN}`;
  await setFaults(sid, scenario.faults);

  const asset = scenario.long ? LONG_ASSET : ASSET;
  const hls = `${PROXY}/s/${sid}/hls/${asset}.m3u8`;
  const mp4 = `${PROXY}/s/${sid}/mp4/${asset}/highest.mp4`;
  const subs = scenario.long && LONG_SUBS ? `&subs=${encodeURIComponent(LONG_SUBS)}` : "";
  const page_url =
    (BY_ID
      ? `${PROXY}/react/index.html?s=${sid}&id=${asset}`
      : `${PROXY}/react/index.html?s=${sid}&hls=${encodeURIComponent(hls)}&mp4=${encodeURIComponent(mp4)}`) + subs;

  const record = scenario.id === "mid-playback";
  const context = await browser.newContext({
    viewport: { width: 880, height: 620 },
    ...(record ? { recordVideo: { dir: OUT, size: { width: 880, height: 620 } } } : {}),
  });
  const page = await context.newPage();
  if (BY_ID) {
    // The player builds real stream.mux.com URLs from the playback ID; send
    // exactly those two to the proxy so they can be failed.
    const redirect = (to) => (route) => route.fulfill({ status: 302, headers: { location: to, "access-control-allow-origin": "*" } });
    await page.route(`https://stream.mux.com/${asset}.m3u8*`, redirect(hls));
    await page.route(`https://stream.mux.com/${asset}/highest.mp4*`, redirect(mp4));
  }
  const consoleLines = [];
  page.on("console", (m) => consoleLines.push(m.text().slice(0, 200)));

  // "webkit-native" stands in for iPhones before iOS 17.1: no Media Source
  // Extensions, so hls.js cannot run and the browser plays HLS itself.
  if (engine === "webkit-native") {
    await page.addInitScript(() => {
      for (const name of ["MediaSource", "ManagedMediaSource", "WebKitMediaSource"]) {
        try { delete window[name]; } catch {}
        try { Object.defineProperty(window, name, { value: undefined, configurable: true }); } catch {}
      }
    });
  }
  // Count every time the player's error dialog becomes visible, however briefly.
  await page.addInitScript(() => {
    window.__dialogOpens = 0;
    let open = false;
    new MutationObserver(() => {
      const now = !!document.querySelector(".media-dialog-popup[data-open]");
      if (now && !open) window.__dialogOpens++;
      open = now;
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-open"] });
  });
  const started = Date.now();
  await page.goto(page_url);
  await page.waitForSelector("video", { state: "attached" });
  if (scenario.playAfterMs) await sleep(scenario.playAfterMs);
  await page.evaluate(pressPlay);

  const samples = [];
  const deadline = started + (scenario.timeoutMs ?? 30000);
  let faultedAt = null; // { wall, position } for the mid-playback case
  let fallbackSeenAt = null; // first sample on mp4 with data
  let verdict = null;

  while (Date.now() < deadline) {
    await sleep(500);
    const s = await page.evaluate(readVideo);
    if (!s) continue;
    s.wall = Date.now() - started;
    samples.push(s);

    if (scenario.midFaults && !faultedAt && s.source === "hls" && s.currentTime >= 8) {
      // The viewer has captions on when the stream dies.
      if (subs) await page.evaluate(() => {
        const t = [...document.querySelector("video").textTracks].find((t) => t.kind === "subtitles" || t.kind === "captions");
        if (t) t.mode = "showing";
      });
      await setFaults(sid, scenario.midFaults);
      faultedAt = { wall: s.wall, position: s.currentTime };
    }
    if (s.source === "mp4" && s.readyState >= 2 && !fallbackSeenAt) fallbackSeenAt = s;

    const want = scenario.expect;
    if (want === "hls" && s.source === "hls" && s.currentTime >= 6) { verdict = "played from HLS"; break; }
    if (want === "mp4" && fallbackSeenAt && !s.paused && s.frames > 0 && s.currentTime >= fallbackSeenAt.currentTime + 4) {
      verdict = "played from MP4";
      break;
    }
    if ((want === "no-fallback" || want === "error") && s.wall >= 12000) { verdict = "settled"; break; }
  }

  // Captions on the source that ended up playing: switch every captions
  // track on, give the browser a moment to load it, and count its cues.
  let captions = null;
  let captionsOn = null;
  if (subs) {
    captionsOn = await page.evaluate(() =>
      [...document.querySelector("video").textTracks].some((t) => (t.kind === "subtitles" || t.kind === "captions") && t.mode === "showing")
    );
    await page.evaluate(() => {
      for (const t of document.querySelector("video").textTracks) if (t.kind === "subtitles" || t.kind === "captions") t.mode = "hidden";
    });
    await sleep(2500);
    captions = await page.evaluate(() =>
      [...document.querySelector("video").textTracks]
        .filter((t) => t.kind === "subtitles" || t.kind === "captions")
        .map((t) => ({ label: t.label, cues: t.cues?.length ?? 0 }))
    );
  }

  // Let the last requests land in the server log, then collect the evidence.
  await sleep(500);
  const last = samples.at(-1);
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}${scenario.id}.png` });
  const pageText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 200);
  const log = await getLog(sid);
  await context.close();
  if (record) {
    const video = await page.video()?.path();
    if (video) consoleLines.push(`recording: ${video}`);
  }

  const by = (kind) => log.filter((e) => e.kind === kind);
  const statuses = (kind) => by(kind).map((e) => e.status);
  const mp4Requests = by("mp4");
  const mp4Bytes = mp4Requests.reduce((n, e) => n + (e.bytes ?? 0), 0);
  const firstFailure = log.find((e) => e.fault && e.fault !== "ok");
  const failoverMs = firstFailure && mp4Requests[0] ? mp4Requests[0].t - firstFailure.t : null;

  // Pass/fail is decided from both sides: what the element reports and what the server served.
  let interruptionMs = null;
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  // A run where the proxy itself could not reach Mux says nothing about the player.
  const rigErrors = by("rig-error");
  check("test rig reached Mux for every request it forwarded", rigErrors.length === 0, rigErrors.map((e) => e.note).join("; ") || "no proxy errors");
  const playing = last && !last.paused && last.frames > 0 && last.width > 0;

  if (scenario.expect === "hls") {
    check("video is playing", playing, `t=${last?.currentTime}s, ${last?.frames} frames decoded`);
    check("playing the HLS stream", last?.source === "hls", last?.source);
    check("MP4 was never requested", mp4Requests.length === 0, `${mp4Requests.length} MP4 requests`);
  }
  if (scenario.expect === "mp4") {
    check("video is playing", playing && verdict, `t=${last?.currentTime}s, ${last?.frames} frames decoded, ${last?.width}px wide`);
    check("playing the MP4", last?.source === "mp4", last?.source);
    check("server delivered MP4 bytes", mp4Bytes > 0 && mp4Requests.some((e) => e.status === 206 || e.status === 200), `${(mp4Bytes / 1e6).toFixed(1)} MB in ${mp4Requests.length} requests`);
    check("server saw the stream fail first", !!firstFailure, firstFailure ? `${firstFailure.kind} -> ${firstFailure.status}` : "none");
    check("viewer never saw an error dialog", last?.dialogOpens === 0, `error dialog shown ${last?.dialogOpens} times`);
    if (faultedAt) {
      const firstMp4 = samples.findIndex((s) => s.source === "mp4" && s.readyState >= 2);
      // readyState >= 2 skips the instant of the switch, when the element has been reset but not yet reloaded.
      const lastHls = samples.slice(0, Math.max(firstMp4, 0)).filter((s) => s.source === "hls" && s.readyState >= 2).at(-1);
      const resumedAt = samples[firstMp4]?.currentTime;
      check("kept playing from the buffer after the stream was cut", lastHls?.currentTime > faultedAt.position, `cut at ${faultedAt.position}s, HLS played on to ${lastHls?.currentTime}s`);
      check("MP4 resumed where the viewer was, not from the start", Math.abs(resumedAt - lastHls?.currentTime) <= 2, `last HLS position ${lastHls?.currentTime}s, MP4 resumed at ${resumedAt}s`);
      // Wall time after the cut in which the picture did not advance.
      let frozenMs = 0;
      for (let i = 1; i < samples.length; i++) {
        if (samples[i].wall <= faultedAt.wall) continue;
        const wall = samples[i].wall - samples[i - 1].wall;
        const media = (samples[i].currentTime - samples[i - 1].currentTime) * 1000;
        frozenMs += Math.max(0, wall - Math.max(0, media));
      }
      // Reported, not judged: how long the viewer waited depends on how much
      // was buffered when the stream died versus how long hls.js keeps retrying.
      interruptionMs = Math.round(frozenMs);
      if (captions) {
        const loaded = captions.filter((c) => c.cues > 0);
        check("captions the viewer had on are still on", captionsOn === true, `captions showing: ${captionsOn}`);
        check("captions are still available on the MP4", loaded.length === 1 && captions.length === 1, captions.map((c) => `"${c.label}" ${c.cues} cues`).join(", ") || "no captions track");
      }
    }
  }
  if (scenario.expect === "no-fallback") {
    check("MP4 was never requested", mp4Requests.length === 0, `${mp4Requests.length} MP4 requests`);
    check("nothing is playing", !playing, `source=${last?.source}, t=${last?.currentTime}`);
    check("the player shows its error dialog", last?.dialogOpen, pageText);
  }
  if (scenario.expect === "error") {
    check("the player shows its error dialog", last?.dialogOpen, pageText);
    check("MP4 was tried", mp4Requests.length >= 1, `${mp4Requests.length} MP4 requests, statuses ${[...new Set(statuses("mp4"))]}`);
    // Once it has moved to the MP4 the player must not go back to the stream.
    // (How often the stream was tried before that is the engine's business:
    // native HLS asks for a failing manifest five times by itself.)
    const backToStream = mp4Requests[0] ? by("master").filter((e) => e.t > mp4Requests[0].t).length : 0;
    check("no going back and forth", mp4Requests.length <= 6 && backToStream === 0, `${by("master").length} manifest requests, then ${mp4Requests.length} MP4 requests, then ${backToStream} more manifest requests in ${last?.wall}ms`);
    check("nothing is playing", !playing, `source=${last?.source}, t=${last?.currentTime}`);
  }

  return {
    id: scenario.id,
    title: scenario.title,
    pass: checks.length > 0 && checks.every((c) => c.ok),
    checks,
    failoverMs,
    interruptionMs,
    wallMs: last?.wall,
    faultedAt,
    requests: {
      master: statuses("master"),
      rendition: [...new Set(statuses("rendition"))].map((s) => `${s} x${statuses("rendition").filter((x) => x === s).length}`),
      segment: [...new Set(statuses("segment"))].map((s) => `${s} x${statuses("segment").filter((x) => x === s).length}`),
      mp4: [...new Set(statuses("mp4"))].map((s) => `${s} x${statuses("mp4").filter((x) => x === s).length}`),
      analytics: by("analytics").length,
    },
    mp4Bytes,
    final: last,
    pageText,
    console: consoleLines.slice(-6),
    samples,
    log,
  };
}

const launcher = engine.startsWith("webkit") ? webkit : chromium;
const browser = await launcher.launch(
  engine === "chrome" ? { channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] } : {}
);
const version = browser.version();
const results = [];
for (const scenario of SCENARIOS) {
  if (only.length && !only.includes(scenario.id)) continue;
  const result = await runScenario(browser, scenario);
  results.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"}  ${scenario.id.padEnd(22)} failover=${result.failoverMs ?? "-"}ms  master=${JSON.stringify(result.requests.master)} mp4=${JSON.stringify(result.requests.mp4)} final=${JSON.stringify(result.final)}`);
  for (const c of result.checks) if (!c.ok) console.log(`      ✗ ${c.name}: ${c.detail}`);
}
await browser.close();
await mkdir(OUT, { recursive: true });
// A partial run replaces just the scenarios it ran.
if (only.length) {
  const previous = await readFile(`${OUT}results.json`, "utf8").then(JSON.parse, () => null);
  for (const old of previous?.results ?? []) if (!results.some((r) => r.id === old.id)) results.push(old);
  results.sort((a, b) => SCENARIOS.findIndex((x) => x.id === a.id) - SCENARIOS.findIndex((x) => x.id === b.id));
}
await writeFile(`${OUT}results.json`, JSON.stringify({ engine, version, target, asset: ASSET, longAsset: LONG_ASSET === ASSET ? null : "a long Bold-hosted video", ranAt: new Date().toISOString(), results }, null, 1));
console.log(`\n${engine} ${version} / ${target}: ${results.filter((r) => r.pass).length}/${results.length} passed -> ${OUT}results.json`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
