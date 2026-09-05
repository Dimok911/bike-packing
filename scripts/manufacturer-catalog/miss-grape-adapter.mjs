import { extname } from "node:path";

const CATEGORY_BY_HANDLE = Object.freeze({
  "cluster-2-waterproof": "saddle",
  "cluster-7-wp": "saddle",
  "cluster-13-waterproof": "saddle",
  "cluster-20-wp": "saddle",
  "internode-2-waterproof": "frame",
  "internode-3-copia": "frame",
  "internode-4-waterproof": "frame",
  "internode-5-waterproof": "frame",
  "internode-6-waterproof": "frame",
  "custom-frame-bags": "frame",
  "node": "top-tube",
  "node-2h": "top-tube",
  "node-2": "top-tube",
  "node-2h-2": "top-tube",
  "big-node-road": "top-tube",
  "big-node-2h-road": "top-tube",
  "bud": "handlebar",
  "moon": "handlebar",
  "moon-ic": "handlebar",
  "tendril-4-10-waterproof": "handlebar",
  "tendril-10-7": "handlebar",
  "trunk-8-waterproof": "handlebar",
  "trunk-16-waterproof": "handlebar",
  "trunk-aero-bar": "handlebar",
  "trunk6-waterproof": "fork",
});

const CATEGORY_META = Object.freeze({
  saddle: { family: "bikepacking", en: "saddle bag", ru: "подседельная сумка", mounting: "Saddle rails / seatpost straps" },
  frame: { family: "bikepacking", en: "frame bag", ru: "нарамная сумка", mounting: "Frame straps / custom frame attachment" },
  "top-tube": { family: "bikepacking", en: "top-tube bag", ru: "сумка на верхнюю трубу", mounting: "Top-tube straps / bolt-on" },
  handlebar: { family: "bikepacking", en: "handlebar bag", ru: "рулевая сумка", mounting: "Handlebar / stem straps or ILCOSO support" },
  fork: { family: "bikepacking", en: "fork bag", ru: "сумка на вилку", mounting: "Fork / cargo cage straps" },
});

function decodeHtml(value = "") {
  return String(value)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&times;/gi, "×")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&reg;|&#174;/gi, "®")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value = "") {
  return decodeHtml(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h\d|tr|section|article|dd|dt|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function productRecords(payload = "") {
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function englishProductUrl(rawUrl = "") {
  try {
    const url = new URL(decodeHtml(rawUrl));
    if (!/(^|\.)missgrape\.net$/i.test(url.hostname)) return null;
    url.hostname = "missgrape.net";
    url.hash = "";
    url.search = "";
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "en") segments.shift();
    if (segments[0] === "prodotto") segments[0] = "product";
    url.pathname = `/en/${segments.join("/")}/`;
    return url;
  } catch {
    return null;
  }
}

export function missGrapeCatalogTargets(payload = "") {
  const targets = new Map();
  for (const product of productRecords(payload)) {
    const handle = String(product?.slug || "").trim().toLowerCase();
    const category = CATEGORY_BY_HANDLE[handle];
    const url = englishProductUrl(product?.link || "");
    if (!handle || !category || !url) continue;
    targets.set(handle, { ...product, handle, category, url: url.toString() });
  }
  return [...targets.values()].sort((left, right) => left.handle.localeCompare(right.handle));
}

function pageMainHtml(html = "") {
  const source = String(html || "");
  const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const product = source.match(/<div\b[^>]*class=["'][^"']*\bproduct\b[^"']*["'][^>]*>([\s\S]*?)<section\b[^>]*class=["'][^"']*(?:newsletter|related)/i)?.[1];
  return product || main || source;
}

function pageText(html = "") {
  return plainText(pageMainHtml(html));
}

function metaContent(html = "", name = "") {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const pattern of [
    new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
    new RegExp(`<meta\\b[^>]*content\\s*=\\s*(?:"([^"]*)"|'([^']*)')[^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`, "i"),
  ]) {
    const match = String(html || "").match(pattern);
    if (match) return decodeHtml(match[1] || match[2] || "").trim();
  }
  return "";
}

