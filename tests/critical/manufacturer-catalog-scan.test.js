import test from "node:test";
import assert from "node:assert/strict";
import "./manufacturer-catalog-review.test.js";
import {
  buildManufacturerCatalogScanReport,
  compareManufacturerCatalogSnapshots,
} from "../../src/data/manufacturer-catalog-scan.js";
import { MANUFACTURER_CATALOG_SOURCES } from "../../src/data/manufacturer-catalog-sources.js";

const bag = (id, brand, extra = {}) => ({
  id,
  brand,
  name: id,
  sourceUrl: `https://example.test/${id}`,
  volume: 20,
  mountingOptions: ["Quick-Lock2.1"],
  variants: [],
  ...extra,
});

test("CRITICAL catalog scan: detects additions, changes, and missing models without deleting evidence", () => {
  const result = compareManufacturerCatalogSnapshots(
    [bag("ortlieb-old", "ORTLIEB"), bag("ortlieb-back-roller", "ORTLIEB")],
    [bag("ortlieb-back-roller", "ORTLIEB", { mountingOptions: ["Quick-Lock2.1", "Quick-Lock3.1"] }), bag("arkel-new", "Arkel")]
  );
  assert.equal(result.changes.filter((item) => item.type === "added").length, 1);
  assert.equal(result.changes.filter((item) => item.type === "changed").length, 1);
  assert.equal(result.changes.filter((item) => item.type === "missing").length, 1);
  const missing = result.changes.find((item) => item.type === "missing");
  assert.equal(missing.before.id, "ortlieb-old");
  assert.equal(missing.after, null);
});

test("CRITICAL catalog scan: verification dates alone do not create material changes", () => {
  const before = bag("ortlieb-back-roller", "ORTLIEB", { sourceCheckedAt: "2026-07-30" });
  const after = bag("ortlieb-back-roller", "ORTLIEB", { sourceCheckedAt: "2026-08-30" });
  const result = compareManufacturerCatalogSnapshots([before], [after]);
  assert.equal(result.unchanged, 1);
  assert.deepEqual(result.changes, []);
});

test("CRITICAL catalog scan: set-volume basis changes require review", () => {
  const before = bag("arkel-set", "Arkel", {
    soldAsSet: true,
    setQuantity: 2,
    totalVolume: 54,
    volumeSetBasis: "composite-set",
  });
  const after = { ...before, volumeSetBasis: "equal-bags", volumePerBag: 27 };
  const result = compareManufacturerCatalogSnapshots([before], [after]);
  const change = result.changes.find(({ productId }) => productId === before.id);
  assert.deepEqual(change.fields.map(({ field }) => field), ["volumePerBag", "volumeSetBasis"]);
});

test("CRITICAL catalog scan: report keeps manufacturer adapters independent", () => {
  const report = buildManufacturerCatalogScanReport({
    approvedEntries: [bag("ortlieb-one", "ORTLIEB")],
    scannedEntries: [bag("ortlieb-one", "ORTLIEB"), bag("arkel-one", "Arkel")],
    manufacturers: MANUFACTURER_CATALOG_SOURCES,
    scannedAt: "2026-08-30T09:00:00.000Z",
  });
  assert.equal(report.manufacturers.length, 2);
  assert.equal(report.manufacturers.find((item) => item.id === "ortlieb").sourceCount, 6);
  assert.equal(report.manufacturers.find((item) => item.id === "arkel").sourceCount, 1);
  assert.equal(report.summary.added, 1);
});

test("CRITICAL catalog scan: a future manufacturer is not folded into an existing brand", () => {
  const report = buildManufacturerCatalogScanReport({
    approvedEntries: [],
    scannedEntries: [bag("new-brand-one", "New Brand")],
    manufacturers: [{ id: "new-brand", name: "New Brand", collections: [["new-brand.json", "https://example.test/products.json"]] }],
    scannedAt: "2026-08-30T09:00:00.000Z",
  });
  assert.equal(report.manufacturers[0].productCount, 1);
  assert.equal(report.changes[0].manufacturerId, "new-brand");
});
