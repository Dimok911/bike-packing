import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { personalBusinessPayload } from "../../src/sync/personal-server-payload.js";
import { personalBusinessPayloadMatchesConfirmed } from "../../src/sync/personal-confirmed-business-equality.js";
import { recoverPersonalAdminDrafts } from "../../src/sync/personal-admin-draft-recovery.js";
import { personalSnapshotWithUiPreferences } from "../../src/sync/personal-snapshot-codec.js";
import { cloneStateForSyncPayload } from "../../src/sync/serialize.js";
import { adminTemplateSavePlan } from "../../src/sync/admin-template-save-plan.js";
import { normalizeCollectionModeState } from "../../src/state/collection-mode.js";
import { normalizeContainerFields, normalizeItemFields, normalizeItemCategories,
  migrateContainerOrder, applyDefaultCollapsedContainers } from "../../src/state/normalize.js";
import { ensureItemDisplayModeState } from "../../src/ui/item-display-mode.js";
import { cleanupGeneratedCatalogArtifacts } from "../../src/state/cleanup.js";
import { repairContainerMembershipFromItemLinks } from "../../src/state/repair.js";
import { normalizeLayoutFields, normalizeLayoutArrangement } from "../../src/state/layout-normalize.js";
import { isLayoutFreeNewAccountState } from "../../src/public/new-account-demo-seed.js";
import { isolateLinkedLayoutEntities, rememberLayoutEntityRepairBaseState } from "../../src/state/layout-entity-isolation.js";
import { applyLayoutArrangementToState } from "../../src/state/layout-arrangement.js";
import { normalizeRemotePhotoUrl } from "../../src/sync/photos.js";

const clone = value => structuredClone(value), listId = "list-a";
const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
function appFunction(name, dependencies) {
  const source = appSource.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
  assert.ok(source, `actual ${name} exists`);
  return new Function(...Object.keys(dependencies), `return (${source});`)(...Object.values(dependencies));
}
// The actual app normalizer calls its actual pure state helpers. Only the tiny
// UI wrapper around applyLayoutArrangementToState is omitted (its busy flag).
const normalizeRemoteState = appFunction("normalizeRemoteState", { normalizeCollectionModeState,
  normalizeContainerFields, normalizeItemFields, normalizeItemCategories, migrateContainerOrder,
  applyDefaultCollapsedContainers, ensureItemDisplayModeState, cleanupGeneratedCatalogArtifacts,
  repairContainerMembershipFromItemLinks, normalizeLayoutFields, isLayoutFreeNewAccountState,
  isolateLinkedLayoutEntities, rememberLayoutEntityRepairBaseState,
  applyLayoutArrangement: (id, state) => applyLayoutArrangementToState(state, id, {
    migrateContainerOrder, normalizeLayoutArrangement, repairContainerMembershipFromItemLinks }) });
function makeSnapshot({ state, normalize = normalizeRemoteState, enabled = true, scopeKey = "id:admin-a" } = {}) {
  return appFunction("personalOrdinaryRecoveredSnapshot", { personalBusinessPayload,
    personalBusinessPayloadMatchesConfirmed, recoverPersonalAdminDrafts, personalSnapshotWithUiPreferences,
    cloneStateForSync: cloneStateForSyncPayload, normalizeRemoteState: normalize,
    currentPackingListId: listId, PERSONAL_LEGACY_PHOTO_PRESERVATION_ENABLED: enabled,
    state, localStorageScopeKey: scopeKey, adminTemplateUiEnabled: () => true });
}
function fixture() {
  const photo = { id: "old-photo", status: "synced", listId: "", width: 800, height: 600,
    updatedAt: "2026-09-14T00:00:00.000Z",
    url: `https://api.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/${listId}/photos/old-photo/file?size=original`,
    thumbUrl: `https://experiment.vniipo-help.ru/letters-vniipo/api/bike-packing/lists/${listId}/photos/old-photo/thumb?size=small` };
  const seed = { items: { item: { id: "item", name: "Server item", weight: 120, quantity: 1, category: "Tools" } },
    containers: { bag: { id: "bag", name: "Server bag", weight: 300, location: "Bike", photos: [photo] } },
    layouts: { personal: { id: "personal", name: "Personal", rootContainerIds: ["bag"], arrangement: {
      rootContainerIds: ["bag"], containers: { bag: { parentId: "", itemIds: ["item"], childIds: [], order: [{ type: "item", id: "item" }] } },
      items: { item: "bag" }, itemQuantities: { item: 3 }, itemQuantityMigrationVersion: 3, packedItems: { item: true } } } },
    activeLayoutId: "personal", locations: ["Bike"], categories: ["Tools"], customSetting: { opaque: [1, null, "preserve"] } };
  const normalized = normalizeRemoteState(seed, { repairCatalog: false });
  const payload = personalBusinessPayload(cloneStateForSyncPayload(normalized, { forSync: true }));
  // The server legitimately retains old route aliases; the action/raw baseline
  // keeps these bytes even though rendering/serialization uses the active API.
  payload.containers.bag.photos[0] = clone(photo);
  const previous = { ...clone(normalized), activeLayoutId: "personal", showItemMeta: true,
    showFilterContext: true, showOnlyUnpacked: true, collapsedContainers: { bag: true }, itemDisplayMode: "compact" };
  const state = clone(previous); state.items.item.name = "Stale local mirror";
  return { payload, previous, state };
}

