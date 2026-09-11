import { defineConfig } from "vite";
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
          return "assets/[name]-[hash][extname]";
        }
      }
    }
  }
});
