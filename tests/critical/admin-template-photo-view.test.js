import test from "node:test";
import assert from "node:assert/strict";
import { captureAdminTemplatePhotoView, assertAdminTemplatePhotoView, restoreAdminTemplatePhotoReferences } from "../../src/sync/admin-template-photo-view.js";
import { normalizeItemPhotos } from "../../src/state/item-photos.js";

const blocked = { code: "admin-template-photo-view-required", isAdminTemplateBlocked: true };
function fixture(shared = false) {
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment",
    listId: shared ? "public-shared-layout-ui" : "public-demo-state-ui", itemKey: shared ? "shared-layout:ui" : "demo-state:ui" };
  const photo = id => ({ id, photoId: id, listId: binding.listId, status: "synced", fileName: `${id}.jpg`,
    url: `https://example.test/${id}.jpg`, thumbUrl: `https://example.test/${id}-thumb.jpg`, width: 640, height: 480,
    metadata: { credit: "Original", attribution: ["Author", { licence: "Preserved" }] } });
  const sourcePayload = { items: { "item-server": { id: "item-server", name: "Pump", photos: [photo("photo-item-a"), photo("photo-item-b")] },
    "item-empty": { id: "item-empty", name: "Empty" } },
    containers: { "container-server": { id: "container-server", name: "Bag", photos: [photo("photo-container")] } } };
  const view = raw => ({ id: raw.id, localId: "", listId: raw.listId, status: raw.status, fileName: raw.fileName,
    url: raw.url, thumbUrl: raw.thumbUrl, type: "", size: 0, width: raw.width, height: raw.height,
    createdAt: "2026-09-11T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z", error: "" });
  const layoutId = "layout-admin-ui", mappings = { items: { "item-local": "item-server", "empty-local": "item-empty" }, containers: { "bag-local": "container-server" } };
  const state = { layouts: { [layoutId]: { id: layoutId } },
    items: { "item-local": { ...structuredClone(sourcePayload.items["item-server"]), id: "item-local", publicCatalogLayoutId: layoutId,
      photos: sourcePayload.items["item-server"].photos.map(view) },
      "empty-local": { id: "empty-local", publicCatalogLayoutId: layoutId, photos: [] },
      personal: { id: "personal", name: "Private", photos: [photo("private-photo")] } },
    containers: { "bag-local": { ...structuredClone(sourcePayload.containers["container-server"]), id: "bag-local", publicCatalogLayoutId: layoutId,
      photos: sourcePayload.containers["container-server"].photos.map(view) } } };
  const payload = { items: { "item-server": { ...structuredClone(state.items["item-local"]), id: "item-server" }, "item-empty": { id: "item-empty" } },
    containers: { "container-server": { ...structuredClone(state.containers["bag-local"]), id: "container-server" } },
    layouts: { main: { id: "main", name: "Editor label" } }, locations: ["Unchanged"], extra: { preserved: true } };
  for (const type of ["items", "containers"]) for (const row of Object.values(payload[type])) delete row.publicCatalogLayoutId;
  const f = { binding, layoutId, sourcePayload, state, payload, mappings };
  f.baseline = captureAdminTemplatePhotoView(f);
  return f;
}

test("demo and shared item/container saves preserve complete raw references and unrelated data without aliases", () => {
  for (const shared of [false, true]) {
    const f = fixture(shared), before = structuredClone(f);
    f.state.items["item-local"].name = "Edited fields"; f.payload.items["item-server"].name = "Edited fields";
    f.state.containers["bag-local"].name = "Edited bag"; f.payload.containers["container-server"].name = "Edited bag";
    const snapshot = structuredClone(f), result = restoreAdminTemplatePhotoReferences(f);
    assert.deepEqual(result.items["item-server"].photos, f.sourcePayload.items["item-server"].photos);
    assert.deepEqual(result.containers["container-server"].photos, f.sourcePayload.containers["container-server"].photos);
    assert.equal(result.items["item-server"].name, "Edited fields");
    assert.equal(result.containers["container-server"].name, "Edited bag");
    assert.deepEqual(result.layouts, f.payload.layouts); assert.deepEqual(result.extra, f.payload.extra);
    assert.deepEqual(f, snapshot); assert.deepEqual(f.state.items.personal, before.state.items.personal);
    result.items["item-server"].photos[0].metadata.credit = "Caller mutation";
    result.layouts.main.name = "Caller mutation";
    assert.deepEqual(f, snapshot);
  }
});

