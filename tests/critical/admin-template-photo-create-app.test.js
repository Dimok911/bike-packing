import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminPhotoCreateRecordInput } from "../fixtures/admin-template-photo-create-record-fixture.js";
import { prepareAdminTemplatePhotoCreateRecord } from "../../src/public/admin-template-photo-create-state.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoNamespace, adminTemplatePhotoEditorSnapshot } from "../../src/public/admin-template-photo-state.js";
import { adminPhotoCreateClientFixture } from "../fixtures/admin-template-photo-create-client-fixture.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplatePhotoPreservedEntityIds, captureAdminTemplatePhotoOwnerMap } from "../../src/sync/admin-template-photo-owner-map.js";
import { hydrateCausalAdminTemplateDrafts } from "../../src/public/admin-template-causal-hydration.js";
import { stripAdminTemplateEditorMetadata } from "../../src/public/admin-template-causal-save-flow.js";
import { assertAdminTemplatePhotoView } from "../../src/sync/admin-template-photo-view.js";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const tail = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
const clone = structuredClone;
function actual(text, names, deps) {
  const code = names.map(name => { const found = text.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
    assert.ok(found, name); return found[0]; }).join("\n");
  return new Function(...Object.keys(deps), `${code}\nreturn {${names.join(",")}};`)(...Object.values(deps));
}
async function fixture(type = "item") {
  const input = await adminPhotoCreateRecordInput({ entityType: type }), record = await prepareAdminTemplatePhotoCreateRecord(input);
  const state = clone(input.snapshot.beforeState), foreign = { id: "foreign", publicCatalogLayoutId: "other-admin", name: "Other draft", photos: [{ opaque: "keep" }] };
  state.items.private = { id: "private", name: "Personal unsaved", opaque: { retained: [2, 1] } };
  state.items.foreign = foreign; state.layouts["other-admin"] = { id: "other-admin", note: "unrelated" };
  const values = new Map([["mirror", JSON.stringify(state)], ["private-form", "unrelated chosen form"]]), controls = { quota: false, asyncMirror: false, writes: 0, notifications: 0 };
  const deps = { state, canonicalTemplateJson, clone, adminTemplatePhotoNamespace, adminTemplatePhotoEditorSnapshot,
    STORAGE_KEY: "mirror", localStorageScopeKey: `id:${record.binding.actorId}`, scopedLocalStorageKey: key => key,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => {
      if (controls.quota) throw new DOMException("Full", "QuotaExceededError"); values.set(key, value); } }, updateSyncUi() { controls.notifications++; } };
  // This fixture covers the retained synchronous localStorage mirror. Native
  // IndexedDB mirror persistence is covered separately by async storage tests.
  deps.readPersonalLocalValue = key => deps.localStorage.getItem(key);
  deps.ownsPersonalMirror = () => controls.asyncMirror;
  deps.writePersonalMirror = async (key, raw) => { controls.writes++; await Promise.resolve(); deps.localStorage.setItem(key, raw); };
  const api = actual(app, ["assertAdminTemplatePhotoCreateIds", "persistRequiredPersonalMirror", "persistAdminTemplatePhotoMirror", "applyAdminTemplatePhotoCreateCandidate", "applyAdminTemplatePhotoCreateArrangement"], deps);
  return { input, record, state, values, controls, api };
}

test("actual new item/bag candidate applies complete arrangement and edit metadata while preserving private and foreign drafts", async () => {
  for (const type of ["item", "container"]) {
    const f = await fixture(type), beforePrivate = clone(f.state.items.private), beforeForeign = clone(f.state.items.foreign);
    const layoutId = f.record.snapshot.layoutId; await f.api.applyAdminTemplatePhotoCreateCandidate(f.record);
    assert.deepEqual(f.state.layouts[layoutId].arrangement, f.record.snapshot.state.layouts[layoutId].arrangement);
    assert.deepEqual(f.state.layouts[layoutId].rootContainerIds, f.record.snapshot.state.layouts[layoutId].rootContainerIds);
    assert.equal(f.state.layouts[layoutId].updatedAt, f.record.snapshot.state.layouts[layoutId].updatedAt);
    assert.equal(f.state.layouts[layoutId].adminCausalSource.photoCreatePending, f.record.action.operationId);
    assert.deepEqual(f.state.items.private, beforePrivate); assert.deepEqual(f.state.items.foreign, beforeForeign);
    assert.equal(f.values.get("private-form"), "unrelated chosen form");
    const mirror = JSON.parse(f.values.get("mirror")); assert.deepEqual(mirror.items.private, beforePrivate); assert.deepEqual(mirror.items.foreign, beforeForeign);
    await f.api.applyAdminTemplatePhotoCreateCandidate(f.record);
    assert.equal(Object.values(f.state[type === "item" ? "items" : "containers"]).filter(row => row.id === f.record.snapshot.createdOwner.localId).length, 1);
  }
});

