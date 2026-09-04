import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { MANUFACTURER_BAG_CATALOG } from "../src/data/manufacturer-bag-catalog.js";
import {
  selectManufacturerCatalogSources,
} from "../src/data/manufacturer-catalog-sources.js";
import { tailfinCatalogTargets } from "./manufacturer-catalog/tailfin-adapter.mjs";
import { apiduraCatalogTargets } from "./manufacturer-catalog/apidura-adapter.mjs";
import {
  revelateCatalogTargets,
  revelateProductPageIsValid,
} from "./manufacturer-catalog/revelate-adapter.mjs";
import {
  missGrapeCatalogTargets,
  missGrapeProductPageIsValid,
} from "./manufacturer-catalog/miss-grape-adapter.mjs";
import {
  cycliteCatalogTargets,
  cycliteProductPageIsValid,
} from "./manufacturer-catalog/cyclite-adapter.mjs";
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
const requestedManufacturers = new Set(String(args.get("--manufacturers") || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean));
const activeSources = selectManufacturerCatalogSources(requestedManufacturers);
const workDir = requestedWorkDir ? resolve(requestedWorkDir) : await mkdtemp(join(tmpdir(), "bike-packing-catalog-scan-"));
const pagesDir = join(workDir, ".catalog-pages");
const generatedPath = join(workDir, "manufacturer-bag-catalog.generated.mjs");
const imageManifestPath = join(workDir, "manufacturer-catalog-images.json");
const scannedAt = new Date().toISOString();
const checkedAt = scannedAt.slice(0, 10);
const errors = Object.fromEntries(activeSources.map((source) => [source.id, []]));

async function fetchText(url, attempts = 3, validate = null) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "bike-packing-catalog-monitor/1.0 (+https://experiment.vniipo-help.ru/)",
          "accept": "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.8",
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (validate && !validate(body)) throw new Error("HTTP 200 did not contain the expected catalog content");
      return body;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  try {
    const body = await fetchTextWithCurl(url);
    if (validate && !validate(body)) throw new Error("curl response did not contain the expected catalog content");
    return body;
  } catch (curlError) {
    throw new Error(`${url}: ${String(lastError?.message || lastError || "request failed")}; curl fallback: ${String(curlError?.message || curlError)}`);
  }
}

async function fetchTextWithCurl(url) {
  const command = process.platform === "win32" ? "curl.exe" : "curl";
  const curlArgs = [
    "--location", "--fail", "--silent", "--show-error", "--compressed",
    "--retry", "3", "--retry-delay", "2", "--max-time", "90",
    "--user-agent", "bike-packing-catalog-monitor/1.0 (+https://experiment.vniipo-help.ru/)",
    String(url),
  ];
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, curlArgs, { stdio: ["ignore", "pipe", "pipe"] });
    const output = [];
    const errors = [];
    let bytes = 0;
    const maxBytes = 25 * 1024 * 1024;
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        child.kill();
        reject(new Error("response exceeds 25 MB"));
        return;
      }
      output.push(chunk);
    });
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolvePromise(Buffer.concat(output).toString("utf8"))
      : reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `curl exited with ${code}`)));
  });
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
      } else if (source.adapter === "apidura-sitemap") {
        await writeFile(join(workDir, fileName), fetched, "utf8");
        apiduraCatalogTargets(fetched).forEach((product) => products.set(product.handle, product));
      } else if (source.adapter === "revelate-product-chart") {
        await writeFile(join(workDir, fileName), fetched, "utf8");
        revelateCatalogTargets(fetched, { baseUrl: url }).forEach((product) => products.set(product.handle, product));
      } else if (source.adapter === "miss-grape-wordpress") {
        const parsed = JSON.parse(fetched);
        await writeFile(join(workDir, fileName), `${JSON.stringify(parsed)}\n`, "utf8");
        missGrapeCatalogTargets(parsed).forEach((product) => products.set(product.handle, product));
      } else if (source.adapter === "cyclite-collection") {
        await writeFile(join(workDir, fileName), fetched, "utf8");
        cycliteCatalogTargets(fetched, { baseUrl: url }).forEach((product) => products.set(product.handle, product));
      } else {
        const parsed = JSON.parse(fetched);
        await writeFile(join(workDir, fileName), `${JSON.stringify(parsed)}\n`, "utf8");
        (Array.isArray(parsed.products) ? parsed.products : []).forEach((product) => {
          if (product?.handle) products.set(product.handle, product);
        });
      }
    } catch (error) {
      errors[source.id].push(String(error?.message || error));
      await writeFile(join(workDir, fileName), source.adapter === "tailfin-html" || source.adapter === "revelate-product-chart" || source.adapter === "cyclite-collection"
        ? ""
        : source.adapter === "apidura-sitemap" ? "" : "{\"products\":[]}\n", "utf8");
    }
  }
  const productConcurrency = source.adapter === "revelate-product-chart" ? 2 : 6;
  await mapConcurrent([...products.values()], productConcurrency, async (product) => {
    const handle = product.handle;
    const pagePath = join(pagesDir, source.id, `${handle}.html`);
    try {
      const pageUrl = product.url || `${source.productBaseUrl}${encodeURIComponent(handle)}`;
      const validate = source.adapter === "revelate-product-chart"
        ? revelateProductPageIsValid
        : source.adapter === "miss-grape-wordpress" ? missGrapeProductPageIsValid
          : source.adapter === "cyclite-collection" ? cycliteProductPageIsValid : null;
      await writeFile(pagePath, await fetchText(pageUrl, 3, validate), "utf8");
    } catch (error) {
      errors[source.id].push(String(error?.message || error));
      await writeFile(pagePath, "", "utf8");
    }
  });
}

async function runBuilder() {
  await new Promise((resolvePromise, reject) => {
    const builderArgs = [
      resolve("scripts/build-manufacturer-catalog.mjs"),
      "--source-dir", workDir,
      "--pages-dir", pagesDir,
      "--output", generatedPath,
      "--image-manifest", imageManifestPath,
      "--checked-at", checkedAt,
    ];
    const successfulManufacturerIds = activeSources
      .filter(({ id }) => !errors[id].length)
      .map(({ id }) => id);
    if (requestedManufacturers.size || successfulManufacturerIds.length !== activeSources.length) {
      builderArgs.push(
        "--manufacturers", successfulManufacturerIds.join(",") || "__none__",
        "--approved-catalog", resolve("src/data/manufacturer-bag-catalog.generated.js"),
      );
    }
    const child = spawn(process.execPath, builderArgs, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Catalog builder exited with ${code}`)));
  });
}

try {
  await mkdir(workDir, { recursive: true });
  await Promise.all(activeSources.map(downloadManufacturer));
  await runBuilder();
  const generatedModule = await import(`${pathToFileURL(generatedPath).href}?scan=${Date.now()}`);
  const generatedEntries = generatedModule.MANUFACTURER_BAG_CATALOG_GENERATED || [];
  const failedIds = new Set(activeSources.filter((source) => errors[source.id].length).map((source) => source.id));
  const scannedEntries = [
    ...generatedEntries.filter((entry) => !failedIds.has(manufacturerIdForEntry(entry))),
    ...MANUFACTURER_BAG_CATALOG.filter((entry) => failedIds.has(manufacturerIdForEntry(entry))),
  ];
  const report = buildManufacturerCatalogScanReport({
    approvedEntries: MANUFACTURER_BAG_CATALOG,
    scannedEntries,
    manufacturers: activeSources,
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
