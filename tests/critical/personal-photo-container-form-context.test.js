import test from "node:test";
import assert from "node:assert/strict";
import { personalPhotoContainerFormContext, PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED } from "../../src/sync/personal-photo-container-form-context.js";
import { moveContainerInLayoutArrangement, placeExistingContainerInLayoutInState, addRootContainerToLayoutInState } from "../../src/state/layout-ops.js";
import { normalizeLayoutArrangement } from "../../src/state/layout-normalize.js";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { preparePersonalPhotoEditForm } from "../../src/sync/personal-photo-edit-form.js";
import { validatePersonalPhotoFormResult, personalPhotoFormManifest } from "../../src/sync/personal-photo-form-protocol.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";

function fixture() {
  const owner = id => ({ id, name: id, nestable: true, photos: [{ id: `${id}-photo` }] });
  const row = (parentId, childIds = [], itemIds = []) => ({ parentId, childIds, itemIds,
    order: [...childIds.map(id => ({ type: "container", id })), ...itemIds.map(id => ({ type: "item", id }))] });
  const state = { containers: { a: owner("a"), b: owner("b"), nested: { ...owner("nested"), parentId: "a" },
    child: { ...owner("child"), parentId: "nested" } }, items: { item: { id: "item", containerId: "nested", quantity: 1, photos: [] } },
    collapsedContainers: {}, layouts: { trip: { id: "trip", name: "Frozen", rootContainerIds: ["a", "b"], unknown: { exact: true },
      arrangement: { rootContainerIds: ["a", "b"], containers: { a: row("", ["nested"]), b: row(""), nested: row("a", ["child"], ["item"]), child: row("nested") },
        items: { item: "nested" }, itemQuantities: { item: 7 }, packedItems: { item: true }, itemQuantityMigrationVersion: 3 } } } };
  const body = { version: 1, action: "form", entityType: "container", entityId: "nested", baseEntityRevision: 2, fields: { name: "Form", nestable: true },
    containerFormContext: { version: 1, targetLayout: structuredClone(state.layouts.trip), sourceLayout: null, targetParentId: "b", targetIndex: null, layoutFields: {} } };
  return { state, body };
}

