import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { projectAdminTemplateCopy, adminTemplateCopyPayloadDigest } from "../../src/sync/admin-template-copy-projection.js";
import { adminClientFixture } from "../fixtures/admin-template-client-fixture.js";
import { validateAdminTemplateReceipt } from "../../src/sync/admin-template-client.js";
import { createAdminTemplateSavePlans, adminTemplateSavePlan, adminTemplateCopyPlan } from "../../src/sync/admin-template-save-plan.js";
import { pendingAdminTemplateCopySource } from "../../src/sync/admin-template-copy-source.js";

const metadata = { title: "Copy", description: "Retained", language: "ru" };
const action = () => ({ operationId: randomUUID(), kind: "template.copy", body: { version: 1, base: null, metadata,
  source: { itemKey: "shared-layout:source", listId: "public-shared-layout-source", base: { stateRevision: 7 }, payloadDigest: "a".repeat(64) } } });
const snapshot = () => ({ locations: ["Bicycle"], categories: ["Repair"], activeLayoutId: "source", packedItems: { pump: true },
  containers: { bag: { id: "bag", parentId: "", childIds: ["pocket"], itemIds: [] },
    pocket: { id: "pocket", parentId: "bag", childIds: [], itemIds: ["pump"], order: [{ type: "item", id: "pump" }] } },
  items: { pump: { id: "pump", name: "Pump", quantity: 3, containerId: "pocket", publicCatalogLayoutId: "source" } },
  layouts: { source: { id: "source", name: "Original", rootContainerIds: [], adminCausalSource: { private: true },
    arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} } } } });

test("template source predecessor is immutable and rejects ambiguous, self and malformed bases", () => {
  const f = adminClientFixture(), input = action(), parentId = randomUUID();
  input.body.source.base = { operationId: parentId };
  const frozen = adminTemplateIntent({ ...f.binding, ...input });
  input.body.source.base.operationId = randomUUID();
  assert.deepEqual(frozen.body.source.base, { operationId: parentId });
  for (const base of [{ operationId: input.operationId }, { operationId: "bad" }, { operationId: parentId, stateRevision: 7 }, {}, null]) {
    assert.throws(() => adminTemplateIntent({ ...f.binding, ...input, body: { ...input.body, source: { ...input.body.source, base } } }));
  }
});

test("pending copy source must match the durable data plan and exact displayed snapshot", async () => {
  const f = adminClientFixture(), client = f.make().client;
  const plans = createAdminTemplateSavePlans({ binding: f.binding, client, getContext: () => f.context,
    storage: { get length() { return f.values.size; }, key: i => [...f.values.keys()][i], getItem: key => f.values.get(key) ?? null,
      setItem: (key, value) => f.values.set(key, value) }, locks: { request: (_key, run) => run() }, enabled: true });
  const action = f.action(), saved = await plans.capture({ ...action.body, operationId: action.operationId, exists: true, visibility: "private" });
  const source = { exists: true, binding: f.binding, planId: action.operationId, base: { operationId: action.operationId } };
  const snapshot = { payload: action.body.payload, metadata: action.body.metadata };
  const prepared = await pendingAdminTemplateCopySource(source, await plans.read(saved.plan.id), snapshot);
  assert.deepEqual(prepared.source.base, source.base); assert.deepEqual(prepared.payload, snapshot.payload);
  assert.equal(prepared.source.payloadDigest, await adminTemplateCopyPayloadDigest(snapshot.payload));
  snapshot.payload.items.a.name = "A later unsaved edit";
  assert.equal(prepared.payload.items.a.name, "Captured name");
  await assert.rejects(pendingAdminTemplateCopySource(source, saved, snapshot));
  for (const altered of [{ ...saved, cancelRequested: true }, { ...saved, plan: { ...saved.plan, operations: [] } },
    { ...saved, plan: { ...saved.plan, binding: { ...f.binding, actorId: "other-admin" } } }]) {
    await assert.rejects(pendingAdminTemplateCopySource(source, altered, { payload: saved.plan.operations[0].body.payload, metadata: action.body.metadata }));
  }
  await assert.rejects(pendingAdminTemplateCopySource({ ...source, base: { operationId: randomUUID() } }, saved, snapshot));
});

