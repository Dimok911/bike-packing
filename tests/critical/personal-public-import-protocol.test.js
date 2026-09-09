import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encodePersonalPublicImportRecord, decodePersonalPublicImportRecord } from "../../src/sync/personal-public-import-record.js";
import { preparePersonalPublicImportSelection } from "../../src/sync/personal-public-import-selection.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { assertPersonalPublicImportBody, assertPersonalPublicImportHashes, personalPublicImportReceipt,
  validatePersonalPublicImportResult } from "../../src/sync/personal-public-import-protocol.js";

import { publicImportFixture as fixture } from "./personal-public-import-fixture.js";

test("public selection freezes source and destination before file work and rejects reused IDs and disabled writers", async () => {
  const f = await fixture(false), selected = f.selection;
  const input = { ...selected, layoutIds: ["a"], layoutNames: ["Another private copy"] };
  assert.throws(() => preparePersonalPublicImportSelection(input));
  const duplicate = randomUUID();
  assert.throws(() => preparePersonalPublicImportSelection(input, { enabled: true, createUuid: () => duplicate }));
  const copy = preparePersonalPublicImportSelection(input, { enabled: true });
  input.sourcePayload.items.item.custom.selected = "late source change"; input.basePayload.categories.push("late target change");
  assert.equal(copy.sourcePayload.items.item.custom.selected, "complete original field"); assert.deepEqual(copy.basePayload.categories, []);
  assert.ok(copy.ownerTargets.every(target => target.reuse === false && target.targetId !== target.sourceId));
});

test("public native codec retains the original public operation and every file through reload and caller mutation", async () => {
  const f = await fixture(false), manifest = f.action.body.publicImport, expected = structuredClone(f.action);
  const files = manifest.files.map(part => ({ file: f.file, thumb: null, stage: { operationId: part.assetId, photoId: part.photoId,
    entityType: part.entityType, entityId: part.entityId, fileName: part.file.fileName } }));
  const writing = encodePersonalPublicImportRecord({ binding: f.binding, action: f.action, snapshot: f.plan.payload, files });
  f.action.body.publicImport.sourcePayload.items.item.name = "Changed after capture"; files[0].file = new Blob(["wrong"]);
  const encoded = await writing, saved = await decodePersonalPublicImportRecord(encoded, f.binding, expected.operationId);
  assert.deepEqual(saved.action, expected); assert.equal(await saved.files[0].file.text(), "frozen public original");
  const corrupt = structuredClone(encoded); new Uint8Array(corrupt.files[0].file)[0] ^= 255;
  await assert.rejects(decodePersonalPublicImportRecord(corrupt, f.binding, expected.operationId));
  await assert.rejects(decodePersonalPublicImportRecord(encoded, { ...f.binding, listId: "other" }, expected.operationId));
});

