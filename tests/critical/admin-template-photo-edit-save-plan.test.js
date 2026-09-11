import test from "node:test";
import assert from "node:assert/strict";
import { adminTemplatePhotoEditSavePlan, createAdminTemplateSavePlans, adminTemplateDataSourceSnapshot } from "../../src/sync/admin-template-save-plan.js";
import { adminTemplatePhotoEditorSnapshot } from "../../src/public/admin-template-photo-state.js";
import { adminPhotoEditFixture as fixture, photoEditStorage, copy, hash } from "../fixtures/admin-template-photo-edit-fixture.js";

const blocked = { code: "admin-template-plan-paused", isAdminTemplateBlocked: true };
function storeFixture() {
  const f = fixture(), persistence = photoEditStorage(), calls = [], context = { ...f.binding, scope: "admin-template", admin: true, generation: "one" };
  const client = { async capture(input) { calls.push(copy(input)); }, async run() { return copy(f.receipt); } };
  const make = options => createAdminTemplateSavePlans({ binding: f.binding, client, getContext: () => context, ...persistence, enabled: true, ...options });
  const ordinary = () => ({ operationId: crypto.randomUUID(), base: copy(f.body.base), exists: true, visibility: "private", payload: copy(f.body.payload), metadata: copy(f.metadata) });
  return { ...f, ...persistence, calls, context, make, ordinary };
}

for (const entityType of ["item", "container"]) test(`${entityType}: v6 captures exact source, required before view and candidate with only fields/deletion/order changed`, () => {
  const f = fixture({ entityType }), before = copy(f.input), plan = adminTemplatePhotoEditSavePlan(f.input);
  assert.equal(plan.version, 6); assert.deepEqual(plan.photoSnapshot, before.photoSnapshot);
  assert.deepEqual(plan.operations[0].body, before.body); assert.deepEqual(plan.editorSnapshot, before.editorSnapshot);
  assert.equal(Object.hasOwn(plan.operations[0].body.payload[f.type][f.serverId], "dimensions"), false);
  assert.equal(plan.operations[0].body.payload[f.type][f.serverId].photos.length, 3);
  assert.deepEqual(plan.photoSnapshot.state[f.type][f.localId].photos.map(photo => photo.id), ["фото-3", "photo-1"]);
  f.input.photoSnapshot.state[f.type][f.localId].name = "Later"; assert.notEqual(plan.photoSnapshot.state[f.type][f.localId].name, "Later");
});

test("v6 refuses mixed namespaces, revisions, source baselines and unsupported before→candidate changes", () => {
  const mutations = [i => { delete i.photoSnapshot.beforeState; }, i => { i.photoSnapshot.ownerMap.stateRevision++; },
    i => { i.photoSnapshot.state.layouts["local-editor"].adminCausalSource.visibility = "public"; },
    i => { i.photoSnapshot.beforeState.layouts["local-editor"].adminCausalSource.binding.actorId = "other"; },
    i => { i.photoSnapshot.state.containers["local-bag"].name = "Collateral"; },
    i => { i.photoSnapshot.state.items["local-item"].photos[0].metadata = { invented: true }; },
    i => { i.photoSnapshot.state.items["local-item"].containerId = "local-bag"; },
    i => { i.photoSnapshot.state.layouts["local-editor"].arrangement.packedItems["local-item"] = true; },
    i => { i.photoSnapshot.state.items.private = { id: "private", name: "Personal" }; },
    i => { i.body.payload.containers.bag.name = "Collateral"; }, i => { delete i.body.payload.opaque; },
    i => { i.photoSnapshot.state.items["local-item"].name = "Not sent"; },
    i => { i.photoSnapshot.beforeState.items["local-item"].photos.reverse(); },
    i => { i.photoSnapshot.beforeState.layouts["local-editor"].adminCausalSource.photoView.owners[0].rawPhotos[0].metadata.credit = "Wrong raw"; },
    i => { i.editorSnapshot.payload.items["local-item"].name = "Wrong comparison view"; }];
  for (const mutate of mutations) { const input = copy(fixture().input); mutate(input); assert.throws(() => adminTemplatePhotoEditSavePlan(input), blocked); }
});

test("all-remove permits an empty full UI photo array and cannot become a pending copy source", () => {
  const f = fixture({ photoIds: [] }), plan = adminTemplatePhotoEditSavePlan(f.input);
  assert.deepEqual(plan.photoSnapshot.state.items["local-item"].photos, []);
  assert.throws(() => adminTemplateDataSourceSnapshot(plan), blocked);
});

test("capture freezes before hash, reads back exact JSON, and stays readable with capture disabled", async () => {
  const f = storeFixture(), before = copy(f.input), pending = f.make().capturePhotoEdit(f.input);
  f.input.body.payload.items.pump.name = "Later"; f.input.photoSnapshot.state.items["local-item"].name = "Later";
  const saved = await pending; assert.deepEqual(saved.plan.operations[0].body, before.body); assert.equal(saved.digest, hash(saved.plan));
  assert.deepEqual(await f.make({ enabled: false }).read(saved.plan.id), saved);
  assert.deepEqual(await f.make({ enabled: false }).list(), [saved]);
  assert.deepEqual(await f.make().capturePhotoEdit(before), saved);
  await assert.rejects(f.make({ enabled: false }).capturePhotoEdit(before), blocked);
  assert.equal(f.values.size, 1); assert.equal(f.calls.length, 0);
});

