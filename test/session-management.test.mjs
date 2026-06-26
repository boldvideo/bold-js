import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { after, before, beforeEach } from "node:test";

import { createClient, SessionManagementAPIError } from "../dist/index.js";

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
      body,
    });

    if (decodeURIComponent(req.url).includes("/blocked/")) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "admin_overrides_disabled" }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });

    if (req.url.endsWith("/sessions")) {
      res.end(
        JSON.stringify({
          viewer: viewerState(),
          data: [
            {
              id: "session-1",
              device_id: "device-1",
              device_label: "Laptop",
              platform: "web",
              last_seen_at: "2026-06-23T10:00:00Z",
              inserted_at: "2026-06-23T09:00:00Z",
              revoked_at: null,
              revoked_by: null,
              revoked_reason: null,
              travel_verdict: "impossible_travel",
            },
            {
              id: "session-2",
              device_id: "device-2",
              device_label: "Phone",
              platform: "ios",
              last_seen_at: "2026-06-23T10:05:00Z",
              inserted_at: "2026-06-23T09:05:00Z",
              revoked_at: null,
              revoked_by: null,
              revoked_reason: null,
              travel_verdict: null,
            },
            {
              // Older backend during rollout: omits travel_verdict entirely.
              id: "session-3",
              device_id: "device-3",
              device_label: "Tablet",
              platform: "android",
              last_seen_at: "2026-06-23T10:10:00Z",
              inserted_at: "2026-06-23T09:10:00Z",
              revoked_at: null,
              revoked_by: null,
              revoked_reason: null,
            },
          ],
        })
      );
      return;
    }

    res.end(JSON.stringify({ data: viewerState() }));
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

test("sets and clears viewer device-limit overrides by external ID", async () => {
  const sessionManagement = createSessionManagementClient();

  const setResponse =
    await sessionManagement.setViewerDeviceLimitOverrideByExternalId(
      "outseta:p/one",
      7
    );

  assert.equal(requests[0].method, "PUT");
  assert.equal(
    requests[0].url,
    "/api/v1/session-management/viewers/by-external-id/outseta%3Ap%2Fone/device-limit"
  );
  assert.deepEqual(requests[0].body, { limit: 7 });
  assert.equal(requests[0].authorization, "tenant-key");
  assert.equal(setResponse.data.viewerId, "viewer-1");
  assert.equal(setResponse.data.activeSessionCount, 2);
  assert.equal(setResponse.data.effectiveDeviceLimitSource, "override");
  assert.equal(setResponse.data.canUpdateDeviceLimitOverride, true);
  assert.equal(setResponse.data.canUpdateSessionManagementExemption, true);

  await sessionManagement.clearViewerDeviceLimitOverrideByExternalId("outseta:p/one");

  assert.equal(requests[1].method, "PUT");
  assert.deepEqual(requests[1].body, { limit: null });
});

test("rejects invalid device-limit override numbers before sending a request", async () => {
  const sessionManagement = createSessionManagementClient();

  for (const limit of [Number.NaN, Infinity, -Infinity, 0, 1.5]) {
    assert.throws(
      () =>
        sessionManagement.setViewerDeviceLimitOverrideByExternalId(
          "outseta:p/one",
          limit
        ),
      /positive safe integer/
    );
  }

  assert.equal(requests.length, 0);
});

test("sets and clears viewer session-management exemptions by external ID", async () => {
  const sessionManagement = createSessionManagementClient();

  await sessionManagement.setViewerSessionManagementExemptionByExternalId(
    "outseta:p/one",
    true
  );

  assert.equal(requests[0].method, "PUT");
  assert.equal(
    requests[0].url,
    "/api/v1/session-management/viewers/by-external-id/outseta%3Ap%2Fone/session-management-exemption"
  );
  assert.deepEqual(requests[0].body, { exempt: true });

  await sessionManagement.clearViewerSessionManagementExemptionByExternalId(
    "outseta:p/one"
  );

  assert.deepEqual(requests[1].body, { exempt: false });
});

test("camelizes viewer state on session-list responses", async () => {
  const response =
    await createSessionManagementClient().listViewerSessionsByExternalId(
      "outseta:p/one"
    );

  assert.equal(response.viewer.viewerId, "viewer-1");
  assert.equal(response.viewer.deviceLimitOverride, 5);
  assert.equal(response.data[0].deviceId, "device-1");
  assert.equal(response.data[0].revokedAt, null);
});

test("exposes the impossible-travel verdict label, defaulting absent to null", async () => {
  const response =
    await createSessionManagementClient().listViewerSessionsByExternalId(
      "outseta:p/one"
    );

  const byId = Object.fromEntries(response.data.map((s) => [s.id, s]));

  // Flagged session passes the label through.
  assert.equal(byId["session-1"].travelVerdict, "impossible_travel");
  // Unflagged session is an explicit null.
  assert.equal(byId["session-2"].travelVerdict, null);
  // Older backend omits the field → normalized to a stable null (not undefined).
  assert.ok("travelVerdict" in byId["session-3"]);
  assert.equal(byId["session-3"].travelVerdict, null);
});

test("wraps failed PUT requests with status and server error code", async () => {
  await assert.rejects(
    createSessionManagementClient().setViewerDeviceLimitOverrideByExternalId(
      "blocked/user",
      4
    ),
    (error) => {
      assert.ok(error instanceof SessionManagementAPIError);
      assert.equal(error.status, 403);
      assert.match(error.message, /admin_overrides_disabled/);
      return true;
    }
  );
});

function createSessionManagementClient() {
  return createClient("tenant-key", { baseURL }).sessionManagement;
}

function viewerState() {
  return {
    viewer_id: "viewer-1",
    external_id: "outseta:p/one",
    active_session_count: 2,
    policy_default_device_limit: 3,
    effective_device_limit: 5,
    effective_device_limit_source: "override",
    device_limit_override: 5,
    session_management_exempt: false,
    admin_overrides_allowed: true,
    can_update_device_limit_override: true,
    can_update_session_management_exemption: true,
  };
}
