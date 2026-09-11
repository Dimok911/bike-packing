import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  solidifyManagedTemplateDrafts as solidifyManagedTemplateDraftsForState,
  solidifyTemplateDraftLayout as solidifyTemplateDraftLayoutForState
} from "../../src/state/layout-draft-solidify.js";
import { snapshotContainerTreeFromLiveState } from "../../src/state/container-tree-snapshot.js";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const names = ["hasOwnedAdminTemplatePhotoEditor", "solidifyTemplateDraftLayout", "solidifyManagedTemplateDrafts"];
const source = names.map(name => {
  const match = app.match(new RegExp("function " + name + "\\([^]*?\\n\\}"));
  assert.ok(match, "Actual application function " + name + " is available");
  return match[0];
}).join("\n");

function fixture({ enabled = true, actor = "admin-a", pending = false } = {}) {
  const arrangement = prefix => ({
    rootContainerIds: [prefix + "-bag"],
    containers: { [prefix + "-bag"]: {
      parentId: "", itemIds: [prefix + "-item"], childIds: [], order: [{ type: "item", id: prefix + "-item" }]
    } },
    items: { [prefix + "-item"]: prefix + "-bag" },
    itemQuantities: { [prefix + "-item"]: 2 }, packedItems: { [prefix + "-item"]: true },
    itemQuantityMigrationVersion: 3, unknownBusinessField: { exact: [3, 1, 2] }
  });
  const operationId = "c89b223d-02c8-4f86-86bd-c2387db7ec51";
  const state = {
    activeLayoutId: "personal", packedItems: {},
    locations: ["Private location"], categories: ["Private category"],
    layouts: {
      personal: { id: "personal", name: "Private list",
        rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {} } },
      causal: { id: "causal", adminDemo: true, adminDemoListId: "public-demo-state-ui",
        rootContainerIds: ["causal-bag"], arrangement: arrangement("causal"),
        adminCausalSource: { version: 1,
          binding: { environment: "bike-packing-experiment", actorId: actor, listId: "public-demo-state-ui", itemKey: "demo-state:ui" },
          base: pending ? { operationId } : { stateRevision: 7 }, planId: pending ? operationId : null,
          ...(pending ? { photoAppendPending: operationId } : {}) } },
      legacy: { id: "legacy", adminDemo: true, rootContainerIds: ["legacy-bag"], arrangement: arrangement("legacy") }
    },
    items: { private: { id: "private", name: "Unchanged private item", categories: ["Private category"] } },
    containers: {}
  };
  for (const prefix of ["causal", "legacy"]) {
    state.items[prefix + "-item"] = { id: prefix + "-item", name: prefix + " item", quantity: 1,
      containerId: prefix + "-bag", publicCatalogLayoutId: prefix };
    state.containers[prefix + "-bag"] = { id: prefix + "-bag", parentId: "",
      itemIds: [prefix + "-item"], childIds: [], order: [{ type: "item", id: prefix + "-item" }], publicCatalogLayoutId: prefix };
  }
  state.containers.detachedBag = { id: "detachedBag", parentId: "", publicCatalogLayoutId: "causal",
    itemIds: ["detachedItem"], childIds: [], order: [{ type: "item", id: "detachedItem" }], unknown: { untouched: true } };
  state.items.detachedItem = { id: "detachedItem", containerId: "detachedBag", publicCatalogLayoutId: "causal",
    name: "Detached administrative item", quantity: 4, photos: [{ id: "legacy-photo", metadata: { exact: [2, 1, 3] } }] };
  const deps = { state, ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED: enabled, localStorageScopeKey: "id:admin-a",
    solidifyManagedTemplateDraftsForState, solidifyTemplateDraftLayoutForState, snapshotContainerTreeFromLiveState };
  const actual = new Function(...Object.keys(deps), source + "\nreturn { " + names.join(", ") + " };")(...Object.values(deps));
  return { state, actual };
}

function causalNamespace(state) {
  return JSON.stringify({
    layout: state.layouts.causal,
    items: Object.fromEntries(Object.entries(state.items).filter(([, row]) => row.publicCatalogLayoutId === "causal")),
    containers: Object.fromEntries(Object.entries(state.containers).filter(([, row]) => row.publicCatalogLayoutId === "causal"))
  });
}

for (const pending of [false, true]) test("actual bulk solidification preserves the inactive " + (pending ? "pending" : "confirmed") + " causal namespace and still repairs legacy drafts", () => {
  const { state, actual } = fixture({ pending }), before = causalNamespace(state), privateLayout = structuredClone(state.layouts.personal);
  const privateItem = structuredClone(state.items.private), legacyBefore = structuredClone(state.layouts.legacy.arrangement);
  assert.equal(actual.solidifyManagedTemplateDrafts(), true);
  assert.equal(causalNamespace(state), before);
  assert.deepEqual(state.layouts.causal.arrangement.packedItems, { "causal-item": true });
  assert.deepEqual(state.layouts.personal, privateLayout); assert.deepEqual(state.items.private, privateItem);
  assert.deepEqual(state.packedItems, {}); assert.deepEqual(state.locations, ["Private location"]);
  assert.notDeepEqual(state.layouts.legacy.arrangement, legacyBefore);
  assert.deepEqual(state.layouts.legacy.arrangement.items, { "legacy-item": "legacy-bag" });
  assert.deepEqual(state.layouts.legacy.arrangement.packedItems, {});
  assert.equal(Object.hasOwn(state.layouts.legacy.arrangement, "unknownBusinessField"), false);
});

test("the actual individual wrapper preserves causal mutations and retains the legacy return behavior", () => {
  const { state, actual } = fixture({ pending: true }), before = causalNamespace(state);
  assert.equal(actual.solidifyTemplateDraftLayout("causal"), false);
  assert.equal(causalNamespace(state), before); assert.deepEqual(state.packedItems, {});
  assert.equal(actual.solidifyTemplateDraftLayout("legacy"), true);
  assert.deepEqual(state.layouts.legacy.arrangement.packedItems, {});
  assert.equal(actual.solidifyTemplateDraftLayout("personal"), false);
  assert.equal(actual.solidifyTemplateDraftLayout("missing"), false);
});

test("the actual wrappers keep their existing behavior when disabled or outside the current account", () => {
  for (const options of [{ enabled: false }, { actor: "another-admin" }]) {
    for (const method of ["solidifyManagedTemplateDrafts", "solidifyTemplateDraftLayout"]) {
      const { state, actual } = fixture(options), before = causalNamespace(state);
      assert.equal(actual[method]("causal"), true);
      assert.notEqual(causalNamespace(state), before);
      assert.deepEqual(state.layouts.causal.arrangement.packedItems, {});
    }
  }
});
