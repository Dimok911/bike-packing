// Bike Packing-only API artifact. Keep list summaries identical to the detail UI.
import { rolldown } from "rolldown";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const output = process.argv[2];
if (!output) throw new Error("Specify the API comparison bundle destination");
const entry = "\0bike-visible-history";
const bundle = await rolldown({
  input: entry, platform: "node", treeshake: true,
  plugins: [{ name: "bike-history-entry", resolveId: id => id === entry ? id : null,
    load: id => id === entry ? `export { historyRecordAction, hasHistoryStateChanges } from ${JSON.stringify(path.resolve("src/ui/history-diff.js").replaceAll("\\", "/"))};` : null }]
});
const generated = await bundle.generate({ format: "esm" });
const chunk = generated.output.find(value => value.type === "chunk");
const sources = {};
for (const id of Object.keys(chunk.modules).filter(id => !id.startsWith("\0")).sort()) {
  sources[path.relative(process.cwd(), id).replaceAll("\\", "/")] = createHash("sha256").update((await fs.readFile(id, "utf8")).replaceAll("\r\n", "\n")).digest("hex");
}
await fs.writeFile(output, "// Generated from Bike Packing history UI; see bike-visible-history.sources.json.\n" + chunk.code);
await fs.writeFile(path.join(path.dirname(output), "bike-visible-history.sources.json"), JSON.stringify({ generator: "bike-packing/scripts/build-api-history-comparison.mjs", sources }, null, 2) + "\n");
await bundle.close();
