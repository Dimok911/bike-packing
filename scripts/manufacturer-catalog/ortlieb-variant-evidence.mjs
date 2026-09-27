// Only the selected variant's specification table and visible gallery are evidence.
// Collection tags describe the family and must never override its mounting system.
const decode = (text = "") => String(text).replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
const plain = (text = "") => decode(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
export function ortliebVariantEvidence(html, sourceUrl) {
  const rows = {};
  for (const match of String(html).matchAll(/<div class="specifications-table__row">([\s\S]*?)<\/div>/gi)) {
    const cells = [...match[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => plain(m[1]));
    if (cells.length >= 2 && !rows[cells[0]]) rows[cells[0]] = cells[1];
  }
  const measure = (value, imperial, factor) => {
    const number = Number(String(value || "").match(/[\d.]+/)?.[0] || 0);
    return Math.round(number * (imperial.test(value || "") ? factor : 1) * 100) / 100;
  };
  const gallery = String(html).match(/<product-gallery\b[\s\S]*?<\/product-gallery>/i)?.[0] || "";
  const images = [...gallery.matchAll(/<div\b[^>]*data-media-type="image"[^>]*>\s*<img\b[^>]*src="([^"]+)"/gi)]
    .map((m) => new URL(decode(m[1]), sourceUrl).href);
  return {
    sku: rows.SKU || "", sourceUrl, material: rows.Material || "",
    mounting: rows["Mounting System"] || "",
    volume: measure(rows.Volume, /never/, 1),
    weight: Math.round(measure(rows.Weight, /\boz\b/i, 28.3495)),
    dimensions: Object.fromEntries([["width", "Width"], ["height", "Height"], ["depth", "Depth"]]
      .map(([key, label]) => [key, measure(rows[label], /\bin\b/i, 2.54)]).filter(([, value]) => value > 0)),
    sourceImageUrls: [...new Set(images)],
  };
}

export async function collectOrtliebVariantEvidence({ product, html, sourceUrl, fetchText, existing = [], onProgress = async () => {} }) {
  const first = ortliebVariantEvidence(html, sourceUrl);
  const evidence = [];
  for (const variant of product.variants || []) {
    const url = new URL(sourceUrl);
    url.searchParams.set("variant", String(variant.id));
    const details = existing.find((item) => item.sku === variant.sku && item.id === String(variant.id))
      || (first.sku === variant.sku ? { ...first, sourceUrl: url.href }
      : ortliebVariantEvidence(await fetchText(url.href), url.href));
    if (!variant.sku || details.sku !== variant.sku || !details.sourceImageUrls.length) {
      throw new Error(`Unverified ORTLIEB variant ${product.handle}/${variant.sku || variant.id}`);
    }
    evidence.push({ ...details, id: String(variant.id) });
    await onProgress(evidence);
  }
  return evidence;
}
