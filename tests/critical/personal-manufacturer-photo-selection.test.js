import test from "node:test";
import assert from "node:assert/strict";
import { preparePersonalManufacturerPhotoSelection } from "../../src/public/personal-manufacturer-photo-selection.js";

const entry = () => ({ id: "bag-1", brand: "Fixture", name: "Bag", sku: "SKU-1", weight: 100, volume: 3,
  imageUrl: "/catalog/1.jpg", imageUrls: ["/catalog/1.jpg", "/catalog/2.jpg", "/catalog/3.jpg"],
  sourceUrl: "https://manufacturer.example/bag", customSourceField: { selected: true } });

test("manufacturer selection freezes all source data and ordered bytes before asynchronous reads", async () => {
  const selected = entry(), original = structuredClone(selected), calls = [];
  const result = await preparePersonalManufacturerPhotoSelection(selected, { enabled: true, maxPhotos: 2, fetchImageFile: async (source, options) => {
    calls.push(options.imageUrl); selected.weight = 999; selected.customSourceField.selected = false; selected.imageUrls.reverse();
    assert.deepEqual(source, original); assert.equal(Object.isFrozen(source.customSourceField), true);
    return new Blob([options.imageUrl], { type: "image/jpeg" });
  } });
  assert.deepEqual(result.source, { version: 1, entry: original, imageUrls: ["/catalog/1.jpg", "/catalog/2.jpg"] });
  assert.equal(result.draft.weight, 100); assert.deepEqual(await Promise.all(result.files.map(file => file.text())), calls);
});

test("manufacturer preparation refuses partial file success and a stale form without reading later files", async () => {
  for (const failure of ["HTTP", "empty", "wrong MIME", "stale"]) {
    let calls = 0, current = true;
    await assert.rejects(preparePersonalManufacturerPhotoSelection(entry(), { enabled: true, isCurrent: () => current,
      fetchImageFile: async () => {
        calls++;
        if (calls === 1) return new Blob(["first"], { type: "image/jpeg" });
        if (failure === "HTTP") throw Error("HTTP 503");
        if (failure === "stale") current = false;
        return new Blob(failure === "empty" ? [] : ["second"], { type: failure === "wrong MIME" ? "text/html" : "image/png" });
      } }));
    assert.equal(calls, 2);
  }
});

test("disabled or invalid manufacturer preparation never reads source images", async () => {
  const fetchImageFile = () => assert.fail("No source read expected");
  assert.equal(await preparePersonalManufacturerPhotoSelection(entry(), { fetchImageFile }), null);
  for (const maxPhotos of [0, -1, 1.5, Infinity, 51]) await assert.rejects(preparePersonalManufacturerPhotoSelection(entry(), { enabled: true, maxPhotos, fetchImageFile }));
  await assert.rejects(preparePersonalManufacturerPhotoSelection(entry(), { enabled: true, isCurrent: () => false, fetchImageFile }));
});

test("manufacturer source refuses lossy JSON before reading any image", async () => {
  for (const value of [NaN, Infinity, undefined, 1n, new Date(), () => {}, [, 1]]) {
    await assert.rejects(preparePersonalManufacturerPhotoSelection({ ...entry(), extra: value }, {
      enabled: true, fetchImageFile: () => assert.fail("Invalid source must be retained without fetching")
    }), { code: "payload-shape" });
  }
  const cyclic = entry(); cyclic.extra = cyclic;
  await assert.rejects(preparePersonalManufacturerPhotoSelection(cyclic, {
    enabled: true, fetchImageFile: () => assert.fail("No cyclic source read")
  }), { code: "payload-shape" });
});