for (const published of [false, true]) test(`pending source preserves the final prerequisite of a ${published ? "publication" : "hiding"} chain`, async () => {
  const f = adminClientFixture(), action = f.action(), publicationId = randomUUID();
  const plan = adminTemplateSavePlan({ binding: f.binding, ...action.body, operationId: action.operationId, publicationId,
    exists: true, visibility: published ? "private" : "public", published });
  const finalId = published ? publicationId : action.operationId;
  const source = { exists: true, binding: f.binding, planId: plan.id, base: { operationId: finalId } };
  const snapshot = { payload: action.body.payload, metadata: action.body.metadata }, saved = { plan, cancelRequested: false };
  const prepared = await pendingAdminTemplateCopySource(source, saved, snapshot);
  assert.deepEqual(prepared.source.base, { operationId: finalId }); assert.deepEqual(prepared.payload, snapshot.payload);
  assert.equal(prepared.source.payloadDigest, await adminTemplateCopyPayloadDigest(snapshot.payload));
  await assert.rejects(pendingAdminTemplateCopySource({ ...source, base: { operationId: plan.operations[0].id } }, saved, snapshot));
  await assert.rejects(pendingAdminTemplateCopySource(source, { ...saved, cancelRequested: true }, snapshot));
  const reordered = structuredClone(saved); reordered.plan.operations.reverse();
  await assert.rejects(pendingAdminTemplateCopySource(source, reordered, snapshot));
  const altered = structuredClone(saved); altered.plan.operations[1].body.base = { stateRevision: 77 };
  await assert.rejects(pendingAdminTemplateCopySource(source, altered, snapshot));
});

test("pending whole copy uses its own server projection while guarding the separate editor snapshot", async () => {
  const f = adminClientFixture(), copy = action(), original = snapshot();
  copy.body.source.payloadDigest = await adminTemplateCopyPayloadDigest(original);
  const projected = projectAdminTemplateCopy(original, copy.operationId, metadata);
  const editorSnapshot = { payload: structuredClone(projected), metadata };
  const layoutId = editorSnapshot.payload.activeLayoutId;
  editorSnapshot.payload.layouts["layout-main"] = { ...editorSnapshot.payload.layouts[layoutId], id: "layout-main" };
  delete editorSnapshot.payload.layouts[layoutId]; editorSnapshot.payload.activeLayoutId = "layout-main";
  const plan = adminTemplateCopyPlan({ binding: f.binding, ...copy, sourceSnapshot: original, editorSnapshot });
  const source = { exists: true, binding: f.binding, planId: plan.id, base: { operationId: plan.id } };
  const prepared = await pendingAdminTemplateCopySource(source, { plan, cancelRequested: false }, editorSnapshot);
  assert.deepEqual(prepared.payload, projected); assert.deepEqual(prepared.source.base, source.base);
  assert.equal(prepared.source.payloadDigest, await adminTemplateCopyPayloadDigest(projected));
  assert.notEqual(prepared.source.payloadDigest, copy.body.source.payloadDigest);
  assert.notEqual(prepared.source.payloadDigest, await adminTemplateCopyPayloadDigest(editorSnapshot.payload));
  const next = projectAdminTemplateCopy(prepared.payload, randomUUID(), metadata);
  assert.notEqual(Object.keys(next.items)[0], Object.keys(projected.items)[0]);
  await assert.rejects(pendingAdminTemplateCopySource(source, { plan, cancelRequested: true }, editorSnapshot));
  await assert.rejects(pendingAdminTemplateCopySource(source, { plan, cancelRequested: false }, { payload: projected, metadata }));
  Object.values(editorSnapshot.payload.items)[0].name = "Later local change";
  await assert.rejects(pendingAdminTemplateCopySource(source, { plan, cancelRequested: false }, editorSnapshot));
  assert.deepEqual(prepared.payload, projected);
});

