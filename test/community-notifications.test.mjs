import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { after, before, beforeEach } from "node:test";

import {
  createClient,
  NotificationsAPIError,
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
      viewerId: req.headers["x-viewer-id"],
      body,
    });

    if (req.url.includes("/blocked/")) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "viewers_unavailable" }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });

    if (req.method === "PATCH") {
      res.end(
        JSON.stringify({
          channels: {
            email: body.channels.email ?? true,
            push: body.channels.push ?? true,
          },
        })
      );
      return;
    }

    res.end(
      JSON.stringify({
        channels: {
          email: true,
          push: false,
        },
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

test("gets notification preferences for an encoded viewer ID", async () => {
  const notifications = createNotificationsClient();

  const response = await notifications.getPreferences("viewer/one");

  assert.equal(requests[0].method, "GET");
  assert.equal(
    requests[0].url,
    "/api/v1/viewers/viewer%2Fone/notification-preferences"
  );
  assert.equal(requests[0].authorization, "tenant-key");
  assert.deepEqual(response, {
    channels: {
      email: true,
      push: false,
    },
  });
});

test("updates only the supplied notification channel", async () => {
  const notifications = createNotificationsClient();

  const response = await notifications.updatePreferences("viewer-1", {
    channels: { email: false },
  });

  assert.equal(requests[0].method, "PATCH");
  assert.equal(
    requests[0].url,
    "/api/v1/viewers/viewer-1/notification-preferences"
  );
  assert.deepEqual(requests[0].body, {
    channels: { email: false },
  });
  assert.deepEqual(response, {
    channels: {
      email: false,
      push: true,
    },
  });
});

test("rejects missing viewer IDs before notification requests", () => {
  const notifications = createNotificationsClient();

  assert.throws(
    () => notifications.getPreferences(""),
    /Viewer ID is required/
  );
  assert.throws(
    () =>
      notifications.updatePreferences("", {
        channels: { push: false },
      }),
    /Viewer ID is required/
  );
  assert.equal(requests.length, 0);
});

test("wraps notification API failures with status and server code", async () => {
  await assert.rejects(
    createNotificationsClient().getPreferences("blocked"),
    (error) => {
      assert.ok(error instanceof NotificationsAPIError);
      assert.equal(error.status, 403);
      assert.match(error.message, /viewers_unavailable/);
      return true;
    }
  );
});

function createNotificationsClient() {
  return createClient("tenant-key", { baseURL }).notifications;
}
