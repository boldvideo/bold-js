import { createClient, VoiceAPIError } from './sdk.js';
import { runLoopback } from './loopback.js';

const $ = id => document.getElementById(id);
const version = await fetch('./version.json').then(r => r.json());
$('version').textContent = `${version.package}@${version.version} — published npm artifact`;
let session;
let clipURL;
const log = value => { $('events').textContent += `${JSON.stringify(value)}\n`; };
function controls() {
  const active = session && session.status !== 'ended';
  $('start').disabled = $('loopback').disabled = !!active;
  $('mute').disabled = !active;
  $('end').disabled = $('dispose').disabled = !active;
  $('status').textContent = session?.status ?? 'idle';
  $('mute').textContent = session?.muted ? 'Unmute microphone' : 'Mute microphone';
}
function playback() {
  session?.setPlaybackState({ playing: !$('player').paused && !$('player').ended, currentTime: $('player').currentTime });
}
function captions(turns) {
  $('captions').replaceChildren(...turns.map(turn => {
    const row = document.createElement('p');
    row.append(`${turn.speaker}: `);
    for (const segment of turn.segments) {
      if (segment.type === 'text') row.append(segment.text);
      else {
        const button = document.createElement('button');
        button.textContent = segment.text;
        button.onclick = () => { $('player').currentTime = segment.seconds; playback(); };
        row.append(button);
      }
    }
    return row;
  }));
  log({ event: 'captions', turns: turns.length, timestamps: turns.flatMap(t => t.segments).filter(s => s.type === 'timestamp').length });
}
$('setup').onsubmit = event => {
  event.preventDefault();
  session?.dispose();
  $('events').textContent = '';
  $('captions').replaceChildren();
  let viewerProfile;
  try {
    viewerProfile = $('profile').value ? JSON.parse($('profile').value) : undefined;
    const base = new URL($('base').value);
    if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error();
  } catch {
    log({ event: 'invalid_config', hint: 'Use HTTPS (or localhost) and valid profile JSON.' });
    controls();
    return;
  }
  session = createClient($('key').value, { baseURL: $('base').value }).ai.voice.createSession({
    videoId: $('video').value,
    viewer: $('viewer').value || undefined,
    viewerProfile,
    onStatus: status => { controls(); log({ event: 'status', status, sessionId: session.sessionId }); },
    onCaptions: captions,
    onEnded: reason => log({ event: 'ended', reason, sessionId: session.sessionId }),
    onError: error => log(error instanceof VoiceAPIError
      ? { event: 'broker_error', status: error.status, code: error.code, retryable: error.retryable, resetsOn: error.resetsOn, retryAfter: error.retryAfter }
      : { event: 'browser_or_provider_error', name: error.name }),
  });
  playback();
  // Keep start synchronous with the gesture for Web Audio and Safari permission handling.
  void session.start().catch(() => {});
};
$('mute').onclick = () => { session.setMuted(!session.muted); controls(); };
$('end').onclick = () => { void session.end(); };
$('dispose').onclick = () => { session.dispose(); controls(); log({ event: 'disposed', sessionId: session.sessionId }); };
$('clip').onchange = () => {
  if (clipURL) URL.revokeObjectURL(clipURL);
  const file = $('clip').files[0];
  clipURL = file ? URL.createObjectURL(file) : undefined;
  if (clipURL) $('player').src = clipURL;
  else $('player').removeAttribute('src');
};
for (const event of ['play', 'pause', 'seeked', 'ended']) $('player').addEventListener(event, playback);
const meter = setInterval(() => {
  const levels = session?.getAudioLevels();
  $('levels').textContent = `Input RMS: ${(levels?.input ?? 0).toFixed(3)} · Output RMS: ${(levels?.output ?? 0).toFixed(3)}`;
}, 250);
window.addEventListener('pagehide', () => {
  clearInterval(meter);
  $('key').value = '';
  $('captions').replaceChildren();
  if (clipURL) URL.revokeObjectURL(clipURL);
});
window.addEventListener('pageshow', event => {
  // A cached page has disposed sessions, a stopped meter and revoked clip URLs.
  // Start fresh rather than restoring partially torn-down operator state.
  if (event.persisted) window.location.reload();
});
$('loopback').onclick = async () => {
  $('start').disabled = $('loopback').disabled = true;
  $('events').textContent = '';
  window.checkResult = undefined;
  $('status').textContent = 'Synthetic loopback running';
  try {
    window.checkResult = await runLoopback();
    log(window.checkResult);
    $('status').textContent = 'Synthetic loopback passed — not provider acceptance';
  } catch (error) {
    window.checkResult = { passed: false, check: error.message };
    log(window.checkResult);
    $('status').textContent = 'Synthetic loopback failed';
  } finally {
    $('start').disabled = $('loopback').disabled = false;
  }
};
controls();
