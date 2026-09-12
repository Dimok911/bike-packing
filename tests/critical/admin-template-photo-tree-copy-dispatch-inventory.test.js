import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { treeCopyClientFixture, copy, hash, commandPrefix } from "../fixtures/admin-template-photo-tree-copy-client-fixture.js";
import { adminPhotoCopyRecordInput } from "../fixtures/admin-template-photo-copy-record-fixture.js";
import { adminPhotoRecordFixture } from "../fixtures/admin-template-photo-record-fixture.js";
import { createAdminTemplatePhotoTreeCopyActionStore } from "../../src/sync/admin-template-photo-tree-copy-action-store.js";
import { createAdminTemplatePhotoTreeCopyClient } from "../../src/sync/admin-template-photo-tree-copy-client.js";
import { createAdminTemplatePhotoCopyActionStore } from "../../src/sync/admin-template-photo-copy-action-store.js";
import { createAdminTemplatePhotoCopyClient } from "../../src/sync/admin-template-photo-copy-client.js";
import { createAdminTemplatePhotoActionStore } from "../../src/sync/admin-template-photo-action-store.js";
import { createAdminTemplateClient } from "../../src/sync/admin-template-client.js";
import { createAdminTemplateSavePlans, adminTemplateSavePlan } from "../../src/sync/admin-template-save-plan.js";
import { createAdminTemplatePhotoTreeCopyAdmission } from "../../src/sync/admin-template-photo-tree-copy-admission.js";
import { adminTemplatePhotoTreeCopySavePlan, adminTemplatePhotoTreeCopyEditorSnapshot } from "../../src/sync/admin-template-photo-tree-copy-save-plan.js";
import { withAdminTemplateCapture, assertAdminTemplateCaptureLease } from "../../src/sync/admin-template-capture-lease.js";
import { readAdminTemplateOrderInventory } from "../../src/public/admin-template-order-batch.js";
import { canonicalTemplateJson, validTemplateOperationId } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyStageManifests, adminTemplatePhotoCopyStageDigest } from "../../src/sync/admin-template-photo-copy-protocol.js";
import { adminTemplatePhotoStageDigest } from "../../src/sync/admin-template-photo-append-protocol.js";
import { adminTemplatePhotoCopySavePlan, adminTemplatePhotoCopyEditorSnapshot } from "../../src/sync/admin-template-photo-copy-save-plan.js";
import { createAdminTemplateStopChoice } from "../../src/public/admin-template-stop-choice.js";
import { createAdminTemplateRecovery } from "../../src/public/admin-template-recovery.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const prefix = (kind, binding) => kind + encodeURIComponent(canonicalTemplateJson(binding)) + ":";
const planPrefix = "bike-packing-admin-save-plans-v1:", ordinaryPrefix = "bike-packing-admin-template-v1:";
const actual = (names, deps) => new Function(...Object.keys(deps), names.map(name => {
  const match = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`)); assert.ok(match, name); return match[0];
}).join("\n") + `\nreturn {${names.join(",")}};`)(...Object.values(deps));
const noPosts = f => { assert.equal(f.server.stagePosts.length, 0); assert.equal(f.server.savePosts.length, 0); };
const rebind = (value, binding) => {
  const strings = new Map([["admin-a", binding.actorId], ["public-shared-layout-selected", binding.listId],
    ["shared-layout:selected", binding.itemKey], ["selected", "target"]]);
  if (typeof value === "string") return strings.get(value) ?? value;
  if (value instanceof Blob || value === null || typeof value !== "object") return value;
  return Array.isArray(value) ? value.map(row => rebind(row, binding))
    : Object.fromEntries(Object.entries(value).map(([key, row]) => [key, rebind(row, binding)]));
};

async function fixture({ actualStopFactories = false } = {}) {
  const f = await treeCopyClientFixture(), factories = [], scopes = [], stopChoices = new Map();
  const sides = [f.record.snapshot.source, f.record.snapshot.target], state = { layouts: Object.assign({}, ...sides.map(side => copy(side.beforeState.layouts))) };
  const bindings = sides.map(side => copy(side.beforeState.layouts[side.layoutId].adminCausalSource.binding));
  const modeState = { adminPublishedEditLayoutId: sides[1].layoutId }; state.activeLayoutId = sides[1].layoutId;
  const contextDeps = { state, modeState, currentUser: { get id() { return f.current.actorId; } },
    administrativeObjectIds: new WeakMap(), administrativeObjectCounter: 0,
    canOpenAdminPublishedEdit: () => f.current.admin, isAdminPublicEditScope: () => f.current.scope === "admin-template",
    getPublishedEditLayoutId: () => modeState.adminPublishedEditLayoutId, currentViewScope: () => f.current.generation,
    location: { pathname: "/experiment/", search: "", hash: "" } };
  const actualContext = actual(["administrativeObjectId", "adminTemplateOperationContext"], contextDeps).adminTemplateOperationContext;
  const context = (binding, layoutId = sides.find(side => side.ownerMap.binding.listId === binding.listId)?.layoutId, preparing = true) =>
    actualContext(binding, layoutId, preparing);
  const get = (binding, layoutId, preparing = true) => () => context(binding, layoutId, preparing), transport = f.make().transport;
  const wrap = (name, factory) => options => { factories.push({ name, options });
    return factory({ ...options, storage: f.storage, indexedDB: f.idb.indexedDB, locks: f.locks }); };
  const upload = (binding, enabled = false, layoutId, preparing = true) => createAdminTemplatePhotoActionStore({ binding, indexedDB: f.idb.indexedDB,
    getContext: get(binding, layoutId, preparing), enabled });
  const v8Store = (binding, enabled = false, layoutId, preparing = true) => createAdminTemplatePhotoCopyActionStore({ binding, indexedDB: f.idb.indexedDB,
    getContext: get(binding, layoutId, preparing), enabled });
  const ordinary = (binding, layoutId, preparing = true) => createAdminTemplateClient({ binding, getContext: get(binding, layoutId, preparing), storage: f.storage,
    locks: f.locks, transport, photoStore: upload(binding), enabled: false });
  const deps = { globalThis: { localStorage: f.storage }, state, canonicalTemplateJson, validTemplateOperationId,
    adminTemplatePhotoTreeCopySavePlan, adminTemplatePhotoTreeCopyEditorSnapshot, assertAdminTemplateCaptureLease,
    createAdminTemplatePhotoTreeCopyActionStore: wrap("tree-store", createAdminTemplatePhotoTreeCopyActionStore),
    createAdminTemplatePhotoTreeCopyClient: wrap("tree-client", createAdminTemplatePhotoTreeCopyClient),
    createAdminTemplateSavePlans: wrap("plans", createAdminTemplateSavePlans), experimentTransport: transport,
    adminTemplateOperationContext: actualContext,
    adminTemplateClient: (binding, layoutId, preparing = false) => ordinary(binding, layoutId, preparing),
    adminTemplatePhotoStore: (binding, layoutId, preparing = false) => upload(binding, false, layoutId, preparing),
    adminTemplatePhotoCopyStore: (binding, layoutId, preparing = false) => v8Store(binding, false, layoutId, preparing),
    adminTemplatePhotoCopyClient: (binding, layoutId, preparing = false) => createAdminTemplatePhotoCopyClient({
      binding, getContext: get(binding, layoutId, preparing), storage: f.storage, locks: f.locks,
      store: v8Store(binding, false, layoutId, preparing), transport, enabled: false }),
    adminTemplateUiEnabled: () => actualStopFactories, ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED: false, ADMIN_TEMPLATE_PHOTO_COPY_ENABLED: false,
    adminTemplateStopChoiceFor: (binding, layoutId, id) => {
      const factory = stopChoices.get(id); assert.ok(factory, "Unproven adopted choice"); return factory(binding, layoutId);
    },
    adminTemplateRecoveryFor: () => ({ requiresCancellation: () => assert.fail("Inventory cannot cancel") }),
    assertAdminTemplateCopyCaptureAllowed: () => assert.fail("Dispatch inventory cannot recapture"),
    readAdminTemplateOrderInventory: options => readAdminTemplateOrderInventory({ ...options, storage: f.storage }) };
  Object.assign(deps, { createAdminTemplateRecovery: wrap("recovery", createAdminTemplateRecovery),
    createAdminTemplateStopChoice: wrap("stop-choice", createAdminTemplateStopChoice), projectAdminTemplateServerVariant,
    adminTemplatePhotoMechanismEnabled: () => false, adminTemplateEditorSnapshot: () => assert.fail("Readonly exclusions cannot snapshot live state") });
  const api = actual([...(actualStopFactories ? ["adminTemplateStopChoiceFor", "adminTemplateRecoveryFor"] : []),
    "adminTemplatePhotoTreeCopyInventory", "adminTemplatePhotoExcludedPlans", "adminTemplatePlansFor",
    "withAdminTemplatePhotoTreeCopyDispatchInventory"], deps);
  const plan = adminTemplatePhotoTreeCopySavePlan({ binding: f.binding, operationId: f.id, body: f.record.action.body,
    editorSnapshot: adminTemplatePhotoTreeCopyEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  const saved = { version: 1, plan, digest: hash(plan), cancelRequested: false }, planKey = prefix(planPrefix, f.binding) + f.id;
  f.storage.setItem(planKey, canonicalTemplateJson(saved));
  const withInventory = (proof, task) => api.withAdminTemplatePhotoTreeCopyDispatchInventory(proof, async scope => {
    scopes.push(scope); return await task(scope);
  });
  const check = (task = async scope => { scope.assertCurrent(); return "admitted"; }, record = f.record) =>
    withAdminTemplateCapture({ bindings, locks: f.locks }, captureLease => withInventory({ record, bindings, captureLease,
      assertCurrent() { assertAdminTemplateCaptureLease(captureLease, bindings); } }, task));
  // Only namespace policy is a test scope. Inventory, plans, codecs, journals,
  // capture leases and the client/transport dispatch are their actual modules.
  let depth = 0;
  const withNamespaces = async (proof, task) => {
    let active = true; depth++; f.admission.active = true;
    try { return await task({ kind: "admin-template-photo-tree-copy-namespaces-v1", bindings: proof.bindings,
      recordIntentHash: proof.record.intentHash, assertCurrent() { assert.ok(active); proof.assertCurrent(); } }); }
    finally { active = false; depth--; f.admission.active = depth > 0; }
  };
  const admission = createAdminTemplatePhotoTreeCopyAdmission({ binding: f.binding, getContext: () => f.current,
    store: f.store, locks: f.locks, withInventory, withNamespaces });
  const run = () => admission.run(f.id, async session => {
    const client = f.make({ getContext: session.getContext, withDispatchAdmission: session.withDispatchAdmission }).client;
    await client.capture(session.record.action); session.assertCurrent(); return await client.run(f.id);
  });
  const ordinaryRow = (binding, base, id = crypto.randomUUID()) => {
    const intent = { id, ...binding, kind: "template.save", body: { version: 1, base, payload: copy(f.record.action.body.payload),
      metadata: copy(f.record.action.body.metadata) } }, { id: ignored, ...encoded } = intent;
    const row = { version: 1, intent, payloadDigest: hash(encoded), dispatched: false, cancelRequested: false, receipt: null };
    f.storage.setItem(prefix(ordinaryPrefix, binding) + id, canonicalTemplateJson(row)); return row;
  };
  return Object.assign(f, { api, deps, state, sides, bindings, factories, scopes, plan, saved, planKey, context,
    check, run, upload, v8Store, ordinaryRow, transport, stopChoices, actualContext, modeState,
    activate(index) { modeState.adminPublishedEditLayoutId = sides[index].layoutId; state.activeLayoutId = sides[index].layoutId; } });
}

// A terminal history is created with actual plan/record/receipt readers and an
// actual stop/adoption choice. Only the remote prepare response is synthetic.
async function acceptedHistory(f, { sideIndex = 0, version = 8 } = {}) {
  const side = f.sides[sideIndex], binding = f.bindings[sideIndex], layoutId = side.layoutId;
  const revision = side.ownerMap.stateRevision;
  const payload = copy(sideIndex === 0 ? f.intent.body.photoCopy.source.payload : f.intent.body.payload), metadata = copy(side.metadata);
  let plan, editor, copyRecord;
  if (version === 8) {
    const initial = await adminPhotoCopyRecordInput(), body = copy(initial.action.body), operationId = crypto.randomUUID();
    const oldSourceList = body.photoCopy.source.listId, sourceBinding = { ...binding, listId: "public-shared-layout-prior-source", itemKey: "shared-layout:prior-source" };
    body.payload = payload; body.metadata = metadata; body.base.stateRevision = revision;
    body.photoCopy.source.listId = sourceBinding.listId; body.photoCopy.source.itemKey = sourceBinding.itemKey;
    for (const type of ["items", "containers"]) for (const row of Object.values(body.photoCopy.source.payload[type]))
      for (const photo of row.photos || []) if (photo.listId === oldSourceList) photo.listId = sourceBinding.listId;
    body.photoCopy.source.payloadDigest = hash(body.photoCopy.source.payload);
    const action = { operationId, kind: "template.save", listId: binding.listId, itemKey: binding.itemKey, body };
    const projectedSide = (binding, payload, stateRevision, id, metadata) => {
      const demo = binding.listId.startsWith("public-demo-state"), layout = { id, ...(demo
        ? { adminDemo: true, adminDemoListId: binding.listId, adminDemoLanguage: metadata.language }
        : { adminSharedSourceId: binding.listId.slice("public-shared-layout-".length) }) };
      const projection = projectAdminTemplateServerVariant(layout, { exists: true, visibility: "private", stateRevision, payload, metadata },
        crypto.randomUUID(), { photoBinding: binding, photoOwnerMapEnabled: true });
      projection.layout.adminCausalSource = { ...projection.layout.adminCausalSource, version: 1, binding: copy(binding), exists: true,
        visibility: "private", deleted: false, base: { stateRevision }, planId: null };
      return { layoutId: id, ownerMap: projection.layout.adminCausalSource.photoOwnerMap, metadata, beforeState: { activeLayoutId: id,
        layouts: { [id]: projection.layout }, items: projection.items, containers: projection.containers,
        locations: copy(payload.locations || []), categories: copy(payload.categories || []), packedItems: copy(projection.layout.arrangement.packedItems) } };
    };
    const source = projectedSide(sourceBinding, body.photoCopy.source.payload, body.photoCopy.source.base.stateRevision, "old-copy-source-editor", initial.snapshot.source.metadata);
    const target = projectedSide(binding, body.payload, revision, layoutId, metadata), owner = source.ownerMap.owners.find(row =>
      row.type === "items" && row.serverId === body.photoCopy.source.entityId);
    const manifests = await adminTemplatePhotoCopyStageManifests(adminTemplatePhotoCopyIntent({ ...binding, ...action }));
    for (const [index, manifest] of manifests.entries()) body.photoCopy.assets[index].assetDigest = await adminTemplatePhotoCopyStageDigest(manifest);
    const snapshot = { version: 1, source, target, copiedOwner: { entityType: "item", sourceLocalId: owner.localId,
      localId: `old-copy-${operationId}`, serverId: body.photoCopy.entityId } };
    copyRecord = await f.v8Store(binding, true).capture({ action, snapshot }); editor = adminTemplatePhotoCopyEditorSnapshot(copyRecord);
    plan = adminTemplatePhotoCopySavePlan({ binding, operationId, body, editorSnapshot: editor, recordIntentHash: copyRecord.intentHash });
  } else {
    plan = adminTemplateSavePlan({ binding, operationId: crypto.randomUUID(), publicationId: crypto.randomUUID(),
      base: { stateRevision: revision - 1 }, exists: true, visibility: "private", payload, metadata, published: true });
    editor = { payload: copy(side.beforeState), metadata };
  }
  f.values.set(prefix(planPrefix, binding) + plan.id, canonicalTemplateJson({ version: 1, plan, digest: hash(plan), cancelRequested: false }));
  const journalKeys = [];
  for (const [index, intent] of plan.operations.entries()) {
    const { id: ignored, ...encoded } = intent, payloadDigest = hash(encoded), committed = version === 1 && index === 0;
    const receipt = { operation: { ...Object.fromEntries(["id", "environment", "actorId", "listId", "itemKey", "kind"].map(key => [key, intent[key]])),
      payloadDigest, state: committed ? "committed" : "rejected" }, result: committed
      ? { status: 200, payload: { ok: true, listId: binding.listId, itemKey: binding.itemKey, stateRevision: revision, visibility: "private", indexes: [] } }
      : { status: 409, payload: { ok: false, code: "operation_cancelled", cancellation: {
        version: 1, operationId: intent.id, noBusinessEffects: true, operationCannotApply: true } } } };
    const row = version === 8 ? { version: 1, kind: "admin-template-photo-copy", intent, payloadDigest, recordIntentHash: copyRecord.intentHash,
      dispatched: false, stageReceipts: copyRecord.stages.map(() => null), receipt, cancelRequested: true }
      : { version: 1, intent, payloadDigest, dispatched: committed, receipt, cancelRequested: !committed };
    const key = prefix(version === 8 ? "bike-packing-admin-photo-copy-commands-v1:" : ordinaryPrefix, binding) + intent.id;
    journalKeys.push(key); f.values.set(key, canonicalTemplateJson(row));
  }
  f.activate(sideIndex);
  const source = { ...copy(side.beforeState.layouts[layoutId].adminCausalSource), planId: plan.id, base: { operationId: plan.id } };
  const server = { ok: true, ...binding, exists: true, deleted: false, stateRevision: revision, visibility: "private", indexes: [], payload, metadata };
  const plans = f.api.adminTemplatePlansFor(binding, layoutId, true), client = f.deps.adminTemplateClient(binding, layoutId, true),
    copyClient = f.deps.adminTemplatePhotoCopyClient(binding, layoutId, true);
  const general = { ...client, prepare: async () => copy(server) };
  const recovery = createAdminTemplateRecovery({ binding, getContext: () => f.actualContext(binding, layoutId), plans,
    client: general, photoCopyClient: copyClient, storage: f.storage, locks: f.locks, enabled: true });
  const choice = createAdminTemplateStopChoice({ binding, layoutId, priorPlanId: plan.id, getContext: () => f.actualContext(binding, layoutId),
    getSource: () => source, snapshot: () => editor, plans, recovery, client: general, photoCopyClient: copyClient,
    projectServer: (value, id) => projectAdminTemplateServerVariant(f.state.layouts[layoutId], value, id,
      { photoBinding: binding, photoOwnerMapEnabled: true }), storage: f.storage, locks: f.locks, enabled: true });
  f.values.delete(f.planKey);
  await recovery.captureStop(plan.id, editor);
  const selected = await choice.choose(await choice.open(), { variant: "server" }), marker = { choiceId: selected.id, priorPlanId: plan.id };
  f.state.layouts[layoutId].adminCausalSource.adoptedStop = marker;
  f.values.set(f.planKey, canonicalTemplateJson(f.saved)); f.activate(1);
  return { binding, layoutId, plan, marker, journalKeys, choice };
}

test("actual OFF app factory reads complete V9, and inventory requires that exact plan plus IDB before entering task", async () => {
  const f = await fixture(); assert.deepEqual(await f.api.adminTemplatePlansFor(f.binding, f.sides[1].layoutId, true).read(f.id), f.saved);
  assert.equal(await f.check(), "admitted"); assert.equal(f.server.calls.length, 0);
  assert.ok(f.factories.filter(row => row.name === "tree-store" || row.name === "tree-client").every(row => row.options.enabled === false));
  for (const mutation of [() => f.values.delete(f.planKey), () => f.values.set(f.planKey, "{"),
    () => { const row = copy(f.saved); row.plan.recordIntentHash = hash("other"); row.digest = hash(row.plan); f.values.set(f.planKey, canonicalTemplateJson(row)); },
    () => { const row = copy(f.saved); row.cancelRequested = true; f.values.set(f.planKey, canonicalTemplateJson(row)); }]) {
    mutation(); await assert.rejects(f.check(() => assert.fail("Invalid plan")));
    f.values.set(f.planKey, canonicalTemplateJson(f.saved));
  }
  f.idb.rows().clear(); await assert.rejects(f.check(() => assert.fail("Missing IDB"))); noPosts(f);
});

test("actual client may persist its stages, dispatched and final receipt while both inventory scope generations remain active", async () => {
  const f = await fixture(), originalPlan = f.values.get(f.planKey);
  assert.deepEqual(await f.run(), f.receipt); assert.equal(f.server.stagePosts.length, 4); assert.equal(f.server.savePosts.length, 1);
  assert.equal(f.values.get(f.planKey), originalPlan); assert.ok(f.scopes.length >= 6);
  for (const scope of f.scopes) assert.throws(scope.assertCurrent);
  const own = JSON.parse(f.values.get(prefix(commandPrefix, f.binding) + f.id));
  assert.ok(own.dispatched); assert.deepEqual(own.receipt, f.receipt); assert.equal(own.stageReceipts.filter(Boolean).length, 4);
  assert.equal(await f.check(), "admitted", "known committed own journal remains fully readable with gates OFF");
});

for (const fault of ["delete", "replace", "bytes-only"]) test(`actual client beginWrite followed by own-plan ${fault} is stopped synchronously before POST`, async () => {
  const f = await fixture(); let triggered = false;
  f.controls.afterBegin = () => {
    triggered = true;
    if (fault === "delete") f.values.delete(f.planKey);
    if (fault === "replace") { const row = copy(f.saved); row.plan.editorSnapshot.metadata.description = "later";
      row.digest = hash(row.plan); f.values.set(f.planKey, canonicalTemplateJson(row)); }
    if (fault === "bytes-only") f.values.set(f.planKey, JSON.stringify(f.saved, null, 2));
  };
  await assert.rejects(f.run()); assert.ok(triggered); noPosts(f);
  assert.equal(f.idb.rows().size, 1); assert.ok(f.values.has(prefix(commandPrefix, f.binding) + f.id));
});

test("own immutable journal substitution after beginWrite fails; a typed malformed mutable receipt fails next admission", async () => {
  const f = await fixture(), key = prefix(commandPrefix, f.binding) + f.id;
  f.controls.afterBegin = () => { const row = JSON.parse(f.values.get(key)); row.recordIntentHash = hash("other"); f.values.set(key, canonicalTemplateJson(row)); };
  await assert.rejects(f.run()); noPosts(f);
  const second = await fixture(); await second.make().client.capture(second.record.action);
  const secondKey = prefix(commandPrefix, second.binding) + second.id, row = JSON.parse(second.values.get(secondKey));
  row.stageReceipts[0] = { ok: true }; second.values.set(secondKey, canonicalTemplateJson(row));
  await assert.rejects(second.check()); noPosts(second);
});

test("real ordinary orphan journals on either side block current or pending bases, while old numeric history remains readable", async () => {
  const f = await fixture();
  for (const [index, binding] of f.bindings.entries()) {
    const revision = f.sides[index].beforeState.layouts[f.sides[index].layoutId].adminCausalSource.base.stateRevision;
    for (const base of [{ stateRevision: revision }, { operationId: crypto.randomUUID() }]) {
      const row = f.ordinaryRow(binding, base); await assert.rejects(f.check()); f.values.delete(prefix(ordinaryPrefix, binding) + row.intent.id);
    }
    f.ordinaryRow(binding, { stateRevision: revision - 1 });
  }
  assert.equal(await f.check(), "admitted"); noPosts(f);
});

test("all five raw journal namespaces retain malformed entries while OFF; none silently become an empty inventory", async () => {
  const f = await fixture();
  for (const binding of f.bindings) for (const kind of [planPrefix, ordinaryPrefix, "bike-packing-admin-photo-copy-commands-v1:", commandPrefix]) {
    const key = prefix(kind, binding) + crypto.randomUUID(); f.values.set(key, "{");
    await assert.rejects(f.check()); f.values.delete(key);
  }
  const key = "bike-packing-admin-order-v1:" + encodeURIComponent(f.binding.actorId) + ":" + crypto.randomUUID();
  f.values.set(key, "{"); await assert.rejects(f.check()); f.values.delete(key); assert.equal(await f.check(), "admitted"); noPosts(f);
});

test("another fully decoded tree IDB orphan blocks even on an older base, independent of tree flags and missing command/plan", async () => {
  const f = await fixture(), other = await treeCopyClientFixture({ targetRevision: f.intent.body.base.stateRevision - 1 });
  for (const [key, value] of other.idb.rows()) f.idb.rows().set(key, copy(value));
  await assert.rejects(f.check()); assert.equal(f.idb.rows().size, 2); noPosts(f);
});

test("real upload and V8 IDB readers reject corrupt orphan rows instead of hiding them when gates are OFF", async () => {
  const f = await fixture();
  for (const [name, create] of [["bike-packing-admin-template-photo-actions-v1", f.upload],
    ["bike-packing-admin-template-photo-copy-actions-v1", f.v8Store]]) {
    for (const binding of f.bindings) {
      await create(binding).ids(); const rows = f.idb.databases.get(name).stores.get("actions"), id = crypto.randomUUID();
      const bindingKey = canonicalTemplateJson(binding), key = canonicalTemplateJson([bindingKey, id]);
      rows.set(key, { key, bindingKey, operationId: id, intentJson: "{", intentHash: hash("bad") });
      await assert.rejects(f.check()); rows.delete(key);
    }
  }
  assert.equal(await f.check(), "admitted"); noPosts(f);
});

test("actual valid upload and V8 packages at the chosen base remain barriers without any plan, including a V8 command with missing IDB", async () => {
  const f = await fixture(), uploadInput = rebind(await adminPhotoRecordFixture(), f.binding), revision = f.intent.body.base.stateRevision;
  uploadInput.action.body.base.stateRevision = revision;
  uploadInput.snapshot.ownerMap.stateRevision = revision;
  uploadInput.snapshot.state.layouts[uploadInput.snapshot.layoutId].adminCausalSource.base.stateRevision = revision;
  for (const [index, file] of uploadInput.files.entries()) {
    file.stage.baseStateRevision = revision;
    uploadInput.action.body.photoAppend.assets[index].assetDigest = await adminTemplatePhotoStageDigest(file.stage);
  }
  await f.upload(f.binding, true).capture({ action: uploadInput.action, snapshot: uploadInput.snapshot, files: uploadInput.files });
  await assert.rejects(f.check()); f.idb.databases.get("bike-packing-admin-template-photo-actions-v1").stores.get("actions").clear();
  const input = rebind(await adminPhotoCopyRecordInput(), f.binding), target = input.snapshot.target;
  input.action.body.base.stateRevision = revision;
  target.ownerMap.stateRevision = revision;
  target.beforeState.layouts[target.layoutId].adminCausalSource.base.stateRevision = revision;
  target.beforeState.layouts[target.layoutId].adminCausalSource.photoOwnerMap.stateRevision = revision;
  const manifests = await adminTemplatePhotoCopyStageManifests(adminTemplatePhotoCopyIntent({ ...input.binding, ...input.action }));
  for (const [index, manifest] of manifests.entries()) input.action.body.photoCopy.assets[index].assetDigest = await adminTemplatePhotoCopyStageDigest(manifest);
  const store = f.v8Store(f.binding, true);
  await store.capture({ action: input.action, snapshot: input.snapshot }); await assert.rejects(f.check());
  const client = createAdminTemplatePhotoCopyClient({ binding: f.binding, getContext: () => f.context(f.binding), store,
    storage: f.storage, locks: f.locks, transport: f.transport, enabled: true, adminEnabled: true, appendEnabled: true, createEnabled: true });
  await client.capture(input.action); f.idb.databases.get("bike-packing-admin-template-photo-copy-actions-v1").stores.get("actions").clear();
  await assert.rejects(f.check()); noPosts(f);
});

test("inventory scopes guard late foreign writes and context loss, expire after callback, and reject fabricated leases before readers", async () => {
  const f = await fixture(); let retained;
  await f.check(async scope => { retained = scope; await Promise.resolve(); scope.assertCurrent(); });
  assert.throws(retained.assertCurrent);
  await assert.rejects(f.check(async scope => {
    f.ordinaryRow(f.bindings[0], f.sides[0].beforeState.layouts[f.sides[0].layoutId].adminCausalSource.base); scope.assertCurrent();
  }));
  for (const key of [...f.values.keys()]) if (key.startsWith(ordinaryPrefix)) f.values.delete(key);
  await assert.rejects(f.check(async scope => { f.current.actorId = "foreign"; scope.assertCurrent(); }));
  f.current.actorId = f.binding.actorId;
  const count = f.factories.length;
  await assert.rejects(f.api.withAdminTemplatePhotoTreeCopyDispatchInventory({ record: f.record, bindings: f.bindings,
    captureLease: Object.freeze({}), assertCurrent() {} }, () => assert.fail("Fake lease")));
  assert.equal(f.factories.length, count); noPosts(f);
});

test("actual adopted V8 stop proof releases only that old action, stays byte-bound, and cannot exclude another V9", async () => {
  const f = await fixture(), layoutId = f.sides[1].layoutId;
  let input = rebind(await adminPhotoCopyRecordInput(), f.binding);
  input = JSON.parse(JSON.stringify(input).replaceAll(input.snapshot.target.layoutId, layoutId));
  const target = input.snapshot.target, revision = f.intent.body.base.stateRevision;
  input.action.body.base.stateRevision = revision; target.ownerMap.stateRevision = revision;
  const priorSource = target.beforeState.layouts[layoutId].adminCausalSource;
  priorSource.base.stateRevision = revision; priorSource.photoOwnerMap.stateRevision = revision;
  const manifests = await adminTemplatePhotoCopyStageManifests(adminTemplatePhotoCopyIntent({ ...input.binding, ...input.action }));
  for (const [index, manifest] of manifests.entries()) input.action.body.photoCopy.assets[index].assetDigest = await adminTemplatePhotoCopyStageDigest(manifest);
  const retained = await f.v8Store(f.binding, true).capture({ action: input.action, snapshot: input.snapshot });
  const oldId = retained.action.operationId, editor = adminTemplatePhotoCopyEditorSnapshot(retained);
  const plan = adminTemplatePhotoCopySavePlan({ binding: f.binding, operationId: oldId, body: retained.action.body,
    editorSnapshot: editor, recordIntentHash: retained.intentHash });
  f.values.set(prefix(planPrefix, f.binding) + oldId, canonicalTemplateJson({ version: 1, plan, digest: hash(plan), cancelRequested: false }));
  const intent = plan.operations[0], { id: ignored, ...encoded } = intent, payloadDigest = hash(encoded);
  const receipt = { operation: { ...Object.fromEntries(["id", "environment", "actorId", "listId", "itemKey", "kind"].map(key => [key, intent[key]])),
    payloadDigest, state: "rejected" }, result: { status: 409, payload: { ok: false, code: "operation_cancelled",
    cancellation: { version: 1, operationId: oldId, noBusinessEffects: true, operationCannotApply: true } } } };
  f.values.set(prefix("bike-packing-admin-photo-copy-commands-v1:", f.binding) + oldId, canonicalTemplateJson({ version: 1,
    kind: "admin-template-photo-copy", intent, payloadDigest, recordIntentHash: retained.intentHash, dispatched: false,
    stageReceipts: retained.stages.map(() => null), receipt, cancelRequested: true }));
  await assert.rejects(f.check());
  const plans = f.api.adminTemplatePlansFor(f.binding, layoutId, true), client = f.deps.adminTemplatePhotoCopyClient(f.binding, layoutId, true);
  const server = { ok: true, ...f.binding, exists: true, deleted: false, visibility: "private", stateRevision: revision,
    payload: copy(retained.action.body.payload), metadata: copy(retained.action.body.metadata), indexes: [] };
  const general = { prepare: async () => copy(server), read: () => assert.fail("V8 must use its typed client") };
  const recovery = createAdminTemplateRecovery({ binding: f.binding, getContext: () => f.context(f.binding),
    plans, client: general, photoCopyClient: client, storage: f.storage, locks: f.locks, enabled: true });
  const pendingSource = { ...copy(priorSource), planId: oldId, base: { operationId: oldId }, photoCopyPending: oldId };
  const factory = (binding, id) => {
    assert.deepEqual(binding, f.binding); assert.equal(id, layoutId);
    return createAdminTemplateStopChoice({ binding, layoutId, priorPlanId: oldId, getContext: () => f.context(binding),
      getSource: () => pendingSource, snapshot: () => editor, plans, recovery, client: general, photoCopyClient: client,
      storage: f.storage, locks: f.locks, enabled: true,
      projectServer: (value, id) => projectAdminTemplateServerVariant(target.beforeState.layouts[layoutId], value, id,
        { photoBinding: binding, photoOwnerMapEnabled: true }) });
  };
  // The accepted old choice precedes the new V9 capture. Its real protocol
  // decoders, terminal receipt and recovery marker grant the exclusion.
  f.values.delete(f.planKey);
  await recovery.captureStop(oldId, editor);
  const choice = factory(f.binding, layoutId), selected = await choice.choose(await choice.open(), { variant: "server" });
  f.values.set(f.planKey, canonicalTemplateJson(f.saved));
  const marker = { choiceId: selected.id, priorPlanId: oldId };
  f.state.layouts[layoutId].adminCausalSource.adoptedStop = marker; f.stopChoices.set(oldId, factory);
  assert.deepEqual(await choice.excludedPlans(marker), [oldId]); assert.equal(await f.check(), "admitted");
  const other = await treeCopyClientFixture({ targetRevision: revision - 1 });
  for (const [key, value] of other.idb.rows()) f.idb.rows().set(key, copy(value));
  await assert.rejects(f.check());
  for (const key of other.idb.rows().keys()) f.idb.rows().delete(key);
  const stopKey = prefix("bike-packing-admin-stop-v1:", f.binding) + oldId;
  await assert.rejects(f.check(async scope => { f.values.delete(stopKey); scope.assertCurrent(); }));
  await assert.rejects(f.check()); noPosts(f);
});

test("input is detached before awaits and asynchronous rejected upstream guards cannot escape as unhandled promises", async () => {
  const f = await fixture();
  await withAdminTemplateCapture({ bindings: f.bindings, locks: f.locks }, async captureLease => {
    const record = copy(f.record), bindings = copy(f.bindings);
    const pending = f.api.withAdminTemplatePhotoTreeCopyDispatchInventory({ record, bindings, captureLease, assertCurrent() {} }, scope => {
      assert.equal(scope.recordIntentHash, f.record.intentHash); scope.assertCurrent(); return "detached";
    });
    record.action.body.photoCopy.fields.name = "mutated input"; bindings[0].actorId = "foreign";
    assert.equal(await pending, "detached");
    await assert.rejects(f.api.withAdminTemplatePhotoTreeCopyDispatchInventory({ record: f.record, bindings: f.bindings, captureLease,
      assertCurrent: async () => { throw Error("Asynchronous authority is invalid"); } }, () => assert.fail("Async guard")));
    await new Promise(resolve => setImmediate(resolve));
  });
  noPosts(f);
});

test("actual reader guards reject actor loss during an IDB await and a full-record mismatch despite matching action and cached hash", async () => {
  const f = await fixture(); let changed = false;
  f.idb.controls.onGet = () => { if (!changed) { changed = true; f.current.actorId = "foreign"; } };
  await assert.rejects(f.check()); assert.ok(changed);
  f.idb.controls.onGet = () => {}; f.current.actorId = f.binding.actorId;
  const different = copy(f.record); different.snapshot.copiedOwners[0].localId = "replacement-local-id";
  await assert.rejects(f.check(() => assert.fail("Snapshot was not proved"), different));
  assert.deepEqual(await f.store.read(f.id), f.record); noPosts(f);
});

test("actual inactive-source context reads proven V8 adoption through preparing, without granting its ordinary active-editor context", async () => {
  const f = await fixture({ actualStopFactories: true }), accepted = await acceptedHistory(f);
  assert.equal(f.actualContext(accepted.binding, accepted.layoutId).admin, false);
  assert.equal(f.actualContext(accepted.binding, accepted.layoutId, true).admin, true);
  await assert.rejects(f.api.adminTemplatePhotoExcludedPlans(accepted.binding, accepted.layoutId));
  assert.deepEqual(await f.api.adminTemplatePhotoExcludedPlans(accepted.binding, accepted.layoutId, true), [accepted.plan.id]);
  assert.equal(await f.check(), "admitted");
  await assert.rejects(f.check(async scope => { f.current.actorId = "other-actor"; scope.assertCurrent(); }));
  f.current.actorId = f.binding.actorId;
  await assert.rejects(f.check(async scope => { f.activate(0); scope.assertCurrent(); })); noPosts(f);
});

test("actual V1 save-committed/publication-cancelled adoption excludes both exact intents, but neither a forged UUID reuse nor a V9", async () => {
  const f = await fixture({ actualStopFactories: true }), accepted = await acceptedHistory(f, { sideIndex: 1, version: 1 });
  assert.equal(accepted.plan.operations.length, 2); assert.notEqual(accepted.plan.operations[0].id, accepted.plan.operations[1].id);
  assert.deepEqual(await f.api.adminTemplatePhotoExcludedPlans(accepted.binding, accepted.layoutId, true), [accepted.plan.id]);
  assert.equal(await f.check(), "admitted");
  const key = accepted.journalKeys[1], raw = f.values.get(key), row = JSON.parse(raw);
  row.intent.body.published = false; const { id: ignored, ...encoded } = row.intent;
  row.payloadDigest = hash(encoded); row.receipt.operation.payloadDigest = row.payloadDigest;
  f.values.set(key, canonicalTemplateJson(row)); await assert.rejects(f.check()); f.values.set(key, raw);
  const extra = await treeCopyClientFixture({ targetRevision: f.intent.body.base.stateRevision - 1 });
  for (const [id, value] of extra.idb.rows()) f.idb.rows().set(id, copy(value));
  await assert.rejects(f.check()); noPosts(f);
});
