import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test, { after, before, beforeEach } from 'node:test';
import { AIAPIError, createClient } from '../dist/index.js';

// Synthetic wire fixture based on the endpoint contract, not a live backend capture.
const fixture = readFileSync(new URL('./fixtures/ai-conversations.json', import.meta.url), 'utf8');
const requests = [];
let server;
let ai;

before(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    const viewer = new URL(req.url, 'http://localhost').searchParams.get('viewer');
    res.writeHead(viewer === 'missing-viewer' ? 404 : 200, { 'content-type': 'application/json' });
    res.end(viewer === 'missing-viewer'
      ? JSON.stringify({ type: 'error', code: 'viewer_not_found', message: 'Viewer not found.' })
      : viewer === 'empty-viewer'
        ? JSON.stringify({ conversations: [], pagination: { limit: 20, offset: 0, has_more: false } })
        : fixture);
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

test('listConversations sends an authenticated GET and preserves the full camelized list', async () => {
  const result = await ai.listConversations({ viewer: 'external+viewer & id', limit: 2, offset: 7 });
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.method, 'GET');
  assert.equal(request.url, '/api/v1/ai/conversations?viewer=external%2Bviewer+%26+id&limit=2&offset=7');
  assert.equal(request.headers.authorization, 'synthetic-test-key');
  assert.equal(request.headers.accept, 'application/json');
  assert.equal(request.body, '');
  assert.deepEqual(result, {
    conversations: [
      {
        conversationId: '550e8400-e29b-41d4-a716-446655440001',
        scope: 'library', title: 'Synthetic library question', preview: 'A synthetic library answer.',
        status: 'active', messageCount: 3,
        createdAt: '2026-01-02T10:00:00Z', updatedAt: '2026-01-02T10:05:00Z',
        channel: 'api', client: 'synthetic-client', video: null,
      },
      {
        conversationId: '550e8400-e29b-41d4-a716-446655440002',
        scope: 'video', title: null, preview: null, status: 'active', messageCount: 1,
        createdAt: '2026-01-01T09:00:00Z', updatedAt: '2026-01-01T09:00:00Z',
        channel: 'embed', client: null,
        video: {
          id: 'synthetic-video', title: 'Synthetic video lesson',
          thumbnailUrl: 'https://example.com/synthetic-thumbnail.jpg', url: null,
        },
      },
    ],
    pagination: { limit: 2, offset: 7, hasMore: true },
  });
});

test('listConversations rejects viewer_not_found with AIAPIError', async () => {
  await assert.rejects(ai.listConversations({ viewer: 'missing-viewer' }), error => {
    assert.ok(error instanceof AIAPIError);
    assert.equal(error.status, 404);
    assert.equal(error.code, 'viewer_not_found');
    assert.match(error.message, /^GET .*\/api\/v1\/ai\/conversations\?viewer=missing-viewer failed \(404\): Viewer not found\.$/);
    return true;
  });
  assert.equal(requests.length, 1);
});

test('listConversations omits absent pagination and passes explicit values without clamping', async () => {
  for (const [pagination, query] of [
    [{}, ''],
    [{ limit: 0, offset: 0 }, '&limit=0&offset=0'],
    [{ limit: -1, offset: 1.5 }, '&limit=-1&offset=1.5'],
  ]) {
    const result = await ai.listConversations({ viewer: 'empty-viewer', ...pagination });
    assert.equal(requests.at(-1).url, `/api/v1/ai/conversations?viewer=empty-viewer${query}`);
    assert.deepEqual(result, {
      conversations: [], pagination: { limit: 20, offset: 0, hasMore: false },
    });
  }
  assert.equal(requests.length, 3);
});
