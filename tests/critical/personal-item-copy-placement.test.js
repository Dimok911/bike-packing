import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { preparePersonalItemCopyPlacement, createPersonalPhotoItemCopyPlacementSession } from "../../src/sync/personal-item-copy-placement.js";
import { personalPhotoCopyPlacementLayout } from "../../src/sync/personal-photo-copy-placement-layout.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { createPersonalSaveRecovery } from "../../src/sync/personal-save-recovery.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import { assertPersonalPhotoCopyBatchRecord, validatePersonalPhotoCopyBatchResult, PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED } from "../../src/sync/personal-photo-copy-batch-protocol.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { personalPendingPhotoCopyDeletionForm } from "../../src/sync/personal-pending-photo-copy-deletion.js";

const project = value => cloneStateForSyncPayload(value, { forSync: true });
function fixture(photos = true) {
  const binding = { actorId: "actor", listId: "list", scopeKey: "id:actor", environment: "bike-packing-experiment" };
  const context = { ...binding, generation: "chosen", scope: "personal" }, values = new Map(), events = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const photoId = randomUUID(), photo = { id: photoId, photoId, assetId: randomUUID(), listId: "list", status: "synced",
    url: "/photo", thumbUrl: "/thumb", fileName: "pump.png", type: "image/png", size: 10, width: 1, height: 1 };
  const placement = itemIds => ({ parentId: "", childIds: [], itemIds, order: itemIds.map(id => ({ type: "item", id })) });
  const snapshot = { activeLayoutId: "layout", packedItems: { pump: true },
    items: { pump: { id: "pump", name: "Pump", quantity: 2, containerId: "bag", photos: photos ? [photo] : [], custom: { exact: [1, 2] } } },
    containers: { bag: { id: "bag", name: "Bag", photos: [], ...placement(["pump"]) }, target: { id: "target", name: "Target", photos: [], ...placement([]) } },
    layouts: { layout: { id: "layout", name: "Chosen layout", rootContainerIds: ["bag", "target"], custom: { retained: true }, arrangement: {
      rootContainerIds: ["bag", "target"], containers: { bag: placement(["pump"]), target: placement([]) }, items: { pump: "bag" },
      itemQuantities: { pump: 7 }, packedItems: { pump: true }, itemQuantityMigrationVersion: 3 } } } };
  const input = { binding, snapshot, basePayload: project(snapshot), baseStateRevision: 7, changedAt: "2026-09-08T12:00:00Z",
    editMeta: { updatedAt: "2026-09-08T12:00:00Z" }, request: { sourceId: "pump", targetContainerId: "target", targetLayoutId: "layout" } };
  const outboxOptions = { ...binding, storage, photoEnabled: true, photoFormEnabled: true, photoCopyEnabled: true, photoCopyBatchEnabled: true,
    photoCopyPlacementEnabled: true, pendingPhotoCopyDeletionEnabled: true, pendingPhotoCopyBatchDeletionEnabled: true };
  const outbox = createPersonalSaveOutbox(outboxOptions); outbox.adoptRemoteBaseline({ snapshot, payload: input.basePayload, stateRevision: 7 });
  const options = { outbox, enabled: true, store: { binding, ids: async () => [], read: async () => assert.fail("No new file bytes") },
    getContext: () => context, snapshotToPayload: project, onDurable: record => { assertPersonalPhotoCopyBatchRecord(record); events.push("view"); },
    readOwner: async () => { events.push("read"); return { version: 1, ok: true, readOnly: true, ...binding, stateRevision: 7,
      owner: { entityType: "item", entityId: "pump", entityRevision: 5, payload: structuredClone(input.basePayload.items.pump) },
      photos: photos ? [{ photoId, assetId: photo.assetId, photoRevision: 4 }] : [] }; } };
  return { binding, input, context, values, storage, outboxOptions, outbox, options, events };
}

