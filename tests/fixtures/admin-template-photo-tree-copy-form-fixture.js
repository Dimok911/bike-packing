import { randomUUID } from "node:crypto";
import { adminPhotoTreeCopyRecordInput } from "./admin-template-photo-tree-copy-record-fixture.js";
import { treeAppRunnerFixture } from "./admin-template-photo-tree-copy-runner-fixture.js";
import { allocateAdminTemplatePhotoTreeCopySelection } from "../../src/public/admin-template-photo-tree-copy-selection.js";
import { prepareAdminTemplatePhotoTreeCopyForm } from "../../src/public/admin-template-photo-tree-copy-flow.js";
import { prepareAdminTemplatePhotoTreeCopyRecord } from "../../src/sync/admin-template-photo-tree-copy-record.js";
import { persistAdminTemplatePhotoTreeCopyPending } from "../../src/public/admin-template-photo-tree-copy-pending.js";
import { applyAdminTemplatePhotoTreeCopyResult } from "../../src/public/admin-template-photo-tree-copy-apply.js";
import { createAdminTemplatePhotoTreeCopyRecoveryRunner } from "../../src/public/admin-template-photo-tree-copy-recovery-runner.js";
import { assertAdminTemplatePhotoTreeCopyExternalReferences } from "../../src/public/admin-template-photo-tree-copy-projection.js";
import { adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";
import assert from "node:assert/strict";
import { treeCopyClientFixture, hash } from "./admin-template-photo-tree-copy-client-fixture.js";
import { canonicalTemplateJson, adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { createAdminTemplateClient } from "../../src/sync/admin-template-client.js";
import { createAdminTemplatePhotoTreeCopyClient } from "../../src/sync/admin-template-photo-tree-copy-client.js";
import { createAdminTemplateSaveFlow, stripAdminTemplateEditorMetadata } from "../../src/public/admin-template-causal-save-flow.js";
import { createAdminTemplateRecovery } from "../../src/public/admin-template-recovery.js";
import { createAdminTemplateStopChoice } from "../../src/public/admin-template-stop-choice.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";
import { createAdminTemplateOrderBatch } from "../../src/public/admin-template-order-batch.js";
import { assertAdminTemplatePhotoView } from "../../src/sync/admin-template-photo-view.js";
import { captureAdminTemplatePhotoOwnerMap, adminTemplatePhotoPreservedEntityIds } from "../../src/sync/admin-template-photo-owner-map.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { applyLayoutArrangementToState, createLayoutArrangementFromCurrentState } from "../../src/state/layout-arrangement.js";
import { normalizeLayoutArrangement } from "../../src/state/layout-normalize.js";
import { migrateContainerOrder } from "../../src/state/normalize.js";
import { repairContainerMembershipFromItemLinks } from "../../src/state/repair.js";

export async function treeFormFixture() {
  const original = await adminPhotoTreeCopyRecordInput(), copy = original.action.body.photoCopy, uuidValues = [];
  const sourceRootLocalId = original.snapshot.source.ownerMap.owners.find(row => row.type === "containers" && row.serverId === copy.source.rootId).localId;
  for (const side of [original.snapshot.source, original.snapshot.target]) {
    const layout = side.beforeState.layouts[side.layoutId];
    side.metadata = { title: String(layout.name || "").trim(), description: String(layout.note || "").trim(), language: layout.language || "en" };
  }
  const fields = { ...copy.fields, name: `${original.snapshot.source.beforeState.containers[sourceRootLocalId].name} (copy)` };
  const selection = allocateAdminTemplatePhotoTreeCopySelection({ binding: original.binding, source: original.snapshot.source, target: original.snapshot.target,
    sourceRootLocalId, fields, placementIndex: 1, occupiedIds: [] }, { newUuid() { const id = randomUUID(); uuidValues.push(id); return id; } });
  const prepared = await prepareAdminTemplatePhotoTreeCopyForm({ ...selection, sourcePayload: copy.source.payload, targetPayload: original.action.body.payload });
  const f = await treeAppRunnerFixture({ recordInput: { binding: prepared.binding, action: prepared.action, snapshot: prepared.snapshot } });
  f.values.delete(f.planKey); f.idb.rows().clear(); f.values.set("mirror", JSON.stringify(f.state));
  const attempts = new WeakMap(), notifications = [], allocations = [];
  const input = { entityType: "container", includeContents: true, sourceId: sourceRootLocalId,
    sourceLayoutId: selection.snapshot.source.layoutId, targetLayoutId: selection.snapshot.target.layoutId, placementIndex: 1, formSnapshot: { saved: true } };
  const controls = { current: true, afterBaseline: null };
  const build = (replace = {}, overrides = {}, names = []) => f.build({ replace, names: ["withAdminTemplatePhotoTreeCopyCaptureInventory", "withAdminTemplatePhotoTreeCopyRecoveryApplyInventory",
    "adminTemplatePhotoTreeCopyFormEnabled", "adminTemplatePhotoTreeCopyEligible", "findAdminTemplatePhotoTreeCopyFormRecord", "adminTemplatePhotoTreeCopyRecoveryRunner",
    "captureAdminTemplatePhotoTreeCopyForm", "applyAdminTemplatePhotoTreeCopyFormResult", "submitAdminTemplatePhotoTreeCopyForm", "resumeAdminTemplatePhotoTreeCopyForm",
    "prepareAdminTemplatePhotoTreeCopyRecovery", "prepareAdminTemplateRecovery", ...names], deps: {
      adminTemplatePhotoCopyFormEnabled: () => Object.values(f.flags).every(value => value === true),
      currentUser: { id: f.binding.actorId }, canOpenAdminPublishedEdit: () => f.current.admin, administrativePhotoForms: new Map(), adminTemplateSaveCoordinator: () => ({ hasPendingCapture: () => false }),
      administrativePhotoTreeCopyAttempts: attempts, clone: structuredClone, adminTemplatePhotoNamespace,
      allocateAdminTemplatePhotoTreeCopySelection: value => {
        const queue = [...uuidValues]; const actual = allocateAdminTemplatePhotoTreeCopySelection(value, { newUuid: () => queue.shift() });
        allocations.push(actual); return actual;
      },
      prepareAdminTemplatePhotoTreeCopyRecord, prepareAdminTemplatePhotoTreeCopyForm,
      persistAdminTemplatePhotoTreeCopyPending, applyAdminTemplatePhotoTreeCopyResult, createAdminTemplatePhotoTreeCopyRecoveryRunner,
      assertAdminTemplatePhotoTreeCopyExternalReferences, withAdminTemplateCapture,
      navigator: { locks: f.locks }, localStorage: f.storage, scopedLocalStorageKey: () => "mirror", STORAGE_KEY: "mirror", localStorageScopeKey: `id:${f.binding.actorId}`,
      normalizeUiLanguage: value => value, uiLanguage: "en", nowIso: () => fields.createdAt, currentEditMeta: () => fields,
      restoreAdminPublishedLayoutContext: id => { f.modeState.adminPublishedEditLayoutId = id; return true; },
      adminTemplateSourceBaseline: binding => ({ async read() {
        controls.afterBaseline?.(); return binding.listId === f.binding.listId ? { stateRevision: copy.source.base.stateRevision + 4, payload: original.action.body.payload }
          : { stateRevision: copy.source.base.stateRevision, payload: copy.source.payload };
      } }), render() {}, ...overrides } });
  const submit = () => build().submitAdminTemplatePhotoTreeCopyForm(input, { isCurrent: () => controls.current, onDurable: record => notifications.push(record) });
  return { ...f, selection, prepared, input, submit, form: build, formControls: controls, attempts, notifications, allocations };
}

// Actual app functions, durable stores and validators are shared with the form
// fixture. This server boundary can retain several independent immutable UUIDs;
// it does not manufacture an acceptance proof or bypass app admission.
export async function treeAcceptanceAppFixture({ routing = false, arrangement = false } = {}) {
  assert.ok(!arrangement || routing, "Actual arrangement requires the routing entrypoints");
  const f = await treeFormFixture(), clone = structuredClone;
  const http = { calls: [], treePosts: [], ordinaryPosts: [], stagePosts: [], trees: new Map(), receipts: new Map(), stages: new Map(), heads: new Map() };
  for (const side of [f.prepared.snapshot.source, f.prepared.snapshot.target]) {
    const binding = side.ownerMap.binding, source = side.beforeState.layouts[side.layoutId].adminCausalSource;
    http.heads.set(binding.itemKey, { binding: clone(binding), revision: source.base.stateRevision, metadata: clone(side.metadata),
      payload: clone(side === f.prepared.snapshot.source ? f.prepared.action.body.photoCopy.source.payload : f.prepared.action.body.payload) });
  }
  const register = async record => {
    const known = http.trees.get(record.action.operationId);
    if (known) { assert.deepEqual(known.record, record); return; }
    // Existing synthetic BE fixture uses the real manifest/result derivation.
    // Its isolated IDB is never supplied to the app or acceptance reader.
    const facts = await treeCopyClientFixture({ recordInput: { binding: record.binding, action: record.action, snapshot: record.snapshot } });
    assert.deepEqual(facts.record, record); http.trees.set(record.action.operationId, facts);
  };
  const fetchImpl = async (url, request = {}) => {
    const path = new URL(url).pathname, method = request.method || "GET", call = { path, method };
    http.calls.push(call); assert.equal(request.credentials, "include"); assert.equal(request.redirect, "error"); let value;
    if (path.endsWith("/auth/me")) value = { ok: true, user: { id: f.current.actorId } };
    else if (path.endsWith("/authorization")) value = { ok: true, authorization: { version: 1, role: "admin", capabilities: ["templates:write"] } };
    else if (path.endsWith("/capabilities")) value = { ok: true, service: "bikepacking-api", capabilities: f.controls.capabilities };
    else if (path.endsWith("/template-operations/prepare") && method === "POST") {
      const body = JSON.parse(request.body); assert.deepEqual(Object.keys(body), ["itemKey"]);
      const head = http.heads.get(body.itemKey); assert.ok(head, "known prepared target");
      value = { ok: true, ...head.binding, exists: true, deleted: false, visibility: "private", stateRevision: head.revision,
        indexes: [], payload: head.payload, metadata: head.metadata };
    } else if (path.endsWith("/template-photo-assets/tree-copy") && method === "POST") {
      const body = JSON.parse(request.body); assert.deepEqual(Object.keys(body), ["manifest"]);
      const candidates = [...http.trees.values()].flatMap(facts => facts.record.stages.map((manifest, index) => ({ facts, manifest, index })))
        .filter(row => row.manifest.operationId === body.manifest.operationId);
      assert.equal(candidates.length, 1); const { facts, manifest, index } = candidates[0]; assert.deepEqual(body.manifest, manifest);
      http.stagePosts.push(clone(body)); value = clone(facts.stages[index]); http.stages.set(manifest.operationId, value);
    } else if (path.includes("/template-photo-assets/tree-copy/") && method === "GET") {
      const id = path.split("/").at(-1); value = http.stages.get(id)
        || { ok: true, operation: { id, actorId: f.current.actorId, environment: f.binding.environment, state: "unknown" } };
    } else if (path.endsWith("/template-operations") && method === "POST") {
      const body = JSON.parse(request.body), keys = ["expectedActorId", "environment", "operationId", "listId", "itemKey", "kind", "body"];
      assert.deepEqual(Object.keys(body).sort(), keys.sort()); assert.equal(body.expectedActorId, f.current.actorId);
      const head = http.heads.get(body.itemKey); assert.ok(head); assert.equal(body.listId, head.binding.listId);
      assert.deepEqual(body.body.base, { stateRevision: head.revision });
      let receipt;
      if (body.body.photoCopy) {
        const facts = http.trees.get(body.operationId); assert.ok(facts); assert.deepEqual(body.body, facts.record.action.body);
        const sourceHead = http.heads.get(body.body.photoCopy.source.itemKey);
        assert.equal(sourceHead.revision, body.body.photoCopy.source.base.stateRevision);
        assert.deepEqual(sourceHead.payload, body.body.photoCopy.source.payload);
        for (const stage of facts.stages) assert.deepEqual(http.stages.get(stage.receipt.manifest.operationId), stage);
        receipt = clone(facts.receipt); http.treePosts.push(clone(body)); head.payload = clone(receipt.result.payload.photoCopy.confirmedPayload);
        head.metadata = clone(body.body.metadata);
      } else {
        const intent = adminTemplateIntent({ ...head.binding, operationId: body.operationId, kind: body.kind, body: body.body });
        const { id, ...encoded } = intent;
        assert.equal(intent.kind, "template.save");
        receipt = { operation: { id, ...head.binding, kind: intent.kind, payloadDigest: hash(encoded), state: "committed" },
          result: { status: 200, payload: { ok: true, listId: head.binding.listId, itemKey: head.binding.itemKey,
            stateRevision: head.revision + 1, visibility: "private", indexes: [] } } };
        http.ordinaryPosts.push(clone(body)); head.payload = clone(body.body.payload); head.metadata = clone(body.body.metadata);
      }
      head.revision = receipt.result.payload.stateRevision; http.receipts.set(body.operationId, receipt); value = { ok: true, ...receipt };
    } else if (path.includes("/template-operations/") && method === "GET") {
      const id = path.split("/").at(-1); value = http.receipts.has(id) ? { ok: true, ...http.receipts.get(id) } : { ok: true, operation: { id, state: "unknown" } };
    } else assert.fail(`Unexpected request: ${method} ${path}`);
    f.controls.afterRequest?.(path, method);
    return { status: 200, json: async () => clone(value) };
  };
  let api, transport, allocationCount = 0;
  const routes = { capture: 0, flush: 0, recover: 0, discovery: 0, dialogs: [], fallback: [], errors: [], afterDiscovery: null };
  const routingNames = ["openCausalAdminTemplate", "runSyncNow", "activateAdminPublishedLayout", "getPublishedEditLayoutId",
    "resumeCausalAdminTemplateCopy", "resumeAdminTemplatePhotoForm", "resumeAdminTemplatePhotoCopyForm",
    ...(arrangement ? ["restoreAdminPublishedLayoutContext", "captureActiveLayoutArrangement", "applyLayoutArrangement",
      "applyAdminTemplatePhotoCreateArrangement", "ensureLayoutDictionaries", "resumeAdminTemplatePhotoAppendForm",
      "resumeAdminTemplatePhotoEditForm", "resumeAdminTemplatePhotoCreateForm", "adminTemplatePhotoCreateFormEnabled",
      "adminTemplatePhotoFormEnabled"] : [])];
  const routingDependencies = () => {
    const fail = name => () => assert.fail("Unexpected cold routing branch: " + name);
    const deps = Object.fromEntries(["activeReadOnlyLayoutId", "checkAdminApiCompatibility", "checkAuthAndLoad", "checkRemoteStateFreshness",
      "clearStaleDirtyFlagIfNoLocalChanges", "currentPublicTemplateStatusMessage", "flushActivePublishedEditSave", "handleAuthButton",
      "isAdminUser", "isDemoPublicTemplateMissing", "isForcedOffline", "isOfflineRememberedSession", "isReadOnlyStateScope",
      "loadRemoteState", "offerLoadServerForTruncatedLocalState", "openAdminDemoLayout", "openSharedLayoutForAdmin",
      "preferredCurrentLayoutRef", "refreshActiveReadOnlyPublicTemplate", "savePublishedLayoutRecord", "saveRemoteState",
      "saveSyncMeta", "uploadPendingPhotos", "rememberActiveLayoutChoice", "demoTemplateChoiceForLayout",
      "adminTemplateDraftChoice", "reconcileLegacyAdminTemplate"].map(name => [name, fail(name)]));
    return { ...deps, modeState: f.modeState, ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED: false,
      ...(arrangement ? {
        applyingLayoutArrangement: false, VIEW_SCOPE_ADMIN_PUBLIC_EDIT: "admin-public-edit",
        applyLayoutArrangementToState, createLayoutArrangementFromCurrentState, normalizeLayoutArrangement,
        migrateContainerOrder, repairContainerMembershipFromItemLinks,
        setViewScope: (scope, { adminLayoutId }) => {
          assert.equal(scope, "admin-public-edit"); assert.ok(f.state.layouts[adminLayoutId]?.adminCausalSource);
          f.current.scope = "admin-template"; f.modeState.adminPublishedEditLayoutId = adminLayoutId; return true;
        },
        // An owned namespace must never enter legacy dictionary repair; the
        // real app function, rather than this dependency, decides the branch.
        isGuestDemoCopyLayoutRecord: fail("legacy dictionary repair")
      } : {}),
      activeDemoTemplateListId: "", appUnlocked: true, publishedLayoutSaveLayoutId: "", publishedLayoutSaveTimer: null,
      syncMeta: {}, syncTimer: null, DEMO_SHARED_LAYOUT_ID: "unused-readonly-demo",
      personalSavePilotEnabled: () => false, isReadOnlyBikePackingContext: () => false,
      isAdminPublicEditScope: () => f.current.scope === "admin-template",
      isAdminEditablePublishedLayout: id => Boolean(f.state.layouts[id]?.adminCausalSource),
      saveState: options => { assert.deepEqual(options, { sync: false }); f.storage.setItem("mirror", JSON.stringify(f.state)); },
      switchView: view => assert.equal(view, "packing"),
      reportAdminTemplateSaveError: error => { routes.errors.push(error); }, showToast() {},
      // Only the presentation seam is replaced. Actual prepare/inspect/resume
      // below retain the real plan, IDB, receipt, acceptance and context proof.
      showAdminTemplateRecovery: async id => {
        const work = await api.prepareAdminTemplateRecovery(id), info = await work.inspect(false);
        const shown = { id, work, info }; routes.dialogs.push(shown); return shown;
      },
      runSyncNowFlow: async (args, options) => {
        assert.equal(args.runtime.state, f.state); routes.fallback.push({ force: Boolean(options.force) });
        return "ordinary-sync-fallback";
      } };
  };
  const notifications = [], forbidden = () => assert.fail("Unsupported legacy branch must not replace a typed proof");
  const reset = () => {
    // A cold document has fresh transport/context/app closures; all durable
    // bytes and IDB rows remain exactly where the old document left them.
    transport = createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN, hostname: "experiment.vniipo-help.ru" },
      selection: "direct", locks: f.locks, storage: f.storage });
    const real = transport;
    transport = { ...real, get mode() { return real.mode; }, get writes() { return real.writes; },
      get uncertainWrite() { return real.uncertainWrite; }, async beginWrite(...args) {
        const result = await real.beginWrite(...args); f.controls.afterBegin?.(...args); return result;
      } };
    const names = ["assertAdminTemplateCopyCaptureAllowed", "adminTemplateBinding", "adminTemplateCanonicalEditorSnapshot", "adminTemplateEditorSnapshot",
      "persistAdminTemplateCoordinatorState", "adminTemplateSaveCoordinator", "adminTemplateRecoveryFor", "adminTemplateStopChoiceFor", "openCausalAdminTemplateOrder",
      ...(routing ? routingNames : [])];
    const deps = {
      experimentTransport: transport, administrativeSaveCoordinator: null, administrativePhotoTreeCopyAttempts: new WeakMap(),
      createAdminTemplateSaveFlow: options => {
        const flow = createAdminTemplateSaveFlow(options);
        if (!routing) return flow;
        return { ...flow,
          capture(...args) { routes.capture++; return flow.capture(...args); },
          flush(...args) { routes.flush++; return flow.flush(...args); },
          recover(...args) { routes.recover++; return flow.recover(...args); } };
      },
      createAdminTemplateRecovery: options => createAdminTemplateRecovery({ ...options, storage: f.storage, locks: f.locks }),
      createAdminTemplateStopChoice: options => createAdminTemplateStopChoice({ ...options, storage: f.storage, locks: f.locks }),
      projectAdminTemplateServerVariant, stripAdminTemplateEditorMetadata,
      assertAdminTemplatePhotoView, captureAdminTemplatePhotoOwnerMap, adminTemplatePhotoPreservedEntityIds,
      createAdminTemplateOrderBatch: options => createAdminTemplateOrderBatch({ ...options, storage: f.storage, locks: f.locks }),
      createAdminTemplatePhotoTreeCopyClient: options => createAdminTemplatePhotoTreeCopyClient({ ...options, storage: f.storage, locks: f.locks, fetchImpl }),
      adminTemplateClient: (binding, layoutId, preparing = false) => createAdminTemplateClient({ binding,
        getContext: () => f.context(binding, layoutId, preparing), storage: f.storage, locks: f.locks, transport, fetchImpl, enabled: f.flags.admin }),
      publicListIdForPublishedTarget: target => target.type === "demo" ? target.demoListId : `public-shared-layout-${target.sharedId}`,
      allocateAdminTemplatePhotoTreeCopySelection: value => { allocationCount++; return allocateAdminTemplatePhotoTreeCopySelection(value, { newUuid: randomUUID }); },
      prepareAdminTemplatePhotoTreeCopyForm: async value => { const record = await prepareAdminTemplatePhotoTreeCopyForm(value); await register(record); return record; },
      adminTemplateSourceBaseline: binding => ({ async read() { const head = http.heads.get(binding.itemKey); assert.ok(head);
        return { stateRevision: head.revision, payload: clone(head.payload) }; } }),
      persistStateSnapshot: value => { f.storage.setItem("mirror", JSON.stringify(value)); assert.equal(f.storage.getItem("mirror"), JSON.stringify(value)); return true; },
      updateSyncUi() {}, applyAdminTemplateServerVariant: forbidden, applyLayoutArrangement: forbidden,
      applyAdminTemplateConfirmedPhotoResult: forbidden, applyAdminTemplateConfirmedPhotoCopyResult: forbidden,
      withLayoutArrangementApplied: forbidden, adminTemplatePhotoEditorSnapshot: forbidden,
      adminTemplatePhotoMechanismEnabled: () => true, publishedLayoutTarget: forbidden,
      ...(routing ? routingDependencies() : {}) };
    const build = replace => f.form(replace, deps, names);
    api = build({});
    if (routing) {
      const actualFind = api.findAdminTemplatePhotoTreeCopyFormRecord;
      api = build({ findAdminTemplatePhotoTreeCopyFormRecord: async (...args) => {
        const record = await actualFind(...args); routes.discovery++;
        // Optional fault seam runs after the actual discovery/proof completes,
        // before its caller's await continuation, without manufacturing a result.
        const after = routes.afterDiscovery; routes.afterDiscovery = null; after?.(record);
        return record;
      } });
    }
    return api;
  };
  reset();
  const cold = () => {
    const persisted = JSON.parse(f.storage.getItem("mirror"));
    for (const key of Object.keys(f.state)) delete f.state[key]; Object.assign(f.state, persisted);
    f.current.generation += ":cold"; return reset();
  };
  const submit = async (input = f.input) => api.submitAdminTemplatePhotoTreeCopyForm(input, {
    isCurrent: () => f.formControls.current, onDurable: record => notifications.push(clone(record)) });
  const editAndSave = async (layoutId = f.layoutId) => {
    const layout = f.state.layouts[layoutId], owner = layout.adminCausalSource.photoOwnerMap.owners.find(row => row.type === "items");
    assert.ok(owner); f.state.items[owner.localId].name += " ordinary accepted edit";
    const expected = api.adminTemplateCanonicalEditorSnapshot(layoutId), coordinator = api.adminTemplateSaveCoordinator();
    const captured = await coordinator.capture(layoutId), result = await coordinator.flush(layoutId);
    return { owner, expected, captured, result };
  };
  return { ...f, http, fetchImpl, notifications, submit, cold, reset, editAndSave, routes, api: () => api,
    get transport() { return transport; }, get allocationCount() { return allocationCount; } };
}

