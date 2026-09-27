import { annotateManufacturerImageVariants } from './image-variants.mjs';
import { wooGalleryEvidence, withManufacturerGalleryEvidence } from './gallery-evidence.mjs';
import { arkelGalleryEvidence } from './arkel-gallery-evidence.mjs';
import { tailfinGalleryEvidence } from './tailfin-gallery-evidence.mjs';
import { manufacturerIdForEntry } from '../../src/data/manufacturer-catalog-scan.js';

export function resolveManufacturerGallery(entry, { html = '', product = {}, evidence = [], checkedAt = '' } = {}) {
  const brand = manufacturerIdForEntry(entry);
  const volumes = new Set((entry.variants || []).map(v => v.volume).filter(Boolean));
  let selected = evidence.length ? evidence : product.catalogVariantEvidence || [];
  try {
    if (!selected.length && brand === 'arkel' && volumes.size > 1) selected = arkelGalleryEvidence(html, entry, product);
    if (!selected.length && brand === 'tailfin' && volumes.size > 1) selected = tailfinGalleryEvidence(html, entry);
    if (!selected.length && ['rockgeist','revelate-designs'].includes(brand) && volumes.size > 1) selected = wooGalleryEvidence(html, entry);
    if (selected.length) return withManufacturerGalleryEvidence(entry, selected, { checkedAt });
    const result = annotateManufacturerImageVariants(entry, { html, product });
    const unresolved = result.imageVolumeOptions?.some(scope => scope === null);
    const missingSelectedGallery = volumes.size > 1 && ['topeak','tailfin','rockgeist','revelate-designs'].includes(brand);
    if (unresolved || missingSelectedGallery) return { ...entry, imageReviewRequired: true,
      imageReviewReason: 'The manufacturer did not provide a complete gallery for every size',
      pendingImageGallery: { sourceImageUrls: entry.sourceImageUrls, imageAssetPaths: entry.imageAssetPaths,
        imageVolumeOptions: result.imageVolumeOptions, imageVariantSource: result.imageVariantSource } };
    return result;
  } catch (error) {
    return { ...entry, imageReviewRequired: true, imageReviewReason: String(error.message || error),
      pendingImageGallery: { sourceImageUrls: entry.sourceImageUrls, imageAssetPaths: entry.imageAssetPaths, evidence: selected } };
  }
}
