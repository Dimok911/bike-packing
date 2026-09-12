import test from "node:test";
import assert from "node:assert/strict";
import { adminPhotoCopyClientFixture as fixture, copy, hash, commandPrefix } from "../fixtures/admin-template-photo-copy-client-fixture.js";
import { createExperimentTransport, AMBIGUOUS_WRITE_KEY, EXPERIMENT_WRITE_LOCK, EXPERIMENT_FRONTEND_ORIGIN, EU_EXPERIMENT_API_BASE } from "../../src/sync/experiment-transport.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { COPY_PARENT_FENCE_PREFIX, adminTemplatePhotoCopyParentKeys, prepareAdminTemplatePhotoCopyParentFence,
  readAdminTemplatePhotoCopyParentFence } from "../../src/sync/admin-template-photo-copy-parent-fence.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyStageManifests, adminTemplatePhotoCopyStageDigest } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { adminTemplatePhotoCopyEditorSnapshot } from "../../src/sync/admin-template-photo-copy-save-plan.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { createAdminTemplateRecovery } from "../../src/public/admin-template-recovery.js";
import { createAdminTemplateStopChoice } from "../../src/public/admin-template-stop-choice.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";

const locationLike = { origin: EXPERIMENT_FRONTEND_ORIGIN, hostname: "experiment.vniipo-help.ru" };
const keys = f => adminTemplatePhotoCopyParentKeys(f.binding, f.id);
const stageKey = f => `${AMBIGUOUS_WRITE_KEY}:${f.record.stages[0].operationId}`;
const journal = f => JSON.parse(f.values.get(keys(f).command));
const certificate = f => JSON.parse(f.values.get(keys(f).certificate));
const request = f => ({ intent: f.intent, recordIntentHash: f.record.intentHash, receipt: journal(f).receipt, assertCurrent() {} });
const descriptor = () => new Response(JSON.stringify({ ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION, capabilities: REQUIRED_ADMIN_API_CAPABILITIES }),
  { headers: { "X-Vniipo-Proxy-Target": "bike-packing-experiment", "X-Vniipo-Proxy-Write-Gate": "enabled" } });
const cold = (f, options = {}) => createExperimentTransport({ locationLike, selection: "direct", storage: f.storage, locks: f.locks, ...options });
async function pending() {
  const f = await fixture(), active = f.make(); await active.client.capture(f.record.action);
  f.controls.unknownStage = true; await assert.rejects(active.client.run(f.id));
  return Object.assign(f, { active, originalStage: f.values.get(stageKey(f)), originalClaims: copy([...f.idb.rows("stage-dispatches")]) });
}
async function cancelled() {
  const f = await pending(); await f.active.client.cancel(f.id); return f;
}
const remains = f => { assert.equal(f.values.get(stageKey(f)), f.originalStage); assert.deepEqual([...f.idb.rows("stage-dispatches")], f.originalClaims); };

test("parent fence preserves raw uncertain stage/claim while current and cold OFF readers derive only nonblocking status", async () => {
  const f = await cancelled(), before = [...f.values]; remains(f);
  const retained = f.active.transport.writes.find(row => row.id === f.record.stages[0].operationId);
  assert.equal(retained.uncertain, true); assert.equal(retained.confirmed, undefined); assert.equal(retained.parentFenced, true); assert.equal(retained.blocksWrites, false);
  const next = cold(f); assert.equal(next.uncertainWrite.id, retained.id); await next.prepare();
  assert.equal(next.uncertainWrite, null); next.assertWritable("/bike-packing/admin/template-photo-assets/copy", "POST");
  assert.deepEqual([...f.values], before); remains(f);
  assert.equal((await f.store.claimStage(f.id, retained.id)).fresh, false);
  assert.equal((await f.make({ enabled: false }).client.run(f.id)).result.payload.code, "operation_cancelled");
  assert.equal(f.server.stagePosts.length, 1); assert.equal(f.server.savePosts.length, 0);
});