test("capture owns immutable raw and displayed copies and survives JSON persistence", () => {
  const f = fixture(), saved = structuredClone(f.baseline);
  f.sourcePayload.items["item-server"].photos[0].metadata.credit = "Later source";
  f.state.items["item-local"].photos[0].fileName = "Later view";
  assert.deepEqual(f.baseline, saved);
  f.state.items["item-local"].photos = structuredClone(saved.owners.find(owner => owner.type === "items").viewPhotos);
  f.baseline = JSON.parse(JSON.stringify(saved));
  assert.equal(assertAdminTemplatePhotoView(f), true);
  assert.equal(restoreAdminTemplatePhotoReferences(f).items["item-server"].photos[0].metadata.credit, "Original");
});

test("real legacy normalization preserves id-only and photoId-only references without adding absent raw fields", () => {
  for (const photoIdOnly of [false, true]) {
    const f = fixture();
    for (const type of ["items", "containers"]) for (const [localId, serverId] of Object.entries(f.mappings[type])) {
      const source = f.sourcePayload[type][serverId];
      if (!source.photos?.length) continue;
      for (const raw of source.photos) {
        if (photoIdOnly) { delete raw.id; raw.thumb_url = raw.thumbUrl; }
        else delete raw.photoId;
        delete raw.status; delete raw.thumbUrl;
        raw.width = null; raw.height = null;
      }
      const row = f.state[type][localId];
      row.photos = source.photos.map(raw => ({ ...structuredClone(raw), id: raw.id ?? raw.photoId }));
      normalizeItemPhotos(row);
      f.payload[type][serverId].photos = structuredClone(row.photos);
    }
    const original = structuredClone(f.sourcePayload);
    f.baseline = captureAdminTemplatePhotoView(f);
    for (const type of ["items", "containers"]) for (const localId of Object.keys(f.mappings[type])) normalizeItemPhotos(f.state[type][localId]);
    assert.equal(assertAdminTemplatePhotoView(f), true);
    const restored = restoreAdminTemplatePhotoReferences(f);
    for (const type of ["items", "containers"]) for (const [serverId, source] of Object.entries(original[type])) {
      if (!source.photos?.length) continue;
      assert.deepEqual(restored[type][serverId].photos, source.photos);
      for (const photo of restored[type][serverId].photos) {
        assert.equal(Object.hasOwn(photo, "status"), false);
        assert.equal(Object.hasOwn(photo, "thumbUrl"), false);
        assert.equal(Object.hasOwn(photo, photoIdOnly ? "id" : "photoId"), false);
      }
    }
    assert.deepEqual(f.sourcePayload, original);
    f.state.items["item-local"].photos[0].id = "random-id-without-view-seeding";
    assert.throws(() => captureAdminTemplatePhotoView(f), blocked);
  }
});

test("a missing baseline permits fileless administrative records but never existing or new photos", () => {
  const f = fixture(); delete f.baseline;
  assert.throws(() => assertAdminTemplatePhotoView(f), blocked);
  delete f.state.items["item-local"].photos; f.state.containers["bag-local"].photos = [];
  delete f.payload.items["item-server"].photos; f.payload.containers["container-server"].photos = [];
  assert.equal(assertAdminTemplatePhotoView(f), true);
  assert.deepEqual(restoreAdminTemplatePhotoReferences(f), f.payload);
  f.state.items["empty-local"].photos = structuredClone(f.sourcePayload.items["item-server"].photos);
  assert.throws(() => assertAdminTemplatePhotoView(f), blocked);
});

test("photo edits are rejected before normalization can discard unknown fields or change their order", () => {
  const changes = [row => { row.photos[0].url += "?changed"; }, row => { row.photos[0].thumbUrl += "?changed"; },
    row => { row.photos[0].fileName = "changed.jpg"; }, row => { row.photos[0].metadata = { credit: "Changed" }; },
    row => { row.photos[0].photoId = "different"; }, row => { row.photos[0].unexpected = { discardMe: true }; },
    row => { row.photos[0].width++; }, row => { row.photos[0].status = "pending"; },
    row => { row.photos.reverse(); }, row => { row.photos.pop(); }, row => { row.photos = []; }, row => { delete row.photos; }];
  for (const change of changes) {
    const f = fixture(); change(f.state.items["item-local"]); const before = structuredClone(f);
    assert.throws(() => assertAdminTemplatePhotoView(f), blocked);
    assert.throws(() => restoreAdminTemplatePhotoReferences(f), blocked); assert.deepEqual(f, before);
  }
});

test("deleted, renamed and moved owners or newly attached photo owners cannot borrow a baseline", () => {
  for (const change of [f => { delete f.state.items["item-local"]; }, f => { f.state.items["item-local"].id = "renamed"; },
    f => { f.state.items["item-local"].publicCatalogLayoutId = "personal"; },
    f => { f.state.containers["bag-local"].publicCatalogLayoutId = "other-admin"; },
    f => { f.state.items["empty-local"].photos = structuredClone(f.state.items["item-local"].photos); },
    f => { f.state.items.new = { id: "new", publicCatalogLayoutId: f.layoutId, photos: structuredClone(f.state.items["item-local"].photos) }; }]) {
    const f = fixture(); change(f); assert.throws(() => assertAdminTemplatePhotoView(f), blocked);
  }
});

