import test from "node:test";
import assert from "node:assert/strict";
import { wholeCopyReceiptFixture, cancelWholeReceipt, copy, hash } from "../fixtures/admin-template-photo-whole-copy-receipt-fixture.js";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { WHOLE_COPY_PARENT_FENCE_PREFIX, adminTemplatePhotoWholeCopyParentKeys as keysFor,
  prepareAdminTemplatePhotoWholeCopyParentFence as prepareFence, readAdminTemplatePhotoWholeCopyParentFence as readFence,
  matchesAdminTemplatePhotoWholeCopyParentFenceStage as matches } from "../../src/sync/admin-template-photo-whole-copy-parent-fence.js";
import { COPY_PARENT_FENCE_PREFIX, readAdminTemplatePhotoCopyParentFence } from "../../src/sync/admin-template-photo-copy-parent-fence.js";
import { createExperimentTransport, AMBIGUOUS_WRITE_KEY, EXPERIMENT_WRITE_LOCK, EXPERIMENT_FRONTEND_ORIGIN,
  EU_EXPERIMENT_API_BASE } from "../../src/sync/experiment-transport.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";
import { wholeCopyClientFixture } from "../fixtures/admin-template-photo-whole-copy-client-fixture.js";
import { readAdminTemplatePhotoTreeCopyParentFence } from "../../src/sync/admin-template-photo-tree-copy-parent-fence.js";

const path = "/bike-packing/admin/template-photo-assets/whole-copy", commandPath = "/bike-packing/admin/template-operations";
const locationLike = { origin: EXPERIMENT_FRONTEND_ORIGIN, hostname: "experiment.vniipo-help.ru" };
const descriptor = () => new Response(JSON.stringify({ ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
  capabilities: REQUIRED_ADMIN_API_CAPABILITIES }), { headers: { "X-Vniipo-Proxy-Target": "bike-packing-experiment", "X-Vniipo-Proxy-Write-Gate": "enabled" } });
async function fixture() {
  const f = await wholeCopyReceiptFixture(); f.payloadDigest = f.expected.payloadDigest; const binding = Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, f.intent[key]]));
  const id = f.intent.id, recordIntentHash = hash("retained full whole record"), receipt = cancelWholeReceipt(f), keys = keysFor(binding, id), values = new Map();
  const journal = { version: 1, kind: "admin-template-photo-whole-copy", intent: copy(f.intent), payloadDigest: f.payloadDigest,
    recordIntentHash, dispatched: false, stageReceipts: f.stages.map(() => null), receipt, cancelRequested: true };
  values.set(keys.command, canonical(journal));
  const entries = f.stages.map(stage => ({ id: stage.receipt.manifest.operationId, path, method: "POST", mode: "direct", identity: "",
    createdAt: "2026-09-12T00:00:00.000Z", uncertain: true, recovery: { type: "admin-template-photo-stage", protocol: "admin-template-photo-whole-copy-stage-v3",
      ...binding, operationId: stage.receipt.manifest.operationId, actionOperationId: id, assetDigest: stage.receipt.assetDigest, intentHash: recordIntentHash } }));
  for (const entry of entries) values.set(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`, JSON.stringify(entry));
  const originalStages = entries.map(entry => [entry.id, values.get(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`)]);
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const locks = { request: async (name, task) => task() };
  const cold = options => createExperimentTransport({ locationLike, selection: "direct", storage, locks, ...options });
  const request = { intent: f.intent, recordIntentHash, receipt, assertCurrent() {} };
  const permission = { operationId: id, payloadDigest: f.payloadDigest, assets: entries.map(entry => ({ assetId: entry.id, assetDigest: entry.recovery.assetDigest })),
    stageProtocol: "admin-template-photo-whole-copy-stage-v3", recordIntentHash };
  const metadata = { type: "admin-template", protocol: "admin-template-photo-whole-copy-parent-v3", ...binding, operationId: id, kind: "template.copy", payloadDigest: f.payloadDigest, recordIntentHash };
  const unchanged = () => { for (const [id, text] of originalStages) assert.equal(values.get(`${AMBIGUOUS_WRITE_KEY}:${id}`), text); };
  return { ...f, binding, id, recordIntentHash, receipt, keys, values, journal, entries, storage, locks, cold, request, permission, metadata, unchanged,
    cancelPath: `${commandPath}/${id}/cancel` };
}

