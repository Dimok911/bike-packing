import test from "node:test";
import assert from "node:assert/strict";
import { encodeAdminTemplatePhotoRecord, decodeAdminTemplatePhotoRecord } from "../../src/sync/admin-template-photo-record.js";
import { adminTemplatePhotoStageDigest } from "../../src/sync/admin-template-photo-append-protocol.js";
import { adminPhotoRecordFixture, bytesHash } from "../fixtures/admin-template-photo-record-fixture.js";

const blocked = { code: "admin-template-photo-record", isAdminTemplateBlocked: true };
const cloned = value => structuredClone(value);

async function exactRawFixture(entityType = "item") {
  const input = await adminPhotoRecordFixture({ entityType }), source = input.snapshot.sourcePayload;
  source.packedItems = { "server-item": true };
  source.unknownBusiness = { exact: ["raw", null, 0] };
  source.locations = ["Bike", "Camp", "Bike"]; source.categories = [{ name: "Custom", unknown: [2, 1] }];
  source.layouts.original.unknownBusiness = { preserve: true };
  source.layouts.original.arrangement.packedItems = { "server-item": true };
  source.layouts.original.arrangement.unknownBusiness = [2, 0, 1];
  source.items["server-item"].unknownBusiness = { preserve: "item" };
  source.containers["server-bag"].unknownBusiness = { preserve: "container" };
  input.action.body.payload = cloned(source);
  const type = entityType === "item" ? "items" : "containers", serverId = entityType === "item" ? "server-item" : "server-bag";
  input.action.body.payload[type][serverId].name = input.snapshot.state[type][entityType === "item" ? "local-item" : "local-bag"].name;
  return input;
}

test("raw file actions preserve packed maps, dictionaries, unknown data and all unselected rows while saving selected fields", async () => {
  for (const entityType of ["item", "container"]) {
    const input = await exactRawFixture(entityType), type = entityType === "item" ? "items" : "containers";
    const serverId = entityType === "item" ? "server-item" : "server-bag", localId = entityType === "item" ? "local-item" : "local-bag";
    input.snapshot.sourcePayload[type][serverId].dimensions = { length: 9 };
    delete input.action.body.payload[type][serverId].dimensions;
    delete input.snapshot.state[type][localId].dimensions;
    const before = cloned(input), encoded = await encodeAdminTemplatePhotoRecord(input);
    const record = await decodeAdminTemplatePhotoRecord(encoded, input.binding, input.action.operationId);
    assert.deepEqual(record.action.body.payload, before.action.body.payload);
    assert.deepEqual(record.snapshot.sourcePayload, before.snapshot.sourcePayload);
    assert.equal(Object.hasOwn(record.action.body.payload[type][serverId], "dimensions"), false);
    assert.deepEqual(input, before);
  }
});

test("a file action rejects ordinary-export loss or tampering anywhere outside the selected owner's allowed fields", async () => {
  for (const mode of ["packed-layout", "packed-root", "unknown-layout", "unknown-arrangement", "unknown-root", "unknown-selected", "unknown-unselected",
    "unselected-name", "dictionaries", "active-layout", "availability", "placement", "opposite-kind", "omitted-empty-photos", "different-selected-field"]) {
    const input = await exactRawFixture(), payload = input.action.body.payload;
    if (mode === "packed-layout") payload.layouts.original.arrangement.packedItems = {};
    if (mode === "packed-root") delete payload.packedItems;
    if (mode === "unknown-layout") delete payload.layouts.original.unknownBusiness;
    if (mode === "unknown-arrangement") payload.layouts.original.arrangement.unknownBusiness.reverse();
    if (mode === "unknown-root") delete payload.unknownBusiness;
    if (mode === "unknown-selected") payload.items["server-item"].unknownBusiness.preserve = "Changed";
    if (mode === "unknown-unselected") delete payload.containers["server-bag"].unknownBusiness;
    if (mode === "unselected-name") payload.containers["server-bag"].name = "Changed outside this form";
    if (mode === "dictionaries") payload.locations = [...new Set(payload.locations)];
    if (mode === "active-layout") delete payload.activeLayoutId;
    if (mode === "availability") payload.items["server-item"].availabilityStatus = "unavailable";
    if (mode === "placement") payload.items["server-item"].containerId = "server-bag";
    if (mode === "opposite-kind") payload.items["server-item"].volume = 5;
    if (mode === "omitted-empty-photos") delete payload.containers["server-bag"].photos;
    if (mode === "different-selected-field") payload.items["server-item"].name = "Not the frozen editor's name";
    await assert.rejects(encodeAdminTemplatePhotoRecord(input), blocked, mode);
  }
});

