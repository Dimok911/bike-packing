import test from "node:test";
import assert from "node:assert/strict";
import { personalPhotoItemFormContext, personalPhotoItemContextOwner, PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED } from "../../src/sync/personal-photo-item-form-context.js";
import { placeExistingItemInLayoutInState, removeItemFromLayoutInState } from "../../src/state/layout-ops.js";
import { setLayoutItemQuantity } from "../../src/state/layout-item-quantity.js";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { preparePersonalPhotoEditForm } from "../../src/sync/personal-photo-edit-form.js";
import { assertPersonalPhotoFormCandidate, personalPhotoFormManifest, validatePersonalPhotoFormResult } from "../../src/sync/personal-photo-form-protocol.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { createPersonalPhotoFormSession } from "../../src/sync/personal-photo-form-session.js";

function fixture({ created = false } = {}) {
  const container = id => ({ id, name: id, photos: [], nestable: true });
  const row = items => ({ parentId: "", childIds: [], itemIds: items, order: items.map(id => ({ type: "item", id })) });
  const layout = { id: "trip", name: "Trip", rootContainerIds: ["a", "b"], unknownField: { exact: true },
    arrangement: { rootContainerIds: ["a", "b"], containers: { a: row(created ? ["other"] : ["item", "other"]), b: row([]) },
      items: { ...(created ? {} : { item: "a" }), other: "a" }, itemQuantities: { ...(created ? {} : { item: 2 }), other: 3 },
      packedItems: { ...(created ? {} : { item: true }), other: true }, itemQuantityMigrationVersion: 3 } };
  const state = { items: { item: { id: "item", name: "Chosen", quantity: 1, _publicCopySourceId: "guest", photos: [{ id: "original" }] },
    other: { id: "other", quantity: 1, photos: [] } }, containers: { a: container("a"), b: container("b") }, layouts: { trip: layout } };
  const body = { version: 1, action: "form", entityType: "item", entityId: "item", baseEntityRevision: created ? 0 : 2,
    formContext: { version: 1, availabilityStatus: "available", placement: { targetLayout: structuredClone(layout), targetContainerId: "b", quantity: 4, layoutFields: { updatedAt: "2026-09-09T12:00:00.000Z" } } } };
  return { body, state };
}

