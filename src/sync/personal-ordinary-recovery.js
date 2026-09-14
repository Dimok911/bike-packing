export const PERSONAL_ORDINARY_RECOVERY_ENABLED = false;
const environment = "bike-packing-experiment";
const prefix = "bike-packing-personal-ordinary-recovery-v1:";
const plain = value => value && typeof value === "object" && !Array.isArray(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : plain(value)
  ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const clone = value => JSON.parse(JSON.stringify(value));
export const ordinaryRecoveryBlocked = () => Object.assign(new Error("Выбрана серверная версия. Исходные действия сохранены для восстановления; сначала нужно завершить их проверку."),
  { code: "ordinary-recovery", isPersonalSaveBlocked: true, isOperationReceiptError: true });
const fail = () => { throw ordinaryRecoveryBlocked(); };
const publicationError = (stage, reason, cause) => {
  if (["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(cause?.name)) reason = "quota";
  const message = stage === "archive"
    ? reason === "quota"
      ? "Не хватает места на устройстве для копии восстановления. Серверная версия не загружена; исходные действия остались на устройстве. Не очищайте данные сайта."
      : "Не удалось подтвердить сохранение копии восстановления на устройстве. Серверная версия не загружена; исходные действия остались на устройстве."
    : reason === "quota"
      ? "Не хватает места на устройстве для отметки завершения восстановления. Копия исходных действий и выбранная серверная версия сохранены; проверку нужно завершить. Не очищайте данные сайта."
      : "Не удалось подтвердить запись отметки завершения восстановления. Копия исходных действий и выбранная серверная версия сохранены; проверку нужно завершить.";
  return Object.assign(new Error(message), { code: "ordinary-recovery-storage", stage, reason,
    isPersonalSaveBlocked: true, isOperationReceiptError: true });
};
const same = (a, b) => canonical(a) === canonical(b);
const bindingOf = value => {
  const binding = { environment: value?.environment, actorId: value?.actorId, listId: value?.listId, scopeKey: value?.scopeKey };
  if (binding.environment !== environment || binding.scopeKey !== `id:${binding.actorId}`
    || ![binding.actorId, binding.listId].every(id => typeof id === "string" && id.trim() === id && id.length > 0 && id.length <= 191)) fail();
  return binding;
};
const outboxPrefix = binding => `bike-packing-personal-save-v1:${encodeURIComponent(JSON.stringify(binding))}:`;
const archivedRecords = archive => new Map(archive.operationIds.map(id => {
  const entry = archive.entries.find(entry => entry.key === outboxPrefix(archive.binding) + id);
  if (!entry) fail(); const record = JSON.parse(entry.value);
  return [id, record];
}));

export function validPersonalOrdinaryRecoveryDecision(record, records, archive) {
  try {
    const decision = record?.reconciliation?.decision, action = record?.action, base = record?.mergeBase;
    if (!archive || decision?.version !== 1 || decision.type !== "keep-server-after-stopped-ordinary"
      || Object.keys(decision).length !== 4 || decision.recoveryId !== archive.recoveryId || !revision(decision.stateRevision)
      || action?.operationId !== archive.successorOperationId || action.previousLocalOperationId !== archive.headOperationId
      || action.generation !== archive.headGeneration + 1 || action.kind !== "list.update"
      || !same(bindingOf(action), archive.binding) || base?.stateRevision !== decision.stateRevision
      || action.body?.baseStateRevision !== decision.stateRevision || action.body.stateRevision !== decision.stateRevision
      || !same(action.body.payload, base.payload) || !same(action.body.causal, { dependsOn: [], reads: [] })
      || !["force", "forceOverwrite", "fullReplace"].every(key => action.body[key] === false)
      || Object.keys(action.body).some(key => !["payload", "baseStateRevision", "stateRevision", "baseServerUpdatedAt", "force", "forceOverwrite", "fullReplace", "causal"].includes(key))) return false;
    const proofs = record.reconciliation.settled;
    if (!Array.isArray(proofs) || proofs.length !== archive.operationIds.length) return false;
    const originals = archivedRecords(archive);
    return proofs.every((proof, index) => {
      const id = archive.operationIds[index], original = records.get(id)?.action, operation = proof?.operation;
      return original?.kind === "list.update" && same(bindingOf(original), archive.binding)
        && same(original, originals.get(id)?.action)
        && proof.historicalOnly === true && operation?.id === id && operation.kind === original.kind
        && same(bindingOf({ ...operation, scopeKey: archive.binding.scopeKey }), archive.binding)
        && /^[a-f0-9]{64}$/.test(operation.payloadDigest || "")
        && (operation.state === "committed" ? proof.resultStatus >= 200 && proof.resultStatus < 300
          && revision(proof.stateRevision) && proof.stateRevision <= base.stateRevision
          : operation.state === "rejected" && [400, 403, 404, 409, 413, 422].includes(proof.resultStatus)
          && (proof.rejectionCode !== "operation_cancelled" || proof.resultStatus === 409 && proof.cancellation?.version === 1
            && proof.cancellation.operationId === id && proof.cancellation.noBusinessEffects === true && proof.cancellation.operationCannotApply === true));
    });
  } catch { return false; }
}

export function createPersonalOrdinaryRecoveryStore({ storage, binding: rawBinding }) {
  const binding = bindingOf(rawBinding), keyPrefix = `${prefix}${encodeURIComponent(JSON.stringify(binding))}:`;
  const parseArchive = (raw, key) => {
    const archive = JSON.parse(raw);
    if (archive?.version !== 1 || archive.format !== "bike-packing-personal-ordinary-recovery-v1" || !same(archive.binding, binding)
      || !same(archive.choice, { type: "server" })
      || !uuid(archive.recoveryId) || !uuid(archive.successorOperationId) || key !== `${keyPrefix}archive:${archive.recoveryId}`
      || !revision(archive.headGeneration) || !Array.isArray(archive.operationIds) || !archive.operationIds.length
      || archive.operationIds.some(id => !uuid(id) || id === archive.successorOperationId)
      || new Set(archive.operationIds).size !== archive.operationIds.length || archive.operationIds.at(-1) !== archive.headOperationId
      || !Array.isArray(archive.entries) || !plain(archive.snapshot)
      || archive.entries.some(entry => typeof entry.key !== "string" || !entry.key.startsWith(outboxPrefix(binding)) || typeof entry.value !== "string")
      || new Set(archive.entries.map(entry => entry.key)).size !== archive.entries.length) fail();
    for (const [id, record] of archivedRecords(archive)) if (record.action?.operationId !== id || record.action.kind !== "list.update"
      || !same(bindingOf(record.action), binding)) fail();
    return archive;
  };
  const read = () => {
    try {
      if (!storage || typeof storage.getItem !== "function" || typeof storage.key !== "function"
        || !Number.isSafeInteger(storage.length) || storage.length < 0) fail();
      const entries = new Map();
      const scan = () => {
        const found = new Map();
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i); if (typeof key !== "string") fail();
          if (key.startsWith(keyPrefix)) { const raw = storage.getItem(key); if (typeof raw !== "string") fail(); found.set(key, raw); }
        }
        return found;
      };
      for (const [key, value] of scan()) entries.set(key, value);
      if (!same([...entries].sort(), [...scan()].sort())) fail();
      const archives = [];
      for (const [key, raw] of entries) {
        if (!key.startsWith(`${keyPrefix}archive:`)) continue;
        const archive = parseArchive(raw, key), completionRaw = entries.get(`${keyPrefix}complete:${archive.recoveryId}`);
        let completion = null;
        if (completionRaw !== undefined) {
          completion = JSON.parse(completionRaw);
          if (completion?.version !== 1 || completion.recoveryId !== archive.recoveryId || typeof completion.recordRaw !== "string"
            || Object.keys(completion).length !== 3 || !validPersonalOrdinaryRecoveryDecision(JSON.parse(completion.recordRaw), archivedRecords(archive), archive)) fail();
        }
        archives.push({ archive, raw, completed: Boolean(completion), completion });
      }
      if ([...entries.keys()].some(key => !archives.some(entry => key === `${keyPrefix}archive:${entry.archive.recoveryId}`
        || key === `${keyPrefix}complete:${entry.archive.recoveryId}`))) fail();
      const pending = archives.filter(entry => !entry.completed); if (pending.length > 1) fail();
      return { archives, pending: pending[0] || null };
    } catch { fail(); }
  };
  const publish = (key, value, stage) => {
    const raw = JSON.stringify(value);
    let existing;
    try { existing = storage.getItem(key); }
    catch (error) { throw publicationError(stage, "storage-read", error); }
    if (existing !== null) fail();
    try { storage.setItem(key, raw); }
    catch (error) { throw publicationError(stage, "storage-write", error); }
    let written;
    try { written = storage.getItem(key); }
    catch (error) { throw publicationError(stage, "storage-read", error); }
    if (written !== raw) throw publicationError(stage, "write-unverified");
    return raw;
  };
  return {
    read,
    archive(recoveryId) { return clone(read().archives.find(entry => entry.archive.recoveryId === recoveryId)?.archive || null); },
    prepare({ entries, snapshot, operationIds, headOperationId, headGeneration }) {
      if (read().pending) fail();
      const archive = { format: "bike-packing-personal-ordinary-recovery-v1", version: 1, binding, choice: { type: "server" }, recoveryId: crypto.randomUUID(),
        successorOperationId: crypto.randomUUID(), headOperationId, headGeneration, operationIds, entries, snapshot };
      const key = `${keyPrefix}archive:${archive.recoveryId}`;
      parseArchive(JSON.stringify(archive), key); const raw = publish(key, archive, "archive");
      const pending = read().pending; if (!pending || pending.raw !== raw) fail();
      return clone(archive);
    },
    complete(archive, recordRaw) {
      const current = read(), stored = current.archives.find(entry => entry.archive.recoveryId === archive.recoveryId);
      if (!stored || !same(stored.archive, archive) || !validPersonalOrdinaryRecoveryDecision(JSON.parse(recordRaw), archivedRecords(archive), archive)) fail();
      if (storage.getItem(outboxPrefix(binding) + archive.successorOperationId) !== recordRaw) fail();
      if (stored.completed) return;
      publish(`${keyPrefix}complete:${archive.recoveryId}`, { version: 1, recoveryId: archive.recoveryId, recordRaw }, "completion");
      if (!read().archives.find(entry => entry.archive.recoveryId === archive.recoveryId)?.completed) fail();
    }
  };
}

export function assertOrdinaryRecoveryDispatchAllowed({ storage, binding, operationId }) {
  const state = createPersonalOrdinaryRecoveryStore({ storage, binding }).read();
  if (state.pending || operationId && state.archives.some(entry => entry.archive.operationIds.includes(operationId))) fail();
}
