import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const IMPORT_ROOT = resolve("catalog-review-inputs");
const MANUFACTURER_HOSTS = Object.freeze({
  ortlieb: ["ortlieb.com"],
  arkel: ["arkel.ca"],
  tailfin: ["tailfin.cc"],
  apidura: ["apidura.com"],
  restrap: ["restrap.com"],
  "revelate-designs": ["revelatedesigns.com"],
  "miss-grape": ["missgrape.net"],
  cyclite: ["cyclite.cc"],
  blackburn: ["blackburndesign.com", "bellhelmets.com"],
  topeak: ["topeak.com"],
  rockgeist: ["rockgeist.com"],
});
const CHANGE_TYPES = new Set(["added", "changed", "missing"]);

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function assertOfficialSource(change) {
  const sourceUrl = requiredText(change.sourceUrl || change.after?.sourceUrl || change.before?.sourceUrl, `${change.id} sourceUrl`);
  let hostname;
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    throw new Error(`${change.id} has an invalid sourceUrl`);
  }
  const allowed = MANUFACTURER_HOSTS[change.manufacturerId] || [];
  if (!allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    throw new Error(`${change.id} sourceUrl does not match ${change.manufacturerId}`);
  }
}

export function validateManufacturerCatalogImport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("Catalog report must be an object");
  if (Number(report.schemaVersion) !== 1) throw new Error("Catalog report schemaVersion must be 1");
  requiredText(report.id, "Catalog report id");
  if (!Number.isFinite(new Date(String(report.scannedAt || "")).getTime())) throw new Error("Catalog report scannedAt is invalid");
  if (!["complete", "partial"].includes(report.status)) throw new Error("Catalog report status must be complete or partial");
  const manufacturers = Array.isArray(report.manufacturers) ? report.manufacturers : [];
  if (!manufacturers.length) throw new Error("Catalog report manufacturers are required");
  const manufacturerIds = new Set();
  const incompleteIds = new Set();
  let errorCount = 0;
  manufacturers.forEach((manufacturer) => {
    const id = requiredText(manufacturer?.id, "Manufacturer id").toLowerCase();
    if (!MANUFACTURER_HOSTS[id]) throw new Error(`Unsupported manufacturer: ${id}`);
    if (manufacturerIds.has(id)) throw new Error(`Duplicate manufacturer: ${id}`);
    const count = Array.isArray(manufacturer.errors) ? manufacturer.errors.length : 0;
    if (manufacturer.status === "partial" && count) incompleteIds.add(id);
    else if (manufacturer.status !== "complete" || count) throw new Error(`Manufacturer status contradicts evidence: ${id}`);
    errorCount += count;
    manufacturerIds.add(id);
  });
  const changes = Array.isArray(report.changes) ? report.changes : [];
  if (!changes.length || changes.length > 10_000) throw new Error("Catalog report changes are missing or excessive");
  const changeIds = new Set();
  const counts = { added: 0, changed: 0, missing: 0 };
  changes.forEach((change) => {
    const id = requiredText(change?.id, "Change id");
    if (changeIds.has(id)) throw new Error(`Duplicate catalog change: ${id}`);
    changeIds.add(id);
    const manufacturerId = requiredText(change?.manufacturerId, `${id} manufacturerId`).toLowerCase();
    if (!manufacturerIds.has(manufacturerId)) throw new Error(`${id} references an unscanned manufacturer`);
    if (incompleteIds.has(manufacturerId)) throw new Error(`${id} proposes changes from incomplete evidence`);
    if (!CHANGE_TYPES.has(change.type)) throw new Error(`${id} has an invalid change type`);
    counts[change.type] += 1;
    assertOfficialSource({ ...change, id, manufacturerId });
  });
  for (const type of CHANGE_TYPES) {
    if (Number(report.summary?.[type]) !== counts[type]) throw new Error(`Catalog summary ${type} count does not match changes`);
  }
  if (Number(report.summary?.errors || 0) !== errorCount) throw new Error("Catalog report scan error count does not match evidence");
  if (report.status !== (errorCount ? "partial" : "complete")) throw new Error("Catalog report must be complete when all manufacturers are complete");
  return { id: report.id, manufacturers: manufacturers.length, products: Number(report.summary?.products || 0), changes: changes.length, ...counts };
}

export async function readManufacturerCatalogImport(inputPath) {
  const reportPath = resolve(requiredText(inputPath, "Catalog report path"));
  if (!reportPath.startsWith(`${IMPORT_ROOT}${sep}`)) throw new Error("Catalog report must be inside catalog-review-inputs");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  return { reportPath, report, summary: validateManufacturerCatalogImport(report) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { summary } = await readManufacturerCatalogImport(process.argv[2]);
  process.stdout.write(`## Checked manufacturer catalog import\n\n`);
  process.stdout.write(`- Report: ${summary.id}\n`);
  process.stdout.write(`- Manufacturers: ${summary.manufacturers}\n`);
  process.stdout.write(`- Products checked: ${summary.products}\n`);
  process.stdout.write(`- Changes: ${summary.changes} (${summary.added} added, ${summary.changed} changed, ${summary.missing} missing)\n`);
}
