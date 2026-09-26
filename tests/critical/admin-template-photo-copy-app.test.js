import { readNoteFields } from "../../src/ui/rich-note-content.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminPhotoCopyClientFixture, copy } from "../fixtures/admin-template-photo-copy-client-fixture.js";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoNamespace, adminTemplatePhotoEditorSnapshot } from "../../src/public/admin-template-photo-state.js";
import { adminTemplatePhotoCopySavePlan, adminTemplatePhotoCopyEditorSnapshot, assertAdminTemplatePhotoCopyPlanRecord } from "../../src/sync/admin-template-photo-copy-save-plan.js";
import { projectAdminTemplateServerVariant, applyAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";
import { preserveAdminTemplatePhotoCopyOwnerIds } from "../../src/public/admin-template-photo-copy-flow.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { withAdminTemplateCapture } from "../../src/sync/admin-template-capture-lease.js";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const tail = readFileSync(new URL("../../src/app/app-tail-controllers.js", import.meta.url), "utf8");
function actual(source, names, deps) {
  const text = names.map(name => { const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`)); assert.ok(match, name); return match[0]; }).join("\n");
  return new Function(...Object.keys(deps), `${text}\nreturn { ${names.join(",")} };`)(...Object.values(deps));
}
async function fixture(entityType = "item") {
  const f = await adminPhotoCopyClientFixture({ entityType }), target = f.record.snapshot.target, source = f.record.snapshot.source;
  const state = copy(target.beforeState);
  for (const type of ["layouts", "items", "containers"]) Object.assign(state[type], copy(source.beforeState[type]));
  state.layouts.personal = { id: "personal", name: "Private", rootContainerIds: [] };
  state.items.private = { id: "private", name: "Private unsaved", opaque: { selected: [7, 2] } };
  f.values.set("mirror", JSON.stringify(state)); f.values.set("private-form", "kept");
  const controls = { afterRead: null, asyncMirror: false, writes: 0 }, store = { binding: f.binding, async read(id) { const value = await f.store.read(id); controls.afterRead?.(); return value; } };
  const plan = adminTemplatePhotoCopySavePlan({ binding: f.binding, operationId: f.id, body: f.record.action.body,
    editorSnapshot: adminTemplatePhotoCopyEditorSnapshot(f.record), recordIntentHash: f.record.intentHash });
  const api = actual(app, ["persistRequiredPersonalMirror", "persistAdminTemplatePhotoMirror", "applyAdminTemplatePhotoCopyPending", "applyAdminTemplatePhotoCreateArrangement", "applyAdminTemplateConfirmedPhotoCopyResult"], {
    state, canonicalTemplateJson, clone: copy, adminTemplatePhotoNamespace, adminTemplatePhotoEditorSnapshot, adminTemplatePhotoCopyEditorSnapshot,
    assertAdminTemplatePhotoCopyPlanRecord, adminTemplatePhotoCopyStore: () => store, adminTemplateOperationContext: () => f.current,
    projectAdminTemplateServerVariant, preserveAdminTemplatePhotoCopyOwnerIds, applyAdminTemplateServerVariant,
    readPersonalLocalValue: key => f.storage.getItem(key), ownsPersonalMirror: () => controls.asyncMirror,
    writePersonalMirror: async (key, raw) => { controls.writes++; await Promise.resolve(); f.storage.setItem(key, raw); },
    scopedLocalStorageKey: () => "mirror", STORAGE_KEY: "mirror", localStorage: f.storage, localStorageScopeKey: `id:${f.binding.actorId}`, render() {} });
  const pending = () => api.applyAdminTemplatePhotoCopyPending(f.record);
  const finish = () => {
    const nextSource = { ...state.layouts[target.layoutId].adminCausalSource, planId: null, base: { stateRevision: f.receipt.result.payload.stateRevision },
      lastConfirmedOperation: { id: f.id, kind: "template.save" } };
    delete nextSource.photoCopyPending;
    return api.applyAdminTemplateConfirmedPhotoCopyResult(target.layoutId, { plan, receipt: f.receipt, source: nextSource });
  };
  const recovery = (enabled = true) => {
    const client = f.make({ enabled }).client;
    const plans = createAdminTemplateSavePlans({ binding: f.binding, getContext: () => f.current, client: {}, photoCopyStore: f.store,
      photoCopyClient: client, photoCopyEnabled: enabled, enabled: true, storage: f.storage, locks: f.locks });
    const resume = actual(app, ["resumeAdminTemplatePhotoCopyForm"], { state, canonicalTemplateJson, adminTemplatePhotoNamespace,
      adminTemplateUiEnabled: () => true, administrativePhotoForms: new Map(), adminTemplateOperationContext: () => f.current,
      adminTemplatePhotoCopyStore: () => f.store, adminTemplatePhotoExcludedPlans: async () => [], withAdminTemplateCapture,
      navigator: { locks: f.locks }, adminTemplatePlansFor: () => plans, ADMIN_TEMPLATE_PHOTO_COPY_ENABLED: enabled,
      adminTemplatePhotoCopyEditorSnapshot, adminTemplatePhotoCopyClient: () => client, applyAdminTemplatePhotoCopyPending: api.applyAdminTemplatePhotoCopyPending });
    return { plans, client, run: () => resume.resumeAdminTemplatePhotoCopyForm(state.layouts[target.layoutId]) };
  };
  return { ...f, state, target, source, plan, api, controls, pending, finish, recovery };
}
for (const type of ["item", "container"]) test(`${type}: actual V8 apply retains preallocated and existing IDs, source, private drafts and full raw receipt`, async () => {
  const f = await fixture(type), beforeSource = adminTemplatePhotoNamespace(f.state, f.source.layoutId), beforePrivate = copy(f.state.items.private);
  await f.pending();
  const mirror = JSON.parse(f.values.get("mirror")); mirror.items.private.note = "New private edit from another tab"; f.values.set("mirror", JSON.stringify(mirror));
  assert.equal(await f.finish(), true);
  const result = f.state.layouts[f.target.layoutId], owner = f.record.snapshot.copiedOwner;
  assert.equal(f.state[type === "item" ? "items" : "containers"][owner.localId].id, owner.localId);
  for (const row of f.target.ownerMap.owners) assert.ok(f.state[row.type][row.localId]);
  assert.deepEqual(adminTemplatePhotoNamespace(f.state, f.source.layoutId), beforeSource); assert.deepEqual(f.state.items.private, beforePrivate);
  assert.deepEqual(result.adminCausalSource.canonicalPayload, f.receipt.result.payload.photoCopy.confirmedPayload);
  assert.equal(result.adminCausalSource.photoCopyPending, undefined);
  assert.deepEqual(result.arrangement, f.target.beforeState.layouts[f.target.layoutId].arrangement);
  assert.equal(JSON.parse(f.values.get("mirror")).items.private.note, "New private edit from another tab"); assert.equal(f.values.get("private-form"), "kept");
  assert.deepEqual(await f.store.read(f.id), f.record);
});
test("actual confirmed copy quota preserves pending namespace and exact record for cold retry", async () => {
  const f = await fixture(); await f.pending(); const before = copy(f.state), mirror = f.values.get("mirror");
  const previous = f.storage.setItem; f.storage.setItem = (key, value) => { if (key === "mirror") throw Error("Quota"); previous(key, value); };
  await assert.rejects(f.finish(), /Quota/); assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror);
  assert.deepEqual(await f.store.read(f.id), f.record);
  f.storage.setItem = previous; assert.equal(await f.finish(), true);
});
test("async owned-mirror rejection rolls back copy pending state while retaining the immutable action", async () => {
  const f = await fixture(), before = copy(f.state), mirror = f.values.get("mirror"); f.controls.asyncMirror = true;
  const write = f.storage.setItem;
  f.storage.setItem = (key, raw) => { if (key === "mirror") throw Error("Async mirror quota"); return write(key, raw); };
  await assert.rejects(f.pending(), /Async mirror quota/);
  assert.equal(f.controls.writes, 1); assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror);
  assert.deepEqual(await f.store.read(f.id), f.record); assert.equal(f.server.calls.length, 0);
  f.storage.setItem = write; await f.pending(); assert.equal(f.controls.writes, 2);
  assert.equal(JSON.parse(f.values.get("mirror")).layouts[f.target.layoutId].adminCausalSource.photoCopyPending, f.id);
});

test("actual confirmed copy refuses foreign ID collisions and edits appearing during record validation", async () => {
  for (const kind of ["layouts", "items", "containers"]) {
    const f = await fixture(); await f.pending(); const id = f.record.snapshot.copiedOwner.localId;
    f.state[kind][id] = { id, name: "Unrelated" }; const before = copy(f.state);
    await assert.rejects(f.finish()); assert.deepEqual(f.state, before);
  }
  const f = await fixture(); await f.pending();
  f.controls.afterRead = () => { f.state.layouts[f.target.layoutId].name = "Changed after await"; };
  await assert.rejects(f.finish(), /Получатель изменился/); assert.equal(f.state.layouts[f.target.layoutId].name, "Changed after await");
  assert.equal(f.state.items[f.record.snapshot.copiedOwner.localId], undefined);
});
test("actual cold IDB-only recovery keeps both before namespaces when plan quota fails, then captures the same V8 without dispatch", async () => {
  const f = await fixture(), before = copy(f.state), mirror = f.values.get("mirror"), active = f.recovery();
  const previous = f.storage.setItem;
  f.storage.setItem = (key, value) => { if (key.startsWith("bike-packing-admin-save-plans-v1:")) throw Error("Quota"); previous(key, value); };
  await assert.rejects(active.run()); assert.deepEqual(f.state, before); assert.equal(f.values.get("mirror"), mirror);
  assert.deepEqual(await f.store.read(f.id), f.record); assert.equal(await active.plans.read(f.id), null);
  f.storage.setItem = previous;
  await active.run(); assert.equal((await active.plans.read(f.id)).plan.id, f.id);
  assert.equal(f.state.layouts[f.target.layoutId].adminCausalSource.photoCopyPending, f.id);
  assert.deepEqual(adminTemplatePhotoNamespace(f.state, f.source.layoutId), adminTemplatePhotoNamespace(before, f.source.layoutId));
  assert.equal(f.server.calls.length, 0); assert.equal(f.state.items[f.record.snapshot.copiedOwner.localId], undefined);
});
test("actual OFF cold recovery reads a retained V8 but cannot invent a plan for an IDB-only orphan", async () => {
  const f = await fixture(), before = copy(f.state), off = f.recovery(false);
  await assert.rejects(off.run(), /выключено/); assert.deepEqual(f.state, before); assert.equal(await off.plans.read(f.id), null);
  await f.recovery().run();
  // Reconstruct the editor's pre-marker snapshot, as after a mirror quota or
  // a cold load of a previously saved private mirror; retained IDB/journals stay.
  for (const key of Object.keys(f.state)) delete f.state[key]; Object.assign(f.state, copy(before)); f.values.set("mirror", JSON.stringify(before));
  await off.run(); assert.equal(f.state.layouts[f.target.layoutId].adminCausalSource.photoCopyPending, f.id);
  assert.equal((await off.plans.read(f.id)).plan.recordIntentHash, f.record.intentHash);
  assert.equal(f.server.calls.length, 0); assert.deepEqual(await f.store.read(f.id), f.record);
});
test("actual bag picker snapshot remains bound to source roots after target activation", () => {
  const state = { layouts: { source: { id: "source", rootContainerIds: ["source-bag"] }, target: { id: "target", rootContainerIds: ["target-bag"] } },
    containers: { "source-bag": { id: "source-bag", parentId: "" } }, locations: ["Base"] };
  let active = "source";
  const refs = Object.fromEntries(["rootContainerName", "rootContainerWeight", "rootContainerVolume", "rootContainerColor", "rootContainerLocation", "rootContainerNote"].map(key => [key, { value: "" }]));
  const api = actual(tail, ["getRootContainerDialogLayoutRootIds", "getRootContainerDialogSnapshot"], { state, refs, readNoteFields,
    runtime: { editingRootContainerId: "source-bag" }, getPublishedWorkLayout: () => state.layouts[active], getVisibleLayoutRootIds: layout => layout.rootContainerIds,
    readRootContainerDialogDimensions: () => ({}), parseWeightInput: Number, parseVolumeInput: Number, normalizeContainerColor: value => value,
    defaultRootContainerLocation: () => "Base", getRootContainerDialogSelectedCategories: () => [], getRootContainerDialogPhotoSnapshot: () => "original-photos" });
  const before = api.getRootContainerDialogSnapshot(); active = "target";
  assert.notDeepEqual(api.getRootContainerDialogSnapshot(), before); assert.deepEqual(api.getRootContainerDialogSnapshot("source"), before);
});
test("actual item and bag copy handlers open the picker before its initial eligibility render", async () => {
  for (const type of ["Item", "RootContainer"]) {
    const dialog = { open: false }, calls = [], runtime = { editingItemId: "item", editingRootContainerId: "bag" };
    const api = actual(tail, [type === "Item" ? "openItemCopyContainerPickerDialog" : "openRootContainerCopyPickerDialog"], {
      refs: { containerPickerDialog: dialog }, runtime, state: { items: { item: { id: "item" } }, containers: { bag: { id: "bag" } } },
      warnUnavailableItemDialogPlacement: () => false, getPublishedEditLayoutId: () => "source", isContainerNestedInLayout: () => false,
      ensureAdminPublicCopyTargetsAvailable: async () => {}, offerCreateLayoutWhenNoCopyTargets: async () => false,
      containerPickerSourceIsNestedContainer: false, containerPickerCopyIncludesContents: false, rootContainerDialogCopyIncludesContents: false,
      adminTemplatePhotoCopyPickerSession: null,
      openModalDialog: () => { dialog.open = true; calls.push("open"); },
      renderContainerPicker: () => { assert.equal(dialog.open, true); calls.push("render"); } });
    await Object.values(api)[0](); assert.deepEqual(calls, ["open", "render"]);
  }
});
