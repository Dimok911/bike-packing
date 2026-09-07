import { defineConfig } from "vite";

// Test-only bundle: never placed in the normal publication directory.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [{ name: "isolated-personal-save-pilot", enforce: "pre", transform(code, id) {
    const source = id.replaceAll("\\", "/");
    if (mode === "photo-recovery" && /\/src\/sync\/personal-photo-(action-store|outbox-record|publication-protocol|staging)\.js$/.test(source)) {
      return code.replace(/(PERSONAL_PHOTO_(?:ACTIONS|OUTBOX|PUBLICATION_QUEUE|STAGING|CANCELLATION)_ENABLED) = false/g, "$1 = true");
    }
    if (/\/src\/sync\/(personal-save-outbox|list-operation-queue)\.js$/.test(id.replaceAll("\\", "/"))) {
      const gated = code.replace(/(PERSONAL_SAVE_OUTBOX_ENABLED|LIST_OPERATION_QUEUE_ENABLED) = false/g, "$1 = true");
      return mode === "photo-recovery" ? gated.replace("LIST_OPERATION_CANCELLATION_ENABLED = false", "LIST_OPERATION_CANCELLATION_ENABLED = true") : gated;
    }
  } }],
  build: { outDir: mode === "photo-recovery" ? "test-results/personal-photo-cancel-ui-build" : "test-results/personal-ui-build", emptyOutDir: true }
}));
