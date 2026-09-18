import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createClient, VoiceAPIError, appendVoiceCaption, splitVoiceTimestamps } from '../dist/index.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const grant = { session_id: 'sess-123', sdp: 'answer', max_seconds: 600, idle_seconds: 60 };

function browser(t, overrides = {}) {
  const state = { requests: [], peers: [], contexts: [], audios: [], sessions: [], ...overrides };
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const media = { getTracks: () => [track], getAudioTracks: () => [track] };
  state.track = track;
  state.media = media;
  class Context {
    analysers = [];
    constructor() { state.contexts.push(this); }
    resume() { return Promise.resolve(); }
    close() { this.closed = true; return Promise.resolve(); }
    createAnalyser() {
      const analyser = { value: 128, getByteTimeDomainData(buffer) { buffer.fill(this.value); } };
      this.analysers.push(analyser);
      return analyser;
    }
    createMediaStreamSource() { return { connect() {} }; }
  }
  class Channel {
    readyState = 'connecting';
    sent = [];
    emit(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
    send(data) {
      this.sent.push(JSON.parse(data));
      if (JSON.parse(data).type === 'session.close' && state.ack !== false) this.emit({ type: 'session.closed' });
    }
    close() { this.readyState = 'closed'; this.onclose?.(); }
  }
  class Peer extends EventTarget {
    iceGatheringState = state.ice ?? 'complete';
    connectionState = 'new';
    channel = new Channel();
    constructor() { super(); state.peers.push(this); }
    addTrack(track) { this.trackEnabledOnAdd = track.enabled; }
    createDataChannel(name) { assert.equal(name, 'oai-events'); return this.channel; }
    createOffer() { return state.offer?.promise ?? Promise.resolve({ type: 'offer', sdp: 'v=0\r\nm=audio' }); }
    async setLocalDescription(offer) { this.localDescription = offer; await state.local?.promise; }
    async setRemoteDescription(answer) {
      this.remoteDescription = answer;
      await state.remote?.promise;
      this.channel.readyState = 'open';
      if (state.started !== false) this.channel.emit({ type: 'session.started' });
    }
    close() { this.closed = true; }
  }
  class Audio {
    constructor() { state.audios.push(this); }
    play() { return state.playError ? Promise.reject(state.playError) : Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const window = new EventTarget();
  window.AudioContext = Context;
  const globals = {
    window,
    navigator: { mediaDevices: { getUserMedia: () => state.permission?.promise ?? Promise.resolve(media) } },
    RTCPeerConnection: Peer,
    Audio,
    fetch: async (url, init) => {
      state.requests.push({ url: String(url), ...init });
      return state.fetch ? state.fetch(url, init) : Response.json(state.grant ?? grant);
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  state.window = window;
  state.create = (options = {}) => {
    const session = createClient('tenant-key', {
      baseURL: 'https://example.test/custom/api/v1', headers: { 'X-Tenant': 'test' },
    }).ai.voice.createSession({ videoId: 'lesson/one', ...options });
    state.sessions.push(session);
    return session;
  };
  t.after(() => state.sessions.forEach(session => session.dispose()));
  return state;
}

function clock(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 10000 });
  t.mock.method(performance, 'now', () => Date.now());
}

test('ESM and CommonJS import and create voice handles without browser globals', () => {
  const cjs = createRequire(import.meta.url)('../dist/index.cjs');
  for (const sdk of [{ createClient }, cjs]) {
    const session = sdk.createClient('key').ai.voice.createSession({ videoId: 'video' });
    assert.equal(session.status, 'idle');
    assert.equal(session.sessionId, null);
    assert.deepEqual(session.getAudioLevels(), { input: 0, output: 0 });
    session.dispose();
    assert.equal(session.status, 'ended');
  }
});

test('broker wire contract, single startup, pre-start mute and immediate acknowledged end', async t => {
  const b = browser(t);
  const statuses = [], ended = [];
  const session = b.create({ viewer: 'external-9', viewerProfile: { skill_level: 'new' },
    onStatus: value => statuses.push(value), onEnded: value => ended.push(value) });
  session.setMuted(true);
  const start = session.start();
  assert.equal(session.start(), start);
  await start;
  assert.equal(session.status, 'live');
  assert.equal(session.sessionId, 'sess-123');
  assert.equal(b.peers[0].trackEnabledOnAdd, false);
  assert.equal(b.requests.length, 1);
  const request = b.requests[0];
  assert.equal(request.url, 'https://example.test/custom/api/v1/ai/voice/sessions');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.Authorization, 'tenant-key');
  assert.equal(request.headers['X-Tenant'], 'test');
  assert.deepEqual(JSON.parse(request.body), {
    video_id: 'lesson/one', sdp: 'v=0\r\nm=audio', viewer: 'external-9', viewer_profile: { skill_level: 'new' },
  });
  session.setMuted(false);
  assert.equal(b.track.enabled, true);
  const ending = session.end();
  assert.equal(b.track.stopped, true);
  await ending;
  assert.deepEqual(statuses, ['connecting', 'live', 'ending', 'ended']);
  assert.deepEqual(ended, ['user']);
  assert.equal(b.peers[0].closed, true);
  assert.equal(b.contexts[0].closed, true);
  await session.end();
  assert.deepEqual(ended, ['user']);
  await assert.rejects(session.start(), /single-use/);
});

for (const action of ['end', 'dispose']) {
  test(`${action} settles startup during permission and stops late microphone tracks`, async t => {
    const permission = deferred();
    const b = browser(t, { permission });
    const errors = [], ended = [];
    const session = b.create({ onError: e => errors.push(e), onEnded: r => ended.push(r) });
    const start = session.start();
    await session[action]();
    await start;
    assert.equal(session.status, 'ended');
    permission.resolve(b.media);
    await flush();
    assert.equal(b.track.stopped, true);
    assert.equal(b.peers.length, 0);
    assert.equal(b.requests.length, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(ended, action === 'end' ? ['user'] : []);
  });
}

for (const stage of ['offer', 'local', 'ice', 'broker', 'body', 'remote']) {
  test(`end during ${stage} prevents late setup from reviving the session`, async t => {
    const pending = deferred();
    const settings = stage === 'ice' ? { ice: 'gathering' }
      : stage === 'broker' ? { fetch: () => pending.promise }
      : stage === 'body' ? { fetch: () => ({ ok: true, json: () => pending.promise }) }
      : { [stage]: pending };
    const b = browser(t, settings);
    const statuses = [];
    const session = b.create({ onStatus: s => statuses.push(s) });
    const start = session.start();
    await flush();
    await session.end();
    await start;
    pending.resolve(stage === 'broker' ? Response.json(grant) : stage === 'body' ? grant : { type: 'offer', sdp: 'offer' });
    b.peers[0].iceGatheringState = 'complete';
    b.peers[0].dispatchEvent(new Event('icegatheringstatechange'));
    await flush();
    assert.equal(session.status, 'ended');
    assert.equal(b.track.stopped, true);
    assert.equal(statuses.includes('live'), false);
    assert.equal(b.requests.length, ['broker', 'body', 'remote'].includes(stage) ? 1 : 0);
    if (b.requests.length) assert.equal(b.requests[0].signal.aborted, true);
  });
}

for (const stage of ['broker', 'body', 'started']) {
  test(`60-second watchdog bounds a hung ${stage} without retrying`, async t => {
    clock(t);
    const never = new Promise(() => {});
    const b = browser(t, stage === 'broker' ? { fetch: () => never }
      : stage === 'body' ? { fetch: () => ({ ok: true, json: () => never }) } : { started: false });
    const session = b.create();
    const rejection = assert.rejects(session.start(), /timed out/);
    await flush();
    t.mock.timers.tick(59999);
    assert.equal(session.status, 'connecting');
    t.mock.timers.tick(1);
    await rejection;
    assert.equal(b.track.stopped, true);
    assert.equal(b.requests[0].signal.aborted, true);
    assert.equal(b.requests.length, 1);
    assert.equal(session.status, 'ended');
  });
}

test('ICE timeout proceeds with the gathered offer', async t => {
  clock(t);
  const b = browser(t, { ice: 'gathering' });
  const session = b.create();
  const start = session.start();
  await flush();
  t.mock.timers.tick(2499);
  assert.equal(b.requests.length, 0);
  t.mock.timers.tick(1);
  await start;
  assert.equal(b.requests.length, 1);
});

test('end releases audio immediately but waits at most three seconds for acknowledgement', async t => {
  clock(t);
  const b = browser(t, { ack: false });
  const session = b.create();
  await session.start();
  const end = session.end();
  assert.equal(b.track.stopped, true);
  assert.equal(b.audios[0].paused, true);
  assert.deepEqual(session.getAudioLevels(), { input: 0, output: 0 });
  assert.equal(session.status, 'ending');
  assert.equal(b.peers[0].closed, undefined);
  t.mock.timers.tick(2999);
  assert.equal(session.status, 'ending');
  t.mock.timers.tick(1);
  await end;
  assert.equal(session.status, 'ended');
});

test('pagehide interrupts a graceful close silently and removes its listener', async t => {
  const b = browser(t, { ack: false });
  const statuses = [], ended = [];
  const session = b.create({ onStatus: s => statuses.push(s), onEnded: r => ended.push(r) });
  await session.start();
  const end = session.end();
  b.window.dispatchEvent(new Event('pagehide'));
  await end;
  assert.equal(session.status, 'ended');
  assert.deepEqual(statuses, ['connecting', 'live', 'ending']);
  assert.deepEqual(ended, []);
  assert.equal(b.peers[0].closed, true);
});

test('callbacks may throw or cancel synchronously without leaking startup', async t => {
  const b = browser(t);
  let session;
  session = b.create({ onStatus: status => {
    if (status === 'connecting') session.dispose();
    throw new Error('consumer failure');
  } });
  await session.start();
  assert.equal(session.status, 'ended');
  assert.equal(b.contexts.length, 0);
  assert.equal(b.requests.length, 0);
});

test('structured broker errors retain status, allowance reset and retry metadata', async t => {
  const b = browser(t, { fetch: () => Response.json({ code: 'voice_allowance_exceeded',
    message: 'Monthly allowance exhausted', retryable: false, resets_on: '2026-10-01',
  }, { status: 402, headers: { 'retry-after': '60' } }) });
  const errors = [];
  const session = b.create({ onError: e => errors.push(e) });
  await assert.rejects(session.start(), error => {
    assert.ok(error instanceof VoiceAPIError);
    assert.equal(error.status, 402);
    assert.equal(error.code, 'voice_allowance_exceeded');
    assert.equal(error.message, 'Monthly allowance exhausted');
    assert.equal(error.retryable, false);
    assert.equal(error.resetsOn, '2026-10-01');
    assert.equal(error.retryAfter, '60');
    assert.equal(errors[0], error);
    return true;
  });
  assert.equal(b.track.stopped, true);
});

test('non-JSON HTTP errors retain status and network failures retain their cause', async t => {
  const b = browser(t, { fetch: () => new Response('unavailable', { status: 503 }) });
  await assert.rejects(b.create().start(), e => e instanceof VoiceAPIError && e.status === 503);
  const cause = new TypeError('network failure');
  b.fetch = () => { throw cause; };
  await assert.rejects(b.create().start(), e => e instanceof VoiceAPIError && e.originalError === cause);
});

test('rejects malformed limits rather than leaving the session unlimited', async t => {
  const b = browser(t, { grant: { ...grant, max_seconds: '600' } });
  await assert.rejects(b.create().start(), /Invalid voice session response/);
  assert.equal(b.peers[0].remoteDescription, undefined);
  assert.equal(b.track.stopped, true);
});

test('caption grouping preserves overlap, stable IDs and exact gap boundaries', () => {
  const original = appendVoiceCaption([], 'assistant', 'See 1:', 100);
  const overlap = appendVoiceCaption(original, 'user', 'wait', 400);
  const merged = appendVoiceCaption(overlap, 'assistant', '23 now', 1600);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, original[0].id);
  assert.equal(merged[0].startedAt, 100);
  assert.equal(merged[0].updatedAt, 1600);
  assert.equal(merged[0].text, 'See 1:23 now');
  assert.equal(original[0].text, 'See 1:');
  assert.deepEqual(merged[0].segments, [
    { type: 'text', text: 'See ' }, { type: 'timestamp', text: '1:23', seconds: 83 }, { type: 'text', text: ' now' },
  ]);
  const next = appendVoiceCaption(merged, 'assistant', 'Next', 3101);
  assert.equal(next.length, 3);
  assert.notEqual(next[2].id, merged[0].id);
  assert.equal(appendVoiceCaption(next, 'user', '', 3500), next);
});

test('timestamps support hours and long minutes, while rejecting invalid whole tokens', () => {
  const text = '0:00, 1:02:03, 125:09; no 12:75, 1:65:00, 1:1 or 1:02:03:04.';
  const segments = splitVoiceTimestamps(text);
  assert.deepEqual(segments.filter(s => s.type === 'timestamp').map(s => [s.text, s.seconds]),
    [['0:00', 0], ['1:02:03', 3723], ['125:09', 7509]]);
  assert.equal(segments.map(s => s.text).join(''), text);
  assert.deepEqual(splitVoiceTimestamps(''), []);
});

test('provider captions emit timestamp segments, tolerate bad payloads, and ignore late events', async t => {
  const b = browser(t);
  const captions = [], errors = [], ended = [];
  const session = b.create({ onCaptions: c => captions.push(c), onError: e => errors.push(e), onEnded: r => ended.push(r) });
  await session.start();
  const channel = b.peers[0].channel;
  channel.onmessage({ data: 'not JSON' });
  channel.emit(null);
  channel.emit({ type: 'session.output_transcript.delta', delta: 'At 4:' });
  channel.emit({ type: 'session.input_transcript.delta', delta: 'yes' });
  channel.emit({ type: 'session.output_transcript.delta', delta: '32' });
  assert.equal(captions.at(-1)[0].text, 'At 4:32');
  assert.equal(captions.at(-1)[0].segments[1].seconds, 272);
  channel.emit({ type: 'error', error: { message: 'Try speaking again' } });
  assert.equal(session.status, 'live');
  assert.equal(errors[0].message, 'Try speaking again');
  channel.emit({ type: 'session.closed' });
  assert.deepEqual(ended, ['server']);
  channel.emit({ type: 'session.input_transcript.delta', delta: 'late' });
  assert.equal(captions.length, 3);
});

test('silence does not reset idle; audible output and captions do, without UI polling', async t => {
  clock(t);
  const b = browser(t, { grant: { ...grant, idle_seconds: 2 } });
  const ended = [];
  const session = b.create({ onEnded: reason => ended.push(reason) });
  await session.start();
  b.peers[0].ontrack({ streams: [b.media] });
  const output = b.contexts[0].analysers[1];
  output.value = 144; // 16 / 128 = 0.125 RMS
  t.mock.timers.tick(1750);
  assert.equal(session.getAudioLevels().output, 0.125);
  output.value = 128; // silent frames still arrive, but do not count as activity
  t.mock.timers.tick(1750);
  assert.equal(session.status, 'live');
  b.peers[0].channel.emit({ type: 'session.input_transcript.delta', delta: 'hello' });
  t.mock.timers.tick(1999);
  assert.equal(session.status, 'live');
  t.mock.timers.tick(1);
  assert.equal(session.status, 'ended');
  assert.deepEqual(ended, ['idle']);
});

test('max duration is elapsed time, includes broker latency, and is not extended by speech', async t => {
  clock(t);
  const pending = deferred();
  const b = browser(t, { fetch: () => pending.promise });
  const ended = [];
  const session = b.create({ onEnded: reason => ended.push(reason) });
  const start = session.start();
  await flush();
  t.mock.timers.tick(2000);
  pending.resolve(Response.json({ ...grant, max_seconds: 5 }));
  await start;
  b.contexts[0].analysers[0].value = 144;
  t.mock.timers.tick(2999);
  assert.equal(session.status, 'live');
  t.mock.timers.tick(1);
  assert.equal(session.status, 'ended');
  assert.deepEqual(ended, ['time']);
});

for (const stage of ['started', 'remote', 'broker']) {
  test(`server duration bounds ${stage} before live and rejects startup`, async t => {
    clock(t);
    const pending = deferred();
    const b = browser(t, { grant: { ...grant, max_seconds: 2 },
      ...(stage === 'started' ? { started: false }
        : stage === 'remote' ? { remote: pending } : { fetch: () => pending.promise }),
    });
    const errors = [], ended = [], statuses = [];
    const session = b.create({ onError: e => errors.push(e), onEnded: r => ended.push(r), onStatus: s => statuses.push(s) });
    const rejection = assert.rejects(session.start(), /expired before connecting/);
    await flush();
    t.mock.timers.tick(1999);
    assert.equal(session.status, 'connecting');
    t.mock.timers.tick(1);
    if (stage === 'broker') pending.resolve(Response.json(b.grant));
    await rejection;
    assert.equal(b.track.stopped, true);
    assert.equal(b.peers[0].closed, true);
    assert.deepEqual(ended, ['time']);
    assert.equal(errors.length, 1);
    if (stage === 'broker') assert.equal(b.peers[0].remoteDescription, undefined);
    else pending.resolve();
    await flush();
    assert.equal(statuses.includes('live'), false);
  });
}

test('server close before live is a setup failure, not explicit cancellation', async t => {
  const b = browser(t, { started: false, ack: false });
  const errors = [], ended = [];
  const session = b.create({ onError: e => errors.push(e), onEnded: r => ended.push(r) });
  const rejection = assert.rejects(session.start(), /closed before connecting/);
  await flush();
  b.peers[0].channel.emit({ type: 'session.closed' });
  await rejection;
  assert.equal(session.status, 'ended');
  assert.equal(b.track.stopped, true);
  assert.equal(b.peers[0].closed, true);
  assert.deepEqual(b.peers[0].channel.sent, []);
  assert.equal(errors.length, 1);
  assert.deepEqual(ended, ['server']);
});

test('clip playback mutes both media directions and preserves the manual mic choice', async t => {
  const b = browser(t);
  const session = b.create();
  await session.start();
  b.peers[0].ontrack({ streams: [b.media] });
  b.contexts[0].analysers.forEach(a => { a.value = 144; });
  session.setPlaybackState({ playing: true, currentTime: 83.9 });
  assert.equal(b.track.enabled, false);
  assert.equal(b.audios[0].muted, true);
  assert.equal(session.muted, false);
  assert.deepEqual(session.getAudioLevels(), { input: 0, output: 0 });
  session.setMuted(true);
  session.setPlaybackState({ playing: false, currentTime: 90 });
  assert.equal(b.track.enabled, false);
  assert.equal(b.audios[0].muted, false);
  assert.equal(session.muted, true);
  session.setMuted(false);
  assert.equal(b.track.enabled, true);
  assert.deepEqual(session.getAudioLevels(), { input: 0.125, output: 0.125 });
  session.setPlaybackState({ playing: true, currentTime: 90 });
  session.setMuted(false);
  assert.equal(b.track.enabled, false);
});

test('pre-start and connecting playback state apply to late media and send only the latest context', async t => {
  const permission = deferred();
  const b = browser(t, { permission });
  const session = b.create();
  session.setPlaybackState({ playing: false, currentTime: 0 });
  const start = session.start();
  session.setPlaybackState({ playing: true, currentTime: 3723 });
  permission.resolve(b.media);
  await start;
  assert.equal(b.peers[0].trackEnabledOnAdd, false);
  assert.equal(b.audios[0].muted, true);
  assert.deepEqual(b.peers[0].channel.sent, [{
    type: 'session.thinking.append', delegation_id: null,
    content: 'The viewer is playing the video at 1:02:03. They cannot hear you while it plays; stay quiet until they pause it.',
  }]);
});

test('playback context includes zero, deduplicates whole seconds, and reports seeks', async t => {
  const b = browser(t);
  const session = b.create();
  await session.start();
  session.setPlaybackState({ playing: false, currentTime: 0 });
  session.setPlaybackState({ playing: false, currentTime: 0.9 });
  session.setPlaybackState({ playing: true, currentTime: 83 });
  session.setPlaybackState({ playing: true, currentTime: 83 });
  session.setPlaybackState({ playing: true, currentTime: 100 });
  const sent = b.peers[0].channel.sent;
  assert.equal(sent.length, 3);
  assert.equal(sent[0].content, 'The viewer paused the video at 0:00.');
  assert.match(sent[1].content, /1:23/);
  assert.match(sent[2].content, /1:40/);
});

test('invalid playback updates cannot change media state; teardown cannot be undone', async t => {
  const b = browser(t);
  const session = b.create();
  await session.start();
  for (const currentTime of [-1, NaN, Infinity, '10']) {
    assert.throws(() => session.setPlaybackState({ playing: true, currentTime }), /currentTime/);
  }
  assert.throws(() => session.setPlaybackState({ playing: 'yes', currentTime: 1 }), /playing/);
  assert.equal(b.track.enabled, true);
  assert.equal(b.audios[0].muted, false);
  assert.equal(b.peers[0].channel.sent.length, 0);
  await session.end();
  session.setPlaybackState({ playing: false, currentTime: 0 });
  assert.equal(b.track.stopped, true);
  assert.equal(b.audios[0].paused, true);
  assert.deepEqual(b.peers[0].channel.sent, [{ type: 'session.close' }]);
});

test('clip playback counts as activity but cannot extend the maximum session duration', async t => {
  clock(t);
  const b = browser(t, { grant: { ...grant, idle_seconds: 2, max_seconds: 5 } });
  const ended = [];
  const session = b.create({ onEnded: reason => ended.push(reason) });
  await session.start();
  session.setPlaybackState({ playing: true, currentTime: 0 });
  t.mock.timers.tick(4999);
  assert.equal(session.status, 'live');
  t.mock.timers.tick(1);
  assert.deepEqual(ended, ['time']);
});

test('idle timeout resumes when the video pauses', async t => {
  clock(t);
  const b = browser(t, { grant: { ...grant, idle_seconds: 2 } });
  const ended = [];
  const session = b.create({ onEnded: reason => ended.push(reason) });
  await session.start();
  session.setPlaybackState({ playing: true, currentTime: 0 });
  t.mock.timers.tick(5000);
  session.setPlaybackState({ playing: false, currentTime: 5 });
  t.mock.timers.tick(1999);
  assert.equal(session.status, 'live');
  t.mock.timers.tick(1);
  assert.deepEqual(ended, ['idle']);
});
