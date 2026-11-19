import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import test, { beforeEach } from 'node:test';
import { createClient, McpAPIError } from '../dist/index.js';

const secret = 'synthetic-signing-secret-é-🔑';
const apiKey = 'synthetic-server-api-key';
const now = 1_800_000_000;
const endpoint = 'https://tenant.example/connect?request=connection-1';
const continuation = 'https://mcp.boldvideo.io/library/consent?request=connection-1';
const grants = { answer: ['answers'], point: ['links'], mention: [{ collectionId: 'locked', offer: 'membership' }, { collectionId: 'other' }] };
const wireGrants = { answer: ['answers'], point: ['links'], mention: [{ collection_id: 'locked', offer: 'membership' }, { collection_id: 'other' }] };

function client() {
  return createClient(apiKey, { baseURL: 'https://api.example/api/v1', headers: { 'X-Custom': 'value' } });
}

function handlers(options = {}) {
  return client().mcp.connect({ signingSecret: secret, viewer: () => 'member-1', access: () => grants, signIn: '/login', ...options });
}

// Independent Node/OpenSSL fixture; the SDK uses only Web Crypto.
function signature(body, timestamp = String(now), key = secret) {
  return `t=${timestamp},v1=${createHmac('sha256', key).update(`${timestamp}.`).update(body).digest('hex')}`;
}

function post(body = '{ "external_id": "member-1", "viewer_id": "bold-uuid" }', header = signature(body)) {
  return new Request(endpoint, { method: 'POST', body, headers: header === null ? {} : { 'Bold-Signature': header } });
}

beforeEach(t => {
  t.mock.method(Date, 'now', () => now * 1000);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
});

function api(t, response = () => Response.json({ continue_url: continuation })) {
  return t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.headers.Authorization, apiKey);
    assert.equal(init.headers['X-Custom'], 'value');
    assert.equal(init.redirect, 'error');
    // Older Cloudflare Workers throw on any `cache` option.
    assert.equal('cache' in init, false);
    return response(url, init);
  });
}

test('GET connects with encoded grants and redirects without caching', async t => {
  const fetch = api(t, (url, init) => {
    assert.equal(url.href, 'https://api.example/api/v1/mcp/connections/connection-1');
    assert.equal(init.method, 'PUT');
    assert.deepEqual(JSON.parse(init.body), { viewer: 'member-1', access: wireGrants });
    return Response.json({ continue_url: continuation });
  });
  const req = new Request(endpoint);
  const response = await handlers({
    viewer: async request => { assert.equal(request, req); return 'member-1'; },
    access: async (id, context) => { assert.equal(id, 'member-1'); assert.equal(context, undefined); return grants; },
  }).GET(req);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), continuation);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(fetch.mock.callCount(), 1);
});

test('GET validates request before callbacks or network', async () => {
  const { GET } = handlers({ viewer: () => assert.fail('viewer must not run') });
  for (const query of ['', '?request=', `?request=${'a'.repeat(513)}`, '?request=.', '?request=..', '?request=a&request=b']) {
    const result = await GET(new Request(`https://tenant.example/connect${query}`));
    assert.equal(result.status, 400, query);
    assert.match(result.headers.get('Content-Type'), /text\/plain/);
  }
});

test('GET accepts 512 characters and encodes the ID as one path segment', async t => {
  for (const id of ['a'.repeat(512), '../other?x=#é', '%2e%2e']) {
    api(t, (url) => {
      assert.equal(url.pathname, `/api/v1/mcp/connections/${encodeURIComponent(id)}`);
      assert.equal(url.search, '');
      return Response.json({ continue_url: continuation });
    });
    assert.equal((await handlers().GET(new Request(`https://tenant.example/connect?request=${encodeURIComponent(id)}`))).status, 302);
  }
});

test('GET sends anonymous members to sign-in with a local path and intact query', async () => {
  for (const memberId of [null, undefined, '']) {
    const req = new Request(`${endpoint}&next=https%3A%2F%2Fevil.example&lang=es`);
    const result = await handlers({ viewer: () => memberId, access: () => assert.fail(), signIn: '/login?language=es&return_to=old' }).GET(req);
    // Relative, so a proxy's internal origin in req.url never reaches the browser.
    assert.match(result.headers.get('Location'), /^\/login\?/);
    const login = new URL(result.headers.get('Location'), 'https://tenant.example');
    assert.equal(result.status, 302);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(login.origin, 'https://tenant.example');
    assert.equal(login.pathname, '/login');
    assert.equal(login.searchParams.get('language'), 'es');
    assert.deepEqual(login.searchParams.getAll('return_to'), ['/connect?request=connection-1&next=https%3A%2F%2Fevil.example&lang=es']);
  }
});

