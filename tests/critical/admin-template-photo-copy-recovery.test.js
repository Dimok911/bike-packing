import test from "node:test";
import assert from "node:assert/strict";
import { adminPhotoCopyClientFixture, copy, hash } from "../fixtures/admin-template-photo-copy-client-fixture.js";
import { adminTemplatePhotoCopyEditorSnapshot } from "../../src/sync/admin-template-photo-copy-save-plan.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { createAdminTemplateRecovery } from "../../src/public/admin-template-recovery.js";
import { createAdminTemplateStopChoice } from "../../src/public/admin-template-stop-choice.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";

const stopPrefix = "bike-packing-admin-stop-choice-v1:";
const noBusiness = f => { assert.equal(f.server.savePosts.length, 0); assert.equal(f.server.stagePosts.length, 0); };

async function fixture(options = {}) {
  const f = await adminPhotoCopyClientFixture(options), snapshot = adminTemplatePhotoCopyEditorSnapshot(f.record);
  const target = f.record.snapshot.target, layout = copy(target.beforeState.layouts[target.layoutId]);
  layout.adminCausalSource = { ...layout.adminCausalSource, planId: f.id, base: { operationId: f.id }, photoCopyPending: f.id };
  const calls = [], server = { ok: true, ...f.binding, exists: true, deleted: false, stateRevision: f.intent.body.base.stateRevision,
    visibility: "private", indexes: [], payload: copy(f.intent.body.payload), metadata: copy(f.intent.body.metadata) };
  const ordinary = Object.fromEntries(["capture", "read", "run", "cancel", "inspect"].map(method => [method, () => {
    calls.push(method); throw Error("Copy used ordinary command client");
  }]));
  ordinary.prepare = async () => { calls.push("prepare"); f.afterPrepare?.(); return copy(server); };
  const make = ({ copyClient = f.make().client, photoCopyEnabled = true, ...extra } = {}) => {
    let recovery;
    const plans = createAdminTemplateSavePlans({ binding: f.binding, getContext: () => f.current, client: ordinary,
      photoCopyStore: f.store, photoCopyClient: copyClient, photoCopyEnabled, enabled: true, storage: f.storage, locks: f.locks,
      shouldCancel: id => recovery.requiresCancellation(id) });
    recovery = createAdminTemplateRecovery({ binding: f.binding, getContext: () => f.current, plans, client: ordinary,
      photoCopyClient: copyClient, enabled: true, storage: f.storage, locks: f.locks, ...extra });
    const choice = (overrides = {}) => createAdminTemplateStopChoice({ binding: f.binding, layoutId: layout.id, priorPlanId: f.id,
      getContext: () => f.current, getSource: () => layout.adminCausalSource, snapshot: () => snapshot,
      client: ordinary, photoCopyClient: copyClient, plans, recovery, enabled: true, storage: f.storage, locks: f.locks,
      projectServer: (value, id) => projectAdminTemplateServerVariant(layout, value, id, { photoBinding: f.binding, photoOwnerMapEnabled: true }), ...overrides });
    return { plans, recovery, choice, copyClient };
  };
  const active = make();
  await active.plans.capturePhotoCopy({ operationId: f.id, body: copy(f.record.action.body), editorSnapshot: snapshot, recordIntentHash: f.record.intentHash });
  const stop = async controller => { await controller.recovery.captureStop(f.id, snapshot); return controller.recovery.resumeStop(f.id); };
  return Object.assign(f, { snapshot, layout, ordinary, calls, prepared: server, controllers: make, active, stop });
}

for (const entityType of ["item", "container"]) test(`V8 ${entityType}: cold stopped copy adopts only a server comparison and retains both original snapshots`, async () => {
  const f = await fixture({ entityType }), original = copy(await f.store.read(f.id));
  assert.equal((await f.stop(f.active)).state, "stopped"); assert.equal(f.server.cancelPosts.length, 1); noBusiness(f);
  const cold = f.controllers({ photoCopyEnabled: false, copyClient: f.make({ enabled: false, appendEnabled: false, createEnabled: false }).client });
  assert.equal((await cold.recovery.inspect(f.id, { refresh: true })).stopped, true);
  const opened = await cold.choice().open(); assert.match(opened.localUnavailableReason, /серверный вариант/);
  assert.deepEqual(f.calls, ["prepare"]);
  const before = [...f.values];
  await assert.rejects(cold.choice().choose(opened, { variant: "local" })); assert.deepEqual([...f.values], before);
  f.controls.rejectWrite = key => key.startsWith(stopPrefix);
  await assert.rejects(cold.choice().choose(opened, { variant: "server" }), /Quota/);
  assert.deepEqual(await f.store.read(f.id), original); assert.deepEqual([...f.values], before);
  f.controls.rejectWrite = null;
  const selected = await cold.choice().choose(opened, { variant: "server" });
  assert.equal(selected.version, 2); assert.deepEqual(selected.local, f.snapshot); assert.deepEqual(selected.server, f.prepared);
  const resumed = await f.controllers().choice().resume();
  assert.deepEqual(resumed.serverAdoption.source.adoptedStop, { choiceId: selected.id, priorPlanId: f.id });
  assert.deepEqual(await cold.choice().excludedPlans(resumed.serverAdoption.source.adoptedStop), [f.id]);
  assert.deepEqual(await f.store.read(f.id), original); assert.equal((await cold.plans.list()).length, 1);
  assert.equal(f.layout.adminCausalSource.planId, f.id); assert.deepEqual(f.calls, ["prepare"]); noBusiness(f);
});

