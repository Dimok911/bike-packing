import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { preservesConfirmedPersonalPhotos, preservesConfirmedPersonalPhotoChain } from "../../src/sync/personal-confirmed-photos.js";
import { PERSONAL_LEGACY_PHOTO_PRESERVATION_ENABLED, PERSONAL_LEGACY_PHOTO_PRESERVATION_CAPABILITY,
  hasLegacyPersonalPhotos, isPreservedLegacyPersonalPhoto, preparePersonalLegacyPhotoPreservation } from "../../src/sync/personal-legacy-photo-preservation.js";

const operationId = "438c90a2-b12a-4e61-87ad-00f6d2d358b1";
const childId = "ce3d2f0d-e8a9-46f0-8642-d057b3e6e48a";
const listId = "list-a";
function photo(id = "photo-a") {
  return { id, listId, status: "synced", url: `https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/${listId}/photos/${id}/file`,
    thumbUrl: `https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/${listId}/photos/${id}/thumb`, width: 1000, height: 800,
    updatedAt: "2026-09-14T10:00:00.000Z" };
}
function fixture({ baseless = false, child = false } = {}) {
  const base = { items: {}, containers: { bag: { id: "bag", name: "Existing bag", photos: [photo(), photo("photo-b")] } },
    layouts: { layout: { id: "layout", containerIds: [] } } };
  const candidate = structuredClone(base); candidate.containers.bag.name = "Renamed bag"; candidate.layouts.layout.containerIds.push("bag");
  const records = [{ action: { operationId, listId, kind: "list.update", body: { payload: candidate, baseStateRevision: 3,
    force: false, forceOverwrite: false, userPlacement: { type: "link-root", containerId: "bag", layoutId: "layout" },
    causal: { dependsOn: [], reads: [] } } }, ...(!baseless ? { mergeBase: { payload: base, stateRevision: 3 } } : {}) }];
  if (child) {
    const payload = structuredClone(candidate); payload.containers.bag.name = "Another rename";
    records.push({ action: { operationId: childId, listId, kind: "list.update", body: { payload, baseStateRevision: 3,
      causal: { baseOperationId: operationId, dependsOn: [{ operationId, listId }], reads: [] } } } });
  }
  const f = { base, records, context: { environment: "bike-packing-experiment", actorId: "actor-a", scopeKey: "id:actor-a",
    scope: "personal", listId, generation: "editor-1" }, reads: 0, inspections: 0 };
  f.options = { records, operationId: child ? childId : operationId, listId, getContext: () => f.context, getRecords: () => f.records,
    enabled: true, capabilities: [PERSONAL_LEGACY_PHOTO_PRESERVATION_CAPABILITY], readRemote: async request => {
      f.reads++; assert.deepEqual(request, { listId, baseStateRevision: 3 }); return { payload: structuredClone(base), stateRevision: 3 };
    } };
  return f;
}
function receipt(f) {
  const action = f.records[0].action;
  const payloadDigest = createHash("sha256").update(canonicalListOperationJson({ environment: f.context.environment,
    actorId: f.context.actorId, kind: action.kind, listId, body: action.body })).digest("hex");
  return { historicalOnly: true, operation: { id: operationId, environment: f.context.environment, actorId: f.context.actorId,
    kind: action.kind, listId, payloadDigest, state: "committed" }, resultStatus: 200, stateRevision: 4 };
}
const paused = { code: "legacy-photo-preservation", isPersonalSaveBlocked: true };

test("legacy compatibility is gated independently and leaves existing strict guards closed", async () => {
  assert.equal(PERSONAL_LEGACY_PHOTO_PRESERVATION_ENABLED, false);
  const f = fixture();
  assert.equal(hasLegacyPersonalPhotos(f.base), true);
  assert.equal(preservesConfirmedPersonalPhotos(f.base, f.records[0].action.body.payload, listId), false);
  assert.equal(preservesConfirmedPersonalPhotoChain(f.options), false);
  await assert.rejects(preparePersonalLegacyPhotoPreservation({ ...f.options, enabled: false }), paused);
  await assert.rejects(preparePersonalLegacyPhotoPreservation({ ...f.options, capabilities: [] }), paused);
  assert.equal(f.reads, 0);
});