test("the photo item session freezes the full source, target and UUIDs before reading; one durable action retains placement", async () => {
  assert.equal(PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED, false);
  const f = fixture(), session = createPersonalPhotoItemCopyPlacementSession(f.options), before = structuredClone(f.input);
  session.prepare(f.input); const retained = session.recoveryCopy(); assert.equal(retained.ids.length, 4); assert.deepEqual(f.events, []);
  f.input.snapshot.items.pump.custom.exact.push(3); f.input.request.targetContainerId = "bag";
  const promise = session.submit(); assert.equal(session.submit(), promise); const { record } = await promise;
  assert.equal(record.action.operationId, retained.ids[0]); assert.deepEqual(f.events, ["read", "view"]);
  assert.deepEqual(record.action.body.owners[0].copySource.payload, before.basePayload.items.pump);
  assert.deepEqual(record.action.body.copyPlacement.targetLayout, before.basePayload.layouts.layout);
  const itemId = record.action.body.owners[0].entityId, layout = record.photoState.payload.layouts.layout;
  assert.equal(layout.arrangement.items[itemId], "target"); assert.equal(layout.arrangement.itemQuantities[itemId], 2);
  assert.equal(layout.arrangement.itemQuantities.pump, 7); assert.deepEqual(layout.arrangement.packedItems, { pump: true });
  assert.equal(record.photoState.fileIntentHash, null); assert.deepEqual(createPersonalSaveOutbox(f.outboxOptions).recoverSnapshot(), record.snapshot);
  const change = record.action.body.changes[0], photo = { ...before.basePayload.items.pump.photos[0], id: change.photoId, photoId: change.photoId, assetId: change.assetId };
  const payload = structuredClone(record.photoState.payload); payload.items[itemId].photos = [photo]; payload.items[itemId].containerId = "target";
  const result = { stateRevision: 8, list: { id: "list", stateRevision: 8, payload }, photoCopyBatch: { version: 1, owners: [{ entityType: "item", entityId: itemId }] },
    photoCopyPlacement: { version: 1, itemId, targetLayoutId: "layout", targetContainerId: "target" },
    photoChanges: [{ index: 0, action: "copy", entityType: "item", entityId: itemId, photoId: photo.id, assetId: photo.assetId, photoIds: [photo.id], photo }] };
  assert.equal(validatePersonalPhotoCopyBatchResult(result, { body: record.action.body, listId: "list" }), true);
  for (const mutate of [r => { r.list.payload.items[itemId].containerId = "bag"; }, r => { r.photoCopyPlacement.targetContainerId = "bag"; },
    r => { r.list.payload.layouts.layout.arrangement.itemQuantities[itemId] = 7; }, r => { delete r.photoCopyPlacement; }]) {
    const bad = structuredClone(result); mutate(bad); assert.equal(validatePersonalPhotoCopyBatchResult(bad, { body: record.action.body, listId: "list" }), false);
  }
});

test("pending placed item copy supports source, target bag and copied item deletion without relocating survivors", async () => {
  for (const deletion of [{ type: "item", id: "pump" }, { type: "container", id: "target" }, { type: "copy" }]) {
    const f = fixture(), { record } = await createPersonalPhotoItemCopyPlacementSession(f.options).submit(f.input), itemId = record.action.body.owners[0].entityId;
    const selected = deletion.type === "copy" ? { type: "item", id: itemId } : deletion;
    const prepared = preparePersonalDeletionBatch(record.snapshot, selected);
    const child = f.outbox.capture({ snapshot: prepared.snapshot, body: { baseStateRevision: 7, payload: project(prepared.snapshot), userDeletion: prepared.intent } });
    assert.equal(personalPendingPhotoCopyDeletionForm({ records: f.outbox.list(), operationId: child.action.operationId, listId: "list" }).action.operationId, record.action.operationId);
    const bad = structuredClone(child); bad.action.body.payload.layouts.layout.arrangement.items[itemId] = "bag";
    assert.equal(personalPendingPhotoCopyDeletionForm({ records: [record, bad], operationId: bad.action.operationId, listId: "list" }), null);
  }
});

test("invalid destinations, stale sources, disabled gates and quota preserve the whole frozen draft without displaying it", async () => {
  for (const mode of ["quota", "stale", "source", "disabled"]) {
    const f = fixture(), session = createPersonalPhotoItemCopyPlacementSession(f.options); session.prepare(f.input);
    const journal = [...f.values];
    if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
    if (mode === "stale") f.context.generation = "new";
    if (mode === "source") f.input.basePayload.items.pump.name = "changed server";
    if (mode === "disabled") { f.options.outbox = createPersonalSaveOutbox({ ...f.outboxOptions, photoCopyPlacementEnabled: false }); }
    const active = mode === "disabled" ? createPersonalPhotoItemCopyPlacementSession(f.options) : session;
    await assert.rejects(active.submit(mode === "disabled" ? f.input : undefined)); assert.deepEqual([...f.values], journal); assert.ok(!f.events.includes("view"));
    assert.equal(Object.keys(active.recoveryCopy().preview.items).length, 2);
  }
  for (const mutate of [f => { f.input.snapshot.layouts.layout.locked = true; }, f => { f.input.snapshot.layouts.layout.arrangement.containers.target.order.push({ type: "item", id: "missing" }); },
    f => { f.input.snapshot.containers.target.publicCatalogLayoutId = "foreign"; }, f => { f.input.snapshot.items.pump.photos[0].status = "pending"; }]) {
    const f = fixture(); mutate(f);
    assert.throws(() => { f.input.basePayload = project(f.input.snapshot); createPersonalPhotoItemCopyPlacementSession(f.options).prepare(f.input); }); assert.deepEqual(f.events, []);
  }
});

