import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { personalPublicImportSnapshot } from "../../src/sync/personal-public-import-snapshot.js";
import { personalGuestBusinessPayload } from "../../src/sync/personal-guest-import-plan.js";
import { recoverPersonalAdminDrafts, personalPayloadWithoutAdminDrafts } from "../../src/sync/personal-admin-draft-recovery.js";
import { installRuntimeActiveLayoutId } from "../../src/state/active-layout-runtime.js";

const options = { scopeKey: "id:admin-a", enabled: true };

function actualRestore(state) {
  const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8")
    .match(/function restorePublicCopyBusinessView\([^]*?\n\}/)[0];
  const deps = { state, personalPublicImportSnapshot, recoverPersonalAdminDrafts, personalPayloadWithoutAdminDrafts,
    localStorageScopeKey: options.scopeKey, adminTemplateUiEnabled: () => true, installRuntimeActiveLayoutId };
  return new Function(...Object.keys(deps), `return (${source});`)(...Object.values(deps));
}

function fixture() {
  const payload = { items: { personal: { id: "personal", name: "Exact private item", custom: { ordered: [3, 1, 2] },
    photos: [{ id: "existing", url: "https://example.test/original.png", fileName: "Keep.png", metadata: { credit: "Original" } }] } },
  containers: { privateBag: { id: "privateBag", name: "Exact private bag", photos: [], unknown: { keep: true } } },
  layouts: { personal: { id: "personal", rootContainerIds: ["privateBag"], unknown: { ordered: [2, 1] },
    arrangement: { rootContainerIds: ["privateBag"], containers: { privateBag: { parentId: "", childIds: [], itemIds: ["personal"],
      order: [{ type: "item", id: "personal" }], custom: "Exact placement" } }, items: { personal: "privateBag" },
    itemQuantities: { personal: 7 }, packedItems: { personal: true } } } },
  locations: ["Unsorted", "A", "Unsorted"], categories: ["Tools", "Unlisted"], unknown: { exact: [4, 3] },
  activeLayoutId: "personal", packedItems: {} };
  const state = structuredClone(payload);
  state.items.personal.name = "Normalized stale name"; state.items.personal.containerId = "privateBag";
  state.items.personal.photos = [];
  state.items.deletedPersonal = { id: "deletedPersonal", name: "Must not return" };
  state.layouts.personal.arrangement.itemQuantities.personal = 1;
  state.layouts.personal.arrangement.packedItems = {};
  state.locations = ["Normalized dictionary"]; state.categories = [];
  state.showItemMeta = true;
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-demo-state-ui", itemKey: "demo-state:ui" };
  const operationId = "12345678-1234-4234-8234-123456789abc";
  state.layouts.admin = { id: "admin", adminDemo: true, adminDemoListId: binding.listId, templateDraftSyncPending: true,
    rootContainerIds: ["adminBag"], arrangement: { rootContainerIds: ["adminBag"], containers: { adminBag: { parentId: "", childIds: [],
      itemIds: ["adminItem"], order: [{ type: "item", id: "adminItem" }] } }, items: { adminItem: "adminBag" },
    itemQuantities: { adminItem: 2 }, packedItems: {} },
    adminCausalSource: { version: 1, binding, exists: true, visibility: "private", base: { operationId }, planId: operationId } };
  state.containers.adminBag = { id: "adminBag", publicCatalogLayoutId: "admin", itemIds: ["adminItem"] };
  state.items.adminItem = { id: "adminItem", name: "Pending administrator edit", publicCatalogLayoutId: "admin" };
  state.items.detached = { id: "detached", name: "Unplaced administrator edit", publicCatalogLayoutId: "admin" };
  return { payload, state };
}

for (const mixed of [false, true]) test(`actual public business restore preserves pending admin drafts from ${mixed ? "mixed cold" : "private copy"} snapshot`, () => {
  const { payload, state } = fixture(), before = structuredClone(state);
  const input = mixed ? recoverPersonalAdminDrafts(payload, JSON.stringify(state), options) : structuredClone(payload);
  if (mixed) input.items.adminItem.name = "Older embedded administrative snapshot";
  const original = structuredClone(input);
  actualRestore(state)(input);
  const privateResult = personalPayloadWithoutAdminDrafts(state, options);
  assert.deepEqual(personalGuestBusinessPayload(privateResult), personalGuestBusinessPayload(payload));
  assert.deepEqual(state.layouts.admin, before.layouts.admin);
  assert.deepEqual(state.items.adminItem, before.items.adminItem);
  assert.deepEqual(state.items.detached, before.items.detached);
  assert.deepEqual(state.containers.adminBag, before.containers.adminBag);
  assert.equal(state.items.deletedPersonal, undefined);
  assert.equal(state.activeLayoutId, "personal"); assert.equal(state.showItemMeta, true);
  assert.deepEqual(input, original);
  state.items.adminItem.name = "Later editor mutation"; assert.deepEqual(input, original);
});

test("actual public business restore rejects foreign origins and invalid ownership before changing the editor", () => {
  for (const corrupt of ["foreign", "private-link"]) {
    const { payload, state } = fixture();
    const input = recoverPersonalAdminDrafts(payload, JSON.stringify(state), options);
    if (corrupt === "foreign") input.layouts.admin.adminCausalSource.binding.actorId = "other";
    else input.containers.adminBag.itemIds.push("personal");
    const before = structuredClone({ input, state });
    assert.throws(() => actualRestore(state)(input));
    assert.deepEqual({ input, state }, before);
  }
});
