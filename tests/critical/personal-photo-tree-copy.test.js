import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createPersonalPhotoTreeCopySession } from "../../src/sync/personal-photo-tree-copy.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import { assertPersonalPhotoCopyBatchRecord, validatePersonalPhotoCopyBatchResult, PERSONAL_PHOTO_TREE_COPY_ENABLED } from "../../src/sync/personal-photo-copy-batch-protocol.js";
import { personalPhotoTreeCopyLayout } from "../../src/sync/personal-photo-tree-copy-layout.js";
import { preparePersonalDeletionBatch } from "../../src/sync/personal-deletion-intent.js";
import { personalPendingPhotoCopyDeletionForm } from "../../src/sync/personal-pending-photo-copy-deletion.js";
import { preparePersonalContainerTreeCopy } from "../../src/sync/personal-container-tree-copy.js";

function fixture({ contents = true, targetParent = false } = {}) {
  const binding = { actorId: "actor", listId: "list", scopeKey: "id:actor", environment: "bike-packing-experiment" };
  const context = { ...binding, generation: "tree-selected", scope: "personal" }, values = new Map(), events = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const photo = id => ({ id, photoId: id, assetId: randomUUID(), listId: "list", status: "synced", url: `/source/${id}`, thumbUrl: `/thumb/${id}`,
    fileName: "chosen.png", type: "image/png", size: 20, width: 2, height: 2 });
  const source = { rootId: "bag", containers: {
    bag: { id: "bag", name: "Bag", parentId: null, childIds: ["pouch"], itemIds: ["pump"],
      order: [{ type: "item", id: "pump" }, { type: "container", id: "pouch" }], photos: [photo("bag-photo")], custom: { value: "exact" } },
    pouch: { id: "pouch", name: "Empty pouch", parentId: "bag", childIds: [], itemIds: [], order: [], photos: [] }
  }, items: { pump: { id: "pump", name: "Pump", quantity: 3, containerId: "bag", photos: [photo("pump-photo")] } } };
  const empty = () => ({ rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} });
  const snapshot = { containers: structuredClone(source.containers), items: structuredClone(source.items),
    layouts: { from: { id: "from", name: "Source", rootContainerIds: ["bag"], arrangement: { ...empty(), rootContainerIds: ["bag"],
      containers: Object.fromEntries(Object.entries(source.containers).map(([id, owner]) => [id, { parentId: owner.parentId || "", childIds: owner.childIds, itemIds: owner.itemIds, order: owner.order }])),
      items: { pump: "bag" }, itemQuantities: { pump: 3 }, packedItems: { pump: true } } },
      to: { id: "to", name: "Target", rootContainerIds: [], arrangement: empty() } } };
  snapshot.items.pump.quantity = 1;
  if (targetParent) snapshot.layouts.to = { ...structuredClone(snapshot.layouts.from), id: "to", name: "Target" };
  if (!contents) { source.containers = { bag: { ...source.containers.bag, childIds: [], itemIds: [], order: [] } }; source.items = {}; }
  const project = snapshot => cloneStateForSyncPayload(snapshot, { forSync: true }), base = project(snapshot);
  const outboxOptions = { ...binding, storage, photoEnabled: true, photoFormEnabled: true, photoCopyEnabled: true, photoCopyBatchEnabled: true, photoTreeCopyEnabled: true,
    pendingPhotoCopyDeletionEnabled: true, pendingPhotoCopyBatchDeletionEnabled: true };
  const outbox = createPersonalSaveOutbox(outboxOptions); outbox.adoptRemoteBaseline({ snapshot, payload: base, stateRevision: 7 });
  const input = { binding, snapshot, basePayload: base, baseStateRevision: 7, rootName: "Bag copy", changedAt: "2026-09-08T12:00:00Z",
    editMeta: { updatedAt: "2026-09-08T12:00:00Z" }, request: { sourceSnapshot: source, sourceLayoutId: "from", targetLayoutId: "to", targetParentId: targetParent ? "bag" : "", targetIndex: 0 } };
  if (!contents) input.request.sourceLayoutId = "";
  const store = { binding, ids: async () => [], read: async () => assert.fail("A copy reads no upload bytes") };
  const options = { outbox, store, enabled: true, getContext: () => context, snapshotToPayload: project,
    readOwner: async path => {
      const query = new URL(path, "http://test").searchParams, entityType = query.get("entityType"), entityId = query.get("entityId");
      events.push(`read:${entityType}:${entityId}`); const payload = base[entityType === "item" ? "items" : "containers"][entityId];
      return { version: 1, ok: true, readOnly: true, environment: binding.environment, actorId: "actor", listId: "list", stateRevision: 7,
        owner: { entityType, entityId, entityRevision: 5, payload: structuredClone(payload) },
        photos: payload.photos.map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: 4 })) };
    }, onDurable: record => { assertPersonalPhotoCopyBatchRecord(record); events.push("view"); } };
  return { binding, input, options, outboxOptions, outbox, storage, events };
}

