import { createPersonalPhotoFormSubmitter } from "./personal-photo-form-submit.js";
import { preparePersonalPendingPhotoForm } from "./personal-pending-photo-form-plan.js";
import { personalPendingPhotoFormChain } from "./personal-pending-photo-form-chain.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";
import { PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED } from "./personal-photo-form-owner-result.js";
import { PERSONAL_PUBLIC_PHOTO_FORM_ENABLED, PERSONAL_PUBLIC_NEW_OWNER_FORM_ENABLED } from "./personal-public-photo-form-result.js";
import { PERSONAL_IMPORT_PHOTO_FORM_ENABLED, PERSONAL_IMPORT_NEW_OWNER_FORM_ENABLED } from "./personal-import-photo-form-result.js";

const fail = () => { throw Object.assign(Error("Исходная фотоформа требует проверки. Новые поля и файлы сохранены."), { code: "pending-photo-form-session" }); };

export function createPersonalPendingPhotoFormSession({ outbox, store, getContext, enabled = PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED,
  publicEnabled = PERSONAL_PUBLIC_PHOTO_FORM_ENABLED, importEnabled = PERSONAL_IMPORT_PHOTO_FORM_ENABLED,
  publicNewOwnerEnabled = PERSONAL_PUBLIC_NEW_OWNER_FORM_ENABLED,
  importNewOwnerEnabled = PERSONAL_IMPORT_NEW_OWNER_FORM_ENABLED, ...options }) {
  const submitter = createPersonalPhotoFormSubmitter({ ...options, outbox, store, getContext, enabled,
    prepareForm(input, compilerOptions) {
      if (input.created !== false && !(input.created === true && (importNewOwnerEnabled || publicNewOwnerEnabled))) fail();
      const chain = personalPendingPhotoFormChain({ records: outbox.list(), operationId: input.parentOperationId, listId: outbox.binding.listId,
        entityType: input.entityType, entityId: input.entityId, allowNewOwner: input.created });
      if (!chain || input.publicOperationId && input.publicOperationId !== chain.publicOperationId
        || input.importOperationId && input.importOperationId !== chain.importOperationId || input.importKind && input.importKind !== chain.importKind) fail();
      return preparePersonalPendingPhotoForm({ ...input, publicOperationId: chain.publicOperationId || null,
        importOperationId: chain.importOperationId || null, importKind: chain.importKind || null }, { ...compilerOptions, publicEnabled, importEnabled, importNewOwnerEnabled, publicNewOwnerEnabled });
    },
    async beforeStore(plan) {
      const parent = plan.action.body.ownerResult.operationId;
      const chain = personalPendingPhotoFormChain({ records: outbox.list(), operationId: parent, listId: outbox.binding.listId,
        entityType: plan.action.body.entityType, entityId: plan.action.body.entityId, allowNewOwner: [4, 5].includes(plan.action.body.ownerResult.version) });
      if (!chain || chain.entityType !== plan.action.body.entityType || chain.entityId !== plan.action.body.entityId) fail();
      const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext });
      if (inventory.entries.some(entry => entry.state !== "settled-retained"
        && (entry.state !== "linked" || !chain.forms.some(form => form.action.operationId === entry.operationId)))
        || chain.forms.some(form => !inventory.entries.some(entry => entry.operationId === form.action.operationId
          && ["linked", "settled-retained"].includes(entry.state)))) fail();
    }
  });
  return { ...submitter, recoveryCopy() {
    const saved = submitter.recoveryCopy();
    if (!saved) return null;
    // The export adapter consumes an opened-form envelope. Keep the exact
    // compiled plan too, including when native storage succeeded but linking
    // its action to the queue failed. No request is reconstructed for dispatch.
    return { ...saved, request: { binding: { ...outbox.binding }, ...saved.plan.action.body },
      preview: saved.plan.snapshot, files: saved.files.map(part => ({ ...part,
        fileName: part.stage.fileName, thumb: part.thumb ?? null })) };
  } };
}
