import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { MANUFACTURER_BAG_CATALOG_GENERATED } from "../src/data/manufacturer-bag-catalog.generated.js";

// Run as part of preparing publication, never from catalog:scan. Historical
// dates use the first committed addition in the already published ancestry.
const path = "src/data/manufacturer-catalog-publication-history.json";
const history = await readFile(path, "utf8").then(JSON.parse).catch(() => ({}));
if (process.argv.includes("--backfill-published-history")) {
  const commits = execFileSync("git", ["log", "--reverse", "--format=%H %aI", "--", "src/data/manufacturer-bag-catalog.generated.js"], { encoding: "utf8" }).trim().split("\n");
  for (const line of commits) {
    const [commit, date] = line.split(" ");
    const source = execFileSync("git", ["show", `${commit}:src/data/manufacturer-bag-catalog.generated.js`], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
    for (const match of source.matchAll(/"id":\s*"([^"]+)"/g)) history[match[1]] ||= { date, commit };
  }
}
const now = new Date().toISOString();
for (const entry of MANUFACTURER_BAG_CATALOG_GENERATED) {
  history[entry.id] ||= history[entry.sourceProductId] || { date: now };
}
await writeFile(path, JSON.stringify(history, null, 2) + "\n");