test("recomputed inventory hashes cannot authorize raw payload loss on cold recovery", async () => {
  const input = await exactRawFixture(), encoded = await encodeAdminTemplatePhotoRecord(input);
  const intent = JSON.parse(encoded.intentJson);
  delete intent.action.body.payload.layouts.original.arrangement.packedItems;
  encoded.intentJson = JSON.stringify(intent); encoded.intentHash = await bytesHash(new TextEncoder().encode(encoded.intentJson));
  await assert.rejects(decodeAdminTemplatePhotoRecord(encoded, input.binding, input.action.operationId), blocked);
});

test("administrative item and container records retain exact bodies, raw references, views and all original/thumbnail bytes", async () => {
  for (const entityType of ["item", "container"]) for (const oldPhotos of [false, true]) {
    const input = await adminPhotoRecordFixture({ entityType, oldPhotos }), before = cloned(input);
    const encoded = await encodeAdminTemplatePhotoRecord(input);
    const record = await decodeAdminTemplatePhotoRecord(encoded, input.binding, input.action.operationId);
    assert.deepEqual(record.action, before.action); assert.deepEqual(record.snapshot, before.snapshot);
    assert.deepEqual(input, before);
    for (let i = 0; i < input.files.length; i++) {
      assert.equal(await record.files[i].file.text(), await before.files[i].file.text());
      assert.equal(await record.files[i].thumb?.text(), await before.files[i].thumb?.text());
      assert.deepEqual(record.files[i].stage, before.files[i].stage);
    }
    record.snapshot.state.items["local-item"].name = "Caller edit";
    new Uint8Array(encoded.files[0].file)[0] ^= 1;
    assert.equal(await record.files[0].file.text(), await before.files[0].file.text());
    assert.deepEqual(input, before);
  }
});

test("record capture freezes metadata and Blob handles before hashing yields", async () => {
  const input = await adminPhotoRecordFixture(), before = cloned(input);
  const pending = encodeAdminTemplatePhotoRecord(input);
  input.action.body.metadata.title = "Later title"; input.snapshot.state.items["local-item"].name = "Later owner";
  input.files[0] = { ...input.files[0], file: new Blob(["replaced"], { type: "image/png" }) };
  const encoded = await pending, record = await decodeAdminTemplatePhotoRecord(encoded, before.binding, before.action.operationId);
  assert.deepEqual(record.action, before.action); assert.deepEqual(record.snapshot, before.snapshot);
  assert.equal(await record.files[0].file.text(), await before.files[0].file.text());
});

test("stage manifest hashes and declared original metadata must match the actual stored files", async () => {
  for (const mode of ["file-bytes", "file-type", "file-size", "file-hash", "thumb-bytes", "thumb-absent", "asset-digest", "file-name"]) {
    const input = await adminPhotoRecordFixture(); input.files = input.files.map(part => ({ ...part, stage: cloned(part.stage) }));
    if (mode === "file-bytes") input.files[0].file = new Blob(["Different exact bytes"], { type: "image/png" });
    if (mode === "file-type") input.files[0].file = new Blob([await input.files[0].file.arrayBuffer()], { type: "image/jpeg" });
    if (mode === "file-size") input.files[0].stage.file.size++;
    if (mode === "file-hash") input.files[0].stage.file.hash = "0".repeat(64);
    if (mode === "thumb-bytes") input.files[0].thumb = new Blob(["Different thumb"], { type: "image/png" });
    if (mode === "thumb-absent") input.files[0].thumb = null;
    if (mode === "asset-digest") input.action.body.photoAppend.assets[0].assetDigest = "0".repeat(64);
    if (mode === "file-name") input.files[0].stage.file.fileName = "Changed.png";
    await assert.rejects(encodeAdminTemplatePhotoRecord(input), blocked, mode);
  }
});

