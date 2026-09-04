import { access, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MANUFACTURER_BAG_CATALOG } from "../src/data/manufacturer-bag-catalog.js";
import { assertManufacturerBagCatalogSkuModels } from "../src/data/manufacturer-bag-catalog-variants.js";
import { manufacturerIdForEntry } from "../src/data/manufacturer-catalog-scan.js";
import { readManufacturerCatalogImport } from "./validate-manufacturer-catalog-import.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

function withoutRuntimeImages(entry = {}) {
  const { imageUrl, imageUrls, ...catalogEntry } = entry;
  return structuredClone(catalogEntry);
}

function withDerivedImageAssets(entry, manufacturerId) {
  const variants = Array.isArray(entry.variants) ? entry.variants : [];
  const normalizedEntry = {
    ...entry,
    ...(variants.length ? { variantCount: variants.length } : {})
  };
  if (Array.isArray(normalizedEntry.imageAssetPaths) && normalizedEntry.imageAssetPaths.length) return normalizedEntry;
  const sourceUrl = new URL(String(normalizedEntry.sourceUrl || ""));
  const sourceHandle = sourceUrl.pathname.split("/").filter(Boolean).at(-1)?.toLowerCase() || "";
  const entryHandle = String(normalizedEntry.sourceProductId || normalizedEntry.id || "")
    .replace(new RegExp(`^${manufacturerId}-`), "")
    .trim()
    .toLowerCase();
  const handle = sourceHandle || entryHandle;
  const imageUrls = Array.isArray(normalizedEntry.sourceImageUrls)
    ? normalizedEntry.sourceImageUrls
    : [normalizedEntry.sourceImageUrl].filter(Boolean);
  if (!handle || !imageUrls.length) throw new Error(`Cannot derive baseline image assets: ${normalizedEntry.id || "missing id"}`);
  const imageAssetPaths = imageUrls.map((url, index) => {
    const extension = extname(new URL(url).pathname).toLowerCase();
    const safeExtension = extension === ".jpeg" ? ".jpg" : ([".jpg", ".png", ".webp"].includes(extension) ? extension : ".jpg");
    return `assets/manufacturer-catalog/${manufacturerId}/${handle}${index ? `-${index + 1}` : ""}${safeExtension}`;
  });
  return { ...normalizedEntry, imageAssetPath: imageAssetPaths[0], imageAssetPaths };
}

export function manufacturerCatalogBaselineEntries(existingEntries, report, manufacturerIds) {
  const requested = new Set((Array.isArray(manufacturerIds) ? manufacturerIds : [])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean));
  if (!requested.size) throw new Error("At least one baseline manufacturer is required");
  const existing = (Array.isArray(existingEntries) ? existingEntries : [])
    .filter((entry) => !requested.has(manufacturerIdForEntry(entry)))
    .map(withoutRuntimeImages);
  const byId = new Map(existing.map((entry) => [String(entry.id || ""), entry]));
  const counts = Object.fromEntries([...requested].map((id) => [id, 0]));
  const additions = (Array.isArray(report?.changes) ? report.changes : [])
    .filter((change) => change?.type === "added" && requested.has(String(change.manufacturerId || "").toLowerCase()))
    .sort((left, right) => String(left.after?.brand || "").localeCompare(String(right.after?.brand || ""))
      || String(left.after?.name || "").localeCompare(String(right.after?.name || ""))
      || String(left.after?.id || "").localeCompare(String(right.after?.id || "")));
  additions.forEach((change) => {
    const manufacturerId = String(change.manufacturerId || "").toLowerCase();
    const entry = withDerivedImageAssets(withoutRuntimeImages(change.after), manufacturerId);
    const id = String(entry.id || "").trim();
    if (!id || byId.has(id)) throw new Error(`Baseline catalog id is missing or already exists: ${id || "missing"}`);
    if (!Array.isArray(entry.imageAssetPaths) || !entry.imageAssetPaths.length) {
      throw new Error(`Baseline catalog entry has no image assets: ${id}`);
    }
    byId.set(id, entry);
    counts[manufacturerId] += 1;
  });
  for (const [manufacturerId, count] of Object.entries(counts)) {
    if (!count) throw new Error(`No baseline additions found for ${manufacturerId}`);
  }
  return assertManufacturerBagCatalogSkuModels([...byId.values()]);
}

function generatedCatalogSource(entries, checkedAt) {
  const imageDeclarations = entries.map((entry) => {
    const paths = Array.isArray(entry.imageAssetPaths) && entry.imageAssetPaths.length
      ? entry.imageAssetPaths
      : [entry.imageAssetPath].filter(Boolean);
    return `  ${JSON.stringify(entry.id)}: [${paths.map((path) =>
      `new URL(${JSON.stringify(`../../${path}`)}, import.meta.url).href`
    ).join(", ")}]`;
  }).join(",\n");
  const runtimeEntries = entries.map((entry) => ({
    ...entry,
    imageUrls: `__IMAGE_URLS__${entry.id}`,
    imageUrl: `__IMAGE_URL__${entry.id}`,
  }));
  const serializedEntries = JSON.stringify(runtimeEntries, null, 2)
    .replace(/"__IMAGE_URLS__([^\"]+)"/g, (_, id) => `MANUFACTURER_BAG_IMAGE_URLS[${JSON.stringify(id)}]`)
    .replace(/"__IMAGE_URL__([^\"]+)"/g, (_, id) => `MANUFACTURER_BAG_IMAGE_URLS[${JSON.stringify(id)}]`)
    .replace(/"imageUrl": MANUFACTURER_BAG_IMAGE_URLS\[("[^"]+")\]/g, '"imageUrl": MANUFACTURER_BAG_IMAGE_URLS[$1][0] || ""');
  return `// Generated by scripts/promote-manufacturer-catalog-baseline.mjs from a checked manufacturer snapshot.\n`
    + `// Catalog data and image gallery checked: ${checkedAt}. Do not edit by hand.\n\n`
    + `const MANUFACTURER_BAG_IMAGE_URLS = {\n${imageDeclarations}\n};\n\n`
    + `export const MANUFACTURER_BAG_CATALOG_GENERATED = ${serializedEntries};\n`;
}

async function assertImageAssets(entries) {
  const paths = [...new Set(entries.flatMap((entry) => entry.imageAssetPaths || [entry.imageAssetPath]).filter(Boolean))];
  for (const path of paths) {
    const normalized = String(path).replaceAll("\\", "/");
    if (!/^assets\/manufacturer-catalog\/[a-z0-9-]+\/[a-z0-9.-]+$/i.test(normalized)) {
      throw new Error(`Unsafe manufacturer image path: ${normalized}`);
    }
    await access(resolve(normalized));
  }
  return paths.length;
}

async function main() {
  const reportPath = args.get("--report");
  const outputPath = resolve(args.get("--output") || "src/data/manufacturer-bag-catalog.generated.js");
  const manufacturerIds = String(args.get("--manufacturers") || "").split(",");
  const { report, summary } = await readManufacturerCatalogImport(reportPath);
  const entries = manufacturerCatalogBaselineEntries(MANUFACTURER_BAG_CATALOG, report, manufacturerIds);
  const images = await assertImageAssets(entries);
  const checkedAt = String(report.scannedAt).slice(0, 10);
  await writeFile(outputPath, generatedCatalogSource(entries, checkedAt), "utf8");
  process.stdout.write(`${JSON.stringify({ report: summary.id, entries: entries.length, images, output: outputPath })}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
