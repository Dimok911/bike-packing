import { createHash } from "node:crypto";
import { manufacturerImageKey } from "./image-variants.mjs";
export const decodeImageHtml = (value = "") => String(value)
  .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)))
  .replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
export const imageAttributes = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1], decodeImageHtml(m[2] ?? m[3])]));
export function imageElementBody(html, start, tagName = "div") {
  const tags = new RegExp(`</?${tagName}\\b[^>]*>`, "gi"); tags.lastIndex = start; let depth = 0;
  for (let match; (match = tags.exec(html));) { depth += match[0].startsWith("</") ? -1 : 1; if (!depth) return html.slice(start, tags.lastIndex); }
  return "";
}
export function galleryImageUrls(html, sourceUrl) {
  const urls = [];
  for (const tag of String(html).matchAll(/<img\b[^>]*>/gi)) {
    const a = imageAttributes(tag[0]);
    const candidate = a.data_large_image || a["data-large_image"] || a["data-src"] || a.src;
    if (!candidate) continue;
    const url = new URL(candidate, sourceUrl);
    if (!/^https?:$/.test(url.protocol) || !/\.(?:png|jpe?g|webp)$/i.test(url.pathname) || /placeholder|lazy-load-default/i.test(url.pathname)) continue;
    urls.push(url.href);
  }
  return [...new Map(urls.map(url => [manufacturerImageKey(url), url])).values()];
}
const label = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
function matchesWooVariant(variant, raw) {
  if (raw.sku && variant.sku && label(raw.sku) === label(variant.sku)) return true;
  const sizes = Object.entries(raw.attributes || {}).filter(([name]) => /size|volume|capacity/i.test(name)).map(([, value]) => value);
  if (sizes.length && sizes.every(size => !size)) return true; // WooCommerce wildcard: any offered size.
  return sizes.some(size => label(variant.title) === label(size) || label(String(variant.title).split(':')[0]) === label(size)
    || (String(variant.title).includes(' · ') && label(String(variant.title).split(' · ')[0]) === label(size)));
}
export function readGalleryJsonAssignment(html, pattern) {
  const match = pattern.exec(html);
  if (!match) return null;
  const start = match.index + match[0].length;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') quoted = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { if (--depth === 0) return JSON.parse(html.slice(start, i + 1)); }
  }
  throw new Error("Incomplete manufacturer gallery JSON");
}
export function wooGalleryEvidence(html, entry) {
  const root = [...String(html).matchAll(/<div\b[^>]*>/gi)].find(m => /\bwoocommerce-product-gallery\b/.test(imageAttributes(m[0]).class || ""));
  const iconicRoot = [...String(html).matchAll(/<div\b[^>]*>/gi)].map(m => imageAttributes(m[0])).find(a => /\biconic-woothumbs-all-images-wrap\b/.test(a.class || ""));
  const iconicDefaults = iconicRoot ? JSON.parse(iconicRoot["data-default"] || "[]") : [];
  const defaults = root ? galleryImageUrls(imageElementBody(html, root.index), entry.sourceUrl)
    : iconicDefaults.map(image => image.large_src || image.full_src || image.url).filter(Boolean);
  const iconicVariations = iconicRoot ? readGalleryJsonAssignment(html, /window\.iconic_woothumbs_variations_data\s*\[\s*\d+\s*\]\s*=\s*/) : null;
  if (!defaults.length) return [];
  const raw = [];
  for (const match of String(html).matchAll(/\bdata-product_variations\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const parsed = JSON.parse(decodeImageHtml(match[1] ?? match[2]));
    if (Array.isArray(parsed)) raw.push(...parsed);
  }
  const evidence = [];
  for (const variant of entry.variants || []) {
    const matches = raw.filter(row => matchesWooVariant(variant, row));
    if (!matches.length) continue;
    const images = matches.flatMap(row => {
      if (iconicRoot) {
        const gallery = iconicVariations?.[row.variation_id];
        if (!Array.isArray(gallery) || !gallery.length) throw new Error("Missing selected Revelate gallery: " + row.variation_id);
        return gallery.map(image => image.large_src || image.full_src || image.url).filter(Boolean);
      }
      if (row.gallery_images_html) return galleryImageUrls(row.gallery_images_html, entry.sourceUrl);
      // WooCommerce changes the first image only; the remaining gallery stays shared.
      const primary = row.image?.full_src || row.image?.url || row.image?.src;
      return primary ? [primary, ...defaults.slice(1)] : defaults;
    });
    if (images.length) evidence.push({ sku: variant.sku, volume: variant.volume || entry.volume,
      sourceImageUrls: [...new Map(images.map(url => [manufacturerImageKey(url), url])).values()], sourceUrl: entry.sourceUrl });
  }
  return evidence;
}
export function withManufacturerGalleryEvidence(entry, evidence, { checkedAt = "", source = "manufacturer-selected-variant-gallery" } = {}) {
  const variants = entry.variants || [];
  if (!evidence.length || !variants.length || variants.some(v => !evidence.some(e => e.sku === v.sku && (!e.volume || e.volume === v.volume) && e.sourceImageUrls?.length))) {
    throw new Error(`Incomplete gallery evidence: ${entry.id}`);
  }
  const old = new Map((entry.sourceImageUrls || []).map((url, i) => [manufacturerImageKey(url), { url, path: entry.imageAssetPaths?.[i] }]));
  const images = new Map();
  for (const row of evidence.filter(e => variants.some(v => e.sku === v.sku && (!e.volume || e.volume === v.volume)))) for (const url of row.sourceImageUrls) {
    const key = manufacturerImageKey(url); const saved = old.get(key);
    if (!key) throw new Error(`Invalid gallery URL: ${entry.id}`);
    const record = images.get(key) || { url: saved?.url || url, path: saved?.path, skus: [], volumes: [] };
    record.skus.push(row.sku);
    record.volumes.push(row.volume || variants.find(v => v.sku === row.sku)?.volume || entry.volume);
    images.set(key, record);
  }
  const records = [...images.values()];
  const brand = String(entry.manufacturerId || entry.brand).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const paths = records.map(r => r.path || `assets/manufacturer-catalog/${brand}/variant-${createHash('sha256').update(r.url).digest('hex').slice(0,20)}${new URL(r.url).pathname.match(/\.(png|jpe?g|webp)$/i)?.[0].toLowerCase() || '.jpg'}`);
  const { imageUrl, imageUrls, unassignedImageCount, imageReviewReason, imageGalleryPreserved, pendingImageGallery, ...rest } = entry;
  return { ...rest, sourceImageUrls: records.map(r => r.url), sourceImageUrl: records[0].url,
    imageAssetPaths: paths, imageAssetPath: paths[0], imageVolumeOptions: records.map(r => [...new Set(r.volumes)]),
    imageSkuOptions: records.map(r => [...new Set(r.skus)]), imageVariantSource: source, imagesCheckedAt: checkedAt,
    imageReviewRequired: false };
}
