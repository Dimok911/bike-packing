import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteChangeStream } from "../../src/sync/remote-change-stream.js";

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  assert.fail("Stream condition was not reached");
}
function fixture(t, { supported = true } = {}) {
  let context = { actorId: "one", listId: "list-one" };
  let dirty = false;
  let checks = 0;
  let applied = 0;
  const calls = [];
  const connections = [];
  const stream = createRemoteChangeStream({ getContext: () => context, retryMs: 10,
    transport: { prepare: async () => {}, apiUrl: path => `https://api.example.test${path}` },
    refresh: async () => { checks++; if (dirty) return false; applied++; return true; },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("capabilities")) return Response.json({ capabilities: supported ? ["listLiveUpdatesV1"] : [] });
      const connection = { aborted: false };
      const body = new ReadableStream({ start(controller) {
        connection.send = text => controller.enqueue(new TextEncoder().encode(text));
        connection.close = () => controller.close();
        options.signal.addEventListener("abort", () => { connection.aborted = true; try { controller.error(new Error("aborted")); } catch {} });
      } });
      connections.push(connection);
      return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
    }
  });
  t.after(() => stream.stop());
  stream.reconcile();
  return { stream, calls, connections, setContext: value => { context = value; stream.reconcile(); },
    setDirty: value => { dirty = value; }, checks: () => checks, applied: () => applied };
}
test("notification triggers existing reader; preserves cookies and redirect guard", async t => {
  const f = fixture(t);
  await until(() => f.connections.length === 1);
  f.connections[0].send("event: rea");
  f.connections[0].send("dy\ndata: {}\n\nevent: changed\ndata: {}\n\n");
  await until(() => f.applied() >= 1);
  assert.equal(f.calls[1].options.credentials, "include");
  assert.equal(f.calls[1].options.redirect, "error");
  assert.equal(f.calls[1].options.cache, "no-store");
});
test("pending local edits defer the read, then retry after save without another signal", async t => {
  const f = fixture(t);
  await until(() => f.connections.length === 1);
  f.setDirty(true);
  f.connections[0].send("event: changed\ndata: {}\n\n");
  await until(() => f.checks() === 1);
  assert.equal(f.applied(), 0);
  f.setDirty(false);
  f.stream.reconcile();
  await until(() => f.applied() === 1);
});
test("account switch, hidden/offline context and page cache suspend close old streams", async t => {
  const f = fixture(t);
  await until(() => f.connections.length === 1);
  f.setContext({ actorId: "two", listId: "list-two" });
  await until(() => f.connections.length === 2);
  assert.equal(f.connections[0].aborted, true);
  f.stream.pause();
  assert.equal(f.connections[1].aborted, true);
  f.stream.resume();
  await until(() => f.connections.length === 3);
  f.setContext(null);
  assert.equal(f.connections[2].aborted, true);
});
test("disconnect retries; initial hint on reconnect catches missed changes", async t => {
  const f = fixture(t);
  await until(() => f.connections.length === 1);
  f.connections[0].close();
  await until(() => f.connections.length === 2);
  f.connections[1].send("event: ready\ndata: {}\n\n");
  await until(() => f.applied() === 1);
});
test("old servers keep polling with no stream request or application changes", async t => {
  const f = fixture(t, { supported: false });
  await until(() => f.calls.length === 1);
  await tick();
  assert.equal(f.connections.length, 0);
  assert.equal(f.applied(), 0);
});