test("a coherent manifest for another save, actor, base, owner or photo cannot bind to this action", async () => {
  for (const mode of ["save", "actor", "base", "entity", "photo", "second-owner"]) {
    const input = await adminPhotoRecordFixture(); input.files = input.files.map(part => ({ ...part, stage: cloned(part.stage) }));
    const stage = input.files[0].stage;
    if (mode === "save") stage.templateOperationId = crypto.randomUUID();
    if (mode === "actor") stage.actorId = "other-admin";
    if (mode === "base") stage.baseStateRevision++;
    if (mode === "entity") stage.entityId = "server-bag";
    if (mode === "photo") stage.photoId = "another-photo";
    if (mode === "second-owner") {
      input.action.body.photoAppend.assets[1].entityType = "container";
      input.action.body.photoAppend.assets[1].entityId = "server-bag";
    } else input.action.body.photoAppend.assets[0].assetDigest = await adminTemplatePhotoStageDigest(stage);
    await assert.rejects(encodeAdminTemplatePhotoRecord(input), blocked, mode);
  }
});

test("private-state forgery, stale identity and unconfirmed/public administrative sources are rejected", async () => {
  for (const mode of ["personal-binding", "private-owner", "private-layout", "wrong-active", "stale-map", "pending-base", "public-source", "missing-source",
    "foreign-template", "foreign-link", "foreign-arrangement"]) {
    const input = await adminPhotoRecordFixture(); input.snapshot = cloned(input.snapshot);
    const source = input.snapshot.state.layouts[input.snapshot.layoutId].adminCausalSource;
    if (mode === "personal-binding") input.binding.scopeKey = "id:admin-a";
    if (mode === "private-owner") input.snapshot.state.items.private = { id: "private", name: "Personal payload" };
    if (mode === "private-layout") input.snapshot.state.layouts.private = { id: "private" };
    if (mode === "wrong-active") input.snapshot.state.activeLayoutId = "private";
    if (mode === "stale-map") input.snapshot.ownerMap.stateRevision++;
    if (mode === "pending-base") source.base = { operationId: crypto.randomUUID() };
    if (mode === "public-source") source.visibility = "public";
    if (mode === "missing-source") delete input.snapshot.state.layouts[input.snapshot.layoutId].adminCausalSource;
    if (mode === "foreign-template") input.snapshot.state.layouts[input.snapshot.layoutId].adminSharedSourceId = "other-template";
    if (mode === "foreign-link") input.snapshot.state.items["local-item"].containerId = "private-bag";
    if (mode === "foreign-arrangement") input.snapshot.state.layouts[input.snapshot.layoutId].arrangement.items.private = "local-bag";
    await assert.rejects(encodeAdminTemplatePhotoRecord(input), blocked, mode);
  }
});

test("the complete raw old photo prefix and local view prefix remain protected while only one owner gains pending photos", async () => {
  for (const mode of ["raw-name", "raw-delete", "old-view", "new-url", "new-asset", "new-local-id", "reordered", "other-owner", "new-server-ref", "metadata"]) {
    const input = await adminPhotoRecordFixture(); input.snapshot = cloned(input.snapshot);
    const selected = input.snapshot.state.items["local-item"].photos;
    if (mode === "raw-name") input.action.body.payload.items["server-item"].photos[0].fileName = "Other.png";
    if (mode === "raw-delete") input.action.body.payload.items["server-item"].photos = [];
    if (mode === "old-view") selected[0].fileName = "Later view.png";
    if (mode === "new-url") selected[1].url = "https://example.test/unconfirmed.png";
    if (mode === "new-asset") selected[1].assetId = input.files[0].stage.operationId;
    if (mode === "new-local-id") selected[1].localId = "another-local";
    if (mode === "reordered") selected.reverse();
    if (mode === "other-owner") input.snapshot.state.containers["local-bag"].photos.push(cloned(selected[1]));
    if (mode === "new-server-ref") input.action.body.payload.items["server-item"].photos.push(cloned(selected[1]));
    if (mode === "metadata") input.snapshot.metadata = { ...input.snapshot.metadata, title: "Another selected title" };
    await assert.rejects(encodeAdminTemplatePhotoRecord(input), blocked, mode);
  }
});

test("cold decode rejects byte, metadata, intent and cross-binding corruption even with a recomputed inventory hash", async () => {
  for (const mode of ["bytes", "thumb", "key", "binding", "intent", "computed-file-hash", "extra-record", "missing-file"]) {
    const input = await adminPhotoRecordFixture(), record = await encodeAdminTemplatePhotoRecord(input);
    let binding = input.binding;
    if (mode === "bytes") new Uint8Array(record.files[0].file)[0] ^= 1;
    if (mode === "thumb") record.files[0].thumb = null;
    if (mode === "key") record.key = JSON.stringify([record.bindingKey, crypto.randomUUID()]);
    if (mode === "binding") binding = { ...binding, actorId: "other-admin" };
    if (mode === "intent") record.intentJson += " ";
    if (mode === "extra-record") record.other = "Unexpected record grammar";
    if (mode === "missing-file") record.files.pop();
    if (mode === "computed-file-hash") {
      const intent = JSON.parse(record.intentJson); intent.files[0].file.hash = "0".repeat(64);
      record.intentJson = JSON.stringify(intent); record.intentHash = await bytesHash(new TextEncoder().encode(record.intentJson));
    }
    await assert.rejects(decodeAdminTemplatePhotoRecord(record, binding, input.action.operationId), blocked, mode);
  }
});

