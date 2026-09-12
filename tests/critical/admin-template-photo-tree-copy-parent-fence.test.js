import test from "node:test";
import assert from "node:assert/strict";
import { treeReceiptFixture, cancellationFor, copy, hash } from "../fixtures/admin-template-photo-tree-copy-receipt-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { TREE_COPY_PARENT_FENCE_PREFIX, adminTemplatePhotoTreeCopyParentKeys as keysFor,
  prepareAdminTemplatePhotoTreeCopyParentFence as prepareFence, readAdminTemplatePhotoTreeCopyParentFence as readFence,
  matchesAdminTemplatePhotoTreeCopyParentFenceStage as matches } from "../../src/sync/admin-template-photo-tree-copy-parent-fence.js";
import { COPY_PARENT_FENCE_PREFIX, readAdminTemplatePhotoCopyParentFence } from "../../src/sync/admin-template-photo-copy-parent-fence.js";
import { createExperimentTransport, AMBIGUOUS_WRITE_KEY, EXPERIMENT_WRITE_LOCK, EXPERIMENT_FRONTEND_ORIGIN,
  EU_EXPERIMENT_API_BASE } from "../../src/sync/experiment-transport.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";

const path = "/bike-packing/admin/template-photo-assets/tree-copy", commandPath = "/bike-packing/admin/template-operations";
const locationLike = { origin: EXPERIMENT_FRONTEND_ORIGIN, hostname: "experiment.vniipo-help.ru" };
const descriptor = () => new Response(JSON.stringify({ ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
  capabilities: REQUIRED_ADMIN_API_CAPABILITIES }), { headers: { "X-Vniipo-Proxy-Target": "bike-packing-experiment", "X-Vniipo-Proxy-Write-Gate": "enabled" } });
async function fixture() {
  const f = await treeReceiptFixture(), binding = Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, f.intent[key]]));
  const id = f.intent.id, recordIntentHash = hash("retained full tree record"), receipt = cancellationFor(f), keys = keysFor(binding, id), values = new Map();
  const journal = { version: 1, kind: "admin-template-photo-tree-copy", intent: copy(f.intent), payloadDigest: f.payloadDigest,
    recordIntentHash, dispatched: false, stageReceipts: f.stages.map(() => null), receipt, cancelRequested: true };
  values.set(keys.command, canonical(journal));
  const entries = f.stages.map(stage => ({ id: stage.receipt.manifest.operationId, path, method: "POST", mode: "direct", identity: "",
    createdAt: "2026-09-12T00:00:00.000Z", uncertain: true, recovery: { type: "admin-template-photo-stage", protocol: "admin-template-photo-tree-copy-stage-v2",
      ...binding, operationId: stage.receipt.manifest.operationId, actionOperationId: id, assetDigest: stage.receipt.assetDigest, intentHash: recordIntentHash } }));
  for (const entry of entries) values.set(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`, JSON.stringify(entry));
  const originalStages = entries.map(entry => [entry.id, values.get(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`)]);
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const locks = { request: async (name, task) => task() };
  const cold = options => createExperimentTransport({ locationLike, selection: "direct", storage, locks, ...options });
  const request = { intent: f.intent, recordIntentHash, receipt, assertCurrent() {} };
  const permission = { operationId: id, payloadDigest: f.payloadDigest, assets: entries.map(entry => ({ assetId: entry.id, assetDigest: entry.recovery.assetDigest })),
    stageProtocol: "admin-template-photo-tree-copy-stage-v2", recordIntentHash };
  const metadata = { type: "admin-template", protocol: "admin-template-v1", ...binding, operationId: id, kind: "template.save", payloadDigest: f.payloadDigest, recordIntentHash };
  const unchanged = () => { for (const [id, text] of originalStages) assert.equal(values.get(`${AMBIGUOUS_WRITE_KEY}:${id}`), text); };
  return { ...f, binding, id, recordIntentHash, receipt, keys, values, journal, entries, storage, locks, cold, request, permission, metadata, unchanged,
    cancelPath: `${commandPath}/${id}/cancel` };
}

test("tree certificate binds all ordered owners and allows only exact legacy or boolean-marker journals", async () => {
  const f = await fixture(), certificate = await prepareFence({ ...f.request, mode: "direct" });
  assert.deepEqual(certificate.assets, f.permission.assets); assert.ok(f.intent.body.photoCopy.owners.some(owner => !owner.photos.length));
  for (const marker of [undefined, false, true]) {
    const journal = copy(f.journal); if (marker === undefined) delete journal.cancelRequested; else journal.cancelRequested = marker;
    const before = canonical(journal); assert.deepEqual(await readFence({ certificate, parentJournal: journal }), certificate); assert.equal(canonical(journal), before);
  }
  for (const marker of [null, 1, "true"]) await assert.rejects(readFence({ certificate, parentJournal: { ...f.journal, cancelRequested: marker } }));
  assert.ok(Object.isFrozen(certificate.assets)); f.unchanged();
});

