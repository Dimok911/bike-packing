import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplateLegacyChoice } from "../../src/public/admin-template-legacy-choice.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";

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
    projectServer: (server, id) => projectAdminTemplateServerVariant({ id: "legacy", adminDemo: true }, server, id),
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

test("legacy server choice retains both versions and stable editor identities without capturing a save", async () => {
  const f = fixture(); f.server.payload.items.pump = { id: "pump", name: "Server pump", containerId: "" };
  const flow = f.create(), saved = await flow.choose(await flow.open(), { variant: "server" });
  assert.equal(saved.version, 2); assert.equal(saved.variant, "server");
  assert.deepEqual(saved.local, f.local); assert.deepEqual(saved.server, f.server);
  const first = await flow.resume(); assert.equal(f.captured.length, 0);
  assert.deepEqual(first.serverAdoption.source.base, { stateRevision: 7 });
  assert.equal(first.serverAdoption.source.planId, null);
  assert.equal(first.serverAdoption.projection.layout.id, "legacy");
  const pump = Object.values(first.serverAdoption.projection.items)[0];
  assert.equal(pump.publicCatalogLayoutId, "legacy"); assert.equal(pump.name, "Server pump");
  f.server.stateRevision = 99; f.server.payload.items.pump.name = "Later server edit";
  const reopened = f.create(); assert.equal((await reopened.open()).saved.id, saved.id);
  assert.deepEqual(await reopened.resume(), first); assert.equal(f.prepares, 1); assert.equal(f.captured.length, 0);
  // Returned values cannot mutate the durable decision.
  first.serverAdoption.projection.items[pump.id].name = "Mutable copy";
  assert.equal(Object.values((await reopened.resume()).serverAdoption.projection.items)[0].name, "Server pump");
});

for (const variant of ["local", "server"]) test(`legacy ${variant} choice cannot be replaced by the opposite choice in another tab`, async () => {
  const f = fixture(), a = f.create(), b = f.create(), openedA = await a.open(), openedB = await b.open();
  const saved = await a.choose(openedA, { variant });
  await assert.rejects(b.choose(openedB, { variant: variant === "local" ? "server" : "local" }));
  assert.equal(JSON.parse([...f.rows.values()][0]).choice.id, saved.id); assert.equal(f.captured.length, 0);
});

test("legacy server adoption rejects a journal that appeared after retaining the choice", async () => {
  const f = fixture(), flow = f.create(); await flow.choose(await flow.open(), { variant: "server" });
  f.captured.push({ operationId: "independent-action" });
  await assert.rejects(flow.resume()); await assert.rejects(f.create().resume());
  assert.deepEqual(f.captured, [{ operationId: "independent-action" }]);
});

test("legacy server choice quota leaves the local draft unchanged and cannot capture a save", async () => {
  const f = fixture(), local = structuredClone(f.local), flow = f.create(), opened = await flow.open();
  f.storage.setItem = () => { throw Error("choice quota"); };
  await assert.rejects(flow.choose(opened, { variant: "server" }), /choice quota/);
  await assert.rejects(flow.resume()); assert.deepEqual(f.local, local); assert.equal(f.captured.length, 0); assert.equal(f.rows.size, 0);
});

for (const change of ["actor", "route", "rights", "local", "projection"]) test(`legacy server adoption rejects changed ${change} after a durable choice`, async () => {
  const f = fixture(), flow = f.create(); await flow.choose(await flow.open(), { variant: "server" });
  if (change === "actor") f.context.actorId = "other";
  if (change === "route") f.plans.list = async () => { f.context.generation = "elsewhere"; return []; };
  if (change === "rights") f.context.admin = false;
  if (change === "local") f.local.metadata.title = "New local edit";
  if (change === "projection") {
    const [key, raw] = [...f.rows][0], row = JSON.parse(raw); row.choice.projection.layout.name = "Damaged";
    f.rows.set(key, JSON.stringify(row));
  }
  await assert.rejects(flow.resume()); assert.equal(f.captured.length, 0);
});
