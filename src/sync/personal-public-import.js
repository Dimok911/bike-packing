import { PERSONAL_PUBLIC_ENTITY_COPY_ENABLED } from "./personal-public-entity-plan.js";
import { PERSONAL_PUBLIC_IMPORT_ENABLED, personalPublicImportPlan } from "./personal-public-import-protocol.js";
import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalGuestBusinessPayload } from "./personal-guest-import-plan.js";
import { preparePersonalGuestImportFiles } from "./personal-guest-import-files.js";
import { personalArchiveHash, personalArchiveJson } from "./personal-archive-import-protocol.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const publicAdapter = { manifestKey: "publicImport", recoveryKey: "publicImportRecovery", code: "public-import",
  plan: personalPublicImportPlan, captureFiles: "capturePublic" };

// Selection journal -> exact native files -> outbox -> synchronous view.
// Public sources stay read-only. This journal retains the exact selected
// source, IDs and action for recovery; preparing never changes the editor.
export function preparePersonalPublicImport(options) { return preparePersonalRemoteImport(options, publicAdapter); }

export async function preparePersonalRemoteImport({ selection, selectionStore, outbox, store, loadFile, getContext,
  getState, getRevision, makeSnapshot, onCaptured, enabled = PERSONAL_PUBLIC_IMPORT_ENABLED, publicEntityEnabled = PERSONAL_PUBLIC_ENTITY_COPY_ENABLED }, adapter) {
  const fail = () => { throw Object.assign(Error("Аккаунт или личный список изменились. Подготовленная копия сохранена для восстановления."), { code: `${adapter.code}-context` }); };
  if (!enabled || selection?.version === 2 && !publicEntityEnabled) throw Error("Копирование шаблона через очередь ещё не включено.");
  assertListOperationJsonValue(selection);
  const initial = clone(getContext()), previous = clone(getState()), revision = getRevision(), binding = outbox.binding;
  let chosen = clone(selection), filePreparation, parts = [], snapshot = null, plan = null;
  const assertCurrent = () => {
    if (initial.scope !== "personal" || initial.scopeKey !== `id:${initial.actorId}` || initial.environment !== "bike-packing-experiment"
      || !initial.generation || !same(initial, getContext()) || !same(previous, getState()) || revision !== getRevision()
      || !same(binding, store.binding) || !same(binding, selectionStore.binding) || !same(binding, chosen.binding)
      || Object.keys(binding).some(key => initial[key] !== binding[key])
      || chosen.baseStateRevision !== revision || !same(chosen.basePayload, personalGuestBusinessPayload(previous)) || outbox.hasPending()) fail();
  };
  const recoveryCopy = () => {
    const context = getContext();
    if (context.scope !== "personal" || Object.keys(binding).some(key => context[key] !== binding[key])) return null;
    return { request: { binding: clone(binding), selection: clone(chosen) }, operationId: chosen.operationId,
      preview: snapshot && clone(snapshot), files: (filePreparation?.recoveryFiles() || []).map(part => ({ fileName: part.fileName, file: part.file, thumb: part.thumb })),
      automaticImportAllowed: false, ...(plan ? { captured: { plan: clone(plan), automaticImportAllowed: false } } : {}) };
  };
  const attachRecovery = error => {
    if (error.code === "guest-import-files") error = Object.assign(Error("Не удалось подготовить все фотографии. Копия сохранена для восстановления."), { code: `${adapter.code}-files`, cause: error });
    error[adapter.recoveryKey] = recoveryCopy();
    if (error[adapter.recoveryKey] && snapshot) error.unconfirmedMemoryDraft = clone(snapshot);
    return error;
  };
  try {
    assertCurrent();
    const savedSelection = await selectionStore.capture(chosen); chosen = clone(savedSelection.selection); assertCurrent();
    const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertCurrent();
    if (inventory.entries.some(entry => entry.state !== "settled-retained" && !(entry.operationId === chosen.operationId && entry.state === "unlinked"))) {
      throw Error("Прежние файлы требуют проверки. Копия шаблона сохранена и ожидает восстановления.");
    }
    const retained = inventory.entries.some(entry => entry.operationId === chosen.operationId && entry.state === "unlinked")
      ? await store.read(chosen.operationId) : null;
    assertCurrent();
    const readFile = retained ? async ({ entityType, entityId, photo }) => {
      const target = chosen.photoTargets.find(target => target.entityType === entityType && target.sourceEntityId === entityId && target.sourcePhotoId === (photo.id || photo.localId));
      const part = retained.files.find(part => part.stage.operationId === target?.assetId);
      if (!part) fail();
      return { file: part.file, thumb: part.thumb, fileName: part.stage.fileName };
    } : loadFile;
    filePreparation = preparePersonalGuestImportFiles({ ...chosen, candidate: { sourceState: chosen.sourcePayload } }, { loadFile: readFile });
    parts = await filePreparation.verify(); assertCurrent();
    const files = parts.map(part => clone(part.manifest));
    const manifest = { version: chosen.version, operationId: chosen.operationId, sourcePayload: clone(chosen.sourcePayload), source: clone(chosen.source),
      ...(chosen.version === 2 ? { copy: clone(chosen.copy) } : { layoutTargets: clone(chosen.layoutTargets) }), ownerTargets: clone(chosen.ownerTargets), photoTargets: clone(chosen.photoTargets),
      editMeta: clone(chosen.editMeta), targetStateRevision: revision, files };
    const result = adapter.plan({ ...manifest, currentPayload: chosen.basePayload, listId: binding.listId }, files);
    snapshot = clone(makeSnapshot(clone(result.payload), previous, result.activeLayoutId));
    if (!same(personalGuestBusinessPayload(snapshot), result.payload)) throw Error("Подготовка отображения изменила выбранную копию шаблона.");
    manifest.sourceHash = await personalArchiveHash(manifest.sourcePayload); manifest.payloadHash = await personalArchiveHash(result.payload); assertCurrent();
    plan = outbox.preparePhoto({ snapshot, payload: result.payload, body: { baseStateRevision: revision, payload: result.payload, [adapter.manifestKey]: manifest }, operationId: chosen.operationId });
    if (retained && (!same(retained.action, plan.action) || !same(retained.snapshot, plan.snapshot))) fail();
    await selectionStore.rememberAction({ selection: chosen, action: plan.action }); assertCurrent();
  } catch (error) { throw attachRecovery(error); }
  const capturedFiles = parts.map(part => ({ stage: { operationId: part.assetId, photoId: part.photoId, entityType: part.entityType,
    entityId: part.entityId, fileName: part.fileName }, file: part.file, thumb: part.thumb }));
  let completion;
  const commit = () => {
    completion ||= (async () => {
      try {
        assertCurrent();
        if (capturedFiles.length) await store[adapter.captureFiles]({ action: plan.action, snapshot: plan.snapshot, files: capturedFiles });
        assertCurrent(); const saved = await outbox.capturePhoto({ plan, store, getContext });
        if (!same(initial, getContext()) || !same(previous, getState()) || revision !== getRevision()) fail();
        const adopted = onCaptured(saved); if (adopted?.then) throw Error("Сохранённый перенос должен применяться без нового ожидания.");
        return saved;
      } catch (error) { throw attachRecovery(error); }
    })();
    return completion;
  };
  commit.recoveryCopy = recoveryCopy;
  return commit;
}
