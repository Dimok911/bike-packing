import { PERSONAL_GUEST_IMPORT_ENABLED } from "./personal-guest-import-protocol.js";
import { personalGuestSelectionBody } from "./personal-guest-import-completion.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const fail = () => { throw Object.assign(Error("Сохранённые гостевые файлы не совпали с исходной очередью. Данные сохранены для восстановления."), { code: "guest-link-recovery", isPersonalSaveBlocked: true }); };

// Explicit recovery of the native-file commit -> synchronous outbox-link gap.
// Reuse the original verified selection/base/body/snapshot and all IDs. This
// step sends no request and never replaces the displayed editor. The ordinary
// queue subsequently checks the server revision and owns receipt recovery.
export async function recoverPersonalGuestImportLink({ entry, outbox, store, getContext, enabled = PERSONAL_GUEST_IMPORT_ENABLED }) {
  if (!enabled || !entry?.intent || entry.completion || !outbox || !store) fail();
  entry = structuredClone(entry);
  const initial = structuredClone(getContext()), binding = outbox.binding;
  const assertCurrent = () => {
    if (initial.scope !== "personal" || !initial.generation || !same(initial, getContext()) || !same(binding, store.binding)
      || !same(binding, entry.selection.binding) || Object.keys(binding).some(key => initial[key] !== binding[key]) || outbox.hasPending()) fail();
  };
  assertCurrent();
  const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertCurrent();
  if (!inventory.entries.some(value => value.operationId === entry.selection.operationId && value.state === "unlinked")
    || inventory.entries.some(value => value.state !== "settled-retained" && !(value.operationId === entry.selection.operationId && value.state === "unlinked"))) fail();
  const saved = await store.read(entry.selection.operationId); assertCurrent();
  const body = await personalGuestSelectionBody(entry.selection, entry.intent); assertCurrent();
  if (!saved || !same(saved.action.body, body) || saved.action.operationId !== entry.selection.operationId) fail();
  // With no queue root, the selection's persisted base is the original local
  // observation, not a claim that the server still has that revision now.
  if (!outbox.recover()) outbox.adoptRemoteBaseline({ snapshot: entry.selection.basePayload, payload: entry.selection.basePayload,
    stateRevision: entry.selection.baseStateRevision });
  const candidate = { ...body }; delete candidate.causal;
  const plan = outbox.preparePhoto({ snapshot: saved.snapshot, payload: body.payload, body: candidate, operationId: entry.selection.operationId });
  if (!same(plan.action, saved.action) || !same(plan.mergeBase.payload, entry.selection.basePayload)) fail();
  assertCurrent();
  return outbox.capturePhoto({ plan, store, getContext });
}