test("whole certificate binds all ordered owners and allows only exact legacy or boolean-marker journals", async () => {
  const f = await fixture(), certificate = await prepareFence({ ...f.request, mode: "direct" });
  assert.deepEqual(certificate.assets, f.permission.assets); assert.ok(f.intent.body.photoCopy.owners.some(owner => !owner.photos.length));
  for (const marker of [undefined, false, true]) {
    const journal = copy(f.journal); if (marker === undefined) delete journal.cancelRequested; else journal.cancelRequested = marker;
    const before = canonical(journal); assert.deepEqual(await readFence({ certificate, parentJournal: journal }), certificate); assert.equal(canonical(journal), before);
  }
  for (const marker of [null, 1, "true"]) await assert.rejects(readFence({ certificate, parentJournal: { ...f.journal, cancelRequested: marker } }));
  assert.ok(Object.isFrozen(certificate.assets)); f.unchanged();
});

test("forged bindings, digests, ordered assets, v1 and noncancellation terminal receipts cannot fence a whole", async () => {
  const f = await fixture(), certificate = await prepareFence({ ...f.request, mode: "direct" });
  for (const mutate of [c => { c.binding.actorId = "foreign"; }, c => { c.operationId = crypto.randomUUID(); }, c => { c.recordIntentHash = hash("other"); },
    c => { c.assets.reverse(); }, c => { c.assets[0].assetDigest = hash("other"); }, c => { c.stageProtocol = "admin-template-photo-copy-stage-v1"; },
    c => { c.receipt.result.payload.cancellation.noBusinessEffects = false; }, c => { c.receipt.result.payload.cancellation.operationCannotApply = false; },
    c => { c.receipt.result.payload.code = "template_source_changed"; delete c.receipt.result.payload.cancellation; }]) {
    const changed = copy(certificate); mutate(changed); await assert.rejects(readFence({ certificate: changed, parentJournal: f.journal }));
  }
  for (const mutate of [j => { j.intent.body.photoCopy.sourcePayload.opaque = "changed"; }, j => { j.intent.body.photoCopy.owners[0].entityId += "changed"; },
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

test("real transport allows only exact own whole cancellation across unknown stages, never stage/save replay or foreign metadata", async () => {
  const f = await fixture(), transport = f.cold(); await transport.prepare();
  const pending = { ...f.journal, receipt: null }; f.values.set(f.keys.command, canonical(pending));
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
  const certificate = await transport.fenceWholeCopyParent(f.request);
  assert.equal(f.values.get(f.keys.command), before); f.unchanged();
  for (const value of transport.writes) { assert.equal(value.parentFenced, true); assert.equal(value.blocksWrites, false); assert.equal(value.confirmed, undefined); }
  const next = f.cold(); assert.ok(next.uncertainWrite); await next.prepare(); assert.equal(next.uncertainWrite, null); f.unchanged();
  f.values.delete(f.keys.certificate);
  f.values.set(f.keys.certificate.replace(WHOLE_COPY_PARENT_FENCE_PREFIX, COPY_PARENT_FENCE_PREFIX), canonical(certificate));
  const wrongKind = f.cold(); await wrongKind.prepare(); assert.ok(wrongKind.uncertainWrite); f.unchanged();
});

test("cold direct cancellation proof permits verified EU selection but never exempts another pending action", async () => {
  const f = await fixture(); await f.cold().fenceWholeCopyParent(f.request);
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
    const transport = f.cold({ storage }); await assert.rejects(transport.fenceWholeCopyParent(f.request));
    assert.ok(transport.uncertainWrite); assert.equal(JSON.parse(f.values.get(f.keys.command)).receipt.result.payload.code, "operation_cancelled"); f.unchanged();
    const next = f.cold(); await next.fenceWholeCopyParent(f.request); assert.equal(next.uncertainWrite, null); f.unchanged();
  }
});

test("certificate/parent/stage byte changes invalidate warm and cold proof caches", async () => {
  const f = await fixture(), transport = f.cold(); await transport.fenceWholeCopyParent(f.request); const original = new Map(f.values);
  for (const key of [f.keys.certificate, f.keys.command, `${AMBIGUOUS_WRITE_KEY}:${f.entries[0].id}`]) {
    f.values.set(key, "corrupt"); assert.throws(() => transport.assertWritable(path, "POST"));
    const next = f.cold(); await next.prepare(); assert.ok(next.uncertainWrite);
    f.values.clear(); for (const [name, value] of original) f.values.set(name, value); await transport.prepare(); assert.equal(transport.uncertainWrite, null);
  }
});

test("late lock/context loss and asynchronous guards cannot persist or bless a parent certificate", async () => {
  for (const fault of ["parent", "stage", "context", "async", "false"]) {
    const f = await fixture(); let active = true;
    const locks = { async request(name, task) {
      assert.equal(name, EXPERIMENT_WRITE_LOCK);
      if (fault === "parent") f.values.set(f.keys.command, "changed");
      if (fault === "stage") { const entry = copy(f.entries[0]); entry.recovery.assetDigest = hash("changed"); f.values.set(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`, JSON.stringify(entry)); }
      if (fault === "context") active = false;
      return task();
    } };
    const transport = f.cold({ locks }), assertCurrent = fault === "async" ? async () => { throw Error("invalid async authority"); }
      : () => { if (!active) throw Error("context lost"); if (fault === "false") return false; };
    await assert.rejects(transport.fenceWholeCopyParent({ ...f.request, assertCurrent }));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.values.has(f.keys.certificate), false); assert.ok(transport.uncertainWrite);
  }
});

test("caller input is detached before hashes; unavailable historic stage proof does not become a ready acknowledgement", async () => {
  const f = await fixture(), input = { ...f.request, intent: copy(f.intent), receipt: copy(f.receipt), mode: "direct" };
  const pending = prepareFence(input); input.intent.body.photoCopy.sourcePayload.opaque = "late"; input.receipt.result.payload.cancellation.noBusinessEffects = false;
  const certificate = await pending, journal = copy(f.journal); journal.stageReceipts[0] = copy(f.stages[0]); journal.stageReceipts[0].assetState = "unavailable";
  assert.deepEqual(await readFence({ certificate, parentJournal: journal }), certificate); assert.equal(journal.stageReceipts[0].assetState, "unavailable");
});

async function realClientFixture() {
  const f = await wholeCopyClientFixture();
  const fetchImpl = (url, options) => {
    const parsed = new URL(url), prefix = parsed.pathname.indexOf("/api/");
    return f.fetchImpl("https://fixture.invalid" + (prefix < 0 ? parsed.pathname : parsed.pathname.slice(prefix + 4)), options);
  };
  const make = (options = {}) => {
    const transport = createExperimentTransport({ locationLike, selection: "direct", storage: f.storage, locks: f.locks });
    return { transport, client: f.make({ ...options, transport: options.transport || transport, fetchImpl }).client };
  };
  return { ...f, make, keys: keysFor(f.binding, f.id) };
}

test("real whole client and transport retain all stage and parent UUIDs through lost ACK and cold OFF reads", async () => {
  const f = await realClientFixture(), first = f.make(); await first.client.capture(f.record.action);
  f.controls.loseStage = true; f.controls.loseParent = true;
  assert.deepEqual(await first.client.run(f.id), f.receipt);
  assert.equal(f.server.stagePosts.length, 5); assert.equal(f.server.parentPosts.length, 1);
  assert.ok(first.transport.writes.every(entry => entry.confirmed && !entry.blocksWrites));
  assert.equal(f.server.parentPosts[0].kind, "template.copy"); assert.equal(f.server.parentPosts[0].body.base, null);
  const cold = f.make({ enabled: false, adminEnabled: false, appendEnabled: false, createEnabled: false, copyEnabled: false });
  assert.deepEqual(await cold.client.inspect(f.id), f.receipt); assert.deepEqual(await cold.client.run(f.id), f.receipt);
  assert.equal(f.server.stagePosts.length, 5); assert.equal(f.server.parentPosts.length, 1);
});

test("cancellation before command capture cannot invent a journal, dispatch or certificate", async () => {
  const f = await realClientFixture(), { client } = f.make();
  await assert.rejects(client.cancel(f.id)); assert.equal(f.server.calls.length, 0);
  assert.equal(f.values.has(f.keys.command), false); assert.equal(f.values.has(f.keys.certificate), false);
  assert.equal(f.values.size, 0);
});

test("real cancellation fences an unknown V3 stage after lost ACK without acknowledging or replaying it", async () => {
  const f = await realClientFixture(), first = f.make(); await first.client.capture(f.record.action);
  f.controls.unknownStage = true; await assert.rejects(first.client.run(f.id));
  const stageId = f.record.stages[0].operationId, stageKey = `${AMBIGUOUS_WRITE_KEY}:${stageId}`, stageText = f.values.get(stageKey);
  assert.ok(stageText); assert.equal(first.transport.writes.find(entry => entry.id === stageId).blocksWrites, true);
  f.controls.loseCancel = true;
  const receipt = await first.client.cancel(f.id); assert.equal(receipt.result.payload.code, "operation_cancelled");
  assert.equal(f.server.cancelPosts.length, 1); assert.equal(f.server.parentPosts.length, 0); assert.equal(f.server.stagePosts.length, 1);
  assert.equal(f.idb.rows("stage-dispatches").size, 1); assert.equal(f.values.get(stageKey), stageText);
  const stage = first.transport.writes.find(entry => entry.id === stageId);
  assert.equal(stage.parentFenced, true); assert.equal(stage.confirmed, undefined); assert.equal(stage.blocksWrites, false);
  const cold = f.make({ enabled: false, adminEnabled: false }); await cold.transport.prepare();
  assert.equal(cold.transport.uncertainWrite, null); assert.deepEqual(await cold.client.inspect(f.id), receipt);
  assert.equal(f.server.cancelPosts.length, 1); assert.equal(f.values.get(stageKey), stageText);
});

test("unknown parent can be cancelled through its retained transport UUID without repeating the parent or ready stages", async () => {
  const f = await realClientFixture(), first = f.make(); await first.client.capture(f.record.action);
  f.controls.unknownParent = true; await assert.rejects(first.client.run(f.id));
  assert.equal(first.transport.uncertainWrite.id, f.id);
  const retained = f.values.get(`${AMBIGUOUS_WRITE_KEY}:${f.id}`);
  assert.equal(JSON.parse(retained).path, commandPath); f.controls.loseCancel = true;
  const result = await f.make().client.cancel(f.id); assert.equal(result.result.payload.code, "operation_cancelled");
  assert.equal(f.server.stagePosts.length, 5); assert.equal(f.server.parentPosts.length, 1); assert.equal(f.server.cancelPosts.length, 1);
  const settled = JSON.parse(f.values.get(`${AMBIGUOUS_WRITE_KEY}:${f.id}`));
  assert.equal(settled.id, f.id); assert.equal(settled.path, commandPath); assert.equal(settled.confirmed, true);
  assert.equal(f.idb.rows("stage-dispatches").size, 5);
});

test("forged cancellation receipt leaves real unknown stage and parent barriers intact", async () => {
  const f = await realClientFixture(), first = f.make(); await first.client.capture(f.record.action);
  f.controls.unknownStage = true; await assert.rejects(first.client.run(f.id));
  const stageId = f.record.stages[0].operationId, stageKey = `${AMBIGUOUS_WRITE_KEY}:${stageId}`, before = f.values.get(stageKey);
  f.controls.afterRequest = (path, method) => {
    if (path.endsWith("/cancel") && method === "POST") f.server.saved.result.payload.cancellation.noBusinessEffects = false;
  };
  await assert.rejects(first.client.cancel(f.id));
  assert.equal(f.values.has(f.keys.certificate), false); assert.equal(f.values.get(stageKey), before);
  assert.ok(first.transport.writes.filter(entry => [stageId, f.id].includes(entry.id)).every(entry => entry.blocksWrites && !entry.confirmed));
  assert.equal(f.server.cancelPosts.length, 1); assert.equal(f.server.parentPosts.length, 0);
});

test("withdrawn scope after real durable cancellation registration prevents HTTP and preserves pending recovery", async () => {
  const f = await realClientFixture(), first = f.make(); await first.client.capture(f.record.action);
  const original = f.storage.setItem;
  f.storage.setItem = (key, value) => {
    original(key, value);
    if (key === `${AMBIGUOUS_WRITE_KEY}:${f.id}`) f.controls.revokeAdmission = true;
  };
  await assert.rejects(first.client.cancel(f.id));
  assert.equal(f.server.cancelPosts.length, 0); assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.parentPosts.length, 0);
  assert.equal(JSON.parse(f.values.get(f.keys.command)).cancelRequested, true);
  assert.ok(first.transport.uncertainWrite); assert.equal(f.values.has(f.keys.certificate), false);
});

test("whole stage admission rejects protocol cross-use, incomplete journals and forged source or asset digests before registration", async () => {
  const f = await fixture(); for (const entry of f.entries) f.values.delete(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`);
  const pending = { ...f.journal, receipt: null, cancelRequested: false }, original = canonical(pending);
  f.values.set(f.keys.command, original); const metadata = f.entries[0].recovery;
  for (const protocol of ["admin-template-photo-stage-v1", "admin-template-photo-copy-stage-v1", "admin-template-photo-tree-copy-stage-v2", "admin-template-photo-whole-copy-parent-v3"]) {
    await assert.rejects(f.cold().beginWrite(path, "POST", null, { ...metadata, protocol }));
  }
  for (const target of [commandPath, path.replace("whole-copy", "tree-copy"), path.replace("whole-copy", "copy")]) {
    await assert.rejects(f.cold().beginWrite(target, "POST", null, metadata));
  }
  for (const mutate of [j => { j.intent.body.base = { stateRevision: 0 }; }, j => { j.intent.kind = "template.save"; },
    j => { j.kind = "admin-template-photo-tree-copy"; }, j => { j.intent.body.photoCopy.version = 2; },
    j => { j.intent.body.photoCopy.sourcePayload.opaque = "changed"; },
    j => { j.intent.body.photoCopy.owners.flatMap(owner => owner.photos)[0].assetDigest = hash("forged asset"); },
    j => { j.cancelRequested = true; }, j => { j.stageReceipts.pop(); }]) {
    const changed = copy(pending); mutate(changed); const { id: _id, ...body } = changed.intent; changed.payloadDigest = hash(body);
    f.values.set(f.keys.command, canonical(changed)); const asset = changed.intent.body.photoCopy.owners.flatMap(owner => owner.photos)[0];
    await assert.rejects(f.cold().beginWrite(path, "POST", null, { ...metadata, assetDigest: asset.assetDigest }));
  }
  f.values.set(f.keys.command, original);
  await assert.rejects(f.cold().beginWrite(path, "POST", canonical({ manifest: { ...f.manifests[0], version: 2 } }), metadata));
  assert.equal(f.values.size, 1); assert.equal(f.values.get(f.keys.command), original);
  const certificate = await prepareFence({ ...f.request, mode: "direct" });
  await assert.rejects(readAdminTemplatePhotoTreeCopyParentFence({ certificate, parentJournal: f.journal }));
});

test("whole dispatch verifies raw journal again under lock and detaches caller metadata before hashes", async () => {
  const f = await fixture(); for (const entry of f.entries) f.values.delete(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`);
  const pending = { ...f.journal, receipt: null, cancelRequested: false }, original = canonical(pending), metadata = copy(f.entries[0].recovery);
  f.values.set(f.keys.command, original);
  const locks = { async request(name, task) { assert.equal(name, EXPERIMENT_WRITE_LOCK); f.values.set(f.keys.command, original + " "); return task(); } };
  await assert.rejects(f.cold({ locks }).beginWrite(path, "POST", null, metadata)); assert.equal(f.values.size, 1);
  f.values.set(f.keys.command, original);
  const transport = f.cold(), promise = transport.beginWrite(path, "POST", canonical({ manifest: f.manifests[0] }), metadata);
  metadata.actorId = "foreign"; metadata.assetDigest = hash("late mutation");
  assert.equal(await promise, f.entries[0].id); assert.deepEqual(transport.writes[0].recovery, f.entries[0].recovery);
  assert.equal(f.values.get(f.keys.command), original);
});

test("whole parent requires complete ready V3 stages, exact ordered cancellation assets and retained dispatch", async () => {
  const f = await fixture(); for (const entry of f.entries) f.values.delete(`${AMBIGUOUS_WRITE_KEY}:${entry.id}`);
  const pending = { ...f.journal, receipt: null, cancelRequested: false }, transport = f.cold();
  f.values.set(f.keys.command, canonical(pending));
  await assert.rejects(transport.beginWrite(commandPath, "POST", null, f.metadata));
  pending.stageReceipts = copy(f.stages); f.values.set(f.keys.command, canonical(pending));
  transport.assertWritable(commandPath, "POST", f.metadata); await assert.rejects(transport.beginWrite(commandPath, "POST", null, f.metadata));
  pending.cancelRequested = true; f.values.set(f.keys.command, canonical(pending));
  const reversed = copy(f.permission); reversed.assets.reverse();
  await assert.rejects(transport.beginWrite(f.cancelPath, "POST", null, f.metadata, reversed));
  pending.cancelRequested = false; pending.dispatched = true; pending.stageReceipts[0].assetState = "unavailable";
  f.values.set(f.keys.command, canonical(pending)); await assert.rejects(transport.beginWrite(commandPath, "POST", null, f.metadata));
  pending.stageReceipts[0].assetState = "ready"; f.values.set(f.keys.command, canonical(pending));
  await assert.rejects(transport.beginWrite(commandPath, "POST", null, { ...f.metadata, protocol: "admin-template-v1" }));
  assert.equal(f.values.size, 1); assert.equal(await transport.beginWrite(commandPath, "POST", null, f.metadata), f.id);
});
