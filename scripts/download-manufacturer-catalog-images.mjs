import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const manifestPath = resolve(args.get("--manifest") || "manufacturer-catalog-images.json");
const outputRoot = resolve(args.get("--root") || ".");
const concurrency = Math.max(1, Math.min(12, Number(args.get("--concurrency")) || 6));
const requestedManufacturers = new Set(String(args.get("--manufacturers") || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean));
const manifest = JSON.parse(await readFile(manifestPath, "utf8")).filter((item) => {
  if (!requestedManufacturers.size) return true;
  const manufacturerId = String(item?.output || "").replaceAll("\\", "/").split("/")[2]?.toLowerCase() || "";
  return requestedManufacturers.has(manufacturerId);
});
if (requestedManufacturers.size && !manifest.length) {
  throw new Error(`No catalog images found for: ${[...requestedManufacturers].join(", ")}`);
}

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
let attempted = 0;
const failures = [];
await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
  while (queue.length) {
    const item = queue.shift();
    try {
      await writeImage(item);
      completed += 1;
    } catch (error) {
      failures.push({
        output: String(item?.output || ""),
        url: String(item?.url || ""),
        error: String(error?.message || error || "image request failed"),
      });
    } finally {
      attempted += 1;
    }
    if (attempted % 50 === 0 || attempted === manifest.length) {
      process.stdout.write(`Processed ${attempted}/${manifest.length} manufacturer catalog images (${completed} downloaded, ${failures.length} unavailable)\n`);
    }
  }
}));

const manufacturerCounts = new Map();
for (const item of manifest) {
  const manufacturerId = String(item?.output || "").replaceAll("\\", "/").split("/")[2] || "unknown";
  const counts = manufacturerCounts.get(manufacturerId) || { requested: 0, unavailable: 0 };
  counts.requested += 1;
  manufacturerCounts.set(manufacturerId, counts);
}
for (const failure of failures) {
  const manufacturerId = failure.output.replaceAll("\\", "/").split("/")[2] || "unknown";
  const counts = manufacturerCounts.get(manufacturerId);
  if (counts) counts.unavailable += 1;
}

const report = {
  images: completed,
  requested: manifest.length,
  unavailable: failures.length,
  manufacturers: Object.fromEntries([...manufacturerCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
  failures,
};
await mkdir(outputRoot, { recursive: true });
const reportPath = resolve(outputRoot, "manufacturer-catalog-image-download.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const unavailableShare = manifest.length ? failures.length / manifest.length : 1;
const emptyManufacturers = [...manufacturerCounts.entries()]
  .filter(([, counts]) => counts.requested > 0 && counts.unavailable === counts.requested)
  .map(([manufacturerId]) => manufacturerId);
if (!completed || unavailableShare > 0.05 || emptyManufacturers.length) {
  throw new Error(`Official image snapshot is incomplete beyond the allowed tolerance: ${failures.length}/${manifest.length} unavailable${emptyManufacturers.length ? `; no images for ${emptyManufacturers.join(", ")}` : ""}. See ${reportPath}`);
}
if (failures.length) {
  process.stderr.write(`Warning: ${failures.length}/${manifest.length} official images were temporarily unavailable; details are recorded in ${reportPath}\n`);
}
process.stdout.write(`${JSON.stringify({ images: completed, unavailable: failures.length, outputRoot, reportPath })}\n`);