test("public outbox binds its source read and survives reload with all writers disabled, including no-file copies", async () => {
  for (const fileless of [false, true]) {
    const f = await fixture(fileless), values = new Map(), encoded = new Map();
    const storage = { get length() { return values.size; }, key: index => [...values.keys()][index],
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const outbox = createPersonalSaveOutbox({ ...f.binding, storage, photoEnabled: true, photoBatchEnabled: true, publicImportEnabled: true });
    outbox.adoptRemoteBaseline({ snapshot: f.options.base, payload: f.options.base, stateRevision: f.action.body.baseStateRevision });
    const body = structuredClone(f.action.body); delete body.causal;
    const plan = outbox.preparePhoto({ snapshot: f.plan.payload, payload: f.plan.payload, body, operationId: f.action.operationId });
    const manifest = body.publicImport;
    const files = manifest.files.map(part => ({ file: f.file, thumb: null, stage: { operationId: part.assetId, photoId: part.photoId,
      entityType: part.entityType, entityId: part.entityId, fileName: part.file.fileName } }));
    if (files.length) encoded.set(plan.action.operationId, await encodePersonalPublicImportRecord({ binding: f.binding, ...plan, files }));
    const store = { binding: f.binding, read: id => decodePersonalPublicImportRecord(encoded.get(id), f.binding, id) };
    const record = await outbox.capturePhoto({ plan, store, getContext: () => ({ ...f.binding, scope: "personal", generation: "editor" }) });
    assert.deepEqual(record.action.body.causal.reads, [{ listId: manifest.source.listId, revision: manifest.source.stateRevision }]);
    assert.equal(encoded.size, Number(!fileless)); assert.equal(record.photoState.fileIntentHash === null, fileless);
    const cold = createPersonalSaveOutbox({ ...f.binding, storage });
    assert.deepEqual(cold.recover().action, record.action);
    await assert.rejects(cold.drain({ getContext: () => ({ ...f.binding, scope: "personal", generation: "editor" }), queue: {} }), /шаблонов/);
    assert.deepEqual(cold.recover().action, record.action);
  }
});

test("public copy binds the complete selected source, numeric revision and all new private identities", async () => {
  for (const fileless of [false, true]) {
    const { action, plan, options } = await fixture(fileless), body = action.body;
    assert.deepEqual(assertPersonalPublicImportBody(body, options), plan); await assertPersonalPublicImportHashes(body);
    const frozen = structuredClone(body);
    const checked = assertPersonalPublicImportBody(body, options);
    checked.payload.items[plan.createdOwners.items[0]].custom.selected = "caller mutation";
    assert.deepEqual(body, frozen);
    for (const mutate of [value => { value.publicImport.source.stateRevision++; },
      value => { value.causal.reads = []; }, value => { value.publicImport.sourcePayload.items.item.custom.selected = "changed source"; },
      value => { value.publicImport.ownerTargets[0].reuse = true; }, value => { value.guestImport = value.publicImport; },
      value => { value.publicImport.source.kind = "private"; }, value => { value.publicImport.source.language = "fr"; },
      value => { value.publicImport.sourcePayload.items.item.extra = undefined; }, value => { value.publicImport.sourcePayload.items.item.weight = NaN; }]) {
      const changed = structuredClone(body); mutate(changed); assert.throws(() => assertPersonalPublicImportBody(changed, options));
    }
    const changed = structuredClone(body); changed.publicImport.sourcePayload.items.item.custom.selected = "late mutation";
    await assert.rejects(assertPersonalPublicImportHashes(changed));
  }
});

test("public result requires the source identity and every exact private owner and photo outcome", async () => {
  for (const fileless of [false, true]) {
    const { action } = await fixture(fileless), manifest = action.body.publicImport, payload = structuredClone(action.body.payload);
    const publicPhotos = manifest.files.map(file => {
      const photo = { id: file.photoId, photoId: file.photoId, assetId: file.assetId, listId: action.listId, status: "synced",
        url: "https://example.test/full.png", thumbUrl: "https://example.test/thumb.png", fileName: file.file.fileName,
        type: file.file.type, size: file.file.size, width: 1, height: 1 };
      payload.items[file.entityId].photos = [photo];
      return { entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, assetId: file.assetId,
        fileHash: file.file.hash, thumbHash: file.file.hash, photo };
    });
    const revision = manifest.targetStateRevision + 1;
    const result = { ok: true, stateRevision: revision, list: { id: action.listId, payload, stateRevision: revision },
      publicImport: personalPublicImportReceipt(manifest), publicPhotos };
    assert.equal(validatePersonalPublicImportResult(result, action), true);
    for (const mutate of [value => { value.publicImport.source.stateRevision++; }, value => { value.publicImport.source.listId += "-other"; },
      value => { delete value.list.payload.items[manifest.ownerTargets[1].targetId].custom; },
      value => { value.guestImport = value.publicImport; }, value => { value.stateRevision++; }]) {
      const changed = structuredClone(result); mutate(changed); assert.equal(validatePersonalPublicImportResult(changed, action), false);
    }
    if (!fileless) {
      const changed = structuredClone(result); changed.publicPhotos[0].fileHash = "b".repeat(64);
      assert.equal(validatePersonalPublicImportResult(changed, action), false);
    }
  }
});
