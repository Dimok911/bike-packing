import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const reportPath = resolve(process.argv[2] || "manufacturer-catalog-scan.json");
const apiUrl = String(process.env.CATALOG_SCAN_API_URL || "").trim();
const token = String(process.env.CATALOG_SCAN_API_TOKEN || "").trim();
if (!apiUrl || !token) {
  process.stdout.write("Catalog scan API is not configured; report remains available as a workflow artifact.\n");
  process.exit(0);
}
const report = JSON.parse(await readFile(reportPath, "utf8"));
const response = await fetch(apiUrl, {
  method: "POST",
  headers: { "content-type": "application/json", "x-bike-packing-catalog-scan-token": token },
  body: JSON.stringify(report),
});
if (!response.ok) throw new Error(`Catalog scan API returned HTTP ${response.status}`);
process.stdout.write(`Published catalog scan ${report.id}.\n`);
