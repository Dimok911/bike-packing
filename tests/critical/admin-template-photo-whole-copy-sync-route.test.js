import test from "node:test";
import assert from "node:assert/strict";
import { wholeAppRunnerFixture } from "../fixtures/admin-template-photo-whole-copy-runner-fixture.js";

async function fixture({ empty = false, afterDiscovery = null } = {}) {
  const f = await wholeAppRunnerFixture(), dialogs = [], fallback = [];
  f.values.delete(f.planKey); if (empty) f.idb.rows().clear();
  for (const name of ["whole", "copy", "create", "append"]) f.flags[name] = false;
  assert.equal(f.state.layouts[f.layoutId].adminCausalSource.planId, null);
  const forbidden = name => () => assert.fail("Unexpected synchronization effect: " + name);
  const deps = Object.fromEntries(["activeReadOnlyLayoutId", "checkAdminApiCompatibility", "checkAuthAndLoad", "checkRemoteStateFreshness",
    "clearStaleDirtyFlagIfNoLocalChanges", "currentPublicTemplateStatusMessage", "flushActivePublishedEditSave", "handleAuthButton",
    "isAdminUser", "isDemoPublicTemplateMissing", "isForcedOffline", "isOfflineRememberedSession", "isReadOnlyStateScope",
    "loadRemoteState", "offerLoadServerForTruncatedLocalState", "openAdminDemoLayout", "openSharedLayoutForAdmin",
    "preferredCurrentLayoutRef", "refreshActiveReadOnlyPublicTemplate", "savePublishedLayoutRecord", "saveRemoteState",
    "saveSyncMeta", "uploadPendingPhotos"].map(name => [name, forbidden(name)]));
  Object.assign(deps, {
    modeState: f.modeState, currentUser: { id: f.current.actorId }, administrativeSaveCoordinator: null,
    getPublishedEditLayoutId: () => f.modeState.adminPublishedEditLayoutId,
    isAdminPublicEditScope: () => f.current.scope === "admin-template", canOpenAdminPublishedEdit: () => f.current.admin,
    isAdminEditablePublishedLayout: id => Boolean(f.state.layouts[id]?.adminCausalSource),
    personalSavePilotEnabled: () => false, isReadOnlyBikePackingContext: () => false,
    activeDemoTemplateListId: "", appUnlocked: true, publishedLayoutSaveLayoutId: "", publishedLayoutSaveTimer: null,
    syncMeta: {}, syncTimer: null, DEMO_SHARED_LAYOUT_ID: "unused", nowIso: () => "2026-09-16T12:00:00Z",
    showToast: forbidden("toast"), updateSyncUi: forbidden("status"),
    showAdminTemplateRecovery: async layoutId => { dialogs.push(layoutId); return { recovery: layoutId }; },
    runSyncNowFlow: async (args, options) => {
      assert.equal(args.runtime.state, f.state); fallback.push({ force: Boolean(options.force) }); return "normal-sync";
    }
  });
  const actualFind = f.build().findAdminTemplatePhotoWholeCopyFormRecord;
  const api = f.build({ names: ["runSyncNow", "findAdminTemplatePhotoTreeCopyFormRecord"], deps,
    ...(afterDiscovery ? { replace: { findAdminTemplatePhotoWholeCopyFormRecord: async (...args) => {
      const record = await actualFind(...args); afterDiscovery(f, record); return record;
    } } } : {}) });
  return { ...f, api, dialogs, fallback };
}

test("actual forced Sync discovers record-only whole copy without planId with all photo writers OFF", async () => {
  const f = await fixture(), before = structuredClone(f.state), rows = structuredClone([...f.idb.rows()]);
  assert.deepEqual(await f.api.runSyncNow({ force: true }), { recovery: f.layoutId });
  assert.deepEqual(f.dialogs, [f.layoutId]); assert.deepEqual(f.fallback, []);
  assert.deepEqual(f.state, before); assert.deepEqual([...f.idb.rows()], rows);
  assert.equal(f.values.has(f.planKey), false); assert.equal(f.server.calls.length, 0);
});

test("actual forced Sync refuses a context switch after complete asynchronous whole-copy discovery", async () => {
  const f = await fixture({ afterDiscovery(value, record) {
    assert.equal(record.action.operationId, value.id); value.modeState.adminPublishedEditLayoutId = "private";
  } });
  await assert.rejects(f.api.runSyncNow({ force: true }), /Контекст восстановления копии изменился/);
  assert.deepEqual(f.dialogs, []); assert.deepEqual(f.fallback, []);
  assert.equal(f.values.has(f.planKey), false); assert.equal(f.server.calls.length, 0);
  assert.deepEqual(await f.store.read(f.id), f.record);
});

test("actual forced Sync with no whole or tree copy keeps its ordinary route", async () => {
  const f = await fixture({ empty: true });
  assert.equal(await f.api.runSyncNow({ force: true }), "normal-sync");
  assert.deepEqual(f.dialogs, []); assert.deepEqual(f.fallback, [{ force: true }]);
  assert.equal(f.values.has(f.planKey), false); assert.equal(f.idb.rows().size, 0); assert.equal(f.server.calls.length, 0);
});
