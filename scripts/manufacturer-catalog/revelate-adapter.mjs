import { extname } from "node:path";

const CATEGORY_BY_HANDLE = Object.freeze({
  alpinedopp: "shoulder-waist",
  "b-a-t": "shoulder-waist",
  "denali-action-tote": "shoulder-waist",
  "skedaddle-bag": "shoulder-waist",
  toolcash: "shoulder-waist",
  burrote: "rack-top",
  "joey-downtube-bag": "fork",
  nanopanniers: "pannier",
  polecat: "fork",
  "portage-panniers": "pannier",
  "rohn-rack-bag": "rack-top",
  "ultra-joey-downtube-bag": "fork",
  "extended-play": "top-tube",
  gastank: "top-tube",
  jerrycan: "top-tube",
  "mag-tank": "top-tube",
  "mag-tank-fasttrack": "top-tube",
  magtank: "top-tube",
  magtank2000: "top-tube",
  mountainfeedbag: "handlebar",
  speedbag: "top-tube",
  campamocha: "handlebar",
  "egress-pocket": "handlebar",
  pitchfork: "handlebar",
  pronghorn: "handlebar",
  saltyroll: "handlebar",
  "scrambler-pocket": "handlebar",
  sweetroll: "handlebar",
  choss: "frame",
  cranny: "frame",
  hopper: "frame",
  nook: "frame",
  ranger: "frame",
  rifter: "frame",
  ripio: "frame",
  sandur: "frame",
  tangleframebag: "frame",
  shrew: "saddle",
  spinelock10: "saddle",
  spinelock16: "saddle",
  stoat: "saddle",
  terrapin8l: "saddle",
  terrapinsystem14l: "saddle",
  "ultra-shrew": "saddle",
});

const PAIR_HANDLES = new Set(["nanopanniers", "portage-panniers"]);