test("cold RU fence permits verified EU route selection but another pending route still pins or blocks writes", async () => {
  const f = await cancelled(), probes = [];
  const probe = async url => { probes.push(url); if (!url.startsWith(EU_EXPERIMENT_API_BASE)) throw TypeError("Direct route unavailable"); return descriptor(); };
  const auto = cold(f, { selection: "auto", autoEnabled: true, euEnabled: true, fetchImpl: probe });
  await auto.prepare(); assert.equal(auto.mode, "eu"); assert.equal(auto.uncertainWrite, null);
  const identity = { type: "admin-template", protocol: "admin-template-v1", ...f.binding, operationId: crypto.randomUUID(), kind: "template.metadata", payloadDigest: hash("new edit") };
  await auto.beginWrite("/bike-packing/admin/template-operations", "POST", null, identity);
  assert.equal(auto.writes.find(row => row.id === identity.operationId).mode, "eu"); remains(f);
  const foreign = { ...JSON.parse(f.originalStage), id: crypto.randomUUID() }; foreign.recovery.operationId = foreign.id;
  foreign.recovery.actionOperationId = crypto.randomUUID(); f.values.set(`${AMBIGUOUS_WRITE_KEY}:${foreign.id}`, JSON.stringify(foreign));
  const pinned = cold(f, { selection: "auto", autoEnabled: true, euEnabled: true, fetchImpl: probe });
  const before = probes.length; await assert.rejects(pinned.prepare()); assert.equal(probes.length, before);
  const manual = cold(f, { selection: "eu", euEnabled: true, fetchImpl: probe }); await manual.prepare();
  assert.throws(() => manual.assertWritable("/bike-packing/admin/template-photo-assets/copy", "POST")); remains(f);
});

test("missing/corrupt/changed certificate, parent and stage bytes invalidate a verified cache synchronously", async () => {
  const f = await cancelled(), original = new Map(f.values), transport = cold(f); await transport.prepare();
  for (const change of [
    () => f.values.delete(keys(f).certificate), () => f.values.set(keys(f).certificate, "broken"),
    () => { const value = certificate(f); value.recordIntentHash = hash("wrong"); f.values.set(keys(f).certificate, canonical(value)); },
    () => f.values.delete(keys(f).command), () => { const value = journal(f); value.intent.body.payload.opaque = "changed"; f.values.set(keys(f).command, canonical(value)); },
    () => { const value = JSON.parse(f.originalStage); value.recovery.assetDigest = hash("wrong"); f.values.set(stageKey(f), JSON.stringify(value)); }
  ]) {
    change(); assert.throws(() => transport.assertWritable("/bike-packing/admin/template-photo-assets/copy", "POST"));
    const after = cold(f); await after.prepare(); assert.throws(() => after.assertWritable("/bike-packing/admin/template-photo-assets/copy", "POST"));
    f.values.clear(); for (const [key, value] of original) f.values.set(key, value); await transport.prepare(); assert.equal(transport.uncertainWrite, null);
  }
});

test("full certificate validator rejects mismatched binding, ordered assets, source digest and noncancellation terminal proof", async () => {
  const f = await cancelled(), original = certificate(f), parent = journal(f);
  for (const change of [value => { value.binding.actorId = "other"; }, value => { value.binding.listId = "public-demo-state"; },
    value => { value.operationId = crypto.randomUUID(); }, value => { value.recordIntentHash = hash("wrong"); },
    value => { value.payloadDigest = hash("wrong"); }, value => { value.assets.reverse(); },
    value => { value.assets[0].assetDigest = hash("wrong"); }, value => { value.stageProtocol = "admin-template-photo-create-stage-v2"; },
    value => { value.receipt.result.payload.cancellation.noBusinessEffects = false; }, value => { value.receipt.result.payload.cancellation.operationCannotApply = false; },
    value => { value.receipt = copy(f.receipt); }, value => { value.extra = true; }
  ]) { const value = copy(original); change(value); await assert.rejects(readAdminTemplatePhotoCopyParentFence({ certificate: value, parentJournal: parent })); }
  for (const change of [value => { value.intent.body.photoCopy.source.payload.opaque = "unsaved"; },
    value => { value.intent.body.photoCopy.assets[0].assetDigest = hash("different stage"); }, value => { value.recordIntentHash = hash("other"); },
    value => { value.receipt.result.payload.code = "template_source_changed"; delete value.receipt.result.payload.cancellation; },
    value => { value.receipt = null; }]) {
    const value = copy(parent); change(value); await assert.rejects(readAdminTemplatePhotoCopyParentFence({ certificate: original, parentJournal: value }));
  }
  await assert.rejects(prepareAdminTemplatePhotoCopyParentFence({ ...request(f), mode: "ip" })); remains(f);
});