test('GET rejects unsafe return paths rather than emitting network-path return_to', async () => {
  for (const path of ['//evil.example', '/%2fevil.example', '/%5cevil.example', '/%252fevil.example', '/%09/evil.example', '/%0a/evil.example', '/%0d/evil.example']) {
    const result = await handlers({ viewer: () => undefined }).GET(new Request(`https://tenant.example${path}?request=a`));
    assert.equal(result.status, 400, path);
    assert.equal(result.headers.get('Location'), null);
  }
});

test('GET supports custom sign-in and denied responses, including immutable redirect headers', async () => {
  const req = new Request(endpoint);
  const login = await handlers({ viewer: () => null, signIn: async request => {
    assert.equal(request, req);
    return Response.redirect('https://tenant.example/sign-in', 303);
  } }).GET(req);
  assert.equal(login.status, 303);
  assert.equal(login.headers.get('Cache-Control'), 'no-store');
  for (const denied of [undefined, async request => { assert.equal(request, req); return new Response('Custom denial', { status: 403 }); }]) {
    for (const access of [null, undefined]) {
      const result = await handlers({ access: () => access, denied }).GET(req);
      assert.equal(result.status, 403);
      assert.match(await result.text(), denied ? /Custom denial/ : /may not connect/);
    }
  }
});

test('GET treats an empty access object as connected, not denied', async t => {
  api(t, (url, init) => {
    assert.deepEqual(JSON.parse(init.body), { viewer: 'member-1', access: {} });
    return Response.json({ continue_url: continuation });
  });
  assert.equal((await handlers({ access: () => ({}) }).GET(new Request(endpoint))).status, 302);
});

test('GET accepts only absolute HTTPS continuations on the configured host without credentials', async t => {
  for (const continue_url of [
    'http://mcp.boldvideo.io/consent', 'https://evil.example', '//mcp.boldvideo.io/consent', '/consent',
    'https://mcp.boldvideo.io.evil.example', 'https://mcp.boldvideo.io@evil.example',
    'https://user:password@mcp.boldvideo.io/consent', 'https://mcp.boldvideo.io:444/consent',
    'javascript:alert(1)', 'not a URL', null, 17, undefined,
  ]) {
    api(t, () => Response.json({ continue_url }));
    const result = await handlers().GET(new Request(endpoint));
    assert.equal(result.status, 502, String(continue_url));
    assert.equal(result.headers.get('Location'), null);
  }
  api(t, () => Response.json({ continue_url: 'https://custom.example:8443/consent' }));
  const result = await handlers({ mcpUrl: 'https://custom.example:8443' }).GET(new Request(endpoint));
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('Location'), 'https://custom.example:8443/consent');
});

test('GET handles known API errors with fixed messages and status', async t => {
  for (const [status, code, message] of [
    [404, 'not_found', /expired.*already used/],
    [403, 'feature_not_enabled', /not enabled/],
    [403, 'verified_ai_access_required', /server-only key/],
    [422, 'viewer_not_found', /exist as a Bold viewer.*bold\.viewers/],
    [422, 'invalid_access', /grants are invalid/],
    [422, 'collection_not_found', /collection was not found/],
  ]) {
    for (const field of ['code', 'error']) {
      api(t, () => Response.json({ [field]: code, message: apiKey }, { status }));
      const result = await handlers().GET(new Request(endpoint));
      assert.equal(result.status, status);
      assert.match(await result.text(), message);
    }
  }
});

test('GET sanitizes upstream, transport and callback failures, including onError failures', async t => {
  for (const response of [
    () => Response.json({ code: secret, message: apiKey }, { status: 500 }),
    () => new Response(apiKey, { status: 502 }),
    () => new Response(apiKey),
    () => { throw new Error(`${apiKey} ${secret}`); },
  ]) {
    api(t, response);
    let received;
    let receivedRequest;
    const result = await handlers({ onError: (error, req) => {
      received = error;
      receivedRequest = req;
      throw new Error(secret);
    } }).GET(new Request(endpoint));
    assert.equal(result.status, 502);
    assert.equal(receivedRequest.url, endpoint);
    assert.ok(received instanceof McpAPIError);
    assert.doesNotMatch(JSON.stringify(received) + received.stack + await result.text(), new RegExp(`${apiKey}|${secret}`));
  }
  for (const callback of ['viewer', 'access', 'signIn', 'denied']) {
    for (const error of [new Error(secret), new McpAPIError(404, 'not_found')]) {
      let received;
      const result = await handlers({
        ...(callback === 'signIn' ? { viewer: () => null } : {}),
        ...(callback === 'denied' ? { access: () => null } : {}),
        [callback]: async () => { throw error; },
        onError: error => { received = error; },
      }).GET(new Request(endpoint));
      assert.equal(result.status, 500);
      assert.equal(received.code, 'handler_error');
      assert.doesNotMatch(await result.text(), new RegExp(secret));
    }
  }
});