test("ordinary bag placement and rename retain all exact legacy photos with no remote read when merge base exists", async () => {
  const f = fixture({ child: true }), before = structuredClone(f.records);
  const guard = await preparePersonalLegacyPhotoPreservation(f.options);
  assert.equal(guard.check(), true); assert.equal(Object.isFrozen(guard), true); assert.equal(f.reads, 0);
  assert.deepEqual(f.records, before);
});

test("no-legacy chains need no compatibility capability, context or server lookup", async () => {
  const f = fixture(); f.records[0].action.body.payload.containers.bag.photos = []; f.records[0].mergeBase.payload.containers.bag.photos = [];
  assert.equal(await preparePersonalLegacyPhotoPreservation({ ...f.options, enabled: false, capabilities: [], getContext: () => null }), null);
  assert.equal(f.reads, 0);
});

for (const [name, mutate] of [
  ["add", p => p.containers.bag.photos.push(photo("new-photo"))],
  ["delete", p => p.containers.bag.photos.pop()],
  ["reorder", p => p.containers.bag.photos.reverse()],
  ["URL", p => { p.containers.bag.photos[0].url += "?changed=true"; }],
  ["dimensions", p => { p.containers.bag.photos[0].width++; }],
  ["metadata", p => { p.containers.bag.photos[0].updatedAt = "2026-09-15T00:00:00Z"; }],
  ["owner deletion", p => { delete p.containers.bag; }],
  ["owner movement", p => { p.items.item = { id: "item", photos: p.containers.bag.photos }; p.containers.bag.photos = []; }],
  ["owner copy", p => { p.containers.other = { ...p.containers.bag, id: "other" }; }],
  ["list", p => { p.containers.bag.photos[0].listId = "other-list"; }]
]) test(`legacy compatibility refuses photo ${name}`, async () => {
  const f = fixture(); mutate(f.records[0].action.body.payload);
  await assert.rejects(preparePersonalLegacyPhotoPreservation({ ...f.options, allowOwnerDeletion: true }), paused);
});

test("legacy owner deletion is refused even with an explicit deletion intent", () => {
  const f = fixture(), candidate = structuredClone(f.base); delete candidate.containers.bag;
  assert.equal(preservesConfirmedPersonalPhotos(f.base, candidate, listId,
    { allowLegacy: true, userDeletion: { type: "container", id: "bag" } }), false);
});

for (const [name, change] of [
  ["pending", p => { p.status = "pending"; }], ["copy", p => { p._copyToCurrentList = true; }],
  ["public source", p => { p.publicCopySourceId = "copy"; }], ["asset downgrade", p => { p.assetId = undefined; }],
  ["local file", p => { p.localId = "local"; }], ["unknown field", p => { p.future = true; }],
  ["foreign host", p => { p.url = p.url.replace("api.vniipo-help.ru", "foreign.test"); }],
  ["insecure URL", p => { p.url = p.url.replace("https:", "http:"); }],
  ["credentials", p => { p.url = p.url.replace("https://", "https://actor@"); }],
  ["wrong route list", p => { p.url = p.url.replace("/list-a/", "/another/"); }],
  ["wrong route photo", p => { p.thumbUrl = p.thumbUrl.replace("/photo-a/", "/another/"); }],
  ["wrong route type", p => { p.thumbUrl = p.url; }], ["fragment", p => { p.url += "#fragment"; }],
  ["invalid date", p => { p.updatedAt = 3; }], ["invalid size", p => { p.width = "1000"; }]
]) test(`unchanged but invalid legacy ${name} cannot pass a confirmed baseline`, () => {
  const f = fixture(); change(f.base.containers.bag.photos[0]);
  assert.equal(isPreservedLegacyPersonalPhoto(f.base.containers.bag.photos[0], listId), false);
  assert.equal(preservesConfirmedPersonalPhotos(f.base, structuredClone(f.base), listId, { allowLegacy: true }), false);
});