test("fence quota/readback failure preserves terminal receipt and barrier until exact local proof can be retained", async () => {
  for (const readback of [false, true]) {
    const f = await pending(); let badReadback = null;
    const storage = { ...f.storage, getItem(key) { if (badReadback === key) return null; return f.storage.getItem(key); },
      setItem(key, value) { if (key.startsWith(COPY_PARENT_FENCE_PREFIX)) {
        if (!readback) throw Error("Quota"); f.storage.setItem(key, value); badReadback = key; return;
      } f.storage.setItem(key, value); } };
    const transport = cold(f, { storage });
    await assert.rejects(f.make({ transport }).client.cancel(f.id));
    assert.equal(journal(f).receipt.result.payload.code, "operation_cancelled"); remains(f);
    assert.equal(transport.writes.find(row => row.id === f.record.stages[0].operationId).blocksWrites, true);
    await f.make().client.inspect(f.id); const recovered = cold(f); await recovered.prepare(); assert.equal(recovered.uncertainWrite, null);
    assert.equal(f.server.cancelPosts.length, 1); remains(f);
  }
});

test("actual byte changes during async validation or while awaiting the write lock reblock without a forged certificate", async () => {
  const f = await cancelled(), original = new Map(f.values);
  f.values.delete(keys(f).certificate);
  const locks = { request: async (name, callback) => {
    if (name === EXPERIMENT_WRITE_LOCK) f.values.set(keys(f).command, "changed while waiting"); return f.locks.request(name, callback);
  } };
  const t = cold(f, { locks }); await assert.rejects(t.fenceCopyParent({ ...request({ ...f, values: original }), assertCurrent() {} }));
  assert.equal(f.values.has(keys(f).certificate), false); remains(f);
  f.values.clear(); for (const [key, value] of original) f.values.set(key, value);
  let changed = false;
  const storage = { ...f.storage, getItem(key) {
    const value = f.storage.getItem(key);
    if (key === keys(f).command && !changed) { changed = true; queueMicrotask(() => f.values.set(key, "changed during hash")); }
    return value;
  } };
  const hashing = cold(f, { storage }); await hashing.prepare(); assert.equal(hashing.writes.find(row => row.id === f.record.stages[0].operationId).blocksWrites, true);
  assert.throws(() => hashing.assertWritable("/bike-packing/admin/template-photo-assets/copy", "POST")); remains(f);
});

test("a new writer rechecks all proof bytes inside the real transport lock before registration", async () => {
  const f = await cancelled(); let breakProof = false;
  const locks = { request: (name, callback) => f.locks.request(name, () => {
    if (name === EXPERIMENT_WRITE_LOCK && breakProof) f.values.delete(keys(f).certificate); return callback();
  }) };
  const transport = cold(f, { locks }); await transport.prepare(); breakProof = true;
  const operationId = crypto.randomUUID();
  await assert.rejects(transport.beginWrite("/bike-packing/admin/template-photo-assets/copy", "POST", null, { operationId }));
  assert.equal(f.values.has(`${AMBIGUOUS_WRITE_KEY}:${operationId}`), false); remains(f);
});

test("late genuine stage receipt stays separate from the parent fence and never revives the cancelled copy", async () => {
  const f = await cancelled(), id = f.record.stages[0].operationId;
  f.server.stages.set(id, copy(f.stages[0])); const response = await f.make().client.inspectStage(f.id, id);
  assert.deepEqual(response, f.stages[0]); assert.deepEqual(JSON.parse(f.values.get(stageKey(f))).receipt, response);
  assert.equal(JSON.parse(f.values.get(stageKey(f))).confirmed, true);
  assert.equal(certificate(f).receipt.result.payload.code, "operation_cancelled");
  assert.equal((await f.make().client.run(f.id)).result.payload.code, "operation_cancelled");
  assert.equal(f.server.stagePosts.length, 1); assert.equal(f.server.savePosts.length, 0);
});

