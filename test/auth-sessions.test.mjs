import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { after, before, beforeEach } from "node:test";

import { createAuthClient } from "../dist/index.js";

const requests = [];

let server;
let baseURL;

before(async () => {
  server = createServer(async (req, res) => {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : null;

    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      tenantSlug: req.headers["x-bold-tenant-slug"],
      body,
    });

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        session_id: "session-1",
        expires_at: "2026-06-24T12:00:00Z",
      })
    );
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address();
  baseURL = `http://127.0.0.1:${port}/api/v1/`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

beforeEach(() => {
  requests.length = 0;
});

test("forwards client_ip in the create body when provided", async () => {
  const auth = createAuthClient({
    baseURL,
    tenantSlug: "acme",
    upstreamJwt: "jwt-123",
  });

  const response = await auth.sessions.create({
    deviceId: "device-1",
    platform: "web",
    userAgent: "Mozilla/5.0",
    clientIp: "203.0.113.7",
  });

  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].url, "/api/v1/auth/sessions");
  assert.deepEqual(requests[0].body, {
    device_id: "device-1",
    platform: "web",
    user_agent: "Mozilla/5.0",
    client_ip: "203.0.113.7",
  });
  assert.equal(requests[0].authorization, "Bearer jwt-123");
  assert.equal(requests[0].tenantSlug, "acme");
  assert.equal(response.sessionId, "session-1");
});

test("omits client_ip from the create body when not provided", async () => {
  const auth = createAuthClient({
    baseURL,
    tenantSlug: "acme",
    upstreamJwt: "jwt-123",
  });

  await auth.sessions.create({
    deviceId: "device-1",
    platform: "web",
    userAgent: "Mozilla/5.0",
  });

  assert.deepEqual(requests[0].body, {
    device_id: "device-1",
    platform: "web",
    user_agent: "Mozilla/5.0",
  });
  assert.ok(!("client_ip" in requests[0].body));
});
