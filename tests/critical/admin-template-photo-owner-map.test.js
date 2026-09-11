import test from "node:test";
import assert from "node:assert/strict";
import { captureAdminTemplatePhotoOwnerMap, assertAdminTemplatePhotoOwnerMap, adminTemplatePhotoPreservedEntityIds } from "../../src/sync/admin-template-photo-owner-map.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";

const blocked = { code: "admin-template-photo-owner-map-required", isAdminTemplateBlocked: true };
function fixture(demo = false) {
  const binding = { actorId: "administrator-a", environment: "bike-packing-experiment",
    listId: demo ? "public-demo-state-en" : "public-shared-layout-selected", itemKey: demo ? "demo-state:en" : "shared-layout:selected" };
  const layoutId = "editor-selected", stateRevision = 17, decisionId = "12345678-1234-4234-8234-123456789abc";
  const sourcePayload = {
    items: { "pump:01": { id: "pump:01", name: "Pump", sharedSourceId: "unrelated-origin", containerId: "bag:01", photos: [] },
      "spare.2": { id: "spare.2", name: "Detached spare", photos: [] } },
    containers: { "bag:01": { id: "bag:01", name: "Bag", itemIds: ["pump:01"], childIds: [], order: [{ type: "item", id: "pump:01" }] },
      "detached:bag": { id: "detached:bag", name: "Detached bag", itemIds: [], childIds: [], order: [], photos: [] } },
    layouts: { original: { id: "original", name: "Template", rootContainerIds: ["bag:01"], arrangement: {
      rootContainerIds: ["bag:01"], containers: { "bag:01": { parentId: "", itemIds: ["pump:01"], childIds: [], order: [{ type: "item", id: "pump:01" }] } },
      items: { "pump:01": "bag:01" }, itemQuantities: { "pump:01": 2 }, packedItems: {} } } },
    activeLayoutId: "original", locations: [], categories: []
  };
  const layout = { id: layoutId, ...(demo ? { adminDemo: true } : { adminSharedSourceId: "selected" }) };
  const projection = projectAdminTemplateServerVariant(layout, { exists: true, deleted: false, stateRevision, visibility: "private",
    payload: sourcePayload, metadata: { title: "Template", description: "", language: demo ? "en" : "ru" } }, decisionId);
  const state = { layouts: { [layoutId]: projection.layout, private: { id: "private" }, other: { id: "other" } },
    items: { ...projection.items, personal: { id: "personal", name: "Private item" },
      otherItem: { id: "otherItem", publicCatalogLayoutId: "other", name: "Another admin draft" } },
    containers: { ...projection.containers, privateBag: { id: "privateBag", itemIds: ["personal"] } } };
  // These are the actual source-to-local allocations in the projector. Do not
  // reconstruct the source ID from sharedSourceId: one source has a different
  // retained origin on purpose, and these source IDs contain ':' and '.'.
  const mappings = Object.fromEntries(["items", "containers"].map(type => [type,
    Object.fromEntries(Object.keys(sourcePayload[type]).sort().map((serverId, index) => [
      `admin-server-${type === "items" ? "item" : "container"}-${decisionId}-${index}`, serverId]))]));
  const f = { binding, layoutId, stateRevision, sourcePayload, state, mappings };
  f.map = captureAdminTemplatePhotoOwnerMap(f);
  return f;
}

test("real demo/shared projections retain exact item/container IDs including every detached and fileless owner", () => {
  for (const demo of [false, true]) {
    const f = fixture(demo), before = structuredClone(f);
    assert.equal(assertAdminTemplatePhotoOwnerMap(f), true);
    assert.deepEqual(adminTemplatePhotoPreservedEntityIds(f), f.mappings);
    assert.equal(f.map.owners.length, 4);
    const pump = f.map.owners.find(owner => owner.serverId === "pump:01");
    assert.equal(f.state.items[pump.localId].sharedSourceId, "unrelated-origin");
    assert.equal(adminTemplatePhotoPreservedEntityIds(f).items[pump.localId], "pump:01");
    assert.ok(f.map.owners.some(owner => owner.serverId === "spare.2"));
    assert.ok(f.map.owners.some(owner => owner.serverId === "detached:bag"));
    assert.deepEqual(f, before);
  }
});

