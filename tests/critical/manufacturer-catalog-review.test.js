import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  manufacturerCatalogInlineDiffParts,
  renderManufacturerCatalogReview
} from "../../src/ui/manufacturer-catalog-review-dialog.js";
import {
  fetchManufacturerCatalogScans,
  saveManufacturerCatalogDecision,
} from "../../src/sync/manufacturer-catalog-review.js";

const projectRoot = resolve(import.meta.dirname, "../..");

test("CRITICAL catalog review: renders source evidence and explicit non-automatic publishing notice", () => {
  const html = renderManufacturerCatalogReview({
    scans: [{
      id: "catalog-scan-20260830",
      scannedAt: "2026-08-30T09:00:00.000Z",
      summary: { products: 123 },
      manufacturers: [{ id: "ortlieb", name: "ORTLIEB", productCount: 87, status: "complete" }],
      changes: [{
        id: "ortlieb:changed:back-roller",
        manufacturer: "ORTLIEB",
        productName: "Back-Roller",
        type: "changed",
        sourceUrl: "https://www.ortlieb.com/en_us/back-roller",
        fields: [{ field: "mountingOptions", before: ["Quick-Lock2.1"], after: ["Quick-Lock2.1", "Quick-Lock3.1"] }],
        decision: "pending",
      }],
    }],
  });
  assert.match(html, /Back-Roller/);
  assert.match(html, /Quick-Lock2\.1/);
  assert.match(html, /Quick-Lock3\.1/);
  assert.match(html, /https:\/\/www\.ortlieb\.com/);
  assert.match(html, /not changed automatically|автоматически не меняется/);
  assert.match(html, /data-catalog-decision="approved"/);
});

test("CRITICAL catalog review: API calls use admin review routes and encoded ids", async () => {
  const calls = [];
  const apiFetch = async (path, options) => {
    calls.push({ path, options });
    return { ok: true };
  };
  await fetchManufacturerCatalogScans(apiFetch, { timeoutMs: 1234 });
  await saveManufacturerCatalogDecision(apiFetch, {
    scanId: "scan/one",
    changeId: "brand:model one",
    decision: "approved",
    note: "checked",
    timeoutMs: 2345,
  });
  assert.equal(calls[0].path, "/bike-packing/admin/catalog-scans");
  assert.equal(calls[1].path, "/bike-packing/admin/catalog-scans/scan%2Fone/changes/brand%3Amodel%20one");
  assert.equal(calls[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[1].options.body), { decision: "approved", note: "checked" });
});

test("CRITICAL catalog review: unchanged text stays plain while only removed and added tokens are marked", () => {
  const parts = manufacturerCatalogInlineDiffParts(
    "sku: F5305; mounting: Quick-Lock2.1; available: Yes",
    "sku: F5305; mounting: Quick-Lock2.2; available: Yes"
  );
  assert.deepEqual(parts.filter(({ type }) => type !== "equal"), [
    { type: "removed", value: "Quick-Lock2.1" },
    { type: "added", value: "Quick-Lock2.2" }
  ]);
  const html = renderManufacturerCatalogReview({
    scans: [{
      id: "scan",
      scannedAt: "2026-08-30T09:00:00.000Z",
      summary: { products: 1 },
      manufacturers: [],
      changes: [{
        id: "change",
        type: "changed",
        productName: "Back-Roller",
        fields: [{ field: "mounting", before: "Quick-Lock2.1", after: "Quick-Lock2.2" }]
      }]
    }]
  });
  assert.match(html, /<del>Quick-Lock2\.1<\/del><ins>Quick-Lock2\.2<\/ins>/);
  assert.doesNotMatch(html, /<del>sku:/);
});

test("CRITICAL catalog review: dialog is admin-only and wired into synchronized visibility", () => {
  const indexSource = readFileSync(resolve(projectRoot, "index.html"), "utf8");
  const appSource = readFileSync(resolve(projectRoot, "app.js"), "utf8");
  const syncUiSource = readFileSync(resolve(projectRoot, "src/ui/sync-ui.js"), "utf8");
  const stylesSource = readFileSync(resolve(projectRoot, "styles.css"), "utf8");
  assert.match(indexSource, /id="catalogUpdatesBtn"[^>]*admin-menu-item[^>]*hidden/);
  assert.match(indexSource, /id="catalogUpdatesDialog"/);
  assert.match(appSource, /FRONTEND_PERMISSION_ACTIONS\.CATALOG_REVIEW/);
  assert.match(syncUiSource, /manufacturerCatalogReviewDialogController\?\.syncVisibility\?\.\(\)/);
  assert.match(stylesSource, /#catalogUpdatesDialog\s*\{[^}]*width:\s*min\(1500px, calc\(100vw - 24px\)\)/s);
  assert.match(stylesSource, /\.catalog-updates-dialog-card\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%/s);
});
