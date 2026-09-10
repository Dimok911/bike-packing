import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplateLegacyChoice } from "../../src/public/admin-template-legacy-choice.js";

const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-demo-state-ui", itemKey: "demo-state:ui" };
function fixture() {
  const rows = new Map(), captured = [], f = { prepares: 0, failPlan: false };
  f.context = { ...binding, scope: "admin-template", admin: true, generation: "editor-a" };
  f.local = { payload: { layouts: { local: { id: "local", name: "Local" } }, items: {} }, metadata: { title: "Local", description: "", language: "ru" } };
  f.server = { ok: true, ...binding, exists: true, deleted: false, stateRevision: 7, visibility: "public", indexes: [],
    payload: { layouts: { server: { id: "server", name: "Server" } }, items: {} }, metadata: { title: "Server", description: "", language: "ru" } };
  f.storage = { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) };
  f.rows = rows; f.captured = captured;
  let tail = Promise.resolve();
  const locks = { request: (_key, task) => { const pending = tail.then(task); tail = pending.catch(() => {}); return pending; } };
  f.plans = { list: async () => captured, capture: async value => {
    if (f.failPlan) throw Error("plan quota");
    const old = captured.find(row => row.operationId === value.operationId);
    if (old) assert.deepEqual(value, old); else captured.push(structuredClone(value));
  } };
  f.create = () => createAdminTemplateLegacyChoice({ binding, layoutId: "legacy", enabled: true, locks, storage: f.storage,
    getContext: () => f.context, snapshot: () => f.local, plans: f.plans,
    client: { prepare: async () => { f.prepares++; return structuredClone(f.server); } } });
  return f;
}
test("legacy comparison is read-only until choice and preserves both versions and publication state", async () => {
  const f = fixture(), flow = f.create(), opened = await flow.open();
  assert.equal(f.rows.size, 0); assert.equal(f.captured.length, 0);
  await flow.choose(opened); const source = await flow.resume();
  assert.deepEqual(source.base, { stateRevision: 7 }); assert.equal(source.visibility, "public");
  assert.equal(f.captured[0].published, null); assert.deepEqual(f.captured[0].payload, f.local.payload);
  const saved = JSON.parse([...f.rows.values()][0]).choice;
  assert.deepEqual(saved.server, f.server); assert.deepEqual(saved.local, f.local);
});
test("legacy choice survives plan quota and reload with same ID, candidate and observed revision", async () => {
  const f = fixture(), flow = f.create(); await flow.choose(await flow.open());
  const saved = JSON.parse([...f.rows.values()][0]).choice; f.failPlan = true;
  await assert.rejects(flow.resume(), /plan quota/); f.failPlan = false; f.server.stateRevision = 99;
  const reopened = f.create(); assert.equal((await reopened.open()).saved.id, saved.id); await reopened.resume(); await reopened.resume();
  assert.equal(f.prepares, 1); assert.equal(f.captured.length, 1); assert.equal(f.captured[0].operationId, saved.id);
  assert.deepEqual(f.captured[0].base, { stateRevision: 7 });
});
test("legacy choice storage quota cannot capture or dispatch a plan", async () => {
  const f = fixture(); f.storage.setItem = () => { throw Error("quota"); };
  const flow = f.create(); await assert.rejects(flow.choose(await flow.open()), /quota/);
  assert.equal(f.rows.size, 0); assert.equal(f.captured.length, 0); await assert.rejects(flow.resume());
});
for (const change of ["actor", "route", "rights", "local"]) test(`legacy choice rejects ${change} changes while comparison is open`, async () => {
  const f = fixture(), flow = f.create(), opened = await flow.open();
  if (change === "actor") f.context.actorId = "other";
  if (change === "route") f.context.generation = "elsewhere";
  if (change === "rights") f.context.admin = false;
  if (change === "local") f.local.metadata.title = "Next edit";
  await assert.rejects(flow.choose(opened)); assert.equal(f.rows.size, 0); assert.equal(f.captured.length, 0);
});
test("legacy choices from concurrent tabs cannot replace the retained server version", async () => {
  const f = fixture(), first = f.create(), second = f.create(), a = await first.open();
  f.server.stateRevision = 8; const b = await second.open(); await first.choose(a);
  await assert.rejects(second.choose(b)); await first.resume(); assert.deepEqual(f.captured[0].base, { stateRevision: 7 });
});
test("damaged legacy choices and drafts changed after reload require explicit recovery", async () => {
  const f = fixture(), flow = f.create(); await flow.choose(await flow.open());
  f.local.metadata.title = "Unrelated edit"; await assert.rejects(f.create().open());
  f.local.metadata.title = "Local";
  const [key, raw] = [...f.rows][0], row = JSON.parse(raw); row.choice.server.stateRevision = 8;
  f.rows.set(key, JSON.stringify(row)); await assert.rejects(flow.resume()); assert.equal(f.captured.length, 0);
});
test("missing, deleted and ambiguous server templates cannot silently recreate a legacy target", async () => {
  for (const patch of [{ exists: false, visibility: null }, { deleted: true }, { payload: { layouts: {} } }, { actorId: "other" }]) {
    const f = fixture(); Object.assign(f.server, patch); await assert.rejects(f.create().open()); assert.equal(f.rows.size, 0);
  }
  const f = fixture(); f.captured.push({ operationId: "older" }); await assert.rejects(f.create().open()); assert.equal(f.prepares, 0);
});
