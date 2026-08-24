import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { after, before, beforeEach } from "node:test";

import { createClient, ConversationStartersAPIError } from "../dist/index.js";

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
  await conversationStarters.list({ collectionIds: [] });

  assert.equal(requests[0].url, "/api/v1/conversation-starters");
  assert.equal(requests[1].url, "/api/v1/conversation-starters");
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
