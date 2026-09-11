import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicEntityFixture } from "./personal-public-entity-fixture.js";
import { adminTemplateSavePlan } from "../../src/sync/admin-template-save-plan.js";
import { pendingAdminTemplateCopySource } from "../../src/sync/admin-template-copy-source.js";
import { adminTemplateCopyPayloadDigest } from "../../src/sync/admin-template-copy-projection.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { stripAdminTemplateEditorMetadata, createAdminTemplateSaveFlow } from "../../src/public/admin-template-causal-save-flow.js";
import { personalBusinessPayload } from "../../src/sync/personal-business-payload.js";
import { personalPendingPublicUpdateSource, personalPublicPhotoResultReference } from "../../src/sync/personal-pending-public-update.js";
import { recoverPersonalAdminDrafts, personalPayloadWithoutAdminDrafts } from "../../src/sync/personal-admin-draft-recovery.js";
import { applyLayoutArrangementToState } from "../../src/state/layout-arrangement.js";
import { normalizeLayoutArrangement } from "../../src/state/layout-normalize.js";
import { migrateContainerOrder } from "../../src/state/normalize.js";
import { repairContainerMembershipFromItemLinks } from "../../src/state/repair.js";

async function harness() {
  const f = await publicEntityFixture({ photos: false }), calls = [], parentId = crypto.randomUUID();
  const adminBinding = { actorId: f.binding.actorId, environment: f.binding.environment,
    listId: f.selection.source.listId, itemKey: f.selection.source.itemKey };
  const metadata = { title: "Captured administrative edit", description: "", language: "ru" };
  const sourcePayload = structuredClone(f.selection.sourcePayload);
  const plan = adminTemplateSavePlan({ binding: adminBinding, operationId: parentId, exists: true, visibility: "private",
    base: { stateRevision: 7 }, payload: sourcePayload, metadata });
  f.action.body.publicImport.source = { ...f.selection.source, kind: "admin-template", base: { operationId: parentId },
    payloadDigest: await adminTemplateCopyPayloadDigest(sourcePayload) };
  delete f.action.body.publicImport.source.stateRevision;
  f.action.body.causal.reads = [];
  const state = { ...structuredClone(f.plan.payload), activeLayoutId: "private" };
  state.layouts.admin = { id: "admin", adminSharedSourceId: "selected", templateDraftSyncPending: true,
    rootContainerIds: ["adminBag"], arrangement: { rootContainerIds: ["adminBag"], items: { adminItem: "adminBag" },
      containers: { adminBag: { parentId: "", childIds: [], itemIds: ["adminItem"], order: [{ type: "item", id: "adminItem" }] } },
      packedItems: {}, itemQuantities: { adminItem: 2 } },
    adminCausalSource: { version: 1, binding: adminBinding, exists: true,
      visibility: "private", base: { operationId: parentId }, planId: parentId } };
  state.items.adminItem = { id: "adminItem", name: "Retained administrative item", publicCatalogLayoutId: "admin", containerId: "" };
  state.items.detachedAdmin = { id: "detachedAdmin", name: "Retained detached item", publicCatalogLayoutId: "admin" };
  state.containers.adminBag = { id: "adminBag", publicCatalogLayoutId: "admin", parentId: "", itemIds: ["adminItem"] };
  const currentUser = { id: f.binding.actorId }, view = { scope: "personal", generation: "one" };
  const controls = { head: f.action, privatePayload: structuredClone(f.plan.payload), onRead: () => {}, onFlush: () => {},
    pendingImport: null, enabled: true, ordinaryWrites: 0, quota: false };
  const mirror = structuredClone(state), mirrorKey = "blocked-private-state", writes = [];
  mirror.items.kept.name = "Older private mirror must not be replaced by live state";
  mirror.unknownPrivateMirror = { exact: [3, 2, 1] };
  const storageValues = new Map([[mirrorKey, JSON.stringify(mirror)], ["private-outbox", "immutable private journal"]]);
  const localStorage = { getItem: key => storageValues.get(key) ?? null, setItem: (key, value) => {
    assert.equal(key, mirrorKey); if (controls.quota) throw Error("Admin mirror quota");
    writes.push({ key, value }); storageValues.set(key, value);
  } };
  const privateFence = () => { controls.ordinaryWrites++; throw Error("Personal recovery fence is active"); };
  const source = { outbox: { binding: f.binding, recover: () => ({ action: structuredClone(controls.head) }) } };
  const personalSaveContext = () => ({ ...f.binding, scope: view.scope,
    generation: canonicalTemplateJson([view.generation, state.activeLayoutId, controls.privatePayload]) });
  const adminTemplateOperationContext = binding => ({ ...binding, actorId: currentUser.id, scope: "admin-template",
    admin: view.scope === "admin", generation: canonicalTemplateJson([view.generation, state.activeLayoutId]) });
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const actualApply = new Function("state", "applyLayoutArrangementToState", "normalizeLayoutArrangement",
    "migrateContainerOrder", "repairContainerMembershipFromItemLinks",
    `let applyingLayoutArrangement = false;\n${app.match(/function applyLayoutArrangement\([^]*?\n\}/)[0]}\nreturn applyLayoutArrangement;`)(
    state, applyLayoutArrangementToState, normalizeLayoutArrangement, migrateContainerOrder, repairContainerMembershipFromItemLinks);
  let returningFrom;
  const deps = { PERSONAL_PENDING_ADMIN_TEMPLATE_IMPORT_ENABLED: true, canOpenAdminPublishedEdit: () => controls.enabled,
    state, clone: structuredClone, canonicalTemplateJson, personalSaveContext, personalBusinessPayload,
    serializeState: () => structuredClone(controls.privatePayload), personalPhotoRecoverySource: source,
    currentUser, localStorageScopeKey: f.binding.scopeKey, currentPackingListId: f.binding.listId,
    personalPendingImportSource: () => typeof controls.pendingImport === "function" ? controls.pendingImport() : controls.pendingImport,
    adminTemplatePlansFor: () => ({ read: async () => { await controls.onRead(); return { plan, cancelRequested: false }; },
      list: async () => [{ plan, cancelRequested: false }], run: async id => {
        assert.equal(id, plan.id); calls.push(["flush", "admin", view.scope]); await controls.onFlush();
        return { state: "committed", receipts: [{ operation: { id: plan.id, kind: "template.save", state: "committed" },
          result: { payload: { stateRevision: 8, visibility: "private" } } }] };
      } }),
    adminTemplateEditorSnapshot: () => ({ payload: structuredClone(sourcePayload), metadata }),
    stripAdminTemplateEditorMetadata, pendingAdminTemplateCopySource, recoverPersonalAdminDrafts,
    localStorage, STORAGE_KEY: mirrorKey, scopedLocalStorageKey: key => key,
    adminTemplateOperationContext, updateSyncUi: () => {}, switchView: () => {}, render: () => {},
    captureActiveLayoutArrangement: () => {},
    setActivePrivateScope: () => { returningFrom = view.scope; view.scope = "personal"; return true; },
    applyLayoutArrangement: id => {
      if (view.scope === "personal") calls.push(["return", id, returningFrom]);
      actualApply(id);
    },
    isAdminEditablePublishedLayout: id => Boolean(state.layouts[id]?.adminCausalSource), VIEW_SCOPE_ADMIN_PUBLIC_EDIT: "admin",
    setViewScope: (scope, { adminLayoutId }) => { calls.push(["activate", adminLayoutId, view.scope]); view.scope = scope; return true; },
    // Keep the blocked private boundary explicit. Reintroducing ordinary
    // activation/persistence or ordinary return must fail this regression.
    activateAdminPublishedLayout: privateFence, switchActiveLayout: privateFence, persistStateSnapshot: privateFence,
    personalSaveRecovery: { assertRunning: privateFence }, saveState: privateFence,
    createAdminTemplateSaveFlow, adminTemplateUiEnabled: () => true,
    adminTemplateRecoveryFor: () => ({ resumeStop: async () => null }),
    adminTemplateStopChoiceFor: () => ({ resume: async () => null }), administrativeSaveCoordinator: null };
  const helpers = ["restoreAdminPublishedLayoutContext", "applyAdminTemplateConfirmedPhotoResult", "adminTemplateSaveCoordinator", "resumePersonalCopyAdminSource"]
    .map(name => app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`))[0]).join("\n");
  const actual = new Function(...Object.keys(deps), `${helpers}\nreturn { run: resumePersonalCopyAdminSource, coordinator: adminTemplateSaveCoordinator };`)(...Object.values(deps));
  return { run: () => actual.run(source), coordinator: actual.coordinator, source, state, currentUser, view, controls, calls, f, plan,
    writes, storageValues, mirrorKey, mirror };
}

test("actual recovery resumes the frozen administrator source in admin scope and returns before the private queue", async () => {
  const h = await harness(), before = structuredClone(h.controls.head);
  await h.run();
  assert.deepEqual(h.calls, [["activate", "admin", "personal"], ["flush", "admin", "admin"], ["return", "private", "admin"]]);
  assert.equal(h.view.scope, "personal"); assert.equal(h.state.activeLayoutId, "private");
  assert.deepEqual(h.controls.head, before);
  assert.deepEqual(h.controls.head.body.publicImport.source.base, { operationId: h.plan.id });
  assert.equal(h.controls.ordinaryWrites, 0);
});

test("real scope application changes derived links without rejecting or persisting them as administrative edits", async () => {
  const h = await harness(), businessBefore = personalBusinessPayload(h.state);
  const arrangementBefore = structuredClone(h.state.layouts.admin.arrangement);
  const mirrorBefore = h.storageValues.get(h.mirrorKey);
  assert.equal(h.state.items.adminItem.containerId, "");
  assert.equal(h.state.containers.adminBag.parentId, "");
  assert.equal(h.state.containers.adminBag.order, undefined);
  h.controls.onFlush = () => {
    assert.equal(h.view.scope, "admin"); assert.equal(h.state.activeLayoutId, "admin");
    assert.equal(h.state.items.adminItem.containerId, "adminBag");
    assert.equal(h.state.containers.adminBag.parentId, null);
    assert.deepEqual(h.state.containers.adminBag.childIds, []);
    assert.deepEqual(h.state.containers.adminBag.order, [{ type: "item", id: "adminItem" }]);
    assert.deepEqual(personalBusinessPayload(h.state), businessBefore);
    assert.equal(h.storageValues.get(h.mirrorKey), mirrorBefore);
  };
  await h.run();
  assert.equal(h.view.scope, "personal"); assert.equal(h.state.activeLayoutId, "private");
  assert.equal(h.state.items.adminItem.containerId, "");
  assert.deepEqual(h.state.containers.adminBag.itemIds, []);
  assert.deepEqual(h.state.containers.adminBag.order, []);
  assert.deepEqual(h.state.layouts.admin.arrangement, arrangementBefore);
  const saved = JSON.parse(h.storageValues.get(h.mirrorKey));
  assert.equal(saved.layouts.admin.adminCausalSource.lastConfirmedOperation.id, h.plan.id);
  assert.deepEqual(saved.layouts.admin.arrangement, arrangementBefore);
  assert.deepEqual(saved.items, h.mirror.items); assert.deepEqual(saved.containers, h.mirror.containers);
  assert.equal(h.controls.ordinaryWrites, 0); assert.equal(h.writes.length, 1);
});

test("actual recovery returns to personal scope after an unchanged administrator failure and preserves both actions", async () => {
  const h = await harness(), failure = Error("Unconfirmed parent"), before = structuredClone(h.controls.head);
  h.controls.onFlush = () => { throw failure; };
  await assert.rejects(h.run(), error => error === failure);
  assert.equal(h.view.scope, "personal"); assert.equal(h.state.activeLayoutId, "private");
  assert.equal(h.state.layouts.admin.adminCausalSource.planId, h.plan.id); assert.deepEqual(h.controls.head, before);
});

test("actual recovery rejects changed frozen source or private head across preparation without activating admin", async () => {
  for (const mode of ["digest", "source-payload", "head", "private", "actor", "view"]) {
    const h = await harness();
    if (mode === "digest") h.controls.head.body.publicImport.source.payloadDigest = "0".repeat(64);
    if (mode === "source-payload") h.controls.head.body.publicImport.sourcePayload.items.item.name = "Unselected source";
    h.controls.onRead = () => {
      if (mode === "head") h.controls.head = { ...h.controls.head, operationId: crypto.randomUUID() };
      if (mode === "private") h.controls.privatePayload.items.kept.name = "A later private change";
      if (mode === "actor") h.currentUser.id = "another-administrator";
      if (mode === "view") h.view.generation = "different-view";
    };
    await assert.rejects(h.run()); assert.deepEqual(h.calls, [], mode);
  }
});

test("actual recovery does not undo a view, actor or private action change while the administrator request waits", async () => {
  for (const mode of ["head", "private", "actor", "view", "layout-object"]) {
    const h = await harness();
    h.controls.onFlush = () => {
      if (mode === "head") h.controls.head = { ...h.controls.head, operationId: crypto.randomUUID() };
      if (mode === "private") h.controls.privatePayload.items.kept.name = "A later private change";
      if (mode === "actor") h.currentUser.id = "another-administrator";
      if (mode === "view") { h.view.generation = "different-view"; h.state.activeLayoutId = "user-selected-layout"; }
      if (mode === "layout-object") h.state.layouts.admin = structuredClone(h.state.layouts.admin);
    };
    await assert.rejects(h.run()); assert.equal(h.calls.some(call => call[0] === "return"), false, mode);
    if (mode === "view") assert.equal(h.state.activeLayoutId, "user-selected-layout");
  }
});

test("actual recovery never guesses among duplicate source editors and leaves confirmed or unavailable sources to the private receipt check", async () => {
  const duplicate = await harness(); duplicate.state.layouts.other = { ...structuredClone(duplicate.state.layouts.admin), id: "other" };
  await assert.rejects(duplicate.run()); assert.deepEqual(duplicate.calls, []);
  for (const absent of [false, true]) {
    const h = await harness();
    if (absent) delete h.state.layouts.admin;
    else h.state.layouts.admin.adminCausalSource.planId = null;
    await h.run(); assert.deepEqual(h.calls, []);
  }
});

async function descendantHarness() {
  const h = await harness(), action = { ...structuredClone(h.controls.head), generation: 1 };
  const imported = { version: 1, action, snapshot: structuredClone(action.body.payload),
    mergeBase: { payload: h.f.selection.basePayload, stateRevision: h.f.selection.baseStateRevision },
    photoState: { version: 1, payload: structuredClone(action.body.payload), fileIntentHash: null } };
  const payload = structuredClone(action.body.payload); payload.items.kept.name = "Later retained private edit";
  const child = { version: 1, snapshot: structuredClone(payload), action: { ...action,
    kind: "list.update", operationId: crypto.randomUUID(), generation: 2,
    body: { baseStateRevision: action.body.baseStateRevision, payload, photoResults: personalPublicPhotoResultReference(imported),
      causal: { baseOperationId: action.operationId, reads: [], dependsOn: [{ operationId: action.operationId, listId: action.listId }] } } } };
  h.controls.head = child.action; h.controls.privatePayload = structuredClone(payload);
  h.controls.pendingImport = () => personalPendingPublicUpdateSource({ records: [imported, child],
    operationId: h.controls.head.operationId, listId: action.listId, includeSource: true });
  assert.equal(h.controls.pendingImport(), imported);
  return { ...h, imported, child };
}

test("actual recovery finds a pending admin import through the proven private descendant parser and retains both UUIDs", async () => {
  const h = await descendantHarness(), before = structuredClone({ import: h.imported, child: h.child });
  await h.run();
  assert.deepEqual(h.calls, [["activate", "admin", "personal"], ["flush", "admin", "admin"], ["return", "private", "admin"]]);
  assert.deepEqual({ import: h.imported, child: h.child }, before);
  assert.equal(h.controls.head.operationId, h.child.action.operationId);
});

test("actual descendant recovery independently guards the selected import and the current private head during admin wait", async () => {
  for (const mode of ["head", "source"]) {
    const h = await descendantHarness();
    h.controls.onFlush = () => {
      if (mode === "head") h.controls.head = { ...h.controls.head, operationId: crypto.randomUUID() };
      else h.imported.action.body.publicImport.source.payloadDigest = "0".repeat(64);
    };
    await assert.rejects(h.run()); assert.equal(h.calls.some(call => call[0] === "return"), false, mode);
  }
});

test("actual coordinator confirms only admin markers while the private persistence fence stays blocked", async () => {
  const h = await harness(), privateBefore = personalPayloadWithoutAdminDrafts(h.mirror, { scopeKey: h.f.binding.scopeKey, enabled: true });
  await h.run();
  const actual = JSON.parse(h.storageValues.get(h.mirrorKey));
  assert.equal(h.controls.ordinaryWrites, 0); assert.equal(h.writes.length, 1);
  assert.deepEqual(personalPayloadWithoutAdminDrafts(actual, { scopeKey: h.f.binding.scopeKey, enabled: true }), privateBefore);
  assert.deepEqual(actual.layouts.admin.adminCausalSource.base, { stateRevision: 8 });
  assert.equal(actual.layouts.admin.adminCausalSource.planId, null);
  assert.equal(actual.layouts.admin.adminCausalSource.lastConfirmedOperation.id, h.plan.id);
  assert.equal(actual.layouts.admin.templateDraftServerHydrated, true);
  assert.equal(Object.hasOwn(actual.layouts.admin, "templateDraftSyncPending"), false);
  assert.deepEqual(actual.items, h.mirror.items); assert.deepEqual(actual.containers, h.mirror.containers);
  assert.equal(h.storageValues.get("private-outbox"), "immutable private journal");
  const ordinary = await harness(); ordinary.view.scope = "admin"; ordinary.state.activeLayoutId = "admin";
  await assert.rejects(ordinary.coordinator().flush("admin"), /Personal recovery fence is active/);
  assert.equal(ordinary.controls.ordinaryWrites, 1); assert.equal(ordinary.writes.length, 0);
});

test("admin confirmation preserves a newer different administrator draft found in the current mirror", async () => {
  const h = await harness(); let latest;
  h.controls.onFlush = () => {
    latest = JSON.parse(h.storageValues.get(h.mirrorKey));
    const binding = { ...h.state.layouts.admin.adminCausalSource.binding, listId: "public-shared-layout-other", itemKey: "shared-layout:other" };
    latest.layouts.other = { id: "other", adminSharedSourceId: "other", name: "Newer draft from another tab", rootContainerIds: [],
      arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {}, itemQuantities: {} },
      templateDraftSyncPending: true, adminCausalSource: { version: 1, binding, exists: true, visibility: "private",
        base: { operationId: "12345678-1234-4234-8234-123456789abc" }, planId: "12345678-1234-4234-8234-123456789abc" } };
    latest.items.other = { id: "other", name: "Newer detached owner", publicCatalogLayoutId: "other", custom: { keep: true } };
    latest.items.kept.note = "Private mirror edit from another tab";
    h.storageValues.set(h.mirrorKey, JSON.stringify(latest));
  };
  await h.run();
  const actual = JSON.parse(h.storageValues.get(h.mirrorKey));
  assert.deepEqual(actual.layouts.other, latest.layouts.other); assert.deepEqual(actual.items.other, latest.items.other);
  assert.deepEqual(actual.items, latest.items); assert.deepEqual(actual.containers, latest.containers);
  assert.deepEqual(personalPayloadWithoutAdminDrafts(actual, { scopeKey: h.f.binding.scopeKey, enabled: true }),
    personalPayloadWithoutAdminDrafts(latest, { scopeKey: h.f.binding.scopeKey, enabled: true }));
  assert.equal(actual.layouts.admin.adminCausalSource.lastConfirmedOperation.id, h.plan.id);
  assert.equal(h.controls.ordinaryWrites, 0);
});

test("quota or a different saved admin source stops confirmation persistence and returns to personal recovery", async () => {
  for (const mode of ["quota", "different-source"]) {
    const h = await harness(); let retained = h.storageValues.get(h.mirrorKey);
    if (mode === "quota") h.controls.quota = true;
    else h.controls.onFlush = () => {
      const changed = JSON.parse(h.storageValues.get(h.mirrorKey));
      changed.layouts.admin.adminCausalSource.base = { operationId: crypto.randomUUID() };
      changed.layouts.admin.adminCausalSource.planId = changed.layouts.admin.adminCausalSource.base.operationId;
      retained = JSON.stringify(changed); h.storageValues.set(h.mirrorKey, retained);
    };
    await assert.rejects(h.run());
    assert.equal(h.view.scope, "personal"); assert.equal(h.state.activeLayoutId, "private");
    assert.equal(h.storageValues.get(h.mirrorKey), retained); assert.equal(h.storageValues.get("private-outbox"), "immutable private journal");
    assert.equal(h.controls.ordinaryWrites, 0);
  }
});

test("a newer edit of the selected template cannot be marked confirmed merely because its source pointer stayed the same", async () => {
  for (const mode of ["mirror-item", "mirror-layout", "mirror-arrangement", "mirror-photos", "live-detached-item"]) {
    const h = await harness(); let retained = h.storageValues.get(h.mirrorKey);
    h.controls.onFlush = () => {
      if (mode === "live-detached-item") h.state.items.detachedAdmin.name = "Newer live administrative edit";
      else {
        const changed = JSON.parse(h.storageValues.get(h.mirrorKey));
        if (mode === "mirror-item") changed.items.adminItem.name = "Another tab's uncaptured item edit";
        else if (mode === "mirror-arrangement") changed.layouts.admin.arrangement.itemQuantities.adminItem = 3;
        else if (mode === "mirror-photos") changed.items.adminItem.photos = [{ id: "uncaptured-photo", metadata: { credit: "Another tab" } }];
        else changed.layouts.admin.description = "Another tab's uncaptured layout edit";
        assert.equal(changed.layouts.admin.adminCausalSource.planId, h.plan.id);
        retained = JSON.stringify(changed); h.storageValues.set(h.mirrorKey, retained);
      }
    };
    await assert.rejects(h.run());
    assert.equal(h.calls.filter(call => call[0] === "flush").length, 1);
    assert.equal(h.storageValues.get(h.mirrorKey), retained); assert.equal(h.writes.length, 0);
    assert.equal(h.view.scope, "personal"); assert.equal(h.state.activeLayoutId, "private");
    assert.equal(h.controls.ordinaryWrites, 0);
  }
});
