import test from "node:test";
import assert from "node:assert/strict";
import { adminClientFixture } from "../fixtures/admin-template-client-fixture.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { createAdminTemplateRecovery } from "../../src/public/admin-template-recovery.js";
import { createAdminTemplateStopChoice } from "../../src/public/admin-template-stop-choice.js";
import { createAdminTemplateSaveFlow, adminTemplateEditorSource } from "../../src/public/admin-template-causal-save-flow.js";
import { adminTemplateComparisonHtml } from "../../src/ui/admin-template-comparison.js";

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
    getContext: () => f.context, getSource: () => f.layout.adminCausalSource, snapshot: () => f.local,
    client, plans: f.plans, recovery, storage, locks, enabled: true });
  f.makeFlow = () => createAdminTemplateSaveFlow({ enabled: true, getLayout: () => f.layout, getContext: () => f.context,
    snapshot: () => f.local, plansFor: () => f.plans, recoveryFor: () => recovery, resolutionFor: (_binding, _layout, id) => f.choice(id),
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