test("forged bindings, digests, ordered assets, v1 and noncancellation terminal receipts cannot fence a tree", async () => {
  const f = await fixture(), certificate = await prepareFence({ ...f.request, mode: "direct" });
  for (const mutate of [c => { c.binding.actorId = "foreign"; }, c => { c.operationId = crypto.randomUUID(); }, c => { c.recordIntentHash = hash("other"); },
    c => { c.assets.reverse(); }, c => { c.assets[0].assetDigest = hash("other"); }, c => { c.stageProtocol = "admin-template-photo-copy-stage-v1"; },
    c => { c.receipt.result.payload.cancellation.noBusinessEffects = false; }, c => { c.receipt.result.payload.cancellation.operationCannotApply = false; },
    c => { c.receipt.result.payload.code = "template_source_changed"; delete c.receipt.result.payload.cancellation; }]) {
    const changed = copy(certificate); mutate(changed); await assert.rejects(readFence({ certificate: changed, parentJournal: f.journal }));
  }
  for (const mutate of [j => { j.intent.body.photoCopy.source.payload.opaque = "changed"; }, j => { j.intent.body.photoCopy.owners[0].entityId += "changed"; },
    j => { j.kind = "admin-template-photo-copy"; }, j => { j.receipt = null; }]) {
    const journal = copy(f.journal); mutate(journal); await assert.rejects(readFence({ certificate, parentJournal: journal }));
  }
  await assert.rejects(prepareFence({ ...f.request, mode: "ip" }));
  await assert.rejects(readAdminTemplatePhotoCopyParentFence({ certificate, parentJournal: f.journal }));
});

test("partial stage histories keep exact byte/path proofs; cross-owner materialization aliases never become retirement authority", async () => {
  const f = await fixture(), certificate = await prepareFence({ ...f.request, mode: "direct" }), journal = copy(f.journal);
  journal.stageReceipts = copy(f.stages); assert.deepEqual(await readFence({ certificate, parentJournal: journal }), certificate);
  journal.stageReceipts = f.stages.map((stage, index) => index < 2 ? copy(stage) : null);
  assert.deepEqual(await readFence({ certificate, parentJournal: journal }), certificate);
  for (const mutate of [j => { j.stageReceipts[0].receipt.sourceStored.file.hash = hash("changed bytes"); },
    j => { j.stageReceipts[1].receipt.sourceOwnerId = "different-source-owner"; },
    j => { j.stageReceipts[1].receipt.ownerId = "different-target-owner"; },
    j => { j.stageReceipts[1].receipt.materialization.target.filePathDigest = j.stageReceipts[0].receipt.materialization.target.filePathDigest; },
    j => { j.stageReceipts[1].receipt.materialization.target.filePathDigest = j.stageReceipts[0].receipt.materialization.source.filePathDigest; },
    j => { j.stageReceipts[0].receipt.manifest.version = 1; }, j => { j.dispatched = true; }]) {
    const changed = copy(journal); mutate(changed); await assert.rejects(readFence({ certificate, parentJournal: changed }));
  }
});

