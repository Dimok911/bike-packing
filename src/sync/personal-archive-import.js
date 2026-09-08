import { personalArchiveImportPlan, personalArchiveBusinessPayload } from "./personal-archive-import-plan.js";
import { PERSONAL_ARCHIVE_IMPORT_ENABLED, personalArchiveHash, personalArchiveJson } from "./personal-archive-import-protocol.js";

const clone = value => JSON.parse(JSON.stringify(value));

// This is called before showing confirmation. The full source, destination,
// target IDs, names, metadata and operation ID are fixed before hashing awaits.
export async function preparePersonalArchiveImport({ source, mode, layoutTargets, sourceActiveLayoutId, editMeta,
  outbox, getContext, getState, getRevision, makeSnapshot, onCaptured,
  enabled = PERSONAL_ARCHIVE_IMPORT_ENABLED, operationId = crypto.randomUUID() }) {
  if (!enabled) throw Error("Импорт архива через очередь ещё не включён.");
  const context = clone(getContext()), previous = clone(getState()), revision = getRevision();
  const initial = { currentPayload: personalArchiveBusinessPayload(previous), sourcePayload: personalArchiveBusinessPayload(source),
    mode, layoutTargets: clone(layoutTargets || []), sourceActiveLayoutId: sourceActiveLayoutId || "", editMeta: clone(editMeta || {}) };
  const assertCurrent = () => {
    const now = getContext();
    if (context.scope !== "personal" || context.environment !== "bike-packing-experiment" || context.scopeKey !== `id:${context.actorId}`
      || Object.keys(context).some(key => context[key] !== now?.[key]) || getRevision() !== revision
      || ["actorId", "listId", "scopeKey", "environment"].some(key => outbox.binding[key] !== context[key])
      || personalArchiveJson(getState()) !== personalArchiveJson(previous)) throw Error("Аккаунт или данные изменились. Повторите выбор архива.");
    if (outbox.hasPending()) throw Error("Сначала подтвердите сохранённые изменения, затем повторите импорт архива.");
  };
  assertCurrent();
  const plan = personalArchiveImportPlan(initial), snapshot = clone(makeSnapshot(clone(plan.payload), previous, plan.activeLayoutId));
  if (personalArchiveJson(personalArchiveBusinessPayload(snapshot)) !== personalArchiveJson(plan.payload)) throw Error("Не удалось подготовить точный результат импорта.");
  const body = { payload: plan.payload, baseStateRevision: revision, archiveImport: { version: 1, mode,
    sourcePayload: initial.sourcePayload, sourceHash: await personalArchiveHash(initial.sourcePayload),
    layoutTargets: initial.layoutTargets, sourceActiveLayoutId: initial.sourceActiveLayoutId, editMeta: initial.editMeta,
    targetStateRevision: revision, payloadHash: await personalArchiveHash(plan.payload) } };
  assertCurrent();
  let used = false;
  return () => {
    if (used) return null;
    assertCurrent(); used = true;
    const record = outbox.capture({ snapshot, body, archiveImport: true, operationId });
    onCaptured(record); return record;
  };
}
