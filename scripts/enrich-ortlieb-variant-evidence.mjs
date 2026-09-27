import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { MANUFACTURER_CATALOG_SOURCES } from "../src/data/manufacturer-catalog-sources.js";
import { collectOrtliebVariantEvidence, ortliebVariantEvidence } from "./manufacturer-catalog/ortlieb-variant-evidence.mjs";

const work = resolve(process.argv[2]);
const products = new Map();
for (const [file] of MANUFACTURER_CATALOG_SOURCES.find((s) => s.id === "ortlieb").collections) {
  for (const product of JSON.parse(await readFile(join(work, file))).products) products.set(product.handle, product);
}
const queue = [...products.values()];
const failures = [];
await Promise.all(Array.from({ length: 1 }, async () => {
  while (queue.length) {
    const product = queue.shift();
    try {
      const html = await readFile(join(work, ".catalog-pages/ortlieb", `${product.handle}.html`), "utf8");
      const sourceUrl = `https://us.ortlieb.com/products/${product.handle}`;
      if (!ortliebVariantEvidence(html, sourceUrl).material) continue;
      const output = join(work, ".catalog-pages/ortlieb", `${product.handle}.variants.json`);
      const existing = await readFile(output, "utf8").then(JSON.parse).catch(() => []);
      const evidence = await collectOrtliebVariantEvidence({ product, html, sourceUrl, existing,
        onProgress: (rows) => writeFile(output, JSON.stringify(rows)), fetchText: async (url) => {
        for (let attempt = 0; attempt < 4; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, attempt ? 45000 : 1500));
          const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
          if (response.status === 429 && attempt < 3) continue;
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        }
      } });
      await writeFile(join(work, ".catalog-pages/ortlieb", `${product.handle}.variants.json`), JSON.stringify(evidence));
      process.stdout.write(`${product.handle}: ${evidence.length} verified variants\n`);
    } catch (error) { failures.push({ handle: product.handle, error: error.message }); }
  }
}));
await writeFile(join(work, "ortlieb-variant-errors.json"), JSON.stringify(failures, null, 2));
process.stdout.write(JSON.stringify({ products: products.size, failures }) + "\n");
if (failures.length) process.exitCode = 1;
