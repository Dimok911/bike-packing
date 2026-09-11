import test from "node:test";
import assert from "node:assert/strict";
import { adminTemplatePhotoNamespace, adminTemplatePhotoEditorSnapshot, adminTemplatePhotoFormPayload, prepareAdminTemplatePhotoRecord } from "../../src/public/admin-template-photo-state.js";
import { adminTemplatePhotoSavePlan } from "../../src/sync/admin-template-photo-save-plan.js";
import { adminTemplateIntent } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoStageDigest } from "../../src/sync/admin-template-photo-append-protocol.js";
import { encodeAdminTemplatePhotoRecord, decodeAdminTemplatePhotoRecord } from "../../src/sync/admin-template-photo-record.js";
import { adminPhotoRecordFixture, bytesHash } from "../fixtures/admin-template-photo-record-fixture.js";

const sourceBlocked = { code: "admin-template-photo-form-source", isAdminTemplateBlocked: true };
const planBlocked = { code: "admin-template-plan-paused", isAdminTemplateBlocked: true };
async function selectedFixture(options = {}) {
  const original = await adminPhotoRecordFixture(options);
  const entityType = options.entityType || "item", entityId = entityType === "item" ? "local-item" : "local-bag";
  return { original, input: {
    binding: structuredClone(original.binding), operationId: original.action.operationId,
    snapshot: structuredClone(original.snapshot), payload: structuredClone(original.action.body.payload), entityType, entityId,
    files: original.files.map(({ stage, file, thumb }) => ({ id: stage.photoId, fileName: stage.file.fileName,
      type: file.type, size: file.size, fullBlobVerified: true, blob: file, thumbBlob: thumb }))
  } };
}

test("form payload patches only the mapped raw owner and retains complete packed, unknown and unselected source data", async () => {
  for (const entityType of ["item", "container"]) {
    const { snapshot } = await adminPhotoRecordFixture({ entityType }), type = entityType === "item" ? "items" : "containers";
    const entityId = entityType === "item" ? "local-item" : "local-bag", serverId = entityType === "item" ? "server-item" : "server-bag";
    const source = snapshot.sourcePayload;
    source.packedItems = { "server-item": { exact: [false, 0, ""] } };
    source.unknownBusiness = { nested: ["keep", null, { version: 9 }] };
    source.locations = ["Camp", "Bike", "Camp"]; source.categories = [{ name: "Custom", unknown: true }];
    source.layouts.original.unknownBusiness = { exact: "raw layout" };
    source.layouts.original.arrangement = { rootContainerIds: ["server-bag"], items: { "server-item": "server-bag" },
      containers: { "server-bag": null }, packedItems: { "server-item": true }, itemQuantities: { "server-item": 3 }, unknownOrder: [2, 0, 1] };
    source.items["server-item"].unknownBusiness = { exact: "raw item" };
    source.containers["server-bag"].unknownBusiness = { exact: "raw container" };
    source[type][serverId].dimensions = { length: 9, unknown: "old dimensions" };
    const fields = { name: "Selected form name", dimensions: null, categories: ["New category"], updatedByDeviceId: "device-a",
      ...(entityType === "item" ? { quantity: 1 } : { volume: 4, nestable: false }) };
    const before = structuredClone(source), beforeFields = structuredClone(fields), expected = structuredClone(source);
    Object.assign(expected[type][serverId], structuredClone(fields)); delete expected[type][serverId].dimensions;
    const payload = adminTemplatePhotoFormPayload({ sourcePayload: source, ownerMap: snapshot.ownerMap, entityType, entityId, fields });
    assert.deepEqual(payload, expected);
    assert.deepEqual(payload[type][serverId].photos, before[type][serverId].photos);
    payload[type][serverId].photos[0].metadata.credit = "Detached result";
    payload.layouts.original.arrangement.packedItems["server-item"] = false;
    payload[type][serverId].categories.push("Detached category");
    assert.deepEqual(source, before); assert.deepEqual(fields, beforeFields);
  }
});