test("actual candidate refuses global local-ID collisions before changing live state or mirror", async () => {
  for (const kind of ["layouts", "items", "containers"]) {
    const f = await fixture(), id = f.record.snapshot.createdOwner.localId;
    f.state[kind][id] = { id, name: "Unrelated owner" }; const before = clone(f.state), mirror = f.values.get("mirror");
    await assert.rejects(f.api.applyAdminTemplatePhotoCreateCandidate(f.record), /идентификатор/i);
    assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror);
  }
});

test("actual mirror quota rolls back visible candidate while retaining the immutable create record and unrelated journals", async () => {
  const f = await fixture("container"), before = clone(f.state), record = clone(f.record.snapshot), values = new Map(f.values);
  f.controls.quota = true; await assert.rejects(f.api.applyAdminTemplatePhotoCreateCandidate(f.record), { name: "QuotaExceededError" });
  assert.deepEqual(f.state, before); assert.deepEqual(f.values, values); assert.deepEqual(f.record.snapshot, record);
  f.controls.quota = false; await f.api.applyAdminTemplatePhotoCreateCandidate(f.record);
  assert.ok(f.state.containers[f.record.snapshot.createdOwner.localId]);
});

test("another tab's changed selected namespace refuses receipt application without overwriting its mirror", async () => {
  const f = await fixture(), mirror = JSON.parse(f.values.get("mirror")), id = f.input.snapshot.ownerMap.owners.find(row => row.type === "items").localId;
  mirror.items[id].name = "New edit in another tab"; f.values.set("mirror", JSON.stringify(mirror));
  const before = clone(f.state), encoded = f.values.get("mirror");
  await assert.rejects(f.api.applyAdminTemplatePhotoCreateCandidate(f.record), /другой вкладке/);
  assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), encoded);
});

test("async owned-mirror rejection rolls back a new photo candidate and never announces durable success", async () => {
  const f = await fixture(), before = clone(f.state), mirror = f.values.get("mirror");
  f.controls.asyncMirror = true; f.controls.quota = true;
  await assert.rejects(f.api.applyAdminTemplatePhotoCreateCandidate(f.record), { name: "QuotaExceededError" });
  assert.equal(f.controls.writes, 1); assert.equal(f.controls.notifications, 0);
  assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror);
  f.controls.quota = false; await f.api.applyAdminTemplatePhotoCreateCandidate(f.record);
  assert.equal(f.controls.writes, 2); assert.equal(f.controls.notifications, 1);
  assert.equal(JSON.parse(f.values.get("mirror")).layouts[f.record.snapshot.layoutId].adminCausalSource.photoCreatePending, f.record.action.operationId);
});

test("actual canonical display application preserves full arrangement, opaque order fields and unrelated owner links", async () => {
  const f = await fixture(), id = f.input.snapshot.layoutId, layout = f.state.layouts[id];
  const bag = Object.keys(layout.arrangement.containers)[0];
  layout.arrangement.containers[bag].order[0].opaque = { keep: [3, 1] };
  f.state.items.private.containerId = "personal-bag";
  const arrangement = clone(layout.arrangement), privateRow = clone(f.state.items.private);
  f.api.applyAdminTemplatePhotoCreateArrangement(id, f.state);
  assert.deepEqual(layout.arrangement, arrangement); assert.deepEqual(f.state.containers[bag].order, arrangement.containers[bag].order);
  assert.deepEqual(f.state.items.private, privateRow);
});

test("actual canonical snapshot and dictionary adapters do not rebuild the confirmed arrangement or add legacy cleanup metadata", async () => {
  const f = await fixture(), layout = f.state.layouts[f.input.snapshot.layoutId], before = clone(layout);
  const forbidden = () => assert.fail("canonical view must not enter the legacy normalizer");
  const api = actual(app, ["captureActiveLayoutArrangement", "ensureLayoutDictionaries"], { state: f.state, applyingLayoutArrangement: false,
    ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: true, createLayoutArrangementFromCurrentState: forbidden, ensureLayoutDictionariesForState: forbidden,
    isGuestDemoCopyLayoutRecord: forbidden });
  api.captureActiveLayoutArrangement(); assert.equal(api.ensureLayoutDictionaries(layout), layout); assert.deepEqual(layout, before);
});

