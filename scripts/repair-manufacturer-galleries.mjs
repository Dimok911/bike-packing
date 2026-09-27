import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withManufacturerGalleryEvidence } from './manufacturer-catalog/gallery-evidence.mjs';
import { preserveApprovedManufacturerGallery, assertPublishableManufacturerGalleries } from './manufacturer-catalog/gallery-preservation.mjs';
import { selectManufacturerVariantImages } from '../src/data/manufacturer-catalog-image-variants.js';
import { generatedCatalogSource } from './promote-manufacturer-catalog-baseline.mjs';

export function repairManufacturerGalleries(current, original, evidenceByUrl, checkedAt) {
  const saved = new Map(original.map(entry => [entry.id, entry]));
  const audit = [];
  const entries = current.map(entry => {
    const needsRepair = entry.unassignedImageCount || !entry.sourceImageUrls?.length || entry.imageReviewRequired;
    if (!needsRepair) return entry;
    const previous = saved.get(entry.id);
    if (!previous?.sourceImageUrls?.length) throw new Error(`Missing original gallery: ${entry.id}`);
    const input = { ...entry, sourceImageUrls: previous.sourceImageUrls, sourceImageUrl: previous.sourceImageUrl,
      imageAssetPaths: previous.imageAssetPaths, imageAssetPath: previous.imageAssetPath };
    let repaired;
    try {
      repaired = selectManufacturerVariantImages(withManufacturerGalleryEvidence(input, evidenceByUrl[entry.sourceUrl] || [], { checkedAt }));
      assertPublishableManufacturerGalleries([repaired]);
    } catch (error) {
      repaired = preserveApprovedManufacturerGallery({ ...input, imageReviewRequired: true, imageReviewReason: String(error.message || error) }, previous);
    }
    audit.push({ id: entry.id, brand: entry.brand, sourceUrl: entry.sourceUrl,
      status: repaired.imageReviewRequired ? 'preserved-needs-review' : 'verified',
      imagesBefore: entry.sourceImageUrls?.length || 0, imagesAfter: repaired.sourceImageUrls?.length || 0,
      originalGallery: previous.sourceImageUrls, selectedGallery: repaired.sourceImageUrls,
      ...(repaired.imageReviewRequired ? { reason: repaired.imageReviewReason } : {}) });
    return repaired;
  });
  return { entries, audit };
}

async function main() {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i+1]);
  for (const key of ['--baseline','--evidence','--output','--audit']) if (!args.get(key)) throw new Error(`Required: ${key}`);
  const currentPath = resolve(args.get('--current') || 'src/data/manufacturer-bag-catalog.generated.js');
  const output = resolve(args.get('--output'));
  const current = (await import(pathToFileURL(currentPath).href)).MANUFACTURER_BAG_CATALOG_GENERATED;
  const original = (await import(pathToFileURL(resolve(args.get('--baseline'))).href)).MANUFACTURER_BAG_CATALOG_GENERATED;
  const checkedAt = args.get('--checked-at') || new Date().toISOString().slice(0,10);
  const evidence = JSON.parse(await readFile(resolve(args.get('--evidence')), 'utf8'));
  const { entries, audit } = repairManufacturerGalleries(current, original, evidence, checkedAt);
  const summary = { checkedAt, products: entries.length, repaired: audit.filter(row => row.status === 'verified').length,
    pending: audit.filter(row => row.status !== 'verified').length, empty: entries.filter(row => !row.sourceImageUrls?.length).length };
  await mkdir(dirname(resolve(args.get('--audit'))), { recursive: true });
  await writeFile(resolve(args.get('--audit')), JSON.stringify({ ...summary, products: audit }, null, 2) + '\n');
  // Writing the active catalog is a separate step and is impossible with pending evidence.
  if (output === currentPath || output === resolve('src/data/manufacturer-bag-catalog.generated.js')) assertPublishableManufacturerGalleries(entries);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, generatedCatalogSource(entries, checkedAt));
  console.log(JSON.stringify({ ...summary, output }));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
