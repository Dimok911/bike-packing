import { preparePersonalPhotoFormAttachments } from "./personal-photo-form-plan.js";
import { PERSONAL_PHOTO_FORM_ENABLED } from "./personal-photo-form-protocol.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";

const clone = value => JSON.parse(JSON.stringify(value));
const blocked = message => Object.assign(new Error(message), { code: "photo-form-submit", isPersonalSaveBlocked: true });

// One instance belongs to ONE opened form. submit() freezes fields, selection,
// IDs and the observed outbox head synchronously, before hashing/IDB. Every
// repeated click returns that same promise, including after a storage error.
// No network, retry, cleanup or automatic rebase is authorized here.
export function createPersonalPhotoFormSubmitter({ outbox, store, getContext, onDurable,
  snapshotToPayload = value => value, createUuid = () => crypto.randomUUID(), enabled = PERSONAL_PHOTO_FORM_ENABLED } = {}) {
  let attempt = null;
  const sameContext = initial => {
    const current = getContext?.();
    if (!initial?.generation || initial.scope !== "personal" || initial.scopeKey !== `id:${initial.actorId}`
      || canonicalListOperationJson(current) !== canonicalListOperationJson(initial)) {
      throw blocked("Форма или аккаунт изменились. Старая карточка не применена; исходные данные сохранены.");
    }
  };
  const fail = error => {
    attempt.failedAt = attempt.phase; attempt.phase = "blocked";
    if (!(error instanceof Error)) error = blocked("Не удалось зафиксировать карточку со всеми фото.");
    if (attempt.plan) error.unconfirmedMemoryDraft = clone(attempt.plan.snapshot);
    error.photoFormSubmission = { operationId: attempt.plan?.action.operationId || null,
      failedAt: attempt.failedAt, fileStored: attempt.fileStored, linked: attempt.linked };
    attempt.reject(error);
  };
  return {
    submit(input) {
      if (attempt) return attempt.promise;
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      // Latch before caller-provided projection/UUID/context callbacks too.
      attempt = { promise, resolve, reject, phase: "preparing", plan: null, files: null, fileStored: false, linked: false };
      try {
        if (!enabled || !store?.captureForm || !outbox?.preparePhoto || !outbox?.capturePhoto || typeof onDurable !== "function") {
          throw blocked("Сохранение формы с фото ещё не подключено. Ничего не отправлено.");
        }
        const initial = clone(getContext()); sameContext(initial);
        const prepared = preparePersonalPhotoFormAttachments(input, { enabled, snapshotToPayload, createUuid });
        sameContext(initial);
        const plan = outbox.preparePhoto(prepared);
        sameContext(initial);
        attempt.plan = clone(plan);
        attempt.files = prepared.files.map(part => ({ stage: clone(part.stage), file: part.file, thumb: part.thumb }));
        // The native store separately verifies the complete binding and aborts
        // on context changes. A failure AFTER its commit may leave an unlinked
        // record. It must stay visible to recovery, never be overwritten/deleted.
        attempt.phase = "saving-files";
        (async () => {
          await store.captureForm({ ...clone(attempt.plan), files: attempt.files });
          attempt.fileStored = true; sameContext(initial);
          attempt.phase = "linking-queue";
          const record = await outbox.capturePhoto({ plan: clone(attempt.plan), store, getContext });
          attempt.linked = true; sameContext(initial);
          attempt.phase = "applying-view";
          const result = onDurable(clone(record));
          if (result?.then) throw blocked("Применение сохранённой формы должно завершаться без нового ожидания.");
          attempt.phase = "durable";
          resolve({ record: clone(record), durable: true, fileRetained: true });
        })().catch(fail);
      } catch (error) { fail(error); }
      return promise;
    },
    state() {
      return { phase: attempt?.phase || "idle", operationId: attempt?.plan?.action.operationId || null,
        fileStored: attempt?.fileStored || false, linked: attempt?.linked || false, failedAt: attempt?.failedAt || null };
    },
    recoveryCopy() {
      if (!attempt?.plan) return null;
      const current = getContext?.(), binding = outbox.binding;
      if (current?.scope !== "personal" || Object.keys(binding).some(key => current?.[key] !== binding[key])) return null;
      return { plan: clone(attempt.plan), files: attempt.files.map(part => ({ ...part, stage: clone(part.stage) })), automaticImportAllowed: false };
    }
  };
}
