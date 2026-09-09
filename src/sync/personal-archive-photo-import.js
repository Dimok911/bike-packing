import { PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED } from "./personal-archive-photo-protocol.js";
import { personalArchivePhotoSelection, personalArchivePhotoPlan, personalArchivePayloadWithPhotos } from "./personal-archive-photo-plan.js";
import { preparePersonalArchivePhotoFiles } from "./personal-archive-photo-files.js";
import { personalArchiveHash, personalArchiveJson } from "./personal-archive-import-protocol.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const fail = () => { throw Object.assign(Error("Аккаунт, архив или целевой список изменились. Повторите выбор после подтверждения прежних действий."), { code: "archive-photo-context" }); };

// Prepare before confirmation; persist bytes and their exact action after it.
// The returned callback is latched across repeated clicks and rejected writes.
export async function preparePersonalArchivePhotoImport({ source, photoFiles, mode, layoutTargets = [], sourceActiveLayoutId = "", editMeta = {},
  outbox, store, getContext, getState, getRevision, makeSnapshot, onCaptured, enabled = PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED,
  operationId = crypto.randomUUID() }) {
  if (!enabled) throw Error("Импорт архивов с фотографиями ещё не включён.");
  const initial = clone(getContext()), previous = clone(getState()), revision = getRevision(), binding = outbox.binding;
  const assertCurrent = () => {
    if (initial.scope !== "personal" || initial.scopeKey !== `id:${initial.actorId}` || initial.environment !== "bike-packing-experiment"
      || !initial.generation || !same(initial, getContext()) || !same(previous, getState()) || revision !== getRevision()
      || !same(binding, store.binding) || Object.keys(binding).some(key => initial[key] !== binding[key]) || outbox.hasPending()) fail();
  };
  assertCurrent();
  const input = { currentPayload: personalArchivePayloadWithPhotos(previous), sourcePayload: personalArchivePayloadWithPhotos(source),
    mode, layoutTargets: clone(layoutTargets), sourceActiveLayoutId, editMeta: clone(editMeta), listId: binding.listId };
  const selected = personalArchivePhotoSelection(input);
  const prepared = preparePersonalArchivePhotoFiles({ owners: selected.owners, photoFiles });
  const parts = await prepared.verify(); assertCurrent();
  const files = parts.map(part => ({ entityType: part.entityType, entityId: part.entityId, sourcePhotoId: part.sourcePhotoId,
    photoId: part.photoId, assetId: part.assetId, file: { hash: part.metadata.sha256, size: part.file.size, type: part.file.type, fileName: part.metadata.fileName },
    thumb: part.thumb ? { hash: part.thumbHash, size: part.thumb.size, type: part.thumb.type } : null }));
  const result = personalArchivePhotoPlan(input, files), snapshot = clone(makeSnapshot(clone(result.payload), previous, result.activeLayoutId));
  if (!same(personalArchivePayloadWithPhotos(snapshot), result.payload)) throw Error("Подготовка отображения изменила выбранный архив.");
  const body = { baseStateRevision: revision, payload: result.payload, archiveImport: { version: 2, mode, sourcePayload: input.sourcePayload,
    sourceHash: await personalArchiveHash(input.sourcePayload), layoutTargets: input.layoutTargets, sourceActiveLayoutId, editMeta: input.editMeta,
    targetStateRevision: revision, payloadHash: await personalArchiveHash(result.payload), files } };
  assertCurrent();
  const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertCurrent();
  if (inventory.entries.some(entry => entry.state !== "settled-retained")) throw Error("Прежние файлы требуют проверки. Новый архив не применён.");
  const plan = outbox.preparePhoto({ snapshot, payload: result.payload, body, operationId });
  const capturedFiles = parts.map(part => ({ stage: { operationId: part.assetId, photoId: part.photoId, entityType: part.entityType,
    entityId: part.entityId, fileName: part.metadata.fileName }, file: part.file, thumb: part.thumb }));
  let completion;
  const recoveryCopy = () => {
    const context = getContext();
    if (context.scope !== "personal" || Object.keys(binding).some(key => context[key] !== binding[key])) return null;
    return { request: { binding: clone(binding), mode, source: clone(input.sourcePayload), layoutTargets: clone(input.layoutTargets) },
    ids: [operationId, ...files.flatMap(file => [file.photoId, file.assetId])], preview: clone(snapshot),
    files: capturedFiles.map(part => ({ fileName: part.stage.fileName, file: part.file, thumb: part.thumb })),
    automaticImportAllowed: false, captured: { plan: clone(plan), automaticImportAllowed: false } };
  };
  const commit = () => {
    completion ||= (async () => {
      try {
        assertCurrent();
        if (capturedFiles.length) await store.captureArchive({ action: plan.action, snapshot: plan.snapshot, files: capturedFiles });
        assertCurrent();
        const saved = await outbox.capturePhoto({ plan, store, getContext });
        // Pending is expected now. Context and editor still must be the same.
        if (!same(initial, getContext()) || !same(previous, getState()) || revision !== getRevision()) fail();
        const adopted = onCaptured(saved); if (adopted?.then) throw Error("Сохранённый архив должен применяться без нового ожидания.");
        return saved;
      } catch (error) {
        error.archivePhotoRecovery = recoveryCopy();
        if (error.archivePhotoRecovery) error.unconfirmedMemoryDraft = clone(snapshot);
        else delete error.unconfirmedMemoryDraft;
        throw error;
      }
    })();
    return completion;
  };
  commit.recoveryCopy = recoveryCopy;
  return commit;
}
