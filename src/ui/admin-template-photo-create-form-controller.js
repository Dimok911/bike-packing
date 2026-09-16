import { canonicalTemplateJson } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const same = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fail = message => { throw Object.assign(Error(message), { code: "admin-template-photo-create-form", isAdminTemplateBlocked: true }); };
const validBlob = blob => blob instanceof Blob && blob.size > 0 && blob.size <= 10 * 1024 * 1024
  && ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"].includes(blob.type);

// A new form has no persisted owner. Its token and administrative layout bind
// its selection until the submitter captures one immutable owner/action package.
export function createAdminTemplatePhotoCreateFormController({ isEnabled, getContext, getView, readForm,
  submit, createPhoto, cachePhoto, onDurable, onError, onBusy = () => {} }) {
  const entries = new WeakMap();
  const entryAt = type => { const token = getView(type)?.token; return token && typeof token === "object" ? entries.get(token) : null; };
  const eligible = type => Boolean(entryAt(type) || isEnabled() && !getView(type)?.entityId);
  const context = (type, layoutId) => {
    const value = getContext(type, layoutId);
    if (value?.scope !== "admin-template" || value.admin !== true || typeof value.generation !== "string" || !value.generation) {
      fail("Откройте подтверждённый приватный шаблон перед созданием записи с фото.");
    }
    adminTemplatePhotoActionBinding(Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, value[key]])));
    return clone(value);
  };
  const current = entry => {
    const view = getView(entry.type);
    if (!isEnabled() || view?.token !== entry.token || view.dialog !== entry.dialog || !view.dialog?.open || view.entityId
      || view.layoutId !== entry.layoutId || !same(context(entry.type, entry.layoutId), entry.context)) {
      fail("Форма, шаблон или аккаунт изменились. Выбранные фотографии не отправлены.");
    }
    return view;
  };
  const owned = entry => {
    try {
      const view = getView(entry.type);
      return view?.token === entry.token && view.dialog === entry.dialog && !view.entityId && view.layoutId === entry.layoutId
        && same(context(entry.type, entry.layoutId), entry.context);
    } catch { return false; }
  };
  const entryFor = type => {
    const view = getView(type);
    if (!["item", "container"].includes(type) || !view?.token || typeof view.token !== "object" || !view.dialog?.open || view.entityId || !view.layoutId) {
      fail("Для нового фотопакета нужна открытая форма новой вещи или сумки шаблона.");
    }
    let entry = entries.get(view.token);
    if (!entry) {
      entry = { type, token: view.token, dialog: view.dialog, layoutId: view.layoutId, context: context(type, view.layoutId),
        files: new Map(), preparing: false, saving: false, attempt: null };
      entries.set(view.token, entry);
    }
    if (entry.type !== type) fail("Форма принадлежит другой записи.");
    current(entry); return entry;
  };
  const failed = (entry, error, type) => {
    if (entry && !entry.attempt?.durable) entry.saving = false;
    if (!entry || owned(entry)) { onError(error, { type, recovery: entry?.attempt?.input || null }); onBusy(type, entry?.saving || false); }
  };
  const submitAttempt = entry => {
    const attempt = entry.attempt;
    if (!attempt.options.isCurrent()) fail("Форма изменилась после фиксации. Исходное действие сохранено для сверки.");
    entry.saving = true; onBusy(entry.type, true);
    Promise.resolve(submit(attempt.input, attempt.options)).catch(error => failed(entry, error, entry.type));
  };
  return {
    owns: type => Boolean(entryAt(type)),
    inputGuard(type) {
      if (!eligible(type)) return null;
      let entry; try { entry = entryFor(type); } catch { return () => false; }
      return () => { try { current(entry); return !entry.preparing && !entry.saving && !entry.attempt; } catch { return false; } };
    },
    mutationGuard(type) {
      if (!eligible(type)) return null;
      let entry, signature, draft;
      try { entry = entryFor(type); const view = current(entry); signature = view.signature; draft = clone(view.draft || { photos: [], deletedPhotos: [] }); }
      catch { return () => false; }
      return () => { try { const view = current(entry); return !entry.preparing && !entry.saving && !entry.attempt
        && view.signature === signature && same(view.draft || { photos: [], deletedPhotos: [] }, draft); } catch { return false; } };
    },
    async preparePhotos(type, files) {
      if (!eligible(type)) return null;
      const entry = entryFor(type), chosen = [...files];
      if (entry.preparing || entry.saving || entry.attempt) fail("Дождитесь завершения сохранения выбранной формы.");
      entry.preparing = true; onBusy(type, true);
      try {
        const photos = [];
        for (const selected of chosen) {
          current(entry);
          const photo = await createPhoto(selected, { cachePhoto: async record => {
            current(entry);
            const { blob, thumbBlob = null, ...metadata } = record || {};
            if (typeof metadata.id !== "string" || !metadata.id || metadata.fullBlobVerified !== true || !validBlob(blob)
              || thumbBlob !== null && !validBlob(thumbBlob) || metadata.type !== blob.type || metadata.size !== blob.size
              || typeof metadata.fileName !== "string" || !metadata.fileName || metadata.fileName.length > 255) fail("Полный исходный файл фотографии не сохранён.");
            // Retain the actual immutable bytes before the preview cache yields.
            const saved = Object.freeze({ ...freeze(clone(metadata)), blob, thumbBlob }), previous = entry.files.get(metadata.id);
            if (previous && (previous.blob !== blob || previous.thumbBlob !== thumbBlob || !same(metadata,
              Object.fromEntries(Object.entries(previous).filter(([key]) => !["blob", "thumbBlob"].includes(key)))))) fail("Этот идентификатор уже связан с другим файлом.");
            if (!previous) entry.files.set(metadata.id, saved);
            await cachePhoto({ ...(previous || saved) }, `id:${entry.context.actorId}`); current(entry);
          } });
          current(entry);
          const saved = entry.files.get(photo?.id);
          if (!saved || photo.localId !== photo.id || photo.status !== "pending" || photo.url !== "" || photo.thumbUrl !== ""
            || Object.hasOwn(photo, "assetId") || photo.fileName !== saved.fileName || photo.type !== saved.type || photo.size !== saved.size) fail("Фотография не совпадает с исходным файлом.");
          photos.push(photo);
        }
        return photos;
      } catch (error) { if (!owned(entry)) error.isStalePhotoForm = true; throw error; }
      finally { entry.preparing = false; if (owned(entry)) onBusy(type, entry.saving); }
    },
    save(type) {
      if (!eligible(type)) return false;
      let entry = entryAt(type);
      try {
        const view = getView(type), selected = view?.draft?.photos;
        if (!entry && !selected?.length) return false;
        entry = entryFor(type);
        if (entry.saving || entry.preparing) return true;
        if (entry.attempt) { if (!entry.attempt.durable) submitAttempt(entry); return true; }
        if (!selected?.length) return false;
        if (view.saveButton?.disabled) return true;
        const form = readForm(type);
        if (form?.created !== true || form.catalogSource !== false || form.unsupportedPlacement !== false) {
          fail("Создать запись с фото можно только в приватном шаблоне: из своих файлов, в каталоге или в выбранном допустимом месте.");
        }
        const parts = [], ids = new Set(); let bytes = 0;
        for (const photo of selected) {
          const saved = entry.files.get(photo?.id);
          if (!saved || ids.has(photo.id) || photo.localId !== photo.id || photo.status !== "pending" || photo.url !== "" || photo.thumbUrl !== ""
            || Object.hasOwn(photo, "assetId") || photo.fileName !== saved.fileName || photo.type !== saved.type || photo.size !== saved.size
            || ["_copyToCurrentList", "copyToCurrentList", "publicCopySourceId", "sharedSourceId"].some(key => photo[key])) fail("Выбранные фото должны принадлежать файлам этой формы.");
          ids.add(photo.id); parts.push(saved); bytes += saved.blob.size + (saved.thumbBlob?.size || 0);
        }
        if (parts.length > 50 || bytes > 50 * 1024 * 1024) fail("Выбрано слишком много файлов для одного сохранения.");
        const input = Object.freeze({ entityType: type, layoutId: entry.layoutId, fields: freeze(clone(form.fields)),
          localFormContext: freeze(clone(form.localFormContext)), photos: freeze(clone(selected)), files: Object.freeze(parts) });
        const signature = current(entry).signature, deleted = clone(view.draft?.deletedPhotos || []);
        if (typeof signature !== "string") fail("Не удалось зафиксировать открытую форму.");
        const attempt = { input, signature, durable: false, options: null };
        const isCurrent = () => { try { const latest = current(entry); return latest.signature === signature
          && same(latest.draft?.photos, input.photos) && same(latest.draft?.deletedPhotos || [], deleted); } catch { return false; } };
        attempt.options = Object.freeze({ isCurrent, onDurable: record => {
          if (!isCurrent()) fail("Форма изменилась после фиксации. Пакет сохранён для сверки.");
          if (attempt.durable) return;
          attempt.durable = true; onDurable(record, { type, view });
        } });
        entry.attempt = attempt; submitAttempt(entry);
      } catch (error) { failed(entry, error, type); }
      return true;
    },
    busy(type) { const entry = entryAt(type); return Boolean(entry?.preparing || entry?.saving); },
    recoveryCopy(type) { const entry = entryAt(type); return entry && owned(entry) ? entry.attempt?.input || null : null; }
  };
}