test("DB-only item copy preserves the exact catalog fields and uses the same destination compiler", () => {
  const f = fixture(false), before = structuredClone(f.input.snapshot);
  const prepared = preparePersonalItemCopyPlacement(f.input.snapshot, { type: "item-copy-placement", version: 1, ...f.input.request, targetId: "item-copy" },
    { listId: "list", changedAt: f.input.changedAt, currentEditMeta: () => f.input.editMeta, snapshotToPayload: project });
  assert.deepEqual(f.input.snapshot, before); assert.deepEqual(prepared.snapshot.items["item-copy"].custom, before.items.pump.custom);
  assert.equal(prepared.snapshot.layouts.layout.arrangement.items["item-copy"], "target");
  assert.equal(prepared.snapshot.layouts.layout.arrangement.itemQuantities["item-copy"], 2);
  assert.deepEqual(prepared.snapshot.layouts.layout.arrangement.packedItems, { pump: true });
  const body = { owners: [{ entityType: "item", entityId: "item-copy", copySource: { entityType: "item", entityId: "pump", payload: f.input.basePayload.items.pump } }],
    copyPlacement: { version: 1, targetLayout: f.input.basePayload.layouts.layout, targetContainerId: "target", targetIndex: null, layoutFields: f.input.editMeta } };
  for (const mutate of [b => { b.copyTree = {}; }, b => { b.copyPlacement.targetLayout.name = "new"; }, b => { b.copyPlacement.targetContainerId = "absent"; },
    b => { b.copyPlacement.targetLayout.arrangement.containers.target.childIds = ["target"]; }, b => { b.owners[0].entityId = "target"; }]) {
    const bad = structuredClone(body); mutate(bad); assert.throws(() => personalPhotoCopyPlacementLayout(bad, f.input.basePayload));
  }
});

test("the real item adapter saves DB-only copy before the view, retains it on quota and refuses a stale confirmation", async () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/function preparePersonalItemCopyPlacementAction\([^]*?\n\}/)[0];
  for (const mode of ["success", "quota", "stale"]) {
    const f = fixture(false), state = f.input.snapshot, before = structuredClone(state), events = [], recovery = createPersonalSaveRecovery();
    if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
    const outbox = recovery.outbox(() => f.outbox, "id:actor");
    const deps = { state, preparePersonalItemCopyPlacement, personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor", modeState: {},
      isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, personalSaveRecovery: recovery, requireUsageCapacity: () => true,
      personalSaveContext: () => f.context, nowIso: () => f.input.changedAt, currentEditMeta: () => f.input.editMeta, crypto: { randomUUID },
      normalizeItemPhotos: owner => owner?.photos || [], cloneStateForSync: project, showToast: text => events.push(text), applyLayoutArrangement() {}, scheduleRemoteSave() {},
      persistStateSnapshot(snapshot, { personalMutation, operationId }) {
        assert.deepEqual(state, before); events.push("capture"); outbox.capture({ snapshot, operationId,
          body: { baseStateRevision: 7, payload: project(snapshot), userItemCopyPlacement: personalMutation } });
      }, saveState(options) { assert.equal(options.recordAction, false); assert.deepEqual(outbox.recoverSnapshot().items, state.items); events.push("view"); } };
    const prepare = new Function(...Object.keys(deps), `return (${source})`)(...Object.values(deps)), submit = prepare(f.input.request);
    assert.equal(typeof submit, "function"); assert.deepEqual(state, before); if (mode === "stale") f.context.generation = "changed";
    const result = await submit();
    if (mode === "success") { assert.match(result, /^item-[0-9a-f-]{36}$/); assert.deepEqual(events, ["capture", "view"]); assert.equal(await submit(), false); }
    else { assert.equal(result, false); assert.deepEqual(state, before); if (mode === "quota") assert.equal(Object.keys(recovery.recoveryCopy(f.storage).unconfirmedMemoryDraft.items).length, 2); }
  }
});
