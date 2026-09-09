import { PERSONAL_PUBLIC_ENTITY_COPY_ENABLED } from "./personal-public-entity-plan.js";
import { PERSONAL_PUBLIC_IMPORT_ENABLED, assertPersonalPublicImportBody, assertPersonalPublicImportHashes } from "./personal-public-import-protocol.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const fail = () => { throw Object.assign(Error("Сохранённая копия шаблона требует проверки. Её исходные данные сохранены."), { code: "public-link-recovery", isPersonalSaveBlocked: true }); };

// Explicit local recovery after selection/action preparation or a native file
// commit. It links only the original action, without downloads or server writes.
export async function recoverPersonalPublicImportLink({ entry, outbox, store, getContext, makeSnapshot,
  enabled = PERSONAL_PUBLIC_IMPORT_ENABLED, publicEntityEnabled = PERSONAL_PUBLIC_ENTITY_COPY_ENABLED }) {
  if (!enabled || entry?.selection.version === 2 && !publicEntityEnabled || !entry?.action || entry.completion || !outbox || !store) fail();
  entry = structuredClone(entry);
  const initial = structuredClone(getContext()), binding = outbox.binding, { selection, action } = entry;
  const assertCurrent = () => {
    if (initial.scope !== "personal" || !initial.generation || !same(initial, getContext()) || !same(binding, store.binding)
      || !same(binding, selection.binding) || Object.keys(binding).some(key => initial[key] !== binding[key]) || outbox.hasPending()) fail();
  };
  assertCurrent();
  if (action.kind !== "list.import" || action.operationId !== selection.operationId || Object.keys(binding).some(key => action[key] !== binding[key])) fail();
  if (action.body.publicImport?.version !== selection.version) fail();
  for (const key of ["source", "sourcePayload", selection.version === 2 ? "copy" : "layoutTargets", "ownerTargets", "photoTargets", "editMeta"])
    if (!same(action.body.publicImport?.[key], selection[key])) fail();
  const compiled = assertPersonalPublicImportBody(action.body, { base: selection.basePayload, listId: binding.listId, operationId: action.operationId, causal: true });
  await assertPersonalPublicImportHashes(action.body); assertCurrent();
  const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertCurrent();
  if (inventory.entries.some(value => value.state !== "settled-retained" && !(value.operationId === selection.operationId && value.state === "unlinked"))) fail();
  const files = action.body.publicImport.files.length;
  const saved = files ? await store.read(selection.operationId) : null; assertCurrent();
  if (files && (!saved || !same(saved.action, action))) fail();
  const snapshot = saved?.snapshot || makeSnapshot?.(structuredClone(compiled.payload), structuredClone(selection.basePayload), compiled.activeLayoutId);
  if (!snapshot) fail();
  // The persisted base is the original local observation. Only the causal
  // server queue can establish whether that revision is still current.
  if (!outbox.recover()) outbox.adoptRemoteBaseline({ snapshot: selection.basePayload, payload: selection.basePayload, stateRevision: selection.baseStateRevision });
  const body = structuredClone(action.body); delete body.causal;
  const plan = outbox.preparePhoto({ snapshot, payload: body.payload, body, operationId: selection.operationId });
  if (!same(plan.action, action) || !same(plan.mergeBase.payload, selection.basePayload)) fail();
  assertCurrent(); return outbox.capturePhoto({ plan, store, getContext });
}
