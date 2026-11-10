import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AIAPIError, createClient } from '../dist/index.js';
import { retrievalResponse, turns } from './fixtures/ai-focus.mjs';

const requests = [];
let server;
let ai;
const captures = Object.fromEntries(['covered', 'widened', 'pointers', 'locked'].map(scenario => [scenario, {
  sse: readFileSync(new URL(`./fixtures/ai-chat/${scenario}.sse`, import.meta.url)),
  json: JSON.parse(readFileSync(new URL(`./fixtures/ai-chat/${scenario}.json`, import.meta.url), 'utf8')),
  history: JSON.parse(readFileSync(new URL(`./fixtures/ai-chat/${scenario === 'covered' ? 'history' : `${scenario}-history`}.json`, import.meta.url), 'utf8')),
}]));

before(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    requests.push({ method: req.method, url: req.url, headers: req.headers, body, raw });
    const capture = body.prompt?.startsWith('recorded:') ? captures[body.prompt.slice(9)] : undefined;
    if (req.method === 'GET') {
      const path = new URL(req.url, 'http://localhost').pathname;
      const history = Object.values(captures).find(item => path === `/api/v1/ai/chat/${item.history.conversation_id}`).history;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(history));
      return;
    }
    const events = body.prompt === 'retrieval'
      ? [{ type: 'message_complete', ...retrievalResponse }]
      : turns[body.prompt] ?? turns.covered;
    if (req.headers.accept === 'text/event-stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      // Fragment JSON, CRLF delimiters and multibyte characters across real HTTP writes.
      const wire = capture?.sse ?? Buffer.from(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
      for (let i = 0; i < wire.length; i += 7) {
        res.write(wire.subarray(i, i + 7));
        await new Promise(resolve => setImmediate(resolve));
      }
      res.end();
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      const { type, ...result } = events.at(-1);
      res.end(JSON.stringify(capture?.json ?? result));
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

async function replayCapture(scenario) {
  const focus = captures[scenario].json.scope.focus;
  const options = { prompt: `recorded:${scenario}`, ...(focus ? { focus: { videoId: focus.video_id } } : { access: {} }) };
  const events = [];
  for await (const event of await ai.chat(options)) events.push(event);
  const json = await ai.chat({ ...options, stream: false });
  const history = await ai.getConversation(events.at(-1).conversationId);
  return { events, json, history };
}

for (const declaration of ['index.d.ts', 'index.d.cts']) {
  test(`legacy answers, captured contracts and focus/access examples type-check against ${declaration}`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'bold-focus-'));
    try {
      const files = ['ai-answer-compat-types.ts', 'ai-focus-types.ts'];
      for (const file of files) {
        const fixture = readFileSync(new URL(file, import.meta.url), 'utf8');
        writeFileSync(join(directory, file), fixture.replace("'../src/index'", "'@boldvideo/bold-js'"));
      }
      const recorded = [
        `import type { AIChatResponse, AIEvent, ConversationMessage } from '@boldvideo/bold-js';`,
        'function response<T extends AIChatResponse>(value: T): void {}',
        'function event<T extends AIEvent>(value: T): void {}',
        'function messages<T extends ConversationMessage[]>(value: T): void {}',
      ];
      for (const scenario of Object.keys(captures)) {
        const result = await replayCapture(scenario);
        recorded.push(`response(${JSON.stringify(result.json)});`);
        for (const item of result.events) recorded.push(`event(${JSON.stringify(item)});`);
        recorded.push(`messages(${JSON.stringify(result.history.messages)});`);
      }
      writeFileSync(join(directory, 'recorded.ts'), recorded.join('\n'));
      files.push('recorded.ts');
      writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'es2020', module: 'esnext', moduleResolution: 'bundler', strict: true,
          noEmit: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
          paths: { '@boldvideo/bold-js': [fileURLToPath(new URL(`../dist/${declaration}`, import.meta.url))] },
        },
        files,
      }));
      execFileSync(process.execPath, [
        fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)),
        '-p', join(directory, 'tsconfig.json'),
      ], { stdio: 'pipe' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const scenario of Object.keys(captures)) {
  test(`recorded controller ${scenario}: SSE, JSON and persisted history`, async () => {
    const { events, json, history } = await replayCapture(scenario);
    const terminal = events.at(-1);
    const raw = captures[scenario].json;
    const rawHistory = captures[scenario].history;
    const expectedTypes = {
      covered: ['message_start', 'conversation_created', 'progress', 'scope', 'text_delta', 'message_complete'],
      widened: ['message_start', 'conversation_created', 'progress', 'progress', 'progress', 'progress', 'scope', 'progress', 'sources', 'citation_map', 'text_delta', 'answer', 'message_complete'],
      pointers: ['message_start', 'conversation_created', 'progress', 'progress', 'scope', 'text_delta', 'pointers', 'message_complete'],
      locked: ['message_start', 'conversation_created', 'progress', 'progress', 'scope', 'text_delta', 'locked_matches', 'message_complete'],
    };
    assert.deepEqual(events.map(event => event.type), expectedTypes[scenario]);
    assert.equal(events.filter(event => ['message_complete', 'error'].includes(event.type)).length, 1);
    assert.ok(events.findIndex(event => event.type === 'scope') < events.findIndex(event => event.type === 'text_delta'));
    assert.equal(events.filter(event => event.type === 'text_delta').map(event => event.delta).join(''), raw.content);
    assert.equal(terminal.responseType, 'answer');
    assert.equal(terminal.content, raw.content);
    assert.deepEqual(terminal.scope, {
      answeredFrom: { covered: 'focus', widened: 'library', pointers: 'none', locked: 'none' }[scenario],
      widenedFrom: ['widened', 'pointers'].includes(scenario) ? 'focus' : null,
      reason: ['widened', 'pointers'].includes(scenario) ? 'not_covered' : null,
      focus: raw.scope.focus && { videoId: raw.scope.focus.video_id, title: raw.scope.focus.title },
    });
    for (const field of ['content', 'responseType', 'scope', 'sources', 'usage', 'pointers', 'lockedMatches']) {
      assert.deepEqual(json[field], terminal[field], `${scenario} JSON/SSE ${field}`);
    }
    assert.equal(json.conversationId, raw.conversation_id);
    assert.equal(json.messageId, raw.message_id);
    assert.equal(json.interactionId, raw.interaction_id);
    assert.equal(json.id, raw.id);
    assert.notEqual(json.conversationId, terminal.conversationId);
    const usage = { covered: { inputTokens: 10, outputTokens: 5 }, widened: { promptTokens: 10, completionTokens: 5, totalCost: 0.00008 }, pointers: null, locked: null }[scenario];
    assert.deepEqual(terminal.usage, usage);
    assert.deepEqual(terminal.citations, terminal.sources);
    assert.equal(Object.hasOwn(terminal, 'citationMap'), false);
    if (scenario === 'covered') assert.deepEqual(terminal.sources, [{ videoId: raw.scope.focus.video_id, timestamp: 12 }]);
    if (scenario === 'widened') {
      const early = events.find(event => event.type === 'sources').sources[0];
      assert.equal(early.id, null);
      assert.equal(early.sourceType, null);
      const map = events.find(event => event.type === 'citation_map').citationMap;
      assert.deepEqual(Object.keys(map), ['c_d78787']);
      assert.equal(map.c_d78787.cited, false);
      assert.equal(map.c_d78787.videoId, raw.sources[0].video_id);
      const answer = events.find(event => event.type === 'answer');
      assert.deepEqual(answer.citationMap, { c_d78787: 0 });
      assert.equal(answer.sources[answer.citationMap.c_d78787].id, 'c_d78787');
      assert.deepEqual(answer.sources, terminal.sources);
      assert.deepEqual(answer.usage, usage);
      assert.equal(terminal.sources[0].cited, true);
      assert.equal(terminal.sources[0].playbackId, null);
      assert.equal(terminal.sources[0].playbackToken, null);
      assert.equal(terminal.sources[0].timestampEnd, 17);
      assert.equal(terminal.sources[0].canonicalUrl, raw.sources[0].canonical_url);
      assert.deepEqual(json.metadata, { degraded: false, degradedReason: null, retrievalMode: 'normal' });
    }
    if (scenario === 'pointers') {
      assert.deepEqual(terminal.pointers, raw.pointers.map(pointer => ({
        videoId: pointer.video_id, title: pointer.title, collectionId: pointer.collection_id,
        canonicalUrl: pointer.canonical_url,
        moments: pointer.moments.map(moment => ({ timestamp: moment.timestamp, timestampEnd: moment.timestamp_end, timestampUrl: moment.timestamp_url })),
      })));
      assert.deepEqual(terminal.pointers.map(pointer => pointer.moments.map(moment => [moment.timestamp, moment.timestampEnd])), [[[94, 111], [110, 127]], [[12, 29]]]);
      assert.deepEqual(events.find(event => event.type === 'pointers').pointers, terminal.pointers);
    }
    if (scenario === 'locked') {
      assert.deepEqual(terminal.lockedMatches, raw.locked_matches.map(match => ({ offer: match.offer, collectionIds: match.collection_ids, videoCount: match.video_count, titles: match.titles })));
      assert.deepEqual(events.find(event => event.type === 'locked_matches').lockedMatches, terminal.lockedMatches);
      assert.deepEqual(Object.keys(terminal.lockedMatches[0]).sort(), ['collectionIds', 'offer', 'titles', 'videoCount']);
      assert.equal(terminal.lockedMatches[0].videoCount, 2);
    }
    if (['pointers', 'locked'].includes(scenario)) assert.deepEqual(terminal.sources, []);
    assert.equal(history.conversationId, terminal.conversationId);
    assert.equal(history.createdAt, rawHistory.created_at);
    assert.equal(history.updatedAt, rawHistory.updated_at);
    assert.equal(history.metadata.originalQuery, rawHistory.metadata.original_query);
    assert.deepEqual(history.messages.map(message => message.role), ['user', 'assistant']);
    const assistant = history.messages[1];
    assert.equal(assistant.id, terminal.messageId);
    assert.equal(assistant.interactionId, terminal.interactionId);
    assert.equal(assistant.insertedAt, rawHistory.messages[1].inserted_at);
    for (const field of ['content', 'scope', 'pointers', 'lockedMatches']) assert.deepEqual(assistant[field], terminal[field]);
    assert.equal(Object.hasOwn(assistant, 'usage'), false);
    assert.equal(Object.hasOwn(assistant, 'citationMap'), false);
    if (scenario === 'covered') {
      assert.deepEqual(assistant.sources.map(source => ({ videoId: source.videoId, timestamp: source.timestamp })), terminal.sources);
      assert.equal(assistant.sources[0].canonicalUrl, rawHistory.messages[1].sources[0].canonical_url);
      assert.equal(assistant.sources[0].timestampUrl, rawHistory.messages[1].sources[0].timestamp_url);
    } else assert.deepEqual(assistant.sources, terminal.sources);
    if (rawHistory.messages[0].focus) assert.deepEqual(history.messages[0].focus, { videoId: rawHistory.messages[0].focus.video_id, currentTime: 42 });
    assert.ok(requests.every(request => request.headers.authorization === 'synthetic-test-key'));
  });
}