test("quota/readback loss preserve the frozen input for same UUID retry before any client capture", async () => {
  for (const mode of ["quota", "drop"]) {
    const f = storeFixture(), before = copy(f.input); f.controls[mode] = true;
    await assert.rejects(f.make().capturePhotoEdit(f.input)); assert.equal(f.calls.length, 0); assert.equal(f.values.size, 0);
    assert.deepEqual(f.input, before); f.controls[mode] = false;
    const saved = await f.make().capturePhotoEdit(f.input); assert.equal(saved.plan.id, before.operationId);
  }
});

test("cold read rejects semantically corrupted selections even if the outer digest is recomputed", async () => {
  const f = storeFixture(), saved = await f.make().capturePhotoEdit(f.input), key = [...f.values.keys()][0];
  saved.plan.photoSnapshot.state.containers["local-bag"].name = "Another owner";
  saved.plan.editorSnapshot = adminTemplatePhotoEditorSnapshot(saved.plan.photoSnapshot.state, f.layoutId, f.metadata);
  saved.digest = hash(saved.plan); f.values.set(key, JSON.stringify(saved));
  await assert.rejects(f.make().read(f.action.operationId), blocked); await assert.rejects(f.make().run(f.action.operationId), blocked);
  assert.equal(f.calls.length, 0);
});

test("two independent plan clients capture only one distinct photo action for the same binding and confirmed base", async () => {
  const f = storeFixture(), other = copy(f.input); other.operationId = crypto.randomUUID();
  const results = await Promise.allSettled([f.make().capturePhotoEdit(f.input), f.make().capturePhotoEdit(other)]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(results.filter(row => row.status === "rejected").length, 1);
  assert.equal((await f.make().list()).length, 1); assert.equal(f.calls.length, 0);
});

test("a photo selection cannot overtake an ordinary plan, but later ordinary edits remain durably recoverable", async () => {
  const earlier = storeFixture(); await earlier.make().capture(earlier.ordinary());
  await assert.rejects(earlier.make().capturePhotoEdit(earlier.input), blocked); assert.equal((await earlier.make().list()).length, 1);
  const later = storeFixture(), selected = await later.make().capturePhotoEdit(later.input), ordinary = later.ordinary();
  ordinary.payload.items.pump.name = "Other tab ordinary edit";
  const saved = await later.make().capture(ordinary);
  assert.equal(saved.plan.operations[0].body.payload.items.pump.name, "Other tab ordinary edit");
  assert.deepEqual(await later.make().read(selected.plan.id), selected); assert.equal((await later.make().list()).length, 2);
  const racing = storeFixture(), raced = await Promise.allSettled([racing.make().capturePhotoEdit(racing.input), racing.make().capture(racing.ordinary())]);
  assert.equal(raced[1].status, "fulfilled", "The already-edited ordinary form must retain its intent regardless of capture ordering");
  assert.equal((await racing.make().list()).length, raced[0].status === "fulfilled" ? 2 : 1);
  const f = storeFixture(); await Promise.all([f.make().capture(f.ordinary()), f.make().capture(f.ordinary())]);
  assert.equal((await f.make().list()).length, 2);
});

test("a retained v6 blocks generic UUID successors and same UUID substitution, preserving the selected form", async () => {
  const f = storeFixture(), saved = await f.make().capturePhotoEdit(f.input), before = [...f.values];
  const ordinary = f.ordinary(); ordinary.base = { operationId: f.action.operationId };
  await assert.rejects(f.make().capture(ordinary), blocked);
  const changed = copy(f.input); changed.body.payload.items.pump.name = changed.photoSnapshot.state.items["local-item"].name = "Different";
  changed.editorSnapshot = adminTemplatePhotoEditorSnapshot(changed.photoSnapshot.state, f.layoutId, f.metadata);
  await assert.rejects(f.make().capturePhotoEdit(changed), blocked);
  assert.deepEqual([...f.values], before); assert.deepEqual(await f.make().read(f.action.operationId), saved);
});

test("a context change while hashing never writes a selected action into the later account", async () => {
  const f = storeFixture(), pending = f.make().capturePhotoEdit(f.input); f.context.actorId = "other";
  await assert.rejects(pending, blocked); assert.equal(f.values.size, 0); assert.equal(f.calls.length, 0);
});

test("only validated adopted-stop exclusions release a retained base; cancellation flags alone do not", async () => {
  const f = storeFixture(), saved = await f.make().capturePhotoEdit(f.input), key = [...f.values.keys()][0];
  saved.cancelRequested = true; f.values.set(key, JSON.stringify(saved));
  const next = copy(f.input); next.operationId = crypto.randomUUID();
  await assert.rejects(f.make().capturePhotoEdit(next), blocked);
  let checked = 0;
  const afterAdoption = f.make({ getExcludedPlans: async () => { checked++; return [f.action.operationId]; } });
  assert.equal((await afterAdoption.capturePhotoEdit(next)).plan.id, next.operationId); assert.equal(checked, 1);
  assert.equal((await f.make().list()).length, 2);
  for (const value of [null, ["arbitrary"], [f.action.operationId, f.action.operationId]]) {
    const candidate = copy(f.input); candidate.operationId = crypto.randomUUID();
    await assert.rejects(f.make({ getExcludedPlans: async () => value }).capturePhotoEdit(candidate), blocked);
  }
});