test("V8 inspection reads queued and locally unknown copies without creating a command or repeating a lost save", async () => {
  const f = await fixture(), initial = await f.active.recovery.inspect(f.id, { refresh: true });
  assert.equal(initial.operations[0].state, "queued"); assert.equal(await f.active.copyClient.read(f.id), null);
  assert.equal(f.server.calls.length, 0);
  f.controls.loseSave = true; f.controls.hideSave = true;
  await assert.rejects(f.active.plans.run(f.id)); assert.equal(f.server.savePosts.length, 1);
  f.controls.hideSave = false;
  const cold = f.controllers({ photoCopyEnabled: false, copyClient: f.make({ enabled: false }).client });
  const refreshed = await cold.recovery.inspect(f.id, { refresh: true });
  assert.equal(refreshed.operations[0].state, "committed"); assert.equal(refreshed.stopped, false);
  assert.equal(f.server.stagePosts.length, 2); assert.equal(f.server.savePosts.length, 1); assert.deepEqual(f.calls, []);
});

test("V8 an unknown stage cannot authorize adoption; confirmed cancellation preserves its original claim and record", async () => {
  const f = await fixture(); f.controls.unknownStage = true;
  await assert.rejects(f.active.plans.run(f.id));
  const claims = copy([...f.idb.rows("stage-dispatches")]);
  await f.active.recovery.captureStop(f.id, f.snapshot);
  await assert.rejects(f.active.choice().open()); assert.deepEqual(f.calls, []);
  assert.equal((await f.active.recovery.resumeStop(f.id)).state, "stopped");
  assert.equal((await f.active.recovery.inspect(f.id)).operations[0].cancelled, true);
  const opened = await f.active.choice().open(); await f.active.choice().choose(opened, { variant: "server" });
  const resumed = await f.controllers().choice().resume();
  assert.deepEqual(await f.active.choice().excludedPlans(resumed.serverAdoption.source.adoptedStop), [f.id]);
  assert.deepEqual([...f.idb.rows("stage-dispatches")], claims); assert.deepEqual(await f.store.read(f.id), f.record);
  assert.equal(f.server.stagePosts.length, 1); assert.equal(f.server.savePosts.length, 0); assert.equal(f.server.cancelPosts.length, 1);
});

test("V8 late accepted copy is retained and cannot be excluded against an older prepared target", async () => {
  const f = await fixture(); await f.active.plans.run(f.id); await f.stop(f.active);
  assert.equal((await f.active.recovery.inspect(f.id)).committedCount, 1);
  const stale = await f.active.choice().open();
  await assert.rejects(f.active.choice().choose(stale, { variant: "server" }));
  assert.ok(![...f.values.keys()].some(key => key.startsWith(stopPrefix)));
  f.prepared.stateRevision = f.receipt.result.payload.stateRevision;
  f.prepared.payload = copy(f.receipt.result.payload.photoCopy.confirmedPayload);
  const opened = await f.active.choice().open(), selected = await f.active.choice().choose(opened, { variant: "server" });
  const resumed = await f.controllers().choice().resume();
  assert.equal(resumed.serverAdoption.source.base.stateRevision, f.prepared.stateRevision);
  assert.deepEqual(await f.active.choice().excludedPlans(resumed.serverAdoption.source.adoptedStop), [f.id]);
  assert.deepEqual(selected.server.payload, f.receipt.result.payload.photoCopy.confirmedPayload);
  assert.equal(f.server.savePosts.length, 1); assert.equal(f.server.cancelPosts.length, 0);
});

