import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { AIAPIError, createClient } from '../dist/index.js';

const first = { type: 'text_delta', delta: 'First' };
const second = { type: 'text_delta', delta: ' second' };
const terminal = { type: 'message_complete', content: 'First second', sources: [] };
const sse = event => `data: ${JSON.stringify(event)}\n\n`;

async function fixture(t, { status = 200, complete = false, eof = false } = {}) {
  const state = { requests: [], requestClosed: false, socketClosed: false, responseFinished: false };
  const timers = new Set();
  let onSocketClose;
  const closed = new Promise(resolve => { onSocketClose = resolve; });
  const server = createServer((req, res) => {
    req.on('close', () => { state.requestClosed = true; });
    res.on('finish', () => { state.responseFinished = true; });
    req.socket.on('close', () => {
      state.socketClosed = true;
      state.responseFinished = res.writableFinished;
      onSocketClose();
    });
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      state.requests.push({ path: req.url, body });
      const streaming = req.headers.accept === 'text/event-stream';
      res.writeHead(status, { 'content-type': streaming ? 'text/event-stream' : 'application/json' });
      res.write(status !== 200 || !streaming ? '{' : sse(first));
      const timer = setTimeout(() => {
        if (status !== 200) res.end('"message":"Unavailable"}');
        else if (!streaming) res.end('"content":"First second","sources":[]}');
        else res.end(eof ? `data: ${JSON.stringify(second)}` : sse(second) + sse(terminal));
      }, complete ? 30 : 2000);
      timers.add(timer);
      res.on('close', () => { clearTimeout(timer); timers.delete(timer); });
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const ai = createClient('synthetic-test-key', {
    baseURL: `http://127.0.0.1:${server.address().port}/api/v1/`,
  }).ai;
  return { ai, state, closed };
}

// Observe the real fetch without replacing the HTTP transport or response body.
function observeHeaders(t) {
  const originalFetch = globalThis.fetch;
  let onHeaders;
  const headers = new Promise(resolve => { onHeaders = resolve; });
  t.mock.method(globalThis, 'fetch', async (...args) => {
    const response = await originalFetch(...args);
    onHeaders();
    return response;
  });
  return headers;
}

async function assertClosed(t, { state, closed }) {
  const start = performance.now();
  let timer;
  try {
    await Promise.race([closed, new Promise(resolve => { timer = setTimeout(resolve, 500); })]);
  } finally {
    clearTimeout(timer);
  }
  t.diagnostic(`within 500ms: req.close=${state.requestClosed}, socket.close=${state.socketClosed}, responseFinished=${state.responseFinished}, elapsed=${Math.round(performance.now() - start)}ms`);
  assert.equal(state.socketClosed, true, 'server never saw socket close within 500ms');
  assert.equal(state.responseFinished, false, 'response must close before natural completion');
}

function assertAbort(error) {
  assert.ok(error instanceof DOMException);
  assert.equal(error.name, 'AbortError');
  assert.equal(error instanceof AIAPIError, false);
}

for (const method of ['chat', 'ask', 'coach', 'search']) {
  test(`${method}: abort mid-stream closes the upstream socket and preserves AbortError`, { timeout: 5000 }, async t => {
    const f = await fixture(t);
    const controller = new AbortController();
    const stream = await f.ai[method]({ prompt: 'Question', signal: controller.signal });
    const iterator = stream[Symbol.asyncIterator]();
    assert.deepEqual(await iterator.next(), { value: first, done: false });
    const pending = iterator.next().then(value => ({ value }), error => ({ error }));
    controller.abort();
    await assertClosed(t, f);
    assertAbort((await pending).error);
    assert.deepEqual(f.state.requests[0].body, { prompt: 'Question' });
  });

  test(`${method}: abort during JSON body consumption closes the upstream socket`, { timeout: 5000 }, async t => {
    const f = await fixture(t);
    const controller = new AbortController();
    const headers = observeHeaders(t);
    const pending = f.ai[method]({ prompt: 'Question', stream: false, signal: controller.signal })
      .then(value => ({ value }), error => ({ error }));
    await headers;
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assertClosed(t, f);
    assertAbort((await pending).error);
    assert.deepEqual(f.state.requests[0].body, { prompt: 'Question', stream: false });
  });

  for (const stream of [true, false]) {
    test(`${method}: pre-aborted ${stream ? 'SSE' : 'JSON'} request never reaches the server`, async t => {
      const f = await fixture(t, { complete: true });
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(f.ai[method]({ prompt: 'Question', videoId: 'lesson-1', stream, signal: controller.signal }), error => {
        assertAbort(error);
        return true;
      });
      assert.deepEqual(f.state.requests, []);
    });
  }
}

test('break after the first event closes the upstream socket without a signal', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const events = [];
  for await (const event of await f.ai.chat({ prompt: 'Question' })) {
    events.push(event);
    break;
  }
  assert.deepEqual(events, [first]);
  await assertClosed(t, f);
});

test('return after the first event closes the upstream socket without a signal', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const iterator = (await f.ai.chat({ prompt: 'Question', videoId: 'lesson-1' }))[Symbol.asyncIterator]();
  assert.deepEqual(await iterator.next(), { value: first, done: false });
  assert.deepEqual(await iterator.return(), { value: undefined, done: true });
  await assertClosed(t, f);
  assert.equal(f.state.requests[0].path, '/api/v1/ai/videos/lesson-1/chat');
});

for (const eof of [false, true]) {
  test(`untouched stream reads every event through ${eof ? 'EOF with an unterminated block' : 'message_complete'}`, async t => {
    const f = await fixture(t, { complete: true, eof });
    const events = [];
    for await (const event of await f.ai.chat({ prompt: 'Question' })) events.push(event);
    assert.deepEqual(events, eof ? [first, second] : [first, second, terminal]);
    assert.equal(f.state.responseFinished, true);
  });
}

for (const stream of [true, false]) {
  test(`abort while reading an HTTP error body stays AbortError (${stream ? 'SSE' : 'JSON'})`, { timeout: 5000 }, async t => {
    const f = await fixture(t, { status: 503 });
    const controller = new AbortController();
    // Observe fetch resolving so abort exercises httpError's body read, not just fetch.
    const headers = observeHeaders(t);
    const pending = f.ai.chat({ prompt: 'Question', stream, signal: controller.signal })
      .then(value => ({ value }), error => ({ error }));
    await headers;
    // Let streamRequest/jsonRequest start consuming the error body.
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assertClosed(t, f);
    assertAbort((await pending).error);
  });
}
