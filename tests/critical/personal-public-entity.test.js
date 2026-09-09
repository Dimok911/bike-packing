import test from "node:test";
import assert from "node:assert/strict";
import { publicEntityFixture } from "./personal-public-entity-fixture.js";
import { preparePersonalPublicEntitySelection } from "../../src/sync/personal-public-import-selection.js";
import { personalPublicEntityPlan } from "../../src/sync/personal-public-entity-plan.js";
import { assertPersonalPublicImportBody, assertPersonalPublicImportHashes, personalPublicImportReceipt, validatePersonalPublicImportResult } from "../../src/sync/personal-public-import-protocol.js";
import { createPersonalPublicImportSelectionStore } from "../../src/sync/personal-public-import-selection-store.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { preparePersonalPublicImport } from "../../src/sync/personal-public-import.js";
import { encodePersonalPublicImportRecord, decodePersonalPublicImportRecord } from "../../src/sync/personal-public-import-record.js";
import { inspectPersonalPhotoRecovery } from "../../src/sync/personal-photo-recovery-inventory.js";
import { recoverPersonalPublicImportLink } from "../../src/sync/personal-public-import-link-recovery.js";

for (const kind of ["item", "empty", "tree"]) test(`public ${kind} copy binds the full source, exact selection, destination, quantities and independent owners`, async () => {
  const f = await publicEntityFixture({ kind }), original = structuredClone(f.selection), result = assertPersonalPublicImportBody(f.action.body, f.options);
  await assertPersonalPublicImportHashes(f.action.body);
  assert.deepEqual(result, f.plan); assert.deepEqual(f.selection, original);
  assert.deepEqual(result.payload.items.kept, f.options.base.items.kept); assert.deepEqual(result.payload.containers.target, f.options.base.containers.target);
  assert.equal(result.payload.layouts.private.arrangement.itemQuantities.kept, 9); assert.equal(result.payload.layouts.private.arrangement.packedItems.kept, true);
  assert.deepEqual(result.payload.layouts.private.customLayout, { untouched: true }); assert.deepEqual(result.importedLayoutIds, []);
  const item = f.selection.ownerTargets.find(row => row.entityType === "item");
  if (item) {
    assert.equal(result.payload.layouts.private.arrangement.itemQuantities[item.targetId], 3);
    assert.equal(result.payload.layouts.private.arrangement.packedItems[item.targetId], undefined);
    assert.deepEqual(result.payload.items[item.targetId].custom, { original: "full owner" });
    assert.notEqual(item.sourceId, item.targetId); assert.equal(result.payload.items[item.targetId].photos[0].status, "pending");
  }
  assert.equal(f.selection.ownerTargets.length, kind === "item" || kind === "empty" ? 1 : 3);
  if (kind === "tree") {
    const pocket = f.selection.ownerTargets.find(row => row.sourceId === "pocket");
    assert.equal(result.payload.layouts.private.arrangement.containers[pocket.targetId].customRow, "preserved");
  }
});

test("public entity compiler rejects changed composition, placement, complete source, identities and duplicate/overlapping entries", async () => {
  const f = await publicEntityFixture();
  for (const mutate of [
    body => body.publicImport.copy.entries.push({ ...body.publicImport.copy.entries[0] }),
    body => body.publicImport.copy.entries.push({ entityType: "item", sourceId: "item", includeContents: false }),
    body => body.publicImport.copy.destination.index = 99,
    body => body.publicImport.copy.destination.containerId = "missing",
    body => body.publicImport.ownerTargets.pop(),
    body => body.publicImport.ownerTargets[0].targetId = "target",
    body => body.publicImport.ownerTargets[0].reuse = true,
    body => body.publicImport.sourcePayload.layouts.a.arrangement.containers.pocket.parentId = "pocket",
    body => body.payload.items.kept.name = "Silently overwritten",
    body => body.causal.reads[0].revision++,
  ]) { const body = structuredClone(f.action.body); mutate(body); assert.throws(() => assertPersonalPublicImportBody(body, f.options)); }
  const changed = structuredClone(f.action.body); changed.publicImport.sourcePayload.layouts.b.name = "Unselected layout also belongs to the complete source";
  await assert.rejects(assertPersonalPublicImportHashes(changed));
  assert.throws(() => preparePersonalPublicEntitySelection(f.selection));
  assert.throws(() => personalPublicEntityPlan({ ...f.action.body.publicImport, currentPayload: { ...f.options.base,
    layouts: { private: { ...f.options.base.layouts.private, locked: true } } }, listId: f.binding.listId }, f.action.body.publicImport.files));
});