function productName(product = {}, html = "") {
  const heading = plainText(String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  return heading || plainText(product?.title?.rendered || "") || metaContent(html, "og:title").split("|")[0].trim();
}

export function missGrapeProductPageIsValid(html = "") {
  return Boolean(plainText(String(html).match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ""));
}

function productSku(html = "") {
  return plainText(String(html).match(/<span\b[^>]*class=["'][^"']*\bsku\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
}

function characteristicSection(text = "") {
  const start = text.search(/\bCharacteristics\b/i);
  if (start < 0) return text;
  const source = text.slice(start);
  const end = source.slice(20).search(/\b(?:NEWSLETTER|SUPPORT|Related products)\b/i);
  return end >= 0 ? source.slice(0, end + 20) : source.slice(0, 3000);
}

function uniqueNumbers(values = []) {
  return [...new Set(values.map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))]
    .sort((left, right) => left - right);
}

function productMetrics(text = "") {
  const characteristics = characteristicSection(text);
  const volumes = uniqueNumbers([...characteristics.matchAll(/(?:MIN\.?\s+VOLUME|MAX(?:IMUM)?\s+VOLUME|VOLUME|CAPACITY)\s*(\d+(?:[.,]\d+)?)\s*(?:L\b|lit(?:er|re)s?\b)/gi)]
    .map((match) => Number(match[1].replace(",", "."))));
  const gramWeights = [...characteristics.matchAll(/\bWEIGHT\s*(\d+(?:[.,]\d+)?)\s*(?:g|gr)\b/gi)]
    .map((match) => Number(match[1].replace(",", ".")));
  const kilogramWeights = [...characteristics.matchAll(/\bWEIGHT\s*(?:\||:)?\s*(\d+(?:[.,]\d+)?)\s*kg\b/gi)]
    .map((match) => Number(match[1].replace(",", ".")) * 1000);
  if (!gramWeights.length && !kilogramWeights.length) {
    const additional = text.match(/Additional Information[\s\S]{0,500}?Weight\s*(?:\||:)?\s*(\d+(?:[.,]\d+)?)\s*kg\b/i);
    if (additional) kilogramWeights.push(Number(additional[1].replace(",", ".")) * 1000);
  }
  return { volumes, weights: uniqueNumbers([...gramWeights, ...kilogramWeights]) };
}

function productNameVolume(handle = "") {
  const match = String(handle).match(/^cluster-(\d+(?:-\d+)?)(?:-|$)/);
  return match ? Number(match[1].replace("-", ".")) : 0;
}

function productDimensions(text = "") {
  const characteristics = characteristicSection(text);
  const pairs = [...characteristics.matchAll(/\b(LENGTH|WIDTH|HEIGHT|DEPTH|DIAMETER|MIN\.?\s+WIDTH|MAX\.?\s+WIDTH)\s*(\d+(?:[.,]\d+)?)\s*cm\b/gi)];
  const dimensions = {};
  for (const match of pairs) {
    const label = match[1].toLowerCase().replace(/\s+/g, " ");
    const value = Number(match[2].replace(",", "."));
    if (label.includes("diameter")) dimensions.diameterCm = value;
    else if (label.includes("height")) dimensions.heightCm = value;
    else if (label.includes("depth")) dimensions.depthCm = value;
    else if (label.includes("min") && label.includes("width")) dimensions.widthMinCm = value;
    else if (label.includes("max") && label.includes("width")) dimensions.widthMaxCm = value;
    else if (label.includes("width")) dimensions.widthCm = value;
    else if (label.includes("length") && !dimensions.lengthCm) dimensions.lengthCm = value;
    else if (label.includes("length") && !dimensions.widthCm) dimensions.widthCm = value;
  }
  return dimensions;
}

function normalizedImageUrl(rawUrl = "", pageUrl = "") {
  try {
    const url = new URL(decodeHtml(rawUrl).replace(/&amp;/g, "&").trim(), pageUrl);
    if (!/(^|\.)(?:missgrape\.net|exactdn\.com)$/i.test(url.hostname)) return null;
    if (!/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(url.href)) return null;
    if (/(?:logo|favicon|icon|avatar|payment|flag|placeholder|sprite|newsletter|trustpilot|rocket|delivery-status|warranty|size[-_ ]?guide)[^/]*\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function productImages(html = "", pageUrl = "") {
  const source = pageMainHtml(html).split(/\bNEWSLETTER\b/i)[0];
  const candidates = [metaContent(html, "og:image")];
  for (const match of source.matchAll(/\b(?:data-large_image|data-large-image|data-src|src)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
    candidates.push(match[1] || match[2]);
  }
  const images = new Map();
  for (const candidate of candidates) {
    const url = normalizedImageUrl(candidate, pageUrl);
    if (!url) continue;
    const key = url.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)$)/i, "").toLowerCase();
    if (!images.has(key)) images.set(key, url.toString());
  }
  return [...images.values()].slice(0, 16);
}

function safeImageExtension(url = "") {
  const extension = extname(new URL(url).pathname).toLowerCase();
  return extension === ".jpeg" ? ".jpg" : ([".jpg", ".png", ".webp"].includes(extension) ? extension : ".jpg");
}

function technicalDetails(text = "") {
  const start = text.search(/\b(?:Introduction|Technical specifications)\b/i);
  const source = start >= 0 ? text.slice(start) : text;
  const end = source.slice(50).search(/\b(?:NEWSLETTER|SUPPORT|Related products)\b/i);
  return (end >= 0 ? source.slice(0, end + 50) : source.slice(0, 5000)).trim();
}

export function buildMissGrapeCatalogEntry({ product = {}, html = "", sourceUrl = "", checkedAt = "" } = {}) {
  const url = englishProductUrl(sourceUrl || product.url || product.link || "");
  const handle = String(product.handle || product.slug || "").trim().toLowerCase();
  const category = CATEGORY_BY_HANDLE[handle];
  if (!url || !handle || !category) throw new Error(`Unsupported Miss Grape product: ${sourceUrl || handle || "missing"}`);
  const name = productName(product, html);
  if (!name) throw new Error(`Missing Miss Grape product name: ${url}`);
  const meta = CATEGORY_META[category];
  const text = pageText(html);
  const details = technicalDetails(text);
  const metrics = productMetrics(text);
  const volumes = metrics.volumes.length ? metrics.volumes : [productNameVolume(handle)].filter(Boolean);
  const weights = metrics.weights;
  const images = productImages(html, url);
  if (!images.length) throw new Error(`Missing Miss Grape product images: ${url}`);
  const imageAssetPaths = images.map((imageUrl, index) =>
    `assets/manufacturer-catalog/miss-grape/${handle}${index ? `-${index + 1}` : ""}${safeImageExtension(imageUrl)}`
  );
  const sku = productSku(html);
  const available = !/(?:class=["'][^"']*out-of-stock|og:availability["'][^>]*content=["']out of stock)/i.test(html);
  const mounting = handle === "moon-ic" ? "ILCOSO support" : meta.mounting;
  const variant = {
    sku,
    title: volumes.length > 1 ? `${volumes[0]}–${volumes.at(-1)} L` : volumes.length ? `${volumes[0]} L` : "Manufacturer model",
    color: /\bblack\b/i.test(details) ? "Black" : "",
    volume: volumes[0] || 0,
    weight: weights[0] || 0,
    mounting,
    available,
  };
  const description = metaContent(html, "og:description");
  const waterproof = /completely waterproof|100\s*%\s*waterproof|30[,.]?000 water column/i.test(details)
    ? "Waterproof"
    : /water[- ]resistant|weather[- ]resistant|water-repellent/i.test(details) ? "Weather-resistant" : "";
  return {
    id: `miss-grape-${handle}`,
    sourceProductId: `miss-grape-${handle}`,
    manufacturerId: "miss-grape",
    brand: "Miss Grape",
    provider: "missgrape.net",
    family: meta.family,
    category,
    name,
    variant: volumes.length > 1 ? `${volumes[0]}–${volumes.at(-1)} L` : volumes.length ? `${volumes[0]} L` : "Manufacturer model",
    sku,
    weight: weights[0] || 0,
    weightOptions: weights,
    volume: volumes[0] || 0,
    volumeOptions: volumes,
    ...(volumes.length > 1 ? { volumeMin: volumes[0], volumeMax: volumes.at(-1) } : {}),
    loadKg: 0,
    dimensions: productDimensions(text),
    color: variant.color,
    waterproof,
    material: /nylon\s*420/i.test(details) ? "420D nylon / 300D polyester" : /nylon\s*210/i.test(details) ? "210D nylon" : "Miss Grape technical fabric",
    mounting,
    mountingOptions: [mounting],
    soldAsSet: false,
    available,
    variantCount: 1,
    availableVariantCount: available ? 1 : 0,
    variantWeightsAuthoritative: weights.length > 0,
    variants: [variant],
    imageAssetPath: imageAssetPaths[0],
    imageAssetPaths,
    sourceImageUrl: images[0],
    sourceImageUrls: images,
    sourceUrl: url.toString(),
    sourceCheckedAt: checkedAt,
    manufacturerDetails: details,
    description: {
      en: description || `${name} is a Miss Grape ${meta.en}. Specifications are from the manufacturer's official product page.`,
      ru: `${meta.ru[0].toLocaleUpperCase()}${meta.ru.slice(1)} Miss Grape${volumes.length ? ` объёмом ${volumes.join("–")} л` : ""}. Характеристики взяты с официальной страницы производителя.`,
    },
    aliases: [...new Set(["Miss Grape", meta.en, meta.ru, handle.replaceAll("-", " "), name])],
  };
}
