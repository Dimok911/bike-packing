import test from "node:test";
import assert from "node:assert/strict";
import { manufacturerBagSourceMeta, manufacturerBagCatalogImageUrls } from "../../src/state/manufacturer-bag-catalog.js";
import { MANUFACTURER_BAG_CATALOG } from "../../src/data/manufacturer-bag-catalog.js";
import { preparePersonalPhotoFormAttachments } from "../../src/sync/personal-photo-form-plan.js";
import { encodePersonalPhotoFormRecord, decodePersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-record.js";
import { assertPersonalPhotoFormRecord } from "../../src/sync/personal-photo-form-outbox-record.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { createPersonalPhotoFormSession } from "../../src/sync/personal-photo-form-session.js";
import { validatePersonalPhotoFormResult } from "../../src/sync/personal-photo-form-protocol.js";
import { personalPhotoRecoveryCancellationHead } from "../../src/sync/personal-photo-recovery-cancel.js";
import { PERSONAL_MANUFACTURER_PHOTO_FORM_ENABLED, personalManufacturerSourceMetadata, personalManufacturerPhotoFormSource } from "../../src/sync/personal-manufacturer-photo-source.js";

const source = patch => ({ version: 1, entry: { id: "source-bag", brand: "Fixture", sku: "ONE", imageUrl: "/one.jpg",
  imageUrls: ["/one.jpg", "/two.jpg"], volume: 10, ...patch }, imageUrls: ["/one.jpg", "/two.jpg"] });

test("manufacturer metadata matches existing catalog rules without discarding unknown frozen source fields", () => {
  assert.equal(PERSONAL_MANUFACTURER_PHOTO_FORM_ENABLED, false);
  for (const patch of [{}, { volumeOptions: [10, 4] }, { soldAsSet: true, volumeSetBasis: "equal-bags", totalVolume: 30, setQuantity: 3 },
    { soldAsSet: true, specificationBasis: "per-bag", volumePerBag: 7, setQuantity: 2 },
    { soldAsSet: true, specificationBasis: "per-bag", volumePerBagOptions: [8, 7], totalVolumeOptions: [30, 21], setQuantity: 3 },
    { provider: "test", sourceUrl: "https://example.test/one", sourceImageUrl: "https://example.test/image", sourceCheckedAt: "2026-09-09", unknown: { keep: [1, 2] } }]) {
    const selected = source(patch), before = structuredClone(selected);
    assert.deepEqual(personalManufacturerSourceMetadata(selected), manufacturerBagSourceMeta(selected.entry).manufacturerCatalogSource);
    const result = personalManufacturerPhotoFormSource({ version: 1, action: "form", entityType: "container", baseEntityRevision: 0,
      manufacturerSource: selected, changes: [{ action: "attach" }] });
    assert.deepEqual(result.source, before); assert.deepEqual(selected, before);
  }
});

test("the frozen-source projection accepts the existing catalog and preserves its current provenance", () => {
  let checked = 0;
  for (const entry of MANUFACTURER_BAG_CATALOG) {
    const imageUrls = manufacturerBagCatalogImageUrls(entry).slice(0, 50); if (!imageUrls.length) continue;
    assert.deepEqual(personalManufacturerSourceMetadata({ version: 1, entry, imageUrls }), manufacturerBagSourceMeta(entry).manufacturerCatalogSource, entry.id);
    checked++;
  }
  assert.ok(checked > 100);
});

test("manufacturer form freezes the source, private owner and every file in the real form codec", async () => {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" };
  const base = { items: {}, containers: {}, layouts: {} }, selected = source({ custom: { value: "original" } });
  const input = { binding, basePayload: base, snapshot: base, baseStateRevision: 1, entityType: "container", entityId: "new-bag",
    baseEntityRevision: 0, fields: { name: "Edited after selection", weight: 222 }, manufacturerSource: selected,
    files: [1, 2].map(index => ({ file: new Blob([`selected ${index}`], { type: "image/png" }), fileName: `selected-${index}.png` })) };
  assert.throws(() => preparePersonalPhotoFormAttachments(input, { enabled: true }));
  for (const value of [NaN, undefined, new Date()]) {
    const invalidSource = structuredClone(selected); invalidSource.entry.custom.value = value;
    assert.throws(() => preparePersonalPhotoFormAttachments({ ...input, manufacturerSource: invalidSource },
      { enabled: true, manufacturerSourceEnabled: true }), { code: "payload-shape" });
  }
  const plan = preparePersonalPhotoFormAttachments(input, { enabled: true, manufacturerSourceEnabled: true });
  selected.entry.custom.value = "changed";
  const action = { ...binding, operationId: plan.operationId, kind: "photos.mutate", generation: 1, body: plan.body };
  const encoded = await encodePersonalPhotoFormRecord({ binding, action, snapshot: plan.snapshot, files: plan.files });
  const saved = await decodePersonalPhotoFormRecord(encoded, binding, plan.operationId);
  assert.equal(saved.action.body.manufacturerSource.entry.custom.value, "original");
  assert.deepEqual(await Promise.all(saved.files.map(part => part.file.text())), ["selected 1", "selected 2"]);
  assert.equal(saved.snapshot.containers["new-bag"].manufacturerCatalogSource.catalogId, "source-bag");
  const record = { action, snapshot: plan.snapshot, mergeBase: { payload: base, stateRevision: 1 },
    photoState: { version: 1, payload: plan.payload, fileIntentHash: saved.intentHash, fileInventoryVersion: 2 } };
  assertPersonalPhotoFormRecord(record);
  const altered = structuredClone(record); altered.photoState.payload.containers["new-bag"].manufacturerCatalogSource.totalVolume = 999;
  assert.throws(() => assertPersonalPhotoFormRecord(altered));
});

test("a manufacturer form with all selected images removed retains its complete source without file storage or upload", async () => {
  const binding = { environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list" };
  const base = { items: {}, containers: {}, layouts: {} }, values = new Map(), context = { ...binding, scope: "personal", generation: "form" };
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = enabled => createPersonalSaveOutbox({ ...binding, storage, photoEnabled: true, photoFormEnabled: true, manufacturerSourceEnabled: enabled, pendingFormUpdateEnabled: enabled });
  const outbox = make(true); outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 1 }); let applied = 0;
  const store = { binding, ids: async () => [], captureForm: () => assert.fail("No file record expected"), read: () => assert.fail("No file read expected") };
  const session = createPersonalPhotoFormSession({ outbox, store, getContext: () => context, enabled: true, manufacturerSourceEnabled: true,
    onDurable: () => { applied++; } });
  const input = { binding, basePayload: base, snapshot: base, baseStateRevision: 1, entityType: "container", entityId: "bag", created: true,
    fields: { name: "Source without photos" }, manufacturerSource: source(), files: [] };
  const pending = session.submit(input); assert.equal(session.submit(input), pending);
  const { record, fileRetained } = await pending; assert.equal(fileRetained, false); assert.equal(applied, 1);
  assert.equal(record.photoState.fileIntentHash, null); assert.deepEqual(record.action.body.changes, []);
  assert.deepEqual(make(false).recover().action, record.action);
  const result = { ok: true, stateRevision: 2, list: { id: "list", stateRevision: 2, payload: record.photoState.payload }, photoChanges: [],
    photoForm: { entityType: "container", entityId: "bag", created: true, manufacturerCatalogSource: record.photoState.payload.containers.bag.manufacturerCatalogSource } };
  assert.equal(validatePersonalPhotoFormResult(result, record.action), true);
  const tampered = structuredClone(result); delete tampered.photoForm.manufacturerCatalogSource;
  assert.equal(validatePersonalPhotoFormResult(tampered, record.action), false);
  const flags = { formEnabled: true, batchEnabled: true, editEnabled: false, manufacturerSourceEnabled: true };
  assert.equal(Boolean(personalPhotoRecoveryCancellationHead(record, flags)), true);
  assert.equal(Boolean(personalPhotoRecoveryCancellationHead(record, { ...flags, manufacturerSourceEnabled: false })), false);
  const snapshot = structuredClone(record.snapshot); snapshot.containers.bag.weight = 222;
  const child = outbox.capture({ snapshot, body: { baseStateRevision: 1, payload: snapshot } });
  assert.equal(child.action.body.photoResults.version, 5); assert.deepEqual(make(false).recover().action, child.action);
});

test("manufacturer form source rejects missing identity, foreign selections and an existing or copied owner", () => {
  const body = { version: 1, action: "form", entityType: "container", baseEntityRevision: 0, manufacturerSource: source(), changes: [{ action: "attach" }] };
  for (const mutate of [value => { delete value.manufacturerSource.entry.id; }, value => { value.manufacturerSource.entry.id = "__proto__"; },
    value => { value.manufacturerSource.imageUrls.reverse(); }, value => { value.manufacturerSource.imageUrls = ["/foreign.jpg"]; },
    value => { value.manufacturerSource.imageUrls = []; }, value => { value.manufacturerSource.entry.sourceUrl = "x".repeat(4097); },
    value => { value.baseEntityRevision = 1; }, value => { value.entityType = "item"; }, value => { value.copySource = {}; },
    value => { value.changes[0].action = "delete"; }]) {
    const changed = structuredClone(body); mutate(changed); assert.throws(() => personalManufacturerPhotoFormSource(changed));
  }
});