test("form payload never accepts photo, identity, placement, unknown or opposite-owner fields", async () => {
  for (const entityType of ["item", "container"]) {
    const { snapshot } = await adminPhotoRecordFixture({ entityType });
    const args = { sourcePayload: snapshot.sourcePayload, ownerMap: snapshot.ownerMap, entityType,
      entityId: entityType === "item" ? "local-item" : "local-bag" };
    for (const field of ["id", "photos", "sharedSourceId", "publicCatalogLayoutId", "availabilityStatus", "containerId", "parentId", "unknownBusiness",
      ...(entityType === "item" ? ["volume", "nestable"] : ["quantity"])]) {
      assert.throws(() => adminTemplatePhotoFormPayload({ ...args, fields: { [field]: "forbidden" } }), sourceBlocked, field);
    }
    assert.throws(() => adminTemplatePhotoFormPayload({ ...args, fields: { name: undefined } }), sourceBlocked);
  }
});

test("form payload requires the complete unambiguous recorded owner map instead of deriving server IDs", async () => {
  for (const mode of ["server-id", "other-type", "partial", "duplicate-local", "duplicate-server", "bad-row-id", "missing-source-owner", "foreign-kind", "invalid-binding"]) {
    const { snapshot } = await adminPhotoRecordFixture(), args = { sourcePayload: structuredClone(snapshot.sourcePayload),
      ownerMap: structuredClone(snapshot.ownerMap), entityType: "item", entityId: "local-item", fields: { name: "Selected name" } };
    if (mode === "server-id") args.entityId = "server-item";
    if (mode === "other-type") args.entityType = "container";
    if (mode === "partial") args.ownerMap.owners.pop();
    if (mode === "duplicate-local") args.ownerMap.owners[1].localId = args.ownerMap.owners[0].localId;
    if (mode === "duplicate-server") args.ownerMap.owners.push({ ...args.ownerMap.owners[0], localId: "another-local" });
    if (mode === "bad-row-id") args.sourcePayload.items["server-item"].id = "other-server";
    if (mode === "missing-source-owner") delete args.sourcePayload.containers["server-bag"];
    if (mode === "foreign-kind") args.entityType = "layout";
    if (mode === "invalid-binding") args.ownerMap.binding.itemKey = "shared-layout:other";
    assert.throws(() => adminTemplatePhotoFormPayload(args), sourceBlocked, mode);
  }
});

test("photo namespace detaches only the selected administrative owners and layout, including pending photo views", async () => {
  const { snapshot } = await adminPhotoRecordFixture(), { state, layoutId } = snapshot;
  state.layouts[layoutId].locations = ["Template location"];
  state.layouts[layoutId].categories = ["Template category"];
  state.layouts[layoutId].arrangement.packedItems = { "local-item": true };
  state.locations = ["Private location"]; state.categories = ["Private category"];
  state.items.personal = { id: "personal", name: "Private item", photos: [] };
  state.items.other = { id: "other", name: "Another template", publicCatalogLayoutId: "other-layout", photos: [] };
  state.containers.personal = { id: "personal", name: "Private bag" };
  state.layouts.personal = { id: "personal", name: "Private trip" };
  state.activeLayoutId = "personal";
  const before = structuredClone(state), result = adminTemplatePhotoNamespace(state, layoutId);
  assert.deepEqual(Object.keys(result.items), ["local-item"]);
  assert.deepEqual(Object.keys(result.containers), ["local-bag"]);
  assert.deepEqual(Object.keys(result.layouts), [layoutId]);
  assert.equal(result.activeLayoutId, layoutId);
  assert.deepEqual(result.locations, ["Template location"]); assert.deepEqual(result.categories, ["Template category"]);
  assert.deepEqual(result.packedItems, { "local-item": true });
  assert.deepEqual(result.items["local-item"].photos, before.items["local-item"].photos);
  result.items["local-item"].photos[0].fileName = "Detached edit.png";
  result.layouts[layoutId].adminCausalSource.base.stateRevision = 99;
  result.locations.push("Detached location");
  assert.deepEqual(state, before);
  assert.throws(() => adminTemplatePhotoNamespace(state, "missing-layout"), sourceBlocked);
  state.layouts[layoutId].id = "another-id";
  assert.throws(() => adminTemplatePhotoNamespace(state, layoutId), sourceBlocked);
});

