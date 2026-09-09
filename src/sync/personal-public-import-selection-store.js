import { PERSONAL_PUBLIC_ENTITY_COPY_ENABLED } from "./personal-public-entity-plan.js";
import { PERSONAL_PUBLIC_IMPORT_ENABLED, personalPublicImportSource, assertPersonalPublicImportBody,
  assertPersonalPublicImportHashes } from "./personal-public-import-protocol.js";
import { personalArchiveJson, personalArchiveHash } from "./personal-archive-import-protocol.js";
import { assertListOperationPayload } from "./list-operation-payload.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const fail = cause => { throw Object.assign(Error("Подготовленная копия шаблона требует восстановления. Её исходные данные сохранены."),
  { code: "public-selection-storage", cause, isPersonalSaveBlocked: true }); };

// Source selection and prepared action are separate immutable records. A full
// write is atomic; no retry deletes/replaces either original. Locks are scoped
// to this actor/list, so an unrelated list does not wait for this preparation.
export function createPersonalPublicImportSelectionStore({ binding, getContext, storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks, enabled = PERSONAL_PUBLIC_IMPORT_ENABLED, publicEntityEnabled = PERSONAL_PUBLIC_ENTITY_COPY_ENABLED } = {}) {
  if (binding?.environment !== "bike-packing-experiment" || !binding.actorId || binding.actorId.length > 36
    || !binding.listId || binding.scopeKey !== `id:${binding.actorId}` || Object.keys(binding).length !== 4) fail();
  binding = Object.freeze(clone(binding));
  const prefix = `bike-packing-public-selections-v1:${encodeURIComponent(personalArchiveJson(binding))}:`;
  const key = id => { if (!uuid(id)) fail(); return `${prefix}${id}:selection`; };
  const context = () => {
    const value = getContext?.();
    if (!value?.generation || value.scope !== "personal" || Object.keys(binding).some(key => value[key] !== binding[key])) fail();
    return clone(value);
  };
  const assertCurrent = initial => { if (!same(context(), initial)) fail(); };
  const validate = selection => {
    assertListOperationPayload({ ...binding, kind: "list.import", body: selection });
    if (![1, 2].includes(selection?.version) || !same(selection.binding, binding) || !uuid(selection.operationId)
      || !Number.isSafeInteger(selection.baseStateRevision) || selection.baseStateRevision < 1 || !selection.basePayload
      || !selection.sourcePayload || (selection.version === 2 ? !selection.copy : !Array.isArray(selection.layoutTargets) || !selection.layoutTargets.length)
      || !Array.isArray(selection.ownerTargets) || !Array.isArray(selection.photoTargets)) fail();
    personalPublicImportSource(selection.source);
  };
  const lock = (initial, run) => {
    if (!locks?.request) fail();
    return locks.request(prefix, async () => { assertCurrent(initial); const value = await run(); assertCurrent(initial); return value; });
  };
  const decode = async text => {
    let row;
    try {
      if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > 4 * 1024 * 1024) fail();
      row = JSON.parse(text); validate(row.selection);
      if (row.version !== 1 || Object.keys(row).length !== 3 || row.hash !== await personalArchiveHash(row.selection)) fail();
    } catch (cause) { fail(cause); }
    return row.selection;
  };
  const validateAction = async (selection, action) => {
    assertListOperationPayload(action);
    if (action?.kind !== "list.import" || action.operationId !== selection.operationId
      || Object.keys(binding).some(key => action[key] !== binding[key])) fail();
    const manifest = action.body?.publicImport;
    if (manifest?.version !== selection.version) fail();
    for (const key of ["source", "sourcePayload", selection.version === 2 ? "copy" : "layoutTargets", "ownerTargets", "photoTargets", "editMeta"]) if (!same(manifest?.[key], selection[key])) fail();
    assertPersonalPublicImportBody(action.body, { base: selection.basePayload, listId: binding.listId, operationId: action.operationId, causal: true });
    await assertPersonalPublicImportHashes(action.body);
  };
  const validateCompletion = async (action, proof) => {
    const operation = proof?.operation;
    if (proof?.historicalOnly !== true || operation?.id !== action.operationId || operation.kind !== "list.import"
      || ["environment", "actorId", "listId"].some(key => operation[key] !== binding[key])
      || !Number.isInteger(proof.resultStatus)
      || !(operation.state === "committed" && proof.resultStatus >= 200 && proof.resultStatus < 300
        && proof.stateRevision === action.body.baseStateRevision + 1
        || operation.state === "rejected" && [400, 403, 404, 409, 413, 422].includes(proof.resultStatus))
      || operation.payloadDigest !== await personalArchiveHash({ environment: binding.environment, actorId: binding.actorId,
        kind: action.kind, listId: binding.listId, body: action.body })) fail();
  };
  const writeOnce = (key, value) => {
    const existing = storage.getItem(key);
    if (existing !== null && existing !== value) fail();
    if (existing === null) {
      try { storage.setItem(key, value); } catch (cause) { fail(cause); }
      if (storage.getItem(key) !== value) fail();
    }
    return existing !== null;
  };
  const readEntry = async operationId => {
    const stored = storage.getItem(key(operationId)); if (stored === null) return null;
    const selection = await decode(stored); if (selection.operationId !== operationId) fail();
    const serialized = storage.getItem(`${key(operationId)}:action`); let action = null;
    if (serialized !== null) {
      let row;
      try {
        if (new TextEncoder().encode(serialized).byteLength > 4 * 1024 * 1024) fail();
        row = JSON.parse(serialized);
        if (row.version !== 1 || Object.keys(row).length !== 3 || row.hash !== await personalArchiveHash(row.action)) fail();
        await validateAction(selection, row.action);
      } catch (cause) { fail(cause); }
      action = row.action;
    }
    const completed = storage.getItem(`${key(operationId)}:completion`); let completion = null;
    if (completed !== null) {
      try {
        if (!action || new TextEncoder().encode(completed).byteLength > 4 * 1024 * 1024) fail();
        const row = JSON.parse(completed);
        if (row.version !== 1 || Object.keys(row).length !== 3 || row.hash !== await personalArchiveHash(row.proof)) fail();
        await validateCompletion(action, row.proof); completion = row.proof;
      } catch (cause) { fail(cause); }
    }
    return { selection, action, completion };
  };
  return {
    binding,
    async capture(input) {
      if (!enabled || input?.version === 2 && !publicEntityEnabled) fail();
      const initial = context(); validate(input); const selection = clone(input);
      const row = { version: 1, selection, hash: await personalArchiveHash(selection) }; assertCurrent(initial);
      return lock(initial, () => ({ selection, reused: writeOnce(key(selection.operationId), JSON.stringify(row)) }));
    },
    async rememberAction({ selection, action }) {
      if (!enabled || selection?.version === 2 && !publicEntityEnabled) fail();
      const initial = context(); validate(selection); selection = clone(selection);
      assertListOperationPayload(action); action = clone(action); await validateAction(selection, action);
      const row = { version: 1, action, hash: await personalArchiveHash(action) }; assertCurrent(initial);
      return lock(initial, async () => {
        const saved = await readEntry(selection.operationId); assertCurrent(initial);
        if (!saved || !same(saved.selection, selection)) fail();
        writeOnce(`${key(selection.operationId)}:action`, JSON.stringify(row)); return action;
      });
    },
    // A verified terminal marker remains available after ordinary outbox
    // compaction. Recording read-only receipt evidence also works on rollback.
    async confirm({ operationId, proof }) {
      const initial = context(); assertListOperationPayload({ ...binding, kind: "list.import", body: proof }); proof = clone(proof);
      return lock(initial, async () => {
        const saved = await readEntry(operationId); assertCurrent(initial);
        if (!saved?.action) fail(); await validateCompletion(saved.action, proof);
        const row = { version: 1, proof, hash: await personalArchiveHash(proof) }; assertCurrent(initial);
        writeOnce(`${key(operationId)}:completion`, JSON.stringify(row)); return proof;
      });
    },
    async read(operationId) { const initial = context(); return lock(initial, async () => (await readEntry(operationId))?.selection || null); },
    async recoveryRecords() {
      const initial = context();
      return lock(initial, () => {
        const rows = []; let size = 0;
        for (let index = 0; index < storage.length; index++) {
          const name = storage.key(index); if (!name?.startsWith(prefix)) continue;
          const text = storage.getItem(name); if (typeof text !== "string") fail();
          size += new TextEncoder().encode(text).byteLength; if (size > 256 * 1024 * 1024) fail();
          rows.push({ key: name.slice(prefix.length), text });
        }
        return rows.sort((a, b) => a.key.localeCompare(b.key));
      });
    },
    async entries() {
      const initial = context();
      return lock(initial, async () => {
        const ids = [];
        for (let index = 0; index < storage.length; index++) {
          const name = storage.key(index);
          if (name?.startsWith(prefix) && name.endsWith(":selection")) ids.push(name.slice(prefix.length, -10));
        }
        const entries = [];
        for (const operationId of ids) { const entry = await readEntry(operationId); if (!entry) fail(); entries.push(entry); }
        return entries;
      });
    },
  };
}
