import { PERSONAL_PUBLIC_ENTITY_COPY_ENABLED } from "./personal-public-entity-plan.js";
import { PERSONAL_PUBLIC_IMPORT_ENABLED, personalPublicImportSource, assertPersonalPublicImportBody,
  assertPersonalPublicImportHashes } from "./personal-public-import-protocol.js";
import { personalArchiveJson, personalArchiveHash } from "./personal-archive-import-protocol.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { PERSONAL_PUBLIC_PREPARATION_RESOLUTION_ENABLED, assertPublicPreparationNativeSettlement } from "./personal-public-preparation-resolution-protocol.js";

export const PERSONAL_PUBLIC_PREPARATION_CHOICE_ENABLED = false;

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const publicAdapter = { prefix: "bike-packing-public-selections-v1", code: "public-selection-storage", manifestKey: "publicImport",
  parseSource: personalPublicImportSource, assertBody: assertPersonalPublicImportBody, assertHashes: assertPersonalPublicImportHashes,
  assertNativeSettlement: assertPublicPreparationNativeSettlement };

// Source selection and prepared action are separate immutable records. A full
// write is atomic; no retry deletes/replaces either original. Locks are scoped
// to this actor/list, so an unrelated list does not wait for this preparation.
export function createPersonalPublicImportSelectionStore(options = {}) {
  return createPersonalRemoteImportSelectionStore(options, publicAdapter);
}

