import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MANUFACTURER_BAG_CATALOG_GENERATED } from "../src/data/manufacturer-bag-catalog.generated.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(rootDir, "src/data/manufacturer-catalog-runtime");
const brandFiles = new Map([
  ["ORTLIEB", "ortlieb"],
  ["Apidura", "apidura"],
  ["Restrap", "restrap"],
  ["Tailfin", "tailfin"],
  ["Arkel", "arkel"],
  ["Revelate Designs", "revelate-designs"]
]);
const omittedRuntimeFields = new Set([
  "imageAssetPath",
  "imageAssetPaths",
  "imageUrl",
  "imageUrls",
  "imagesCheckedAt",
  "sourceImageUrl",
  "sourceImageUrls"
]);

function runtimeEntry(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !omittedRuntimeFields.has(key)));
}

function assetExpression(assetPath) {
  return `new URL(${JSON.stringify(`../../../${assetPath}`)}, import.meta.url).href`;
}

function brandModule(rows) {
  const images = Object.fromEntries(rows.map((entry) => [
    entry.id,
    (Array.isArray(entry.imageAssetPaths) ? entry.imageAssetPaths : [entry.imageAssetPath])
      .filter(Boolean)
  ]));
  const imageSource = Object.entries(images)
    .map(([id, paths]) => `${JSON.stringify(id)}:[${paths.map(assetExpression).join(",")}]`)
    .join(",");
  const rowSource = JSON.stringify(rows.map(runtimeEntry));
  return `import { assertManufacturerBagCatalogSkuModels, splitManufacturerBagCatalogSkuModels } from "../manufacturer-bag-catalog-variants.js";\nconst IMAGE_URLS={${imageSource}};\nconst ROWS=${rowSource};\nexport const MANUFACTURER_BAG_CATALOG_BRAND=assertManufacturerBagCatalogSkuModels(splitManufacturerBagCatalogSkuModels(ROWS.map((entry)=>({...entry,imageUrls:IMAGE_URLS[entry.id]||[],imageUrl:IMAGE_URLS[entry.id]?.[0]||""}))));\n`;
}

await mkdir(outputDir, { recursive: true });
const index = MANUFACTURER_BAG_CATALOG_GENERATED.map(({ id, brand, family, category }) => ({
  id,
  brand,
  family,
  category
}));
await writeFile(
  resolve(outputDir, "index.generated.js"),
  `export const MANUFACTURER_BAG_CATALOG_INDEX=${JSON.stringify(index)};\n`,
  "utf8"
);

for (const [brand, fileName] of brandFiles) {
  const rows = MANUFACTURER_BAG_CATALOG_GENERATED.filter((entry) => entry.brand === brand);
  if (!rows.length) throw new Error(`No manufacturer catalog rows for ${brand}`);
  await writeFile(resolve(outputDir, `${fileName}.generated.js`), brandModule(rows), "utf8");
}
