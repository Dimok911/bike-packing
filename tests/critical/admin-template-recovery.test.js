import test from "node:test";
import assert from "node:assert/strict";
import { adminClientFixture } from "../fixtures/admin-template-client-fixture.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { createAdminTemplateRecovery } from "../../src/public/admin-template-recovery.js";
import { createAdminTemplateSaveFlow, adminTemplateEditorSource } from "../../src/public/admin-template-causal-save-flow.js";

function fixture() {
  const f = adminClientFixture(), body = f.action().body;
  const snapshot = { payload: body.payload, metadata: body.metadata };
  const layout = { id: "editor", adminCausalSource: adminTemplateEditorSource(f.binding, { ok: true, ...f.binding,
    exists: true, stateRevision: 7, visibility: "private", indexes: [] }) };
  const storage = { get length() { return f.values.size; }, key: i => [...f.values.keys()][i], getItem: key => f.values.get(key) ?? null,
    setItem: (key, value) => { if (f.state.quota || f.stopQuota && key.startsWith("bike-packing-admin-stop-v1:")
      || f.planStopQuota && key.startsWith("bike-packing-admin-save-plans-v1:") && JSON.parse(value).cancelRequested) throw Error("Quota"); f.values.set(key, value); } };
  const tails = new Map(), locks = { request: (key, task) => {
    const next = (tails.get(key) || Promise.resolve()).catch(() => {}).then(task); tails.set(key, next); return next;
  } };
  let recovery;
  const client = { ...f.make().client };
  const plans = createAdminTemplateSavePlans({ binding: f.binding, client, getContext: () => f.context, storage, locks, enabled: true,
    shouldCancel: id => recovery.requiresCancellation(id) });
  recovery = createAdminTemplateRecovery({ binding: f.binding, client, plans, getContext: () => f.context, storage, locks, enabled: true });
  const makeFlow = () => createAdminTemplateSaveFlow({ enabled: true, getLayout: id => id === layout.id ? layout : null,
    getContext: () => f.context, snapshot: () => snapshot, plansFor: () => plans, recoveryFor: () => recovery, persist: () => {} });
  return Object.assign(f, { client, plans, recovery, snapshot, layout, makeFlow, flow: makeFlow() });
}
async function capture(f, published = true) { return f.flow.capture(f.layout.id, { published }); }
async function stop(f) { return f.recovery.captureStop(f.layout.adminCausalSource.planId, f.snapshot); }

test("stopping a saved chain cancels dependents first with original IDs and leaves the editor intact", async () => {
  const f = fixture(); await capture(f, false); f.snapshot.metadata.title = "Next name"; await capture(f);
  const before = structuredClone(f.layout), choice = await stop(f), result = await f.flow.flush(f.layout.id);
  assert.equal(result.state, "stopped"); assert.deepEqual(f.layout, before);
  const records = await f.plans.list(), ordered = choice.plans.flatMap(entry => records.find(row => row.plan.id === entry.id).plan.operations.map(intent => intent.id));
  assert.deepEqual(f.posts().map(call => JSON.parse(call.options.body).operationId), ordered.reverse());
  assert.ok(f.posts().every(call => call.url.endsWith("/cancel")));
  assert.equal((await f.recovery.inspect(choice.id)).stopped, true);
  assert.equal(JSON.parse([...f.values].find(([key]) => key.startsWith("bike-packing-admin-stop-v1:"))[1]).choice.editorSnapshot.metadata.title, "Next name");
});

test("lost cancellation acknowledgement resumes the retained stop through normal flush after reload", async () => {
  const f = fixture(); await capture(f); const choice = await stop(f);
  f.state.lose = true; f.state.hidden = true; await assert.rejects(f.flow.flush(f.layout.id));
  const first = JSON.parse(f.posts()[0].options.body).operationId;
  f.state.lose = false; f.state.hidden = false;
  assert.equal((await f.makeFlow().flush(f.layout.id)).state, "stopped");
  assert.equal(f.posts().filter(call => JSON.parse(call.options.body).operationId === first).length, 1);
  assert.ok(f.posts().every(call => call.url.endsWith("/cancel")));
  assert.equal((await f.recovery.inspect(choice.id)).stopped, true);
});

test("stopping after a lost save receipt preserves the accepted save and cancels publication", async () => {
  const f = fixture(); await capture(f); f.state.lose = true; f.state.hidden = true;
  await assert.rejects(f.flow.flush(f.layout.id)); await stop(f); f.state.lose = false; f.state.hidden = false;
  const result = await f.makeFlow().flush(f.layout.id);
  assert.equal(result.state, "stopped"); assert.equal(result.committedCount, 1);
  assert.deepEqual(f.posts().map(call => [JSON.parse(call.options.body).kind, call.url.endsWith("/cancel")]),
    [["template.save", false], ["template.publication", true]]);
  assert.equal(f.layout.adminCausalSource.planId !== null, true);
});