test("editor snapshot retains pending photos and business data while removing administrative and applied display metadata", async () => {
  const { snapshot } = await adminPhotoRecordFixture(), { state, layoutId, metadata } = snapshot;
  state.items["local-item"].containerId = "display-bag";
  state.items["local-item"].unknownBusiness = { exact: [3, 1, 2] };
  state.containers["local-bag"].itemIds = ["display-item"];
  state.layouts[layoutId].templateDraftSyncPending = true;
  state.layouts[layoutId].unknownBusiness = { title: "Keep layout data" };
  const before = structuredClone(snapshot), result = adminTemplatePhotoEditorSnapshot(state, layoutId, metadata);
  const layout = result.payload.layouts[layoutId];
  for (const field of ["adminCausalSource", "adminSharedSourceId", "templateDraftSyncPending"]) assert.equal(Object.hasOwn(layout, field), false);
  assert.equal(Object.hasOwn(result.payload, "activeLayoutId"), false);
  assert.equal(Object.hasOwn(result.payload, "packedItems"), false);
  assert.equal(Object.hasOwn(result.payload.items["local-item"], "containerId"), false);
  assert.equal(Object.hasOwn(result.payload.containers["local-bag"], "itemIds"), false);
  assert.deepEqual(layout.arrangement, before.state.layouts[layoutId].arrangement);
  assert.deepEqual(layout.unknownBusiness, { title: "Keep layout data" });
  assert.deepEqual(result.payload.items["local-item"].unknownBusiness, { exact: [3, 1, 2] });
  assert.deepEqual(result.payload.items["local-item"].photos, before.state.items["local-item"].photos);
  result.metadata.title = "Detached title";
  result.payload.items["local-item"].photos[0].fileName = "Detached view.png";
  assert.deepEqual(snapshot, before);
});

test("selected cache files become verifiable item and empty-container records with server owner IDs and exact old references", async () => {
  for (const entityType of ["item", "container"]) {
    const { original, input } = await selectedFixture({ entityType, oldPhotos: entityType === "item" });
    const before = structuredClone(input), record = await prepareAdminTemplatePhotoRecord(input);
    const type = entityType === "item" ? "items" : "containers", serverId = entityType === "item" ? "server-item" : "server-bag";
    assert.deepEqual(record.binding, before.binding); assert.deepEqual(record.snapshot, before.snapshot);
    assert.deepEqual(record.action.body.payload, before.payload); assert.deepEqual(record.action.body.metadata, before.snapshot.metadata);
    assert.deepEqual(record.action.body.base, { stateRevision: 7 });
    assert.equal(record.action.operationId, before.operationId);
    assert.deepEqual(record.action.body.payload[type][serverId].photos, original.snapshot.sourcePayload[type][serverId].photos);
    assert.equal(Object.hasOwn(record.action.body.payload[type], before.entityId), false);
    assert.deepEqual(record.snapshot.state[type][before.entityId].photos, before.snapshot.state[type][before.entityId].photos);
    assert.equal(new Set(record.files.map(part => part.stage.operationId)).size, 2);
    for (const [index, part] of record.files.entries()) {
      const stage = part.stage, selected = before.files[index], asset = record.action.body.photoAppend.assets[index];
      assert.equal(stage.templateOperationId, before.operationId); assert.notEqual(stage.operationId, before.operationId);
      assert.notEqual(stage.operationId, original.files[index].stage.operationId, "Create a new stage identity for this captured package");
      assert.equal(stage.entityType, entityType); assert.equal(stage.entityId, serverId);
      assert.equal(stage.photoId, selected.id);
      assert.equal(stage.file.hash, await bytesHash(await selected.blob.arrayBuffer()));
      assert.equal(stage.file.size, selected.blob.size); assert.equal(stage.file.fileName, selected.fileName);
      assert.equal(asset.assetDigest, await adminTemplatePhotoStageDigest(stage));
      assert.equal(asset.assetId, stage.operationId);
      assert.equal(await part.file.text(), await selected.blob.text());
      if (selected.thumbBlob) {
        assert.equal(stage.thumb.hash, await bytesHash(await selected.thumbBlob.arrayBuffer()));
        assert.equal(await part.thumb.text(), await selected.thumbBlob.text());
      } else { assert.equal(stage.thumb, null); assert.equal(part.thumb, null); }
    }
    const cold = await decodeAdminTemplatePhotoRecord(await encodeAdminTemplatePhotoRecord(record), input.binding, input.operationId);
    assert.deepEqual(cold.action, record.action); assert.deepEqual(cold.snapshot, record.snapshot);
    assert.deepEqual(input, before);
  }
});