test("actual normalizer and serializer accept only approved legacy route aliases while retaining raw payload and UI", () => {
  const f = fixture(), before = clone(f), make = makeSnapshot(f);
  const result = make(f.payload, f.previous);
  assert.equal(result.items.item.name, "Server item");
  assert.equal(result.layouts.personal.arrangement.itemQuantities.item, 3);
  assert.equal(result.layouts.personal.arrangement.packedItems.item, true);
  assert.deepEqual(result.customSetting, f.payload.customSetting);
  for (const key of ["activeLayoutId", "showItemMeta", "showFilterContext", "showOnlyUnpacked", "collapsedContainers", "itemDisplayMode"])
    assert.deepEqual(result[key], f.previous[key]);
  const serialized = cloneStateForSyncPayload(result, { forSync: true });
  assert.equal(serialized.containers.bag.photos[0].url, normalizeRemotePhotoUrl(f.payload.containers.bag.photos[0].url));
  assert.notEqual(serialized.containers.bag.photos[0].thumbUrl, f.payload.containers.bag.photos[0].thumbUrl);
  assert.equal(personalBusinessPayloadMatchesConfirmed({ confirmedPayload: f.payload, candidatePayload: serialized, listId, allowLegacy: true }), true);
  assert.deepEqual(f, before, "raw baseline, prior UI and stale local source remain untouched");
  result.containers.bag.photos[0].width = 1; assert.deepEqual(f, before);
});

test("OFF gate does not silently accept route normalization", () => {
  const f = fixture(); assert.throws(() => makeSnapshot({ ...f, enabled: false })(f.payload, f.previous), /проверки структуры/);
});

test("mixed causal photos keep exact fields and cannot use the legacy alias exception", () => {
  const f = fixture(), causal = { id: "causal", photoId: "causal", assetId: "05c59e77-bd27-42bf-879f-83bfa3b27ab5", listId,
    status: "synced", url: "https://example.test/file", thumbUrl: "https://example.test/thumb", fileName: "photo.jpg",
    type: "image/jpeg", size: 10, width: 1, height: 1 };
  f.payload.items.item.photos = [clone(causal)];
  const result = makeSnapshot(f)(f.payload, f.previous);
  assert.deepEqual(cloneStateForSyncPayload(result, { forSync: true }).items.item.photos, [causal]);
  for (const mutate of [photo => { photo.url += "?changed"; }, photo => { photo.fileName = "changed.jpg"; }, photo => { delete photo.assetId; }]) {
    const normalize = (value, options) => { const result = normalizeRemoteState(value, options); mutate(result.items.item.photos[0]); return result; };
    assert.throws(() => makeSnapshot({ ...f, normalize })(f.payload, f.previous), /структур/);
  }
  assert.deepEqual(f.payload.items.item.photos, [causal]);
});