test('GET onError can render a custom response or retain the fallback', async t => {
  api(t, () => Response.json({ code: 'viewer_not_found' }, { status: 422 }));
  const result = await handlers({ onError: async error => {
    assert.equal(error.code, 'viewer_not_found');
    assert.equal(error.status, 422);
    return new Response('Please sync your member', { status: 409 });
  } }).GET(new Request(endpoint));
  assert.equal(result.status, 409);
  assert.equal(await result.text(), 'Please sync your member');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal((await handlers({ onError: () => {} }).GET(new Request(endpoint))).status, 422);
});

test('POST verifies independently signed UTF-8 bytes before resolving external identity and grants', async () => {
  const body = Buffer.from('{\n "external_id": "member-é-🦊", "viewer_id" : "bold-uuid"\n}');
  const req = post(body);
  const result = await handlers({ viewer: () => assert.fail(), access: async (id, context) => {
    assert.equal(req.bodyUsed, true);
    assert.equal(id, 'member-é-🦊');
    assert.deepEqual(context, { viewerId: 'bold-uuid', externalId: 'member-é-🦊' });
    return grants;
  } }).POST(req);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await result.json(), { access: wireGrants });
});

test('POST uses external_id when present, otherwise viewer_id, and preserves empty grants', async () => {
  for (const external_id of [undefined, null, '', 'external-member']) {
    const body = JSON.stringify({ viewer_id: 'bold-uuid', external_id });
    const result = await handlers({ access: (id, context) => {
      assert.equal(id, external_id ?? 'bold-uuid');
      assert.deepEqual(context, { viewerId: 'bold-uuid', externalId: external_id ?? null });
      return {};
    } }).POST(post(body));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { access: {} });
  }
});

test('POST denies nullish access but treats exceptions as temporary failures', async () => {
  for (const value of [null, undefined]) {
    assert.equal((await handlers({ access: () => value }).POST(post())).status, 404);
  }
  const result = await handlers({ access: async () => { throw new Error(secret); }, onError: () => assert.fail() }).POST(post());
  assert.equal(result.status, 500);
  assert.doesNotMatch(await result.text(), new RegExp(secret));
});

test('POST rejects missing, malformed and incorrect signatures without calling tenant callbacks', async () => {
  const body = '{"viewer_id":"bold-uuid"}';
  const valid = signature(body);
  const { POST } = handlers({ viewer: () => assert.fail(), access: () => assert.fail(), onError: () => assert.fail() });
  for (const header of [
    null, '', 'invalid', valid.toUpperCase(), valid.replace(',v1=', ', v1='),
    `${valid},v1=${'a'.repeat(64)}`, `${valid},t=${now}`, valid.replace('t=', 't=+'),
    valid.replace(String(now), `${now}.0`), valid.replace(String(now), '1.8e9'),
    valid.slice(0, -1), `${valid}0`, `t=${now},v1=${'g'.repeat(64)}`,
    `t=${now},v1=${'0'.repeat(64)}`, signature(body, String(now), 'wrong-secret'),
    signature(body, '9007199254740992'),
  ]) {
    assert.equal((await POST(post(body, header))).status, 401, header);
  }
  // Invalid JSON must still fail authentication first.
  assert.equal((await POST(post('not JSON', valid))).status, 401);
});

test('POST enforces both sides of the 300-second window and signs the literal timestamp', async () => {
  for (const [offset, status] of [[-301, 401], [-300, 200], [300, 200], [301, 401]]) {
    const body = '{"viewer_id":"bold-uuid"}';
    const result = await handlers().POST(post(body, signature(body, String(now + offset))));
    assert.equal(result.status, status);
  }
  const body = '{"viewer_id":"bold-uuid"}';
  assert.equal((await handlers().POST(post(body, signature(body, `00${now}`)))).status, 200);
  assert.equal((await handlers().POST(post(body, signature(body).replace(`t=${now}`, `t=00${now}`)))).status, 401);
});

test('POST permits repeated signed checks inside the freshness window', async () => {
  let calls = 0;
  const { POST } = handlers({ access: () => ({ answer: [`collection-${++calls}`] }) });
  const body = '{"viewer_id":"bold-uuid"}';
  const header = signature(body);
  for (const collection of ['collection-1', 'collection-2']) {
    const result = await POST(post(body, header));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { access: { answer: [collection] } });
  }
});

