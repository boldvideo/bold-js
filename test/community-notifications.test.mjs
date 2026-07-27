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

    if (req.method === "POST" && req.url === "/api/v1/community/posts") {
      const response = {
        data: communityPost(),
      };
      if (Object.hasOwn(body.post, "mentions")) {
        response.mentions = {
          skipped: body.post.mentions.filter((id) => !id),
        };
      }
      res.end(JSON.stringify(response));
      return;
    }

    if (
      req.method === "POST" &&
      req.url === "/api/v1/community/posts/post-1/comments"
    ) {
      const response = {
        data: communityComment(),
      };
      if (Object.hasOwn(body.comment, "mentions")) {
        response.mentions = {
          skipped: body.comment.mentions.filter((id) => !id),
        };
      }
      res.end(JSON.stringify(response));
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/v1/community/mentions?")) {
      res.end(
        JSON.stringify({
          data: [
            {
              id: "mention-1",
              post_id: "post-1",
              comment_id: "comment-1",
              author: {
                id: "viewer-2",
                name: "Ada",
                avatar_url: null,
              },
              excerpt: "Please review this",
              created_at: "2026-07-27T10:00:00Z",
              read_at: null,
            },
          ],
          meta: {
            page: 2,
            page_size: 10,
            total_entries: 11,
            total_pages: 2,
          },
        })
      );
      return;
    }

    if (
      req.method === "GET" &&
      req.url === "/api/v1/community/mentions/unread-count"
    ) {
      res.end(JSON.stringify({ data: { count: 3 } }));
      return;
    }

    if (
      req.method === "POST" &&
      req.url === "/api/v1/community/mentions/read"
    ) {
      res.end(
        JSON.stringify({
          data: {
            marked_read: body.ids?.length ?? 2,
            unread_count: 0,
          },
        })
      );
      return;
    }

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

test("preserves existing community create bodies when mentions are omitted", async () => {
  const community = createCommunityClient();

  const postResponse = await community.posts.create("viewer-1", {
    content: "Hello",
    category: "general",
  });
  const commentResponse = await community.comments.create(
    "viewer-1",
    "post-1",
    { content: "Nice post" }
  );

  assert.deepEqual(requests[0].body, {
    post: {
      content: "Hello",
      category: "general",
    },
  });
  assert.deepEqual(requests[1].body, {
    comment: {
      content: "Nice post",
    },
  });
  assert.ok(!("mentions" in postResponse));
  assert.ok(!("mentions" in commentResponse));
});

test("sends post mentions and returns skipped external IDs", async () => {
  const response = await createCommunityClient().posts.create("viewer-1", {
    content: "Hello @Ada",
    mentions: ["external-1", ""],
  });

  assert.equal(requests[0].viewerId, "viewer-1");
  assert.deepEqual(requests[0].body, {
    post: {
      content: "Hello @Ada",
      mentions: ["external-1", ""],
    },
  });
  assert.deepEqual(response.mentions, { skipped: [""] });
});

test("preserves an explicitly empty comment mentions array", async () => {
  const response = await createCommunityClient().comments.create(
    "viewer-1",
    "post-1",
    {
      content: "No recipients",
      parentId: "comment-parent",
      mentions: [],
    }
  );

  assert.deepEqual(requests[0].body, {
    comment: {
      content: "No recipients",
      parent_id: "comment-parent",
      mentions: [],
    },
  });
  assert.deepEqual(response.mentions, { skipped: [] });
});

test("lists a viewer's mentions with pagination and camelized fields", async () => {
  const response = await createCommunityClient().mentions.list("viewer-1", {
    page: 2,
    pageSize: 10,
  });

  assert.equal(
    requests[0].url,
    "/api/v1/community/mentions?page=2&page_size=10"
  );
  assert.equal(requests[0].viewerId, "viewer-1");
  assert.equal(response.data[0].postId, "post-1");
  assert.equal(response.data[0].commentId, "comment-1");
  assert.equal(response.data[0].author.avatarUrl, null);
  assert.equal(response.data[0].readAt, null);
  assert.equal(response.meta.pageSize, 10);
  assert.equal(response.meta.totalEntries, 11);
});

test("gets the unread mention count", async () => {
  const response =
    await createCommunityClient().mentions.unreadCount("viewer-1");

  assert.equal(requests[0].url, "/api/v1/community/mentions/unread-count");
  assert.equal(requests[0].viewerId, "viewer-1");
  assert.equal(response.data.count, 3);
});

test("marks selected or all mentions read", async () => {
  const mentions = createCommunityClient().mentions;

  const selected = await mentions.markRead("viewer-1", {
    ids: ["mention-1"],
  });
  const all = await mentions.markRead("viewer-1", { all: true });

  assert.deepEqual(requests[0].body, { ids: ["mention-1"] });
  assert.deepEqual(requests[1].body, { all: true });
  assert.deepEqual(selected.data, {
    markedRead: 1,
    unreadCount: 0,
  });
  assert.deepEqual(all.data, {
    markedRead: 2,
    unreadCount: 0,
  });
});

test("rejects invalid mention inbox requests before sending", () => {
  const mentions = createCommunityClient().mentions;

  assert.throws(() => mentions.list(""), /Viewer ID is required/);
  assert.throws(
    () => mentions.markRead("viewer-1", {}),
    /Mention IDs or all: true is required/
  );
  assert.throws(
    () =>
      mentions.markRead("viewer-1", {
        ids: ["mention-1"],
        all: true,
      }),
    /Mention IDs and all: true are mutually exclusive/
  );
  assert.equal(requests.length, 0);
});

function createNotificationsClient() {
  return createClient("tenant-key", { baseURL }).notifications;
}

function createCommunityClient() {
  return createClient("tenant-key", { baseURL }).community;
}

function communityPost() {
  return {
    id: "post-1",
    content: "Hello",
    created_at: "2026-07-27T09:00:00Z",
    author: {
      id: "viewer-1",
      name: "Grace",
      avatar_url: null,
    },
    reactions: {
      count: 0,
      reacted_by: [],
    },
    comments: {
      count: 0,
      commented_by: [],
    },
  };
}

function communityComment() {
  return {
    id: "comment-1",
    content: "Nice post",
    depth: 0,
    reactions_count: 0,
    viewer: {
      id: "viewer-1",
      name: "Grace",
      avatar_url: null,
    },
    author: {
      id: "viewer-1",
      name: "Grace",
      avatar_url: null,
    },
    replies: [],
    created_at: "2026-07-27T09:00:00Z",
    updated_at: "2026-07-27T09:00:00Z",
  };
}
