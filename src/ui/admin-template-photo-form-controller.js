import { canonicalTemplateJson } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const same = (left, right) => canonicalTemplateJson(left) === canonicalTemplateJson(right);
const fail = message => { throw Object.assign(Error(message), { code: "admin-template-photo-form", isAdminTemplateBlocked: true }); };
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const file = value => value instanceof Blob && value.size > 0 && value.size <= 10 * 1024 * 1024
  && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(value.type);

// One entry belongs to an opened initial-snapshot object, never just a reusable
// dialog or owner ID. This controller owns selection; the supplied submitter
// owns durable capture, staging, reconciliation and their immutable identifiers.
export function createAdminTemplatePhotoFormController({ isEnabled, getContext, getView, readForm, submit,
  createPhoto, cachePhoto, onDurable, onError, onBusy = () => {} }) {
  const entries = new WeakMap();
  const entryAt = type => { const token = getView(type)?.token; return token && typeof token === "object" ? entries.get(token) : null; };
  const context = (type, entityId) => {
    const value = getContext(type, entityId);
    if (value?.scope !== "admin-template" || value.admin !== true || typeof value.generation !== "string" || !value.generation) {
      fail("Откройте подтверждённый административный шаблон перед выбором фотографий.");
    }
    return clone(value);
  };
  const current = entry => {
    const view = getView(entry.type);
    if (!isEnabled() || view?.token !== entry.token || !view.dialog?.open || view.entityId !== entry.entityId
      || view.source?.id !== entry.entityId || !same(context(entry.type, entry.entityId), entry.context)
      || !same(view.source.photos || [], entry.basePhotos)) fail("Форма, исходный шаблон или аккаунт изменились. Выбранные файлы не отправлены.");
    return view;
  };
  const entryFor = type => {
    const view = getView(type);
    if (!["item", "container"].includes(type) || !view?.token || typeof view.token !== "object" || !view.dialog?.open) fail("Эта форма уже закрыта.");
    if (!view.entityId || view.source?.id !== view.entityId) fail("Новые фотографии пока можно добавлять только к уже сохранённой вещи или сумке шаблона.");
    let entry = entries.get(view.token);
    if (!entry) {
      const initial = context(type, view.entityId), binding = adminTemplatePhotoActionBinding(Object.fromEntries(
        ["actorId", "environment", "listId", "itemKey"].map(key => [key, initial[key]])));
      entry = { type, token: view.token, entityId: view.entityId, context: initial, binding, basePhotos: clone(view.source.photos || []),
        files: new Map(), preparing: false, saving: false, attempt: null };
      entries.set(view.token, entry);
    }
    current(entry); return entry;
  };
  const stillOwned = entry => {
    try {
      const view = getView(entry.type), value = context(entry.type, entry.entityId);
      return view?.token === entry.token && Object.keys(entry.binding).every(key => value[key] === entry.binding[key]);
    } catch { return false; }
  };
  const report = (entry, error, type) => { if (!entry || stillOwned(entry)) onError(error, { type, recovery: entry?.attempt?.input || null }); };
  const failed = (entry, error, type) => {
    if (entry && !entry.attempt?.durable) entry.saving = false;
    report(entry, error, type);
    if (!entry || stillOwned(entry)) onBusy(type, entry?.saving || false);
  };
  const submitAttempt = entry => {
    const attempt = entry.attempt;
    if (!attempt.options.isCurrent()) fail("Форма изменилась после фиксации. Исходное действие сохранено для сверки.");
    entry.saving = true; onBusy(entry.type, true);
    attempt.promise = null;
    // Reuse the same object identities: the submitter retains the original
    // operation/stage IDs even when a previous capture outcome is uncertain.
    attempt.promise = Promise.resolve(submit(attempt.input, attempt.options));
    attempt.promise.catch(error => failed(entry, error, entry.type));
  };
  const capture = (entry, record) => {
    current(entry);
    const { blob, thumbBlob = null, ...metadata } = record || {};
    if (typeof metadata.id !== "string" || !metadata.id || metadata.id.length > 191 || metadata.fullBlobVerified !== true
      || !file(blob) || thumbBlob !== null && !file(thumbBlob)
      || metadata.type !== blob.type || metadata.size !== blob.size || typeof metadata.fileName !== "string" || !metadata.fileName || metadata.fileName.length > 255) {
      fail("Не удалось сохранить полный исходный файл фотографии. Форма осталась открыта.");
    }
    const next = Object.freeze({ ...freeze(clone(metadata)), blob, thumbBlob }), previous = entry.files.get(next.id);
    if (previous && (previous.blob !== blob || previous.thumbBlob !== thumbBlob || !same(
      Object.fromEntries(Object.entries(previous).filter(([key]) => !["blob", "thumbBlob"].includes(key))), metadata))) {
      fail("Идентификатор фотографии уже связан с другим исходным файлом.");
    }
    if (!previous) entry.files.set(next.id, next);
    return previous || next;
  };
  return {
    owns: type => Boolean(entryAt(type)),
    inputGuard(type) {
      if (!isEnabled() && !entryAt(type)) return null;
      let entry;
      try { entry = entryFor(type); } catch { return () => false; }
      return () => { try { current(entry); return !entry.saving; } catch { return false; } };
    },
    async preparePhotos(type, files) {
      if (!isEnabled() && !entryAt(type)) return null;
      const entry = entryFor(type), chosen = [...files];
      if (entry.preparing || entry.saving) fail("Дождитесь подготовки или сохранения этой формы.");
      entry.preparing = true; onBusy(type, true);
      try {
        const photos = [];
        for (const selected of chosen) {
          current(entry);
          const photo = await createPhoto(selected, { cachePhoto: async record => {
            // Capture immutable Blob handles BEFORE the cache callback yields.
            // That cache is only a preview; it is not the durable file journal.
            const saved = capture(entry, record);
            await cachePhoto({ ...saved }, `id:${entry.binding.actorId}`); current(entry);
          } });
          current(entry);
          const saved = entry.files.get(photo?.id);
          if (!saved || photo.localId !== saved.id || photo.status !== "pending" || photo.url !== "" || photo.thumbUrl !== ""
            || Object.hasOwn(photo, "assetId") || photo.fileName !== saved.fileName || photo.type !== saved.type || photo.size !== saved.size) {
            fail("Подготовленная фотография не совпадает с её исходным файлом.");
          }
          photos.push(photo);
        }
        return photos;
      } catch (error) {
        if (!stillOwned(entry)) error.isStalePhotoForm = true;
        throw error;
      } finally {
        entry.preparing = false; if (stillOwned(entry)) onBusy(type, entry.saving);
      }
    },
    save(type) {
      if (!isEnabled() && !entryAt(type)) return false;
      let entry = entryAt(type);
      try {
        const view = getView(type), selected = view?.draft?.photos || view?.source?.photos || [];
        if (!entry && (!view?.draft || !view.draft.deletedPhotos?.length && same(selected, view.source?.photos || []))) return false;
        entry = entryFor(type);
        if (entry.saving || entry.preparing) return true;
        if (entry.attempt) {
          if (entry.attempt.durable) return true;
          submitAttempt(entry); return true;
        }
        if (!view.draft?.deletedPhotos?.length && same(selected, entry.basePhotos)) return false;
        if (view.saveButton?.disabled) return true;
        entry.saving = true;
        const form = readForm(type);
        if (form?.placementChanged !== false || form.availabilityChanged !== false || form.catalogSource !== false || form.created !== false) {
          fail("Этот перенос добавляет фото к существующей записи. Размещение, доступность и источник каталога пока нужно оставить прежними.");
        }
        if (!Array.isArray(view.draft?.photos) || !Array.isArray(view.draft.deletedPhotos) || view.draft.deletedPhotos.length
          || selected.length <= entry.basePhotos.length || !same(selected.slice(0, entry.basePhotos.length), entry.basePhotos)) {
          fail("Старые фотографии и их порядок должны остаться прежними. Изменения сохранены в форме.");
        }
        const seen = new Set(entry.basePhotos.map(photo => photo.id)), parts = []; let bytes = 0;
        for (const photo of selected.slice(entry.basePhotos.length)) {
          const prepared = entry.files.get(photo?.id);
          if (!prepared || seen.has(photo.id) || photo.localId !== photo.id || photo.status !== "pending" || photo.url !== "" || photo.thumbUrl !== ""
            || Object.hasOwn(photo, "assetId") || photo.fileName !== prepared.fileName || photo.type !== prepared.type || photo.size !== prepared.size
            || ["_copyToCurrentList", "copyToCurrentList", "publicCopySourceId", "sharedSourceId"].some(key => photo[key])) {
            fail("Не все выбранные фотографии связаны с исходными файлами этой формы.");
          }
          seen.add(photo.id); parts.push(prepared); bytes += prepared.blob.size + (prepared.thumbBlob?.size || 0);
        }
        if (parts.length > 50 || bytes > 50 * 1024 * 1024) fail("Выбрано слишком много фотографий для одного сохранения.");
        const input = Object.freeze({ entityType: type, entityId: entry.entityId, fields: freeze(clone(form.fields)),
          photos: freeze(clone(selected)), files: Object.freeze([...parts]) });
        const signature = current(entry).signature;
        if (typeof signature !== "string") fail("Не удалось зафиксировать состояние открытой формы.");
        const attempt = { input, signature, durable: false, promise: null, options: null };
        const isCurrent = () => {
          try {
            const latest = current(entry);
            return latest.signature === attempt.signature && same(latest.draft?.photos, input.photos) && latest.draft?.deletedPhotos?.length === 0;
          } catch { return false; }
        };
        attempt.options = Object.freeze({ isCurrent, onDurable: record => {
          if (!isCurrent()) fail("Форма изменилась после фиксации. Исходное действие сохранено для сверки.");
          if (attempt.durable) return;
          attempt.durable = true; onDurable(record, { type, view, entityId: entry.entityId });
        } });
        entry.attempt = attempt; submitAttempt(entry);
      } catch (error) {
        failed(entry, error, type);
      }
      return true;
    },
    busy(type) { const entry = entryAt(type); return Boolean(entry?.preparing || entry?.saving); },
    recoveryCopy(type) { const entry = entryAt(type); return entry && stillOwned(entry) ? entry.attempt?.input || null : null; }
  };
}
