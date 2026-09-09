import test from "node:test";
import assert from "node:assert/strict";
import { guestSelectionFixture } from "./personal-guest-import-fixture.js";
import { preparePersonalGuestImportSelection } from "../../src/sync/personal-guest-import-selection.js";
import { preparePersonalGuestImportFiles } from "../../src/sync/personal-guest-import-files.js";

test("guest file reads retain frozen owners, references, IDs and exact native bytes without reallocating identities", async () => {
  const selection = preparePersonalGuestImportSelection(guestSelectionFixture(), { enabled: true }), expected = structuredClone(selection.photoTargets[0]), calls = [];
  let release; const wait = new Promise(resolve => { release = resolve; });
  const preparation = preparePersonalGuestImportFiles(selection, { loadFile: async input => {
    calls.push(input); await wait;
    return { file: new Blob(["original guest bytes"], { type: "image/png" }), thumb: new Blob(["thumb"], { type: "image/jpeg" }), fileName: "Фото.png" };
  } });
  const pending = preparation.verify(); selection.candidate.sourceState.items.item.photos[0].id = "late"; selection.photoTargets[0].assetId = crypto.randomUUID();
  release(); const files = await pending, repeated = await preparation.verify();
  assert.equal(calls.length, 1); assert.equal(calls[0].entityId, "item"); assert.equal(calls[0].photo.id, "guest-original");
  assert.equal(files[0].assetId, expected.assetId); assert.equal(files[0].photoId, expected.photoId);
  assert.equal(await files[0].file.text(), "original guest bytes"); assert.equal(await files[0].thumb.text(), "thumb");
  assert.equal(files[0].manifest.file.fileName, "Фото.png"); assert.match(files[0].manifest.file.hash, /^[a-f0-9]{64}$/);
  files[0].manifest.assetId = "late"; assert.equal(repeated[0].manifest.assetId, expected.assetId);
});

test("guest source hash mismatch retains the bytes for recovery and an unavailable file never manufactures a substitute", async () => {
  const selection = preparePersonalGuestImportSelection(guestSelectionFixture(), { enabled: true });
  selection.candidate.sourceState.items.item.photos[0].sha256 = "0".repeat(64);
  let calls = 0;
  const preparation = preparePersonalGuestImportFiles(selection, { loadFile: async () => {
    calls++; return { file: new Blob(["changed source"], { type: "image/png" }), thumb: null, fileName: "source.png" };
  } });
  await assert.rejects(preparation.verify()); await assert.rejects(preparation.verify()); assert.equal(calls, 1);
  assert.equal(await preparation.recoveryFiles()[0].file.text(), "changed source"); assert.equal(preparation.recoveryFiles()[0].manifest, undefined);
  const missing = preparePersonalGuestImportFiles(selection, { loadFile: async () => null });
  await assert.rejects(missing.verify()); assert.deepEqual(missing.recoveryFiles(), []);
});