test("mixed inventories keep strict causal references; neither downgrade nor metadata removal is allowed", async () => {
  const f = fixture(), causal = { id: "causal-photo", photoId: "causal-photo", assetId: "05c59e77-bd27-42bf-879f-83bfa3b27ab5", listId,
    status: "synced", url: "https://example.test/full", thumbUrl: "https://example.test/thumb", fileName: "photo.jpg", type: "image/jpeg", size: 10, width: 1, height: 1 };
  f.base.items.item = { id: "item", photos: [causal] }; f.records[0].action.body.payload.items.item = structuredClone(f.base.items.item);
  assert.equal((await preparePersonalLegacyPhotoPreservation(f.options)).check(), true);
  for (const mutate of [p => { delete p.assetId; }, p => { delete p.fileName; }, p => { p.updatedAt = "2026-09-14T10:00:00Z"; }]) {
    f.records[0].action.body.payload.items.item.photos[0] = structuredClone(causal); mutate(f.records[0].action.body.payload.items.item.photos[0]);
    await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused);
  }
});

test("ordinary compatibility does not authorize force, share, import, history or deletion extensions", async () => {
  for (const patch of [{ force: true }, { forceOverwrite: true }, { shareLink: {} }, { publicImport: {} }, { historyRestore: {} },
    { userDeletion: { type: "container", id: "bag" } }, { ownerResult: {} }, { photoResults: {} }]) {
    const f = fixture(); Object.assign(f.records[0].action.body, patch);
    await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused);
  }
});

test("missing first merge base can use only a fresh exact server revision without changing stored records", async () => {
  const f = fixture({ baseless: true, child: true }), before = structuredClone(f.records);
  assert.equal(preservesConfirmedPersonalPhotoChain({ ...f.options, allowLegacy: true }), false);
  const guard = await preparePersonalLegacyPhotoPreservation(f.options);
  assert.equal(guard.check(), true); assert.equal(f.reads, 1); assert.deepEqual(f.records, before);
  assert.equal(Object.hasOwn(f.records[0], "mergeBase"), false);
});

test("legacy route aliases preserve the same files without rewriting baseless queued bodies", async () => {
  const routes = ["https://api.vniipo-help.ru/letters-vniipo/api", "https://api.vniipo-help.ru/experiment/letters-vniipo/api",
    "https://experiment.vniipo-help.ru/letters-vniipo/api", "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api"];
  for (const source of routes) for (const target of routes) {
    const f = fixture({ baseless: true, child: true });
    for (const p of f.base.containers.bag.photos) for (const key of ["url", "thumbUrl"]) {
      p[key] = p[key].replace(routes[0], source) + "?v=unchanged";
    }
    for (const r of f.records) for (const p of r.action.body.payload.containers.bag.photos) {
      for (const key of ["url", "thumbUrl"]) p[key] = p[key].replace(routes[0], target) + "?v=unchanged";
    }
    const original = canonicalListOperationJson(f.records), base = canonicalListOperationJson(f.base);
    assert.equal((await preparePersonalLegacyPhotoPreservation(f.options)).check(), true);
    assert.equal(canonicalListOperationJson(f.records), original);
    assert.equal(canonicalListOperationJson(f.base), base);
  }
});