for (const contents of [false, true]) for (const targetParent of [false, true]) test(`mixed photo tree (${contents ? "contents" : "empty"}, ${targetParent ? "nested" : "root"}) is one frozen fileless action`, async () => {
  const f = fixture({ contents, targetParent }), session = createPersonalPhotoTreeCopySession(f.options);
  const before = structuredClone(f.input); session.prepare(f.input);
  const retained = session.recoveryCopy(); assert.equal(retained.ids.length, contents ? 8 : 4); assert.deepEqual(f.events, []);
  f.input.request.sourceSnapshot.containers.bag.name = "Changed after click"; f.input.snapshot.layouts.to.name = "Changed destination";
  const promise = session.submit(); assert.equal(session.submit(), promise);
  const { record } = await promise; assert.equal(record.action.operationId, retained.ids[0]); assert.equal(record.photoState.fileIntentHash, null);
  assert.equal(record.action.body.owners.length, contents ? 3 : 1); assert.deepEqual(record.action.body.copyTree.sourceLayout, contents ? before.basePayload.layouts.from : null);
  const root = record.action.body.owners[0].entityId, layout = record.photoState.payload.layouts.to;
  assert.equal(layout.name, "Target"); assert.equal(layout.arrangement.containers[root].parentId, targetParent ? "bag" : "");
  const copied = record.photoState.payload.containers[root]; assert.equal(copied.name, "Bag copy"); assert.deepEqual(copied.custom, { value: "exact" });
  assert.equal(copied.photos[0].status, "pending");
  const body = record.action.body, resultPayload = structuredClone(record.photoState.payload), tree = personalPhotoTreeCopyLayout(body);
  const changes = body.changes.map((change, index) => {
    const owner = body.owners.find(owner => owner.entityId === change.entityId), collection = owner.entityType === "item" ? "items" : "containers";
    const photo = { ...owner.copySource.payload.photos[change.index], id: change.photoId, photoId: change.photoId, assetId: change.assetId };
    resultPayload[collection][change.entityId].photos[change.index] = photo;
    return { index, action: "copy", entityType: owner.entityType, entityId: owner.entityId, photoId: photo.id, assetId: photo.assetId,
      photoIds: [...change.expectedPhotoIds, change.photoId], photo };
  });
  resultPayload.containers[root].parentId = targetParent ? "bag" : null;
  const receipt = { stateRevision: 8, list: { id: "list", stateRevision: 8, payload: resultPayload }, photoChanges: changes,
    photoCopyBatch: { version: 1, owners: body.owners.map(({ entityType, entityId }) => ({ entityType, entityId })) },
    photoCopyTree: { version: 1, rootId: tree.rootId, targetLayoutId: tree.targetLayoutId } };
  assert.equal(validatePersonalPhotoCopyBatchResult(receipt, { body, listId: "list" }), true);
  const wrongPlacement = structuredClone(receipt); wrongPlacement.list.payload.layouts.to.arrangement.containers[root].parentId = "foreign";
  assert.equal(validatePersonalPhotoCopyBatchResult(wrongPlacement, { body, listId: "list" }), false);
  const wrongMirror = structuredClone(receipt); wrongMirror.list.payload.containers[root].parentId = "foreign";
  assert.equal(validatePersonalPhotoCopyBatchResult(wrongMirror, { body, listId: "list" }), false);
  if (contents) {
    const item = record.action.body.owners.find(owner => owner.entityType === "item").entityId;
    assert.equal(layout.arrangement.itemQuantities[item], 3); assert.equal(record.photoState.payload.items[item].quantity, 1);
    assert.equal(layout.arrangement.packedItems[item], undefined);
  }
  assert.deepEqual(createPersonalSaveOutbox({ ...f.binding, storage: f.storage }).recover(), record);
  for (const mutate of [value => { value.action.body.copyTree.targetLayout.name = "Not chosen"; },
    value => { value.photoState.payload.layouts.to.arrangement.containers[root].itemIds.push("hidden"); },
    value => { value.action.body.owners.pop(); }, value => { value.photoState.payload.containers[root].photos = []; }]) {
    const invalid = structuredClone(record); mutate(invalid); assert.throws(() => assertPersonalPhotoCopyBatchRecord(invalid));
  }
  const deleted = preparePersonalDeletionBatch(record.snapshot, { type: "container", id: "bag" });
  const child = f.outbox.capture({ snapshot: deleted.snapshot, body: { baseStateRevision: 7,
    payload: f.options.snapshotToPayload(deleted.snapshot), userDeletion: deleted.intent } });
  assert.equal(child.action.body.photoResults.version, 2);
  for (const owner of body.owners) {
    const field = owner.entityType === "item" ? "items" : "containers";
    if (targetParent && field === "containers") assert.equal(child.action.body.payload[field][owner.entityId], undefined);
    else assert.deepEqual(child.action.body.payload[field][owner.entityId].photos, record.photoState.payload[field][owner.entityId].photos);
    if (targetParent) assert.equal(child.action.body.payload.layouts.to.arrangement[field][owner.entityId], undefined);
  }
  assert.deepEqual(child.action.body.photoResults.owners, record.action.body.owners.map(({ entityType, entityId }) => ({ entityType, entityId })));
  assert.equal(personalPendingPhotoCopyDeletionForm({ records: f.outbox.list(), operationId: child.action.operationId, listId: "list" }).action.operationId, record.action.operationId);
});

