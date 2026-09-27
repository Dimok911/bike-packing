import { manufacturerIdForEntry } from "../../src/data/manufacturer-catalog-scan.js";

// Collection membership is not proof that an existing product was discontinued.
// A missing product needs a direct check; uncertainty keeps the scan partial.
export async function recoverShopifyCatalogProducts({ source, products, approvedEntries, fetchText }) {
  if (source.adapter && source.adapter !== "restrap-shopify") return [];
  const base = new URL(source.productBaseUrl);
  const handles = new Set();
  for (const entry of approvedEntries) {
    if (manufacturerIdForEntry(entry) !== source.id) continue;
    const url = new URL(entry.sourceUrl);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new Error(`Cannot verify approved product URL: ${entry.id}`);
    }
    const handle = url.pathname.slice(base.pathname.length).replace(/\/$/, "");
    if (!/^[a-zA-Z0-9-]+$/.test(handle)) throw new Error(`Invalid product handle: ${entry.id}`);
    if (!products.has(handle)) handles.add(handle);
  }
  const recovered = [];
  for (const handle of handles) {
    const url = `${base.href}${handle}`;
    let body;
    try {
      body = await fetchText(`${url}.json`);
    } catch (error) {
      if (error.httpStatus !== 404 && error.httpStatus !== 410) throw error;
      let html;
      try {
        html = await fetchText(url);
      } catch (pageError) {
        if (pageError.httpStatus === 404 || pageError.httpStatus === 410) continue;
        throw pageError;
      }
      const canonicalTag = String(html).match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0] || "";
      const canonicalHref = canonicalTag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      const canonical = canonicalHref ? new URL(canonicalHref, url) : null;
      const newHandle = canonical?.origin === base.origin && canonical.pathname.startsWith(base.pathname)
        ? canonical.pathname.slice(base.pathname.length).replace(/\/$/, "") : "";
      const renamed = products.get(newHandle);
      const previous = approvedEntries.filter((entry) => manufacturerIdForEntry(entry) === source.id && new URL(entry.sourceUrl).pathname === `${base.pathname}${handle}`);
      const previousSkus = new Set(previous.flatMap((entry) => [entry.sku, ...(entry.variants || []).map((variant) => variant.sku)]).filter(Boolean));
      const anotherApproved = approvedEntries.some((entry) => manufacturerIdForEntry(entry) === source.id && new URL(entry.sourceUrl).pathname === `${base.pathname}${newHandle}`);
      if (renamed && newHandle !== handle && !anotherApproved && renamed.variants?.some(({ sku }) => sku && previousSkus.has(sku))) {
        // An official redirect plus a matching SKU establishes the same model.
        recovered.push({ ...renamed, handle, catalogSourceHandle: newHandle });
        continue;
      }
      throw new Error(`Product page still responds but product data is unavailable: ${url}`);
    }
    const product = JSON.parse(body).product;
    if (!product || product.handle !== handle || !product.title || !Array.isArray(product.variants) || !product.variants.length) {
      throw new Error(`Cannot verify product identity and variants: ${url}`);
    }
    recovered.push(product);
  }
  return recovered;
}
