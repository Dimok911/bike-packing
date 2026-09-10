import test from "node:test";
import assert from "node:assert/strict";
import { normalizePublishedDemoTemplatePayload } from "../../src/public/demo-template-state.js";
import { importDemoStateAsEditableLayout } from "../../src/public/admin-demo-layout.js";
import { exportLayoutAsPublishedState } from "../../src/public/published-state-export.js";
import { createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";

const clone = structuredClone;
const source = () => ({ layouts: { main: { id: "main", name: "Template", rootContainerIds: ["root"] } }, activeLayoutId: "main",
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
  const detached = Object.values(state.containers).find(value => value.id.endsWith("-detached"));
  const nested = Object.values(state.containers).find(value => value.id.endsWith("-nested"));
  assert.equal(nested.parentId, detached.id); assert.deepEqual(detached.childIds, [nested.id]);
  assert.equal(layout.rootContainerIds.includes(detached.id), false);
  assert.ok(Object.values(state.items).filter(value => value.id !== "personal").every(value => value.publicCatalogLayoutId === layout.id));
  const exported = exportLayoutAsPublishedState(state, layout.id, { clone, createLayoutArrangementFromCurrentState,
    ensureLayoutDictionaries: value => value, normalizePublishedStatePayload: clone, stripPublishedPublicOriginMarkers: () => {} });
  assert.equal(Object.keys(exported.containers).length, 3); assert.equal(Object.keys(exported.items).length, 3);
  assert.equal(exported.containers["container-nested"].parentId, "container-detached");
  assert.deepEqual(exported.containers["container-detached"].order, [{ type: "container", id: "container-nested" }]);
  assert.equal(exported.items["item-orphan"].containerId, "");
  assert.equal(Object.values(exported.items).some(value => value.name === "Private unrelated"), false);
});