test("public entity fileless receipt verifies the final existing layout and cannot be relabelled as a whole-layout or guest copy", async () => {
  const f = await publicEntityFixture({ photos: false });
  const result = { ok: true, stateRevision: 8, list: { id: f.binding.listId, stateRevision: 8, payload: f.plan.payload },
    publicImport: personalPublicImportReceipt(f.action.body.publicImport), publicPhotos: [] };
  assert.equal(validatePersonalPublicImportResult(result, f.action), true);
  for (const change of [value => value.publicImport.version = 1, value => value.publicImport.copy.entries = [],
    value => value.guestImport = value.publicImport, value => value.list.payload.items.kept.name = "Changed existing owner"]) {
    const altered = structuredClone(result); change(altered); assert.equal(validatePersonalPublicImportResult(altered, f.action), false);
  }
});

for (const kind of ["tree", "catalog"]) for (const photos of [false, true]) test(`public entity ${kind} durable preparation and cold link recovery, photos=${photos}, preserve original action and reject disabled writers`, async () => {
  const f = await publicEntityFixture({ photos, kind }), context = { ...f.binding, scope: "personal", generation: "entity-copy" };
  const values = new Map(), native = new Map(), events = [], getContext = () => context;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const make = enabled => createPersonalSaveOutbox({ ...f.binding, storage, photoEnabled: true, photoBatchEnabled: true, publicImportEnabled: true, pendingPublicUpdateEnabled: true, publicEntityEnabled: enabled });
  const journal = enabled => createPersonalPublicImportSelectionStore({ binding: f.binding, getContext, storage,
    locks: { request: async (key, run) => run() }, enabled: true, publicEntityEnabled: enabled });
  const outbox = make(true), store = { binding: f.binding, ids: async () => [...native.keys()],
    read: async id => native.has(id) ? decodePersonalPublicImportRecord(native.get(id), f.binding, id) : null,
    async capturePublic(value) { native.set(value.action.operationId, await encodePersonalPublicImportRecord({ ...value, binding: f.binding })); events.push("native"); } };
  const current = structuredClone(f.options.base);
  outbox.adoptRemoteBaseline({ payload: current, snapshot: current, stateRevision: 7 });
  const options = { selection: f.selection, selectionStore: journal(true), outbox, store, getContext, getState: () => current, getRevision: () => 7,
    makeSnapshot: value => value, enabled: true, publicEntityEnabled: true,
    async loadFile() { assert.deepEqual(await journal(false).read(f.selection.operationId), f.selection); events.push("file"); return { file: f.file, fileName: "Original.png", thumb: null }; },
    onCaptured() { events.push("view"); } };
  const beforeDisabled = [...values];
  await assert.rejects(preparePersonalPublicImport({ ...options, publicEntityEnabled: false })); assert.deepEqual([...values], beforeDisabled);
  const commit = await preparePersonalPublicImport(options), entry = (await journal(false).entries())[0];
  assert.equal(events.includes("view"), false);
  const original = structuredClone(entry.action);
  // A crash after native commit but before the queue link must keep every UUID.
  const capture = outbox.capturePhoto; outbox.capturePhoto = async () => { throw Error("quota at queue link"); };
  await assert.rejects(commit()); outbox.capturePhoto = capture;
  assert.equal(events.includes("view"), false);
  const cold = make(false), before = [...values];
  await assert.rejects(recoverPersonalPublicImportLink({ entry, outbox: cold, store, getContext, enabled: true, publicEntityEnabled: false, makeSnapshot: value => value }));
  await assert.rejects(journal(false).capture(f.selection)); assert.deepEqual([...values], before);
  const recovered = await recoverPersonalPublicImportLink({ entry, outbox: make(true), store, getContext, enabled: true, publicEntityEnabled: true, makeSnapshot: value => value });
  assert.deepEqual(recovered.action, original); assert.deepEqual(make(false).recover(), recovered);
  const changed = structuredClone(recovered.snapshot), owner = f.selection.ownerTargets[0];
  changed[owner.entityType === "item" ? "items" : "containers"][owner.targetId].name = "Pending edit";
  const beforeEdit = [...values];
  assert.throws(() => make(false).capture({ snapshot: changed, body: { payload: changed, baseStateRevision: 7 } }));
  assert.deepEqual([...values], beforeEdit);
  assert.equal((await inspectPersonalPhotoRecovery({ outbox: make(false), store, getContext })).entries[0].state, "linked");
  assert.equal(events.includes("view"), false); assert.equal(events.filter(value => value === "file").length, photos ? 1 : 0);
});

