import test from "node:test";
import assert from "node:assert/strict";
import { adminPhotoCopyClientFixture, copy } from "../fixtures/admin-template-photo-copy-client-fixture.js";
import { prepareAdminTemplatePhotoCopyForm, preserveAdminTemplatePhotoCopyOwnerIds } from "../../src/public/admin-template-photo-copy-flow.js";
import { createAdminTemplatePhotoCopyController } from "../../src/ui/admin-template-photo-copy-controller.js";
import { projectAdminTemplateServerVariant } from "../../src/public/admin-template-server-variant.js";

const inputFor = f => ({ binding: f.binding, operationId: f.id, sourcePayload: f.intent.body.photoCopy.source.payload,
  targetPayload: f.intent.body.payload, snapshot: f.record.snapshot, fields: f.intent.body.photoCopy.fields,
  assets: f.intent.body.photoCopy.assets.map(({ assetDigest, ...asset }) => asset) });

for (const entityType of ["item", "container"]) test(`${entityType}: actual form preparation reproduces the immutable paired record without allocating any ID`, async () => {
  const f = await adminPhotoCopyClientFixture({ entityType }), input = copy(inputFor(f));
  const pending = prepareAdminTemplatePhotoCopyForm(input);
  input.fields.name = "Later form"; input.sourcePayload.locations.push("Later source"); input.assets[0].photoId = "Later ID";
  const record = await pending; assert.deepEqual(record, f.record);
  assert.equal(f.server.calls.length, 0); assert.equal(record.snapshot.copiedOwner.serverId, f.intent.body.photoCopy.entityId);
});

test("copy preparation refuses an edited source/target and cannot reinterpret the chosen map or photo order", async () => {
  const f = await adminPhotoCopyClientFixture();
  for (const fault of ["source", "target", "owner", "photos"]) {
    const input = copy(inputFor(f));
    if (fault === "source") Object.values(input.snapshot.source.beforeState.items)[0].name = "Unsaved source";
    if (fault === "target") Object.values(input.snapshot.target.beforeState.items)[0].note = "Unsaved target";
    if (fault === "owner") input.snapshot.copiedOwner.sourceLocalId = "other-owner";
    if (fault === "photos") input.assets.reverse();
    await assert.rejects(prepareAdminTemplatePhotoCopyForm(input));
  }
  assert.equal(f.server.calls.length, 0);
});

test("picker quota retry uses the exact original input and current callback without rereading new IDs", async () => {
  let selection = { entityType: "item", sourceId: "source", targetLayoutId: "target", formSnapshot: { name: "Original" } }, count = 0;
  const calls = [], errors = [], busy = [];
  const controller = createAdminTemplatePhotoCopyController({ getSelection: () => selection, onError: e => errors.push(e.message), onBusy: value => busy.push(value),
    async submit(input, options) { calls.push({ input, options }); assert.equal(options.isCurrent(), true); if (++count === 1) throw Error("Quota"); return "confirmed"; } });
  assert.equal(await controller.save(), false); assert.equal(await controller.save(), "confirmed");
  assert.equal(calls[0].input, calls[1].input); assert.equal(Object.isFrozen(calls[0].input.formSnapshot), true);
  assert.deepEqual(errors, ["Quota"]); assert.deepEqual(busy, [true, false, true, false]);
  selection = { ...selection, sourceId: "other" }; assert.equal(calls[1].options.isCurrent(), false);
});

test("concurrent picker clicks share one in-flight capture and stale selection pauses before durable completion", async () => {
  let selection = { sourceId: "source" }, release, entered, calls = 0, durable = 0;
  const wait = new Promise(resolve => { entered = resolve; });
  const controller = createAdminTemplatePhotoCopyController({ getSelection: () => selection, onDurable: () => durable++,
    async submit(_input, options) { calls++; entered(); await new Promise(resolve => { release = resolve; });
      if (!options.isCurrent()) throw Error("Changed"); options.onDurable({ id: "one" }); return true; } });
  const first = controller.save(); await wait; const second = controller.save();
  selection = { sourceId: "different" }; release();
  assert.equal(await first, false); assert.equal(await second, false); assert.equal(calls, 1); assert.equal(durable, 0);
});

test("a completed picker session creates a distinct next attempt while same-open quota retains its original input", async () => {
  const inputs = [], selection = { sourceId: "same", targetLayoutId: "same" };
  const controller = createAdminTemplatePhotoCopyController({ getSelection: () => selection,
    submit(input, options) { inputs.push(input); options.onDurable({ id: inputs.length }); return true; } });
  assert.equal(await controller.save(), true); assert.equal(await controller.save(), true);
  assert.notEqual(inputs[0], inputs[1]); assert.deepEqual(inputs[0], inputs[1]);
});

for (const entityType of ["item", "container"]) test(`${entityType}: confirmed copy preserves every existing target local ID and opaque arrangement`, async () => {
  const f = await adminPhotoCopyClientFixture({ entityType }), target = f.record.snapshot.target, state = copy(target.beforeState);
  const payload = f.receipt.result.payload.photoCopy.confirmedPayload, revision = f.receipt.result.payload.stateRevision;
  const projection = projectAdminTemplateServerVariant(state.layouts[target.layoutId], { exists: true, visibility: "private",
    payload, metadata: f.intent.body.metadata, stateRevision: revision }, f.id, { photoBinding: f.binding, photoOwnerMapEnabled: true });
  const fixed = preserveAdminTemplatePhotoCopyOwnerIds(state, projection, f.intent, payload, revision, f.record);
  for (const owner of target.ownerMap.owners) {
    assert.ok(fixed[owner.type][owner.localId]);
    assert.equal(fixed.layout.adminCausalSource.photoOwnerMap.owners.find(row => row.serverId === owner.serverId).localId, owner.localId);
  }
  assert.deepEqual(fixed.layout.arrangement, state.layouts[target.layoutId].arrangement);
  const created = fixed.layout.adminCausalSource.photoOwnerMap.owners.find(row => row.serverId === f.intent.body.photoCopy.entityId);
  assert.equal(created.localId, f.record.snapshot.copiedOwner.localId);
  const changed = copy(state); changed.items.unmapped = { id: "unmapped", publicCatalogLayoutId: target.layoutId };
  assert.throws(() => preserveAdminTemplatePhotoCopyOwnerIds(changed, projection, f.intent, payload, revision, f.record));
  assert.deepEqual(state, target.beforeState);
});

test("closing and reopening the same picker invalidates an in-flight session even with identical fields", async () => {
  let session = {}, release, enter, durable = 0;
  const entered = new Promise(resolve => { enter = resolve; }), inputs = [];
  const controller = createAdminTemplatePhotoCopyController({ getSelection: () => ({ sourceId: "same", targetLayoutId: "same" }), getSession: () => session,
    async submit(input, options) { inputs.push(input); if (inputs.length === 1) { enter(); await new Promise(resolve => { release = resolve; }); }
      if (!options.isCurrent()) throw Error("Old picker"); options.onDurable({ id: inputs.length }); return true; }, onDurable: () => durable++ });
  const first = controller.save(); await entered; session = {}; release();
  assert.equal(await first, false); assert.equal(durable, 0);
  assert.equal(await controller.save(), true); assert.equal(durable, 1); assert.notEqual(inputs[0], inputs[1]);
});
