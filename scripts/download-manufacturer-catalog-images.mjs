import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const manifestPath = resolve(args.get("--manifest") || "manufacturer-catalog-images.json");
const outputRoot = resolve(args.get("--root") || ".");
const concurrency = Math.max(1, Math.min(12, Number(args.get("--concurrency")) || 6));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

async function fetchImage(url, { referer = "" } = {}, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "bike-packing-catalog-monitor/1.0 (+https://experiment.vniipo-help.ru/)",
          "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          ...(referer ? { referer } : {})
        },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = String(response.headers.get("content-type") || "").toLocaleLowerCase();
      if (!contentType.startsWith("image/")) throw new Error(`Unexpected content type: ${contentType || "missing"}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength < 1_000) throw new Error(`Image is unexpectedly small: ${bytes.byteLength} bytes`);
      return bytes;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${String(lastError?.message || lastError || "image request failed")}: ${url}`);
}

async function writeImage(item) {
  const relativePath = String(item?.output || "").replaceAll("\\", "/");
  if (!/^assets\/manufacturer-catalog\/[a-z0-9-]+\/[a-z0-9.-]+$/i.test(relativePath)) {
    throw new Error(`Unsafe catalog image output path: ${relativePath}`);
  }
  const outputPath = resolve(outputRoot, relativePath);
  if (!outputPath.startsWith(`${outputRoot}\\`) && !outputPath.startsWith(`${outputRoot}/`)) {
    throw new Error(`Catalog image output escapes the target root: ${relativePath}`);
  }
  const bytes = await fetchImage(String(item?.url || ""), { referer: String(item?.referer || "") });
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.download`;
  await writeFile(temporaryPath, bytes);
  await rm(outputPath, { force: true });
  await rename(temporaryPath, outputPath);
}

const queue = [...manifest];
let completed = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (queue.length) {
    const item = queue.shift();
    await writeImage(item);
    completed += 1;
    if (completed % 50 === 0 || completed === manifest.length) {
      process.stdout.write(`Downloaded ${completed}/${manifest.length} manufacturer catalog images\n`);
    }
  }
}));

process.stdout.write(`${JSON.stringify({ images: completed, outputRoot })}\n`);
