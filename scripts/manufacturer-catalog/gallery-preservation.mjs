// All parallel fields must travel as one snapshot. Unknown source data is never
// evidence that a previously approved photograph was deleted by a manufacturer.
export const MANUFACTURER_GALLERY_FIELDS = Object.freeze([
  'imageAssetPath', 'imageAssetPaths', 'sourceImageUrl', 'sourceImageUrls',
  'imageUrl', 'imageUrls', 'imageVolumeOptions', 'imageSkuOptions',
  'imageVariantSource', 'imagesCheckedAt', 'unassignedImageCount',
]);

export function manufacturerGalleryIssue(entry = {}) {
  const urls = entry.sourceImageUrls || [];
  if (!urls.length) return 'No verified photographs for this model';
  if (entry.imageReviewRequired || entry.unassignedImageCount) return entry.imageReviewReason || 'The source gallery could not be completely assigned to this model';
  for (const field of ['imageAssetPaths', 'imageVolumeOptions', 'imageSkuOptions']) {
    if (Array.isArray(entry[field]) && entry[field].length !== urls.length) return `Misaligned gallery field: ${field}`;
  }
  if (entry.imageVolumeOptions?.some(scope => !Array.isArray(scope) || !scope.length)) return 'Incomplete photograph size assignments';
  return '';
}

export function preserveApprovedManufacturerGallery(fresh, approved) {
  const issue = manufacturerGalleryIssue(fresh);
  if (!issue) return fresh;
  const result = { ...fresh, imageReviewRequired: true, imageReviewReason: issue };
  result.pendingImageGallery = fresh.pendingImageGallery || Object.fromEntries(MANUFACTURER_GALLERY_FIELDS
    .filter(key => Object.hasOwn(fresh, key) && !['imageUrl', 'imageUrls'].includes(key)).map(key => [key, structuredClone(fresh[key])]));
  if (!approved || approved.id !== fresh.id || !approved.sourceImageUrls?.length) return result;
  const freshVolumes = fresh.volumeOptions || [fresh.volume];
  const approvedVolumes = approved.volumeOptions || [approved.volume];
  if (JSON.stringify(freshVolumes) !== JSON.stringify(approvedVolumes)) return result;
  for (const key of MANUFACTURER_GALLERY_FIELDS) {
    delete result[key];
    if (Object.hasOwn(approved, key)) result[key] = structuredClone(approved[key]);
  }
  result.imageGalleryPreserved = true;
  return result;
}

export function assertPublishableManufacturerGalleries(entries) {
  const failures = entries.map(entry => ({ id: entry.id, reason: manufacturerGalleryIssue(entry) })).filter(row => row.reason);
  if (failures.length) throw new Error(`Catalog photo publication blocked (${failures.length} models): ${failures.slice(0,8).map(row => `${row.id}: ${row.reason}`).join('; ')}`);
  return entries;
}