async function beforeStateFixture(entityType = "item") {
  const input = await adminPhotoRecordFixture({ entityType }), type = entityType === "item" ? "items" : "containers";
  const localId = entityType === "item" ? "local-item" : "local-bag", serverId = entityType === "item" ? "server-item" : "server-bag";
  input.snapshot = cloned(input.snapshot);
  // The real administrative namespace always includes its selected packed map.
  input.snapshot.state.packedItems = {};
  input.snapshot.beforeState = cloned(input.snapshot.state);
  const before = input.snapshot.beforeState[type][localId];
  before.photos = before.photos.slice(0, before.photos.length - input.files.length);
  before.name = input.snapshot.sourcePayload[type][serverId].name;
  return { input, type, localId, serverId };
}

test("beforeState keeps the exact original photo prefix while item and container form fields and audit metadata change", async () => {
  for (const entityType of ["item", "container"]) {
    const { input, type, localId, serverId } = await beforeStateFixture(entityType);
    const fields = { name: "Changed in selected form", weight: 321, color: "green", location: "Bike", category: "Repair", categories: ["Repair"],
      note: "Captured note", dimensions: { length: 12, width: 8 }, updatedAt: "2026-09-11T17:00:00Z",
      updatedByDeviceId: "current-device", updatedByDeviceName: "Current device",
      ...(entityType === "item" ? { quantity: 3 } : { volume: 8, nestable: true }) };
    Object.assign(input.snapshot.state[type][localId], fields);
    Object.assign(input.action.body.payload[type][serverId], fields);
    input.snapshot.beforeState[type][localId].updatedAt = "2026-09-10T17:00:00Z";
    const frozen = cloned(input), encoded = await encodeAdminTemplatePhotoRecord(input);
    const record = await decodeAdminTemplatePhotoRecord(encoded, input.binding, input.action.operationId);
    assert.deepEqual(record.snapshot.beforeState, frozen.snapshot.beforeState);
    assert.deepEqual(record.snapshot.state, frozen.snapshot.state); assert.deepEqual(record.action, frozen.action);
    assert.deepEqual(record.snapshot.beforeState[type][localId].photos,
      frozen.snapshot.state[type][localId].photos.slice(0, -input.files.length));
    assert.deepEqual(record.action.body.payload[type][serverId].photos, input.snapshot.sourcePayload[type][serverId].photos);
    assert.equal(record.snapshot.beforeState[type][localId].name, input.snapshot.sourcePayload[type][serverId].name);
    assert.equal(record.snapshot.state[type][localId].name, fields.name);
    assert.deepEqual(record.snapshot.beforeState.layouts, record.snapshot.state.layouts);
    record.snapshot.beforeState[type][localId].photos[0].fileName = "Detached readback.png";
    assert.deepEqual(input, frozen);
  }
});

