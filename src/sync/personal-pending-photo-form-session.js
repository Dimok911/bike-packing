import { createPersonalPhotoFormSubmitter } from "./personal-photo-form-submit.js";
import { preparePersonalPendingPhotoForm } from "./personal-pending-photo-form-plan.js";
import { personalPendingPhotoFormChain } from "./personal-pending-photo-form-chain.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";
import { PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED } from "./personal-photo-form-owner-result.js";

const fail = () => { throw Object.assign(Error("Исходная фотоформа требует проверки. Новые поля и файлы сохранены."), { code: "pending-photo-form-session" }); };

export function createPersonalPendingPhotoFormSession({ outbox, store, getContext, enabled = PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED, ...options }) {
  return createPersonalPhotoFormSubmitter({ ...options, outbox, store, getContext, enabled,
    prepareForm(input, compilerOptions) {
      if (input.created !== false) fail();
      return preparePersonalPendingPhotoForm(input, compilerOptions);
    },
    async beforeStore(plan) {
      const parent = plan.action.body.ownerResult.operationId;
      const chain = personalPendingPhotoFormChain({ records: outbox.list(), operationId: parent, listId: outbox.binding.listId });
      if (!chain || chain.entityType !== plan.action.body.entityType || chain.entityId !== plan.action.body.entityId) fail();
      const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext });
      if (inventory.entries.some(entry => entry.state !== "settled-retained"
        && (entry.state !== "linked" || !chain.forms.some(form => form.action.operationId === entry.operationId)))
        || chain.forms.some(form => !inventory.entries.some(entry => entry.operationId === form.action.operationId
          && ["linked", "settled-retained"].includes(entry.state)))) fail();
    }
  });
}
