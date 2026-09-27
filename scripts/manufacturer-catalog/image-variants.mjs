function decode(value = "") {
  return String(value).replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) =>
    String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)))
    .replaceAll("&quot;", '"').replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((m) => [m[1], decode(m[2] ?? m[3])]));
}

export function manufacturerImageKey(value = "") {
  try {
    return decodeURIComponent(new URL(decode(value), "https://example.test").pathname)
      .split("/").at(-1).replace(/-\d{2,4}x\d{2,4}(?=\.[a-z]+$)/i, "").toLowerCase();
  } catch { return ""; }
}

function liters(value) {
  return [...String(value).matchAll(/(?:^|[^\da-z.])(\d+(?:[.,_-]\d+)?)[ _-]*(?:l\b|litres?\b|liters?\b)/gi)]
    .map((m) => Number(m[1].replace(/[,_-]/, "."))).filter((n) => n > 0 && n < 200);
}

function elementBody(html, start, tagName = "div") {
  const tags = new RegExp(`</?${tagName}\\b[^>]*>`, "gi");
  tags.lastIndex = start;
  let depth = 0;
  for (let match; (match = tags.exec(html));) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (!depth) return html.slice(start, tags.lastIndex);
  }
  return "";
}

// Keep source evidence at import time; the runtime only needs the aligned scopes.
// null = no size assignment in the source; [] = outside a size-specific gallery.
export function annotateManufacturerImageVariants(entry, { html = "", product = {} } = {}) {
  const urls = entry.sourceImageUrls || [entry.sourceImageUrl].filter(Boolean);
  const variants = entry.variants || [];
  const volumes = [...new Set([...variants.map((v) => v.volume), ...(entry.volumeOptions || [])].filter((v) => v > 0))];
  if (!urls.length) return entry;
  const evidence = product.catalogVariantEvidence || [];
  if (evidence.length) {
    const imageSkuOptions = urls.map((url) => evidence.filter((v) => v.sourceImageUrls.some((image) => manufacturerImageKey(image) === manufacturerImageKey(url))).map((v) => v.sku));
    return { ...entry, imageSkuOptions,
      imageVolumeOptions: imageSkuOptions.map((skus) => [...new Set(variants.filter((v) => skus.includes(v.sku)).map((v) => v.volume || entry.volume).filter(Boolean))]),
      imageVariantSource: "manufacturer-selected-variant-gallery" };
  }
  if (volumes.length < 2) return entry;
  const byKey = new Map();
  const add = (url, scope) => {
    if (!url || !scope.length) return;
    const key = manufacturerImageKey(url);
    byKey.set(key, [...new Set([...(byKey.get(key) || []), ...scope])]);
  };
  const text = decode(html.replace(/<[^>]*>/g, " "));
  const namedVolume = (label) => {
    const direct = liters(label);
    if (direct.length) return direct;
    const plain = String(label).replace(/^pa_\w+_v_/, "").replaceAll("-", " ").trim();
    const matching = variants.filter((v) => String(v.title).toLowerCase() === plain.toLowerCase());
    if (matching.length) return matching.map((v) => v.volume);
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const metric = text.match(new RegExp(`\\b${escaped}\\b\\)?\\s*[–—:-]\\s*(\\d+(?:[.,]\\d+)?)\\s*L\\b`, "i"));
    return metric ? [Number(metric[1].replace(",", "."))] : [];
  };
  const skuVolumes = (value) => variants.filter((v) => v.sku &&
    new RegExp(`(?:^|[^a-z0-9])${String(v.sku).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(value))
    .map((v) => v.volume);

  for (const image of product.images || []) {
    const linked = (product.variants || []).filter((v) => (image.variant_ids || []).includes(v.id)
      || (image.id != null && v.image_id === image.id));
    const scope = [...new Set([...linked.flatMap((v) => liters(v.title)), ...skuVolumes(image.alt || ""), ...liters(image.alt || "")])];
    add(image.src, scope);
  }
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attributes(match[0]);
    const scope = [...new Set([...skuVolumes(a.alt || ""), ...liters(a.alt || "")])];
    for (const key of ["src", "data-src", "data-large_image", "data-large-image"]) add(a[key], scope);
  }
  // WooCommerce assigns primary images to variations, including shared images.
  for (const match of html.matchAll(/\bdata-product_variations\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    let data;
    try { data = JSON.parse(decode(match[1] ?? match[2])); } catch { continue; }
    if (!Array.isArray(data)) continue;
    for (const variant of data) {
      const size = Object.entries(variant.attributes || {}).filter(([key]) => /size|volume|capacity/i.test(key)).flatMap(([, value]) => namedVolume(value));
      for (const key of ["src", "url", "full_src"]) add(variant.image?.[key], size);
    }
  }

  const galleries = [];
  for (const match of html.matchAll(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bgallery-variation\b[^"']*["'][^>]*>/gi)) {
    const a = attributes(match[0]);
    const scope = namedVolume(a["data-variation"] || "");
    if (!scope.length) continue;
    const keys = new Set();
    for (const image of elementBody(html, match.index).matchAll(/<img\b[^>]*>/gi)) {
      const attrs = attributes(image[0]);
      for (const key of ["src", "data-src", "data-large_image"]) if (attrs[key]) keys.add(manufacturerImageKey(attrs[key]));
    }
    if (keys.size) galleries.push({ scope, keys });
  }
  const completeGalleries = volumes.every((volume) => galleries.some((g) => g.scope.includes(volume)));
  const scopes = urls.map((url) => {
    const key = manufacturerImageKey(url);
    if (completeGalleries) return [...new Set(galleries.filter((g) => g.keys.has(key)).flatMap((g) => g.scope))];
    const explicit = byKey.get(key);
    if (explicit?.length) return explicit;
    const named = [...new Set([...skuVolumes(key), ...liters(key)])];
    // Only recognize capacities present in this product, never photo sequence numbers.
    return named.length && named.some((v) => volumes.includes(v)) ? named : null;
  });
  return { ...entry, imageVolumeOptions: scopes, imageVariantSource: completeGalleries ? "manufacturer-variant-galleries" : "manufacturer-image-metadata" };
}