const project = state => cloneStateForSyncPayload(state, { forSync: true });
function formFixture(created = false) {
  const f = fixture(); f.state.activeLayoutId = "trip"; f.state.packedItems = { item: true };
  for (const [id, row] of Object.entries(f.state.layouts.trip.arrangement.containers)) Object.assign(f.state.containers[id], structuredClone(row));
  for (const owner of Object.values(f.state.containers)) owner.photos = [0, 1].map(i => ({ id: `${owner.id}-${i}`, photoId: `${owner.id}-${i}`,
    assetId: crypto.randomUUID(), status: "synced", listId: "list", url: `/photos/${owner.id}-${i}`, thumbUrl: `/thumbs/${owner.id}-${i}`,
    fileName: "original.png", type: "image/png", size: 4, width: 1, height: 1 }));
  if (created) { f.body.entityId = "new"; f.body.baseEntityRevision = 0; f.body.containerFormContext.targetParentId = ""; }
  return { binding: { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" },
    snapshot: f.state, basePayload: project(f.state), baseStateRevision: 7, baseEntityRevision: f.body.baseEntityRevision,
    entityType: "container", entityId: f.body.entityId, fields: f.body.fields, containerFormContext: f.body.containerFormContext,
    files: [0, 1].map(i => ({ fileName: `${i}.png`, file: new Blob([`chosen ${i}`], { type: "image/png" }) })) };
}
const options = { enabled: true, containerContextEnabled: true, snapshotToPayload: project };

for (const created of [false, true]) test(`whole ${created ? "new root" : "moved subtree"} photo form survives binary capture and reload with its complete layout`, async () => {
  const f = formFixture(created), original = structuredClone(f), prepared = preparePersonalPhotoFormAttachments(f, options);
  assert.deepEqual(f, original); assert.deepEqual(project(prepared.snapshot), prepared.payload);
  assert.equal(prepared.payload.containers[f.entityId].name, "Form");
  assert.equal(prepared.payload.layouts.trip.arrangement.containers[f.entityId].parentId, created ? "" : "b");
  const values = new Map(), storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const make = enabled => createPersonalSaveOutbox({ ...f.binding, storage, photoEnabled: true, photoBatchEnabled: true,
    photoFormEnabled: true, containerContextEnabled: enabled });
  const outbox = make(true); outbox.adoptRemoteBaseline({ snapshot: f.snapshot, payload: f.basePayload, stateRevision: 7 });
  assert.throws(() => make(false).preparePhoto(prepared));
  const plan = outbox.preparePhoto(prepared), raw = await encodePersonalPhotoFormRecord({ binding: f.binding, ...plan, files: prepared.files });
  const saved = await decodePersonalPhotoFormRecord(raw, f.binding, prepared.operationId);
  const context = { ...f.binding, scope: "personal", generation: "container-form" };
  await outbox.capturePhoto({ plan, store: { read: async () => saved }, getContext: () => context });
  assert.deepEqual(make(false).recover().action, plan.action); assert.deepEqual(make(false).recoverSnapshot(), prepared.snapshot);
  await assert.rejects(make(false).drain({ getContext: () => context, queue: { run: async () => assert.fail("No publish") },
    photoStore: { read: async () => saved }, photoStaging: { stage: async () => assert.fail("No upload") } }), { code: "photo-container-context-disabled" });
  assert.deepEqual(await Promise.all(saved.files.map(part => part.file.text())), ["chosen 0", "chosen 1"]);
  const payload = structuredClone(prepared.payload), manifest = personalPhotoFormManifest(prepared.body);
  const photoChanges = manifest.photos.map(entry => { const photo = payload.containers[f.entityId].photos.find(p => p.id === entry.photoId);
    Object.assign(photo, { status: "synced", url: `/photos/${photo.id}`, thumbUrl: `/thumbs/${photo.id}` }); return { ...entry, photo: structuredClone(photo) }; });
  const result = { photoForm: { entityType: "container", entityId: f.entityId, created }, photoChanges, stateRevision: 8,
    list: { id: "list", stateRevision: 8, payload } }, expected = { listId: "list", body: prepared.body };
  assert.equal(validatePersonalPhotoFormResult(result, expected), true);
  result.list.payload.layouts.trip.arrangement.itemQuantities.item = 99;
  assert.equal(validatePersonalPhotoFormResult(result, expected), false);
});

test("container context freezes before caller callbacks and joins an existing-photo removal without a file transaction", () => {
  const f = formFixture(), before = structuredClone(f.containerFormContext);
  assert.throws(() => preparePersonalPhotoFormAttachments(f, { enabled: true }));
  const plan = preparePersonalPhotoFormAttachments(f, { ...options, createUuid: () => { f.containerFormContext.targetParentId = "a"; return crypto.randomUUID(); } });
  assert.deepEqual(plan.body.containerFormContext, before);
  f.containerFormContext = before;
  const photos = f.basePayload.containers.nested.photos;
  const edit = preparePersonalPhotoEditForm({ ...f, operationId: crypto.randomUUID(), photoIds: [photos[1].id],
    photoRevisions: photos.map(p => ({ photoId: p.id, assetId: p.assetId, photoRevision: 2 })) }, options);
  assert.equal(edit.payload.layouts.trip.arrangement.containers.nested.parentId, "b");
  assert.deepEqual(edit.payload.containers.nested.photos, [photos[1]]);
  assert.deepEqual(edit.payload.items, f.basePayload.items); assert.deepEqual(edit.payload.containers.child, f.basePayload.containers.child);
});

for (const target of ["b", ""]) test(`container photo context moves the complete existing subtree to ${target || "root"} with legacy placement effects`, () => {
  const f = fixture(); f.body.containerFormContext.targetParentId = target;
  const original = structuredClone(f), expected = structuredClone(f.state);
  assert.equal(target ? moveContainerInLayoutArrangement(expected, expected.layouts.trip, "nested", target)
    : placeExistingContainerInLayoutInState(expected, "nested", "", "trip"), true);
  assert.deepEqual(personalPhotoContainerFormContext(f.body, f.state).layout, expected.layouts.trip);
  assert.deepEqual(f, original);
  assert.equal(expected.layouts.trip.arrangement.itemQuantities.item, 7); assert.equal(expected.layouts.trip.arrangement.packedItems.item, true);
});

test("a new empty root with photos is inserted once at the chosen position without changing other owners", () => {
  const f = fixture(); f.body.entityId = "new"; f.body.baseEntityRevision = 0;
  Object.assign(f.body.containerFormContext, { targetParentId: "", targetIndex: 1 });
  const expected = structuredClone(f.state); expected.containers.new = { id: "new", name: "Form", photos: [], nestable: true };
  assert.equal(addRootContainerToLayoutInState(expected, "trip", "new", 1), true);
  const result = personalPhotoContainerFormContext(f.body, f.state);
  assert.deepEqual(result.layout, expected.layouts.trip); assert.equal(f.state.containers.new, undefined);
});

test("container form context refuses cycles, hidden writes, locked/public targets and missing owners", () => {
  assert.equal(PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED, false);
  for (const mutate of [f => { f.body.containerFormContext.targetParentId = "child"; }, f => { f.body.containerFormContext.targetIndex = -1; },
    f => { f.body.containerFormContext.layoutFields.name = "Hidden"; }, f => { f.state.containers.b.scope = "public"; },
    f => { f.state.layouts.trip.name = "Changed"; }, f => { f.state.layouts.trip.locked = true; },
    f => { f.body.entityType = "item"; }, f => { f.body.entityId = "unplaced"; }, f => { f.body.copySource = {}; },
    f => { f.body.containerFormContext.targetLayout.arrangement.itemQuantities.item = 0; }]) {
    const f = fixture(); mutate(f); const before = structuredClone(f);
    assert.throws(() => personalPhotoContainerFormContext(f.body, f.state), { code: "photo-container-form-context" }); assert.deepEqual(f, before);
  }
});

test("a detached catalog bag links its frozen complete source tree with independent destination quantities", () => {
  const f = fixture();
  for (const [id, row] of Object.entries(f.state.layouts.trip.arrangement.containers)) Object.assign(f.state.containers[id], structuredClone(row));
  f.state.layouts.target = { id: "target", name: "Destination", rootContainerIds: [],
    arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {}, itemQuantityMigrationVersion: 3 } };
  Object.assign(f.body.containerFormContext, { targetLayout: structuredClone(f.state.layouts.target), sourceLayout: structuredClone(f.state.layouts.trip), targetParentId: "" });
  const original = structuredClone(f), expected = structuredClone(f.state);
  assert.equal(addRootContainerToLayoutInState(expected, "target", "nested"), true);
  normalizeLayoutArrangement(expected.layouts.target, expected);
  const result = personalPhotoContainerFormContext(f.body, f.state);
  assert.deepEqual(result.layout, expected.layouts.target); assert.deepEqual(f, original);
  assert.equal(result.layout.arrangement.itemQuantities.item, 1); assert.equal(result.layout.arrangement.packedItems.item, undefined);
  assert.equal(f.state.layouts.trip.arrangement.itemQuantities.item, 7); assert.equal(f.state.layouts.trip.arrangement.packedItems.item, true);
  for (const mutate of [f => { f.state.layouts.trip.name = "Changed source"; },
    f => { f.body.containerFormContext.sourceLayout.arrangement.containers.nested.order.pop(); },
    f => { f.state.containers.child.scope = "public"; }]) {
    const broken = structuredClone(f); mutate(broken); assert.throws(() => personalPhotoContainerFormContext(broken.body, broken.state));
  }
});