function formFixture(created = false) {
  const { body, state } = fixture({ created });
  if (created) delete state.items.item;
  else state.items.item.photos = [0, 1].map(i => ({ id: `old-${i}`, photoId: `old-${i}`, assetId: crypto.randomUUID(),
    listId: "list", status: "synced", url: `/old-${i}`, thumbUrl: `/thumb-${i}` }));
  return { binding: { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" },
    snapshot: structuredClone(state), basePayload: state, baseStateRevision: 7, baseEntityRevision: body.baseEntityRevision,
    entityType: "item", entityId: "item", fields: { name: "Saved together" }, formContext: body.formContext,
    files: [0, 1].map(i => ({ fileName: `${i}.png`, file: new Blob([`selected ${i}`], { type: "image/png" }) })) };
}
const enabled = { enabled: true, itemContextEnabled: true };
const prepareForm = f => preparePersonalPhotoFormAttachments(f, enabled);
function resultFor(plan) {
  const payload = structuredClone(plan.payload), manifest = personalPhotoFormManifest(plan.body);
  const photoChanges = manifest.photos.map(entry => {
    const photo = payload.items.item.photos.find(photo => photo.id === entry.photoId);
    Object.assign(photo, { status: "synced", url: `/photos/${photo.id}`, thumbUrl: `/thumbs/${photo.id}` });
    return { ...entry, photo: structuredClone(photo) };
  });
  return { photoForm: { entityType: "item", entityId: "item", created: manifest.created }, photoChanges,
    stateRevision: 8, list: { id: "list", stateRevision: 8, payload } };
}
function outboxes(f) {
  const values = new Map(), storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  return (itemContextEnabled = true) => createPersonalSaveOutbox({ ...f.binding, storage, photoEnabled: true,
    photoBatchEnabled: true, photoFormEnabled: true, photoEditEnabled: true, itemContextEnabled });
}

for (const created of [false, true]) test(`whole item context ${created ? "creation" : "edit"} retains one exact record, files and placement across a disabled-writer reload`, async () => {
  const f = formFixture(created), original = structuredClone(f), plan = prepareForm(f), make = outboxes(f), outbox = make();
  assert.deepEqual(f, original);
  assert.equal(plan.payload.items.item.name, "Saved together");
  assert.equal(plan.payload.layouts.trip.arrangement.items.item, "b");
  assert.equal(plan.payload.layouts.trip.arrangement.itemQuantities.item, 4);
  assertPersonalPhotoFormCandidate({ body: plan.body, basePayload: f.basePayload, payload: plan.payload, listId: "list" });
  outbox.adoptRemoteBaseline({ snapshot: f.snapshot, payload: f.basePayload, stateRevision: 7 });
  const capturedPlan = outbox.preparePhoto(plan);
  const raw = await encodePersonalPhotoFormRecord({ binding: f.binding, ...capturedPlan, files: plan.files });
  const saved = await decodePersonalPhotoFormRecord(raw, f.binding, plan.operationId);
  const context = { ...f.binding, scope: "personal", generation: "context" };
  await outbox.capturePhoto({ plan: capturedPlan, store: { read: async () => saved }, getContext: () => context });
  const reloaded = make(false);
  assert.deepEqual(reloaded.recover().action, outbox.recover().action);
  assert.deepEqual(reloaded.recoverSnapshot(), plan.snapshot);
  await assert.rejects(reloaded.drain({ getContext: () => context,
    queue: { run: async () => assert.fail("Disabled context must not publish") },
    photoStore: { read: async () => saved }, photoStaging: { stage: async () => assert.fail("Disabled context must not stage files") } }),
  { code: "photo-item-context-disabled" });
  assert.deepEqual(await Promise.all(saved.files.map(p => p.file.text())), ["selected 0", "selected 1"]);
  const good = resultFor(plan), expected = { listId: "list", body: plan.body };
  assert.equal(validatePersonalPhotoFormResult(good, expected), true);
  for (const mutate of [r => { r.list.payload.layouts.trip.arrangement.itemQuantities.item = 1; },
    r => { r.list.payload.layouts.trip.arrangement.items.item = "a"; }, r => { r.list.payload.items.item.availabilityStatus = "lost"; },
    r => { r.list.payload.layouts.trip.unknownField = "dropped"; }]) {
    const bad = structuredClone(good); mutate(bad); assert.equal(validatePersonalPhotoFormResult(bad, expected), false);
  }
});

test("item context cannot capture behind a disabled gate or hide a changed layout, availability or malformed JSON", () => {
  let ids = 0; const f = formFixture();
  assert.throws(() => preparePersonalPhotoFormAttachments(f, { enabled: true, createUuid: () => { ids++; return crypto.randomUUID(); } }));
  assert.equal(ids, 0);
  const make = outboxes(f), disabled = make(false);
  disabled.adoptRemoteBaseline({ snapshot: f.snapshot, payload: f.basePayload, stateRevision: 7 });
  assert.throws(() => disabled.preparePhoto(prepareForm(f))); assert.equal(disabled.list().length, 0);
  for (const mutate of [f => { f.snapshot.layouts.trip.name = "Uncaptured"; },
    f => { f.formContext.placement.quantity = NaN; }, f => { f.formContext.placement.layoutFields.updatedAt = undefined; },
    f => { f.formContext.availabilityStatus = "lost"; }]) {
    const f = formFixture(); mutate(f); assert.throws(() => prepareForm(f));
  }
  const plan = prepareForm(f);
  for (const mutate of [p => { p.payload.items.item.availabilityStatus = "broken"; },
    p => { p.payload.layouts.trip.arrangement.itemQuantities.item++; }]) {
    const changed = structuredClone(plan); mutate(changed);
    assert.throws(() => assertPersonalPhotoFormCandidate({ body: changed.body, basePayload: f.basePayload, payload: changed.payload, listId: "list" }));
  }
});

test("photo removal and reordering can share quantity or unplacement and availability without new files", () => {
  for (const unplace of [false, true]) {
    const f = formFixture(); f.formContext.availabilityStatus = "broken";
    f.formContext.placement.targetContainerId = unplace ? "" : "a"; f.formContext.placement.quantity = unplace ? 1 : 8;
    const plan = preparePersonalPhotoEditForm({ ...f, operationId: crypto.randomUUID(), photoIds: ["old-1"],
      photoRevisions: f.basePayload.items.item.photos.map(p => ({ photoId: p.id, assetId: p.assetId, photoRevision: 2 })) }, enabled);
    assert.equal(plan.payload.items.item.availabilityStatus, "broken");
    assert.deepEqual(plan.payload.items.item.photos.map(p => p.id), ["old-1"]);
    assert.equal(plan.payload.layouts.trip.arrangement.items.item, unplace ? undefined : "a");
    assert.equal(plan.payload.layouts.trip.arrangement.itemQuantities.item, unplace ? undefined : 8);
    assert.deepEqual(plan.payload.layouts.trip.arrangement.containers.b, f.basePayload.layouts.trip.arrangement.containers.b);
  }
});

test("item context and both file identities freeze before asynchronous owner lookup", async () => {
  const f = formFixture(), make = outboxes(f), outbox = make();
  outbox.adoptRemoteBaseline({ snapshot: f.snapshot, payload: f.basePayload, stateRevision: 7 });
  let release; const latch = new Promise(resolve => { release = resolve; });
  let raw;
  const context = { ...f.binding, scope: "personal", generation: "context", form: "opened" };
  const store = { binding: f.binding, ids: async () => { await latch; return []; },
    captureForm: async value => { raw = await encodePersonalPhotoFormRecord({ binding: f.binding, ...value }); },
    read: async id => decodePersonalPhotoFormRecord(raw, f.binding, id) };
  const session = createPersonalPhotoFormSession({ ...enabled, outbox, store, getContext: () => context, onDurable: () => {},
    readEntities: async () => ({ ok: true, listId: "list", stateRevision: 7, items: [{ id: "item", listId: "list", ownerId: "actor",
      stateRevision: 2, deleted: false, deletedAt: null, payload: structuredClone(f.basePayload.items.item) }] }) });
  const { baseEntityRevision, ...request } = f;
  const pending = session.submit({ ...request, created: false }), ids = session.recoveryCopy().ids;
  f.formContext.placement.targetContainerId = "a"; f.formContext.placement.quantity = 99; f.fields.name = "Late"; f.files.reverse();
  release(); const result = await pending;
  assert.deepEqual(session.recoveryCopy().ids, ids);
  assert.equal(result.record.action.body.formContext.placement.targetContainerId, "b");
  assert.equal(result.record.photoState.payload.layouts.trip.arrangement.itemQuantities.item, 4);
  assert.deepEqual(await Promise.all((await store.read(result.record.action.operationId)).files.map(p => p.file.text())), ["selected 0", "selected 1"]);
});

for (const created of [false, true]) test(`photo item context ${created ? "creates a placement" : "moves an existing placement"} with legacy quantity/order effects and an immutable whole target`, () => {
  const f = fixture({ created }), before = structuredClone(f), result = personalPhotoItemFormContext(f.body, f.state);
  const legacy = structuredClone(f.state);
  assert.equal(placeExistingItemInLayoutInState(legacy, "item", "b", "trip"), true);
  setLayoutItemQuantity(legacy, "trip", "item", 4); Object.assign(legacy.layouts.trip, f.body.formContext.placement.layoutFields);
  assert.deepEqual(result.layout, legacy.layouts.trip); assert.deepEqual(f, before);
  assert.equal(result.layout.arrangement.packedItems.item, undefined); assert.equal(result.layout.arrangement.packedItems.other, true);
  assert.deepEqual(result.layout.unknownField, { exact: true }); assert.equal(result.targetLayoutId, "trip");
});

test("quantity alone keeps order and packing while availability belongs only to the owner", () => {
  const f = fixture(); f.body.formContext.placement.targetContainerId = "a"; f.body.formContext.availabilityStatus = "broken";
  const result = personalPhotoItemFormContext(f.body, f.state), owner = personalPhotoItemContextOwner(f.state.items.item, result);
  assert.deepEqual(result.layout.arrangement.containers.a, f.state.layouts.trip.arrangement.containers.a);
  assert.equal(result.layout.arrangement.itemQuantities.item, 4); assert.equal(result.layout.arrangement.packedItems.item, true);
  assert.equal(owner.availabilityStatus, "broken"); assert.deepEqual(owner.photos, f.state.items.item.photos); assert.equal(owner._publicCopySourceId, "guest");
  f.body.formContext.placement = null; f.body.formContext.availabilityStatus = "available";
  const cleared = personalPhotoItemContextOwner(owner, personalPhotoItemFormContext(f.body, f.state));
  assert.equal(Object.hasOwn(cleared, "availabilityStatus"), false); assert.equal(owner.availabilityStatus, "broken");
});

test("unplacing an unavailable item removes exactly its arrangement references while retaining the owner and files", () => {
  const f = fixture(); f.body.formContext.placement.targetContainerId = ""; f.body.formContext.placement.quantity = 1;
  f.body.formContext.availabilityStatus = "lost";
  const result = personalPhotoItemFormContext(f.body, f.state), legacy = structuredClone(f.state);
  assert.equal(removeItemFromLayoutInState(legacy, "trip", "item"), true); Object.assign(legacy.layouts.trip, f.body.formContext.placement.layoutFields);
  assert.deepEqual(result.layout, legacy.layouts.trip); assert.deepEqual(f.state.items.item.photos, [{ id: "original" }]);
  assert.equal(result.layout.arrangement.items.item, undefined);
});

test("wrong target, public owners, locked layouts, invalid quantities and hidden or incomplete selections fail before changes", () => {
  assert.equal(PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED, false);
  for (const mutate of [f => { f.body.entityType = "container"; }, f => { f.body.copySource = {}; },
    f => { f.body.formContext.version = 2; }, f => { f.body.formContext.availabilityStatus = "unknown"; },
    f => { f.body.formContext.placement.targetContainerId = "missing"; }, f => { f.body.formContext.placement.quantity = 1.5; },
    f => { f.body.formContext.placement.quantity = 0; }, f => { f.body.formContext.placement.quantity = Number.MAX_SAFE_INTEGER + 1; },
    f => { f.body.formContext.placement.layoutFields.name = "Hidden rename"; }, f => { f.body.formContext.placement.targetLayout.name = "Newer selection"; },
    f => { f.body.formContext.placement.targetLayout.arrangement.containers.a.order.pop(); },
    f => { f.body.formContext.placement.targetLayout.arrangement.itemQuantities.ghost = 2; },
    f => { f.state.containers.b.scope = "public"; }, f => { f.state.items.other.sharedSourceId = "shared"; },
    f => { f.body.formContext.availabilityStatus = "retired"; }, f => { f.state.layouts.trip.locked = true; },
    f => { f.body.formContext.placement = null; f.state.layouts.trip.locked = true; }]) {
    const f = fixture(); mutate(f); const before = structuredClone(f);
    assert.throws(() => personalPhotoItemFormContext(f.body, f.state), { code: "photo-item-form-context" }); assert.deepEqual(f, before);
  }
});
