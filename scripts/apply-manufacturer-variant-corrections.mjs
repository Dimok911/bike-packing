import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { MANUFACTURER_BAG_CATALOG_GENERATED } from "../src/data/manufacturer-bag-catalog.generated.js";
import { MANUFACTURER_CATALOG_SOURCES } from "../src/data/manufacturer-catalog-sources.js";
import { manufacturerIdForEntry } from "../src/data/manufacturer-catalog-scan.js";
import { annotateManufacturerImageVariants } from "./manufacturer-catalog/image-variants.mjs";
import { selectManufacturerVariantImages } from "../src/data/manufacturer-catalog-image-variants.js";
import { generatedCatalogSource } from "./promote-manufacturer-catalog-baseline.mjs";

const work = resolve(process.argv[2]);
const fallback = process.argv[3] ? resolve(process.argv[3]) : "";
const read = (path) => readFile(path, "utf8").catch(() => "");
const publication = JSON.parse(await read("src/data/manufacturer-catalog-publication-history.json"));
const rows = [], audit = [];
for (const group of Map.groupBy(MANUFACTURER_BAG_CATALOG_GENERATED, (entry) => entry.sourceUrl).values()) {
  const first = group[0];
  const brand = manufacturerIdForEntry(first);
  const source = MANUFACTURER_CATALOG_SOURCES.find((s) => s.id === brand);
  const handle = new URL(first.sourceUrl).pathname.split("/").filter(Boolean).at(-1).replace(/\.html$/i, "").toLowerCase();
  let html = await read(join(work, ".catalog-pages", brand, `${handle}.html`));
  if ((!html || html.startsWith("{")) && fallback) html = await read(join(fallback, `${first.id}.html`)) || html;
  let product = {};
  for (const [file] of source.collections) {
    try { const data = JSON.parse(await read(join(work, file))); product = data.products?.find((p) => p.handle === handle) || product; } catch {}
  }
  const evidence = JSON.parse(await read(join(work, ".catalog-pages", brand, `${handle}.variants.json`)) || "[]");
  const familyVariants = [...new Map(group.flatMap((row) => row.variants || []).map((v) => [`${v.sku}|${v.volume}`, v])).values()];
  for (const original of group) {
    const { imageUrl, imageUrls, ...entry } = original;
    let corrected = { ...entry, catalogPublishedAt: publication[entry.id]?.publishedAt || "" };
    if (brand === "ortlieb" && evidence.length) {
      corrected.variants = entry.variants.map((variant) => {
        const details = evidence.find((v) => v.sku === variant.sku);
        return details ? { ...variant, material: details.material, mounting: details.mounting,
          dimensions: details.dimensions, sourceUrl: details.sourceUrl,
          evidenceCheckedAt: "2026-09-27" } : variant;
      });
      const materials = [...new Set(corrected.variants.map((v) => v.material).filter(Boolean))].sort();
      const mounts = [...new Set(corrected.variants.map((v) => v.mounting).filter(Boolean))].sort();
      if (corrected.variants.every((v) => Object.hasOwn(v, "material"))) corrected.material = materials.join(" / ");
      corrected.mountingOptions = mounts;
      corrected.mounting = mounts.join(" / ");
    }
    const family = { ...corrected, variants: familyVariants,
      volumeOptions: [...new Set(group.map((row) => row.volume).filter(Boolean))] };
    const annotated = annotateManufacturerImageVariants(family, { html,
      product: { ...product, catalogVariantEvidence: evidence.filter((v) => familyVariants.some((variant) => variant.sku === v.sku)) } });
    if (annotated.imageVolumeOptions) corrected = selectManufacturerVariantImages({ ...corrected,
      imageVolumeOptions: annotated.imageVolumeOptions, imageSkuOptions: annotated.imageSkuOptions,
      imageVariantSource: annotated.imageVariantSource });
    rows.push(corrected);
    audit.push({ id: entry.id, brand, sourceUrl: entry.sourceUrl, pageAvailable: Boolean(html),
      variants: entry.variants?.length || 0, verifiedVariantSpecifications: corrected.variants.filter((v) => v.evidenceCheckedAt).length,
      imagesBefore: entry.imageAssetPaths?.length || 0, imagesAfter: corrected.imageAssetPaths?.length || 0,
      unassignedImages: corrected.unassignedImageCount || 0,
      imageEvidence: corrected.imageVariantSource || "single-capacity-source-gallery",
      requiresImageReview: Boolean(corrected.unassignedImageCount || !corrected.imageAssetPaths?.length),
    });
  }
}
await writeFile("src/data/manufacturer-bag-catalog.generated.js", generatedCatalogSource(rows, "2026-09-27"));
await writeFile("catalog-review-inputs/variant-integrity-audit-20260927.json", JSON.stringify({ checkedAt: new Date().toISOString(),
  manufacturers: MANUFACTURER_CATALOG_SOURCES.map((s) => ({ id: s.id, products: audit.filter((row) => row.brand === s.id).length,
    photosNeedReview: audit.filter((row) => row.brand === s.id && row.requiresImageReview).length })), products: audit }, null, 2) + "\n");
console.log(JSON.stringify({ products: rows.length, photosNeedReview: audit.filter((r) => r.requiresImageReview).length }));