for (const photos of [false, true]) test(`public catalog item (${photos ? "files" : "fileless"}) preserves full owners and every layout without placement`, async () => {
  const f = await publicEntityFixture({ kind: "catalog", photos, transformSource(source) {
    source.items.item.quantity = 8; source.items.item.location = "Catalog location"; source.items.item.categories = ["Catalog category"];
  } });
  const result = assertPersonalPublicImportBody(f.action.body, f.options), ownerId = f.selection.ownerTargets[0].targetId;
  await assertPersonalPublicImportHashes(f.action.body);
  assert.deepEqual(result.payload.layouts, f.options.base.layouts); assert.deepEqual(result.payload.containers, f.options.base.containers);
  assert.equal(result.payload.items[ownerId].quantity, 8); assert.equal(result.payload.items[ownerId].containerId, undefined);
  assert.deepEqual(result.payload.items[ownerId].custom, { original: "full owner" });
  assert.deepEqual(result.createdOwners.items, [ownerId]); assert.deepEqual(result.createdOwners.containers, []);
  assert.ok(result.payload.locations.includes("Catalog location")); assert.ok(result.payload.categories.includes("Catalog category"));
  for (const mutate of [
    body => body.publicImport.copy.mode = "independent",
    body => body.publicImport.copy.version = 1,
    body => body.publicImport.copy.destination.containerId = "target",
    body => body.publicImport.copy.destination.index = 0,
    body => body.publicImport.copy.entries[0].includeContents = true,
    body => body.publicImport.copy.entries.push({ entityType: "item", sourceId: "kept", includeContents: false }),
    body => body.publicImport.copy.entries[0] = { entityType: "container", sourceId: "bag", includeContents: false },
    body => body.payload.layouts.private.name = "Rewritten by a catalog copy",
    body => body.publicImport.ownerTargets[0].targetId = "kept",
    body => body.payload.items[ownerId].quantity = 3,
  ]) { const body = structuredClone(f.action.body); mutate(body); assert.throws(() => assertPersonalPublicImportBody(body, f.options)); }
});

test("public tree preserves item/child arrays independently of interleaved display order", async () => {
  const f = await publicEntityFixture({ photos: false, transformSource(source) {
    source.items.second = { id: "second", name: "Second", photos: [] };
    source.containers.secondPocket = { id: "secondPocket", name: "Second pocket", photos: [] };
    const a = source.layouts.a.arrangement, row = a.containers.bag;
    row.childIds = ["pocket", "secondPocket"]; row.itemIds = ["item", "second"];
    row.order = [{ type: "item", id: "second" }, { type: "container", id: "secondPocket" }, { type: "item", id: "item" }, { type: "container", id: "pocket" }];
    a.containers.secondPocket = { parentId: "bag", childIds: [], itemIds: [], order: [] };
    a.items.second = "bag"; a.itemQuantities.second = 7;
  } });
  const target = id => f.selection.ownerTargets.find(row => row.sourceId === id).targetId;
  const row = f.plan.payload.layouts.private.arrangement.containers[target("bag")];
  assert.deepEqual(row.childIds, [target("pocket"), target("secondPocket")]);
  assert.deepEqual(row.itemIds, [target("item"), target("second")]);
  assert.deepEqual(row.order, [{ type: "item", id: target("second") }, { type: "container", id: target("secondPocket") },
    { type: "item", id: target("item") }, { type: "container", id: target("pocket") }]);
});