test("real transport allows only exact own tree cancellation across unknown stages, never stage/save replay or foreign metadata", async () => {
  const f = await fixture(), transport = f.cold(); await transport.prepare();
  transport.assertWritable(f.cancelPath, "POST", f.metadata, f.permission);
  for (const mutate of [p => { p.assets[0].assetDigest = hash("wrong"); }, p => { p.assets.pop(); }, p => { p.assets.push(p.assets[0]); },
    p => { p.recordIntentHash = hash("wrong"); }, p => { p.stageProtocol = "admin-template-photo-copy-stage-v1"; }, p => { p.operationId = crypto.randomUUID(); }]) {
    const permission = copy(f.permission); mutate(permission); assert.throws(() => transport.assertWritable(f.cancelPath, "POST", f.metadata, permission));
  }
  for (const target of [path, commandPath, `${commandPath}/${crypto.randomUUID()}/cancel`]) assert.throws(() => transport.assertWritable(target, "POST", f.metadata, f.permission));
  await transport.beginWrite(f.cancelPath, "POST", null, f.metadata, f.permission); f.unchanged();
  assert.ok(transport.writes.filter(row => row.id !== f.id).every(row => row.blocksWrites && !row.confirmed));
  const certificate = await prepareFence({ ...f.request, mode: "direct" });
  for (const mutate of [e => { e.mode = "eu"; }, e => { e.path += "/copy"; }, e => { e.recovery.actorId = "foreign"; },
    e => { e.recovery.actionOperationId = crypto.randomUUID(); }, e => { e.recovery.intentHash = hash("wrong"); }]) {
    const entry = copy(f.entries[0]); mutate(entry); assert.equal(matches(certificate, entry), false);
    f.values.set(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`, JSON.stringify(entry));
    assert.throws(() => f.cold().assertWritable(f.cancelPath, "POST", f.metadata, f.permission));
  }
});

test("current and cold OFF transport derive parentFenced without changing any stage bytes; typed prefix prevents fallback", async () => {
  const f = await fixture(), transport = f.cold(), before = f.values.get(f.keys.command);
  const certificate = await transport.fenceTreeCopyParent(f.request);
  assert.equal(f.values.get(f.keys.command), before); f.unchanged();
  for (const value of transport.writes) { assert.equal(value.parentFenced, true); assert.equal(value.blocksWrites, false); assert.equal(value.confirmed, undefined); }
  const next = f.cold(); assert.ok(next.uncertainWrite); await next.prepare(); assert.equal(next.uncertainWrite, null); f.unchanged();
  f.values.delete(f.keys.certificate);
  f.values.set(f.keys.certificate.replace(TREE_COPY_PARENT_FENCE_PREFIX, COPY_PARENT_FENCE_PREFIX), canonical(certificate));
  const wrongKind = f.cold(); await wrongKind.prepare(); assert.ok(wrongKind.uncertainWrite); f.unchanged();
});

test("cold direct cancellation proof permits verified EU selection but never exempts another pending action", async () => {
  const f = await fixture(); await f.cold().fenceTreeCopyParent(f.request);
  const probe = async url => { if (!url.startsWith(EU_EXPERIMENT_API_BASE)) throw TypeError("Direct unavailable"); return descriptor(); };
  const next = f.cold({ selection: "auto", autoEnabled: true, euEnabled: true, fetchImpl: probe });
  await next.prepare(); assert.equal(next.mode, "eu"); assert.equal(next.uncertainWrite, null);
  const foreign = copy(f.entries[0]); foreign.id = crypto.randomUUID(); foreign.recovery.operationId = foreign.id; foreign.recovery.actionOperationId = crypto.randomUUID();
  f.values.set(`${AMBIGUOUS_WRITE_KEY}:${foreign.id}`, JSON.stringify(foreign));
  const blocked = f.cold({ selection: "auto", autoEnabled: true, euEnabled: true, fetchImpl: probe }); await assert.rejects(blocked.prepare()); f.unchanged();
});

test("quota or missing certificate readback retains terminal parent and every pending barrier until exact retry", async () => {
  for (const readback of [false, true]) {
    const f = await fixture(); let hidden = false;
    const storage = { ...f.storage, getItem: key => hidden && key === f.keys.certificate ? null : f.storage.getItem(key),
      setItem(key, value) { if (key === f.keys.certificate) { if (!readback) throw Error("Quota"); f.storage.setItem(key, value); hidden = true; } else f.storage.setItem(key, value); } };
    const transport = f.cold({ storage }); await assert.rejects(transport.fenceTreeCopyParent(f.request));
    assert.ok(transport.uncertainWrite); assert.equal(JSON.parse(f.values.get(f.keys.command)).receipt.result.payload.code, "operation_cancelled"); f.unchanged();
    const next = f.cold(); await next.fenceTreeCopyParent(f.request); assert.equal(next.uncertainWrite, null); f.unchanged();
  }
});

test("certificate/parent/stage byte changes invalidate warm and cold proof caches", async () => {
  const f = await fixture(), transport = f.cold(); await transport.fenceTreeCopyParent(f.request); const original = new Map(f.values);
  for (const key of [f.keys.certificate, f.keys.command, `${AMBIGUOUS_WRITE_KEY}:${f.entries[0].id}`]) {
    f.values.set(key, "corrupt"); assert.throws(() => transport.assertWritable(path, "POST"));
    const next = f.cold(); await next.prepare(); assert.ok(next.uncertainWrite);
    f.values.clear(); for (const [name, value] of original) f.values.set(name, value); await transport.prepare(); assert.equal(transport.uncertainWrite, null);
  }
});

test("late lock/context loss and asynchronous guards cannot persist or bless a parent certificate", async () => {
  for (const fault of ["parent", "stage", "context", "async"]) {
    const f = await fixture(); let active = true;
    const locks = { async request(name, task) {
      assert.equal(name, EXPERIMENT_WRITE_LOCK);
      if (fault === "parent") f.values.set(f.keys.command, "changed");
      if (fault === "stage") { const entry = copy(f.entries[0]); entry.recovery.assetDigest = hash("changed"); f.values.set(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`, JSON.stringify(entry)); }
      if (fault === "context") active = false;
      return task();
    } };
    const transport = f.cold({ locks }), assertCurrent = fault === "async" ? async () => { throw Error("invalid async authority"); }
      : () => { if (!active) throw Error("context lost"); };
    await assert.rejects(transport.fenceTreeCopyParent({ ...f.request, assertCurrent }));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.values.has(f.keys.certificate), false); assert.ok(transport.uncertainWrite);
  }
});

test("caller input is detached before hashes; unavailable historic stage proof does not become a ready acknowledgement", async () => {
  const f = await fixture(), input = { ...f.request, intent: copy(f.intent), receipt: copy(f.receipt), mode: "direct" };
  const pending = prepareFence(input); input.intent.body.photoCopy.source.payload.opaque = "late"; input.receipt.result.payload.cancellation.noBusinessEffects = false;
  const certificate = await pending, journal = copy(f.journal); journal.stageReceipts[0] = copy(f.stages[0]); journal.stageReceipts[0].assetState = "unavailable";
  assert.deepEqual(await readFence({ certificate, parentJournal: journal }), certificate); assert.equal(journal.stageReceipts[0].assetState, "unavailable");
});
