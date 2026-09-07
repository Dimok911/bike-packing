import { defineConfig } from "vite";

// Test-only bundle: never placed in the normal publication directory.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [{ name: "isolated-personal-save-pilot", enforce: "pre", transform(code, id) {
    const source = id.replaceAll("\\", "/");
    if (mode === "photo-form" && source.endsWith("/src/sync/personal-photo-form-plan.js")) return code.replace(
      'if (!same(snapshotToPayload(clone(frozen)), base)) fail();',
      'if (!same(snapshotToPayload(clone(frozen)), base)) { globalThis.__personalTestProjectionDifference = { expected: base, actual: snapshotToPayload(clone(frozen)) }; fail(); }');
    if (source.split("?")[0].endsWith("/app.js")) return code.replace('function reportPersonalPhotoFormError(error, { recovery } = {}) {',
      'function reportPersonalPhotoFormError(error, { recovery } = {}) { globalThis.__personalTestPhotoFormError = { message: error.message, code: error.code, stack: error.stack };')
      .replace('throw new Error("Объединённая версия требует проверки структуры. Автоматическая отправка остановлена.");',
      'globalThis.__personalTestProjectionDifference = { expected: business, actual: snapshot && cloneStateForSync(snapshot, { forSync: true }) }; throw new Error("Объединённая версия требует проверки структуры. Автоматическая отправка остановлена.");')
      .replace('  return outbox.capture({ snapshot, body });', '  if (latest?.action.kind === "list.migrate") globalThis.__personalTestProjectionDifference = { expected: cloneStateForSync(outbox.recoverSnapshot(), { forSync: true }), actual: body.payload }; return outbox.capture({ snapshot, body });');
    if (/\/src\/sync\/personal-list-migration\.js$/.test(source)) return code.replace("PERSONAL_LIST_MIGRATION_ENABLED = false", "PERSONAL_LIST_MIGRATION_ENABLED = true");
    if (["photo-form", "photo-edit"].includes(mode) && /\/src\/sync\/personal-photo-form-(protocol|gates)\.js$/.test(source)) {
      const forms = code.replace(/(PERSONAL_PHOTO_FORM(?:_UI)?_ENABLED) = false/g, "$1 = true");
      return mode === "photo-edit" ? forms.replace("PERSONAL_PHOTO_EDIT_FORM_ENABLED = false", "PERSONAL_PHOTO_EDIT_FORM_ENABLED = true") : forms;
    }
    if (["photo-recovery", "photo-form", "photo-edit"].includes(mode) && /\/src\/sync\/personal-photo-(action-store|outbox-record|publication-protocol|staging|batch-cancellation)\.js$/.test(source)) {
      return code.replace(/(PERSONAL_PHOTO_(?:ACTIONS|OUTBOX|PUBLICATION_QUEUE|STAGING|CANCELLATION|BATCH_STORAGE|BATCH_OUTBOX|BATCH_STAGING|BATCH_CANCELLATION)_ENABLED) = false/g, "$1 = true");
    }
    if (/\/src\/sync\/(personal-save-outbox|list-operation-queue)\.js$/.test(id.replaceAll("\\", "/"))) {
      const gated = code.replace(/(PERSONAL_SAVE_OUTBOX_ENABLED|LIST_OPERATION_QUEUE_ENABLED) = false/g, "$1 = true");
      return ["photo-recovery", "photo-form", "photo-edit"].includes(mode) ? gated.replace("LIST_OPERATION_CANCELLATION_ENABLED = false", "LIST_OPERATION_CANCELLATION_ENABLED = true") : gated;
    }
  } }],
  build: { outDir: mode === "photo-edit" ? "test-results/personal-photo-edit-ui-build" : mode === "photo-form" ? "test-results/personal-photo-form-ui-build" : mode === "photo-recovery" ? "test-results/personal-photo-cancel-ui-build" : "test-results/personal-ui-build", emptyOutDir: true }
}));
