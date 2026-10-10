import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test, { after, before, beforeEach } from 'node:test';
import { createClient } from '../dist/index.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const nextRequestId = '550e8400-e29b-41d4-a716-446655440001';
const interactionId = '880e8400-e29b-41d4-a716-446655440099';
const requests = [];
let server;
let ai;

before(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ url: req.url, method: req.method, body });
    const response = {
      content: 'An answer', sources: [], citations: [],
      response_type: 'answer', usage: { input_tokens: 3, output_tokens: 7 },
      ...(body.prompt === 'secure-playback' ? {
        sources: [{ playback_id: 'source-id', playback_token: 'PLAYBACK_TOKEN' }],
        citations: [{ playback_id: 'citation-id', playback_token: 'PLAYBACK_TOKEN' }],
      } : {}),
      ...(body.prompt === 'legacy' ? {} : {
        interaction_id: body.search_mode === 'preview' ? null : interactionId,
      }),
    };
    if (req.headers.accept === 'text/event-stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: {"type":"text_delta","delta":"An answer"}\r\n\r\n');
      if (body.prompt === 'secure-playback') {
        res.write(`data: ${JSON.stringify({ type: 'sources', sources: response.sources })}\r\n\r\n`);
      }
      const { sources, ...terminalResponse } = response;
      const frame = `data: ${JSON.stringify({ type: 'message_complete', ...terminalResponse })}\r\n\r\n`;
      // Split a JSON key across writes to exercise the real SSE buffering path.
      const split = frame.indexOf('content') + 3;
      res.write(frame.slice(0, split));
      setImmediate(() => res.end(frame.slice(split)));
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(response));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  ai = createClient('test-key', {
    baseURL: `http://127.0.0.1:${server.address().port}/api/v1/`,
  }).ai;
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

beforeEach(() => { requests.length = 0; });

async function complete(result, stream) {
  if (!stream) return result;
  const events = [];
  for await (const event of result) events.push(event);
  assert.deepEqual(events[0], { type: 'text_delta', delta: 'An answer' });
  assert.equal(events.length, 2);
  assert.equal(events[1].type, 'message_complete');
  return events[1];
}

for (const stream of [false, true]) {
  for (const method of ['chat', 'ask', 'coach']) {
    for (const videoId of [undefined, 'video-42']) {
      test(`${method} ${videoId ? 'video' : 'library'} ${stream ? 'SSE' : 'JSON'} preserves IDs and routes`, async () => {
        const response = await complete(await ai[method]({
          prompt: 'question', requestId, stream, videoId,
          conversationId: 'conversation-12', currentTime: 0,
          channel: 'portal', clientName: 'starter', clientVersion: '2.3.4',
        }), stream);
        assert.deepEqual(requests[0], {
          method: 'POST',
          url: `/api/v1/ai/${videoId ? 'videos/video-42/' : ''}chat/conversation-12`,
          body: {
            prompt: 'question', request_id: requestId,
            channel: 'portal', client_name: 'starter', client_version: '2.3.4',
            ...(videoId ? { current_time: 0 } : {}),
            ...(!stream ? { stream: false } : {}),
          },
        });
        assert.equal(response.interactionId, interactionId);
        assert.equal(Object.hasOwn(response, 'interaction_id'), false);
        assert.deepEqual(response.usage, { inputTokens: 3, outputTokens: 7 });
      });
    }
  }

  for (const searchMode of [undefined, 'preview', 'settled']) {
    test(`search ${searchMode ?? 'default'} ${stream ? 'SSE' : 'JSON'} wire contract`, async () => {
      const response = await complete(await ai.search({
        prompt: 'question', requestId, searchMode, stream,
        limit: 4, videoId: 'video-2', collectionId: 'collection-3',
        channel: 'embed', clientName: 'embed-player', clientVersion: '4.5.6',
      }), stream);
      assert.deepEqual(requests[0], {
        method: 'POST', url: '/api/v1/ai/search',
        body: {
          prompt: 'question', request_id: requestId,
          ...(searchMode ? { search_mode: searchMode } : {}),
          ...(!stream ? { stream: false } : {}),
          limit: 4, video_id: 'video-2', collection_id: 'collection-3',
          channel: 'embed', client_name: 'embed-player', client_version: '4.5.6',
        },
      });
      assert.equal(response.interactionId, searchMode === 'preview' ? null : interactionId);
      assert.equal(Object.hasOwn(response, 'interaction_id'), false);
    });
  }

  test(`legacy requests/responses remain unchanged (${stream ? 'SSE' : 'JSON'})`, async () => {
    for (const method of ['chat', 'ask', 'coach', 'search']) {
      const response = await complete(await ai[method]({ prompt: 'legacy', stream }), stream);
      assert.equal(Object.hasOwn(response, 'interactionId'), false);
      assert.deepEqual(requests.at(-1).body, {
        prompt: 'legacy', ...(!stream ? { stream: false } : {}),
      });
    }
  });

  test(`secure playback sources/citations are camelized (${stream ? 'SSE' : 'JSON'})`, async () => {
    const result = await ai.search({ prompt: 'secure-playback', stream });
    let sources;
    let citations;
    if (stream) {
      const events = [];
      for await (const event of result) events.push(event);
      assert.deepEqual(events.map(event => event.type), ['text_delta', 'sources', 'message_complete']);
      sources = events[1].sources;
      citations = events[2].citations;
    } else {
      sources = result.sources;
      citations = result.citations;
    }
    assert.deepEqual(sources, [{ playbackId: 'source-id', playbackToken: 'PLAYBACK_TOKEN' }]);
    assert.deepEqual(citations, [{ playbackId: 'citation-id', playbackToken: 'PLAYBACK_TOKEN' }]);
  });
}

test('caller-controlled IDs survive retries and change for the next action without suppressing requests', async () => {
  for (const method of ['chat', 'ask', 'coach', 'search']) {
    for (const id of [requestId, requestId, nextRequestId]) {
      await ai[method]({ prompt: 'same question', requestId: id, stream: false });
    }
    assert.deepEqual(requests.slice(-3).map(req => req.body.request_id), [requestId, requestId, nextRequestId]);
  }
  assert.equal(requests.length, 12);
});

test('attribution metadata is forwarded without changing request identity', async () => {
  for (const method of ['chat', 'ask', 'coach', 'search']) {
    for (const channel of ['portal', 'embed', 'api', 'mcp', 'unknown']) {
      await ai[method]({ prompt: 'same action', requestId, channel, stream: false });
      assert.deepEqual(requests.at(-1).body, {
        prompt: 'same action', request_id: requestId, channel, stream: false,
      });
    }
  }
});
