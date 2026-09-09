import { PERSONAL_GUEST_IMPORT_ENABLED } from "./personal-guest-import-protocol.js";
import { personalGuestImportPlan, personalGuestBusinessPayload } from "./personal-guest-import-plan.js";
import { preparePersonalGuestImportFiles } from "./personal-guest-import-files.js";
import { personalArchiveHash, personalArchiveJson } from "./personal-archive-import-protocol.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const fail = () => { throw Object.assign(Error("Аккаунт, гостевой вход или личный список изменились. Подготовленный перенос сохранён для восстановления."), { code: "guest-import-context" }); };

// Selection journal -> exact native files -> outbox -> synchronous view.
// Cleanup of guest storage belongs to a later verified receipt/checkpoint;
// neither preparing nor committing this action consumes the handoff.
export async function preparePersonalGuestImport({ selection, selectionStore, outbox, store, loadFile, getContext, getHandoff,
  getState, getRevision, makeSnapshot, onCaptured, enabled = PERSONAL_GUEST_IMPORT_ENABLED }) {
  if (!enabled) throw Error("Перенос гостевой работы через очередь ещё не включён.");
  const initial = clone(getContext()), previous = clone(getState()), revision = getRevision(), binding = outbox.binding;
  let chosen = clone(selection), filePreparation, parts = [], snapshot = null, plan = null;
  const assertCurrent = () => {
    if (initial.scope !== "personal" || initial.scopeKey !== `id:${initial.actorId}` || initial.environment !== "bike-packing-experiment"
      || !initial.generation || !same(initial, getContext()) || !same(previous, getState()) || revision !== getRevision()
      || !same(binding, store.binding) || !same(binding, selectionStore.binding) || !same(binding, chosen.binding)
      || Object.keys(binding).some(key => initial[key] !== binding[key]) || !same(chosen.handoff, getHandoff())
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
    error.guestImportRecovery = recoveryCopy();
    if (error.guestImportRecovery && snapshot) error.unconfirmedMemoryDraft = clone(snapshot);
    return error;
  };
  try {
    assertCurrent();
    const savedSelection = await selectionStore.capture(chosen); chosen = clone(savedSelection.selection); assertCurrent();
    const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertCurrent();
    if (inventory.entries.some(entry => entry.state !== "settled-retained" && !(entry.operationId === chosen.operationId && entry.state === "unlinked"))) {
      throw Error("Прежние файлы требуют проверки. Гостевой перенос сохранён и ожидает восстановления.");
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
    filePreparation = preparePersonalGuestImportFiles(chosen, { loadFile: readFile });
    parts = await filePreparation.verify(); assertCurrent();
    const files = parts.map(part => clone(part.manifest));
    const manifest = { version: 1, operationId: chosen.operationId, sourcePayload: clone(chosen.candidate.sourceState),
      layoutTargets: clone(chosen.layoutTargets), ownerTargets: clone(chosen.ownerTargets), photoTargets: clone(chosen.photoTargets),
      editMeta: clone(chosen.editMeta), targetStateRevision: revision, files };
    const result = personalGuestImportPlan({ ...manifest, currentPayload: chosen.basePayload, listId: binding.listId }, files);
    snapshot = clone(makeSnapshot(clone(result.payload), previous, result.activeLayoutId, clone(chosen.candidate.displayPreferences || {})));
    if (!same(personalGuestBusinessPayload(snapshot), result.payload)) throw Error("Подготовка отображения изменила выбранный гостевой перенос.");
    manifest.sourceHash = await personalArchiveHash(manifest.sourcePayload); manifest.payloadHash = await personalArchiveHash(result.payload); assertCurrent();
    plan = outbox.preparePhoto({ snapshot, payload: result.payload, body: { baseStateRevision: revision, payload: result.payload, guestImport: manifest }, operationId: chosen.operationId });
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
        if (capturedFiles.length) await store.captureGuest({ action: plan.action, snapshot: plan.snapshot, files: capturedFiles });
        assertCurrent(); const saved = await outbox.capturePhoto({ plan, store, getContext });
        if (!same(initial, getContext()) || !same(previous, getState()) || revision !== getRevision() || !same(chosen.handoff, getHandoff())) fail();
        const adopted = onCaptured(saved); if (adopted?.then) throw Error("Сохранённый перенос должен применяться без нового ожидания.");
        return saved;
      } catch (error) { throw attachRecovery(error); }
    })();
    return completion;
  };
  commit.recoveryCopy = recoveryCopy;
  return commit;
}