test("captured map is deeply immutable, JSON recoverable, and returned export mappings have no input alias", () => {
  const f = fixture(), saved = JSON.parse(JSON.stringify(f.map));
  assert.equal(Object.isFrozen(f.map), true); assert.equal(Object.isFrozen(f.map.binding), true);
  assert.equal(Object.isFrozen(f.map.owners), true); assert.equal(Object.isFrozen(f.map.owners[0]), true);
  assert.throws(() => { f.map.owners[0].serverId = "replacement"; }, TypeError);
  f.mappings.items = {}; f.binding.actorId = "later-account";
  assert.deepEqual(f.map, saved);
  f.binding = structuredClone(saved.binding); f.map = saved;
  const ids = adminTemplatePhotoPreservedEntityIds(f), localId = f.map.owners[0].localId;
  ids.items[localId] = "caller-edit";
  assert.equal(assertAdminTemplatePhotoOwnerMap(f), true);
  assert.notEqual(adminTemplatePhotoPreservedEntityIds(f).items[localId], "caller-edit");
});

test("identity mapping does not normalize or certify source business, photos, quantities or display links", () => {
  const f = fixture(), first = f.map.owners[0];
  f.state.items[first.localId].name = "Edited local label";
  f.state.items[first.localId].containerId = "";
  f.state.items[first.localId].photos = [{ id: "unconfirmed-view-photo", metadata: { kept: true } }];
  f.sourcePayload.items[first.serverId].custom = { unknown: [3, 1, 2] };
  f.sourcePayload.layouts.original.arrangement.itemQuantities["pump:01"] = 7;
  const before = structuredClone(f);
  assert.equal(assertAdminTemplatePhotoOwnerMap(f), true);
  assert.deepEqual(adminTemplatePhotoPreservedEntityIds(f), f.mappings);
  assert.deepEqual(f, before);
});

test("actor, environment, template, local editor and confirmed revision cannot borrow another map", () => {
  for (const mutate of [f => { f.binding.actorId = "other-admin"; }, f => { f.binding.environment = "production"; },
    f => { f.binding.listId = "public-shared-layout-other"; f.binding.itemKey = "shared-layout:other"; },
    f => { f.binding.itemKey = "demo-state"; }, f => { f.layoutId = "other"; },
    f => { f.stateRevision++; }, f => { f.stateRevision = "17"; }, f => { f.stateRevision = 0; }]) {
    const f = fixture(); mutate(f);
    assert.throws(() => assertAdminTemplatePhotoOwnerMap(f), blocked);
    assert.throws(() => adminTemplatePhotoPreservedEntityIds(f), blocked);
  }
});

test("capture requires complete one-to-one source mappings and never fills missing IDs from origin labels", () => {
  for (const mode of ["omitted", "duplicate-server", "foreign-local", "missing-source", "extra-source", "wrong-type"]) {
    const f = fixture(), owners = f.map.owners.filter(owner => owner.type === "items"), first = owners[0], second = owners[1];
    if (mode === "omitted") delete f.mappings.items[first.localId];
    if (mode === "duplicate-server") f.mappings.items[second.localId] = first.serverId;
    if (mode === "foreign-local") { delete f.mappings.items[first.localId]; f.mappings.items.personal = first.serverId; }
    if (mode === "missing-source") delete f.sourcePayload.items[first.serverId];
    if (mode === "extra-source") f.sourcePayload.items.unmapped = { id: "unmapped", photos: [] };
    if (mode === "wrong-type") f.mappings.items[first.localId] = f.map.owners.find(owner => owner.type === "containers").serverId;
    assert.throws(() => captureAdminTemplatePhotoOwnerMap(f), blocked, mode);
  }
});

