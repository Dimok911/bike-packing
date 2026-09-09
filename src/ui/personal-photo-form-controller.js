import { createPersonalPhotoFormFiles, personalPhotoEditSelection } from "./personal-photo-form-files.js";
import { canonicalListOperationJson } from "../sync/list-operation-queue.js";

const fail = message => { throw Object.assign(new Error(message), { code: "photo-form-ui" }); };

// The application supplies its actual opened dialog and existing field readers.
// One entry belongs to its initial-snapshot object, not just the reusable DOM
// dialog or entity ID. Closing/reopening the same bag creates a different form.
export function createPersonalPhotoFormController({ isEnabled, getContext, getView, readForm, createSession,
  createEditSession, isEditEnabled = () => false, isItemContextEnabled = () => false, isContainerContextEnabled = () => false,
  isManufacturerSourceEnabled = () => false, isPendingUpdate = () => false, createPendingUpdateSession,
  isPendingFiles = () => false, createPendingFilesSession,
  createPhoto, cachePhoto, onDurable, onQueued, onError, onBusy = () => {} }) {
  const entries = new WeakMap();
  const ownerMatches = entry => {
    const context = getContext();
    return context?.scope === "personal" && Object.keys(entry.binding).every(key => context[key] === entry.binding[key]);
  };
  const contextFor = entry => {
    const view = getView(entry.type), context = getContext();
    return { ...context, form: view?.token === entry.token && view.dialog?.open ? entry.formId : "closed",
      formDraft: view?.signature || "" };
  };
  const entryFor = type => {
    const view = getView(type);
    if (!view?.token || typeof view.token !== "object" || !view.dialog?.open) fail("Эта форма уже закрыта. Фото не отправлены.");
    if (!entries.has(view.token)) {
      const context = getContext(), binding = Object.fromEntries(["environment", "actorId", "listId", "scopeKey"].map(key => [key, context[key]]));
      const entry = { type, token: view.token, binding, formId: crypto.randomUUID(), preparing: false, saving: false, session: null };
      entry.files = createPersonalPhotoFormFiles({ binding, getContext: () => contextFor(entry) });
      entries.set(view.token, entry);
    }
    return entries.get(view.token);
  };
  const errorFor = (entry, error) => {
    if (ownerMatches(entry)) onError(error, { type: entry.type, recovery: entry.session?.recoveryCopy() || null });
  };
  return {
    inputGuard(type) {
      if (!isEnabled()) return () => true;
      let entry;
      try { entry = entryFor(type); } catch { return () => false; }
      // Clipboard permission/read may resolve after this dialog was closed or
      // the account changed. Bind before that await, not when bytes arrive.
      return () => {
        if (!isEnabled()) return false;
        try { entry.files.assertCurrent(); return true; } catch { return false; }
      };
    },
    async preparePhotos(type, files) {
      if (!isEnabled()) return null;
      const entry = entryFor(type), selected = [...files];
      if (entry.preparing || entry.saving) fail("Дождитесь завершения подготовки или сохранения этой формы.");
      entry.preparing = true; onBusy(type, true);
      try {
        const photos = [];
        for (const file of selected) {
          entry.files.assertCurrent();
          photos.push(await createPhoto(file, { cachePhoto: async record => {
            entry.files.assertCurrent();
            // Freeze the cache namespace too: account switching during image
            // resizing must not store the previous user's file in the new scope.
            await cachePhoto(record, entry.binding.scopeKey);
            entry.files.assertCurrent(); entry.files.capture(record);
          } }));
          entry.files.assertCurrent();
        }
        return photos;
      } catch (error) {
        if (getView(type)?.token !== entry.token || !ownerMatches(entry)) error.isStalePhotoForm = true;
        throw error;
      } finally {
        entry.preparing = false;
        if (getView(type)?.token === entry.token && ownerMatches(entry)) onBusy(type, entry.saving);
      }
    },
    save(type) {
      if (!isEnabled()) return false;
      const view = getView(type), selected = view?.draft?.photos || [];
      const manufacturer = type === "container" && isManufacturerSourceEnabled() && Boolean(view?.manufacturerSource);
      const emptyManufacturer = manufacturer && !selected.length && !view?.source;
      const fresh = selected.some(photo => photo?.localId && photo.status === "pending" && !photo.assetId && !photo.url && !photo.thumbUrl);
      const edit = !fresh && !emptyManufacturer && Boolean(view?.draft && (view.draft.deletedPhotos?.length
        || canonicalListOperationJson(selected) !== canonicalListOperationJson(view.source?.photos || [])));
      const pendingFiles = (fresh || edit) && isPendingFiles(type);
      const pendingUpdate = !fresh && !edit && !manufacturer && isPendingUpdate();
      if (!fresh) {
        if (edit && (!isEditEnabled() || typeof createEditSession !== "function")) {
          onError(Object.assign(new Error("Удаление и перестановка фото ещё подключаются к подтверждённому сохранению. Изменения остались в форме; ничего не отправлено."),
            { code: "photo-form-ui" }), { type, recovery: null });
          return true;
        }
        if (!edit && !pendingUpdate && !emptyManufacturer) return false;
      }
      const entry = entryFor(type);
      if (entry.saving || entry.preparing || view.saveButton?.disabled) return true;
      // Reentrant button/field callbacks cannot create a second session.
      entry.saving = true;
      try {
        const { request, placementChanged, availabilityChanged, catalogSource } = readForm(type, { pendingUpdate, pendingFiles });
        if (catalogSource !== false && !(type === "container" && !pendingUpdate && isManufacturerSourceEnabled() && request.manufacturerSource)
          || (placementChanged !== false || availabilityChanged !== false)
          && !(!pendingUpdate && (type === "item" && isItemContextEnabled() && request.formContext
            || type === "container" && isContainerContextEnabled() && request.containerFormContext))) {
          fail("Совместное сохранение фото с размещением, доступностью или импортом из каталога ещё не подключено. Поля и фото остались в форме.");
        }
        const selection = { draft: view.draft, basePhotos: view.source?.photos || [], binding: entry.binding, allowPending: pendingFiles };
        const values = emptyManufacturer ? { files: [] } : pendingUpdate ? {} : edit ? { photoIds: personalPhotoEditSelection(selection), ...(pendingFiles ? { files: [] } : {}) }
          : (pendingFiles || isEditEnabled()) && selection.basePhotos.length ? entry.files.mixedSelection(selection) : { files: entry.files.selection(selection) };
        entry.session = (pendingFiles ? createPendingFilesSession : pendingUpdate ? createPendingUpdateSession : edit ? createEditSession : createSession)({ getContext: () => contextFor(entry), onDurable: record => onDurable(record, { type, view }) });
        const pending = entry.session.submit({ ...request, ...values });
        onBusy(type, true);
        pending.then(() => { if (ownerMatches(entry)) onQueued(type); }, error => errorFor(entry, error))
          .catch(error => errorFor(entry, error));
      } catch (error) {
        // Validation before session creation did not own an operation. The user
        // may correct the same form. A started session keeps its immutable latch.
        if (!entry.session) entry.saving = false;
        errorFor(entry, error); onBusy(type, entry.saving);
      }
      return true;
    },
    busy(type) {
      const token = getView(type)?.token, entry = token && entries.get(token);
      return Boolean(entry && (entry.preparing || entry.saving));
    },
    recoveryCopy(type) {
      const token = getView(type)?.token, entry = token && entries.get(token);
      return entry && ownerMatches(entry) ? entry.session?.recoveryCopy() || null : null;
    }
  };
}
