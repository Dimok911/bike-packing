import { extname } from "node:path";

const CATEGORY_META = Object.freeze({
  saddle: {
    family: "bikepacking",
    en: "saddle bag",
    ru: "подседельная сумка",
    mounting: "Saddle rails / seatpost straps",
    aliases: ["seat bag", "saddle bag", "подседельная", "седельная"],
  },
  handlebar: {
    family: "bikepacking",
    en: "handlebar bag",
    ru: "рулевая сумка",
    mounting: "Handlebar straps",
    aliases: ["handlebar bag", "bar bag", "food pouch", "рулевая", "на руль", "кормушка"],
  },
  frame: {
    family: "bikepacking",
    en: "frame bag",
    ru: "нарамная сумка",
    mounting: "Frame straps",
    aliases: ["frame bag", "нарамная", "в раму", "рамная"],
  },
  "top-tube": {
    family: "bikepacking",
    en: "top-tube bag",
    ru: "сумка на верхнюю трубу",
    mounting: "Top-tube straps / direct mount",
    aliases: ["top tube", "toptube", "bolt-on", "на верхнюю трубу", "бензобак"],
  },
  fork: {
    family: "bikepacking",
    en: "fork bag",
    ru: "сумка на вилку",
    mounting: "Fork mount / straps",
    aliases: ["fork bag", "cargo cage", "на вилку", "вилочная"],
  },
});

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&times;/gi, "×")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#39;|&apos;/gi, "'")
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

function categoryForHandle(handle = "") {
  const value = String(handle).toLowerCase();
  if (/^top-tube-bag-/.test(value)) return "top-tube";
  if (/^(?:full-)?frame-bag-/.test(value)) return "frame";
  if (/^saddle-bag-/.test(value)) return "saddle";
  if (/^fork-bag-/.test(value)) return "fork";
  if (/^(?:handle-bar-|food-pouch-)/.test(value)) return "handlebar";
  return "";
}

function productSchema(html = "") {
  for (const match of String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      if (!/^CYCLITE$/i.test(String(parsed?.brand?.name || ""))) continue;
      if (parsed?.["@type"] === "ProductGroup") return parsed;
      if (parsed?.["@type"] === "Product") return {
        ...parsed,
        productGroupID: String(parsed?.["@id"] || "").split("#")[0],
        hasVariant: [parsed],
      };
    } catch {}
  }
  return null;
}

function technicalText(html = "") {
  const text = plainText(html);
  const start = text.search(/\bTechnical Specifications\b/i);
  if (start < 0) return "";
  const tail = text.slice(start);
  const end = tail.search(/\n(?:Scope of Delivery|Lieferumfang|Shipping|Versand)\b/i);
  return tail.slice(0, end > 0 ? end : 2500).trim();
}

function productDetails(html = "") {
  const text = plainText(html);
  const start = text.search(/\b(?:Description|Beschreibung)\b/i);
  if (start < 0) return technicalText(html);
  const tail = text.slice(start);
  const end = tail.search(/\n(?:Shipping|Versand)\b/i);
  return tail.slice(0, end > 0 ? end : 6000).trim();
}

function productVolumes(technical = "", html = "") {
  const direct = uniqueNumbers([...technical.matchAll(/\bVolume\s*:\s*(\d+(?:[.,]\d+)?)\s*l\b/gi)]
    .map((match) => Number(match[1].replace(",", "."))));
  if (direct.length) return direct;
  const description = String(html).match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
  return uniqueNumbers([...decodeHtml(description).matchAll(/(\d+(?:[.,]\d+)?)\s*l\b/gi)]
    .map((match) => Number(match[1].replace(",", "."))));
}

