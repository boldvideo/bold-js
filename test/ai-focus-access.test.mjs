import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AIAPIError, createClient } from '../dist/index.js';
import { turns } from './fixtures/ai-focus.mjs';

const requests = [];
let server;
let ai;

before(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    const events = turns[body.prompt] ?? turns.covered;
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ conversation_id: 'thread-1', messages: [turns.widened.at(-1)] }));
    } else if (req.headers.accept === 'text/event-stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      // Fragment JSON, CRLF delimiters and multibyte characters across real HTTP writes.
      const wire = Buffer.from(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
      for (let i = 0; i < wire.length; i += 7) {
        res.write(wire.subarray(i, i + 7));
        await new Promise(resolve => setImmediate(resolve));
      }
      res.end();
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      const { type, ...result } = events.at(-1);
      res.end(JSON.stringify(result));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  ai = createClient('synthetic-test-key', {
    baseURL: `http://127.0.0.1:${server.address().port}/api/v1/`,
  }).ai;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

beforeEach(() => { requests.length = 0; });

test('focus/access examples type-check against the built public declarations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bold-focus-'));
  try {
    const fixture = readFileSync(new URL('./ai-focus-types.ts', import.meta.url), 'utf8');
    writeFileSync(join(directory, 'types.ts'), fixture.replace("'../src/index'", "'@boldvideo/bold-js'"));
    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'es2020', module: 'esnext', moduleResolution: 'bundler', strict: true,
        noEmit: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
        paths: { '@boldvideo/bold-js': [fileURLToPath(new URL('../dist/index.d.ts', import.meta.url))] },
      },
      files: ['types.ts'],
    }));
    execFileSync(process.execPath, [
      fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
      '-p', join(directory, 'tsconfig.json'),
    ], { stdio: 'pipe' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const stream of [false, true]) {
  for (const conversationId of [undefined, 'thread-1']) {
    test(`focus takes precedence on ${conversationId ? 'continuation' : 'new'} ${stream ? 'SSE' : 'JSON'} requests`, async () => {
      for (const method of ['chat', 'ask', 'coach']) {
        const options = {
          prompt: 'covered', stream, conversationId,
          videoId: 'legacy-video', currentTime: 999,
          focus: { videoId: 'lesson-1', currentTime: 0 },
          access: { answer: [], point: ['owned-course'], mention: [
            { collectionId: 'members-only', offer: 'membership_key' },
            { collectionId: 'another-course' },
          ] },
          viewer: 'viewer-1', viewerProfile: { experience_level: 'beginner', age: 42, subscribed: false },
          collectionIds: ['legacy-filter'], synthesize: false,
        };
        const result = await ai[method](options);
        if (stream) for await (const event of result) assert.ok(event.type);
        const request = requests.at(-1);
        assert.equal(request.method, 'POST');
        assert.equal(request.url, `/api/v1/ai/chat${conversationId ? '/thread-1' : ''}`);
        assert.equal(request.headers.authorization, 'synthetic-test-key');
        assert.equal(request.headers.accept, stream ? 'text/event-stream' : 'application/json');
        assert.deepEqual(request.body, {
          prompt: 'covered', ...(!stream ? { stream: false } : {}),
          focus: { video_id: 'lesson-1', current_time: 0 },
          access: { answer: [], point: ['owned-course'], mention: [
            { collection_id: 'members-only', offer: 'membership_key' },
            { collection_id: 'another-course' },
          ] },
          viewer: 'viewer-1', viewer_profile: { experience_level: 'beginner', age: 42, subscribed: false },
          collection_ids: ['legacy-filter'], synthesize: false,
        });
        assert.deepEqual(options.access.answer, []);
      }
    });
  }

  test(`empty permissions and filters are not dropped (${stream ? 'SSE' : 'JSON'})`, async () => {
    for (const access of [{}, { answer: [], point: [], mention: [] }]) {
      const result = await ai.chat({ prompt: 'covered', stream, access, collectionIds: [], viewerProfile: 'A beginner', synthesize: true });
      if (stream) for await (const event of result) assert.ok(event.type);
      assert.deepEqual(requests.at(-1).body, {
        prompt: 'covered', ...(!stream ? { stream: false } : {}),
        access, collection_ids: [], viewer_profile: 'A beginner', synthesize: true,
      });
    }
  });

  for (const scenario of Object.keys(turns)) {
    test(`synthetic ${scenario} contract is camelized (${stream ? 'SSE' : 'JSON'})`, async () => {
      const response = await ai.chat({ prompt: scenario, stream, focus: { videoId: 'lesson-1' } });
      let terminal;
      if (stream) {
        const events = [];
        for await (const event of response) events.push(event);
        assert.deepEqual(events.map(event => event.type), turns[scenario].map(event => event.type));
        assert.deepEqual(events[1], { type: 'conversation_created', conversationId: 'thread-1' });
        assert.equal(events[2].message, 'Reading First lesson…');
        const scope = events.find(event => event.type === 'scope');
        assert.equal(scope.focus.videoId, 'lesson-1');
        assert.equal(scope.answeredFrom, scenario === 'covered' ? 'focus' : scenario === 'widened' ? 'library' : 'none');
        if (scenario === 'widened') {
          assert.deepEqual(events.filter(event => event.type === 'progress').map(event => event.stage), [
            'reading', 'widening', 'planning', 'searching', 'synthesizing',
          ]);
          const map = events.find(event => event.type === 'citation_map').citationMap;
          assert.deepEqual(Object.keys(map), ['c_a1b2', 'cA1b2']);
          assert.equal(map.c_a1b2.videoId, 'lesson-2');
          assert.equal(map.cA1b2.timestamp, 132);
          assert.equal(events.find(event => event.type === 'answer').content, 'See [c_a1b2].');
        }
        terminal = events.at(-1);
      } else {
        terminal = response;
      }
      assert.equal(terminal.scope.focus.videoId, 'lesson-1');
      assert.equal(requests.at(-1).body.focus.video_id, 'lesson-1');
      assert.equal(Object.hasOwn(requests.at(-1).body.focus, 'current_time'), false);
      if (scenario === 'covered') assert.deepEqual(terminal.sources, [{ videoId: 'lesson-1', timestamp: 94 }]);
      if (scenario === 'widened') {
        assert.equal(terminal.scope.widenedFrom, 'focus');
        assert.equal(terminal.scope.reason, 'not_covered');
        assert.deepEqual(Object.keys(terminal.citationMap), ['c_a1b2', 'cA1b2']);
        assert.equal(terminal.citationMap.c_a1b2.timestampEnd, 131);
        assert.equal(terminal.citationMap.cA1b2.timestamp, 132);
      }
      if (scenario === 'pointers') assert.deepEqual(terminal.pointers, [{
        videoId: 'lesson-2', title: 'Second lesson', collectionId: 'owned-course',
        canonicalUrl: 'https://example.com/lessons/second',
        moments: [{ timestamp: 94, timestampEnd: 131, timestampUrl: 'https://example.com/lessons/second?t=94' }],
      }]);
      if (scenario === 'locked') assert.deepEqual(terminal.lockedMatches, [{
        offer: 'membership_key', collectionIds: ['members-only'], videoCount: 2,
        titles: ['Third lesson', 'Fourth lesson'],
      }]);
    });
  }
}

test('conversation GET preserves opaque citation keys while camelizing segment values', async () => {
  const history = await ai.getConversation('thread-1');
  const map = history.messages[0].citationMap;
  assert.deepEqual(Object.keys(map), ['c_a1b2', 'cA1b2']);
  assert.equal(map.c_a1b2.videoId, 'lesson-2');
  assert.equal(map.cA1b2.timestamp, 132);
});

test('focus and access can change or disappear between turns without retained permissions', async () => {
  for (const options of [
    { focus: { videoId: 'lesson-1' }, access: { answer: ['course-1'] } },
    { focus: { videoId: 'lesson-2', currentTime: 42 }, access: { answer: [] } },
    {},
  ]) {
    await ai.chat({ prompt: 'covered', conversationId: 'thread-1', stream: false, ...options });
  }
  assert.deepEqual(requests.map(request => request.body), [
    { prompt: 'covered', stream: false, focus: { video_id: 'lesson-1' }, access: { answer: ['course-1'] } },
    { prompt: 'covered', stream: false, focus: { video_id: 'lesson-2', current_time: 42 }, access: { answer: [] } },
    { prompt: 'covered', stream: false },
  ]);
  assert.ok(requests.every(request => request.url === '/api/v1/ai/chat/thread-1'));
});

test('invalid access HTTP failures stay typed and are not retried', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests += 1;
    return Response.json({ error: 'invalid_access' }, { status: 400 });
  });
  for (const stream of [false, true]) {
    await assert.rejects(ai.chat({ prompt: 'test', access: { answer: [] }, stream }), error => {
      assert.ok(error instanceof AIAPIError);
      assert.equal(error.status, 400);
      return true;
    });
  }
  assert.equal(requests, 2);
});

for (const terminalType of ['message_complete', 'error']) {
  test(`parser passes unknown events through and stops/cancels at ${terminalType}`, async (t) => {
    let cancelled = false;
    t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode([
          ': keepalive', '', 'data: {"type":"future_event","nested_value":{"some_key":7}}', '',
          'data: {"type":"progress","stage":"future_stage","message":"Working"}', '',
          `data: ${JSON.stringify(terminalType === 'error'
            ? { type: 'error', code: 'invalid_access', message: 'Invalid access', retryable: false }
            : { type: 'message_complete', content: 'Finished', sources: [] })}`, '',
          'data: {"type":"text_delta","delta":"MUST NOT LEAK"}', '', '',
        ].join('\n')));
      },
      cancel() { cancelled = true; },
    })));
    const events = [];
    for await (const event of await ai.chat({ prompt: 'test' })) events.push(event);
    assert.deepEqual(events.map(event => event.type), ['future_event', 'progress', terminalType]);
    assert.deepEqual(events[0], { type: 'future_event', nestedValue: { someKey: 7 } });
    assert.equal(events[1].stage, 'future_stage');
    assert.equal(cancelled, true);
  });
}