export function createPersonalRemoteImportSelectionStore({ binding, getContext, storage = globalThis.localStorage,
  locks = globalThis.navigator?.locks, enabled = PERSONAL_PUBLIC_IMPORT_ENABLED, publicEntityEnabled = PERSONAL_PUBLIC_ENTITY_COPY_ENABLED,
  choiceEnabled = PERSONAL_PUBLIC_PREPARATION_CHOICE_ENABLED, resolutionEnabled = PERSONAL_PUBLIC_PREPARATION_RESOLUTION_ENABLED } = {}, adapter) {
  const fail = cause => { throw Object.assign(Error("Подготовленная копия требует восстановления. Её исходные данные сохранены."),
    { code: adapter.code, cause, isPersonalSaveBlocked: true }); };
  if (binding?.environment !== "bike-packing-experiment" || !binding.actorId || binding.actorId.length > 36
    || !binding.listId || binding.scopeKey !== `id:${binding.actorId}` || Object.keys(binding).length !== 4) fail();
  binding = Object.freeze(clone(binding));
  const prefix = `${adapter.prefix}:${encodeURIComponent(personalArchiveJson(binding))}:`;
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
    adapter.parseSource(selection.source);
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
    const manifest = action.body?.[adapter.manifestKey];
    if (manifest?.version !== selection.version) fail();
    for (const key of ["source", "sourcePayload", selection.version === 2 ? "copy" : "layoutTargets", "ownerTargets", "photoTargets", "editMeta"]) if (!same(manifest?.[key], selection[key])) fail();
    adapter.assertBody(action.body, { base: selection.basePayload, listId: binding.listId, operationId: action.operationId, causal: true });
    await adapter.assertHashes(action.body);
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
    const entry = { selection, action, completion }, settled = storage.getItem(`${key(operationId)}:native-settlement`);
    if (settled !== null) {
      try {
        if (new TextEncoder().encode(settled).byteLength > 4 * 1024 * 1024) fail();
        const row = JSON.parse(settled);
        if (row.version !== 1 || Object.keys(row).length !== 3 || row.hash !== await personalArchiveHash(row.settlement)) fail();
        entry.nativeSettlement = adapter.assertNativeSettlement(entry, row.settlement);
      } catch (cause) { fail(cause); }
    }
    return entry;
  };
  // A choice retains every original row. It can retire only selection-only
  // alternatives: remembering an action and choosing share this same lock.
  // No receipt, server cancellation, or permission to remove files is implied.
  const readEntries = async () => {
    const entries = [], choices = [];
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index);
      if (!name?.startsWith(prefix)) continue;
      if (name.endsWith(":selection")) {
        const entry = await readEntry(name.slice(prefix.length, -10)); if (!entry) fail(); entries.push(entry);
      } else if (name.startsWith(`${prefix}choice:`)) choices.push({ name, text: storage.getItem(name) });
    }
    const byId = new Map(entries.map(entry => [entry.selection.operationId, entry])), retained = new Map();
    for (const stored of choices) {
      try {
        if (typeof stored.text !== "string" || new TextEncoder().encode(stored.text).byteLength > 4 * 1024 * 1024) fail();
        const row = JSON.parse(stored.text), choice = row.choice;
        if (row.version !== 1 || Object.keys(row).length !== 3 || ![1, 2].includes(choice?.version) || Object.keys(choice).length !== 4
          || !same(choice.binding, binding) || !Array.isArray(choice.candidates)
          || (choice.version === 1 ? !uuid(choice.selectedOperationId) || choice.candidates.length < 2
            || !choice.candidates.some(value => value.operationId === choice.selectedOperationId) : choice.selectedOperationId !== null || choice.candidates.length !== 1)
          || new Set(choice.candidates.map(value => value.operationId)).size !== choice.candidates.length
          || row.hash !== await personalArchiveHash(choice) || stored.name !== `${prefix}choice:${row.hash}`) fail();
        for (const candidate of choice.candidates) {
          const entry = byId.get(candidate.operationId);
          if (!entry || Object.keys(candidate).length !== 2 || candidate.selectionHash !== await personalArchiveHash(entry.selection)) fail();
          if (candidate.operationId === choice.selectedOperationId) continue;
          if (entry.action || entry.completion || retained.has(candidate.operationId)) fail();
          retained.set(candidate.operationId, choice.selectedOperationId);
        }
      } catch (cause) { fail(cause); }
    }
    for (const [id, selectedOperationId] of retained) {
      const seen = new Set([id]); let next = selectedOperationId;
      while (next) { if (seen.has(next)) fail(); seen.add(next); next = retained.get(next); }
      byId.get(id).retainedAlternative = { version: 1, selectedOperationId };
    }
    return entries;
  };
  return {
    binding,
    async capture(input) {
      if (!enabled || input?.version === 2 && !publicEntityEnabled) fail();
      const initial = context(); validate(input); const selection = clone(input);
      const row = { version: 1, selection, hash: await personalArchiveHash(selection) }; assertCurrent(initial);
      return lock(initial, async () => {
        if ((await readEntries()).some(entry => entry.selection.operationId === selection.operationId && entry.retainedAlternative)) fail();
        assertCurrent(initial); return { selection, reused: writeOnce(key(selection.operationId), JSON.stringify(row)) };
      });
    },
    async rememberAction({ selection, action }) {
      if (!enabled || selection?.version === 2 && !publicEntityEnabled) fail();
      const initial = context(); validate(selection); selection = clone(selection);
      assertListOperationPayload(action); action = clone(action); await validateAction(selection, action);
      const row = { version: 1, action, hash: await personalArchiveHash(action) }; assertCurrent(initial);
      return lock(initial, async () => {
        const saved = (await readEntries()).find(entry => entry.selection.operationId === selection.operationId); assertCurrent(initial);
        if (!saved || saved.retainedAlternative || !same(saved.selection, selection)) fail();
        if (saved.action) {
          if (!same(saved.action, action)) fail();
          return clone(saved.action); // Keep the original bytes; JSON key order is not a different action.
        }
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
    async retainPreparation({ entry, assertCurrent: assertEditor }) {
      if (!resolutionEnabled || !enabled || entry?.selection?.version === 2 && !publicEntityEnabled || typeof assertEditor !== "function") fail();
      const initial = context(), expected = clone(entry);
      return lock(initial, async () => {
        const saved = (await readEntries()).find(value => value.selection.operationId === expected.selection.operationId);
        if (!saved || saved.action || saved.completion || saved.retainedAlternative || !same(saved, expected)) fail();
        const choice = { version: 2, binding, selectedOperationId: null,
          candidates: [{ operationId: saved.selection.operationId, selectionHash: await personalArchiveHash(saved.selection) }] };
        const row = { version: 1, choice, hash: await personalArchiveHash(choice) };
        assertCurrent(initial); assertEditor(); writeOnce(`${prefix}choice:${row.hash}`, JSON.stringify(row));
        return { retained: true };
      });
    },
    async confirmNativeSettlement({ operationId, settlement }) {
      const initial = context(); settlement = clone(settlement);
      return lock(initial, async () => {
        const saved = await readEntry(operationId); assertCurrent(initial);
        adapter.assertNativeSettlement(saved, settlement);
        if (saved.nativeSettlement) {
          if (saved.nativeSettlement.intentHash !== settlement.intentHash) fail();
          return clone(saved.nativeSettlement); // The first exact historical stage proofs remain immutable.
        }
        const row = { version: 1, settlement, hash: await personalArchiveHash(settlement) }; assertCurrent(initial);
        writeOnce(`${key(operationId)}:native-settlement`, JSON.stringify(row)); return settlement;
      });
    },
    async choosePreparation({ entries, operationId, assertCurrent: assertEditor }) {
      if (!choiceEnabled || !enabled || !Array.isArray(entries) || entries.length < 2 || typeof assertEditor !== "function") fail();
      const initial = context(), expected = clone(entries);
      return lock(initial, async () => {
        const current = (await readEntries()).filter(entry => !entry.completion && !entry.retainedAlternative);
        if (current.length !== expected.length || current.some(entry => entry.action || entry.selection.version === 2 && !publicEntityEnabled
          || !expected.some(value => same(value, entry))) || !current.some(entry => entry.selection.operationId === operationId)) fail();
        const choice = { version: 1, binding, selectedOperationId: operationId, candidates: [] };
        for (const entry of current) choice.candidates.push({ operationId: entry.selection.operationId, selectionHash: await personalArchiveHash(entry.selection) });
        // Stable serialization of a set is not an inferred execution order.
        choice.candidates.sort((a, b) => a.operationId.localeCompare(b.operationId));
        const row = { version: 1, choice, hash: await personalArchiveHash(choice) };
        assertCurrent(initial); assertEditor(); writeOnce(`${prefix}choice:${row.hash}`, JSON.stringify(row));
        return clone(current.find(entry => entry.selection.operationId === operationId));
      });
    },
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
      return lock(initial, readEntries);
    },
  };
}
