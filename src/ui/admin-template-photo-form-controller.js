import { canonicalTemplateJson } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const same = (left, right) => canonicalTemplateJson(left) === canonicalTemplateJson(right);
const fail = message => { throw Object.assign(Error(message), { code: "admin-template-photo-form", isAdminTemplateBlocked: true }); };
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const file = value => value instanceof Blob && value.size > 0 && value.size <= 10 * 1024 * 1024
  && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(value.type);
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const photoId = value => typeof value === "string" && value.length > 0 && value.length <= 191 && value === value.trim()
  && !["__proto__", "prototype", "constructor"].includes(value);

function editSelection(entry, draft, fields) {
  if (!plain(fields) || !Array.isArray(draft?.photos) || !Array.isArray(draft.deletedPhotos) || !entry.basePhotos.length) {
    fail("Не удалось связать изменения фото с исходной формой.");
  }
  const allowed = ["name", "weight", "color", "location", "category", "categories", "note", "dimensions",
    "updatedAt", "updatedByDeviceId", "updatedByDeviceName", ...(entry.type === "item" ? ["quantity"] : ["volume", "nestable"])];
  if (Object.keys(fields).some(key => !allowed.includes(key))) fail("В этой форме можно изменить только поля записи и её фотографии.");
  const originals = new Map(), selected = new Set(), deleted = new Set();
  for (const photo of entry.basePhotos) {
    if (!plain(photo) || !photoId(photo.id) || photo.status !== "synced" || originals.has(photo.id)
      || Object.hasOwn(photo, "photoId") && photo.photoId !== photo.id
      || Object.hasOwn(photo, "listId") && photo.listId !== entry.binding.listId) fail("Исходные фотографии требуют сверки с шаблоном.");
    originals.set(photo.id, photo);
  }
  for (const [photos, ids] of [[draft.photos, selected], [draft.deletedPhotos, deleted]]) for (const photo of photos) {
    if (!plain(photo) || !originals.has(photo.id) || ids.has(photo.id) || !same(photo, originals.get(photo.id))) {
      fail("Удалять и переставлять можно только неизменённые фотографии этой записи.");
    }
    ids.add(photo.id);
  }
  if ([...deleted].some(id => selected.has(id)) || [...originals.keys()].some(id => !selected.has(id) && !deleted.has(id))) {
    fail("Список оставленных и удалённых фотографий не совпадает с исходной записью.");
  }
}

