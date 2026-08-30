import { extname } from "node:path";

const CATEGORY_META = Object.freeze({
  saddle: { family: "bikepacking", en: "saddle bag", ru: "подседельная сумка", mounting: "Saddle rails / seatpost straps" },
  frame: { family: "bikepacking", en: "frame bag", ru: "нарамная сумка", mounting: "Frame straps / bolt-on" },
  "top-tube": { family: "bikepacking", en: "top-tube bag", ru: "сумка на верхнюю трубу", mounting: "Top-tube straps / bolt-on" },
  handlebar: { family: "bikepacking", en: "handlebar bag", ru: "рулевая сумка", mounting: "Handlebar straps / Apidura handlebar system" },
  fork: { family: "bikepacking", en: "fork or cargo-cage bag", ru: "сумка на вилку или грузовую клетку", mounting: "Cargo cage / straps" },
  "rear-pannier": { family: "panniers", en: "rear pannier", ru: "задний панир", mounting: "Rear rack" },
  "rack-top": { family: "panniers", en: "rack-top bag", ru: "сумка на багажник", mounting: "Front or rear rack" },
});

function decodeHtml(value = "") {
  return String(value)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&times;/gi, "×")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value = "") {
  return decodeHtml(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h\d|tr|section|article|dd|dt)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function uniqueNumbers(values = []) {
  return [...new Set(values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))]
    .sort((left, right) => left - right);
}

function orderedUniqueNumbers(values = []) {
  return [...new Set(values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))];
}

function normalizedProductUrl(rawUrl, baseUrl = "https://www.apidura.com/shop/") {
  try {
    const url = new URL(decodeHtml(rawUrl), baseUrl);
    if (!/(^|\.)apidura\.com$/i.test(url.hostname)) return null;
    if (!/^\/shop\/[a-z0-9-]+\/?$/i.test(url.pathname)) return null;
    url.hostname = "www.apidura.com";
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
  } catch {
    return null;
  }
}

function productRecords(payload = "") {
  if (typeof payload === "string" && /<urlset\b/i.test(payload)) {
    return [...payload.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) => {
      const url = normalizedProductUrl(match[1]);
      const slug = url?.pathname.split("/").filter(Boolean).at(-1) || "";
      return { slug, permalink: url?.toString() || "", name: slug.replaceAll("-", " ") };
    });
  }
  try {
    const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed?.products) ? parsed.products : [];
  } catch {
    return [];
  }
}

function isBagProduct(product = {}) {
  const name = plainText(product.name || "");
  const slug = String(product.slug || "");
  const categories = (Array.isArray(product.categories) ? product.categories : [])
    .map((category) => `${category?.name || ""} ${category?.slug || ""}`)
    .join(" ");
  const categoryMatch = /(?:saddle|frame|handlebar|top[ -]?tube)\s+(?:bags?|packs?)/i.test(categories);
  const productMatch = /\b(?:saddle|frame|handlebar|top[ -]?tube|down[ -]?tube|fork|cargo|pannier|aerobar|stem|front rack|tool|charger|accessory|food)\b[\s\S]*\b(?:bag|pack|module|pannier|pocket|pouch)s?\b/i.test(`${name} ${slug.replaceAll("-", " ")}`);
  const excluded = /\b(?:adapter|bracket|strap|replacement|spare|repair|hydration (?:vest|bladder)|bottle|flask|cap|wallet|musette|backpack|back pack|waist belt|hip pack|messenger|gift ?card)\b/i.test(`${name} ${slug.replaceAll("-", " ")}`);
  return (categoryMatch || productMatch) && !excluded;
}

export function apiduraCatalogTargets(payload = "") {
  if (typeof payload === "string" && /\.well-known\/sgcaptcha|sgcaptcha/i.test(payload)) {
    throw new Error("Apidura catalog returned an anti-bot challenge instead of the official sitemap");
  }
  const targets = new Map();
  for (const product of productRecords(payload)) {
    if (!isBagProduct(product)) continue;
    const url = normalizedProductUrl(product.permalink || `/shop/${product.slug || ""}/`);
    const handle = String(product.slug || url?.pathname.split("/").filter(Boolean).at(-1) || "").trim().toLowerCase();
    if (!url || !handle) continue;
    targets.set(handle, { ...product, handle, url: url.toString() });
  }
  return [...targets.values()].sort((left, right) => left.handle.localeCompare(right.handle));
}

