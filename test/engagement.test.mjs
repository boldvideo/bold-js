import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import test, { after, before, beforeEach } from 'node:test';
import { createClient } from '../dist/index.js';

const interactionId = '550e8400-e29b-41d4-a716-446655440000';
const openId = '880e8400-e29b-41d4-a716-446655440099';
const requests = [];
let server;
let baseURL;

before(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push({ url: req.url, method: req.method, headers: req.headers, body: JSON.parse(raw) });
    if (req.headers.authorization === 'network-failure') {
      req.socket.destroy();
      return;
    }
    res.writeHead(req.headers.authorization === 'http-failure' ? 500 : 202);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}/api/v1/`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

beforeEach(() => { requests.length = 0; });

test('public engagement declarations require a counter only for progress', () => {
  const result = spawnSync(process.execPath, [
    'node_modules/typescript/bin/tsc', '--project', 'tsconfig.json', '--noEmit',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('source_open uses explicit IDs and configured tenant/viewer headers, omitting optional fields', async () => {
  const bold = createClient('tenant-a', { baseURL, headers: { 'X-Viewer-ID': 'trusted-viewer' } });
  assert.equal(await bold.trackEngagement({ event: 'source_open', interactionId, openId, videoId: 'video-7' }), undefined);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/api/v1/event');
  assert.equal(requests[0].headers.authorization, 'tenant-a');
  assert.equal(requests[0].headers['x-viewer-id'], 'trusted-viewer');
  assert.deepEqual(requests[0].body, {
    n: 'source_open', interaction_id: interactionId, playback_id: openId, vid: 'video-7',
  });
});

test('progress forwards cumulative seconds including zero, fractions, repeats, and reordered samples without throttling', async () => {
  const bold = createClient('tenant-a', { baseURL });
  await bold.trackEngagement({ event: 'source_open', interactionId, openId, videoId: 'video-7', viewer: 'external-user' });
  for (const watchedSeconds of [0, 12.5, 12.5, 3]) {
    await bold.trackEngagement({ event: 'video_progress', interactionId, openId, videoId: 'video-7', viewer: 'external-user', watchedSeconds });
  }
  assert.equal(requests.length, 5);
  assert.deepEqual(requests.slice(1).map(req => req.body), [0, 12.5, 12.5, 3].map(watched_seconds => ({
    n: 'video_progress', interaction_id: interactionId, playback_id: openId,
    vid: 'video-7', viewer: 'external-user', watched_seconds,
  })));
});

test('rapid events from independent clients/opens are not suppressed by global state', async () => {
  await Promise.all(['tenant-a', 'tenant-b'].map((tenant, index) => {
    const bold = createClient(tenant, { baseURL });
    return bold.trackEngagement({
      event: 'source_open', interactionId,
      openId: `880e8400-e29b-41d4-a716-44665544000${index}`, videoId: `video-${index}`,
    });
  }));
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(req => req.headers.authorization).sort(), ['tenant-a', 'tenant-b']);
  assert.equal(new Set(requests.map(req => req.body.playback_id)).size, 2);
});

for (const failure of ['http-failure', 'network-failure']) {
  test(`${failure} resolves harmlessly without leaking transport credentials or retrying`, async t => {
    const log = t.mock.method(console, 'error', () => {});
    const bold = createClient(failure, { baseURL });
    await assert.doesNotReject(bold.trackEngagement({ event: 'source_open', interactionId, openId, videoId: 'video-7' }));
    assert.equal(requests.length, 1);
    assert.deepEqual(log.mock.calls.map(call => call.arguments), [['Bold SDK - Failed to track engagement']]);
  });
}

test('legacy trackEvent keeps its payload, return value, and throttle independently of engagement', async t => {
  let scheduled;
  const globals = {
    location: { href: 'https://portal.example/video', hostname: 'portal.example' },
    document: { referrer: '' },
    navigator: { userAgent: 'legacy-browser' },
    window: { innerWidth: 1280, setTimeout: callback => { scheduled = callback; return 1; } },
  };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  t.after(() => scheduled?.());
  const bold = createClient('legacy-tenant', { baseURL });
  const video = { id: 'legacy-video', title: 'Legacy title', duration: 300 };
  const event = { type: 'timeupdate', target: { currentTime: 127 } };
  assert.equal(bold.trackEvent(video, event), undefined);
  bold.trackEvent(video, event);
  await bold.trackEngagement({ event: 'video_progress', interactionId, openId, videoId: 'video-7', watchedSeconds: 2 });
  // Legacy API is fire-and-forget; wait for the actual HTTP request, not its return value.
  for (let i = 0; requests.length < 2 && i < 100; i++) await delay(10);
  assert.equal(requests.length, 2);
  const legacy = requests.find(req => req.body.usr);
  assert.equal(legacy.url, '/api/v1/event');
  assert.match(legacy.body.usr, /^[a-z0-9]{30}$/);
  assert.deepEqual({ ...legacy.body, usr: '<generated>' }, {
    n: 'video_progress', u: 'https://portal.example/video', usr: '<generated>',
    d: 'portal.example', ua: 'legacy-browser', w: 1280,
    vid: 'legacy-video', vt: 'Legacy title', vdur: 300, time: 127,
  });
  assert.deepEqual(requests.find(req => req.body.interaction_id).body, {
    n: 'video_progress', interaction_id: interactionId, playback_id: openId, vid: 'video-7', watched_seconds: 2,
  });
});
