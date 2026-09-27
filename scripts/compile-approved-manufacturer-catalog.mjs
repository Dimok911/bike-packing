import { catalogValuesEqual } from '../src/data/manufacturer-catalog-comparison.js';
import { catalogPhotoSelection, catalogPhotoSelectionMatches } from '../src/data/manufacturer-catalog-photo-selection.js';
import { assertPublishableManufacturerGalleries, MANUFACTURER_GALLERY_FIELDS } from './manufacturer-catalog/gallery-preservation.mjs';

const cloneEntry = ({ imageUrl, imageUrls, ...entry }) => structuredClone(entry);
const photoFields = new Set([...MANUFACTURER_GALLERY_FIELDS, 'imageReviewRequired']);

// Compile saved decisions against their original baseline; never replace a whole
// product with a partial photo-only snapshot or publish an unresolved decision.
export function compileApprovedCatalog(baseline, changes, { resolveImage, publishedAt }) {
  if (!Number.isFinite(Date.parse(publishedAt))) throw new Error('Publication date is required');
  const original = new Map(baseline.map(entry => [entry.id, entry]));
  const result = new Map(baseline.map(entry => [entry.id, cloneEntry(entry)]));
  const assigned = new Map();
  const galleries = [];
  for (const change of changes) {
    if (!['approved', 'rejected'].includes(change.decision)) throw new Error(`Unreviewed change: ${change.id}`);
    if (change.decision !== 'approved') continue;
    const before = original.get(change.productId);
    if (change.type === 'added' ? Boolean(before) : !before) throw new Error(`Baseline membership changed: ${change.productId}`);
    for (const field of change.fields || []) {
      if (!catalogValuesEqual(field.field, before?.[field.field], field.before)) throw new Error(`Stale baseline: ${change.productId}.${field.field}`);
      const key = `${change.productId}:${field.field}`;
      if (assigned.has(key) && !catalogValuesEqual(field.field, assigned.get(key), field.after)) throw new Error(`Conflicting approvals: ${key}`);
      assigned.set(key, field.after);
    }
    if (change.type === 'missing') { result.delete(change.productId); continue; }
    const entry = change.type === 'added' ? cloneEntry(change.after) : result.get(change.productId);
    if (entry.id !== change.productId) throw new Error('Product identity changed');
    for (const field of change.fields || []) if (!photoFields.has(field.field)) entry[field.field] = structuredClone(field.after);
    entry.sourceCheckedAt = change.after.sourceCheckedAt || String(change.reviewScannedAt).slice(0, 10);
    if (Array.isArray(entry.variants)) {
      entry.variantCount = entry.variants.length;
      entry.availableVariantCount = entry.variants.filter(v => v.available !== false).length;
    }
    entry.provider ||= new URL(entry.sourceUrl).hostname.replace(/^www\./, '');
    const galleryChanged = change.type === 'added' || change.photoSelection || change.fields?.some(field => photoFields.has(field.field));
    if (!galleryChanged && change.fields?.some(field => ['volume', 'volumeOptions'].includes(field.field)) && entry.imageVolumeOptions) galleries.push(() => {
      const indices = entry.sourceImageUrls.map(url => change.after.sourceImageUrls?.indexOf(url) ?? -1);
      const scopes = indices.map(index => index >= 0 ? change.after.imageVolumeOptions?.[index] : null);
      const volumes = entry.volumeOptions || [entry.volume];
      if (scopes.some(scope => !scope?.some(volume => volumes.includes(volume)))) throw new Error('Updated volume has no matching photograph evidence: ' + entry.id);
      entry.imageVolumeOptions = structuredClone(scopes);
      entry.imageVariantSource = change.after.imageVariantSource;
    });
    if (galleryChanged) galleries.push(() => {
      if (change.photoSelection && !catalogPhotoSelectionMatches(change.photoSelection, change)) throw new Error(`Stale photograph selection: ${change.id}`);
      const selected = catalogPhotoSelection(change).selectedUrls;
      if (!selected.length) throw new Error(`Empty approved gallery: ${change.productId}`);
      for (const key of MANUFACTURER_GALLERY_FIELDS) delete entry[key];
      entry.sourceImageUrls = selected;
      entry.sourceImageUrl = selected[0];
      entry.imageAssetPaths = selected.map(url => {
        const asset = resolveImage(url, change);
        if (!/^assets\/manufacturer-catalog\/[a-z0-9-]+\/[a-z0-9.-]+$/i.test(asset || '')) throw new Error(`Unresolved photograph: ${change.productId}: ${url}`);
        return asset;
      });
      entry.imageAssetPath = entry.imageAssetPaths[0];
      // Explicit human approval associates the chosen gallery with this model.
      // Keep that provenance distinct from automatic manufacturer size evidence.
      const volumes = (entry.volumeOptions?.length ? entry.volumeOptions : [entry.volume]).filter(v => Number.isFinite(v) && v > 0);
      if (volumes.length) entry.imageVolumeOptions = selected.map(() => [...volumes]);
      const scopes = selected.map(url => {
        for (const snapshot of [change.after, before]) {
          const index = snapshot?.sourceImageUrls?.indexOf(url) ?? -1;
          if (index >= 0 && snapshot.imageSkuOptions?.[index]?.length) return snapshot.imageSkuOptions[index];
        }
        return null;
      });
      if (scopes.every(Boolean)) entry.imageSkuOptions = scopes;
      entry.imageVariantSource = 'manual-catalog-review';
      entry.imagesCheckedAt = change.reviewedAt;
      entry.imageReviewApproval = { scanId: change.reviewScanId, changeId: change.id, reviewedAt: change.reviewedAt };
      for (const key of ['imageReviewRequired', 'imageReviewReason', 'pendingImageGallery', 'imageGalleryPreserved']) delete entry[key];
    });
    result.set(entry.id, entry);
  }
  for (const applyGallery of galleries) applyGallery();
  return assertPublishableManufacturerGalleries([...result.values()]);
}