const CATEGORY_META = Object.freeze({
  saddle: { family: "bikepacking", en: "saddle bag", ru: "подседельная сумка", mounting: "Saddle rails / seatpost straps", aliases: ["seat bag", "saddle bag", "подседельная", "седельная"] },
  handlebar: { family: "bikepacking", en: "handlebar bag", ru: "рулевая сумка", mounting: "Handlebar / stem straps or dedicated harness", aliases: ["handlebar bag", "bar bag", "stem bag", "рулевая", "на руль"] },
  frame: { family: "bikepacking", en: "frame bag", ru: "нарамная сумка", mounting: "Frame straps", aliases: ["frame bag", "нарамная", "в раму", "рамная"] },
  "top-tube": { family: "bikepacking", en: "top-tube bag", ru: "сумка на верхнюю трубу", mounting: "Top-tube straps / direct mount", aliases: ["top tube", "cockpit bag", "на верхнюю трубу", "бензобак"] },
  fork: { family: "bikepacking", en: "fork or down-tube bag", ru: "сумка на вилку или нижнюю трубу", mounting: "Cargo cage / frame straps", aliases: ["fork bag", "downtube bag", "cargo bag", "на вилку", "на нижнюю трубу"] },
  pannier: { family: "panniers", en: "pannier", ru: "панир", mounting: "Rack hooks / straps", aliases: ["pannier", "rack pannier", "панир"] },
  "rack-top": { family: "panniers", en: "rack-top bag", ru: "сумка на багажник", mounting: "Rack straps", aliases: ["rack top", "rack bag", "сумка на багажник", "багажная сумка"] },
  "shoulder-waist": { family: "carry", en: "portable bag or pouch", ru: "переносная сумка или чехол", mounting: "Carry handles / packed organizer", aliases: ["tote", "pouch", "organizer", "переносная", "чехол", "органайзер"] },
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
    .replace(/&reg;|&#174;/gi, "®")
    .replace(/&trade;|&#8482;/gi, "™")
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

function normalizedProductUrl(rawUrl, baseUrl = "https://revelatedesigns.com/product-chart/") {
  try {
    const url = new URL(decodeHtml(rawUrl), baseUrl);
    if (!/(^|\.)revelatedesigns\.com$/i.test(url.hostname)) return null;
    if (!/^\/product\/[a-z0-9-]+\/?$/i.test(url.pathname)) return null;
    url.hostname = "revelatedesigns.com";
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
  } catch {
    return null;
  }
}

function handleFromUrl(url) {
  return url.pathname.split("/").filter(Boolean).at(-1)?.toLowerCase() || "";
}

export function revelateCatalogTargets(indexHtml = "", { baseUrl = "https://revelatedesigns.com/product-chart/" } = {}) {
  if (/\.well-known\/cf-chl|challenge-platform|Just a moment/i.test(indexHtml) && !/\/product\//i.test(indexHtml)) {
    throw new Error("Revelate Designs returned an anti-bot challenge instead of the official product chart");
  }
  const targets = new Map();
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  for (const match of String(indexHtml || "").matchAll(hrefPattern)) {
    const url = normalizedProductUrl(match[1] || match[2] || match[3], baseUrl);
    if (!url) continue;
    const handle = handleFromUrl(url);
    const category = CATEGORY_BY_HANDLE[handle];
    if (!category) continue;
    targets.set(handle, { handle, category, url: url.toString() });
  }
  return [...targets.values()].sort((left, right) => left.handle.localeCompare(right.handle));
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

function productName(html = "") {
  const heading = String(html || "").match(/<h1\b[^>]*class\s*=\s*["'][^"']*product_title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || metaContent(html, "og:title");
  return plainText(heading).replace(/\s*[|–-]\s*Revelate Designs\s*$/i, "").trim();
}

export function revelateProductPageIsValid(html = "") {
  return Boolean(productName(html));
}

function productSku(html = "") {
  const sku = String(html || "").match(/<span\b[^>]*class\s*=\s*["'][^"']*\bsku\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const normalized = plainText(sku || "");
  return /^N\/?A$/i.test(normalized) ? "" : normalized;
}

function tabHtml(html = "", id = "") {
  const startPattern = new RegExp(`<div\\b[^>]*id\\s*=\\s*["']${id}["'][^>]*>`, "i");
  const match = startPattern.exec(String(html || ""));
  if (!match) return "";
  const source = String(html).slice((match.index || 0) + match[0].length);
  const end = source.search(/<div\b[^>]*id\s*=\s*["']tab-title-(?:description|dimensions|specifications|reviews)["']/i);
  return end >= 0 ? source.slice(0, end) : source.slice(0, 30_000);
}

function uniqueNumbers(values = []) {
  return [...new Set(values.map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))];
}

function metricRows(specifications = "") {
  const text = plainText(specifications);
  const rows = [];
  const pattern = /(?:^|\n)([^\n]{0,70})\n(\d+(?:[.,]\d+)?)\s*g\b(?:[^\n]*\n){0,2}?[^\n]*?(\d+(?:[.,]\d+)?|[.,]\d+)\s*L\b/gi;
  for (const match of text.matchAll(pattern)) {
    const label = String(match[1] || "").replace(/^(?:Weight \(g\)|Volume \(L\))$/i, "").trim();
    rows.push({ label, weight: Number(match[2].replace(",", ".")), volume: Number(match[3].replace(",", ".")) });
  }
  if (rows.length) return rows;
  const volumes = uniqueNumbers([...text.matchAll(/(\d+(?:[.,]\d+)?|[.,]\d+)\s*L\b/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => value <= 100));
  const weights = uniqueNumbers([...text.matchAll(/(\d+(?:[.,]\d+)?)\s*g\b/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => value >= 20 && value < 10_000));
  return (volumes.length ? volumes : [0]).map((volume, index) => ({ label: "", volume, weight: weights[index] || (weights.length === 1 ? weights[0] : 0) }));
}

function parseVariations(html = "") {
  const encoded = String(html || "").match(/\bdata-product_variations\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(decodeHtml(encoded[1] || encoded[2] || ""));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizedChoice(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function rowForVariation(rows, variation, index, variationCount) {
  if (rows.length === 1) return rows[0];
  const choice = Object.values(variation?.attributes || {}).map(normalizedChoice).filter(Boolean);
  const display = normalizedChoice(variation?.display_name || "");
  return rows.find(({ label }) => {
    const normalized = normalizedChoice(label);
    return normalized && (choice.some((value) => value === normalized || value.includes(normalized) || normalized.includes(value)) || display.includes(normalized));
  }) || (rows.length === variationCount ? rows[index] : null);
}

function productVariants(html, rows, mounting) {
  const variations = parseVariations(html);
  if (!variations.length) {
    return rows.map((row) => ({
      sku: productSku(html),
      title: row.label || (row.volume ? `${row.volume} L` : "Manufacturer model"),
      color: "",
      volume: row.volume || 0,
      weight: row.weight || 0,
      mounting,
      available: !/class\s*=\s*["'][^"']*out-of-stock/i.test(html),
    }));
  }
  return variations.filter((variation) => variation?.variation_is_visible !== false).map((variation, index) => {
    const row = rowForVariation(rows, variation, index, variations.length) || rows[0] || {};
    const choices = Object.values(variation.attributes || {}).map((value) => decodeHtml(value).replaceAll("-", " ")).filter(Boolean);
    const title = choices.join(" / ") || plainText(variation.display_name || "") || "Manufacturer model";
    const sizeWords = new Set(["xs", "sm", "md", "lg", "xl", "small", "medium", "large"]);
    const color = choices.find((value) => !sizeWords.has(value.toLowerCase()) && !/^(?:\d+(?:[.,]\d+)?\s*(?:l|in)|regular|bent)$/i.test(value)) || "";
    return {
      sku: String(variation.sku || "").trim(),
      title,
      color,
      volume: row.volume || 0,
      weight: row.weight || 0,
      mounting,
      available: variation.is_in_stock !== false && variation.variation_is_active !== false,
    };
  });
}

function normalizedImageUrl(rawUrl, pageUrl) {
  try {
    const url = new URL(decodeHtml(rawUrl), pageUrl);
    if (!/(^|\.)revelatedesigns\.com$/i.test(url.hostname)) return null;
    if (!/\/wp-content\/uploads\//i.test(url.pathname) || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null;
    url.hostname = "revelatedesigns.com";
    url.hash = "";
    url.search = "";
    return url;
  } catch {
    return null;
  }
}

function productImages(html = "", pageUrl) {
  const galleryStart = String(html).search(/<div\b[^>]*class\s*=\s*["'][^"']*iconic-woothumbs-images(?:\s|["'])/i);
  const galleryRemainder = galleryStart >= 0 ? String(html).slice(galleryStart) : "";
  const galleryEnd = galleryRemainder.search(/<div\b[^>]*class\s*=\s*["'][^"']*summary\s+entry-summary/i);
  const source = galleryStart >= 0 ? (galleryEnd >= 0 ? galleryRemainder.slice(0, galleryEnd) : galleryRemainder.slice(0, 100_000)) : "";
  const raw = [];
  for (const match of source.matchAll(/\b(?:data-large_image|data-lazy|src)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) raw.push(match[1] || match[2]);
  if (!raw.length) raw.push(metaContent(html, "og:image"));
  const images = new Map();
  raw.forEach((candidate) => {
    const url = normalizedImageUrl(candidate, pageUrl);
    if (!url || /^data:/i.test(candidate)) return;
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

function materialFromSpecs(specifications = "") {
  const text = plainText(specifications);
  return String(text.match(/Materials?:\s*([\s\S]{3,800})/i)?.[1] || "").split(/\n(?:Reviews?|Image:|YouTube)\b/i)[0].trim()
    || "Revelate Designs technical fabric";
}

function dimensionsFromTab(dimensions = "") {
  const text = plainText(dimensions);
  const value = (labels) => {
    for (const label of labels) {
      const match = text.match(new RegExp(`${label}[^\\n]{0,80}?(\\d+(?:[.,]\\d+)?)\\s*(mm|cm)\\b`, "i"));
      if (match) return Math.round((Number(match[1].replace(",", ".")) * (match[2].toLowerCase() === "mm" ? 0.1 : 1)) * 10) / 10;
    }
    return 0;
  };
  return Object.fromEntries(Object.entries({
    width: value(["(?:Top |Max )?length \\(L\\)", "Length \\(L\\)", "\\bA\\b"]),
    height: value(["(?:Bag |Max )?height \\(H\\)", "Height", "\\bB\\b"]),
    depth: value(["Width \\(W\\)", "Depth", "\\bC\\b"]),
  }).filter(([, number]) => number > 0));
}

export function buildRevelateCatalogEntry({ html = "", sourceUrl = "", checkedAt = "" } = {}) {
  const url = normalizedProductUrl(sourceUrl);
  if (!url) throw new Error(`Unsupported Revelate Designs product URL: ${sourceUrl || "missing"}`);
  const handle = handleFromUrl(url);
  const category = CATEGORY_BY_HANDLE[handle];
  const meta = CATEGORY_META[category];
  if (!meta) throw new Error(`Unsupported Revelate Designs product category: ${handle}`);
  const name = productName(html);
  if (!name) throw new Error(`Missing Revelate Designs product name: ${url}`);
  const descriptionHtml = tabHtml(html, "tab-title-description");
  const dimensionsHtml = tabHtml(html, "tab-title-dimensions");
  const specificationsHtml = tabHtml(html, "tab-title-specifications");
  const rows = metricRows(specificationsHtml);
  const specificationsText = plainText(specificationsHtml);
  if (["terrapin8l", "terrapinsystem14l"].includes(handle) && rows.length === 1) {
    const metricSection = specificationsText.split(/Weight \(g\)/i).at(-1)?.split(/Materials?:/i)[0] || "";
    const componentWeights = uniqueNumbers([...metricSection.matchAll(/(\d+(?:[.,]\d+)?)\s*g\b/gi)]
      .map((match) => Number(match[1].replace(",", "."))));
    if (componentWeights.length >= 2) rows[0].weight = componentWeights[0] + componentWeights[1];
  }
  const rohnVolumeRange = handle === "rohn-rack-bag"
    ? specificationsText.match(/Max\s+(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)\s*L\b/i)
    : null;
  if (rohnVolumeRange && rows.length) rows[0].volume = Number(rohnVolumeRange[1].replace(",", "."));
  const variants = productVariants(html, rows, meta.mounting);
  const availableVariants = variants.filter(({ available }) => available);
  const volumes = rohnVolumeRange
    ? [Number(rohnVolumeRange[1].replace(",", ".")), Number(rohnVolumeRange[2].replace(",", "."))]
    : uniqueNumbers(variants.map(({ volume }) => volume));
  const weights = uniqueNumbers(variants.map(({ weight }) => weight));
  const images = productImages(html, url);
  if (!images.length) throw new Error(`Missing Revelate Designs product images: ${url}`);
  const imageAssetPaths = images.map((imageUrl, index) =>
    `assets/manufacturer-catalog/revelate-designs/${handle}${index ? `-${index + 1}` : ""}${safeImageExtension(imageUrl)}`
  );
  const soldAsSet = PAIR_HANDLES.has(handle);
  const volumeSummary = volumes.length ? `${volumes.join(" / ")} L` : "";
  const metaDescription = metaContent(html, "description");
  const description = plainText(descriptionHtml) || metaDescription;
  const details = [plainText(descriptionHtml), plainText(dimensionsHtml), plainText(specificationsHtml)].filter(Boolean).join("\n\n").slice(0, 5000);
  const waterproofEvidence = `${metaDescription} ${description} ${details}`;
  const waterproof = /\bwaterproof\b|welded waterproof|waterproof seams/i.test(waterproofEvidence) ? "Waterproof"
    : /water resistant|weather resistant/i.test(waterproofEvidence) ? "Water resistant" : "";
  const primaryVariant = availableVariants[0] || variants[0] || {};
  const pairFields = soldAsSet && volumes.length ? {
    specificationBasis: "per-bag",
    setQuantity: 2,
    volumePerBag: volumes[0],
    volumePerBagOptions: volumes,
    totalVolume: volumes[0] * 2,
    totalVolumeOptions: volumes.map((volume) => volume * 2),
    weightPerBag: weights[0] ? weights[0] / 2 : 0,
    weightPerBagOptions: weights.map((weight) => weight / 2),
    totalWeight: weights[0] || 0,
    totalWeightOptions: weights,
  } : {};
  return {
    id: `revelate-designs-${handle}`,
    sourceProductId: `revelate-designs-${handle}`,
    manufacturerId: "revelate-designs",
    brand: "Revelate Designs",
    provider: "revelatedesigns.com",
    family: meta.family,
    category,
    name,
    variant: `${volumeSummary || "Manufacturer model"} · ${variants.length} SKU`,
    sku: primaryVariant.sku || productSku(html),
    weight: weights[0] || 0,
    weightOptions: weights,
    volume: volumes[0] || 0,
    volumeOptions: volumes,
    ...(volumes.length > 1 ? { volumeMin: volumes[0], volumeMax: volumes.at(-1) } : {}),
    ...pairFields,
    loadKg: 0,
    dimensions: dimensionsFromTab(dimensionsHtml),
    color: primaryVariant.color || "",
    waterproof,
    material: materialFromSpecs(specificationsHtml),
    mounting: meta.mounting,
    mountingOptions: [meta.mounting],
    soldAsSet,
    available: availableVariants.length > 0,
    variantCount: variants.length,
    availableVariantCount: availableVariants.length,
    variantWeightsAuthoritative: rows.some(({ weight }) => weight > 0),
    variants,
    imageAssetPath: imageAssetPaths[0],
    imageAssetPaths,
    sourceImageUrl: images[0],
    sourceImageUrls: images,
    sourceUrl: url.toString(),
    sourceCheckedAt: checkedAt,
    manufacturerDetails: details,
    description: {
      en: description.slice(0, 1200) || `${name} is a Revelate Designs ${meta.en}. Specifications are from the manufacturer's official product page.`,
      ru: `${meta.ru[0].toLocaleUpperCase()}${meta.ru.slice(1)} Revelate Designs${volumeSummary ? ` объёмом ${volumeSummary}` : ""}. Характеристики взяты с официальной страницы производителя.`,
    },
    aliases: [...new Set(["Revelate Designs", meta.en, meta.ru, ...meta.aliases, handle.replaceAll("-", " "), name])],
  };
}