test("an allowed legacy prefix never masks a changed query, owner, metadata or file identity", async () => {
  for (const change of [p => { p.url += "?different=1"; }, p => { p.thumbUrl += "?different=1"; },
    p => { p.width++; }, p => { p.url = p.url.replace("/photo-a/", "/photo-b/"); },
    p => { p.url = p.url.replace("api.vniipo-help.ru", "untrusted.example"); },
    p => { p.url = p.url.replace("/list-a/", "/list-b/"); }]) {
    const f = fixture({ baseless: true });
    const p = f.records[0].action.body.payload.containers.bag.photos[0];
    for (const key of ["url", "thumbUrl"]) p[key] = p[key].replace("/letters-vniipo/api/", "/experiment/letters-vniipo/api/");
    change(p);
    await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused);
  }
});

test("preexisting identical legacy references in two old bag copies retain the exact confirmed owner inventory", async () => {
  const f = fixture({ baseless: true, child: true });
  f.base.containers.bag.photos[0].listId = "";
  for (const record of f.records) record.action.body.payload.containers.bag.photos[0].listId = "";
  f.base.containers.oldCopy = { id: "oldCopy", photos: [structuredClone(f.base.containers.bag.photos[0])] };
  for (const record of f.records) record.action.body.payload.containers.oldCopy = structuredClone(f.base.containers.oldCopy);
  const before = canonicalListOperationJson(f.records);
  assert.equal((await preparePersonalLegacyPhotoPreservation(f.options)).check(), true);
  assert.equal(canonicalListOperationJson(f.records), before);
  for (const change of [p => { p.containers.newCopy = { ...structuredClone(p.containers.oldCopy), id: "newCopy" }; },
    p => { delete p.containers.oldCopy; }, p => { p.containers.oldCopy.photos[0].width++; },
    p => { p.containers.bag.photos.push(structuredClone(p.containers.bag.photos[0])); }]) {
    const changed = structuredClone(f.records); change(changed.at(-1).action.body.payload);
    await assert.rejects(preparePersonalLegacyPhotoPreservation({ ...f.options, records: changed, getRecords: () => changed }), paused);
  }
});

test("empty old list metadata requires both routes to prove the current list and remains unchanged", async () => {
  const f = fixture({ baseless: true });
  f.base.containers.bag.photos[0].listId = "";
  f.records[0].action.body.payload.containers.bag.photos[0].listId = "";
  assert.equal((await preparePersonalLegacyPhotoPreservation(f.options)).check(), true);
  for (const change of [p => { p.listId = listId; }, p => { p.url = p.url.replace("/list-a/", "/other-list/"); },
    p => { p.thumbUrl = p.thumbUrl.replace("/list-a/", "/other-list/"); }, p => { delete p.listId; }]) {
    const records = structuredClone(f.records); change(records[0].action.body.payload.containers.bag.photos[0]);
    await assert.rejects(preparePersonalLegacyPhotoPreservation({ ...f.options, records, getRecords: () => records }), paused);
  }
});

test("legacy sharing cannot downgrade a causal asset or hide inconsistent metadata in its baseline", () => {
  for (const change of [p => { p.width++; }, p => { p.assetId = "05c59e77-bd27-42bf-879f-83bfa3b27ab5"; },
    p => { p.url += "?changed=1"; }]) {
    const f = fixture();
    f.base.containers.oldCopy = { id: "oldCopy", photos: [structuredClone(f.base.containers.bag.photos[0])] };
    change(f.base.containers.oldCopy.photos[0]);
    assert.equal(preservesConfirmedPersonalPhotos(f.base, structuredClone(f.base), listId, { allowLegacy: true }), false);
  }
});

test("fresh same-revision baseline cannot be replaced with the local candidate or a mismatching payload", async () => {
  const f = fixture({ baseless: true });
  f.options.readRemote = async () => { const payload = structuredClone(f.base); payload.containers.bag.photos.pop(); return { payload, stateRevision: 3 }; };
  const before = structuredClone(f.records);
  await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused); assert.deepEqual(f.records, before);
});

test("missing baseline rejects earlier, invalid and newer revisions without an exact committed receipt", async () => {
  for (const stateRevision of [0, 2, 3.5, "3", 4]) {
    const f = fixture({ baseless: true }); f.options.readRemote = async () => ({ payload: structuredClone(f.base), stateRevision });
    await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused);
  }
});