test("UI fields, old references, owner mapping and every Blob handle are captured before the first hashing await", async () => {
  const { input } = await selectedFixture(), before = structuredClone(input), blob = input.files[0].blob;
  let release, entered = false;
  const gate = new Promise(resolve => { release = resolve; }), read = blob.arrayBuffer.bind(blob);
  blob.arrayBuffer = async () => { entered = true; await gate; return read(); };
  const pending = prepareAdminTemplatePhotoRecord(input);
  assert.equal(entered, true, "The mutation occurs while the first file hash is blocked");
  input.binding.actorId = "later-admin"; input.operationId = crypto.randomUUID(); input.entityId = "later-owner";
  input.snapshot.metadata.title = "Later title";
  input.snapshot.state.items["local-item"].name = "Later UI name";
  input.snapshot.state.layouts[input.snapshot.layoutId].adminCausalSource.base.stateRevision++;
  input.snapshot.ownerMap.owners[0].serverId = "later-server-owner";
  input.payload.items["server-item"].photos[0].metadata.credit = "Later raw reference";
  input.files[0].id = "later-photo"; input.files[0].fileName = "Later file name.png";
  input.files[0].blob = new Blob(["Later original"], { type: "image/png" });
  input.files[0].thumbBlob = new Blob(["Later thumbnail"], { type: "image/png" });
  input.files[1] = { ...input.files[1], blob: new Blob(["Later second file"], { type: "image/png" }) };
  release();
  const record = await pending;
  assert.deepEqual(record.binding, before.binding); assert.equal(record.action.operationId, before.operationId);
  assert.deepEqual(record.action.body.payload, before.payload); assert.deepEqual(record.snapshot, before.snapshot);
  for (const [index, part] of record.files.entries()) {
    assert.equal(await part.file.text(), await before.files[index].blob.text());
    assert.equal(await part.thumb?.text(), await before.files[index].thumbBlob?.text());
    assert.equal(part.stage.photoId, before.files[index].id);
  }
});

test("unverified cache originals and inconsistent file metadata cannot become administrative photo records", async () => {
  for (const mode of ["unverified", "not-blob", "type", "size", "empty", "thumb-object", "file-name", "thumb-type"]) {
    const { input } = await selectedFixture(), selected = input.files[0];
    if (mode === "unverified") selected.fullBlobVerified = false;
    if (mode === "not-blob") selected.blob = { size: selected.size, type: selected.type };
    if (mode === "type") selected.type = "image/jpeg";
    if (mode === "size") selected.size++;
    if (mode === "empty") { selected.blob = new Blob([], { type: "image/png" }); selected.size = 0; }
    if (mode === "thumb-object") selected.thumbBlob = { size: 2, type: "image/png" };
    if (mode === "file-name") selected.fileName = "";
    if (mode === "thumb-type") selected.thumbBlob = new Blob(["Unsupported thumbnail"], { type: "image/tiff" });
    await assert.rejects(prepareAdminTemplatePhotoRecord(input), undefined, mode);
  }
  const { input } = await selectedFixture(); input.files = [];
  await assert.rejects(prepareAdminTemplatePhotoRecord(input), sourceBlocked);
});

