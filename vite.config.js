import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const publishedAssetNames = JSON.parse(readFileSync(new URL("./scripts/manufacturer-published-asset-names.json", import.meta.url), "utf8"));
import { fileURLToPath } from "node:url";
import { experimentReleasePlugin } from "./scripts/experiment-release-profile.mjs";

export default defineConfig({
  base: "./",
  plugins: [experimentReleasePlugin(fileURLToPath(new URL(".", import.meta.url)))],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.names?.some((name) => name.endsWith(".css"))) return "styles.css";
          // Filtering duplicate galleries must not rename identical published bytes.
          const digest = createHash("sha256").update(assetInfo.source).digest("hex");
          return publishedAssetNames[digest] || "assets/[name]-[hash][extname]";
        }
      }
    }
  }
});
