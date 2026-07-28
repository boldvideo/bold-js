import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { after, before, beforeEach } from "node:test";

import {
  AuthAPIError,
  SessionManagementUnavailableError,
  createAuthClient,
} from "../dist/index.js";

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

    if (req.url === "/api/v1/auth/sessions/unavailable/device") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          code: "session_management_unavailable",
          retryable: false,
        })
      );
      return;
    }

    if (req.url === "/api/v1/auth/sessions/forbidden/device") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "forbidden", retryable: false }));
      return;
    }

    if (req.url === "/api/v1/auth/sessions/missing/device") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "session_not_found" }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    if (req.url?.endsWith("/device")) {
      res.end(
        JSON.stringify({
          ok: true,
          session_id: decodeURIComponent(
            req.url.split("/").at(-2) ?? ""
          ),
          provider: body.provider,
        })
      );
      return;
    }

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

test("registers a push device on an encoded session path", async () => {
  const auth = createAuthClient({
    baseURL,
    tenantSlug: "acme",
    upstreamJwt: "jwt-123",
  });

  const response = await auth.notifications.registerDevice("session/one", {
    provider: "expo",
    token: "ExponentPushToken[recognizable-device-token]",
  });

  assert.equal(requests[0].method, "POST");
  assert.equal(
    requests[0].url,
    "/api/v1/auth/sessions/session%2Fone/device"
  );
  assert.deepEqual(requests[0].body, {
    provider: "expo",
    token: "ExponentPushToken[recognizable-device-token]",
  });
  assert.equal(requests[0].authorization, "Bearer jwt-123");
  assert.equal(requests[0].tenantSlug, "acme");
  assert.deepEqual(response, {
    ok: true,
    sessionId: "session/one",
    provider: "expo",
  });
});

test("uses request-level auth overrides for device registration", async () => {
  const auth = createAuthClient({
    baseURL,
    tenantSlug: "acme",
    upstreamJwt: "jwt-123",
  });

  await auth.notifications.registerDevice(
    "session-1",
    { provider: "fcm", token: "fcm-token" },
    { tenantSlug: "globex", upstreamJwt: "jwt-override" }
  );

  assert.equal(requests[0].authorization, "Bearer jwt-override");
  assert.equal(requests[0].tenantSlug, "globex");
});

test("rejects incomplete device registrations before sending", async () => {
  const auth = createAuthClient({
    baseURL,
    tenantSlug: "acme",
    upstreamJwt: "jwt-123",
  });

  await assert.rejects(
    auth.notifications.registerDevice("", {
      provider: "expo",
      token: "token",
    }),
    /Session ID is required/
  );
  await assert.rejects(
    auth.notifications.registerDevice("session-1", {
      provider: undefined,
      token: "token",
    }),
    /Notification provider is required/
  );
  await assert.rejects(
    auth.notifications.registerDevice("session-1", {
      provider: "expo",
      token: "",
    }),
    /Device token is required/
  );
  await assert.rejects(
    auth.notifications.registerDevice("session-1", {
      provider: "web",
      token: "token",
    }),
    /Notification provider must be expo, fcm, or apns/
  );
  assert.equal(requests.length, 0);
});

test("exposes the unavailable session-management state as a typed error", async () => {
  const auth = createAuthClient({
    baseURL,
    tenantSlug: "acme",
    upstreamJwt: "jwt-123",
  });
  const token = "recognizable-secret-device-token";

  await assert.rejects(
    auth.notifications.registerDevice("unavailable", {
      provider: "apns",
      token,
    }),
    (error) => {
      assert.ok(error instanceof SessionManagementUnavailableError);
      assert.ok(error instanceof AuthAPIError);
      assert.equal(error.status, 403);
      assert.equal(error.code, "session_management_unavailable");
      assert.equal(error.retryable, false);
      assert.ok(error.originalError instanceof Error);
      assert.ok(!error.message.includes(token));
      return true;
    }
  );
});

test("keeps unrelated registration failures in the base auth error family", async () => {
  const auth = createAuthClient({
    baseURL,
    tenantSlug: "acme",
    upstreamJwt: "jwt-123",
  });

  for (const [sessionId, status, code] of [
    ["forbidden", 403, "forbidden"],
    ["missing", 404, "session_not_found"],
  ]) {
    await assert.rejects(
      auth.notifications.registerDevice(sessionId, {
        provider: "expo",
        token: "token",
      }),
      (error) => {
        assert.ok(error instanceof AuthAPIError);
        assert.ok(!(error instanceof SessionManagementUnavailableError));
        assert.equal(error.status, status);
        assert.equal(error.code, code);
        return true;
      }
    );
  }
});