test("tree copies retain one ID set across preflight/storage failure and are gated independently", async () => {
  assert.equal(PERSONAL_PHOTO_TREE_COPY_ENABLED, false);
  const off = fixture(); assert.throws(() => createPersonalPhotoTreeCopySession({ ...off.options, enabled: false }).prepare(off.input));
  for (const mode of ["quota", "source changed", "writer disabled"]) {
    const f = fixture();
    if (mode === "source changed") f.options.readOwner = async () => ({ ok: false });
    if (mode === "writer disabled") f.options.outbox = createPersonalSaveOutbox({ ...f.outboxOptions, photoTreeCopyEnabled: false });
    const session = createPersonalPhotoTreeCopySession(f.options); session.prepare(f.input); const before = session.recoveryCopy();
    if (mode === "quota") f.storage.setItem = () => { throw Error("quota"); };
    const promise = session.submit(); await assert.rejects(promise); assert.equal(session.submit(), promise);
    assert.deepEqual(session.recoveryCopy().ids, before.ids); assert.deepEqual(session.recoveryCopy().preview, before.preview);
    assert.equal(f.events.includes("view"), false); assert.equal(f.outbox.hasPending(), false);
  }
});

test("opening a destination cannot silently repair unrelated legacy fields inside a photo copy", () => {
  const f = fixture(); f.input.snapshot.layouts.to.arrangement.itemQuantityMigrationVersion = 3;
  const before = structuredClone(f.input);
  assert.throws(() => createPersonalPhotoTreeCopySession(f.options).prepare(f.input), { code: "photo-tree-copy" });
  assert.deepEqual(f.input, before); assert.equal(f.outbox.hasPending(), false); assert.deepEqual(f.events, []);
});

test("a refused independent copy does not block the separately validated existing-owner link", async () => {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8").match(/async function preparePersonalContainerTreeAction\([^]*?\n\}/)[0];
  for (const mode of ["copy", "link"]) {
    const f = fixture(), state = f.input.snapshot, before = structuredClone(state), events = [];
    const deps = { state, personalSavePilotEnabled: () => true, localStorageScopeKey: "id:actor", modeState: {},
      isReadOnlyBikePackingContext: () => false, isAdminPublicEditScope: () => false, personalSaveRecovery: { assertRunning() {} },
      personalSaveContext: f.options.getContext, nowIso: () => f.input.changedAt, currentEditMeta: () => f.input.editMeta,
      normalizeItemPhotos: owner => owner.photos || [], PERSONAL_PHOTO_TREE_COPY_ENABLED: true, PERSONAL_PHOTO_COPY_BATCH_ENABLED: true,
      PERSONAL_PHOTO_TREE_LINK_ENABLED: true, personalPhotoFormUiEnabled: () => true, uiLanguage: "ru",
      makeContainerCopyNameForLayout: () => "Frozen copy", personalPhotoFormRequest: value => value,
      personalPhotoFormSession: () => ({ prepare() { events.push("copy refused"); throw Error("Independent copy limit"); } }),
      preparePersonalContainerTreeCopy: (state, request, options) => preparePersonalContainerTreeCopy(state, request, { ...options, photoTreeLinkEnabled: true }),
      normalizeContainerColor: value => value, markEdited() {}, applyLayoutArrangement() {}, requireUsageCapacity: () => true,
      showToast: text => events.push(text), saveState: ({ personalMutation }) => {
        f.outbox.capture({ snapshot: state, body: { payload: f.options.snapshotToPayload(state), baseStateRevision: 7, userContainerTree: personalMutation } }); events.push("durable link");
      } };
    const prepare = new Function(...Object.keys(deps), `return (${source})`)(...Object.values(deps));
    const commit = await prepare(f.input.request); assert.equal(typeof commit, "function"); assert.deepEqual(state, before);
    if (mode === "copy") { assert.equal(commit(mode), false); assert.equal(f.outbox.hasPending(), false); assert.deepEqual(state, before); }
    else {
      assert.equal(commit(mode), "bag"); assert.equal(f.outbox.recover().action.body.userContainerTree.mode, "link");
      assert.deepEqual(state.containers.bag.photos, before.containers.bag.photos); assert.equal(state.layouts.to.arrangement.items.pump, "bag");
      assert.deepEqual(events, ["copy refused", "durable link"]);
    }
  }
});
