import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const decode = (value = "") => String(value).replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#039;", "'");
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1], decode(m[2] ?? m[3])]));
export function topeakVariantOptions(html) {
  const options = [];
  for (const match of String(html).matchAll(/<li\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (!/\bsize-option\b/.test(a.class || "") || !a["data-mod-id"]) continue;
    options.push({ modelId: a["data-mod-id"], size: a["data-size"] || "-", color: a["data-color"] || "-" });
  }
  if (!options.length) for (const match of String(html).matchAll(/<li\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (/\bcolor-option\b/.test(a.class || "") && a["data-mod-id"]) options.push({ modelId: a["data-mod-id"], size: "-", color: a["data-color"] || "-" });
  }
  return [...new Map(options.map(o => [o.modelId, o])).values()];
}
export function topeakVariantEvidence(data, option, sourceUrl) {
  if (String(data.model_id) !== String(option.modelId) || String(data.size || "-") !== option.size || String(data.color || "-") !== option.color || !data.id) {
    throw new Error(`Topeak returned a different variant for model ${option.modelId}`);
  }
  const images = [];
  for (const tag of String(data.left_img || "").matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(tag[0]);
    for (const name of ["data-src", "src"]) {
      if (!a[name]) continue;
      const url = new URL(a[name], sourceUrl);
      if (url.hostname !== "www.topeak.com" || !url.pathname.startsWith("/storage/app/media/") || !/\.(?:png|jpe?g|webp)$/i.test(url.pathname)) continue;
      images.push(url.href);
    }
  }
  const sourceImageUrls = [...new Set(images)];
  if (!sourceImageUrls.length) throw new Error(`Topeak returned no gallery for model ${option.modelId}`);
  return { sku: `TOPEAK-${option.modelId}`, manufacturerSku: String(data.id), size: option.size, color: option.color, sourceUrl, sourceImageUrls };
}
export async function collectTopeakVariantEvidence({ html, sourceUrl, requestVariant, existing = [], onProgress = async () => {} }) {
  const productId = String(html).match(/var\s+product_id\s*=\s*(\d+)/)?.[1];
  if (!productId) throw new Error("Missing Topeak product ID");
  const evidence = [];
  for (const option of topeakVariantOptions(html)) {
    const saved = existing.find(e => e.sku === `TOPEAK-${option.modelId}` && e.size === option.size && e.color === option.color && e.sourceImageUrls?.length);
    const row = saved || topeakVariantEvidence(await requestVariant({ productId, ...option }), option, sourceUrl);
    evidence.push(row);
    await onProgress(evidence);
  }
  return evidence;
}
async function curl(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "C:/Windows/System32/curl.exe" : "curl", ["--fail-with-body", "--silent", "--show-error", "--max-time", "60", ...args], { windowsHide: true });
    const out = [], err = [];
    child.stdout.on("data", b => out.push(b)); child.stderr.on("data", b => err.push(b));
    child.on("error", reject);
    child.on("close", code => code ? reject(new Error(`Topeak request failed (${code}): ${Buffer.concat(err).toString().slice(0,200)}`)) : resolve(Buffer.concat(out).toString()));
  });
}
export async function fetchTopeakVariantEvidence({ sourceUrl, existing = [], onProgress }) {
  const url = new URL(sourceUrl);
  if (url.origin !== "https://www.topeak.com" || !url.pathname.startsWith("/global/en/product/")) throw new Error("Unsupported Topeak source");
  const dir = await mkdtemp(join(tmpdir(), "catalog-topeak-"));
  try {
    const cookie = join(dir, "cookies.txt");
    const html = await curl(["--location", "-c", cookie, sourceUrl]);
    const token = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => attrs(m[0])).find(a => a.name === "_token")?.content;
    if (!token) throw new Error("Missing Topeak page session");
    return await collectTopeakVariantEvidence({ html, sourceUrl, existing, onProgress, requestVariant: async ({ productId, size, color }) => JSON.parse(await curl([
      "-b", cookie, "-H", `X-CSRF-TOKEN: ${token}`, "-H", "X-Requested-With: XMLHttpRequest", "-H", `Referer: ${sourceUrl}`,
      "--data-urlencode", `pid=${productId}`, "--data-urlencode", `size=${size}`, "--data-urlencode", `color=${color}`,
      "https://www.topeak.com/global/en/products/product/onChangeSizeColor",
    ])) });
  } finally { await rm(dir, { recursive: true, force: true }); }
}
