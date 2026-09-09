import { PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED } from "./personal-photo-container-form-context.js";
import { PERSONAL_MANUFACTURER_PHOTO_FORM_ENABLED } from "./personal-manufacturer-photo-source.js";
import { PERSONAL_PHOTO_FORM_ENABLED } from "./personal-photo-form-protocol.js";
import { PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED } from "./personal-photo-item-form-context.js";
import { readPersonalPhotoFormOwnerRevision } from "./personal-photo-form-base.js";
import { createPersonalPhotoFormSubmitter } from "./personal-photo-form-submit.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { preparePersonalPhotoFormAttachments } from "./personal-photo-form-plan.js";
import { readPersonalPhotoOwnerState } from "./personal-photo-owner-state.js";

const clone = value => JSON.parse(JSON.stringify(value));
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const fail = message => { throw Object.assign(new Error(message), { code: "photo-form-session" }); };

// The opened form owns this latch, including the read-only preflight. Freeze
// selection, fields, list base and ALL IDs before inspecting retained files or
// reading an owner's revision. That read may confirm the frozen base, not replace
// it with newer data. No network mutation is performed by this session.
export function createPersonalPhotoFormSession({ outbox, store, getContext, readEntities, readOwner, onDurable,
  snapshotToPayload = value => value, createUuid = () => crypto.randomUUID(), enabled = PERSONAL_PHOTO_FORM_ENABLED,
  itemContextEnabled = PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED, containerContextEnabled = PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED,
  manufacturerSourceEnabled = PERSONAL_MANUFACTURER_PHOTO_FORM_ENABLED } = {}) {
  let attempt = null;
  const current = initial => {
    if (canonicalListOperationJson(initial) !== canonicalListOperationJson(getContext?.())) {
      fail("Форма или аккаунт изменились во время подготовки. Старые данные не применены.");
    }
  };
  return {
    submit(input) {
      if (attempt) return attempt.promise;
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      attempt = { promise, phase: "freezing", request: null, files: null, ids: null, submitter: null, preview: null };
      const rejected = error => {
        attempt.phase = "blocked";
        if (attempt.request && !error.unconfirmedMemoryDraft) error.unconfirmedMemoryDraft = clone(attempt.preview || attempt.request.snapshot);
        if (attempt.request) error.unconfirmedPhotoFormFields = clone(attempt.request.fields);
        reject(error);
      };
      try {
        if (!enabled || !outbox || !store || typeof onDurable !== "function") fail("Сохранение этой формы ещё не включено.");
        // Strict JSON validation precedes cloning: NaN/undefined cannot silently
        // become a different owner edit or an explicit dimensions deletion.
        const { files, ...request } = input;
        assertListOperationPayload({ ...request.binding, kind: "photos.mutate", body: request });
        const frozen = clone(request), initial = clone(getContext());
        if (typeof frozen.created !== "boolean" || Object.hasOwn(frozen, "baseEntityRevision") || Object.hasOwn(frozen, "photoRevisions")
          || !initial.generation || initial.scope !== "personal" || initial.scopeKey !== `id:${initial.actorId}`
          || Object.keys(outbox.binding).some(key => initial[key] !== outbox.binding[key] || frozen.binding?.[key] !== outbox.binding[key])
          || !Array.isArray(files) || !files.length && !frozen.manufacturerSource || files.length > 50) fail("Форма не содержит подтверждённый личный список и полный набор файлов.");
        const selected = files.map(part => {
          if (!(part?.file instanceof Blob) || !part.file.size || part.thumb != null && (!(part.thumb instanceof Blob) || !part.thumb.size)) {
            fail("Не все выбранные фото доступны. Форма не отправлена.");
          }
          return { file: part.file, thumb: part.thumb ?? null, fileName: part.fileName || part.file.name || "photo" };
        });
        attempt.request = frozen; attempt.files = selected;
        // IDs belong to this button action even if its read-only preflight later
        // fails. Retrying this same session cannot allocate fresh IDs.
        const ids = Array.from({ length: 1 + selected.length * 2 }, () => createUuid());
        if (ids.some(id => !uuid(id)) || new Set(ids).size !== ids.length) fail("Не удалось назначить уникальные номера действия и фото.");
        attempt.ids = [...ids]; current(initial);
        // Validate and retain the desired LOCAL snapshot before even a GET can
        // fail. Only this snapshot is kept: the validation-only revision sentinel
        // is never recorded in an action, outbox, file store or network request.
        // The dispatchable action is constructed separately after the exact read.
        const previewIds = [...ids], { created: previewCreated, ...previewInput } = frozen;
        const previewPhotos = frozen.basePayload?.[frozen.entityType === "item" ? "items" : "containers"]?.[frozen.entityId]?.photos || [];
        attempt.preview = preparePersonalPhotoFormAttachments({ ...previewInput, files: selected, baseEntityRevision: previewCreated ? 0 : 1,
          photoRevisions: previewPhotos.map(photo => ({ photoId: photo.id, assetId: photo.assetId, photoRevision: 1 })) },
          { enabled, itemContextEnabled, containerContextEnabled, manufacturerSourceEnabled, snapshotToPayload, createUuid: () => previewIds.shift() }).snapshot;
        current(initial);
        if (outbox.hasPending()) fail("Сначала подтвердите предыдущие изменения списка. Поля и фото остались в форме.");
        (async () => {
          attempt.phase = "checking-storage";
          const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); current(initial);
          if (inventory.entries.some(entry => entry.state !== "settled-retained")) {
            fail("Прежние фотодействия требуют проверки. Новая форма не отправлена; исходные файлы сохранены.");
          }
          attempt.phase = "reading-owner";
          const versions = frozen.photoSelection ? await readPersonalPhotoOwnerState(frozen, { getContext, readOwner })
            : { baseEntityRevision: frozen.created ? 0 : await readPersonalPhotoFormOwnerRevision(frozen, { getContext, readEntities }) };
          current(initial);
          const { created, ...values } = frozen;
          const submitter = createPersonalPhotoFormSubmitter({ outbox, store, getContext, onDurable, snapshotToPayload,
            enabled, itemContextEnabled, containerContextEnabled, manufacturerSourceEnabled, createUuid: () => ids.shift() });
          attempt.submitter = submitter; attempt.phase = "capturing";
          const result = await submitter.submit({ ...values, ...versions, files: selected });
          attempt.phase = "durable"; resolve(result);
        })().catch(rejected);
      } catch (error) { rejected(error); }
      return promise;
    },
    state() { return { phase: attempt?.phase || "idle", operationId: attempt?.ids?.[0] || null, capture: attempt?.submitter?.state() || null }; },
    recoveryCopy() {
      if (!attempt?.request) return null;
      const context = getContext?.();
      if (context?.scope !== "personal" || Object.keys(outbox.binding).some(key => context[key] !== outbox.binding[key])) return null;
      return { request: clone(attempt.request), ids: [...(attempt.ids || [])],
        preview: attempt.preview ? clone(attempt.preview) : null,
        files: attempt.files.map(part => ({ ...part })), automaticImportAllowed: false,
        // Before the exact owner read this is a frozen FORM, not a dispatchable
        // operation. Do not synthesize an action from it on recovery.
        captured: attempt.submitter?.recoveryCopy() || null };
    }
  };
}