test("baseline binding and structure are revalidated after reload", () => {
  for (const change of [f => { f.baseline.binding.actorId = "other"; }, f => { f.baseline.binding.environment = "production"; },
    f => { f.baseline.binding.listId = "public-demo-state-other"; }, f => { f.baseline.binding.itemKey = "shared-layout:ui"; },
    f => { f.baseline.layoutId = "other-editor"; }, f => { f.baseline.version = 2; },
    f => { f.baseline.owners.push(structuredClone(f.baseline.owners[0])); },
    f => { f.baseline.owners[0].rawPhotos[0].photoId = "different"; }, f => { f.baseline.owners[0].rawPhotos[0].listId = "private-list"; },
    f => { f.baseline.owners[0].extra = true; }]) {
    const f = fixture(); change(f); assert.throws(() => assertAdminTemplatePhotoView(f), blocked);
  }
});

test("capture refuses lost or ambiguous source ownership and foreign raw references", () => {
  for (const change of [f => { delete f.mappings.items["item-local"]; },
    f => { f.mappings.items["empty-local"] = "item-server"; }, f => { f.mappings.items["item-local"] = "item-empty"; },
    f => { f.state.items["item-local"].publicCatalogLayoutId = "other"; },
    f => { f.sourcePayload.items["item-server"].photos[0].listId = "private-list"; },
    f => { f.sourcePayload.items["item-server"].photos[0].photoId = "different"; },
    f => { f.sourcePayload.items["item-server"].photos[0].status = "pending"; },
    f => { f.sourcePayload.items["item-server"].photos[0].url += "?not-the-view"; },
    f => { f.sourcePayload.items["item-server"].photos.push(structuredClone(f.sourcePayload.items["item-server"].photos[0])); }]) {
    const f = fixture(); change(f); const before = structuredClone(f);
    assert.throws(() => captureAdminTemplatePhotoView(f), blocked); assert.deepEqual(f, before);
  }
});

test("export must keep the proved owner and photo identities without unproved additional photos", () => {
  for (const change of [f => { f.mappings.items["item-local"] = "item-empty"; },
    f => { f.mappings.items["empty-local"] = "item-server"; }, f => { delete f.mappings.containers["bag-local"]; },
    f => { f.payload.items["item-server"].id = "different"; }, f => { delete f.payload.containers["container-server"]; },
    f => { f.payload.items["item-server"].photos.reverse(); }, f => { f.payload.items["item-server"].photos[0].url += "?changed"; },
    f => { f.payload.items["item-empty"].photos = structuredClone(f.payload.items["item-server"].photos); }]) {
    const f = fixture(); change(f); const before = structuredClone(f);
    assert.throws(() => restoreAdminTemplatePhotoReferences(f), blocked); assert.deepEqual(f, before);
  }
});

test("invalid non-JSON or malformed photo data fails closed while transient non-enumerable view hints are harmless", () => {
  const f = fixture(); Object.defineProperty(f.state.items["item-local"].photos[0], "uploadProgress", { value: 85, enumerable: false });
  assert.equal(assertAdminTemplatePhotoView(f), true);
  for (const value of [null, {}, [null], [{ id: "photo", unknown: undefined }]]) {
    const changed = fixture(); changed.state.items["item-local"].photos = value;
    assert.throws(() => assertAdminTemplatePhotoView(changed), blocked);
  }
  const changed = fixture(); changed.baseline.owners[0].rawPhotos[0].metadata.circular = changed.baseline;
  assert.throws(() => assertAdminTemplatePhotoView(changed), blocked);
});

test("an empty initial baseline allows new fileless owners but cannot authorize a later first photo", () => {
  const f = fixture();
  for (const type of ["items", "containers"]) {
    for (const row of Object.values(f.sourcePayload[type])) delete row.photos;
    for (const row of Object.values(f.state[type])) if (row.publicCatalogLayoutId === f.layoutId) row.photos = [];
  }
  f.baseline = captureAdminTemplatePhotoView(f);
  assert.deepEqual(f.baseline.owners, []);
  f.state.items.new = { id: "new", publicCatalogLayoutId: f.layoutId };
  assert.equal(assertAdminTemplatePhotoView(f), true);
  f.state.items.new.photos = structuredClone(f.state.items.personal.photos);
  assert.throws(() => assertAdminTemplatePhotoView(f), blocked);
});
