import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";

const url = process.env.PROOF_URL ?? "http://localhost:4488";
const session = "assistant-proof";
const env = { ...process.env, AGENT_BROWSER_ARGS: "--autoplay-policy=no-user-gesture-required,--mute-audio" };
function browser(...args) {
  const result = JSON.parse(execFileSync("agent-browser", ["--session", session, "--json", ...args], { env, encoding: "utf8" }));
  if (!result.success) throw new Error(JSON.stringify(result));
  return result.data;
}
const evaluate = code => browser("eval", code).result;
const wait = code => browser("wait", "--fn", code);
const click = selector => browser("click", selector);
const dock = "document.querySelector('.bold-assistant-dock')";
const captures = resolve(process.env.CAPTURES ?? "../../../.amp/in/artifacts");
mkdirSync(captures, { recursive: true });
function screenshot(name) { evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))"); browser("screenshot", resolve(captures, `${name}.png`)); }
function ask(text, finish = true) {
  browser("fill", "textarea", text); browser("press", "Enter");
  if (finish) wait("document.querySelector('[data-citation]') && ![...document.querySelectorAll('button')].some(b => b.textContent === 'Stop')");
}
function newQuestion() { click('[aria-label="New question"]'); }
function go(n) {
  click(n ? `#video-${n}` : "#library");
  wait(n ? `document.querySelector('[data-top-block] h2')?.textContent === 'Paper craft video ${n}' && !${dock}.hasAttribute('data-switching')`
    : `${dock}.dataset.place === 'library'`);
}
try {
  browser("open", url); browser("set", "viewport", "1440", "900", "2");
  evaluate("sessionStorage.clear()"); browser("reload");
  wait(`${dock}?.dataset.state === 'closed'`);
  screenshot("assistant-closed");
  click(".bold-assistant-launcher"); browser("wait", "textarea");
  screenshot("assistant-library");
  ask("How do I fold the base?", false);
  wait("!!document.querySelector('[data-citation=c_0_0]')");
  browser("focus", "[data-citation=c_0_0]");
  assert(evaluate(`(() => {
    window.focusedCitation = document.activeElement;
    window.focusedContent = document.querySelector('.bold-assistant-answer > p').textContent;
    return window.focusedCitation.dataset.citation === 'c_0_0'
      && [...document.querySelectorAll('button')].some(b => b.textContent === 'Stop');
  })()`), "Citation must receive focus before streaming completes");
  wait("document.querySelector('.bold-assistant-answer > p').textContent !== window.focusedContent && [...document.querySelectorAll('button')].some(b => b.textContent === 'Stop')");
  assert(evaluate("document.activeElement === window.focusedCitation && window.focusedCitation.isConnected"));
  wait("![...document.querySelectorAll('button')].some(b => b.textContent === 'Stop')");
  assert(evaluate("document.activeElement === window.focusedCitation && window.focusedCitation.isConnected"));
  console.log("PASS focus extra: citation focused while Stop is present; a later answer-text update observed during streaming; the same node stays focused through completion.");
  screenshot("assistant-answer");

  evaluate(`(() => { window.framesSeen = []; window.frameCount = 0; window.captureFrames = true; let previous;
    function frame() { if (!window.captureFrames) return; window.frameCount++;
      const d = document.querySelector('.bold-assistant-dock');
      const state = { scope: document.querySelector('[data-scope]')?.textContent,
        top: document.querySelector('[data-top-block]')?.textContent,
        thread: !!document.querySelector('[data-thread="true"]'),
        switching: d.hasAttribute('data-switching'), setAside: d.hasAttribute('data-set-aside') };
      const key = JSON.stringify(state);
      if (key !== previous) window.framesSeen.push({ ...state, firstFrame: window.frameCount, lastFrame: window.frameCount });
      else window.framesSeen.at(-1).lastFrame = window.frameCount;
      previous = key;
      requestAnimationFrame(frame); } requestAnimationFrame(frame); })()`);
  go(1);
  click("#video-2"); wait(`${dock}.hasAttribute('data-switching')`); screenshot("assistant-switching");
  wait("document.querySelector('[data-top-block] h2')?.textContent === 'Paper craft video 2'");
  go(3);
  const frames = evaluate("(() => { window.captureFrames = false; return { count: window.frameCount, states: window.framesSeen }; })()");
  const afterFirst = frames.states.slice(frames.states.findIndex(s => s.scope === "Looking at this video"));
  assert(afterFirst.length >= 5);
  assert(afterFirst.every(s => s.scope === "Looking at this video" && !s.thread));
  assert(afterFirst.some(s => s.switching));
  console.log(`PASS 1: ${frames.count} animation frames; lossless run-length frame log:\n${JSON.stringify(frames.states, null, 2)}`);

  assert(evaluate(`${dock}.hasAttribute('data-set-aside')`)); screenshot("assistant-set-aside");
  browser("find", "role", "button", "click", "--name", "Continue");
  assert(evaluate("!!document.querySelector('[data-thread=true]')"));
  assert(!evaluate(`${dock}.hasAttribute('data-set-aside')`));
  click('[data-citation="c_0_0"]');
  wait("document.querySelector('[data-top-block] h2')?.textContent === 'Paper craft video 1'");
  assert(!evaluate(`${dock}.hasAttribute('data-set-aside')`));
  newQuestion(); ask("A question during navigation", false);
  wait("!!document.querySelector('[data-answer]')"); go(2);
  wait("![...document.querySelectorAll('button')].some(b => b.textContent === 'Stop')");
  assert(evaluate("!!document.querySelector('[data-thread=true]')"));
  assert(!evaluate(`${dock}.hasAttribute('data-set-aside')`));
  console.log("PASS 2: clean set-aside; Continue, source-follow, and mid-answer navigation each retain the thread after completion.");

  newQuestion();
  wait("document.querySelector('video').readyState >= 2");
  screenshot("assistant-video-empty");
  evaluate("document.querySelector('video').currentTime = 40");
  wait("document.querySelector('video').currentTime === 40");
  assert(!evaluate("!!document.querySelector('[data-moment]')"));
  evaluate("document.querySelector('video').play()");
  wait("document.querySelector('video').currentTime > 40.5");
  evaluate("document.querySelector('video').pause()");
  wait("!!document.querySelector('[data-moment=paused]')"); screenshot("assistant-paused");
  evaluate("document.querySelector('video').currentTime -= 10");
  wait("!!document.querySelector('[data-moment=relistened]')");
  const range = evaluate("document.querySelector('[data-moment]').textContent");
  screenshot("assistant-relistened");
  evaluate("document.querySelector('video').playbackRate = 4; document.querySelector('video').play()");
  wait("!document.querySelector('[data-moment]')");
  evaluate("document.querySelector('video').pause()");
  console.log(`PASS 3: real muted HTMLVideoElement: arriving paused has no offer; play/pause offers explanation; backward seek offers ${range}; playback clears it.`);

  go(1); ask("Where are the folds?");
  assert.equal(evaluate("document.querySelector('[data-citation=c_0_0]').textContent"), "1");
  assert.equal(evaluate("document.querySelector('[data-citation=c_0_1]').textContent"), "1");
  assert.equal(evaluate("document.querySelectorAll('[data-source=\"1\"]').length"), 1);
  assert.equal(evaluate("document.querySelector('[data-citation=c_0_1]').getAttribute('href').split('&')[0]"), "/watch/video-1?t=30");
  click('[data-citation="c_0_1"]');
  wait("document.querySelector('video').currentTime >= 30 && document.querySelector('video').currentTime < 32");
  evaluate("document.querySelector('video').pause()");
  const pair = evaluate("[...document.querySelectorAll('[data-citation]')].slice(-2).map(n => n.textContent)");
  assert.deepEqual(pair, ["6", "7"]);
  console.log("PASS 4: sentences at 20s and 31s share passage 1; second chip seeks the actual player to 30s; two passages render chips 6 and 7.");

  for (const [w, h] of [[1440, 900], [390, 844]]) {
    browser("set", "viewport", String(w), String(h), "2");
    const before = evaluate("JSON.stringify(document.querySelector('#page-box').getBoundingClientRect().toJSON())");
    click('.bold-assistant-panel [aria-label="Close assistant"]');
    wait(`${dock}.dataset.state === 'closed'`);
    assert(evaluate("document.activeElement.classList.contains('bold-assistant-launcher')"));
    const closed = evaluate("JSON.stringify(document.querySelector('#page-box').getBoundingClientRect().toJSON())");
    assert.equal(closed, before);
    click(".bold-assistant-launcher");
    wait(`${dock}.dataset.state === 'open'`);
    assert.equal(evaluate("JSON.stringify(document.querySelector('#page-box').getBoundingClientRect().toJSON())"), before);
    browser("focus", "textarea");
    assert.equal(evaluate("getComputedStyle(document.querySelector('textarea')).outlineStyle"), "none");
    assert.equal(evaluate("getComputedStyle(document.querySelector('.bold-assistant-compose')).outlineWidth"), "2px");
    assert.equal(evaluate("getComputedStyle(document.querySelector('.bold-assistant-compose')).outlineStyle"), "solid");
    screenshot(w === 390 ? "assistant-narrow" : "assistant-video-answer");
    console.log(`PASS 5 (${w}x${h}): close restores launcher focus; identical open/closed page box ${before}`);
    console.log(`PASS composer focus (${w}x${h}): frame has a solid 2px outline; textarea has none.`);
  }
  browser("set", "viewport", "1440", "900", "2");
  browser("focus", "textarea"); browser("press", "Escape");
  wait(`${dock}.dataset.state === 'closed'`);
  assert(evaluate("document.activeElement.classList.contains('bold-assistant-launcher')"));
  assert(evaluate("document.querySelector('.bold-assistant-shell').hasAttribute('inert')"));
  browser("focus", "#page-input"); browser("press", "/");
  assert.equal(evaluate(`${dock}.dataset.state`), "closed");
  assert.equal(evaluate("document.querySelector('#page-input').value"), "/");
  browser("focus", ".bold-assistant-launcher"); browser("press", "/");
  wait("document.activeElement.tagName === 'TEXTAREA'");
  console.log("PASS 6: / opens and focuses; typing / in page input stays closed; Escape closes, makes panel inert, and returns focus.");

  browser("set", "media", "dark");
  assert.equal(evaluate("getComputedStyle(document.querySelector('.bold-assistant-panel')).backgroundColor"), "rgb(32, 34, 37)");
  assert.equal(evaluate("getComputedStyle(document.querySelector('textarea')).outlineStyle"), "none");
  assert.equal(evaluate("getComputedStyle(document.querySelector('.bold-assistant-compose')).outlineWidth"), "2px");
  screenshot("assistant-dark");
  browser("set", "media", "light", "reduced-motion");
  assert.equal(evaluate("getComputedStyle(document.querySelector('.bold-assistant-shell')).transitionDuration"), "0s");
  browser("fill", "textarea", "Keep this draft");
  click("#hide-dock");
  assert(evaluate(`${dock}.hidden && document.querySelector('.bold-assistant-shell').hasAttribute('inert')`));
  click("#hide-dock");
  assert.equal(evaluate("document.querySelector('textarea').value"), "Keep this draft");
  console.log("PASS appearance extras: dark surface rgb(32, 34, 37); reduced-motion transition 0s; hidden dock inert and draft preserved on return.");

  const bundleFiles = readdirSync(new URL("./dist/", import.meta.url)).filter(f => f.endsWith(".js"));
  for (const file of bundleFiles) assert(!/app\.boldvideo\.io|api\.boldvideo\.io|BOLD_API_KEY|Authorization/.test(readFileSync(new URL(`./dist/${file}`, import.meta.url), "utf8")), file);
  const panelFile = bundleFiles.find(f => f.startsWith("panel-"));
  const panel = readFileSync(new URL(`./dist/${panelFile}`, import.meta.url));
  console.log(`PASS 7: ${bundleFiles.length} built client JS files contain no API credential marker, Authorization header, or Bold API host. No real credential is used by this fixture.`);
  console.log(`Panel lazy chunk (production, minified, Markdown dependencies included; React shared): ${panel.length} bytes; ${gzipSync(panel).length} bytes gzip.`);

  const priorRequests = (await (await fetch(`${url}/__requests`)).json()).length;
  async function waitForStopRequest(aborted = false) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const logs = await (await fetch(`${url}/__requests`)).json();
      if (logs.slice(priorRequests).some(r => r.prompt === "stop this" && (!aborted || r.aborted))) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Stop proof: timed out waiting for ${aborted ? "abort" : "request"} at fake Bold`);
  }
  newQuestion(); ask("stop this", false);
  wait("[...document.querySelectorAll('button')].some(b => b.textContent === 'Stop')");
  await waitForStopRequest();
  browser("find", "role", "button", "click", "--name", "Stop");
  await waitForStopRequest(true);
  newQuestion(); ask("retry failure", false);
  browser("wait", "[role=alert]");
  browser("find", "role", "button", "click", "--name", "Try again");
  wait("!!document.querySelector('[data-citation]') && ![...document.querySelectorAll('button')].some(b => b.textContent === 'Stop')");
  const retried = (await (await fetch(`${url}/__requests`)).json()).filter(r => r.prompt === "retry failure");
  assert.equal(retried.at(-1).requestId, retried.at(-2).requestId);
  assert.equal(evaluate("document.querySelectorAll('[data-answer]').length"), 1);
  newQuestion(); ask("verified access", false);
  wait("document.querySelector('[role=alert]')?.textContent.includes('Require verified AI access')");
  screenshot("assistant-error");
  newQuestion();
  click('[aria-label="Earlier conversations"]');
  wait("document.querySelectorAll('.bold-assistant-history button').length > 0");
  screenshot("assistant-history");
  click(".bold-assistant-history button");
  wait("!!document.querySelector('[data-citation]')");
  browser("reload");
  wait("!!document.querySelector('[data-citation]')");
  console.log("PASS extras: Stop reaches fake Bold's signal; retry reuses UUID and replaces one turn; verified-access message unchanged; history lists, loads and resumes after reload.");
  click("#video-2"); click("#library");
  browser("wait", "1200");
  assert.equal(evaluate("location.pathname"), "/");
  assert.equal(evaluate("document.querySelector('main h1').textContent"), "Paper craft library");
  click("#video-2"); click("#video-3");
  wait("document.querySelector('[data-top-block] h2')?.textContent === 'Paper craft video 3'");
  assert.equal(evaluate("location.pathname"), "/watch/video-3");
  console.log("PASS navigation extra: Library cancels an in-flight route; rapid video choices commit only the latest destination.");
  const errors = browser("errors");
  assert(!errors.errors?.length, JSON.stringify(errors));
  console.log("All seven browser proofs and extra route checks passed in Chromium. Narrow viewport is not a real phone test.");
} catch (error) {
  console.error("Failure state:", evaluate(`({ dock: ${dock}?.outerHTML, active: document.activeElement?.outerHTML,
    visibility: getComputedStyle(document.querySelector('.bold-assistant-shell')).visibility })`));
  throw error;
} finally { browser("close"); }
