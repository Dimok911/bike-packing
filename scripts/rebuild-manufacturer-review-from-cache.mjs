import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MANUFACTURER_BAG_CATALOG } from "../src/data/manufacturer-bag-catalog.js";
import { MANUFACTURER_CATALOG_SOURCES } from "../src/data/manufacturer-catalog-sources.js";
import { buildManufacturerCatalogScanReport, manufacturerIdForEntry, manufacturerCatalogScanMarkdown } from "../src/data/manufacturer-catalog-scan.js";
import { verifyCatalogAbsences } from "./manufacturer-catalog/absence-evidence.mjs";

const work = resolve(process.argv[2]);
const evidenceReport = JSON.parse(await readFile(process.argv[3], "utf8"));
const generated = (await import(pathToFileURL(join(work, "manufacturer-bag-catalog.generated.mjs")))).MANUFACTURER_BAG_CATALOG_GENERATED;
const errors = Object.fromEntries(evidenceReport.manufacturers.map((m) => [m.id, [...m.errors]]));
await verifyCatalogAbsences({ approved: MANUFACTURER_BAG_CATALOG, scanned: generated, sources: MANUFACTURER_CATALOG_SOURCES, errors,
  fetchText: async (url) => { const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { httpStatus: res.status }); return res.text(); } });
const failed = new Set(Object.entries(errors).filter(([, issues]) => issues.length).map(([id]) => id));
const report = buildManufacturerCatalogScanReport({ approvedEntries: MANUFACTURER_BAG_CATALOG,
  scannedEntries: [...generated.filter((e) => !failed.has(manufacturerIdForEntry(e))), ...MANUFACTURER_BAG_CATALOG.filter((e) => failed.has(manufacturerIdForEntry(e)))],
  manufacturers: MANUFACTURER_CATALOG_SOURCES, scannedAt: new Date().toISOString(), errors });
await writeFile("catalog-review-inputs/catalog-scan-20260927-variant-integrity.json", JSON.stringify(report, null, 2) + "\n");
await writeFile(join(work, "review.md"), manufacturerCatalogScanMarkdown(report));
console.log(JSON.stringify({ summary: report.summary, manufacturers: report.manufacturers }));
