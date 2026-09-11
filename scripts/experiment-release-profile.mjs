// Explicit first testing release. The source defaults and isolated test builds
// remain disabled. Only a production build served from the exact Experiment
// origin activates this cohort; Production and local previews stay unchanged.
export const EXPERIMENT_RELEASE_ORIGIN = "https://experiment.vniipo-help.ru";
export const EXPERIMENT_RELEASE_PROFILE = "manual-eu-personal-forms-admin-photos-v1";
export const EXPERIMENT_RELEASE_CAPABILITIES = Object.freeze([
  "personalListCausalOperationsV1", "personalListOperationCancellationV1", "personalListInitialMigrationV1",
  "personalStagedPhotoAssetsV1", "personalStagedPhotoCancellationV1", "personalCausalPhotoPublicationV1",
  "personalCausalPhotoOwnerStateV1", "personalCausalPhotoFormV1", "personalCausalPhotoItemFormContextV1",
  "personalCausalPhotoContainerFormContextV1", "adminTemplateCausalOperationsV1", "adminTemplatePhotoAppendV1",
  "adminTemplatePhotoEditV1", "adminTemplateCopyV1", "adminTemplateSourceSaveV1", "adminTemplatePersonalSourceSaveV1",
  "adminTemplatePendingSourceV1", "adminTemplatePendingPersonalSourceV1",
]);
export const EXPERIMENT_RELEASE_GATES = Object.freeze({
  "src/sync/experiment-transport.js": ["EU_TRANSPORT_RELEASE_ENABLED"],
  "src/sync/personal-save-outbox.js": ["PERSONAL_SAVE_OUTBOX_ENABLED"],
  "src/sync/list-operation-queue.js": ["LIST_OPERATION_QUEUE_ENABLED", "LIST_OPERATION_CANCELLATION_ENABLED"],
  "src/sync/personal-list-migration.js": ["PERSONAL_LIST_MIGRATION_ENABLED"],
  "src/sync/personal-photo-action-store.js": ["PERSONAL_PHOTO_ACTIONS_ENABLED", "PERSONAL_PHOTO_BATCH_STORAGE_ENABLED"],
  "src/sync/personal-photo-outbox-record.js": ["PERSONAL_PHOTO_OUTBOX_ENABLED", "PERSONAL_PHOTO_BATCH_OUTBOX_ENABLED"],
  "src/sync/personal-photo-publication-protocol.js": ["PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED"],
  "src/sync/personal-photo-staging.js": ["PERSONAL_PHOTO_STAGING_ENABLED", "PERSONAL_PHOTO_BATCH_STAGING_ENABLED", "PERSONAL_PHOTO_CANCELLATION_ENABLED"],
  "src/sync/personal-photo-batch-cancellation.js": ["PERSONAL_PHOTO_BATCH_CANCELLATION_ENABLED"],
  "src/sync/personal-photo-form-protocol.js": ["PERSONAL_PHOTO_FORM_ENABLED", "PERSONAL_PHOTO_EDIT_FORM_ENABLED"],
  "src/sync/personal-photo-form-gates.js": ["PERSONAL_PHOTO_FORM_UI_ENABLED"],
  "src/sync/personal-photo-item-form-context.js": ["PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED"],
  "src/sync/personal-photo-container-form-context.js": ["PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED"],
  "src/sync/admin-template-protocol.js": ["ADMIN_TEMPLATE_OPERATIONS_ENABLED"],
  "src/sync/admin-template-photo-append-protocol.js": ["ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED"],
  "src/sync/admin-template-photo-edit-protocol.js": ["ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED"],
});

export function experimentReleasePlugin(root) {
  const prefix = root.replaceAll("\\", "/").replace(/\/$/, "") + "/";
  const seen = new Set();
  return {
    name: "explicit-experiment-testing-release",
    enforce: "pre",
    apply: "build",
    buildStart() { seen.clear(); },
    transform(code, id) {
      const filename = id.replaceAll("\\", "/").split("?")[0];
      if (!filename.startsWith(prefix)) return null;
      const relative = filename.slice(prefix.length);
      const gates = EXPERIMENT_RELEASE_GATES[relative];
      if (!gates) return null;
      for (const gate of gates) {
        const original = `export const ${gate} = false;`;
        if (code.split(original).length !== 2) throw Error(`Release gate declaration changed: ${gate}`);
        code = code.replace(original, `export const ${gate} = globalThis.location?.origin === ${JSON.stringify(EXPERIMENT_RELEASE_ORIGIN)};`);
        seen.add(gate);
      }
      return { code, map: null };
    },
    buildEnd(error) {
      if (error) return;
      const missing = Object.values(EXPERIMENT_RELEASE_GATES).flat().filter(gate => !seen.has(gate));
      if (missing.length) throw Error(`Release gates were not compiled: ${missing.join(", ")}`);
    },
  };
}
