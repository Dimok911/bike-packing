import test from "node:test";
import assert from "node:assert/strict";
import { normalizeItemPhotos, createPhotoDraftFromRecord } from "../../src/state/item-photos.js";
import { cloneStateForSyncPayload, compactPhotoForSync } from "../../src/sync/serialize.js";
import { personalBusinessPayload } from "../../src/sync/personal-server-payload.js";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { assertPersonalPhotoFormCandidate } from "../../src/sync/personal-photo-form-protocol.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";

const binding = { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" };
const pending = () => ({ id: "photo", photoId: "photo", assetId: crypto.randomUUID(), listId: "list", status: "pending" });
const published = () => ({ ...pending(), status: "synced", url: "https://api.example.test/file", thumbUrl: "https://api.example.test/thumb",
  fileName: "Рюкзак.png", type: "image/png", size: 100, width: 10, height: 10 });
const project = value => cloneStateForSyncPayload(value, { forSync: true });

test("causal pending photo keeps exact IDs through real UI normalization, draft creation, JSON reload and sync projection", () => {
  const photo = pending(), owner = { id: "item", photos: [photo] };
  for (let i = 0; i < 3; i++) {
    normalizeItemPhotos(owner);
    owner.photos = JSON.parse(JSON.stringify(createPhotoDraftFromRecord(owner).photos));
    assert.deepEqual(owner.photos, [photo]);
    assert.deepEqual(compactPhotoForSync(owner.photos[0]), photo);
  }
  assert.equal(compactPhotoForSync({ id: "ordinary-local", status: "pending", localId: "cache-only" }), null);
  const oldSingleFile = pending(); delete oldSingleFile.listId;
  assert.deepEqual(compactPhotoForSync(normalizeItemPhotos({ photos: [oldSingleFile] })[0]), oldSingleFile);
});

test("confirmed causal photo preserves every server reference field without synthetic dates or cache metadata", () => {
  const photo = published(), record = { photos: [{ ...photo, localId: "cache", error: "", uploadProgress: 100 }] };
  normalizeItemPhotos(record);
  assert.equal(record.photos[0].localId, "cache");
  assert.deepEqual(JSON.parse(JSON.stringify(record.photos[0])), photo);
  assert.deepEqual(compactPhotoForSync(record.photos[0]), photo);
  normalizeItemPhotos(record);
  assert.deepEqual(createPhotoDraftFromRecord(record).photos, [photo]);
});

test("malformed causal references stop saving rather than quietly degrading into legacy photos or being pruned", () => {
  for (const mutate of [p => { p.photoId = "other"; }, p => { p.assetId = "not-uuid"; }, p => { p.listId = ""; },
    p => { p.status = "uploading"; }, p => { p.size = NaN; }, p => { delete p.fileName; }, p => { p._copyToCurrentList = true; }]) {
    const photo = published(); mutate(photo);
    assert.throws(() => compactPhotoForSync(photo), { code: "causal-photo-reference" });
    assert.throws(() => normalizeItemPhotos({ photos: [photo] }), { code: "causal-photo-reference" });
  }
  assert.throws(() => compactPhotoForSync({ ...pending(), url: "/not-confirmed" }), { code: "causal-photo-reference" });
});

for (const entityType of ["item", "container"]) for (const created of [false, true]) {
  test(`real UI projection and immutable file codec round-trip ${created ? "new" : "existing"} ${entityType} form`, async () => {
    const collection = entityType === "item" ? "items" : "containers";
    const snapshot = { items: {}, containers: {}, layouts: { layout: { id: "layout", name: "Private",
      rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {} } } },
      activeLayoutId: "layout", packedItems: {}, collapsedContainers: {}, itemDisplayMode: "photos" };
    if (!created) snapshot[collection].owner = { id: "owner", name: "Before", photos: [published()],
      ...(entityType === "item" ? { containerId: "" } : { parentId: null, childIds: [], itemIds: [], order: [] }) };
    const basePayload = project(snapshot);
    const plan = preparePersonalPhotoFormAttachments({ binding, snapshot, basePayload, baseStateRevision: 7,
      entityType, entityId: "owner", baseEntityRevision: created ? 0 : 6, fields: { name: "After", note: "Frozen" },
      files: [{ fileName: "selected.png", file: new Blob(["immutable bytes"], { type: "image/png" }) }] },
    { enabled: true, snapshotToPayload: project });
    assert.deepEqual(project(plan.snapshot), plan.payload);
    assert.deepEqual(personalBusinessPayload(plan.payload), plan.payload);
    const action = { ...binding, operationId: plan.operationId, kind: "photos.mutate", generation: 1,
      body: { ...plan.body, causal: { dependsOn: [], reads: [] } } };
    const encoded = await encodePersonalPhotoFormRecord({ binding, action, snapshot: plan.snapshot, files: plan.files });
    const retained = await decodePersonalPhotoFormRecord(encoded, binding, plan.operationId);
    normalizeItemPhotos(retained.snapshot[collection].owner);
    assert.deepEqual(project(retained.snapshot), plan.payload);
    assert.equal(await retained.files[0].file.text(), "immutable bytes");
    assertPersonalPhotoFormCandidate({ body: action.body, basePayload, payload: project(retained.snapshot), listId: binding.listId });
    if (created) {
      const changed = structuredClone(plan.payload);
      changed[collection].owner[entityType === "item" ? "containerId" : "parentId"] = "hidden-placement";
      assert.throws(() => assertPersonalPhotoFormCandidate({ body: action.body, basePayload, payload: changed, listId: binding.listId }));
    }
  });
}