test("account, list, generation and persisted chain changes during the read cannot authorize dispatch", async () => {
  for (const change of [f => { f.context.actorId = "other"; }, f => { f.context.listId = "other"; }, f => { f.context.generation = "editor-2"; },
    f => { f.records[0].action.body.payload.containers.bag.name = "New edit"; }, f => { f.records = []; }]) {
    const f = fixture({ baseless: true }); f.options.readRemote = async () => { change(f); return { payload: structuredClone(f.base), stateRevision: 3 }; };
    await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused);
  }
});

test("synchronous checker binds exact records and context, latching a detected change", async () => {
  for (const change of [f => { f.context.generation = "next"; }, f => { f.records[0].action.body.payload.containers.bag.name += " changed"; },
    f => { f.records.push(structuredClone(f.records[0])); }]) {
    const f = fixture({ baseless: true }), guard = await preparePersonalLegacyPhotoPreservation(f.options);
    const context = structuredClone(f.context), records = structuredClone(f.records);
    change(f); assert.equal(guard.check(), false); f.context = context; f.records = records; assert.equal(guard.check(), false);
  }
});

test("lost acknowledgement exact committed receipt creates only a historical boundary for unchanged successor photos", async () => {
  const f = fixture({ baseless: true, child: true }), before = structuredClone(f.records);
  f.options.readRemote = async () => ({ payload: structuredClone(f.base), stateRevision: 6 });
  f.options.inspectExact = async action => { f.inspections++; assert.deepEqual(action, f.records[0].action); return receipt(f); };
  assert.equal((await preparePersonalLegacyPhotoPreservation(f.options)).check(), true);
  assert.equal(f.inspections, 1); assert.deepEqual(f.records, before);
  f.records[1].action.body.payload.containers.bag.photos.pop();
  await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused);
});

test("historical receipt is bound to exact operation, actor, list, kind, environment, body digest and resulting revision", async () => {
  for (const change of [p => { p.historicalOnly = false; }, p => { p.operation.id = childId; }, p => { p.operation.actorId = "other"; },
    p => { p.operation.listId = "other"; }, p => { p.operation.kind = "photos.mutate"; }, p => { p.operation.environment = "production"; },
    p => { p.operation.payloadDigest = "0".repeat(64); }, p => { p.operation.state = "rejected"; }, p => { p.operation.state = "waiting"; },
    p => { p.resultStatus = 409; }, p => { p.stateRevision = 3; }, p => { p.stateRevision = 7; }, p => { p.stateRevision = "4"; }]) {
    const f = fixture({ baseless: true }); f.options.readRemote = async () => ({ payload: structuredClone(f.base), stateRevision: 6 });
    f.options.inspectExact = async () => { const proof = receipt(f); change(proof); return proof; };
    await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused);
  }
});

test("changes while the historical receipt is read invalidate the proof before dispatch", async () => {
  for (const change of [f => { f.context.generation = "next"; }, f => { f.records[0].action.body.force = true; }]) {
    const f = fixture({ baseless: true }); f.options.readRemote = async () => ({ payload: structuredClone(f.base), stateRevision: 6 });
    f.options.inspectExact = async () => { const proof = receipt(f); change(f); return proof; };
    await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused);
  }
});

test("cyclic, missing, duplicate and foreign predecessor chains remain blocked", async () => {
  for (const change of [f => { f.records[0].action.body.causal.baseOperationId = "missing"; },
    f => { f.records[0].action.body.causal.baseOperationId = childId; }, f => { f.records.push(structuredClone(f.records[0])); },
    f => { f.records[0].action.listId = "foreign"; }]) {
    const f = fixture({ child: true }); change(f);
    await assert.rejects(preparePersonalLegacyPhotoPreservation(f.options), paused);
  }
});