test("V8 missing or foreign copy client never falls back to ordinary reads or inspect", async () => {
  const f = await fixture();
  for (const client of [null, { ...f.active.copyClient, binding: { ...f.binding, actorId: "foreign" } },
    { ...f.active.copyClient, binding: { ...f.binding, listId: "public-demo-state-other" } }]) {
    await assert.rejects(f.controllers({ photoCopyClient: client }).recovery.inspect(f.id, { refresh: true }));
  }
  assert.deepEqual(f.calls, []); assert.equal(f.server.calls.length, 0); noBusiness(f);
});

test("V8 recovery rechecks full record, plan and context after copy-client awaits", async () => {
  for (const fault of ["record", "plan", "scope", "intent", "record-hash", "refresh"]) {
    const f = await fixture(); await f.active.copyClient.capture(f.record.action);
    const real = f.active.copyClient;
    const modified = { ...real, async read(id) {
      const saved = await real.read(id);
      if (fault === "record") f.idb.rows().clear();
      if (fault === "plan") {
        const key = [...f.values.keys()].find(key => key.startsWith("bike-packing-admin-save-plans-v1:")), row = JSON.parse(f.values.get(key));
        row.plan.editorSnapshot.metadata.title = "Swapped"; row.digest = hash(row.plan); f.values.set(key, JSON.stringify(row));
      }
      if (fault === "scope") f.current.generation = "different-editor";
      if (fault === "intent") saved.intent.body.photoCopy.fields.name = "Another copy";
      if (fault === "record-hash") saved.recordIntentHash = hash("other record");
      return saved;
    }, async inspect(id) { const result = await real.inspect(id); if (fault === "refresh") f.idb.rows().clear(); return result; } };
    await assert.rejects(f.controllers({ copyClient: modified }).recovery.inspect(f.id, { refresh: true })); noBusiness(f);
    assert.deepEqual(f.calls, []);
  }
});

test("V8 refreshed copy journal must still describe the exact saved intent", async () => {
  const f = await fixture(); await f.active.copyClient.capture(f.record.action); let refreshed = false;
  const real = f.active.copyClient, client = { ...real, async inspect(id) { const result = await real.inspect(id); refreshed = true; return result; },
    async read(id) { const saved = await real.read(id); if (refreshed) saved.intent.body.photoCopy.fields.name = "Replaced after GET"; return saved; } };
  await assert.rejects(f.controllers({ copyClient: client }).recovery.inspect(f.id, { refresh: true })); noBusiness(f);
});

test("V8 terminal adoption rechecks its record after read and cannot trust only a previous stopped summary", async () => {
  for (const fault of ["missing-client", "binding", "record", "hash", "context"]) {
    const f = await fixture(); await f.stop(f.active);
    const opened = await f.active.choice().open(), stopped = await f.active.recovery.inspect(f.id);
    const selected = { ...f.active.copyClient, async read(id) {
      const saved = await f.active.copyClient.read(id);
      if (fault === "record") f.idb.rows().clear();
      if (fault === "hash") saved.recordIntentHash = hash("other original record");
      if (fault === "context") f.current.generation = "other-editor";
      return saved;
    } };
    if (fault === "binding") selected.binding = { ...f.binding, itemKey: "other-key" };
    const choice = f.active.choice({ photoCopyClient: fault === "missing-client" ? null : selected, recovery: { inspect: async () => stopped } });
    await assert.rejects(choice.choose(opened, { variant: "server" }));
    assert.ok(![...f.values.keys()].some(key => key.startsWith(stopPrefix))); noBusiness(f);
  }
});

test("V8 cold choices still require both retained copy snapshots and cannot resurrect a local replay", async () => {
  const f = await fixture(); await f.stop(f.active); const choice = f.active.choice();
  await choice.choose(await choice.open(), { variant: "server" });
  const key = [...f.values.keys()].find(key => key.startsWith(stopPrefix)), raw = f.values.get(key), row = JSON.parse(raw);
  row.choice.version = 1; for (const field of ["variant", "projection", "knownPlans"]) delete row.choice[field];
  row.digest = hash(row.choice); f.values.set(key, JSON.stringify(row));
  await assert.rejects(f.controllers().choice().resume());
  f.values.set(key, raw);
  const marker = (await f.controllers().choice().resume()).serverAdoption.source.adoptedStop;
  f.idb.rows().clear();
  await assert.rejects(f.controllers().choice().resume()); await assert.rejects(f.controllers().choice().excludedPlans(marker));
  await assert.rejects(f.active.copyClient.list()); noBusiness(f);
});