// An independent, photo-free legacy template, projected by the actual server
// adapter with owner-map capture OFF. It shares no owner IDs or raw source with
// either tree-copy namespace; catalog aliases come from the real projector.
export function addTreeRoutingLegacyLayout(targetState, actorBinding, { causal = true, storedArrangement = true } = {}) {
  const sharedId = randomUUID(), layoutId = `layout-admin-${randomUUID()}`;
  const binding = { ...actorBinding, listId: `public-shared-layout-${sharedId}`, itemKey: `shared:${sharedId}` };
  const rootId = "legacy-root", itemId = "legacy-item", serverLayoutId = "legacy-layout";
  const placement = { parentId: "", childIds: [], itemIds: [itemId], order: [{ type: "item", id: itemId }] };
  const payload = { activeLayoutId: serverLayoutId, locations: ["Legacy place"], categories: ["Legacy category"],
    containers: { [rootId]: { id: rootId, name: "Legacy bag", ...structuredClone(placement) } },
    items: { [itemId]: { id: itemId, name: "Legacy quantity", quantity: 7, containerId: rootId } },
    layouts: { [serverLayoutId]: { id: serverLayoutId, rootContainerIds: [rootId], updatedAt: "2024-01-01T00:00:00Z",
      arrangement: { rootContainerIds: [rootId], containers: { [rootId]: placement }, items: { [itemId]: rootId },
        itemQuantities: { [itemId]: 1 }, packedItems: { [itemId]: true } } } } };
  const projected = projectAdminTemplateServerVariant({ id: layoutId, adminSharedSourceId: sharedId },
    { exists: true, visibility: "private", stateRevision: 1, payload,
      metadata: { title: "Independent legacy template", description: "", language: "en" } }, randomUUID());
  if (causal) projected.layout.adminCausalSource = { version: 1, binding, exists: true, deleted: false,
    visibility: "private", base: { stateRevision: 1 }, planId: null };
  if (!storedArrangement) delete projected.layout.arrangement;
  assert.equal(projected.layout.adminCausalSource?.photoOwnerMap, undefined);
  targetState.layouts[layoutId] = projected.layout;
  Object.assign(targetState.items, projected.items); Object.assign(targetState.containers, projected.containers);
  return { layoutId, layout: projected.layout, itemId: Object.keys(projected.items)[0], rootId: Object.keys(projected.containers)[0] };
}
