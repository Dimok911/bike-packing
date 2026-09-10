import test from "node:test";
import assert from "node:assert/strict";
import { adminClientFixture } from "../fixtures/admin-template-client-fixture.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { createAdminTemplateRecovery } from "../../src/public/admin-template-recovery.js";
import { createAdminTemplateStopChoice } from "../../src/public/admin-template-stop-choice.js";
import { createAdminTemplateSaveFlow, adminTemplateEditorSource } from "../../src/public/admin-template-causal-save-flow.js";
import { adminTemplateComparisonHtml } from "../../src/ui/admin-template-comparison.js";
import { projectAdminTemplateServerVariant, applyAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";
import { applyLayoutArrangementToState, createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";
import { normalizeLayoutArrangement, normalizeLayoutFields } from "../../src/state/layout-normalize.js";
import { repairContainerMembershipFromItemLinks } from "../../src/state/repair.js";
import { exportLayoutAsPublishedState } from "../../src/public/published-state-export.js";

async function fixture({ stop = true } = {}) {
  const f = adminClientFixture(), body = f.action().body;
  f.local = { payload: { ...body.payload, layouts: { editor: { id: "editor", name: "Local" } } }, metadata: body.metadata };
  f.server = { ok: true, ...f.binding, exists: true, deleted: false, stateRevision: 7, visibility: "private", indexes: [],
    payload: { layouts: { server: { id: "server", name: "Server" } }, items: {} }, metadata: { ...body.metadata, title: "Server" } };
  f.layout = { id: "editor", adminCausalSource: adminTemplateEditorSource(f.binding, f.server) }; f.prepares = 0;
  const storage = { get length() { return f.values.size; }, key: i => [...f.values.keys()][i], getItem: key => f.values.get(key) ?? null,
    setItem: (key, value) => { if (f.failPrefix && key.startsWith(f.failPrefix)) throw Error("Quota"); f.values.set(key, value); } };
  const tails = new Map(), locks = { request: (key, task) => {
    const next = (tails.get(key) || Promise.resolve()).catch(() => {}).then(task); tails.set(key, next); return next;
  } };
  const client = { ...f.make().client, prepare: async () => { f.prepares++; f.afterPrepare?.(); return structuredClone(f.server); } };
  let recovery;
  f.plans = createAdminTemplateSavePlans({ binding: f.binding, client, getContext: () => f.context, storage, locks, enabled: true,
    shouldCancel: id => recovery.requiresCancellation(id) });
  f.recovery = recovery = createAdminTemplateRecovery({ binding: f.binding, client, plans: f.plans, getContext: () => f.context, storage, locks, enabled: true });
  f.choice = id => createAdminTemplateStopChoice({ binding: f.binding, layoutId: f.layout.id, priorPlanId: id || f.priorPlanId,
    projectServer: (server, id) => projectAdminTemplateServerVariant(f.layout, server, id),
    getContext: () => f.context, getSource: () => f.layout.adminCausalSource, snapshot: () => f.local,
    client, plans: f.plans, recovery, storage, locks, enabled: true });
  f.makeFlow = () => createAdminTemplateSaveFlow({ enabled: true, getLayout: () => f.layout, getContext: () => f.context,
    snapshot: () => f.local, plansFor: () => f.plans, recoveryFor: () => recovery, resolutionFor: (_binding, _layout, id) => f.choice(id),
    applyServerVariant: (_id, { projection, source }) => {
      if (f.mirrorQuota) throw Error("Mirror quota");
      Object.keys(f.layout).forEach(key => delete f.layout[key]); Object.assign(f.layout, structuredClone(projection.layout), { adminCausalSource: source });
      f.local = { payload: { items: projection.items, containers: projection.containers, layouts: { editor: projection.layout } },
        metadata: { title: projection.layout.name, description: projection.layout.note, language: projection.layout.language } };
      return true;
    },
    persist: () => !f.mirrorQuota });
  f.flow = f.makeFlow(); await f.flow.capture("editor"); f.priorPlanId = f.layout.adminCausalSource.planId;
  if (stop) { await recovery.captureStop(f.priorPlanId, f.local); await f.flow.flush("editor"); }
  f.businessPosts = () => f.posts().filter(call => !call.url.endsWith("/cancel"));
  f.savedChoice = () => JSON.parse([...f.values].find(([key]) => key.startsWith("bike-packing-admin-stop-choice-v1:"))[1]).choice;
  return f;
}

test("post-stop comparison is read-only until chosen and retains both versions for an independent save", async () => {
  const f = await fixture(), choice = f.choice(), opened = await choice.open();
  assert.equal((await f.plans.list()).length, 1); assert.equal(f.businessPosts().length, 0);
  await choice.choose(opened); const saved = f.savedChoice();
  assert.deepEqual(saved.local, f.local); assert.deepEqual(saved.server, f.server); assert.equal(saved.priorPlanId, f.priorPlanId);
  assert.notEqual(saved.id, f.priorPlanId); assert.equal(f.businessPosts().length, 0);
  assert.equal((await f.flow.flush("editor")).applied, true);
  assert.equal(f.businessPosts().length, 1); const input = JSON.parse(f.businessPosts()[0].options.body);
  assert.equal(input.operationId, saved.id); assert.equal(input.kind, "template.save"); assert.deepEqual(input.body.base, { stateRevision: 7 });
  assert.equal((await f.recovery.inspect(f.priorPlanId)).stopped, true);
  f.local.metadata.title = "Next edit"; await f.flow.capture("editor"); await f.flow.flush("editor");
  assert.equal(f.businessPosts().length, 2); assert.equal(f.layout.adminCausalSource.base.stateRevision, 9);
});

test("reload between decision and plan capture retains its UUID and original compared revision", async () => {
  const f = await fixture(), choice = f.choice(); await choice.choose(await choice.open()); const saved = f.savedChoice();
  f.failPrefix = "bike-packing-admin-save-plans-v1:"; await assert.rejects(f.flow.flush("editor"), /Quota/);
  f.failPrefix = null; f.server.stateRevision = 99;
  await f.makeFlow().recover("editor"); assert.equal(f.layout.adminCausalSource.planId, saved.id);
  await f.makeFlow().flush("editor"); assert.equal(f.prepares, 1);
  assert.deepEqual(JSON.parse(f.businessPosts()[0].options.body).body.base, { stateRevision: 7 });
});

test("a lost editor mirror after new save acceptance discovers the approved plan without repeating a write", async () => {
  const f = await fixture(), old = structuredClone(f.layout.adminCausalSource), choice = f.choice();
  await choice.choose(await choice.open()); await f.flow.flush("editor"); f.layout.adminCausalSource = old;
  await f.makeFlow().recover("editor"); await f.makeFlow().flush("editor");
  assert.equal(f.businessPosts().length, 1); assert.equal(f.prepares, 1); assert.equal(f.layout.adminCausalSource.base.stateRevision, 8);
});

test("failed old in-memory capture cannot strand an explicitly approved resolution", async () => {
  const f = await fixture(); f.local.metadata.title = "Edited after stop";
  await assert.rejects(f.flow.capture("editor")); const choice = f.choice(); await choice.choose(await choice.open());
  assert.equal((await f.flow.flush("editor")).applied, true); assert.equal(f.businessPosts().length, 1);
});

for (const failure of ["choice", "mirror"]) test(`post-stop ${failure} quota prevents sending and preserves the stopped source`, async () => {
  const f = await fixture(), before = structuredClone(f.layout.adminCausalSource), choice = f.choice(), opened = await choice.open();
  if (failure === "choice") {
    f.failPrefix = "bike-packing-admin-stop-choice-v1:"; await assert.rejects(choice.choose(opened), /Quota/);
    assert.equal((await f.plans.list()).length, 1);
  } else {
    await choice.choose(opened); f.mirrorQuota = true; await assert.rejects(f.flow.flush("editor"));
    f.mirrorQuota = false; assert.deepEqual(f.layout.adminCausalSource, before);
  }
  assert.deepEqual(f.layout.adminCausalSource, before); assert.equal(f.businessPosts().length, 0);
});

test("pending or unconfirmed stops cannot open a fresh server comparison", async () => {
  const f = await fixture({ stop: false }); await assert.rejects(f.choice().open()); assert.equal(f.prepares, 0);
  await f.recovery.captureStop(f.priorPlanId, f.local); f.state.lose = true; f.state.hidden = true;
  await assert.rejects(f.flow.flush("editor")); await assert.rejects(f.choice().open()); assert.equal(f.prepares, 0);
});

for (const change of ["actor", "route", "rights", "local", "source"]) test(`post-stop approval rejects ${change} changes while comparing`, async () => {
  const f = await fixture(), choice = f.choice(), opened = await choice.open();
  if (change === "actor") f.context.actorId = "other";
  if (change === "route") f.context.generation = "elsewhere";
  if (change === "rights") f.context.admin = false;
  if (change === "local") f.local.metadata.title = "Unreviewed edit";
  if (change === "source") f.layout.adminCausalSource.visibility = "public";
  await assert.rejects(choice.choose(opened)); assert.equal(f.businessPosts().length, 0); assert.equal((await f.plans.list().catch(() => [])).length <= 1, true);
  assert.ok(![...f.values.keys()].some(key => key.startsWith("bike-packing-admin-stop-choice-v1:")));
});

test("concurrent comparisons cannot replace the first approved server revision", async () => {
  const f = await fixture(), a = f.choice(), b = f.choice(), first = await a.open(); f.server.stateRevision = 8; const second = await b.open();
  await a.choose(first); await assert.rejects(b.choose(second)); await f.flow.flush("editor");
  assert.equal(f.savedChoice().server.stateRevision, 7); assert.equal(f.businessPosts().length, 1);
});

test("corrupted decisions and edited candidates after reload cannot dispatch a new save", async () => {
  const f = await fixture(), choice = f.choice(); await choice.choose(await choice.open());
  const original = f.local.metadata.title; f.local.metadata.title = "Later"; await assert.rejects(f.makeFlow().flush("editor"));
  f.local.metadata.title = original;
  const [key, raw] = [...f.values].find(([key]) => key.startsWith("bike-packing-admin-stop-choice-v1:")), row = JSON.parse(raw);
  row.choice.server.stateRevision = 8; f.values.set(key, JSON.stringify(row));
  await assert.rejects(f.makeFlow().recover("editor")); assert.equal(f.businessPosts().length, 0);
});

test("deleted and missing server targets are retained for review without recreation", async () => {
  for (const patch of [{ deleted: true }, { exists: false, visibility: null }, { payload: { layouts: {} } }]) {
    const f = await fixture(); Object.assign(f.server, patch); await assert.rejects(f.choice().open());
    assert.equal(f.businessPosts().length, 0); assert.equal((await f.plans.list()).length, 1);
  }
});

test("a changed local candidate during server preparation cannot be presented as the compared draft", async () => {
  const f = await fixture(); f.afterPrepare = () => { f.local.metadata.title = "Changed during read"; };
  await assert.rejects(f.choice().open()); assert.equal(f.businessPosts().length, 0);
});

test("comparison renders actual local and server contents with escaped names and arrangement quantities", () => {
  const value = { metadata: { title: '<img src=x onerror="alert(1)">', description: "<script>bad()</script>" },
    payload: { layouts: { a: { arrangement: { itemQuantities: { pump: 2 } } } }, items: { pump: { name: "Насос", quantity: 99, weight: 100 } } } };
  const html = adminTemplateComparisonHtml(value, { ...value, metadata: { title: "Server" }, payload: { items: { tool: { name: "Ключ" } } } });
  assert.ok(html.includes("Насос") && html.includes("Ключ") && html.includes("2 шт.") && !html.includes("99 шт."));
  assert.ok(!html.includes("<img") && !html.includes("<script>")); assert.ok(html.includes("&lt;script&gt;"));
});

test("adopting the compared server version sends nothing and does not rediscover its cancelled predecessor", async () => {
  const f = await fixture(), choice = f.choice(), original = structuredClone(f.local);
  await choice.choose(await choice.open(), { variant: "server" });
  assert.equal((await f.flow.flush("editor")).state, "idle"); assert.equal(f.local.metadata.title, "Server");
  assert.deepEqual(f.savedChoice().local, original); assert.equal((await f.plans.list()).length, 1); assert.equal(f.businessPosts().length, 0);
  assert.equal((await f.makeFlow().recover("editor")).state, "idle");
  f.local.metadata.title = "Next local edit"; await f.flow.capture("editor"); await f.flow.flush("editor");
  assert.equal(f.businessPosts().length, 1); assert.deepEqual(JSON.parse(f.businessPosts()[0].options.body).body.base, { stateRevision: 7 });
});

test("server adoption resumes its frozen projection after mirror quota without re-reading the server", async () => {
  const f = await fixture(), choice = f.choice(), before = structuredClone(f.local);
  await choice.choose(await choice.open(), { variant: "server" }); f.mirrorQuota = true;
  await assert.rejects(f.flow.flush("editor"), /Mirror quota/); assert.deepEqual(f.local, before);
  f.mirrorQuota = false; f.server.metadata.title = "Unreviewed newer server";
  await f.makeFlow().recover("editor"); assert.equal(f.local.metadata.title, "Server"); assert.equal(f.prepares, 1); assert.equal(f.businessPosts().length, 0);
});

test("successive server adoptions retain every earlier stopped chain at the same revision", async () => {
  const f = await fixture(); const a = f.choice(); await a.choose(await a.open(), { variant: "server" }); await f.flow.flush("editor");
  f.local.metadata.title = "Second discarded edit"; await f.flow.capture("editor"); const secondId = f.layout.adminCausalSource.planId;
  await f.recovery.captureStop(secondId, f.local); await f.flow.flush("editor");
  const b = f.choice(secondId); await b.choose(await b.open(), { variant: "server" }); await f.flow.flush("editor");
  assert.equal((await f.makeFlow().recover("editor")).state, "idle");
  f.local.metadata.title = "Third edit"; await f.flow.capture("editor"); await f.flow.flush("editor");
  assert.equal(f.businessPosts().length, 1); assert.equal((await f.plans.list()).length, 3);
});

test("a damaged adoption marker or decision blocks new edits instead of ignoring retained plans", async () => {
  const f = await fixture(), choice = f.choice(); await choice.choose(await choice.open(), { variant: "server" }); await f.flow.flush("editor");
  f.layout.adminCausalSource.adoptedStop.choiceId = crypto.randomUUID(); f.local.metadata.title = "New edit";
  await assert.rejects(f.makeFlow().capture("editor")); assert.equal(f.businessPosts().length, 0);
});

test("two tabs cannot switch an already retained local decision to a server decision", async () => {
  const f = await fixture(), a = f.choice(), b = f.choice(), openedA = await a.open(), openedB = await b.open();
  await a.choose(openedA); await assert.rejects(b.choose(openedB, { variant: "server" })); assert.equal(f.savedChoice().version, 1);
});

async function independentPlan(f) {
  const id = crypto.randomUUID();
  await f.plans.capture({ operationId: id, exists: true, visibility: "private", base: { stateRevision: 7 },
    payload: f.local.payload, metadata: { ...f.local.metadata, title: "Other editor" } });
  return id;
}

test("an unfinished independent plan blocks server adoption until its original cancellation is confirmed", async () => {
  const f = await fixture(), id = await independentPlan(f), choice = f.choice(), opened = await choice.open();
  await assert.rejects(choice.choose(opened, { variant: "server" }));
  assert.ok(![...f.values.keys()].some(key => key.startsWith("bike-packing-admin-stop-choice-v1:")));
  await f.plans.cancel(id); await choice.choose(opened, { variant: "server" }); await f.flow.flush("editor");
  assert.equal((await f.makeFlow().recover("editor")).state, "idle");
  assert.equal(f.savedChoice().knownPlans.length, 2); assert.equal(f.businessPosts().length, 0);
});

test("an independent commit newer than the compared server prevents adopting a stale snapshot", async () => {
  const f = await fixture(), id = await independentPlan(f), choice = f.choice(), opened = await choice.open();
  await f.plans.run(id); const before = structuredClone(f.local);
  await assert.rejects(choice.choose(opened, { variant: "server" })); assert.deepEqual(f.local, before);
  f.server.stateRevision = 8; await choice.choose(await choice.open(), { variant: "server" }); await f.flow.flush("editor");
  assert.equal(f.layout.adminCausalSource.base.stateRevision, 8); assert.equal(f.businessPosts().length, 1);
});

test("a new plan captured after adoption still recovers a lost editor mirror", async () => {
  const f = await fixture(), choice = f.choice(); await choice.choose(await choice.open(), { variant: "server" }); await f.flow.flush("editor");
  const observed = structuredClone(f.layout.adminCausalSource); f.local.metadata.title = "New chosen edit";
  await f.flow.capture("editor"); const id = f.layout.adminCausalSource.planId; f.layout.adminCausalSource = observed;
  const flow = f.makeFlow(); await flow.recover("editor"); assert.equal(f.layout.adminCausalSource.planId, id);
  await flow.flush("editor"); assert.equal(f.businessPosts().length, 1);
  assert.equal(JSON.parse(f.businessPosts()[0].options.body).operationId, id);
});

test("a missing terminal record after adoption blocks recovery instead of reviving the old plan", async () => {
  const f = await fixture(), choice = f.choice(); await choice.choose(await choice.open(), { variant: "server" }); await f.flow.flush("editor");
  const key = [...f.values.keys()].find(key => key.startsWith("bike-packing-admin-save-plans-v1:")); f.values.delete(key);
  await assert.rejects(f.makeFlow().recover("editor")); assert.equal(f.businessPosts().length, 0);
});

test("server projection preserves quantities, packed state, outside catalog and file references with stable local IDs", async () => {
  const f = await fixture();
  f.server.payload = { layouts: { main: { id: "main", rootContainerIds: ["bag"], layoutOrder: 17, arrangement: {
    rootContainerIds: ["bag"], containers: { bag: { parentId: "", childIds: [], itemIds: ["pump"], order: [{ type: "item", id: "pump" }] } },
    items: { pump: "bag" }, itemQuantities: { pump: 2 }, packedItems: { pump: true }, itemQuantityMigrationVersion: 3 } } },
    containers: { bag: { id: "bag", parentId: "", itemIds: ["pump"] }, spare: { id: "spare", parentId: "", itemIds: [] } },
    items: { pump: { id: "pump", quantity: 99, containerId: "bag", photo: { blobKey: "retained-reference" } }, outside: { id: "outside", containerId: "" } } };
  const id = crypto.randomUUID(), a = projectAdminTemplateServerVariant(f.layout, f.server, id), b = projectAdminTemplateServerVariant(f.layout, f.server, id);
  assert.deepEqual(a, b); assert.equal(Object.keys(a.containers).length, 2); assert.equal(Object.keys(a.items).length, 2);
  const pump = Object.values(a.items).find(row => row.sharedSourceId === "pump"); assert.equal(pump.quantity, 99);
  assert.deepEqual(pump.photo, { blobKey: "retained-reference" }); assert.equal(a.layout.arrangement.itemQuantities[pump.id], 2);
  assert.equal(a.layout.arrangement.packedItems[pump.id], true); assert.equal(a.layout.layoutOrder, 17);
  f.server.payload.items.pump.containerId = "missing"; assert.throws(() => projectAdminTemplateServerVariant(f.layout, f.server, id));
});

test("applying a server projection preserves unrelated records and rolls the editor back when persistence fails", async () => {
  const f = await fixture(), projection = projectAdminTemplateServerVariant(f.layout, f.server, crypto.randomUUID());
  const state = { layouts: { editor: f.layout, private: { id: "private", rootContainerIds: [] } },
    items: { old: { id: "old", publicCatalogLayoutId: "editor" }, private: { id: "private", name: "Untouched" } }, containers: {} };
  const before = structuredClone(state), source = { ...f.layout.adminCausalSource, planId: null };
  assert.throws(() => applyAdminTemplateServerVariant(state, "editor", projection, source, { persist: () => false }));
  assert.deepEqual(state, before); assert.equal(state.layouts.editor, f.layout);
  applyAdminTemplateServerVariant(state, "editor", projection, source, { persist: () => true });
  assert.deepEqual(state.items.private, before.items.private); assert.deepEqual(state.layouts.private, before.layouts.private);
  assert.equal(state.items.old, undefined); assert.equal(state.layouts.editor, f.layout);
});

test("another layout referencing an old owned entity prevents destructive server adoption", async () => {
  const f = await fixture(), projection = projectAdminTemplateServerVariant(f.layout, f.server, crypto.randomUUID());
  const state = { layouts: { editor: f.layout, private: { id: "private", arrangement: { items: { old: "bag" } } } },
    items: { old: { id: "old", publicCatalogLayoutId: "editor" } }, containers: {} }, before = structuredClone(state);
  assert.throws(() => applyAdminTemplateServerVariant(state, "editor", projection, f.layout.adminCausalSource, { persist: () => true }));
  assert.deepEqual(state, before);
});

test("a legacy editor with unowned roots cannot silently replace or privatize their records", async () => {
  const f = await fixture(), projection = projectAdminTemplateServerVariant(f.layout, f.server, crypto.randomUUID());
  f.layout.rootContainerIds = ["unowned"];
  const state = { layouts: { editor: f.layout }, items: {}, containers: { unowned: { id: "unowned", itemIds: [] } } };
  const before = structuredClone(state);
  assert.throws(() => applyAdminTemplateServerVariant(state, "editor", projection, f.layout.adminCausalSource, { persist: () => true }));
  assert.deepEqual(state, before);
});

test("adoption and reopening preserve a detached catalog tree and never rearrange unrelated records", async () => {
  const f = await fixture(); f.layout.adminDemo = true;
  f.server.payload = { layouts: { main: { id: "main", rootContainerIds: [], arrangement: {
    rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {}, itemQuantityMigrationVersion: 3 } } },
    containers: { outside: { id: "outside", childIds: ["nested"], itemIds: [], order: [{ type: "container", id: "nested" }] },
      nested: { id: "nested", parentId: "outside", itemIds: ["tool"], childIds: [], order: [{ type: "item", id: "tool" }] } },
    items: { tool: { id: "tool", containerId: "nested", quantity: 3 } } };
  const projection = projectAdminTemplateServerVariant(f.layout, f.server, crypto.randomUUID());
  const state = { layouts: { editor: f.layout, private: { id: "private", rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {} } } }, items: { personal: { id: "personal", containerId: "personalBag" } },
    containers: { personalBag: { id: "personalBag", childIds: [], itemIds: ["personal"], order: [{ type: "item", id: "personal" }] } } };
  const unrelated = structuredClone({ item: state.items.personal, bag: state.containers.personalBag });
  const applyArrangement = (id, target = state) => applyLayoutArrangementToState(target, id, {
    normalizeLayoutArrangement, repairContainerMembershipFromItemLinks, migrateContainerOrder: () => {} });
  applyAdminTemplateServerVariant(state, "editor", projection, f.layout.adminCausalSource, { persist: () => true, applyArrangement });
  assert.deepEqual({ item: state.items.personal, bag: state.containers.personalBag }, unrelated);
  for (let opening = 0; opening < 2; opening++) {
    const outside = Object.values(state.containers).find(row => row.sharedSourceId === "outside");
    const nested = Object.values(state.containers).find(row => row.sharedSourceId === "nested");
    const item = Object.values(state.items).find(row => row.sharedSourceId === "tool");
    assert.deepEqual(outside.childIds, [nested.id]); assert.equal(nested.parentId, outside.id);
    assert.deepEqual(nested.itemIds, [item.id]); assert.equal(item.containerId, nested.id); assert.equal(item.quantity, 3);
    assert.deepEqual(state.layouts.editor.rootContainerIds, []); normalizeLayoutFields(state); applyArrangement("private"); applyArrangement("editor");
  }
  const outside = Object.values(state.containers).find(row => row.sharedSourceId === "outside");
  const nested = Object.values(state.containers).find(row => row.sharedSourceId === "nested");
  const item = Object.values(state.items).find(row => row.sharedSourceId === "tool");
  const published = exportLayoutAsPublishedState(state, "editor", { clone: structuredClone, createLayoutArrangementFromCurrentState,
    ensureLayoutDictionaries: value => value, stripPublishedPublicOriginMarkers: () => {},
    normalizePublishedStatePayload: (payload, options) => {
      assert.equal(options.preserveCatalog, true); normalizeLayoutFields(payload, options);
      applyLayoutArrangementToState(payload, payload.activeLayoutId, { ...options, normalizeLayoutArrangement,
        repairContainerMembershipFromItemLinks, migrateContainerOrder: () => {} }); return payload;
    } });
  assert.deepEqual(published.containers["container-outside"].childIds, ["container-nested"]);
  assert.equal(published.items["item-tool"].quantity, 3); assert.equal(published.items["item-tool"].containerId, "container-nested");
  assert.deepEqual(published.layouts[published.activeLayoutId].rootContainerIds, []);
  state.layouts.editor.arrangement = { rootContainerIds: [nested.id],
    containers: { [nested.id]: { parentId: "", childIds: [], itemIds: [item.id], order: [{ type: "item", id: item.id }] } },
    items: { [item.id]: nested.id }, itemQuantities: { [item.id]: 2 }, packedItems: {} };
  applyArrangement("editor"); assert.deepEqual(outside.childIds, []); assert.equal(nested.parentId, null);
  assert.equal(item.containerId, nested.id); assert.equal(state.layouts.editor.arrangement.itemQuantities[item.id], 2);
});