test('POST authenticates raw bytes, not normalized JSON or decoded/re-encoded text', async () => {
  const body = '{ "viewer_id": "bold-uuid", "external_id": "é" }';
  for (const changed of [body.replace('é', 'e'), JSON.stringify(JSON.parse(body)), `${body}\n`]) {
    assert.equal((await handlers().POST(post(changed, signature(body)))).status, 401);
  }
  const invalidUtf8 = Buffer.concat([Buffer.from('{"viewer_id":"'), Buffer.from([0xff]), Buffer.from('"}')]);
  // A digest over replacement characters must not validate the original invalid byte.
  assert.equal((await handlers().POST(post(invalidUtf8, signature(invalidUtf8.toString('utf8'))))).status, 401);
  assert.equal((await handlers().POST(post(invalidUtf8))).status, 400);
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body)]);
  assert.equal((await handlers().POST(post(bom, signature(body)))).status, 401);
  assert.equal((await handlers().POST(post(bom))).status, 200);
});

test('POST returns 400 for authenticated invalid JSON or identity shapes', async () => {
  for (const body of ['{', 'null', '[]', '{}', '"string"', '{"viewer_id":5}', '{"viewer_id":""}', '{"viewer_id":"id","external_id":false}']) {
    assert.equal((await handlers({ access: () => assert.fail() }).POST(post(body))).status, 400, body);
  }
});

test('missing signing secret throws in development and fails closed elsewhere', async () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    assert.throws(() => handlers({ signingSecret: undefined }), /requires signingSecret/);
    for (const environment of ['production', 'test', undefined]) {
      if (environment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = environment;
      const route = handlers({ signingSecret: '', viewer: () => assert.fail(), access: () => assert.fail() });
      assert.equal((await route.GET(new Request(endpoint))).status, 503);
      const result = await route.POST(post());
      assert.equal(result.status, 503);
      assert.match(await result.text(), /requires signingSecret/);
    }
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});

test('edge-style runtime needs no process or Node crypto import', async () => {
  const route = handlers();
  const processDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'process');
  try {
    delete globalThis.process;
    assert.equal((await route.POST(post())).status, 200);
    assert.equal((await handlers({ signingSecret: '' }).POST(post())).status, 503);
  } finally {
    Object.defineProperty(globalThis, 'process', processDescriptor);
  }
});

test('MCP guards browser use without breaking normal client construction', async () => {
  globalThis.window = {};
  try {
    const bold = client();
    assert.equal(typeof bold.videos.list, 'function');
    assert.throws(() => bold.mcp.connect({}), /server-only/);
    await assert.rejects(bold.mcp.connections.list('member'), /server-only/);
    await assert.rejects(bold.mcp.connections.revoke('member'), /server-only/);
  } finally {
    delete globalThis.window;
  }
});

test('connections list unwraps camelCase records and revoke accepts 204', async t => {
  const member = 'member/é?other=1&viewer=another';
  api(t, (url, init) => {
    assert.equal(url.pathname, '/api/v1/mcp/connections');
    assert.deepEqual([...url.searchParams], [['viewer', member]]);
    assert.equal(init.body, undefined);
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    assert.equal(init.method, 'GET');
    return Response.json({ data: [{ id: 'connection-1', status: 'active', client_name: 'Claude', client_redirect_host: 'claude.ai', connected_at: '2026-11-18T12:34:56Z', last_used_at: null }] });
  });
  assert.deepEqual(await client().mcp.connections.list(member), [{ id: 'connection-1', status: 'active', clientName: 'Claude', clientRedirectHost: 'claude.ai', connectedAt: '2026-11-18T12:34:56Z', lastUsedAt: null }]);
  assert.equal(await client().mcp.connections.revoke(member), undefined);
  for (const method of ['list', 'revoke']) {
    await assert.rejects(client().mcp.connections[method](''), /Member ID is required/);
    api(t, () => { throw new Error(apiKey); });
    await assert.rejects(client().mcp.connections[method](member), error => {
      assert.ok(error instanceof McpAPIError);
      assert.equal(error.status, 502);
      assert.doesNotMatch(error.stack + JSON.stringify(error), new RegExp(apiKey));
      return true;
    });
  }
});

test('CommonJS consumers expose the same MCP factory', async () => {
  const { createClient } = createRequire(import.meta.url)('../dist/index.cjs');
  const { POST } = createClient(apiKey).mcp.connect({ signingSecret: secret, viewer: () => 'member', access: () => ({}), signIn: '/login' });
  assert.equal((await POST(post())).status, 200);
});