function productWeights(technical = "", html = "") {
  const weightLine = technical.match(/\bWeight\s*:\s*([^\n]+)/i)?.[1] || "";
  const direct = uniqueNumbers([...weightLine.matchAll(/(\d+(?:[.,]\d+)?)\s*g\b/gi)]
    .map((match) => Number(match[1].replace(",", "."))));
  if (direct.length) return direct;
  const description = String(html).match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
  return uniqueNumbers([...decodeHtml(description).matchAll(/(\d+(?:[.,]\d+)?)\s*g\b/gi)]
    .map((match) => Number(match[1].replace(",", "."))));
}

function productDimensions(technical = "") {
  const match = technical.match(/\bSize\s*:\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (!match) return {};
  return {
    lengthCm: Number(match[1].replace(",", ".")),
    widthCm: Number(match[2].replace(",", ".")),
    heightCm: Number(match[3].replace(",", ".")),
  };
}

function productMaterial(details = "") {
  const match = details.match(/\bMaterial\s+([\s\S]*?)(?:\nTechnical Specifications\b|\nScope of Delivery\b|\nLieferumfang\b|\nShipping\b|\nVersand\b)/i);
  return String(match?.[1] || "CYCLITE LiteGrid technical fabric").trim().slice(0, 600);
}

function safeImageExtension(url = "") {
  const extension = extname(new URL(url).pathname).toLowerCase();
  return extension === ".jpeg" ? ".jpg" : ([".jpg", ".png", ".webp"].includes(extension) ? extension : ".jpg");
}

function productImages(html = "") {
  const gallery = String(html).match(/<media-gallery\b[\s\S]*?<\/media-gallery>/i)?.[0] || "";
  const images = new Map();
  for (const match of gallery.matchAll(/\b(?:src|data-src)=["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)) {
    const raw = decodeHtml(match[1]);
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw, "https://cyclite.cc/");
    if (!/(?:^|\.)cyclite\.cc$/i.test(url.hostname) && !/(?:^|\.)shopify\.com$/i.test(url.hostname)) continue;
    if (/-qr\.(?:png|jpe?g|webp)$/i.test(url.pathname)) continue;
    url.protocol = "https:";
    url.searchParams.set("width", "900");
    const key = url.pathname.toLowerCase();
    if (!images.has(key)) images.set(key, url.toString());
  }
  return [...images.values()];
}

function compactVariants(schema = {}, name = "", volume = 0, weight = 0, mounting = "") {
  const source = Array.isArray(schema.hasVariant) && schema.hasVariant.length ? schema.hasVariant : [{}];
  return source.map((variant) => {
    const variantName = plainText(variant.name || "");
    const option = variantName.startsWith(`${name} - `) ? variantName.slice(name.length + 3) : (variantName === name ? "" : variantName);
    const forkPair = /^FORK BAG\b/i.test(name) && /\bset\b/i.test(option);
    const forkUnit = /^FORK BAG\b/i.test(name) && !forkPair;
    const color = option.replace(/\s*\/\s*(?:left|right|set)\s*$/i, "");
    return {
      sku: String(variant.sku || ""),
      title: forkPair ? `pair · ${option}` : forkUnit ? `unit · ${option}` : (option || "Manufacturer model"),
      color,
      volume,
      weight: forkPair ? weight * 2 : weight,
      mounting,
      available: !/OutOfStock$/i.test(String(variant?.offers?.availability || "")),
    };
  });
}

export function cycliteCatalogTargets(html = "", { baseUrl = "https://cyclite.cc/en/collections/bikepacking-bags" } = {}) {
  const targets = new Map();
  for (const match of String(html).matchAll(/href=["']([^"']*\/products\/([a-z0-9-]+)(?:\?[^"']*)?)["']/gi)) {
    const handle = String(match[2] || "").toLowerCase();
    if (!categoryForHandle(handle)) continue;
    const url = new URL(`/en/products/${handle}`, baseUrl);
    targets.set(handle, { handle, url: url.toString() });
  }
  return [...targets.values()].sort((left, right) => left.handle.localeCompare(right.handle));
}

export function cycliteProductPageIsValid(html = "") {
  return Boolean(productSchema(html) && /<media-gallery\b/i.test(String(html)));
}

export function buildCycliteCatalogEntry({ html = "", sourceUrl = "", checkedAt = "" } = {}) {
  const url = new URL(sourceUrl || "https://cyclite.cc/en/products/unknown");
  const handle = url.pathname.match(/^\/en\/products\/([a-z0-9-]+)\/?$/i)?.[1]?.toLowerCase() || "";
  if (url.hostname !== "cyclite.cc" || !handle) throw new Error(`Unsupported CYCLITE product URL: ${sourceUrl || "missing"}`);
  const category = categoryForHandle(handle);
  const meta = CATEGORY_META[category];
  if (!meta) throw new Error(`Unsupported CYCLITE product: ${handle}`);
  const schema = productSchema(html);
  if (!schema) throw new Error(`Missing CYCLITE product data: ${url}`);
  const name = plainText(schema.name || "");
  if (!name) throw new Error(`Missing CYCLITE product name: ${url}`);
  const technical = technicalText(html);
  const details = productDetails(html);
  const volumes = productVolumes(technical, html);
  const weights = productWeights(technical, html);
  const dimensions = productDimensions(technical);
  const images = productImages(html);
  if (!images.length) throw new Error(`Missing CYCLITE product images: ${url}`);
  const imageAssetPaths = images.map((imageUrl, index) =>
    `assets/manufacturer-catalog/cyclite/${handle}${index ? `-${index + 1}` : ""}${safeImageExtension(imageUrl)}`
  );
  const variants = compactVariants(schema, name, volumes[0] || 0, weights[0] || 0, meta.mounting);
  const availableVariants = variants.filter(({ available }) => available);
  const primaryVariant = availableVariants[0] || variants[0] || {};
  const volumeSummary = volumes.length ? `${volumes.join(" / ")} L` : "";
  const waterproof = /\bweatherproof\b/i.test(`${schema.description || ""} ${details}`) ? "Weatherproof" : "";
  url.search = "";
  url.hash = "";
  return {
    id: `cyclite-${handle}`,
    sourceProductId: String(schema.productGroupID || `cyclite-${handle}`),
    manufacturerId: "cyclite",
    brand: "CYCLITE",
    provider: "cyclite.cc",
    family: meta.family,
    category,
    name,
    variant: `${volumeSummary || "Manufacturer model"} · ${variants.length} SKU`,
    sku: primaryVariant.sku || "",
    weight: weights[0] || 0,
    weightOptions: weights,
    volume: volumes[0] || 0,
    volumeOptions: volumes,
    loadKg: 0,
    dimensions,
    color: primaryVariant.color || "",
    waterproof,
    material: productMaterial(details),
    mounting: meta.mounting,
    mountingOptions: [meta.mounting],
    soldAsSet: false,
    available: availableVariants.length > 0,
    variantCount: variants.length,
    availableVariantCount: availableVariants.length,
    variantWeightsAuthoritative: weights.length > 0,
    variants,
    imageAssetPath: imageAssetPaths[0],
    imageAssetPaths,
    sourceImageUrl: images[0],
    sourceImageUrls: images,
    sourceUrl: url.toString(),
    sourceCheckedAt: checkedAt,
    manufacturerDetails: details,
    description: {
      en: `${name} is a CYCLITE ${meta.en}${volumeSummary ? ` in ${volumeSummary}` : ""}. Specifications are from the manufacturer's official product page.`,
      ru: `${meta.ru[0].toLocaleUpperCase()}${meta.ru.slice(1)} CYCLITE${volumeSummary ? ` объёмом ${volumeSummary}` : ""}. Характеристики взяты с официальной страницы производителя.`,
    },
    aliases: [...new Set(["CYCLITE", meta.en, meta.ru, ...meta.aliases, handle.replaceAll("-", " "), name])],
  };
}
