import assert from "node:assert/strict";
import test from "node:test";

const {
  extractLatestUserInput,
  resetLastKnownThreadIdForTests,
  searchEndpointFetch,
} = await import("../.test-dist/chatkitApi.js");

function createConfig(overrides = {}) {
  return {
    searchApiUrl: "http://localhost/v2/accounts/me/search/test",
    searchApiKey: "test-api-key",
    searchApiVersionDate: "20191101",
    searchExperienceKey: "support-search",
    searchVersion: "STAGING",
    searchLocale: "en",
    searchClientType: "chatkit",
    ...overrides,
  };
}

function parseJsonBody(body) {
  return typeof body === "string" ? JSON.parse(body) : body;
}

test("extractLatestUserInput handles string input payloads", () => {
  resetLastKnownThreadIdForTests();
  const requestBody = JSON.stringify({
    type: "response.create",
    params: {
      input: "How do I reset my password?",
    },
  });

  assert.equal(extractLatestUserInput(requestBody), "How do I reset my password?");
});

test("assistant turns proxy through to the streaming search response", async () => {
  resetLastKnownThreadIdForTests();
  const requestBody = JSON.stringify({
    type: "thread.message.create",
    params: {
      threadId: "thread-123",
      message: {
        role: "user",
        content: [{ type: "input_text", text: "How do I reset my password?" }],
      },
    },
  });

  const eventStreamBody = [
    "event: thread.item.added",
    'data: {"item":{"id":"msg_1"}}',
    "",
  ].join("\n");
  let proxiedUrl = "";
  let proxiedMethod = "";
  let proxiedBody = "";

  const response = await searchEndpointFetch(
    new Request("http://chatkit.local/messages", {
      method: "POST",
      body: requestBody,
      headers: { "content-type": "application/json" },
    }),
    undefined,
    "local-thread-fallback",
    createConfig({
      fetchImpl: async (input, init) => {
        proxiedUrl = String(input);
        proxiedMethod = init?.method ?? "";
        proxiedBody = typeof init?.body === "string" ? init.body : "";

        return new Response(eventStreamBody, {
          headers: { "Content-Type": "text/event-stream; charset=utf-8" },
          status: 200,
        });
      },
    }),
  );

  const requestUrl = new URL(proxiedUrl);
  const requestPayload = parseJsonBody(proxiedBody);
  assert.equal(proxiedMethod, "POST");
  assert.equal(requestUrl.searchParams.get("experience_key"), "support-search");
  assert.equal(requestUrl.searchParams.get("locale"), "en");
  assert.equal(requestUrl.searchParams.get("version"), "STAGING");
  assert.equal(requestUrl.searchParams.get("api_key"), "test-api-key");
  assert.equal(requestUrl.searchParams.get("v"), "20191101");
  assert.equal(requestPayload.input, "How do I reset my password?");
  assert.equal(requestPayload.threadId, "thread-123");
  assert.deepEqual(requestPayload.client, { type: "chatkit" });
  assert.deepEqual(requestPayload.responseOptions, { includeAnnotations: true });
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/i);
  assert.equal(await response.text(), eventStreamBody);
});

test("assistant turns without a thread id omit threadId in the search body", async () => {
  resetLastKnownThreadIdForTests();
  const requestBody = JSON.stringify({
    type: "thread.message.create",
    params: {
      message: {
        role: "user",
        content: [{ type: "input_text", text: "Start a new chat" }],
      },
    },
  });

  let proxiedUrl = "";
  let proxiedBody = "";

  await searchEndpointFetch(
    new Request("http://chatkit.local/messages", {
      method: "POST",
      body: requestBody,
      headers: { "content-type": "application/json" },
    }),
    undefined,
    null,
    createConfig({
      fetchImpl: async (input, init) => {
        proxiedUrl = String(input);
        proxiedBody = typeof init?.body === "string" ? init.body : "";

        return new Response("event: thread.created\ndata: {\"thread\":{\"id\":\"conv_123\"}}\n\n", {
          headers: { "Content-Type": "text/event-stream; charset=utf-8" },
          status: 200,
        });
      },
      searchClientVersion: "1.2.3",
    }),
  );

  const requestUrl = new URL(proxiedUrl);
  const requestPayload = parseJsonBody(proxiedBody);
  assert.equal(requestUrl.searchParams.get("experience_key"), "support-search");
  assert.equal(requestUrl.searchParams.get("locale"), "en");
  assert.equal(requestUrl.searchParams.get("version"), "STAGING");
  assert.equal(requestUrl.searchParams.get("api_key"), "test-api-key");
  assert.equal(requestUrl.searchParams.get("v"), "20191101");
  assert.equal(requestPayload.input, "Start a new chat");
  assert.equal(requestPayload.threadId, undefined);
  assert.deepEqual(requestPayload.client, { type: "chatkit", version: "1.2.3" });
  assert.deepEqual(requestPayload.responseOptions, { includeAnnotations: true });
});