test("beforeState cannot introduce foreign namespaces, sources, owners, links, placements or non-form fields", async () => {
  const modes = ["private-owner", "owner-namespace", "missing-owner", "owner-id", "extra-layout", "layout-name", "active-layout",
    "source-actor", "source-revision", "source-public", "link", "placement", "dictionary", "packed", "unknown-field", "other-owner-field", "wrong-kind-field"];
  for (const mode of modes) {
    const { input } = await beforeStateFixture(), before = input.snapshot.beforeState, layoutId = input.snapshot.layoutId;
    if (mode === "private-owner") before.items.private = { id: "private", name: "Personal item" };
    if (mode === "owner-namespace") before.items["local-item"].publicCatalogLayoutId = "another-template";
    if (mode === "missing-owner") delete before.items["local-item"];
    if (mode === "owner-id") before.items["local-item"].id = "different-local-id";
    if (mode === "extra-layout") before.layouts.personal = { id: "personal", name: "Private layout" };
    if (mode === "layout-name") before.layouts[layoutId].name = "Different template metadata";
    if (mode === "active-layout") before.activeLayoutId = "another-template";
    if (mode === "source-actor") before.layouts[layoutId].adminCausalSource.binding.actorId = "another-admin";
    if (mode === "source-revision") before.layouts[layoutId].adminCausalSource.base.stateRevision++;
    if (mode === "source-public") before.layouts[layoutId].adminCausalSource.visibility = "public";
    if (mode === "link") before.items["local-item"].containerId = "private-container";
    if (mode === "placement") before.layouts[layoutId].arrangement.items["local-item"] = "local-bag";
    if (mode === "dictionary") before.locations.push("Other dictionary entry");
    if (mode === "packed") before.packedItems["local-item"] = true;
    if (mode === "unknown-field") before.items["local-item"].unknownBusiness = { changed: true };
    if (mode === "other-owner-field") before.containers["local-bag"].name = "Unrelated owner change";
    if (mode === "wrong-kind-field") before.items["local-item"].volume = 10;
    await assert.rejects(encodeAdminTemplatePhotoRecord(input), blocked, mode);
  }
  const { input } = await beforeStateFixture("container"); input.snapshot.beforeState.containers["local-bag"].quantity = 5;
  await assert.rejects(encodeAdminTemplatePhotoRecord(input), blocked, "container cannot borrow the item quantity field");
});

test("beforeState photo validation cannot erase or alter the old prefix or hide a photo outside its baseline owner", async () => {
  for (const mode of ["erase", "omit", "metadata", "url", "extra-photo", "wrong-owner", "pending-tail"]) {
    const { input } = await beforeStateFixture(), before = input.snapshot.beforeState;
    if (mode === "erase") before.items["local-item"].photos = [];
    if (mode === "omit") delete before.items["local-item"].photos;
    if (mode === "metadata") before.items["local-item"].photos[0].fileName = "Other original.png";
    if (mode === "url") before.items["local-item"].photos[0].url = "https://example.test/another.png";
    if (mode === "extra-photo") before.items["local-item"].photos.push({ ...cloned(before.items["local-item"].photos[0]), id: "foreign-photo" });
    if (mode === "wrong-owner") before.containers["local-bag"].photos.push(before.items["local-item"].photos.pop());
    if (mode === "pending-tail") before.items["local-item"].photos.push(cloned(input.snapshot.state.items["local-item"].photos.at(-1)));
    await assert.rejects(encodeAdminTemplatePhotoRecord(input), blocked, mode);
  }
});

test("beforeState is frozen before binary reads and its full content participates in cold inventory verification", async () => {
  const { input } = await beforeStateFixture(), frozen = cloned(input), file = input.files[0].file;
  let release, entered = false;
  const gate = new Promise(resolve => { release = resolve; }), read = file.arrayBuffer.bind(file);
  file.arrayBuffer = async () => { entered = true; await gate; return read(); };
  const pending = encodeAdminTemplatePhotoRecord(input);
  assert.equal(entered, true);
  input.snapshot.beforeState.items["local-item"].name = "Later pre-form state";
  input.snapshot.beforeState.items["local-item"].photos[0].fileName = "Later original.png";
  input.snapshot.beforeState.layouts[input.snapshot.layoutId].adminCausalSource.base.stateRevision++;
  release();
  const encoded = await pending, decoded = await decodeAdminTemplatePhotoRecord(encoded, frozen.binding, frozen.action.operationId);
  assert.deepEqual(decoded.snapshot.beforeState, frozen.snapshot.beforeState);
  const raw = JSON.parse(encoded.intentJson); raw.snapshot.beforeState.items["local-item"].name = "Different allowed pre-form name";
  encoded.intentJson = JSON.stringify(raw);
  await assert.rejects(decodeAdminTemplatePhotoRecord(encoded, frozen.binding, frozen.action.operationId), blocked, "even allowed field changes invalidate the saved digest");
  raw.snapshot.beforeState.items["local-item"].photos = [];
  encoded.intentJson = JSON.stringify(raw); encoded.intentHash = await bytesHash(new TextEncoder().encode(encoded.intentJson));
  await assert.rejects(decodeAdminTemplatePhotoRecord(encoded, frozen.binding, frozen.action.operationId), blocked, "a fresh hash cannot authorize a deleted original photo prefix");
});

test("an explicitly supplied beforeState must be a complete state rather than a falsy validation bypass", async () => {
  for (const value of [null, false, 0, ""]) {
    const { input } = await beforeStateFixture(); input.snapshot.beforeState = value;
    await assert.rejects(encodeAdminTemplatePhotoRecord(input), blocked);
  }
});