function mainHtml(html = "") {
  const main = String(html || "").match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  return main || String(html || "");
}

function pageText(html = "") {
  return plainText(mainHtml(html));
}

function pageHeading(html = "") {
  return plainText(String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
}

function metaContent(html = "", name = "") {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
    new RegExp(`<meta\\b[^>]*content\\s*=\\s*(?:"([^"]*)"|'([^']*)')[^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match) return decodeHtml(match[1] || match[2] || "").trim();
  }
  return "";
}

function productInformationText(html = "") {
  const text = pageText(html);
  const start = text.search(/\bProduct Information\b/i);
  const source = start >= 0 ? text.slice(start) : text;
  const end = source.slice(100).search(/\b(?:Care\s*&\s*Maintenance|Climate Footprint|Product Details|Specifications|Compatibility|FAQs?)\b/i);
  return (end >= 0 ? source.slice(0, end + 100) : source.slice(0, 5000)).trim();
}

function technicalDetailsText(html = "") {
  const text = pageText(html);
  const start = text.search(/\b(?:Materials\s*&\s*Technology|Product Information|Description)\b/i);
  const source = start >= 0 ? text.slice(start) : text;
  const end = source.slice(300).search(/\b(?:Climate Footprint|Adventur(?:e|ed) Tested|FAQs?)\b/i);
  return (end >= 0 ? source.slice(0, end + 300) : source.slice(0, 5000)).trim();
}

function volumeValues(value = "") {
  return uniqueNumbers([...String(value || "").matchAll(/(\d+(?:[.,]\d+)?)\s*(?:L\b|lit(?:er|re)s?\b)/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((number) => number <= 50));
}

function weightValues(value = "") {
  return orderedUniqueNumbers([...String(value || "").matchAll(/(\d+(?:[.,]\d+)?)\s*g\b/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((number) => number >= 20 && number < 10_000));
}

function recordVolumeValues(product = {}) {
  const terms = (Array.isArray(product.attributes) ? product.attributes : [])
    .flatMap((attribute) => Array.isArray(attribute?.terms) ? attribute.terms : [])
    .map((term) => term?.name || term?.slug || "");
  return volumeValues([product.name, ...terms].join(" "));
}

function pairedVolumeWeights(value = "") {
  const pairs = new Map();
  for (const match of String(value || "").matchAll(/(\d+(?:[.,]\d+)?)\s*L\s*[:–—-]\s*(\d+(?:[.,]\d+)?)\s*g\b/gi)) {
    pairs.set(Number(match[1].replace(",", ".")), Number(match[2].replace(",", ".")));
  }
  return pairs;
}

function namedMetricValues(value = "", unit = "") {
  const normalizedUnit = unit === "g" ? "g" : "L";
  const pattern = new RegExp(`(?:^|\\n)\\s*[–—-]\\s*([^\\n]{1,100}?)\\s*[–—:]\\s*(\\d+(?:[.,]\\d+)?)\\s*${normalizedUnit}\\b`, "gim");
  const values = new Map();
  for (const match of String(value || "").matchAll(pattern)) {
    const rawLabel = String(match[1] || "").trim();
    const label = (rawLabel.match(/\(([^)]+)\)\s*$/)?.[1] || rawLabel)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const number = Number(String(match[2] || "").replace(",", "."));
    if (label && Number.isFinite(number) && number > 0 && !values.has(label)) values.set(label, number);
  }
  return values;
}

function productMetrics(product = {}, html = "") {
  const information = productInformationText(html);
  const pairs = pairedVolumeWeights(information);
  if (pairs.size) {
    const volumes = uniqueNumbers([...pairs.keys()]);
    return { volumes, weights: volumes.map((volume) => pairs.get(volume)) };
  }
  const namedVolumes = namedMetricValues(information, "L");
  const namedWeights = namedMetricValues(information, "g");
  const sharedLabels = [...namedVolumes.keys()].filter((label) => namedWeights.has(label));
  if (sharedLabels.length) {
    return {
      volumes: sharedLabels.map((label) => namedVolumes.get(label)),
      weights: sharedLabels.map((label) => namedWeights.get(label)),
    };
  }
  const volumes = uniqueNumbers([...recordVolumeValues(product), ...volumeValues(pageHeading(html)), ...volumeValues(information)]);
  const weights = weightValues(information);
  if (volumes.length && weights.length === volumes.length) return { volumes, weights };
  if (volumes.length === 1 && weights.length) return { volumes, weights: [weights[0]] };
  return { volumes, weights };
}

function categoryForProduct(product = {}) {
  const value = `${product.name || ""} ${product.slug || ""}`.toLowerCase().replaceAll("-", " ");
  if (/top\s*tube/.test(value)) return "top-tube";
  if (/front\s*rack/.test(value)) return "rack-top";
  if (/handlebar|aerobar|bar\s*bag|stem\s*pack|front\s*accessory|accessory\s*pocket|food\s*pouch/.test(value)) return "handlebar";
  if (/saddle|seat\s*pack/.test(value)) return "saddle";
  if (/pannier/.test(value)) return "rear-pannier";
  if (/fork|cargo|down\s*tube/.test(value)) return "fork";
  if (/tool\s*pack/.test(value)) return "saddle";
  return "frame";
}

function normalizedImageUrl(rawUrl, pageUrl) {
  try {
    const url = new URL(decodeHtml(rawUrl).trim(), pageUrl);
    if (!/(^|\.)apidura\.com$/i.test(url.hostname)) return null;
    if (!/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(url.href)) return null;
    if (/(?:logo|favicon|icon|avatar|payment|flag|placeholder|sprite|newsletter|journal|banner|fabric|reinforcement|co2e|carbon[-_ ]?footprint|chart|ultrastretch|handwash|size[-_ ]?guide|diagram)[^/]*\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null;
    url.hash = "";
    url.search = "";
    return url;
  } catch {
    return null;
  }
}

function productImages(product = {}, html = "", pageUrl) {
  const raw = (Array.isArray(product.images) ? product.images : [])
    .flatMap((image) => [image?.src, image?.thumbnail])
    .filter(Boolean);
  const source = mainHtml(html).split(/<section\b[^>]*class\s*=\s*["'][^"']*(?:featured-journal-posts|related-posts)/i)[0];
  const attributePattern = /\b(?:data-large_image|data-large-image|data-src|src|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  for (const match of source.matchAll(attributePattern)) raw.push(match[1] || match[2]);
  const srcsetPattern = /\bsrcset\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  for (const match of source.matchAll(srcsetPattern)) {
    String(match[1] || match[2] || "").split(",").forEach((candidate) => raw.push(candidate.trim().split(/\s+/)[0]));
  }
  const images = new Map();
  raw.forEach((candidate) => {
    const url = normalizedImageUrl(candidate, pageUrl);
    if (!url) return;
    const key = url.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)$)/i, "").toLowerCase();
    const size = url.pathname.match(/-(\d{2,4})x(\d{2,4})(?=\.(?:jpe?g|png|webp)$)/i);
    const score = size ? Number(size[1]) * Number(size[2]) : Number.MAX_SAFE_INTEGER;
    const current = images.get(key);
    if (!current || score > current.score) images.set(key, { score, url: url.toString() });
  });
  return [...images.values()].map(({ url }) => url);
}

function safeImageExtension(url = "") {
  const extension = extname(new URL(url).pathname).toLowerCase();
  return extension === ".jpeg" ? ".jpg" : ([".jpg", ".png", ".webp"].includes(extension) ? extension : ".jpg");
}

function productDescription(product = {}, html = "") {
  const raw = plainText(product.short_description || product.description || "");
  if (raw) return raw.slice(0, 1200);
  const match = String(html || "").match(/<meta\b[^>]*name=["']description["'][^>]*content=(?:"([^"]*)"|'([^']*)')/i);
  return decodeHtml(match?.[1] || match?.[2] || "").trim().slice(0, 1200);
}

function productName(product = {}, html = "") {
  const heading = pageHeading(html);
  const handle = String(product.slug || "").trim().toLowerCase();
  const series = handle.match(/^(aero|expedition|racing|backcountry|city)-/)?.[1] || "";
  const headingWithSeries = heading && series && !heading.toLowerCase().startsWith(`${series} `)
    ? `${series[0].toUpperCase()}${series.slice(1)} ${heading}`
    : heading;
  const fallback = metaContent(html, "og:title").split("|")[0].replace(/\s*[–-]\s*Apidura\s*$/i, "").trim();
  const recordName = plainText(product.name || "");
  return recordName && recordName !== String(product.slug || "").replaceAll("-", " ")
    ? recordName
    : headingWithSeries || fallback;
}

function productSku(product = {}, html = "") {
  const recordSku = String(product.sku || "").trim();
  if (recordSku) return recordSku;
  return pageText(html).match(/\b[A-Z]{2,5}\d?-\d{4}-\d{3}\b/)?.[0] || "";
}

function variantRows(volumes, weights, sku, mounting, available) {
  const normalizedVolumes = volumes.length ? volumes : [0];
  const alignedWeights = weights.length === normalizedVolumes.length ? weights : [];
  return normalizedVolumes.map((volume, index) => ({
    sku: normalizedVolumes.length > 1 && sku ? `${sku}-${String(volume).replace(".", "-")}L` : sku,
    title: volume ? `${volume} L` : "Manufacturer model",
    color: "",
    volume,
    weight: alignedWeights[index] || 0,
    mounting,
    available,
  }));
}

export function buildApiduraCatalogEntry({ product = {}, html = "", sourceUrl = "", checkedAt = "" } = {}) {
  const url = normalizedProductUrl(sourceUrl || product.permalink || `/shop/${product.slug || ""}/`);
  if (!url) throw new Error(`Unsupported Apidura product URL: ${sourceUrl || product.permalink || "missing"}`);
  const handle = String(product.slug || url.pathname.split("/").filter(Boolean).at(-1) || "").trim().toLowerCase();
  const name = productName(product, html);
  if (!name) throw new Error(`Missing Apidura product name: ${url}`);
  const category = categoryForProduct({ ...product, name, slug: handle });
  const meta = CATEGORY_META[category];
  const { volumes, weights } = productMetrics({ ...product, name }, html);
  const images = productImages(product, html, url);
  if (!images.length) throw new Error(`Missing Apidura product images: ${url}`);
  const imageAssetPaths = images.map((imageUrl, index) =>
    `assets/manufacturer-catalog/apidura/${handle}${index ? `-${index + 1}` : ""}${safeImageExtension(imageUrl)}`
  );
  const sku = productSku(product, html);
  const available = product.is_in_stock !== false;
  const variants = variantRows(volumes, weights, sku, meta.mounting, available);
  const volumeSummary = volumes.length ? `${volumes.join(" / ")} L` : "";
  const details = technicalDetailsText(html).slice(0, 5000);
  const description = productDescription(product, html);
  const waterproof = /(?:100\s*%\s*)?waterproof|seam welded|watertight seams/i.test(details) ? "Waterproof" : "";
  return {
    id: `apidura-${handle}`,
    sourceProductId: `apidura-${handle}`,
    brand: "Apidura",
    provider: "apidura.com",
    family: meta.family,
    category,
    name,
    variant: `${volumeSummary || "Manufacturer model"} · ${variants.length} size option${variants.length === 1 ? "" : "s"}`,
    sku,
    weight: weights[0] || 0,
    weightOptions: weights,
    volume: volumes[0] || 0,
    volumeOptions: volumes,
    ...(volumes.length > 1 ? { volumeMin: volumes[0], volumeMax: volumes.at(-1) } : {}),
    loadKg: 0,
    dimensions: {},
    color: "",
    waterproof,
    material: /Expedition Grade Fabric/i.test(details) ? "Expedition Grade Fabric" : "Apidura technical laminate",
    mounting: meta.mounting,
    mountingOptions: [meta.mounting],
    soldAsSet: false,
    available,
    variantCount: variants.length,
    availableVariantCount: available ? variants.length : 0,
    variantWeightsAuthoritative: variants.every(({ weight }) => Number(weight) > 0),
    variants,
    imageAssetPath: imageAssetPaths[0],
    imageAssetPaths,
    sourceImageUrl: images[0],
    sourceImageUrls: images,
    sourceUrl: url.toString(),
    sourceCheckedAt: checkedAt,
    manufacturerDetails: details,
    description: {
      en: description || `${name} is an Apidura ${meta.en}. Technical data is normalized from the official product page.`,
      ru: `${meta.ru[0].toLocaleUpperCase()}${meta.ru.slice(1)} Apidura${volumeSummary ? ` объёмом ${volumeSummary}` : ""}. Характеристики нормализованы по официальной карточке товара.`,
    },
    aliases: [...new Set(["Apidura", meta.en, meta.ru, handle.replaceAll("-", " "), name])],
  };
}
