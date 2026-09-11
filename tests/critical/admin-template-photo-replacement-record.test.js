import test from "node:test";
import assert from "node:assert/strict";
import { encodeAdminTemplatePhotoRecord, decodeAdminTemplatePhotoRecord } from "../../src/sync/admin-template-photo-record.js";
import { adminTemplatePhotoSavePlan } from "../../src/sync/admin-template-photo-save-plan.js";
import { adminTemplatePhotoEditorSnapshot, prepareAdminTemplatePhotoRecord } from "../../src/public/admin-template-photo-state.js";
import { adminPhotoReplacementRecordFixture as fixture, replacementPreparationInput } from "../fixtures/admin-template-photo-replacement-record-fixture.js";

test("replacement item/container inventory preserves raw originals, exact mixed order, before-state and complete bytes on cold decode", async () => {
  for (const entityType of ["item", "container"]) for (const retainOld of [false, true]) {
    const input = await fixture({ entityType, retainOld }), encoded = await encodeAdminTemplatePhotoRecord(input);
    const saved = await decodeAdminTemplatePhotoRecord(encoded, input.binding, input.action.operationId);
    assert.deepEqual(saved.action, input.action); assert.deepEqual(saved.snapshot, input.snapshot);
    assert.equal(encoded.version, 2, "existing binary inventory codec version is unchanged"); assert.equal(saved.action.body.photoAppend.version, 2);
    for (const [index, part] of saved.files.entries()) {
      assert.equal(await part.file.text(), await input.files[index].file.text());
      assert.equal(part.thumb && await part.thumb.text(), input.files[index].thumb && await input.files[index].thumb.text());
    }
    const type = entityType === "item" ? "items" : "containers", id = entityType === "item" ? "server-item" : "server-bag";
    assert.deepEqual(saved.action.body.payload[type][id].photos, input.snapshot.sourcePayload[type][id].photos);
    assert.deepEqual(saved.action.body.photoAppend.photoIds, retainOld ? ["photo-new-1", "photo-existing", "photo-new-0"] : ["photo-new-1", "photo-new-0"]);
  }
});

test("replacement candidates require exact retained old views, final IDs and every new file without collateral fields", async () => {
  for (const mode of ["missing-before", "before-photos", "old-metadata", "order", "new-metadata", "missing-file", "raw-loss", "other-owner", "namespace"]) {
    const input = await fixture({ retainOld: true }), state = input.snapshot.state;
    if (mode === "missing-before") delete input.snapshot.beforeState;
    if (mode === "before-photos") input.snapshot.beforeState.items["local-item"].photos = [];
    if (mode === "old-metadata") state.items["local-item"].photos[1].fileName = "Relabelled.png";
    if (mode === "order") state.items["local-item"].photos.reverse();
    if (mode === "new-metadata") state.items["local-item"].photos[0].foreignAsset = { owner: "other" };
    if (mode === "missing-file") input.files.pop();
    if (mode === "raw-loss") input.action.body.payload.items["server-item"].photos = [];
    if (mode === "other-owner") state.containers["local-bag"].name = "Changed other owner";
    if (mode === "namespace") input.snapshot.beforeState.categories.push("Collateral category");
    await assert.rejects(encodeAdminTemplatePhotoRecord(input), { code: "admin-template-photo-record" }, mode);
  }
});

test("cold replacement inventory rejects corrupted originals, thumbnails, before-state and final selected order", async () => {
  for (const mode of ["file", "thumb", "before", "order"]) {
    const input = await fixture({ retainOld: true }), encoded = await encodeAdminTemplatePhotoRecord(input);
    if (mode === "file") new Uint8Array(encoded.files[0].file)[0] ^= 1;
    if (mode === "thumb") new Uint8Array(encoded.files[0].thumb)[0] ^= 1;
    if (mode === "before" || mode === "order") {
      const intent = JSON.parse(encoded.intentJson);
      if (mode === "before") intent.snapshot.beforeState.items["local-item"].name = "Tampered before-state";
      else intent.action.body.photoAppend.photoIds.reverse();
      encoded.intentJson = JSON.stringify(intent);
    }
    await assert.rejects(decodeAdminTemplatePhotoRecord(encoded, input.binding, input.action.operationId), { code: "admin-template-photo-record" });
  }
});

test("explicit replacement preparation retains the V5 plan and immutable selected input before the first binary await", async () => {
  const input = await fixture({ retainOld: true }), args = replacementPreparationInput(input), before = structuredClone(args.snapshot);
  const bytes = args.files[0].blob, read = bytes.arrayBuffer.bind(bytes); let resume, entered;
  const waiting = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { resume = resolve; });
  let first = true;
  bytes.arrayBuffer = async () => { if (first) { first = false; entered(); await gate; } return read(); };
  const preparing = prepareAdminTemplatePhotoRecord(args); await waiting;
  args.snapshot.state.items["local-item"].photos.reverse(); args.snapshot.beforeState.items["local-item"].name = "Late before mutation";
  args.payload.items["server-item"].name = "Late field"; args.files[0].blob = new Blob(["Changed"], { type: "image/png" }); args.replace = false;
  resume(); const record = await preparing;
  assert.deepEqual(record.snapshot, before); assert.equal(record.action.body.photoAppend.version, 2);
  assert.deepEqual(record.action.body.photoAppend.photoIds, ["photo-new-1", "photo-existing", "photo-new-0"]);
  assert.equal(await record.files[0].file.text(), await bytes.text());
  const plan = adminTemplatePhotoSavePlan({ binding: record.binding, operationId: record.action.operationId, body: record.action.body,
    editorSnapshot: adminTemplatePhotoEditorSnapshot(record.snapshot.state, record.snapshot.layoutId, record.snapshot.metadata) });
  assert.equal(plan.version, 5); assert.deepEqual(plan.operations[0].body, record.action.body);
});

test("replacement intent cannot be inferred when the explicit preparation option is absent or malformed", async () => {
  for (const replace of [undefined, false, "true"]) {
    const args = replacementPreparationInput(await fixture());
    if (replace === undefined) delete args.replace; else args.replace = replace;
    await assert.rejects(prepareAdminTemplatePhotoRecord(args));
  }
});
