import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_ADMIN_API_CAPABILITIES,
  REQUIRED_ADMIN_API_VERSION
} from "../src/config/api-contract.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputArg = process.argv[2] || process.env.BIKE_PACKING_DIST_DIR || "dist";
const distDir = path.resolve(rootDir, outputArg);

async function copyIfExists(source, target) {
  try {
    await fs.copyFile(source, target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function toAssetPath(filePath) {
  const relative = path.relative(distDir, filePath).replaceAll(path.sep, "/");
  return `./${relative}`;
}

async function readAppVersion() {
  const constants = await fs.readFile(path.join(rootDir, "src/config/constants.js"), "utf8");
  return constants.match(/APP_VERSION\s*=\s*"([^"]+)"/)?.[1] || `build-${Date.now()}`;
}

function runtimeVersionToken(appVersion) {
  return String(appVersion || "").replace(/^v/, "");
}

function versionRuntimeAsset(asset, appVersion) {
  if (asset !== "./app.js" && asset !== "./styles.css") return asset;
  return `${asset}?v=${runtimeVersionToken(appVersion)}`;
}

async function versionDistEntryAssets(appVersion) {
  const indexPath = path.join(distDir, "index.html");
  const source = await fs.readFile(indexPath, "utf8");
  const version = runtimeVersionToken(appVersion);
  const versioned = source.replace(
    /(\b(?:src|href)=["']\.\/(?:app\.js|styles\.css))(?:\?v=[^"']*)?(["'])/g,
    `$1?v=${version}$2`
  );
  await fs.writeFile(indexPath, versioned, "utf8");
}

async function writeReleaseContract(appVersion) {
  const contract = {
    schemaVersion: 1,
    appVersion,
    requiredApiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
    requiredApiCapabilities: REQUIRED_ADMIN_API_CAPABILITIES
  };
  await fs.writeFile(
    path.join(distDir, "release-contract.json"),
    `${JSON.stringify(contract, null, 2)}\n`,
    "utf8"
  );
}

async function buildServiceWorkerSource(cacheName, assets) {
  // Keep runtime behavior identical in source and the published worker.
  const source = await fs.readFile(path.join(rootDir, "sw.js"), "utf8");
  return source
    .replace(/const CACHE_NAME = [^;]+;/, () => "const CACHE_NAME = " + JSON.stringify(cacheName) + ";")
    .replace(/const ASSETS = \[[\s\S]*?\];/, () => "const ASSETS = " + JSON.stringify(assets, null, 2) + ";");
}

await fs.mkdir(distDir, { recursive: true });
await copyIfExists(path.join(rootDir, "manifest.webmanifest"), path.join(distDir, "manifest.webmanifest"));
await copyIfExists(path.join(rootDir, "index.php"), path.join(distDir, "index.php"));

const appVersion = await readAppVersion();
await versionDistEntryAssets(appVersion);
await writeReleaseContract(appVersion);
const files = await walkFiles(distDir);
const precache = new Set(["./", "./index.html", "./manifest.webmanifest"]);
files
  .map(toAssetPath)
  .filter((asset) => !asset.endsWith("/sw.js") && !asset.endsWith("/index.php"))
  .map((asset) => versionRuntimeAsset(asset, appVersion))
  .forEach((asset) => precache.add(asset));

const serviceWorker = await buildServiceWorkerSource(`bike-packing-prototype-${appVersion}`, [...precache].sort());
await fs.writeFile(path.join(distDir, "sw.js"), serviceWorker, "utf8");
