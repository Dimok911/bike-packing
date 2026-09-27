import { manufacturerImageKey } from './image-variants.mjs';
import { imageAttributes, imageElementBody } from './gallery-evidence.mjs';

const liters = value => [...String(value || '').matchAll(/(?:^|[^\da-z.])(\d+(?:[.,]\d+)?)\s*(?:l\b|litres?\b|liters?\b)/gi)].map(m => Number(m[1].replace(',', '.')));
const imageKey = url => manufacturerImageKey(url).replace(/_\d+x\d*(?=\.[a-z]+$)/i, '');

// Arkel's Impulse gallery changes the active slide on variant selection. Slides
// without variant metadata are shared; explicit size/variant links take priority.
// If the theme supplies image groups, respect those instead of assuming sharing.
export function arkelGalleryEvidence(html, entry, product = {}) {
  const slides = [...String(html).matchAll(/<div\b[^>]*>/gi)]
    .filter(m => /\bproduct-main-slide\b/.test(imageAttributes(m[0]).class || ''));
  if (!slides.length || !Array.isArray(product.images) || !product.variants?.length) return [];
  const variants = entry.variants || [];
  const rawBySku = new Map(product.variants.map(v => [String(v.sku || '').toLowerCase(), v]));
  const records = slides.flatMap(slide => {
    const slideAttrs = imageAttributes(slide[0]);
    const body = imageElementBody(html, slide.index);
    const image = [...body.matchAll(/<img\b[^>]*>/gi)].map(m => imageAttributes(m[0]))
      .find(a => a['data-photoswipe-src'] || a['data-src'] || a.src);
    if (!image) return [];
    const url = new URL(image['data-photoswipe-src'] || image['data-src'] || image.src, entry.sourceUrl).href;
    const raw = product.images.find(i => imageKey(i.src) === imageKey(url));
    if (!raw) return []; // A gallery image absent from the product snapshot is not proof of sharing.
    const linked = product.variants.filter(v => (raw.variant_ids || []).map(String).includes(String(v.id)) || String(v.image_id || '') === String(raw.id));
    const sizes = liters(raw.alt || image.alt);
    return [{ url: raw.src, raw, linked, sizes, group: slideAttrs['data-group'] || '', set: slideAttrs['data-set-name'] || '' }];
  });
  const groupName = records.find(r => r.set)?.set;
  const optionIndex = groupName ? (product.options || []).findIndex(o => String(o.name).toLowerCase() === groupName.toLowerCase()) + 1 : 0;
  return variants.flatMap(variant => {
    const raw = rawBySku.get(String(variant.sku || '').toLowerCase());
    if (!raw) return [];
    const selectedSizes = liters(raw.title);
    const group = optionIndex ? `${groupName}_${String(raw['option' + optionIndex] || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : '';
    if (groupName && !optionIndex) return [];
    const primary = records.find(r => r.linked.some(v => String(v.id) === String(raw.id)));
    const matching = records.filter(r => {
      if (group && r.group !== group) return false;
      if (r.linked.length) return r.linked.some(v => liters(v.title).some(n => selectedSizes.includes(n)) || (!selectedSizes.length && String(v.id) === String(raw.id)));
      if (r.sizes.length) return r.sizes.some(n => selectedSizes.includes(n));
      return true;
    });
    const urls = [...new Set([...(primary && matching.includes(primary) ? [primary.url] : []), ...matching.map(r => r.url)])];
    return urls.length ? [{ sku: variant.sku, volume: variant.volume, sourceUrl: entry.sourceUrl, sourceImageUrls: urls }] : [];
  });
}
