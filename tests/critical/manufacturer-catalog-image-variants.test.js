import test from "node:test";
import assert from "node:assert/strict";
import { annotateManufacturerImageVariants } from "../../scripts/manufacturer-catalog/image-variants.mjs";
import { splitManufacturerBagCatalogSkuModels } from "../../src/data/manufacturer-bag-catalog-variants.js";
import { selectManufacturerVariantImages } from "../../src/data/manufacturer-catalog-image-variants.js";

function product(urls, volumes = [4, 6]) {
  return {
    id: "test-frame-pack", name: "Frame Pack", volume: volumes[0], volumeOptions: volumes,
    variants: volumes.map((volume, index) => ({ volume, sku: `F${100 + index}`, title: `${volume} L`, available: true })),
    sourceImageUrls: urls, sourceImageUrl: urls[0],
    imageAssetPaths: urls.map((_, i) => `assets/image-${i}.jpg`), imageAssetPath: "assets/image-0.jpg",
    imageUrls: urls.map((_, i) => `/image-${i}.jpg`), imageUrl: "/image-0.jpg"
  };
}

test("size split keeps SKU-specific photos and excludes unassigned photos", () => {
  const entry = product(["https://test/front-small.jpg", "https://test/front-large.jpg", "https://test/shared.jpg", "https://test/back-large.jpg"]);
  const annotated = annotateManufacturerImageVariants(entry, { product: {
    variants: [{ id: 1, title: "4 L" }, { id: 2, title: "6 L" }],
    images: [{ src: entry.sourceImageUrls[0], variant_ids: [1] }, { src: entry.sourceImageUrls[1], variant_ids: [2] }, { src: entry.sourceImageUrls[3], alt: "#F101" }]
  }});
  const [small, large] = splitManufacturerBagCatalogSkuModels([annotated]);
  assert.deepEqual(small.imageUrls, ["/image-0.jpg"]);
  assert.deepEqual(large.imageUrls, ["/image-1.jpg", "/image-3.jpg"]);
  assert.equal(small.unassignedImageCount, 1);
  assert.equal(large.imageAssetPath, "assets/image-1.jpg");
  assert.equal(large.sourceImageUrl, entry.sourceImageUrls[1]);
  assert.equal(large.imageUrl, "/image-1.jpg");
  assert.deepEqual(splitManufacturerBagCatalogSkuModels([small, large]), [small, large]);
});

test("manufacturer variant galleries exclude sibling sizes and unrelated page illustrations", () => {
  const entry = product(["https://test/opaque-a.jpg", "https://test/opaque-b.jpg", "https://test/shared.jpg", "https://test/feature.jpg"], [2.8, 3.8]);
  const html = `<div class="gallery-variation" data-variation="pa_size_v_2-8l"><div><img src="https://test/opaque-a-800x533.jpg"></div><img src="https://test/shared.jpg"></div>
    <div class="gallery-variation" data-variation="pa_size_v_3-8l"><img src="https://test/opaque-b.jpg"><img src="https://test/shared.jpg"></div><img src="https://test/feature.jpg">`;
  const [small, large] = splitManufacturerBagCatalogSkuModels([annotateManufacturerImageVariants(entry, { html })]);
  assert.deepEqual(small.imageUrls, ["/image-0.jpg", "/image-2.jpg"]);
  assert.deepEqual(large.imageUrls, ["/image-1.jpg", "/image-2.jpg"]);
});

test("size names map using manufacturer capacity labels, not gallery order", () => {
  const entry = product(["https://test/s.jpg", "https://test/m.jpg"], [1.1, 1.5]);
  const html = `<p>Small – 1.1L</p><p>Medium – 1.5L</p><div class="gallery-variation" data-variation="pa_size_v_medium"><img src="https://test/m.jpg"></div><div class="gallery-variation" data-variation="pa_size_v_small"><img src="https://test/s.jpg"></div>`;
  const [small, medium] = splitManufacturerBagCatalogSkuModels([annotateManufacturerImageVariants(entry, { html })]);
  assert.deepEqual(small.imageUrls, ["/image-0.jpg"]);
  assert.deepEqual(medium.imageUrls, ["/image-1.jpg"]);
});

test("unmatched capacities never fall back to another size's cover", () => {
  const entry = product(["https://test/bag-6l.jpg"]);
  const [small, large] = splitManufacturerBagCatalogSkuModels([annotateManufacturerImageVariants(entry)]);
  assert.equal(small.imageUrl, "");
  assert.deepEqual(small.imageUrls, []);
  assert.deepEqual(large.imageUrls, ["/image-0.jpg"]);
});

test("decimal capacities do not match integer suffixes or photo sequence numbers", () => {
  const entry = product(["https://test/bag-14.5l.jpg", "https://test/bag-4_5L.jpg", "https://test/photo-4.jpg", "https://test/bag-4.5L-14.5L.jpg"], [4.5, 14.5]);
  const [small, large] = splitManufacturerBagCatalogSkuModels([annotateManufacturerImageVariants(entry)]);
  assert.deepEqual(small.imageUrls, ["/image-1.jpg", "/image-3.jpg"]);
  assert.deepEqual(large.imageUrls, ["/image-0.jpg", "/image-3.jpg"]);
});

test("misaligned arrays fail visibly instead of pairing a photo with the wrong source", () => {
  assert.throws(() => selectManufacturerVariantImages({ ...product(["https://test/a.jpg"]), imageVolumeOptions: [null, [4]] }), /Misaligned/);
});