test("an existing detached empty bag requires its real private owner and does not import contents from another layout implicitly", () => {
  const f = fixture(); f.state.containers.detached = { id: "detached", name: "Catalog", nestable: true, photos: [] };
  f.body.entityId = "detached"; f.body.containerFormContext.targetParentId = "";
  const expected = structuredClone(f.state); assert.equal(addRootContainerToLayoutInState(expected, "trip", "detached"), true);
  assert.deepEqual(personalPhotoContainerFormContext(f.body, f.state).layout, expected.layouts.trip);
});

test("same-parent insertion and root reordering preserve every subtree row and original photo owner", () => {
  const f = fixture(); f.body.entityId = "child";
  Object.assign(f.body.containerFormContext, { targetParentId: "nested", targetIndex: 2 });
  const expected = structuredClone(f.state);
  assert.equal(moveContainerInLayoutArrangement(expected, expected.layouts.trip, "child", "nested", 1), true);
  assert.deepEqual(personalPhotoContainerFormContext(f.body, f.state).layout, expected.layouts.trip);
  f.body.entityId = "b"; Object.assign(f.body.containerFormContext, { targetParentId: "", targetIndex: 0 });
  const roots = structuredClone(f.state); assert.equal(placeExistingContainerInLayoutInState(roots, "b", "", "trip", { targetIndex: 0 }), true);
  assert.deepEqual(personalPhotoContainerFormContext(f.body, f.state).layout, roots.layouts.trip);
});
