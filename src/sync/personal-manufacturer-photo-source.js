// Shared with the API. Source data is frozen by the selection, never fetched
// again by an operation retry. The owner remains an ordinary private bag.
export const PERSONAL_MANUFACTURER_PHOTO_FORM_ENABLED = false;
export const PERSONAL_MANUFACTURER_PHOTO_FORM_CAPABILITY = "personalCausalManufacturerPhotoFormV1";
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const fail = () => { throw Error("Неполный источник сумки производителя. Поля и фотографии сохранены на устройстве."); };
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const text = (value, max) => typeof value === "string" && value.length <= max;
const numbers = (values = [], fallback = 0) => [...new Set((Array.isArray(values) ? values : [fallback])
  .map(Number).filter(value => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);

// Match the existing catalog's set/per-bag provenance without importing its
// search, presentation or mutable runtime catalog into the API.
export function personalManufacturerSourceMetadata(source) {
  if (!object(source) || source.version !== 1 || Object.keys(source).some(key => !["version", "entry", "imageUrls"].includes(key))
    || !object(source.entry) || !id(source.entry.id) || JSON.stringify(source.entry).length > 262144
    || !Array.isArray(source.imageUrls) || !source.imageUrls.length || source.imageUrls.length > 50
    || new Set(source.imageUrls).size !== source.imageUrls.length || source.imageUrls.some(url => !text(url, 4096) || !url.trim())) fail();
  const entry = source.entry;
  const available = [...new Set([String(entry.imageUrl || "").trim(), ...(Array.isArray(entry.imageUrls) ? entry.imageUrls : []).map(value => String(value || "").trim())].filter(Boolean))];
  if (source.imageUrls.some((url, index) => available[index] !== url)) fail();
  const rawQuantity = Math.floor(Number(entry.setQuantity || 2));
  const quantity = entry.soldAsSet ? rawQuantity > 1 ? rawQuantity : 2 : 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) fail();
  const perBagBasis = entry.specificationBasis === "per-bag" && quantity > 1;
  const sourcePerBag = numbers(entry.volumePerBagOptions, entry.volumePerBag || entry.volume);
  const sourceTotal = numbers(entry.totalVolumeOptions, entry.totalVolume || (perBagBasis ? sourcePerBag[0] * quantity : entry.volume));
  const total = sourceTotal.length ? sourceTotal : numbers(entry.volumeOptions, entry.volume);
  const perBag = perBagBasis ? sourcePerBag : quantity > 1 && entry.volumeSetBasis === "equal-bags"
    ? total.map(value => Math.round(value / quantity * 100) / 100) : [];
  const metadata = { kind: "manufacturer-bag", provider: String(entry.provider || "manufacturer-catalog"), catalogId: entry.id,
    brand: String(entry.brand || ""), sku: String(entry.sku || ""), sourceUrl: String(entry.sourceUrl || ""), sourceImageUrl: String(entry.sourceImageUrl || ""),
    setQuantity: quantity, specificationBasis: String(entry.specificationBasis || (entry.soldAsSet ? entry.volumeSetBasis === "equal-bags" ? "set-total" : "composite-set" : "product")),
    volumePerBag: Number(perBag[0] || 0), totalVolume: Number(total[0] || entry.volume || 0) };
  if (["provider", "brand", "sku", "specificationBasis"].some(key => !text(metadata[key], 255))
    || ["sourceUrl", "sourceImageUrl"].some(key => !text(metadata[key], 4096))
    || [metadata.volumePerBag, metadata.totalVolume].some(value => !Number.isFinite(value) || value < 0)) fail();
  return metadata;
}

export function personalManufacturerPhotoFormSource(body) {
  if (body?.version !== 1 || body.action !== "form" || body.entityType !== "container" || body.baseEntityRevision !== 0
    || body.copySource || !Array.isArray(body.changes) || body.changes.some(change => change.action !== "attach")) fail();
  const metadata = personalManufacturerSourceMetadata(body.manufacturerSource);
  return { source: clone(body.manufacturerSource), manufacturerCatalogSource: metadata };
}