test("a stop arriving while a save runs prevents the next publication effect", async () => {
  const f = fixture(); await capture(f); const run = f.client.run;
  f.client.run = async id => { const receipt = await run(id); await stop(f); return receipt; };
  assert.equal((await f.flow.flush(f.layout.id)).state, "cancelled");
  assert.deepEqual(f.posts().map(call => [JSON.parse(call.options.body).kind, call.url.endsWith("/cancel")]),
    [["template.save", false], ["template.publication", true]]);
  assert.equal((await f.makeFlow().flush(f.layout.id)).state, "stopped");
});

test("stop choice quota leaves all actions and the local draft pending without a request", async () => {
  const f = fixture(); await capture(f); f.stopQuota = true; const before = structuredClone(f.layout);
  await assert.rejects(stop(f), /Quota/); assert.equal(f.posts().length, 0); assert.deepEqual(f.layout, before);
  assert.equal((await f.recovery.inspect(f.layout.adminCausalSource.planId)).stopRequested, false);
});

test("a corrupted stop decision blocks ordinary dispatch instead of ignoring the decision", async () => {
  const f = fixture(); await capture(f); await stop(f);
  const [key, raw] = [...f.values].find(([key]) => key.startsWith("bike-packing-admin-stop-v1:"));
  const row = JSON.parse(raw); row.choice.editorSnapshot.metadata.title = "Corrupted"; f.values.set(key, JSON.stringify(row));
  await assert.rejects(f.makeFlow().flush(f.layout.id)); assert.equal(f.posts().length, 0);
});

test("a stop remains authoritative across the gap before individual plan cancellation is saved", async () => {
  const f = fixture(); await capture(f); await stop(f); f.planStopQuota = true;
  await assert.rejects(f.flow.flush(f.layout.id), /Quota/); assert.equal(f.posts().length, 0);
  f.planStopQuota = false; assert.equal((await f.makeFlow().flush(f.layout.id)).state, "stopped");
  assert.ok(f.posts().every(call => call.url.endsWith("/cancel")));
});

test("two tabs cannot overwrite each other's retained draft while stopping the same chain", async () => {
  const f = fixture(); await capture(f); const other = structuredClone(f.snapshot); other.metadata.title = "Other tab";
  const results = await Promise.allSettled([stop(f), f.recovery.captureStop(f.layout.adminCausalSource.planId, other)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  const saved = JSON.parse([...f.values].find(([key]) => key.startsWith("bike-packing-admin-stop-v1:"))[1]);
  assert.deepEqual(saved.choice, results.find(result => result.status === "fulfilled").value); assert.equal(f.posts().length, 0);
});

test("new edits cannot append to a stopped dependency without explicit reconciliation", async () => {
  const f = fixture(); await capture(f); await stop(f); const source = structuredClone(f.layout.adminCausalSource);
  f.snapshot.metadata.title = "Later local name";
  await assert.rejects(f.makeFlow().capture(f.layout.id, { published: false }));
  assert.deepEqual(f.layout.adminCausalSource, source); assert.equal(f.snapshot.metadata.title, "Later local name"); assert.equal(f.posts().length, 0);
});

test("stopping one selected chain does not cancel a separate saved branch", async () => {
  const f = fixture(); const selected = await capture(f, false), other = f.action();
  await f.plans.capture({ operationId: other.operationId, exists: true, visibility: "private", base: { stateRevision: 7 },
    payload: other.body.payload, metadata: other.body.metadata });
  await stop(f); await f.flow.flush(f.layout.id);
  assert.deepEqual(f.posts().map(call => JSON.parse(call.options.body).operationId), [selected.operationId]);
  assert.equal(await f.client.read(other.operationId), null);
});

for (const change of ["actor", "rights", "route"]) test(`stop cannot use stale ${change} context after a server reply`, async () => {
  const f = fixture(); await capture(f); await stop(f);
  f.state.afterPost = () => {
    if (change === "actor") f.context.actorId = "other";
    if (change === "rights") f.context.admin = false;
    if (change === "route") f.context.generation = "elsewhere";
  };
  await assert.rejects(f.flow.flush(f.layout.id)); assert.equal(f.posts().length, 1);
  assert.equal(f.layout.adminCausalSource.planId !== null, true);
});