test("actual inverse canonical snapshot preserves all raw opaque fields and photos while mapping an explicit placement", async () => {
  const f = await fixture(), layoutId = f.input.snapshot.layoutId, layout = f.state.layouts[layoutId];
  layout.adminCausalSource.canonicalPayload = clone(f.input.snapshot.sourcePayload);
  const api = actual(app, ["adminTemplateCanonicalEditorSnapshot"], { state: f.state, clone, canonicalTemplateJson, assertAdminTemplatePhotoView,
    ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: true, normalizeUiLanguage: value => value, uiLanguage: "ru" });
  const before = clone(f.state), unchanged = api.adminTemplateCanonicalEditorSnapshot(layoutId);
  assert.deepEqual(unchanged.payload, f.input.snapshot.sourcePayload); assert.deepEqual(f.state, before);
  const item = f.input.snapshot.ownerMap.owners.find(row => row.type === "items"), bag = f.input.snapshot.ownerMap.owners.find(row => row.type === "containers");
  layout.arrangement.itemQuantities[item.localId] = 4;
  const changed = api.adminTemplateCanonicalEditorSnapshot(layoutId), expected = clone(f.input.snapshot.sourcePayload);
  Object.values(expected.layouts)[0].arrangement.itemQuantities[item.serverId] = 4;
  assert.deepEqual(changed.payload, expected); assert.deepEqual(f.state.items[item.localId].photos, before.items[item.localId].photos);
  layout.arrangement.packedItems[item.localId] = true;
  expected.layouts[Object.keys(expected.layouts)[0]].arrangement.packedItems[item.serverId] = true;
  expected.packedItems = { ...expected.packedItems, [item.serverId]: true };
  assert.deepEqual(api.adminTemplateCanonicalEditorSnapshot(layoutId).payload, expected);
  layout.adminCausalSource.canonicalPayload = clone(expected);
  delete layout.arrangement.packedItems[item.localId];
  delete expected.layouts[Object.keys(expected.layouts)[0]].arrangement.packedItems[item.serverId]; delete expected.packedItems[item.serverId];
  assert.deepEqual(api.adminTemplateCanonicalEditorSnapshot(layoutId).payload, expected);
  f.state.items.unmapped = { id: "unmapped", publicCatalogLayoutId: layoutId };
  assert.throws(() => api.adminTemplateCanonicalEditorSnapshot(layoutId), /сверки/); delete f.state.items.unmapped;
  f.state.containers[bag.localId].publicCatalogLayoutId = "foreign";
  assert.throws(() => api.adminTemplateCanonicalEditorSnapshot(layoutId), /сверки/);
});

test("actual inverse projection preserves distinct raw layout dictionary mirrors until the displayed dictionary changes", async () => {
  const f = await fixture(), layoutId = f.input.snapshot.layoutId, layout = f.state.layouts[layoutId];
  const raw = clone(f.input.snapshot.sourcePayload), sourceLayout = Object.values(raw.layouts)[0];
  sourceLayout.locations = ["Raw layout location"]; sourceLayout.categories = ["Raw layout category"];
  layout.adminCausalSource.canonicalPayload = raw;
  const api = actual(app, ["adminTemplateCanonicalEditorSnapshot"], { state: f.state, clone, canonicalTemplateJson, assertAdminTemplatePhotoView,
    ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: true, normalizeUiLanguage: value => value, uiLanguage: "ru" });
  assert.deepEqual(api.adminTemplateCanonicalEditorSnapshot(layoutId).payload, raw);
  layout.locations = ["Explicit edited location"];
  const changed = api.adminTemplateCanonicalEditorSnapshot(layoutId).payload;
  assert.deepEqual(changed.locations, layout.locations); assert.deepEqual(Object.values(changed.layouts)[0].locations, layout.locations);
  assert.deepEqual(Object.values(changed.layouts)[0].categories, sourceLayout.categories);
});

