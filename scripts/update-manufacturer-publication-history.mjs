import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Only approved catalog entries belong here. Scanning never writes this ledger.
export function recordManufacturerCatalogPublication(history, entries, { initialBaseline = false, publishedAt = "" } = {}) {
  const next = { ...history };
  for (const entry of entries) {
    if (Object.hasOwn(next, entry.id)) continue;
    if (initialBaseline) { next[entry.id] = { baseline: true }; continue; }
    const time = Date.parse(publishedAt);
    if (!Number.isFinite(time)) throw new Error("New approved models require an explicit --published-at date; import and scan dates are not publication dates");
    next[entry.id] = { publishedAt: new Date(time).toISOString() };
  }
  return next;
}

async function main() {
  const path = "src/data/manufacturer-catalog-publication-history.json";
  const history = await readFile(path, "utf8").then(JSON.parse).catch((error) => { if (error.code === "ENOENT") return {}; throw error; });
  const { MANUFACTURER_BAG_CATALOG_GENERATED: entries } = await import("../src/data/manufacturer-bag-catalog.generated.js");
  const dateArg = process.argv.indexOf("--published-at");
  const next = recordManufacturerCatalogPublication(history, entries, {
    initialBaseline: process.argv.includes("--initialize-baseline"),
    publishedAt: dateArg < 0 ? "" : process.argv[dateArg + 1],
  });
  await writeFile(path, JSON.stringify(next, null, 2) + "\n");
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
