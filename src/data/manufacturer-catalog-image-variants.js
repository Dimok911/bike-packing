// Parallel image arrays must always be selected together, including the cover.
export function selectManufacturerVariantImages(entry) {
  if (!Array.isArray(entry.imageVolumeOptions)) return entry;
  const volumes = entry.volumeOptions?.length ? entry.volumeOptions : [entry.volume];
  const unknown = entry.imageVolumeOptions.filter((scope) => scope === null).length;
  const keep = entry.imageVolumeOptions.flatMap((scope, index) =>
    scope !== null && scope.some((volume) => volumes.includes(volume)) ? [index] : []);
  const result = { ...entry };
  for (const [plural, singular] of [
    ["imageAssetPaths", "imageAssetPath"],
    ["sourceImageUrls", "sourceImageUrl"],
    ["imageUrls", "imageUrl"]
  ]) {
    if (!Array.isArray(entry[plural])) continue;
    if (entry[plural].length !== entry.imageVolumeOptions.length) {
      throw new Error(`Misaligned variant image array: ${entry.id} (${plural})`);
    }
    result[plural] = keep.map((index) => entry[plural][index]);
    result[singular] = result[plural][0] || "";
  }
  result.imageVolumeOptions = keep.map((index) => entry.imageVolumeOptions[index]);
  if (entry.imageSkuOptions) result.imageSkuOptions = keep.map((index) => entry.imageSkuOptions[index]);
  if (unknown) result.unassignedImageCount = unknown;
  if (unknown || (!keep.length && entry.imageVolumeOptions.length)) {
    result.imageReviewRequired = true;
    result.imageReviewReason = unknown ? 'Some photographs could not be assigned to this model' : 'The gallery size evidence conflicts with this model';
    result.pendingImageGallery = entry.pendingImageGallery || {
      sourceImageUrls: entry.sourceImageUrls, imageAssetPaths: entry.imageAssetPaths,
      imageVolumeOptions: entry.imageVolumeOptions, imageSkuOptions: entry.imageSkuOptions
    };
  }
  return result;
}

export function selectManufacturerSkuImages(entry, sku) {
  if (!Array.isArray(entry.imageSkuOptions) || !sku) return entry;
  const indices = entry.imageSkuOptions.flatMap((scope, index) => scope?.includes(sku) ? [index] : []);
  const result = { ...entry };
  for (const [plural, singular] of [["imageAssetPaths", "imageAssetPath"], ["sourceImageUrls", "sourceImageUrl"], ["imageUrls", "imageUrl"]]) {
    if (!Array.isArray(entry[plural])) continue;
    if (entry[plural].length !== entry.imageSkuOptions.length) throw new Error(`Misaligned SKU images: ${entry.id}`);
    result[plural] = indices.map((i) => entry[plural][i]);
    result[singular] = result[plural][0] || "";
  }
  result.imageSkuOptions = indices.map((i) => entry.imageSkuOptions[i]);
  if (entry.imageVolumeOptions) result.imageVolumeOptions = indices.map((i) => entry.imageVolumeOptions[i]);
  return result;
}