test('history keeps open-mode requests unchanged and preserves explicit empty grants', async () => {
  const id = captures.covered.history.conversation_id;
  for (const options of [undefined, {}, { access: {} }, { viewer: 'viewer-1' }, { focus: { videoId: 'lesson-1' } }]) {
    const history = await ai.getConversation(id, options);
    const request = requests.at(-1);
    const url = new URL(request.url, 'http://localhost');
    assert.equal(history.conversationId, id);
    assert.equal(url.pathname, `/api/v1/ai/chat/${id}`);
    assert.deepEqual([...url.searchParams.keys()], options ? Object.keys(options) : []);
    assert.equal(url.searchParams.get('access'), options?.access ? '{}' : null);
    assert.equal(url.searchParams.get('viewer'), options?.viewer ?? null);
    assert.equal(url.searchParams.get('focus'), options?.focus ? '{"video_id":"lesson-1"}' : null);
    if (!options || !Object.keys(options).length) assert.equal(request.url, `/api/v1/ai/chat/${id}`);
    assert.equal(request.method, 'GET');
    assert.equal(request.raw, '');
    assert.equal(request.headers.authorization, 'synthetic-test-key');
    assert.equal(request.headers.accept, 'application/json');
  }
});

test('history URL-encodes viewer and JSON scope without leaking query delimiters', async () => {
  const viewer = 'external+viewer & name/é?admin=true#fragment';
  const history = await ai.getConversation(captures.covered.history.conversation_id, {
    viewer,
    focus: { videoId: 'lesson-1', currentTime: 0 },
    access: {
      answer: ['course-1', 'course-2'], point: [],
      mention: [{ collectionId: 'course-3', offer: 'membership + extras' }, { collectionId: 'course-4' }],
    },
  });
  const request = requests.at(-1);
  const url = new URL(request.url, 'http://localhost');
  assert.equal(history.conversationId, captures.covered.history.conversation_id);
  assert.deepEqual([...url.searchParams.keys()].sort(), ['access', 'focus', 'viewer']);
  assert.equal(url.searchParams.get('viewer'), viewer);
  assert.equal(url.hash, '');
  assert.deepEqual(JSON.parse(url.searchParams.get('focus')), { video_id: 'lesson-1', current_time: 0 });
  assert.deepEqual(JSON.parse(url.searchParams.get('access')), {
    answer: ['course-1', 'course-2'], point: [],
    mention: [{ collection_id: 'course-3', offer: 'membership + extras' }, { collection_id: 'course-4' }],
  });
  assert.equal(request.method, 'GET');
  assert.equal(request.raw, '');
  assert.equal(request.headers.authorization, 'synthetic-test-key');
  assert.equal(request.headers.accept, 'application/json');
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

  test(`synthetic retrieval-only response omits content and usage (${stream ? 'SSE' : 'JSON'})`, async () => {
    const response = await ai.chat({ prompt: 'retrieval', synthesize: false, stream });
    let result = response;
    if (stream) {
      const events = [];
      for await (const event of response) events.push(event);
      assert.deepEqual(events.map(event => event.type), ['message_complete']);
      result = events[0];
    }
    assert.deepEqual(requests.at(-1).body, { prompt: 'retrieval', synthesize: false, ...(!stream ? { stream: false } : {}) });
    assert.equal(result.responseType, 'retrieval');
    assert.equal(result.confidence, 'high');
    assert.deepEqual(result.metadata, { sourcesTruncated: false, temporalFallbackTriggered: false });
    assert.deepEqual(result.sources[1], {
      id: 'resource-citation', sourceType: 'resource', documentType: 'resource',
      resourceId: 'resource-1', title: 'Reference guide', text: 'Resource excerpt',
      videoId: null, timestamp: null, timestampEnd: null, playbackId: null,
      url: 'https://example.com/guide', speaker: null,
    });
    for (const key of ['content', 'usage', 'citations', 'citationMap']) assert.equal(Object.hasOwn(result, key), false);
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
          const answer = events.find(event => event.type === 'answer');
          assert.equal(answer.content, 'See [c_a1b2].');
          assert.deepEqual(answer.citationMap, { c_a1b2: 0, cA1b2: 1 });
          assert.equal(answer.sources[answer.citationMap.c_a1b2].timestamp, 94);
          assert.equal(answer.sources[answer.citationMap.cA1b2].timestamp, 132);
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
        assert.equal(Object.hasOwn(terminal, 'citationMap'), false);
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

// Synthetic HTTP responses using the server's verified error envelope, not recorded captures.
for (const [status, code, message] of [
  [403, 'verified_ai_access_required', 'A server-only verified AI access key is required.'],
  [400, 'ai_access_required', 'Explicit access is required; use {} for no library grants.'],
  [409, 'ai_access_scope_changed', 'Authorization scope changed or is unproven. Start a new conversation with the current viewer, access and focus.'],
]) {
  test(`${code} preserves server error details before JSON/SSE and on history without retry`, async (t) => {
    let count = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      count += 1;
      return Response.json({ type: 'error', code, message, retryable: false }, { status });
    });
    const options = { viewer: 'viewer-1', access: {}, focus: { videoId: 'lesson-1' } };
    for (const request of [
      () => ai.chat({ prompt: 'Question', ...options, stream: false }),
      () => ai.chat({ prompt: 'Question', ...options }),
      () => ai.getConversation('thread-1', options),
    ]) {
      await assert.rejects(request, error => {
        assert.ok(error instanceof AIAPIError);
        assert.equal(error.status, status);
        assert.equal(error.code, code);
        assert.equal(error.retryable, false);
        assert.ok(error.message.endsWith(message));
        return true;
      });
    }
    assert.equal(count, 3);
  });
}

test('non-JSON HTTP failures retain status fallback without inventing error details', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Bad gateway', { status: 502, statusText: 'Bad Gateway' }));
  await assert.rejects(ai.getConversation('thread-1'), error => {
    assert.ok(error instanceof AIAPIError);
    assert.equal(error.status, 502);
    assert.equal(error.code, undefined);
    assert.equal(error.retryable, undefined);
    assert.ok(error.message.endsWith('Bad Gateway'));
    return true;
  });
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
