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
const requestBody = JSON.stringify(report);
const retryDelays = [0, 2_000, 5_000, 10_000];
let response;
let lastError;
for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
  if (retryDelays[attempt]) await new Promise((resolvePromise) => setTimeout(resolvePromise, retryDelays[attempt]));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bike-packing-catalog-scan-token": token },
      body: requestBody,
      signal: controller.signal,
    });
    if (response.ok) break;
    if (response.status < 500) throw new Error(`Catalog scan API returned HTTP ${response.status}`);
    lastError = new Error(`Catalog scan API returned HTTP ${response.status}`);
  } catch (error) {
    if (response && response.status < 500) throw error;
    lastError = error;
  } finally {
    clearTimeout(timeout);
  }
}
if (!response?.ok) throw lastError || new Error("Catalog scan API request failed");
process.stdout.write(`Published catalog scan ${report.id}.\n`);