test("real server adoption releases a new copy UUID through the actual store/client without reusing the unknown stage", async () => {
  const f = await pending(), snapshot = adminTemplatePhotoCopyEditorSnapshot(f.record), target = f.record.snapshot.target;
  const layout = copy(target.beforeState.layouts[target.layoutId]); layout.adminCausalSource = { ...layout.adminCausalSource, planId: f.id, base: { operationId: f.id }, photoCopyPending: f.id };
  const server = { ok: true, ...f.binding, exists: true, deleted: false, visibility: "private", stateRevision: f.intent.body.base.stateRevision,
    payload: copy(f.intent.body.payload), metadata: copy(f.intent.body.metadata), indexes: [] };
  const ordinary = { prepare: async () => copy(server), capture() { throw Error("Ordinary writer forbidden"); } };
  const plans = createAdminTemplateSavePlans({ binding: f.binding, getContext: () => f.current, client: ordinary, photoCopyClient: f.active.client,
    photoCopyStore: f.store, photoCopyEnabled: true, enabled: true, storage: f.storage, locks: f.locks });
  await plans.capturePhotoCopy({ operationId: f.id, body: f.record.action.body, editorSnapshot: snapshot, recordIntentHash: f.record.intentHash });
  const recovery = createAdminTemplateRecovery({ binding: f.binding, getContext: () => f.current, plans, client: ordinary,
    photoCopyClient: f.active.client, storage: f.storage, locks: f.locks, enabled: true });
  await recovery.captureStop(f.id, snapshot); assert.equal((await recovery.resumeStop(f.id)).state, "stopped");
  const choice = createAdminTemplateStopChoice({ binding: f.binding, layoutId: layout.id, priorPlanId: f.id, getContext: () => f.current,
    getSource: () => layout.adminCausalSource, snapshot: () => snapshot, client: ordinary, photoCopyClient: f.active.client, plans, recovery,
    storage: f.storage, locks: f.locks, enabled: true,
    projectServer: (value, id) => projectAdminTemplateServerVariant(layout, value, id, { photoBinding: f.binding, photoOwnerMapEnabled: true }) });
  await choice.choose(await choice.open(), { variant: "server" }); const { serverAdoption: adopted } = await choice.resume();
  const nextInput = copy(f.input); nextInput.action.operationId = crypto.randomUUID();
  const copyIntent = nextInput.action.body.photoCopy; copyIntent.entityId = `copy-next-${crypto.randomUUID()}`;
  nextInput.snapshot.copiedOwner.serverId = copyIntent.entityId; nextInput.snapshot.copiedOwner.localId = `local-${copyIntent.entityId}`;
  copyIntent.assets.forEach(asset => { asset.assetId = crypto.randomUUID(); asset.photoId = `photo-${crypto.randomUUID()}`; });
  const manifests = await adminTemplatePhotoCopyStageManifests(adminTemplatePhotoCopyIntent({ ...f.binding, ...nextInput.action }));
  for (const [index, manifest] of manifests.entries()) copyIntent.assets[index].assetDigest = await adminTemplatePhotoCopyStageDigest(manifest);
  const projection = copy(adopted.projection); projection.layout.adminCausalSource = { ...projection.layout.adminCausalSource, ...adopted.source };
  nextInput.snapshot.target = { layoutId: projection.layoutId, ownerMap: projection.layout.adminCausalSource.photoOwnerMap, metadata: copy(server.metadata),
    beforeState: { activeLayoutId: projection.layoutId, layouts: { [projection.layoutId]: projection.layout }, items: projection.items, containers: projection.containers,
      locations: copy(server.payload.locations), categories: copy(server.payload.categories), packedItems: copy(projection.layout.arrangement.packedItems) } };
  const next = await fixture({ recordInput: nextInput });
  await assert.rejects(f.store.capture({ action: next.record.action, snapshot: next.record.snapshot }));
  const store = f.makeStore({ getExcludedOperations: () => choice.excludedPlans(adopted.source.adoptedStop) });
  await store.capture({ action: next.record.action, snapshot: next.record.snapshot });
  const transport = cold(f), client = next.make({ transport, store, storage: f.storage, locks: f.locks, getContext: () => f.current }).client;
  await client.capture(next.record.action); assert.deepEqual(await client.run(next.id), next.receipt);
  assert.notEqual(next.id, f.id); assert.equal(next.server.stagePosts.length, 2); assert.equal(next.server.savePosts.length, 1);
  assert.equal(f.server.stagePosts.length, 1); assert.equal(f.server.savePosts.length, 0); assert.equal(f.idb.rows().size, 2);
  assert.deepEqual(await store.read(f.id), f.record); assert.equal(f.values.get(stageKey(f)), f.originalStage);
});