test("deleted, moved, renamed or newly materialized owners require a new verified map", () => {
  for (const mode of ["deleted", "moved", "missing-namespace", "id-changed", "extra-empty", "other-layout-id"]) {
    const f = fixture(), first = f.map.owners[0];
    if (mode === "deleted") delete f.state.items[first.localId];
    if (mode === "moved") f.state.items[first.localId].publicCatalogLayoutId = "other";
    if (mode === "missing-namespace") delete f.state.items[first.localId].publicCatalogLayoutId;
    if (mode === "id-changed") f.state.items[first.localId].id = "different-local-id";
    if (mode === "extra-empty") f.state.items.newItem = { id: "newItem", publicCatalogLayoutId: f.layoutId, photos: [] };
    if (mode === "other-layout-id") f.state.layouts[f.layoutId].id = "another-editor";
    assert.throws(() => adminTemplatePhotoPreservedEntityIds(f), blocked, mode);
  }
});

test("selected local IDs cannot collide with another collection or layout even in a foreign namespace", () => {
  for (const collection of ["containers", "layouts"]) {
    const f = fixture(), selected = f.map.owners[0];
    f.state[collection][selected.localId] = { id: selected.localId, publicCatalogLayoutId: "other" };
    assert.throws(() => captureAdminTemplatePhotoOwnerMap(f), blocked);
    assert.throws(() => adminTemplatePhotoPreservedEntityIds(f), blocked);
  }
});

test("source IDs must match their rows and cannot overlap across owner types or source layouts", () => {
  for (const mode of ["row-id", "cross-type", "layout-id", "unsafe-id"]) {
    const f = fixture(), first = f.map.owners[0];
    if (mode === "row-id") f.sourcePayload.items[first.serverId].id = "another-source-id";
    if (mode === "cross-type") f.sourcePayload.containers[first.serverId] = { id: first.serverId };
    if (mode === "layout-id") f.sourcePayload.items.original = { id: "original" };
    if (mode === "unsafe-id") Object.defineProperty(f.sourcePayload.items, "__proto__", { enumerable: true, value: { id: "__proto__" } });
    assert.throws(() => assertAdminTemplatePhotoOwnerMap(f), blocked, mode);
  }
});

test("recovered map rejects duplicate rows, changed grammar and malformed containers", () => {
  for (const mutate of [f => { f.map.owners.push(structuredClone(f.map.owners[0])); }, f => { f.map.owners.pop(); },
    f => { f.map.owners[0].type = "layouts"; }, f => { f.map.owners[0].sharedSourceId = "origin"; },
    f => { f.map.version = 2; }, f => { f.map.force = true; }, f => { f.map = null; },
    f => { f.state.items = []; }, f => { f.sourcePayload.containers = null; }]) {
    const f = fixture(); f.map = JSON.parse(JSON.stringify(f.map)); mutate(f);
    assert.throws(() => adminTemplatePhotoPreservedEntityIds(f), blocked);
  }
});

test("an empty source captures an empty map without adopting unrelated private or administrative owners", () => {
  const f = fixture(); f.sourcePayload.items = {}; f.sourcePayload.containers = {};
  for (const type of ["items", "containers"]) for (const [key, row] of Object.entries(f.state[type])) {
    if (row.publicCatalogLayoutId === f.layoutId) delete f.state[type][key];
  }
  f.mappings = { items: {}, containers: {} }; f.map = captureAdminTemplatePhotoOwnerMap(f);
  assert.deepEqual(adminTemplatePhotoPreservedEntityIds(f), { items: {}, containers: {} });
  assert.equal(f.map.owners.length, 0);
  assert.equal(f.state.items.personal.name, "Private item");
  assert.equal(f.state.items.otherItem.name, "Another admin draft");
});