test("preparation requires the selected local owner and the original ordered view rather than inferring a server identity", async () => {
  for (const mode of ["server-id", "missing-map", "reversed-files", "changed-old-reference"]) {
    const { input } = await selectedFixture();
    if (mode === "server-id") input.entityId = "server-item";
    if (mode === "missing-map") input.snapshot.ownerMap.owners = input.snapshot.ownerMap.owners.filter(owner => owner.localId !== input.entityId);
    if (mode === "reversed-files") input.files.reverse();
    if (mode === "changed-old-reference") input.payload.items["server-item"].photos[0].metadata.credit = "Different raw reference";
    await assert.rejects(prepareAdminTemplatePhotoRecord(input), undefined, mode);
  }
});

test("version five plan captures one exact save and a separate detached pending-photo editor snapshot", async () => {
  const { input } = await selectedFixture(), record = await prepareAdminTemplatePhotoRecord(input);
  const editorSnapshot = adminTemplatePhotoEditorSnapshot(record.snapshot.state, record.snapshot.layoutId, record.snapshot.metadata);
  const args = { binding: record.binding, operationId: record.action.operationId, body: record.action.body, editorSnapshot };
  const before = structuredClone(args), plan = adminTemplatePhotoSavePlan(args);
  assert.equal(plan.version, 5); assert.equal(plan.id, before.operationId); assert.deepEqual(plan.binding, before.binding);
  assert.deepEqual(plan.operations, [adminTemplateIntent({ ...before.binding, operationId: before.operationId, kind: "template.save", body: before.body })]);
  assert.deepEqual(plan.editorSnapshot, before.editorSnapshot);
  assert.equal(plan.operations[0].body.payload.items["server-item"].photos.length, 1);
  assert.equal(plan.editorSnapshot.payload.items["local-item"].photos.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
  args.body.payload.items["server-item"].photos[0].metadata.credit = "Later request edit";
  args.editorSnapshot.payload.items["local-item"].photos[1].fileName = "Later pending view.png";
  args.binding.actorId = "later-admin";
  assert.deepEqual(plan.operations[0].body, before.body); assert.deepEqual(plan.editorSnapshot, before.editorSnapshot);
  assert.deepEqual(plan.binding, before.binding);
});

test("photo save plans reject mismatched metadata, ordinary writes and unconfirmed bases", async () => {
  const { action, binding, snapshot } = await adminPhotoRecordFixture();
  const editorSnapshot = adminTemplatePhotoEditorSnapshot(snapshot.state, snapshot.layoutId, snapshot.metadata);
  const args = { binding, operationId: action.operationId, body: action.body, editorSnapshot };
  const mismatched = structuredClone(args); mismatched.editorSnapshot.metadata.title = "Another selection";
  assert.throws(() => adminTemplatePhotoSavePlan(mismatched), planBlocked);
  const ordinary = structuredClone(args); delete ordinary.body.photoAppend;
  assert.throws(() => adminTemplatePhotoSavePlan(ordinary), planBlocked);
  const foreign = structuredClone(args); foreign.binding.scopeKey = "id:private-owner";
  assert.throws(() => adminTemplatePhotoSavePlan(foreign), planBlocked);
  const pending = structuredClone(args); pending.body.base = { operationId: crypto.randomUUID() };
  assert.throws(() => adminTemplatePhotoSavePlan(pending));
});
