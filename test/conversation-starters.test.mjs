import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test, { after, before, beforeEach } from "node:test";

import * as sdk from "../dist/index.js";

const { createClient, ConversationStartersAPIError } = sdk;
const answered = {
  kind: "answered",
  reason: "unanswered",
  text: "What does “Camera workshop” say about my question: “How do I set exposure?”?",
  chapter: "Manual exposure",
  video: { id: "video-1", title: "Camera workshop", thumbnail: "https://example.com/thumbnail.png" },
  at: 3505,
  conversation: { id: "conversation-1", title: "Exposure settings" },
};
const answeredAtStart = {
  ...answered,
  reason: "revisited",
  chapter: null,
  video: { ...answered.video, thumbnail: null },
  at: 0,
  conversation: { ...answered.conversation, title: null },
};

const requests = [];

let server;
let baseURL;

before(async () => {
  server = createServer(async (req, res) => {
    requests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
    });

    if (req.url.includes("blocked")) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "conversation_starters_unavailable" }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });

    if (new URL(req.url, "http://localhost").searchParams.has("viewer")) {
      res.end(JSON.stringify({
        data: [
          answered,
          answeredAtStart,
          { text: "Explore this collection", source: "collection", collection_id: "collection-1" },
          { text: "What can I ask?", source: "account", collection_id: null },
        ],
      }));
      return;
    }

    if (req.url.startsWith("/api/v1/conversation-starters?collection_ids=")) {
      res.end(
        JSON.stringify({
          data: [
            {
              text: "What is covered in this collection?",
              source: "collection",
              collection_id: "collection-1",
            },
          ],
        })
      );
      return;
    }

    res.end(
      JSON.stringify({
        data: [
          {
            text: "What can I ask?",
            source: "account",
            collection_id: null,
          },
        ],
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

test("comma-joins collectionIds into the collection_ids query param", async () => {
  const conversationStarters = createConversationStartersClient();

  const response = await conversationStarters.list({
    collectionIds: ["collection-1", "collection-2"],
  });

  assert.equal(requests[0].method, "GET");
  assert.equal(
    requests[0].url,
    "/api/v1/conversation-starters?collection_ids=collection-1%2Ccollection-2"
  );
  assert.equal(requests[0].authorization, "tenant-key");
  assert.deepEqual(response.data, [
    {
      text: "What is covered in this collection?",
      source: "collection",
      collectionId: "collection-1",
    },
  ]);
});

test("omits the query param when collectionIds is missing or empty", async () => {
  const conversationStarters = createConversationStartersClient();

  await conversationStarters.list();
  await conversationStarters.list({});
  await conversationStarters.list({ collectionIds: [] });
  await conversationStarters.list({ viewer: undefined });
  await conversationStarters.list({ collectionIds: ["collection-1", "collection-2"], viewer: undefined });

  assert.deepEqual(requests.map(({ url }) => url), [
    "/api/v1/conversation-starters",
    "/api/v1/conversation-starters",
    "/api/v1/conversation-starters",
    "/api/v1/conversation-starters",
    "/api/v1/conversation-starters?collection_ids=collection-1%2Ccollection-2",
  ]);
});

test("sends viewer UUIDs and external IDs alongside unchanged collection_ids", async () => {
  const conversationStarters = createConversationStartersClient();
  await conversationStarters.list({ viewer: "00000000-0000-4000-8000-000000000001" });
  await conversationStarters.list({
    collectionIds: ["collection-1", "collection-2"],
    viewer: "member+team & org/42",
  });
  await conversationStarters.list({ collectionIds: [], viewer: "" });

  assert.deepEqual(requests, [
    { method: "GET", authorization: "tenant-key", url: "/api/v1/conversation-starters?viewer=00000000-0000-4000-8000-000000000001" },
    { method: "GET", authorization: "tenant-key", url: "/api/v1/conversation-starters?collection_ids=collection-1%2Ccollection-2&viewer=member%2Bteam+%26+org%2F42" },
    { method: "GET", authorization: "tenant-key", url: "/api/v1/conversation-starters?viewer=" },
  ]);
});

test("preserves answered reasons and legacy starters while camelizing collection_id", async () => {
  const { data } = await createConversationStartersClient().list({ viewer: "member-42" });
  assert.deepEqual(data, [
    answered,
    answeredAtStart,
    { text: "Explore this collection", source: "collection", collectionId: "collection-1" },
    { text: "What can I ask?", source: "account", collectionId: null },
  ]);
  for (const { isAnsweredStarter } of [sdk, createRequire(import.meta.url)("../dist/index.cjs")]) {
    assert.deepEqual(data.map(isAnsweredStarter), [true, true, false, false]);
    assert.deepEqual(data.filter(isAnsweredStarter), [answered, answeredAtStart]);
  }
});

test("conversation starter types narrow both variants and compose with focused chat", () => {
  const result = spawnSync(process.execPath, [
    "node_modules/typescript/bin/tsc", "--project", "tsconfig.json", "--noEmit",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("camelizes collection_id, including null for account-sourced items", async () => {
  const conversationStarters = createConversationStartersClient();

  const response = await conversationStarters.list();

  assert.deepEqual(response.data, [
    {
      text: "What can I ask?",
      source: "account",
      collectionId: null,
    },
  ]);
});

test("wraps conversation starters API failures with status and server code", async () => {
  await assert.rejects(
    createConversationStartersClient().list({ collectionIds: ["blocked"] }),
    (error) => {
      assert.ok(error instanceof ConversationStartersAPIError);
      assert.equal(error.status, 403);
      assert.match(error.message, /conversation_starters_unavailable/);
      return true;
    }
  );
});

function createConversationStartersClient() {
  return createClient("tenant-key", { baseURL }).conversationStarters;
}