test("actual confirmed ordinary persist refreshes the same owner IDs and raw baseline atomically, including quota rollback", async () => {
  for (const failure of [false, "false", "throw"]) {
    const f = await fixture(), layoutId = f.input.snapshot.layoutId, layout = f.state.layouts[layoutId];
    const source = layout.adminCausalSource;
    source.canonicalPayload = clone(f.input.snapshot.sourcePayload); source.base.stateRevision++;
    source.lastConfirmedOperation = { id: "8e9402c2-c100-437b-aa39-000000000099", kind: "template.save" };
    delete layout.templateDraftSyncPending;
    const before = clone(f.state); let stored;
    const api = actual(app, ["adminTemplateCanonicalEditorSnapshot", "persistAdminTemplateCoordinatorState"], {
      state: f.state, clone, canonicalTemplateJson, assertAdminTemplatePhotoView, adminTemplatePhotoPreservedEntityIds, captureAdminTemplatePhotoOwnerMap,
      ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: true, normalizeUiLanguage: value => value, uiLanguage: "ru",
      persistStateSnapshot: value => { if (failure === "false") return false; if (failure === "throw") throw new DOMException("Quota", "QuotaExceededError"); stored = clone(value); return true; }
    });
    assert.equal(await api.persistAdminTemplateCoordinatorState(), !failure);
    if (failure) { assert.equal(layout.adminCausalSource, source); assert.deepEqual(f.state, before); assert.equal(stored, undefined); }
    else {
      assert.equal(layout.adminCausalSource.photoOwnerMap.stateRevision, source.base.stateRevision);
      assert.deepEqual(layout.adminCausalSource.photoOwnerMap.owners, source.photoOwnerMap.owners);
      assert.deepEqual(layout.adminCausalSource.canonicalPayload, f.input.snapshot.sourcePayload);
      assert.deepEqual(stored.layouts[layoutId].adminCausalSource, layout.adminCausalSource);
      const restored = clone(f.state); restored.layouts[layoutId].adminCausalSource = before.layouts[layoutId].adminCausalSource;
      assert.deepEqual(restored, before);
    }
  }
});

test("actual packed toggles and unpack-all preserve explicit intent without rebuilding any other arrangement fields", async () => {
  const f = await fixture(), layoutId = f.input.snapshot.layoutId, itemId = Object.keys(f.state.layouts[layoutId].arrangement.items)[0];
  const other = clone(f.state.layouts[layoutId].arrangement); delete other.packedItems;
  const api = actual(tail, ["togglePacked", "unpackAllItems"], { state: f.state, clone,
    adminTemplatePhotoCreateFormEnabled: () => true, warnLockedLayoutMutation: () => false, preparePersonalPlacementAction: () => null,
    capturePackingScroll() {}, nowIso: () => "2026-09-12T00:00:00Z", touchItem() {}, saveState() {}, render() {},
    localText: (_, ru) => ru, openConfirmDialog: options => options.onConfirm() });
  f.state.packedItems = {}; api.togglePacked(itemId);
  assert.deepEqual(f.state.layouts[layoutId].arrangement.packedItems, { [itemId]: true });
  api.unpackAllItems(); assert.deepEqual(f.state.layouts[layoutId].arrangement.packedItems, {});
  const rest = clone(f.state.layouts[layoutId].arrangement); delete rest.packedItems; assert.deepEqual(rest, other);
});

test("actual administrative new-form adapters do not read, remove or replace the personal draft keys", () => {
  const forbidden = () => assert.fail("personal draft storage must not be touched");
  const api = actual(tail, ["loadNewEntityFormDraft", "clearStoredNewEntityFormDraft", "persistNewItemFormDraft", "persistNewRootContainerFormDraft"], {
    adminTemplatePhotoCreateFormEnabled: () => true, adminTemplatePhotoCreateForms: { owns: () => false },
    newEntityFormDraftStorageKey: forbidden, clearNewEntityFormDraftTimer: forbidden, localStorage: { getItem: forbidden, removeItem: forbidden },
    syncNewEntityFormDraftCatalogCards: forbidden
  });
  assert.equal(api.loadNewEntityFormDraft("item"), null); api.clearStoredNewEntityFormDraft("container");
  assert.deepEqual(api.persistNewItemFormDraft(), { meaningful: false, saved: false });
  assert.deepEqual(api.persistNewRootContainerFormDraft(), { meaningful: false, saved: false });
});

test("actual client factory supplies a guarded binary reader when all photo dispatch gates are OFF", () => {
  const store = { marker: "guarded reader" }, staging = { marker: "disabled writer" }, context = { scope: "admin-template" };
  const api = actual(app, ["adminTemplateClient"], { ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED: false, ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED: false,
    ADMIN_TEMPLATE_PHOTO_REPLACE_ENABLED: false, ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: false, experimentTransport: {},
    adminTemplateUiEnabled: () => true, adminTemplateOperationContext: () => context,
    adminTemplatePhotoStore: () => store, createAdminTemplateClient: options => options,
    createAdminTemplatePhotoStaging: options => { assert.equal(options.store, store); assert.equal(options.enabled, false); assert.equal(options.createEnabled, false); return staging; } });
  const client = api.adminTemplateClient({ actorId: "admin" }, "layout", true);
  assert.equal(client.photoStore, store); assert.equal(client.photoStaging, staging);
  assert.equal(client.photoCreateEnabled, false); assert.equal(client.photoAppendEnabled, false);
});

