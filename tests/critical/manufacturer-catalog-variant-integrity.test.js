import test from "node:test";
import assert from "node:assert/strict";
import { catalogValuesEqual, catalogChangesForReview, catalogVariantChanges } from "../../src/data/manufacturer-catalog-comparison.js";
import { compareManufacturerCatalogSnapshots } from "../../src/data/manufacturer-catalog-scan.js";
import { ortliebVariantEvidence } from "../../scripts/manufacturer-catalog/ortlieb-variant-evidence.mjs";
import { isRecentManufacturerModel, recentManufacturerModelCount } from "../../src/data/manufacturer-catalog-arrivals.js";
import { manufacturerBagCatalogVariantEntry, manufacturerBagCatalogVariantChoices } from "../../src/state/manufacturer-bag-catalog.js";
import { verifyCatalogAbsences } from "../../scripts/manufacturer-catalog/absence-evidence.mjs";

test("a stock change does not replace the model's existing SKU, color or weight", () => {
  const variants = [{ sku: "F5508", color: "rose", weight: 836, available: false }, { sku: "F5506", color: "ink", weight: 839, available: true }];
  const before = { id: "bag", brand: "ORTLIEB", sku: "F5506", color: "ink", weight: 839, weightOptions: [839], variants };
  const after = { ...before, sku: "F5508", color: "rose", weight: 836, weightOptions: [836], variants: [{ ...variants[0], available: true }, variants[1]] };
  const result = compareManufacturerCatalogSnapshots([before], [after]);
  assert.deepEqual(result.changes[0].fields.map((v) => v.field), ["variants"]);
  assert.deepEqual(catalogVariantChanges(variants, after.variants)[0].fields, [{ field: "available", before: false, after: true }]);
  const oldSaved = { ...result.changes[0], fields: [...result.changes[0].fields, { field: "sku", before: before.sku, after: after.sku }] };
  assert.deepEqual(catalogChangesForReview([oldSaved])[0].fields.map((v) => v.field), ["variants"]);
});

test("codes and variant ordering ignore casing, while actual codes and specifications remain reviewable", () => {
  assert.equal(catalogValuesEqual("material", "PVC (PD620, PS490)", "PVC (pd620, ps490)"), true);
  assert.equal(catalogValuesEqual("sku", "F5506", "f5506"), true);
  assert.deepEqual(catalogChangesForReview([{ type: "changed", fields: [{ field: "sku", before: "F5506", after: "f5506" }, { field: "material", before: "PD620", after: "pd620" }] }]), []);
  assert.deepEqual(catalogVariantChanges([{ sku: "F1", material: "PS55C" }], [{ id: 123, sku: "f1", material: "ps55c", sourceUrl: "https://example.com" }]), []);
  assert.equal(catalogValuesEqual("material", "PS490", "PS36C"), false);
  assert.equal(catalogValuesEqual("material", "X-Pac VX21 / 210D", "X-Pac vx21 / 210d"), true);
  const variants = [{ sku: "F1", weight: 100 }, { sku: "F2", weight: 200 }];
  assert.equal(catalogValuesEqual("variants", variants, [{ ...variants[1], sku: "f2" }, variants[0]]), true);
  assert.equal(catalogValuesEqual("variants", variants, [{ ...variants[1], weight: 300 }, variants[0]]), false);
});

test("selected ORTLIEB table beats family tags and comparison tables, gallery excludes recommendations", () => {
  const html = `<p>ql22</p><div class="specifications-table__row"><p>SKU</p><p>F5506</p></div><div class="specifications-table__row"><p>Material</p><p>PU-coated Cordura (ps55c)</p></div><div class="specifications-table__row"><p>Mounting System</p><p>Quick-Lock2.1</p></div><product-gallery><div data-media-type="image"><img src="/front.jpg"></div></product-gallery><img src="/other.jpg"><table><td>Quick-Lock2.2</td></table>`;
  const result = ortliebVariantEvidence(html, "https://us.ortlieb.com/products/back-roller?variant=1");
  assert.equal(result.mounting, "Quick-Lock2.1");
  assert.deepEqual(result.sourceImageUrls, ["https://us.ortlieb.com/front.jpg"]);
});

test("selected SKU retains its own material, source and photographs, including same-volume colors", () => {
  const entry = { id: "bag", material: "Classic", volume: 20, variants: [
    { sku: "A", title: "black", color: "black", material: "PD620", mounting: "QL2.1", sourceUrl: "https://test/?variant=1" },
    { sku: "B", title: "green", color: "green", material: "PS36C", mounting: "QL2.1", sourceUrl: "https://test/?variant=2" },
  ], imageUrls: ["/classic.jpg", "/plus.jpg"], imageSkuOptions: [["A"], ["B"]] };
  assert.equal(manufacturerBagCatalogVariantChoices(entry).length, 2);
  const selected = manufacturerBagCatalogVariantEntry(entry, "B");
  assert.equal(selected.material, "PS36C");
  assert.equal(selected.sourceUrl, "https://test/?variant=2");
  assert.deepEqual(selected.imageUrls, ["/plus.jpg"]);
});

test("new-model badges use publication only, expire exactly at 30 days and count all hierarchy levels", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  const rows = [{ id: "A", brand: "ORTLIEB", family: "bikepacking", category: "frame", catalogPublishedAt: "2026-09-01T12:00:00Z" },
    { id: "B", brand: "Arkel", family: "panniers", category: "pannier", catalogPublishedAt: "2026-08-28T12:00:00Z" },
    { id: "C", brand: "ORTLIEB", sourceCheckedAt: "2026-09-27", catalogPublishedAt: "2026-01-01" }];
  assert.equal(isRecentManufacturerModel(rows[1], now), false);
  assert.equal(isRecentManufacturerModel({ sourceCheckedAt: "2026-09-27" }, now), false);
  assert.equal(isRecentManufacturerModel({ catalogPublishedAt: "2026-09-28" }, now), false);
  for (const filters of [{}, { brand: "ORTLIEB" }, { family: "bikepacking" }, { category: "frame" }]) assert.equal(recentManufacturerModelCount(rows, filters, now), 1);
});

test("every manufacturer requires direct absence evidence before proposing missing models", async () => {
  for (const status of [200, 404, 403]) {
    const errors = { custom: [] };
    await verifyCatalogAbsences({ approved: [{ id: "bag", brand: "Custom", sourceUrl: "https://test/bag" }], scanned: [], sources: [{ id: "custom" }], errors,
      fetchText: async () => { if (status !== 200) throw Object.assign(new Error("blocked"), { httpStatus: status }); return "page"; } });
    assert.equal(errors.custom.length, status === 404 ? 0 : 1);
  }
});