// One entry belongs to an opened initial-snapshot object, never just a reusable
// dialog or owner ID. This controller owns selection; the supplied submitter
// owns durable capture, staging, reconciliation and their immutable identifiers.
export function createAdminTemplatePhotoFormController({ isEnabled, isEditEnabled = () => false, getContext, getView, readForm, submit, submitEdit,
  createPhoto, cachePhoto, onDurable, onError, onBusy = () => {} }) {
  const entries = new WeakMap();
  const enabled = mode => mode === "append" ? isEnabled() : mode === "edit" ? isEditEnabled() : isEnabled() || isEditEnabled();
  const entryAt = type => { const token = getView(type)?.token; return token && typeof token === "object" ? entries.get(token) : null; };
  const context = (type, entityId) => {
    const value = getContext(type, entityId);
    if (value?.scope !== "admin-template" || value.admin !== true || typeof value.generation !== "string" || !value.generation) {
      fail("Откройте подтверждённый административный шаблон перед выбором фотографий.");
    }
    return clone(value);
  };
  const current = (entry, mode = entry.attempt?.mode) => {
    const view = getView(entry.type);
    if (!enabled(mode) || view?.token !== entry.token || view.dialog !== entry.dialog || !view.dialog?.open || view.entityId !== entry.entityId
      || view.source !== entry.source || view.source?.id !== entry.entityId || !same(context(entry.type, entry.entityId), entry.context)
      || !same(view.source, entry.baseSource)) fail("Форма, исходный шаблон или аккаунт изменились. Фотографии не отправлены.");
    return view;
  };
  const entryFor = (type, mode) => {
    const view = getView(type);
    if (!["item", "container"].includes(type) || !view?.token || typeof view.token !== "object" || !view.dialog?.open) fail("Эта форма уже закрыта.");
    if (!view.entityId || view.source?.id !== view.entityId) fail("Новые фотографии пока можно добавлять только к уже сохранённой вещи или сумке шаблона.");
    let entry = entries.get(view.token);
    if (!entry) {
      const initial = context(type, view.entityId), binding = adminTemplatePhotoActionBinding(Object.fromEntries(
        ["actorId", "environment", "listId", "itemKey"].map(key => [key, initial[key]])));
      entry = { type, token: view.token, dialog: view.dialog, entityId: view.entityId, source: view.source,
        context: initial, binding, baseSource: clone(view.source), basePhotos: clone(view.source.photos || []),
        files: new Map(), preparing: false, saving: false, attempt: null };
      entries.set(view.token, entry);
    }
    if (entry.type !== type) fail("Эта форма принадлежит другой записи.");
    current(entry, mode); return entry;
  };
  const stillOwned = entry => {
    try {
      const view = getView(entry.type), value = context(entry.type, entry.entityId);
      return view?.token === entry.token && view.dialog === entry.dialog && view.entityId === entry.entityId
        && view.source === entry.source && same(value, entry.context);
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
    attempt.promise = Promise.resolve((attempt.mode === "edit" ? submitEdit : submit)(attempt.input, attempt.options));
    attempt.promise.catch(error => failed(entry, error, entry.type));
  };
  const capture = (entry, record) => {
    current(entry, "append");
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
      if (!enabled() && !entryAt(type)) return null;
      let entry;
      try { entry = entryFor(type); } catch { return () => false; }
      return () => { try { current(entry); return !entry.saving; } catch { return false; } };
    },
    mutationGuard(type) {
      if (!enabled() && !entryAt(type)) return null;
      let entry, signature, draft;
      try {
        entry = entryFor(type);
        const view = current(entry);
        if (typeof view.signature !== "string") return () => false;
        const initialDraft = view.draft ?? { photos: entry.basePhotos, deletedPhotos: [] };
        signature = view.signature; draft = clone({ photos: initialDraft.photos, deletedPhotos: initialDraft.deletedPhotos });
      } catch { return () => false; }
      // Invoke immediately before the confirmed local mutation. Changes made
      // while a confirmation was awaiting input invalidate that confirmation.
      return () => {
        try {
          const view = current(entry);
          const currentDraft = view.draft ?? { photos: entry.basePhotos, deletedPhotos: [] };
          return !entry.preparing && !entry.saving && !entry.attempt && view.signature === signature
            && same({ photos: currentDraft.photos, deletedPhotos: currentDraft.deletedPhotos }, draft);
        } catch { return false; }
      };
    },
    async preparePhotos(type, files) {
      if (!enabled() && !entryAt(type)) return null;
      const entry = entryFor(type);
      if (!isEnabled()) fail("Добавление новых файлов ещё не включено. В этой форме можно удалить или переставить сохранённые фото.");
      current(entry, "append");
      const chosen = [...files];
      if (entry.preparing || entry.saving) fail("Дождитесь подготовки или сохранения этой формы.");
      entry.preparing = true; onBusy(type, true);
      try {
        const photos = [];
        for (const selected of chosen) {
          current(entry, "append");
          const photo = await createPhoto(selected, { cachePhoto: async record => {
            // Capture immutable Blob handles BEFORE the cache callback yields.
            // That cache is only a preview; it is not the durable file journal.
            const saved = capture(entry, record);
            await cachePhoto({ ...saved }, `id:${entry.binding.actorId}`); current(entry, "append");
          } });
          current(entry, "append");
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
      if (!enabled() && !entryAt(type)) return false;
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
          fail("Фотографии меняются только у существующей записи. Размещение, доступность и источник каталога пока нужно оставить прежними.");
        }
        if (!Array.isArray(selected)) fail("Не удалось прочитать фотографии открытой формы.");
        const baseIds = new Set(entry.basePhotos.map(photo => photo?.id));
        const mode = selected.every(photo => baseIds.has(photo?.id)) ? "edit" : "append";
        current(entry, mode);
        let input;
        if (mode === "edit") {
          if (typeof submitEdit !== "function") fail("Удаление и порядок фото ещё не подключены. Изменения остались в форме.");
          editSelection(entry, view.draft, form.fields);
          input = Object.freeze({ entityType: type, entityId: entry.entityId, fields: freeze(clone(form.fields)),
            photos: freeze(clone(selected)), deletedPhotos: freeze(clone(view.draft.deletedPhotos)) });
        } else {
          if (!Array.isArray(view.draft?.photos) || !Array.isArray(view.draft.deletedPhotos) || view.draft.deletedPhotos.length
            || selected.length <= entry.basePhotos.length || !same(selected.slice(0, entry.basePhotos.length), entry.basePhotos)) {
            fail("Добавление новых файлов пока требует сохранить старые фотографии и их порядок.");
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
          input = Object.freeze({ entityType: type, entityId: entry.entityId, fields: freeze(clone(form.fields)),
            photos: freeze(clone(selected)), files: Object.freeze([...parts]) });
        }
        const signature = current(entry, mode).signature;
        if (typeof signature !== "string") fail("Не удалось зафиксировать состояние открытой формы.");
        const attempt = { mode, input, signature, durable: false, promise: null, options: null };
        const isCurrent = () => {
          try {
            const latest = current(entry, mode);
            return latest.signature === attempt.signature && same(latest.draft?.photos, input.photos)
              && same(latest.draft?.deletedPhotos, input.deletedPhotos || []);
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