test("actual administrative order reads retained terminal V7 through its IDB proof and still refuses queued V7", async () => {
  for (const committed of [false, true]) {
    const f = await adminPhotoCreateClientFixture(), active = f.make(); await active.plans.capturePhotoCreate(f.planInput);
    await active.client.capture(f.record.action); if (committed) await active.plans.run(f.id);
    const off = f.make({ photoAppendEnabled: false, photoCreateEnabled: false });
    const api = actual(app, ["openCausalAdminTemplateOrder"], { currentUser: { id: f.binding.actorId }, state: { layouts: {} },
      canonicalTemplateJson, adminTemplatePlansFor: () => off.plans,
      adminTemplateUiEnabled: () => true, administrativeSaveCoordinator: null, ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: false,
      adminTemplateOperationContext: () => f.current, adminTemplateClient: () => off.client, adminTemplatePhotoStore: () => f.store,
      adminTemplatePhotoCopyStore: () => null,
      adminTemplatePhotoTreeCopyInventory: async () => ({ records: [], journals: [] }),
      createAdminTemplateSavePlans: options => createAdminTemplateSavePlans({ ...options, storage: f.storage, locks: f.locks }),
      createAdminTemplateOrderBatch: options => ({ async open(targets) { await options.assertNoPending(f.binding); return { targets }; } }) });
    if (committed) assert.deepEqual((await api.openCausalAdminTemplateOrder([])).targets, []);
    else await assert.rejects(api.openCausalAdminTemplateOrder([]), /завершите сохранённое действие/);
    assert.equal(f.server.savePosts.length, committed ? 1 : 0);
  }
});


test("actual fresh background hydration retains its exact raw source before snapshot; later refresh preserves an unsaved draft", async () => {
  const f = await fixture(), layoutId = f.input.snapshot.layoutId, projected = clone(f.state.layouts[layoutId]);
  f.state.layouts = {};
  const binding = f.input.binding, prepared = { ok: true, ...binding, exists: true, deleted: false, visibility: "private", stateRevision: 7, indexes: [],
    metadata: f.input.snapshot.metadata, payload: f.input.snapshot.sourcePayload }, captured = [];
  const api = actual(app, ["rememberAdminTemplateSourceBaseline", "adminTemplateCanonicalEditorSnapshot"], {
    state: f.state, clone, canonicalTemplateJson, assertAdminTemplatePhotoView, stripAdminTemplateEditorMetadata,
    ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: true, normalizeUiLanguage: value => value, uiLanguage: "ru",
    adminTemplateEditorSnapshot: id => api.adminTemplateCanonicalEditorSnapshot(id),
    adminTemplateSourceBaseline: () => ({ capture: async (source, view) => { captured.push({ source: clone(source), view: clone(view) }); } })
  });
  const demo = binding.listId.startsWith("public-demo-state"), record = { publicTemplateKind: demo ? "demo" : "shared-layout",
    ...(demo ? { demoListId: binding.listId } : { sharedId: binding.listId.slice("public-shared-layout-".length) }),
    published: false, visibility: "private", adminPayloadEndpoint: "/old" };
  const opts = { getContext: () => ({ admin: true }), getLayouts: () => f.state.layouts, getBinding: () => binding,
    readCatalog: async () => ({ lists: [record] }), normalizeRecords: value => value, readTemplate: async () => prepared,
    materialize: () => (f.state.layouts[layoutId] = clone(projected)), rememberSource: api.rememberAdminTemplateSourceBaseline };
  assert.equal((await hydrateCausalAdminTemplateDrafts(opts)).restored, 1);
  assert.deepEqual(f.state.layouts[layoutId].adminCausalSource.canonicalPayload, prepared.payload);
  assert.deepEqual(captured[0].view.payload, prepared.payload);
  f.state.layouts[layoutId].note = "Unsent draft"; const before = clone(f.state);
  assert.equal((await hydrateCausalAdminTemplateDrafts(opts)).restored, 0);
  assert.deepEqual(f.state, before); assert.equal(captured.length, 1);
});
