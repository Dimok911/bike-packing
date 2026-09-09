import { defineConfig } from "vite";

// Test-only bundle: never placed in the normal publication directory.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [{ name: "isolated-personal-save-pilot", enforce: "pre", transform(code, id) {
    const source = id.replaceAll("\\", "/");
    if (mode === "photo-edit" && process.env.BIKE_PERSONAL_PENDING_FORM === "1" && source.endsWith("/src/sync/personal-pending-form-update.js")) return code.replace(
      "PERSONAL_PENDING_FORM_UPDATE_ENABLED = false", "PERSONAL_PENDING_FORM_UPDATE_ENABLED = true");
    if (source.endsWith("/src/public/guest-login-handoff.js")) return code.replace('  if (validation.ok) return validation.candidate;',
      '  globalThis.__personalGuestHandoffValidation = { reason: validation.reason, handoff, sourceState }; if (validation.ok) return validation.candidate;');
    if (source.endsWith("/src/sync/auth-load-flow.js")) return code.replace(
      '  await renderCachedPrivateStateDuringRemoteLoad({ restoreLayoutChoice });',
      '  globalThis.__personalStartupPhase = "rendering"; try { await renderCachedPrivateStateDuringRemoteLoad({ restoreLayoutChoice }); globalThis.__personalStartupPhase = "rendered"; } catch (error) { globalThis.__personalStartupPhase = { message: error.message, code: error.code, stack: error.stack }; throw error; }');
    if (["photo-form", "photo-edit"].includes(mode) && source.endsWith("/src/sync/personal-photo-form-plan.js")) return code.replace(
      'if (!same(snapshotToPayload(clone(frozen)), base)) fail();',
      'if (!same(snapshotToPayload(clone(frozen)), base)) { globalThis.__personalTestProjectionDifference = { expected: base, actual: snapshotToPayload(clone(frozen)) }; fail(); }');
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-photo-item-form-context.js")) return code.replace(
      "PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED = false", "PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-photo-container-form-context.js")) return code.replace(
      "PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED = false", "PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-photo-tree-copy.js")) return code.replace(
      '  if (!enabled) fail();', '  globalThis.__personalTestTreeCopyInput = clone(input); if (!enabled) fail();');
    if (source.split("?")[0].endsWith("/app.js")) return code.replace('function reportPersonalPhotoFormError(error, { recovery } = {}) {',
      'function reportPersonalPhotoFormError(error, { recovery } = {}) { globalThis.__personalTestPhotoFormError = { message: error.message, code: error.code, stack: error.stack };')
      .replace(/\} catch \(error\) \{ showToast\(error.message, "error"\); return false; \}\r?\n  return mode => \{/,
      '} catch (error) { globalThis.__personalTestPhotoFormError = { message: error.message, code: error.code, stack: error.stack }; showToast(error.message, "error"); return false; }\n  return mode => {')
      .replace('throw new Error("Изменение самих фотографий требует отдельного действия с файлами. Поля и исходная очередь сохранены.");',
      'globalThis.__personalTestProjectionDifference = { records, operationId: outbox.recover()?.action.operationId }; throw new Error("Изменение самих фотографий требует отдельного действия с файлами. Поля и исходная очередь сохранены.");')
      .replace('throw new Error("Объединённая версия требует проверки структуры. Автоматическая отправка остановлена.");',
      'globalThis.__personalTestProjectionDifference = { expected: business, actual: snapshot && cloneStateForSync(snapshot, { forSync: true }) }; throw new Error("Объединённая версия требует проверки структуры. Автоматическая отправка остановлена.");')
      .replace('  return outbox.capture({ snapshot, body, operationId });', '  if (latest?.action.kind === "list.migrate") globalThis.__personalTestProjectionDifference = { expected: cloneStateForSync(outbox.recoverSnapshot(), { forSync: true }), actual: body.payload }; return outbox.capture({ snapshot, body, operationId });');
    if (source.endsWith("/src/sync/personal-archive-import-protocol.js")) return code.replace(
      "PERSONAL_ARCHIVE_IMPORT_ENABLED = false", "PERSONAL_ARCHIVE_IMPORT_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-guest-import-protocol.js")) return code.replace(
      "PERSONAL_GUEST_IMPORT_ENABLED = false", "PERSONAL_GUEST_IMPORT_ENABLED = true")
      .replace('  if (!same(plan.payload, body.payload)) fail();',
        '  if (!same(plan.payload, body.payload)) { globalThis.__personalTestProjectionDifference = { expected: plan.payload, actual: body.payload }; fail(); }');
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-archive-photo-protocol.js")) return code.replace(
      "PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED = false", "PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-pending-guest-update.js")) return code.replace(
      "PERSONAL_PENDING_GUEST_UPDATE_ENABLED = false", "PERSONAL_PENDING_GUEST_UPDATE_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-pending-archive-update.js")) return code.replace(
      "PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED = false", "PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-photo-history-protocol.js")) return code.replace(
      "PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED = false", "PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-photo-tree-source.js")) return code.replace(
      "PERSONAL_PHOTO_TREE_LINK_ENABLED = false", "PERSONAL_PHOTO_TREE_LINK_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-layout-copy.js")) return code.replace(
      "PERSONAL_PHOTO_LAYOUT_COPY_ENABLED = false", "PERSONAL_PHOTO_LAYOUT_COPY_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-confirmed-photos.js")) return code.replace(
      "PERSONAL_PHOTO_OWNER_DELETION_ENABLED = false", "PERSONAL_PHOTO_OWNER_DELETION_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-photo-copy-source.js")) return code.replace(
      "PERSONAL_PHOTO_COPY_FORM_ENABLED = false", "PERSONAL_PHOTO_COPY_FORM_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-photo-copy-batch-protocol.js")) return code.replace(
      "PERSONAL_PHOTO_COPY_BATCH_ENABLED = false", "PERSONAL_PHOTO_COPY_BATCH_ENABLED = true")
      .replace("PERSONAL_PHOTO_TREE_COPY_ENABLED = false", "PERSONAL_PHOTO_TREE_COPY_ENABLED = true")
      .replace("PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED = false", "PERSONAL_PHOTO_COPY_PLACEMENT_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-pending-photo-copy-deletion.js")) return code.replace(
      "PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED = false", "PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED = true")
      .replace("PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED = false", "PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED = true");
    if (mode === "photo-edit" && source.endsWith("/src/sync/personal-pending-photo-owner-deletion.js")) return code.replace(
      "PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED = false", "PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED = true");
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