for (const [name, mutate] of [
  ["missing owner", value => { delete value.containers.bag; }],
  ["added owner", value => { value.items.added = { id: "added", name: "Invented", weight: 1 }; }],
  ["edited business field", value => { value.items.item.name = "Normalizer edit"; }],
  ["changed quantity", value => { value.layouts.personal.arrangement.itemQuantities.item = 1; }],
  ["removed placement", value => { delete value.layouts.personal.arrangement.items.item; }],
  ["changed packed state", value => { value.packedItems.item = false; value.layouts.personal.arrangement.packedItems = {}; }],
  ["missing layout", value => { delete value.layouts.personal; }],
  ["added layout", value => { value.layouts.extra = clone(value.layouts.personal); value.layouts.extra.id = "extra"; }],
  ["changed dictionary", value => { value.categories = []; }],
  ["missing opaque metadata", value => { delete value.customSetting; }],
  ["changed photo metadata", value => { value.containers.bag.photos[0].width++; }],
  ["changed photo query", value => { value.containers.bag.photos[0].url += "&changed=1"; }],
  ["changed photo identity", value => { value.containers.bag.photos[0].id = "another"; }]
]) test(`actual recovered snapshot rejects normalization producing ${name}`, () => {
  const f = fixture(), before = clone(f);
  const normalize = (value, options) => { const normalized = normalizeRemoteState(value, options); mutate(normalized); return normalized; };
  assert.throws(() => makeSnapshot({ ...f, normalize })(f.payload, f.previous), /проверки структуры/);
  assert.deepEqual(f, before);
});

for (const [name, mutate] of [
  ["non-number weight", payload => { payload.items.item.weight = "120 grams"; }],
  ["missing required owner field", payload => { delete payload.containers.bag.volume; }],
  ["dangling placement", payload => { payload.layouts.personal.arrangement.items.ghost = "bag"; }],
  ["foreign photo list", payload => { payload.containers.bag.photos[0].listId = "other-list"; }],
  ["unapproved photo host", payload => { payload.containers.bag.photos[0].url = payload.containers.bag.photos[0].url.replace("api.vniipo-help.ru", "unapproved.example"); }]
]) test(`real normalizer cannot repair raw server ${name} without stopping`, () => {
  const f = fixture(); mutate(f.payload); const before = clone(f);
  assert.throws(() => makeSnapshot(f)(f.payload, f.previous), /структур/);
  assert.deepEqual(f, before);
});

test("actual recovered snapshot preserves the current actor's administrative draft and immutable plan without restoring stale private data", () => {
  const f = fixture();
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-demo-state-ui", itemKey: "demo-state:ui" };
  const payload = { items: { adminItem: { id: "adminItem", name: "Draft" } }, containers: {},
    layouts: { admin: { id: "admin", rootContainerIds: [], arrangement: {
      rootContainerIds: [], containers: {}, items: { adminItem: "" }, itemQuantities: { adminItem: 1 }, packedItems: {} } } } };
  const plan = adminTemplateSavePlan({ binding, operationId: "12345678-1234-4234-8234-123456789abc", exists: true,
    visibility: "private", base: { stateRevision: 7 }, payload, metadata: { title: "Admin draft", description: "", language: "ru" } });
  f.state.items.adminItem = { ...payload.items.adminItem, publicCatalogLayoutId: "admin" };
  f.state.layouts.admin = { ...clone(payload.layouts.admin), adminDemo: true, adminDemoListId: binding.listId,
    adminCausalSource: { version: 1, binding, base: { stateRevision: 7 }, planId: null }, templateDraftSyncPending: true, adminCausalCopyPlan: plan };
  f.state.items.deletedLocal = { id: "deletedLocal", name: "Do not revive" };
  f.state.layouts.foreign = { id: "foreign", adminDemo: true, adminDemoListId: "public-demo-state-other",
    adminCausalSource: { version: 1, binding: { ...binding, actorId: "other", listId: "public-demo-state-other", itemKey: "demo-state:other" },
      base: { stateRevision: 9 }, planId: null } };
  f.state.items.foreign = { id: "foreign", publicCatalogLayoutId: "foreign" };
  const before = clone(f), result = makeSnapshot(f)(f.payload, f.previous);
  assert.deepEqual(result.layouts.admin, f.state.layouts.admin);
  assert.deepEqual(result.items.adminItem, f.state.items.adminItem);
  assert.equal(result.items.item.name, "Server item"); assert.equal(result.items.deletedLocal, undefined);
  assert.equal(result.layouts.foreign, undefined); assert.equal(result.items.foreign, undefined);
  assert.deepEqual(result.layouts.admin.adminCausalCopyPlan, plan); assert.deepEqual(f, before);
  result.layouts.admin.adminCausalCopyPlan.operations[0].body.payload.items.adminItem.name = "Detached returned plan";
  assert.deepEqual(f, before);
});