test("whole template copy freezes exact confirmed source, new target and private metadata", () => {
  const f = adminClientFixture(), input = action(), frozen = adminTemplateIntent({ ...f.binding, ...input });
  input.body.source.base.stateRevision = 99;
  assert.equal(frozen.body.source.base.stateRevision, 7); assert.equal(frozen.body.base, null);
  for (const patch of [{ base: { stateRevision: 7 } }, { payload: {} }, { published: true },
    { source: { ...frozen.body.source, listId: f.binding.listId } },
    { source: { ...frozen.body.source, base: { operationId: input.operationId } } },
    { source: { ...frozen.body.source, payloadDigest: "bad" } }]) {
    assert.throws(() => adminTemplateIntent({ ...f.binding, ...input, body: { ...frozen.body, ...patch } }));
  }
});
test("copy projection retains detached catalog trees, dictionaries and quantities with stable independent IDs", async () => {
  const source = snapshot(), before = structuredClone(source), id = randomUUID(), projected = projectAdminTemplateCopy(source, id, metadata);
  assert.deepEqual(source, before); assert.deepEqual(projectAdminTemplateCopy(source, id, metadata), projected);
  const item = Object.values(projected.items)[0], bag = Object.values(projected.containers).find(row => !row.parentId);
  const pocket = Object.values(projected.containers).find(row => row.parentId);
  assert.notEqual(item.id, "pump"); assert.equal(item.quantity, 3); assert.equal(item.containerId, pocket.id);
  assert.deepEqual(bag.childIds, [pocket.id]); assert.deepEqual(pocket.itemIds, [item.id]);
  assert.deepEqual(pocket.order, [{ type: "item", id: item.id }]); assert.equal(item.publicCatalogLayoutId, undefined);
  const layout = projected.layouts[projected.activeLayoutId]; assert.equal(layout.name, "Copy");
  assert.equal(layout.adminCausalSource, undefined); assert.deepEqual(layout.rootContainerIds, []);
  assert.deepEqual(projected.locations, source.locations); assert.deepEqual(projected.categories, source.categories);
  assert.notEqual(await adminTemplateCopyPayloadDigest(source), await adminTemplateCopyPayloadDigest(projected));
});
test("copy projection retains arrangement quantities, packing, order and nesting", () => {
  const source = snapshot(), layout = source.layouts.source;
  layout.rootContainerIds = ["bag"]; layout.layoutOrder = 17;
  layout.arrangement = { rootContainerIds: ["bag"], containers: structuredClone(source.containers), items: { pump: "pocket" },
    itemQuantities: { pump: 2 }, packedItems: { pump: true } };
  const value = projectAdminTemplateCopy(source, randomUUID(), metadata), copied = value.layouts[value.activeLayoutId], item = Object.values(value.items)[0];
  assert.equal(copied.arrangement.itemQuantities[item.id], 2); assert.equal(copied.arrangement.packedItems[item.id], true);
  assert.equal(copied.arrangement.items[item.id], item.containerId); assert.equal(copied.layoutOrder, 17);
  assert.deepEqual(value.packedItems, copied.arrangement.packedItems);
});
test("ambiguous layouts, missing catalog references and index catalogs need explicit preparation", () => {
  for (const change of [value => value.layouts.other = { id: "other" }, value => value.items.pump.containerId = "missing",
    value => value.containers.pocket.itemIds = ["missing"], value => value.sharedLayoutsIndex = [],
    value => delete value.layouts.source.arrangement, value => value.containers.bag.parentId = "pocket"]) {
    const source = snapshot(); change(source); assert.throws(() => projectAdminTemplateCopy(source, randomUUID(), metadata));
  }
});
test("copy requires its own server capability and cannot dispatch through the earlier save capability", async () => {
  const f = adminClientFixture(), client = f.make().client, copy = action(); await client.capture(copy);
  f.state.copyCapability = false; await assert.rejects(client.run(copy.operationId)); assert.equal(f.posts().length, 0);
  f.state.copyCapability = true; const saved = await client.read(copy.operationId), receipt = await client.run(copy.operationId);
  assert.equal(receipt.result.payload.stateRevision, 1); assert.equal(receipt.result.payload.visibility, "private");
  for (const patch of [{ visibility: "public" }, { stateRevision: 2 }]) {
    const bad = structuredClone(receipt); Object.assign(bad.result.payload, patch); assert.equal(validateAdminTemplateReceipt(bad, saved), false);
  }
});
test("copy lost ACK and two tabs retain the original operation and never recreate the target", async () => {
  const f = adminClientFixture(), a = f.make().client, b = f.make().client, copy = action();
  f.state.copyCapability = true; await a.capture(copy); f.state.lose = true;
  const first = await a.run(copy.operationId); f.state.lose = false;
  assert.deepEqual(await b.run(copy.operationId), first); assert.equal(f.posts().length, 1);
});
test("copy plan keeps its source snapshot and projected result before hashing and reuses the original plan after reload", async () => {
  const f = adminClientFixture(), copy = action(), source = snapshot(); f.state.copyCapability = true;
  copy.body.source.payloadDigest = await adminTemplateCopyPayloadDigest(source);
  const store = () => createAdminTemplateSavePlans({ binding: f.binding, client: f.make().client, getContext: () => f.context,
    storage: { get length() { return f.values.size; }, key: i => [...f.values.keys()][i], getItem: key => f.values.get(key) ?? null,
      setItem: (key, value) => f.values.set(key, value) }, locks: { request: (_key, run) => run() }, enabled: true });
  const first = store(), pending = first.captureCopy({ ...copy, sourceSnapshot: source });
  source.items.pump.name = "Later source";
  const saved = await pending; assert.equal(saved.plan.version, 3); assert.equal(saved.plan.sourceSnapshot.items.pump.name, "Pump");
  assert.equal(Object.values(saved.plan.editorSnapshot.payload.items)[0].name, "Pump");
  await assert.rejects(first.captureCopy({ ...copy, sourceSnapshot: source }));
  assert.deepEqual(await store().read(copy.operationId), saved);
  await store().run(copy.operationId); await store().run(copy.operationId); assert.equal(f.posts().length, 1);
  const key = [...f.values.keys()].find(key => key.startsWith("bike-packing-admin-save-plans-v1:"));
  const damaged = JSON.parse(f.values.get(key)); damaged.plan.sourceSnapshot.items.pump.quantity = 99;
  f.values.set(key, JSON.stringify(damaged)); await assert.rejects(store().run(copy.operationId)); assert.equal(f.posts().length, 1);
});
