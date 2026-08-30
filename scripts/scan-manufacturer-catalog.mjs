import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { MANUFACTURER_BAG_CATALOG } from "../src/data/manufacturer-bag-catalog.js";
import { MANUFACTURER_CATALOG_SOURCES } from "../src/data/manufacturer-catalog-sources.js";
import { tailfinCatalogTargets } from "./manufacturer-catalog/tailfin-adapter.mjs";
import {
  buildManufacturerCatalogScanReport,
  manufacturerCatalogScanMarkdown,
  manufacturerIdForEntry,
} from "../src/data/manufacturer-catalog-scan.js";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const outputPath = resolve(args.get("--output") || "manufacturer-catalog-scan.json");
const markdownPath = resolve(args.get("--markdown") || "manufacturer-catalog-scan.md");
const requestedWorkDir = args.get("--work-dir");
const workDir = requestedWorkDir ? resolve(requestedWorkDir) : await mkdtemp(join(tmpdir(), "bike-packing-catalog-scan-"));
const pagesDir = join(workDir, ".catalog-pages");
const generatedPath = join(workDir, "manufacturer-bag-catalog.generated.mjs");
const imageManifestPath = join(workDir, "manufacturer-catalog-images.json");
const scannedAt = new Date().toISOString();
const checkedAt = scannedAt.slice(0, 10);
const errors = Object.fromEntries(MANUFACTURER_CATALOG_SOURCES.map((source) => [source.id, []]));

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "bike-packing-catalog-monitor/1.0 (+https://experiment.vniipo-help.ru/)" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`${url}: ${String(lastError?.message || lastError || "request failed")}`);
}

async function mapConcurrent(items, limit, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

async function downloadManufacturer(source) {
  await mkdir(join(pagesDir, source.id), { recursive: true });
  const products = new Map();
  for (const [fileName, url] of source.collections) {
    try {
      const fetched = await fetchText(url);
      if (source.adapter === "tailfin-html") {
        await writeFile(join(workDir, fileName), fetched, "utf8");
        tailfinCatalogTargets(fetched, { baseUrl: url }).forEach((product) => products.set(product.handle, product));
      } else {
        const parsed = JSON.parse(fetched);
        await writeFile(join(workDir, fileName), `${JSON.stringify(parsed)}\n`, "utf8");
        (Array.isArray(parsed.products) ? parsed.products : []).forEach((product) => {
          if (product?.handle) products.set(product.handle, product);
        });
      }
    } catch (error) {
      errors[source.id].push(String(error?.message || error));
      await writeFile(join(workDir, fileName), source.adapter === "tailfin-html" ? "" : "{\"products\":[]}\n", "utf8");
    }
  }
  await mapConcurrent([...products.values()], 6, async (product) => {
    const handle = product.handle;
    const pagePath = join(pagesDir, source.id, `${handle}.html`);
    try {
      const pageUrl = product.url || `${source.productBaseUrl}${encodeURIComponent(handle)}`;
      await writeFile(pagePath, await fetchText(pageUrl), "utf8");
    } catch (error) {
      errors[source.id].push(String(error?.message || error));
      await writeFile(pagePath, "", "utf8");
    }
  });
}

async function runBuilder() {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [
      resolve("scripts/build-manufacturer-catalog.mjs"),
      "--source-dir", workDir,
      "--pages-dir", pagesDir,
      "--output", generatedPath,
      "--image-manifest", imageManifestPath,
      "--checked-at", checkedAt,
    ], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Catalog builder exited with ${code}`)));
  });
}

try {
  await mkdir(workDir, { recursive: true });
  await Promise.all(MANUFACTURER_CATALOG_SOURCES.map(downloadManufacturer));
  await runBuilder();
  const generatedModule = await import(`${pathToFileURL(generatedPath).href}?scan=${Date.now()}`);
  const generatedEntries = generatedModule.MANUFACTURER_BAG_CATALOG_GENERATED || [];
  const failedIds = new Set(MANUFACTURER_CATALOG_SOURCES.filter((source) => errors[source.id].length).map((source) => source.id));
  const scannedEntries = [
    ...generatedEntries.filter((entry) => !failedIds.has(manufacturerIdForEntry(entry))),
    ...MANUFACTURER_BAG_CATALOG.filter((entry) => failedIds.has(manufacturerIdForEntry(entry))),
  ];
  const report = buildManufacturerCatalogScanReport({
    approvedEntries: MANUFACTURER_BAG_CATALOG,
    scannedEntries,
    manufacturers: MANUFACTURER_CATALOG_SOURCES,
    scannedAt,
    errors,
  });
  const markdown = manufacturerCatalogScanMarkdown(report);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdown, "utf8");
  process.stdout.write(`${markdown}REPORT=${outputPath}\n`);
} finally {
  if (!requestedWorkDir) await rm(workDir, { recursive: true, force: true });
}