test("thread-management requests stay on the synthetic JSON path", async () => {
  resetLastKnownThreadIdForTests();
  const requestBody = JSON.stringify({
    type: "thread.list",
    params: {
      threadId: "thread-456",
    },
  });

  let fetchCalled = false;

  const response = await searchEndpointFetch(
    new Request("http://chatkit.local/threads", {
      method: "POST",
      body: requestBody,
      headers: { "content-type": "application/json" },
    }),
    undefined,
    "local-thread-fallback",
    createConfig({
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error("search backend should not be called for thread list");
      },
    }),
  );

  assert.equal(fetchCalled, false);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/i);
  const payload = await response.json();
  assert.equal(payload.has_more, false);
  assert.equal(payload.data.length, 1);
  assert.equal(payload.data[0].id, "thread-456");
  assert.equal(payload.data[0].title, "Search chat");
  assert.ok(typeof payload.data[0].created_at === "string");
  assert.ok(typeof payload.data[0].updated_at === "string");
});

test("debug logging preserves event-stream responses", async () => {
  resetLastKnownThreadIdForTests();
  const requestBody = JSON.stringify({
    type: "thread.message.create",
    params: {
      input: [{ role: "user", content: [{ type: "input_text", text: "stream this" }] }],
    },
  });

  const logs = [];
  const errors = [];
  const eventStreamBody = "event: thread.item.added\ndata: {\"item\":{\"id\":\"msg_2\"}}\n\n";

  const response = await searchEndpointFetch(
    new Request("http://chatkit.local/messages", {
      method: "POST",
      body: requestBody,
      headers: { "content-type": "application/json" },
    }),
    undefined,
    "local-thread-fallback",
    createConfig({
      debug: true,
      logger: {
        log: (...args) => logs.push(args),
        error: (...args) => errors.push(args),
      },
      fetchImpl: async () =>
        new Response(eventStreamBody, {
          headers: { "Content-Type": "text/event-stream" },
          status: 200,
        }),
    }),
  );

  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/i);
  assert.equal(await response.text(), eventStreamBody);
  assert.equal(errors.length, 0);
  assert.ok(logs.some(([message]) => message === "ChatKit search response"));
});

test("thread.created event seeds the next follow-up request threadId", async () => {
  resetLastKnownThreadIdForTests();

  const firstRequestBody = JSON.stringify({
    type: "thread.message.create",
    params: {
      message: {
        role: "user",
        content: [{ type: "input_text", text: "start chat" }],
      },
    },
  });

  const createdEventStream = [
    "id: 1",
    "event: thread.created",
    'data: {"type":"thread.created","thread":{"id":"conv_seeded","created_at":"1970-01-21T14:53:41.963000","status":{"type":"active"},"metadata":{},"items":{"data":[],"has_more":false}}}',
    "",
  ].join("\n");

  const firstResponse = await searchEndpointFetch(
    new Request("http://chatkit.local/messages", {
      method: "POST",
      body: firstRequestBody,
      headers: { "content-type": "application/json" },
    }),
    undefined,
    null,
    createConfig({
      fetchImpl: async () =>
        new Response(createdEventStream, {
          headers: { "Content-Type": "text/event-stream; charset=utf-8" },
          status: 200,
      }),
    }),
  );
  await firstResponse.text();

  let secondProxiedBody = "";
  await searchEndpointFetch(
    new Request("http://chatkit.local/messages", {
      method: "POST",
      body: JSON.stringify({
        type: "thread.message.create",
        params: {
          message: {
            role: "user",
            content: [{ type: "input_text", text: "follow up" }],
          },
        },
      }),
      headers: { "content-type": "application/json" },
    }),
    undefined,
    null,
    createConfig({
      fetchImpl: async (input, init) => {
        secondProxiedBody = typeof init?.body === "string" ? init.body : "";

        return new Response("event: thread.item.added\ndata: {\"item\":{\"id\":\"msg_2\"}}\n\n", {
          headers: { "Content-Type": "text/event-stream; charset=utf-8" },
          status: 200,
        });
      },
    }),
  );

  const secondPayload = parseJsonBody(secondProxiedBody);
  assert.equal(secondPayload.threadId, "conv_seeded");
});
