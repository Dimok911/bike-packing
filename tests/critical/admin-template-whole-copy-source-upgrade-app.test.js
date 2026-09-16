import test from "node:test";
import assert from "node:assert/strict";
import { wholeAppRunnerFixture } from "../fixtures/admin-template-photo-whole-copy-runner-fixture.js";
import { prepareAdminTemplateWholeCopySourceUpgrade } from "../../src/public/admin-template-whole-copy-source-upgrade.js";
import { assertAdminTemplatePhotoView } from "../../src/sync/admin-template-photo-view.js";

async function fixture({ switchContext = false } = {}) {
  const f = await wholeAppRunnerFixture(), layout = f.state.layouts[f.layoutId], dispatched = [];
  layout.templatePublished = true; layout.adminCausalSource.visibility = "public";
  delete layout.adminCausalSource.photoOwnerMap; delete layout.adminCausalSource.canonicalPayload;
  const binding = layout.adminCausalSource.binding, prepared = { ok: true, ...binding, indexes: [], exists: true,
    visibility: "public", stateRevision: layout.adminCausalSource.base.stateRevision,
    payload: f.record.action.body.photoCopy.sourcePayload, metadata: f.source.metadata };
  let persisted = null;
  const app = f.build({ names: ["createCausalAdminTemplateCopy"], deps: {
    prepareAdminTemplateWholeCopySourceUpgrade,
    adminTemplateClient: (actualBinding, layoutId, preparing) => {
      assert.deepEqual(actualBinding, binding); assert.equal(layoutId, f.layoutId); assert.equal(preparing, true);
      return { prepare: async () => structuredClone(prepared) };
    },
    adminTemplateSaveCoordinator: () => ({ hasPendingCapture: () => false }),
    persistStateSnapshot: async (state, options) => {
      assert.equal(state, f.state); assert.deepEqual(options, { recordAction: false });
      persisted = structuredClone(state); await Promise.resolve();
      if (switchContext) f.current.generation = "route-after-persistence";
      return true;
    }
  }, replace: { createCausalAdminTemplateWholeCopy: async (...args) => { dispatched.push(args); return "whole-copy-started"; } } });
  return { ...f, layout, app, dispatched, persisted: () => persisted };
}

test("actual existing-public-source upgrade rejects a context switch during async mirror persistence before whole-copy dispatch", async () => {
  const f = await fixture({ switchContext: true }), before = structuredClone(f.state);
  await assert.rejects(f.app.createCausalAdminTemplateCopy(f.layout, "New copy"), /Контекст копирования изменился/);
  assert.deepEqual(f.dispatched, []); assert.equal(f.server.calls.length, 0);
  assert.deepEqual(f.state, before);
  assert.ok(f.persisted().layouts[f.layoutId].adminCausalSource.photoOwnerMap);
  assert.deepEqual(f.persisted().items, before.items); assert.deepEqual(f.persisted().containers, before.containers);
});

test("actual unchanged existing-public-source upgrade persists real proof before entering whole-copy dispatch", async () => {
  const f = await fixture(), items = structuredClone(f.state.items), containers = structuredClone(f.state.containers);
  const validateSelection = () => true;
  assert.equal(await f.app.createCausalAdminTemplateCopy(f.layout, "New copy", { sourceKind: "shared", validateSelection }), "whole-copy-started");
  assert.equal(f.dispatched.length, 1);
  assert.equal(f.dispatched[0][0], f.layout); assert.equal(f.dispatched[0][1], "New copy");
  assert.deepEqual(f.dispatched[0][2], { sourceKind: "shared", validateSelection });
  assert.deepEqual(f.persisted().layouts[f.layoutId].adminCausalSource, f.layout.adminCausalSource);
  assert.ok(f.layout.adminCausalSource.photoOwnerMap); assert.ok(f.layout.adminCausalSource.canonicalPayload);
  assert.deepEqual(f.state.items, items); assert.deepEqual(f.state.containers, containers); assert.equal(f.server.calls.length, 0);
});

test("actual public snapshot serializes through its exact owner map without temporarily changing live IDs", async () => {
  const f = await wholeAppRunnerFixture(), layout = f.state.layouts[f.layoutId];
  layout.templatePublished = true; layout.adminCausalSource.visibility = "public";
  layout.adminCausalSource.canonicalPayload = structuredClone(f.record.action.body.photoCopy.sourcePayload);
  const before = structuredClone(f.state);
  const result = f.build({ names: ["adminTemplateCanonicalEditorSnapshot", "adminTemplateEditorSnapshot"],
    deps: { assertAdminTemplatePhotoView } }).adminTemplateEditorSnapshot(f.layoutId);
  assert.ok(result.payload);
  for (const owner of layout.adminCausalSource.photoOwnerMap.owners) {
    assert.equal(result.payload[owner.type][owner.serverId].id, owner.serverId);
    assert.equal(result.payload[owner.type][owner.serverId].name, f.state[owner.type][owner.localId].name);
    assert.deepEqual(result.payload[owner.type][owner.serverId].photos, layout.adminCausalSource.canonicalPayload[owner.type][owner.serverId].photos);
  }
  assert.deepEqual(f.state, before);
  f.flags.whole = false;
  assert.throws(() => f.build({ names: ["adminTemplateCanonicalEditorSnapshot"] }).adminTemplateCanonicalEditorSnapshot(f.layoutId),
    /Изменённые записи не связаны с исходным шаблоном/);
  assert.deepEqual(f.state, before);
});

test("actual public snapshot preserves ordinary pending name edits without granting copy or write authority", async () => {
  const f = await wholeAppRunnerFixture(), layout = f.state.layouts[f.layoutId];
  layout.templatePublished = true; layout.adminCausalSource.visibility = "public";
  layout.adminCausalSource.canonicalPayload = structuredClone(f.record.action.body.photoCopy.sourcePayload);
  const owner = layout.adminCausalSource.photoOwnerMap.owners.find(owner => owner.type === "items");
  f.state.items[owner.localId].name = "Ordinary unsaved public item name"; layout.name = "Ordinary unsaved template title";
  const before = structuredClone(f.state);
  const result = f.build({ names: ["adminTemplateCanonicalEditorSnapshot", "adminTemplateEditorSnapshot"],
    deps: { assertAdminTemplatePhotoView } }).adminTemplateEditorSnapshot(f.layoutId);
  assert.equal(result.payload.items[owner.serverId].name, "Ordinary unsaved public item name");
  assert.equal(result.metadata.title, "Ordinary unsaved template title");
  assert.deepEqual(f.state, before); assert.equal(f.server.calls.length, 0);
});

test("actual canonical snapshot still validates a private editor with whole-copy enabled", async () => {
  const f = await wholeAppRunnerFixture(), layout = f.state.layouts[f.layoutId];
  layout.adminCausalSource.canonicalPayload = structuredClone(f.record.action.body.photoCopy.sourcePayload);
  layout.adminCausalSource.photoOwnerMap.layoutId = "foreign-editor";
  const before = structuredClone(f.state);
  assert.throws(() => f.build({ names: ["adminTemplateCanonicalEditorSnapshot"] }).adminTemplateCanonicalEditorSnapshot(f.layoutId),
    /Изменённые записи не связаны с исходным шаблоном/);
  assert.deepEqual(f.state, before);
});
