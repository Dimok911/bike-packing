import test from "node:test";
import assert from "node:assert/strict";
import { projectAdminTemplateServerVariant, applyAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";
import { assertAdminTemplatePhotoOwnerMap, adminTemplatePhotoPreservedEntityIds } from "../../src/sync/admin-template-photo-owner-map.js";
import { assertAdminTemplatePhotoView } from "../../src/sync/admin-template-photo-view.js";
import { adminTemplateEditorSource } from "../../src/public/admin-template-causal-save-flow.js";

const decisionId = "12345678-1234-4234-8234-123456789abc";
function fixture({ demo = false, photos = false } = {}) {
  const binding = { actorId: "administrator-a", environment: "bike-packing-experiment",
    listId: demo ? "public-demo-state-en" : "public-shared-layout-selected",
    itemKey: demo ? "demo-state:en" : "shared-layout:selected" };
  const layout = { id: "selected-editor", rootContainerIds: [],
    ...(demo ? { adminDemo: true, adminDemoLanguage: "en" } : { adminSharedSourceId: "selected" }) };
  const photo = id => ({ photoId: id, listId: binding.listId, url: `https://example.test/${id}.png`,
    fileName: `${id}.png`, width: 32, height: 24, createdAt: "2026-09-11T00:00:00Z", updatedAt: "2026-09-11T00:00:00Z",
    metadata: { credit: "Original" } });
  const payload = { layouts: { original: { id: "original", rootContainerIds: ["bag:01"] } },
    containers: { "bag:01": { id: "bag:01", itemIds: ["pump:01"], childIds: [],
      ...(photos ? { photos: [photo("bag-photo")] } : {}) },
      detached: { id: "detached", itemIds: [], childIds: [], photos: [] } },
    items: { "pump:01": { id: "pump:01", containerId: "bag:01", sharedSourceId: "unrelated-origin", photos: [] },
      "spare.2": { id: "spare.2", containerId: "", ...(photos ? { photos: [photo("spare-photo")] } : {}) } },
    locations: [], categories: [], activeLayoutId: "original" };
  const server = { ...binding, ok: true, indexes: [], exists: true, deleted: false, stateRevision: 17, visibility: "private",
    payload, metadata: { title: "Selected template", description: "Server description", language: demo ? "en" : "ru" } };
  const project = (options = {}) => projectAdminTemplateServerVariant(layout, server, decisionId, {
    photoBinding: binding, photoOwnerMapEnabled: true, ...options });
  const state = { layouts: { [layout.id]: layout, personal: { id: "personal", rootContainerIds: [] } },
    items: { old: { id: "old", publicCatalogLayoutId: layout.id }, personal: { id: "personal", name: "Private item" } },
    containers: { personalBag: { id: "personalBag", itemIds: ["personal"] } } };
  const validation = (projection, extra = {}) => ({ binding, layoutId: layout.id, stateRevision: server.stateRevision,
    sourcePayload: payload, map: projection.layout.adminCausalSource?.photoOwnerMap,
    state: { layouts: { [layout.id]: projection.layout }, items: projection.items, containers: projection.containers }, ...extra });
  return { binding, layout, payload, server, project, state, validation };
}

test("enabled real server projections capture all exact source owners even when every owner is fileless", () => {
  for (const demo of [false, true]) {
    const f = fixture({ demo }), before = structuredClone({ layout: f.layout, server: f.server });
    const projection = f.project(), args = f.validation(projection), map = args.map;
    assert.equal(assertAdminTemplatePhotoOwnerMap(args), true);
    assert.equal(map.owners.length, 4); assert.equal(map.stateRevision, 17);
    assert.equal(projection.layout.adminCausalSource.photoView, undefined);
    for (const type of ["items", "containers"]) {
      assert.deepEqual(map.owners.filter(owner => owner.type === type).map(owner => owner.serverId).sort(), Object.keys(f.payload[type]).sort());
    }
    const pump = map.owners.find(owner => owner.serverId === "pump:01");
    assert.equal(projection.items[pump.localId].sharedSourceId, "unrelated-origin");
    assert.equal(adminTemplatePhotoPreservedEntityIds(args).items[pump.localId], "pump:01");
    assert.deepEqual({ layout: f.layout, server: f.server }, before);
  }
});

test("the owner map coexists with raw legacy photo baselines for both owner types", () => {
  const f = fixture({ photos: true }), projection = f.project(), args = f.validation(projection);
  assert.equal(assertAdminTemplatePhotoOwnerMap(args), true);
  const baseline = projection.layout.adminCausalSource.photoView;
  assert.equal(assertAdminTemplatePhotoView({ binding: f.binding, layoutId: f.layout.id, baseline, state: args.state }), true);
  assert.equal(baseline.owners.length, 2); assert.equal(args.map.owners.length, 4);
  for (const owner of baseline.owners) {
    assert.deepEqual(owner.rawPhotos, f.payload[owner.type][owner.serverId].photos);
    assert.equal(Object.hasOwn(owner.rawPhotos[0], "id"), false);
    assert.equal(owner.viewPhotos[0].id, owner.rawPhotos[0].photoId);
  }
});

test("the default OFF projector remains byte-equivalent to an explicitly disabled owner map", () => {
  for (const photos of [false, true]) {
    const f = fixture({ photos });
    const original = projectAdminTemplateServerVariant(f.layout, f.server, decisionId, { photoBinding: f.binding });
    assert.deepEqual(f.project({ photoOwnerMapEnabled: false }), original);
    assert.equal(original.layout.adminCausalSource?.photoOwnerMap, undefined);
  }
});

test("enabled capture refuses an absent binding or unconfirmed revision without mutating the source", () => {
  for (const mode of ["binding", "revision", "public", "duplicate-source-id"]) {
    const f = fixture();
    if (mode === "revision") f.server.stateRevision = 0;
    if (mode === "public") f.server.visibility = "public";
    if (mode === "duplicate-source-id") f.payload.items.original = { id: "original" };
    const before = structuredClone({ layout: f.layout, server: f.server });
    assert.throws(() => f.project(mode === "binding" ? { photoBinding: null } : {}));
    assert.deepEqual({ layout: f.layout, server: f.server }, before);
  }
});

test("a JSON-recovered server projection installs its owner map alongside the confirmed source and keeps personal data", () => {
  const f = fixture({ photos: true }), projection = JSON.parse(JSON.stringify(f.project()));
  const source = adminTemplateEditorSource(f.binding, f.server);
  const expectedMap = structuredClone(projection.layout.adminCausalSource.photoOwnerMap);
  const expectedView = structuredClone(projection.layout.adminCausalSource.photoView);
  const privateBefore = structuredClone({ item: f.state.items.personal, bag: f.state.containers.personalBag, layout: f.state.layouts.personal });
  let saved;
  applyAdminTemplateServerVariant(f.state, f.layout.id, projection, source, {
    sourcePayload: f.payload, persist: () => { saved = structuredClone(f.state); return true; } });
  assert.deepEqual(saved.layouts[f.layout.id].adminCausalSource, { ...source, photoView: expectedView, photoOwnerMap: expectedMap });
  assert.equal(assertAdminTemplatePhotoOwnerMap(f.validation(projection, { state: f.state,
    map: f.state.layouts[f.layout.id].adminCausalSource.photoOwnerMap })), true);
  assert.deepEqual({ item: f.state.items.personal, bag: f.state.containers.personalBag, layout: f.state.layouts.personal }, privateBefore);
  projection.layout.adminCausalSource.photoOwnerMap.owners[0].serverId = "caller-mutated";
  assert.deepEqual(f.state.layouts[f.layout.id].adminCausalSource.photoOwnerMap, expectedMap);
});

test("server adoption refuses a foreign or stale map before persistence and leaves the local draft intact", () => {
  for (const mode of ["actor", "revision", "layout", "missing-owner", "wrong-namespace", "changed-source-id"]) {
    const f = fixture(), projection = JSON.parse(JSON.stringify(f.project()));
    const map = projection.layout.adminCausalSource.photoOwnerMap;
    if (mode === "actor") map.binding.actorId = "another-admin";
    if (mode === "revision") map.stateRevision++;
    if (mode === "layout") map.layoutId = "another-editor";
    if (mode === "missing-owner") map.owners.pop();
    if (mode === "wrong-namespace") projection.items[map.owners[0].localId].publicCatalogLayoutId = "another-editor";
    if (mode === "changed-source-id") map.owners[0].serverId = "invented-source-id";
    const before = structuredClone(f.state); let persists = 0;
    assert.throws(() => applyAdminTemplateServerVariant(f.state, f.layout.id, projection,
      adminTemplateEditorSource(f.binding, f.server), { sourcePayload: f.payload, persist: () => { persists++; return true; } }));
    assert.equal(persists, 0); assert.deepEqual(f.state, before);
  }
});

test("owner-map adoption rolls back the complete editor if saving the mirror fails", () => {
  const f = fixture(), projection = f.project(), before = structuredClone(f.state);
  assert.throws(() => applyAdminTemplateServerVariant(f.state, f.layout.id, projection,
    adminTemplateEditorSource(f.binding, f.server), { sourcePayload: f.payload, persist: () => false }));
  assert.deepEqual(f.state, before); assert.equal(f.state.layouts[f.layout.id], f.layout);
});

test("a frozen stop-choice without raw payload retains the captured map but still rejects changed local inventory or binding", () => {
  for (const mode of ["valid", "actor", "revision", "missing-owner", "duplicate-server", "foreign-collision"]) {
    const f = fixture(), projection = JSON.parse(JSON.stringify(f.project()));
    const map = projection.layout.adminCausalSource.photoOwnerMap;
    if (mode === "actor") map.binding.actorId = "another-admin";
    if (mode === "revision") map.stateRevision++;
    if (mode === "missing-owner") map.owners.pop();
    if (mode === "duplicate-server") map.owners[1].serverId = map.owners[0].serverId;
    if (mode === "foreign-collision") f.state.containers[map.owners[0].localId] = { id: map.owners[0].localId, name: "Private bag" };
    const before = structuredClone(f.state), source = adminTemplateEditorSource(f.binding, f.server);
    let persists = 0;
    const apply = () => applyAdminTemplateServerVariant(f.state, f.layout.id, projection, source,
      { persist: () => { persists++; return true; } });
    if (mode === "valid") { assert.equal(apply(), true); assert.equal(persists, 1); }
    else { assert.throws(apply); assert.equal(persists, 0); assert.deepEqual(f.state, before); }
  }
});
