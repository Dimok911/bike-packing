import { defineConfig } from "vite";

// Test-only bundle: never placed in the normal publication directory.
export default defineConfig({
  base: "./",
  plugins: [{ name: "isolated-personal-save-pilot", enforce: "pre", transform(code, id) {
    if (/\/src\/sync\/(personal-save-outbox|list-operation-queue)\.js$/.test(id.replaceAll("\\", "/"))) {
      return code.replace(/(PERSONAL_SAVE_OUTBOX_ENABLED|LIST_OPERATION_QUEUE_ENABLED) = false/g, "$1 = true");
    }
  } }],
  build: { outDir: "test-results/personal-ui-build", emptyOutDir: true }
});
