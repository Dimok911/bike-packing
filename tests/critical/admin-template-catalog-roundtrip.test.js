import test from "node:test";
import assert from "node:assert/strict";
import { normalizePublishedDemoTemplatePayload } from "../../src/public/demo-template-state.js";
import { importDemoStateAsEditableLayout } from "../../src/public/admin-demo-layout.js";
import { exportLayoutAsPublishedState, cleanPublishedEntityId } from "../../src/public/published-state-export.js";
import { projectAdminTemplateCopy } from "../../src/sync/admin-template-copy-projection.js";
import { projectAdminTemplateServerVariant, adminTemplateCopiedLayoutId } from "../../src/public/admin-template-server-variant.js";
import { createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const clone = structuredClone;

test("a confirmed causal copy keeps its server identities when projected into and exported from another editor", () => {
  const original = source(); original.layouts.main.arrangement = createLayoutArrangementFromCurrentState(original, ["root"]);
  const operationId = "11111111-1111-4111-8111-111111111111", metadata = { title: "Copied", description: "", language: "ru" };
  const copied = projectAdminTemplateCopy(original, operationId, metadata);
  const projection = projectAdminTemplateServerVariant({ id: "local-editor", adminSharedSourceId: "target" },
    { exists: true, deleted: false, payload: copied, metadata }, "22222222-2222-4222-8222-222222222222");
  assert.equal(adminTemplateCopiedLayoutId(copied), copied.activeLayoutId);
  assert.equal(projection.layout.sharedSourceId, copied.activeLayoutId); assert.equal(projection.layout.adminTemplateCopy, true);
  const state = { items: projection.items, containers: projection.containers, layouts: { "local-editor": { ...projection.layout, adminCausalSource: {} } } };
  const mappings = [];
  const exported = exportLayoutAsPublishedState(state, "local-editor", { clone, createLayoutArrangementFromCurrentState,
    preserveEntityIds: true, ensureLayoutDictionaries: value => value, normalizePublishedStatePayload: clone,
    stripPublishedPublicOriginMarkers: () => {}, onMappedEntity: row => mappings.push(row) });
  for (const type of ["items", "containers"]) {
    assert.deepEqual(Object.keys(exported[type]).sort(), Object.keys(copied[type]).sort());
    for (const row of mappings.filter(row => row.type === type)) {
      assert.equal(row.targetId, state[type][row.sourceId].sharedSourceId); assert.ok(copied[type][row.targetId]);
    }
  }
  for (const [id, row] of Object.entries(copied.items)) assert.equal(exported.items[id].containerId || "", row.containerId || "");
  for (const [id, row] of Object.entries(copied.containers)) {
    for (const field of ["childIds", "itemIds", "order"]) assert.deepEqual(exported.containers[id][field], row[field]);
  }
});

test("an explicit server identity is never stripped as a legacy editor prefix", () => {
  const row = { id: "local", sharedSourceId: "item-shared-original" };
  assert.equal(cleanPublishedEntityId("item", row, row.id, { preserveEntityIds: true }), "item-shared-original");
  assert.throws(() => cleanPublishedEntityId("item", { id: "unsafe/id" }, "", { preserveEntityIds: true }), /идентификатор/);
});

test("identity-preserving export blocks duplicate server identities instead of dropping or renaming a catalog record", () => {
  const state = source(); state.layouts.main.adminCausalSource = {};
  state.layouts.main.arrangement = createLayoutArrangementFromCurrentState(state, ["root"]);
  state.items.placed.sharedSourceId = "server-item";
  state.items.orphan.sharedSourceId = "server-item"; state.items.orphan.publicCatalogLayoutId = "main";
  assert.throws(() => exportLayoutAsPublishedState(state, "main", { clone, createLayoutArrangementFromCurrentState,
    preserveEntityIds: true, ensureLayoutDictionaries: value => value, normalizePublishedStatePayload: clone,
    stripPublishedPublicOriginMarkers: () => {} }), /идентификатор/);
});
const source = () => ({ layouts: { main: { id: "main", name: "Template", layoutOrder: 17, rootContainerIds: ["root"] } }, activeLayoutId: "main",
  containers: {
    root: { id: "root", parentId: null, childIds: [], itemIds: ["placed"], order: [{ type: "item", id: "placed" }] },
    detached: { id: "detached", parentId: null, childIds: ["nested"], itemIds: [], order: [{ type: "container", id: "nested" }] },
    nested: { id: "nested", parentId: "detached", childIds: [], itemIds: ["nestedItem"], order: [{ type: "item", id: "nestedItem" }] },
  }, items: { placed: { id: "placed", containerId: "root", name: "Placed" },
    orphan: { id: "orphan", containerId: "", name: "Orphan" }, nestedItem: { id: "nestedItem", containerId: "nested", name: "Nested" } },
  locations: ["Bike"], categories: ["Repair"], packedItems: {} });

test("administrative normalization preserves the entire catalog without changing the ordinary tree-only import", () => {
  const payload = source(), before = clone(payload);
  const normal = normalizePublishedDemoTemplatePayload(payload);
  assert.deepEqual(Object.keys(normal.containers), ["root"]); assert.deepEqual(Object.keys(normal.items), ["placed"]);
  const complete = normalizePublishedDemoTemplatePayload(payload, { preserveCatalog: true });
  assert.deepEqual(complete.containers, payload.containers); assert.deepEqual(complete.items, payload.items);
  assert.deepEqual(payload, before);
});

test("opening and exporting an admin demo retains detached trees, orphan items, relationships and target ownership", () => {
  const state = { containers: {}, items: { personal: { id: "personal", name: "Private unrelated" } }, layouts: {}, packedItems: {} };
  const layout = importDemoStateAsEditableLayout(state, source(), { preserveCatalog: true, activate: false, renderAfter: false,
    clone, normalizePublishedStatePayload: clone, normalizeDemoPayloadForLanguage: (payload, _language, options) => normalizePublishedDemoTemplatePayload(payload, options),
    normalizeUiLanguage: value => value, language: "ru", listId: "public-demo-state-a", currentDemoTemplate: () => null,
    normalizeDemoLayoutName: value => value, nowIso: () => "2026-09-10T00:00:00Z", currentCreateMeta: () => ({}),
    createLayoutArrangementFromCurrentState, normalizeDictionaryValues: values => values, saveState: () => {} });
  assert.equal(Object.keys(state.containers).length, 3); assert.equal(Object.keys(state.items).length, 4);
  assert.equal(layout.layoutOrder, 17);
  const detached = Object.values(state.containers).find(value => value.id.endsWith("-detached"));
  const nested = Object.values(state.containers).find(value => value.id.endsWith("-nested"));
  assert.equal(nested.parentId, detached.id); assert.deepEqual(detached.childIds, [nested.id]);
  assert.equal(layout.rootContainerIds.includes(detached.id), false);
  assert.ok(Object.values(state.items).filter(value => value.id !== "personal").every(value => value.publicCatalogLayoutId === layout.id));
  const exported = exportLayoutAsPublishedState(state, layout.id, { clone, createLayoutArrangementFromCurrentState,
    ensureLayoutDictionaries: value => value, normalizePublishedStatePayload: clone, stripPublishedPublicOriginMarkers: () => {} });
  assert.equal(Object.keys(exported.containers).length, 3); assert.equal(Object.keys(exported.items).length, 3);
  assert.equal(exported.layouts[exported.activeLayoutId].layoutOrder, 17);
  assert.equal(exported.containers["container-nested"].parentId, "container-detached");
  assert.deepEqual(exported.containers["container-detached"].order, [{ type: "container", id: "container-nested" }]);
  assert.equal(exported.items["item-orphan"].containerId, "");
  assert.equal(Object.values(exported.items).some(value => value.name === "Private unrelated"), false);
});

test("admin demo opening keeps arrangement quantities, packing flags and order instead of catalog defaults", () => {
  const payload = source(), original = clone(payload);
  payload.items.placed.quantity = 99;
  payload.layouts.main.arrangement = { rootContainerIds: ["root"],
    containers: { root: { parentId: "", itemIds: ["placed", "orphan"], childIds: [],
      order: [{ type: "item", id: "orphan" }, { type: "item", id: "placed" }] } },
    items: { placed: "root", orphan: "root" }, itemQuantities: { placed: 2, orphan: 3 },
    itemQuantityMigrationVersion: 3, packedItems: { placed: true } };
  const before = clone(payload), state = { containers: {}, items: {}, layouts: {}, packedItems: {} };
  const layout = importDemoStateAsEditableLayout(state, payload, { preserveCatalog: true, activate: false, renderAfter: false,
    clone, normalizePublishedStatePayload: clone, normalizeDemoPayloadForLanguage: (value, _language, options) => normalizePublishedDemoTemplatePayload(value, options),
    normalizeUiLanguage: value => value, language: "ru", listId: "public-demo-state-a", currentDemoTemplate: () => null,
    normalizeDemoLayoutName: value => value, nowIso: () => "2026-09-10T00:00:00Z", currentCreateMeta: () => ({}),
    createLayoutArrangementFromCurrentState, normalizeDictionaryValues: values => values, saveState: () => {} });
  const placed = Object.values(state.items).find(row => row.name === "Placed").id;
  const orphan = Object.values(state.items).find(row => row.name === "Orphan").id;
  const root = layout.arrangement.rootContainerIds[0];
  assert.equal(layout.arrangement.itemQuantities[placed], 2);
  assert.equal(layout.arrangement.itemQuantities[orphan], 3);
  assert.equal(layout.arrangement.items[orphan], root);
  assert.deepEqual(layout.arrangement.containers[root].order, [{ type: "item", id: orphan }, { type: "item", id: placed }]);
  assert.deepEqual(layout.arrangement.packedItems, { [placed]: true });
  assert.deepEqual(payload, before);
  const exported = exportLayoutAsPublishedState(state, layout.id, { clone, createLayoutArrangementFromCurrentState,
    ensureLayoutDictionaries: value => value, normalizePublishedStatePayload: clone, stripPublishedPublicOriginMarkers: () => {} });
  const exportedLayout = Object.values(exported.layouts)[0];
  assert.equal(exportedLayout.arrangement.itemQuantities["item-placed"], 2);
  assert.equal(exportedLayout.arrangement.itemQuantities["item-orphan"], 3);
  assert.equal(Object.keys(exported.containers).length, Object.keys(original.containers).length);
});
