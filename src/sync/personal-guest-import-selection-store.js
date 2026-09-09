import { PERSONAL_GUEST_IMPORT_ENABLED } from "./personal-guest-import-protocol.js";
import { personalArchiveJson, personalArchiveHash } from "./personal-archive-import-protocol.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { validateGuestLoginHandoff } from "../public/guest-login-handoff.js";

const clone = value => JSON.parse(JSON.stringify(value));
const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const blocked = (code, cause) => Object.assign(Error("Подготовленный гостевой перенос требует восстановления. Исходная работа сохранена."),
  { code: `guest-selection-${code}`, cause, isPersonalSaveBlocked: true });

// One immutable selection per complete sign-in handoff and personal binding.
// IndexedDB serializes competing tabs with a strict read/write transaction.
// An existing winner is returned unchanged, including its original base and
// all IDs. A reload must recover it before considering a fresh selection.
export function createPersonalGuestImportSelectionStore({ binding, getContext, indexedDB = globalThis.indexedDB,
  enabled = PERSONAL_GUEST_IMPORT_ENABLED } = {}) {
  if (binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || !id(binding.listId) || binding.scopeKey !== `id:${binding.actorId}` || Object.keys(binding).length !== 4) throw blocked("scope");
  binding = Object.freeze(clone(binding));
  const bindingKey = personalArchiveJson(binding), key = handoff => personalArchiveJson([binding, handoff]);
  const context = () => {
    const value = getContext?.();
    if (value?.scope !== "personal" || !value.generation || Object.keys(binding).some(key => binding[key] !== value[key])) throw blocked("context");
    return clone(value);
  };
  const assertCurrent = initial => { if (!same(context(), initial)) throw blocked("context"); };
  const validate = selection => {
    assertListOperationPayload({ ...binding, kind: "list.import", body: selection });
    if (selection?.version !== 1 || !same(selection.binding, binding) || !uuid(selection.operationId)
      || !Number.isSafeInteger(selection.validatedAt) || !Number.isSafeInteger(selection.baseStateRevision) || selection.baseStateRevision < 1
      || !selection.basePayload || !Array.isArray(selection.layoutTargets) || !selection.layoutTargets.length
      || !Array.isArray(selection.ownerTargets) || !Array.isArray(selection.photoTargets)
      || !validateGuestLoginHandoff(selection.handoff, { candidate: selection.candidate,
        user: { email: selection.handoff?.requestedEmail }, nowMs: selection.validatedAt }).ok) throw blocked("invalid");
  };
  const decode = async row => {
    if (!row || row.version !== 1 || row.bindingKey !== bindingKey || typeof row.selectionJson !== "string"
      || new TextEncoder().encode(row.selectionJson).byteLength > 3 * 1024 * 1024) throw blocked("corrupt");
    let selection;
    try { selection = JSON.parse(row.selectionJson); validate(selection); }
    catch (cause) { throw blocked("corrupt", cause); }
    if (row.key !== key(selection.handoff) || row.operationId !== selection.operationId
      || await personalArchiveHash(selection) !== row.selectionHash) throw blocked("corrupt");
    return selection;
  };
  const transaction = async (mode, initial, run) => {
    if (!indexedDB) throw blocked("unavailable");
    const db = await new Promise((resolve, reject) => {
      let abandoned = false;
      const request = indexedDB.open("bike-packing-personal-guest-selections-v1", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("selections", { keyPath: "key" });
        store.createIndex("binding", "bindingKey", { unique: false });
      };
      request.onerror = () => reject(blocked("open", request.error));
      request.onblocked = () => { abandoned = true; reject(blocked("open-blocked")); };
      request.onsuccess = () => {
        const result = request.result; result.onversionchange = () => result.close();
        if (abandoned) result.close(); else resolve(result);
      };
    });
    return new Promise((resolve, reject) => {
      let tx, value, error;
      try { assertCurrent(initial); tx = db.transaction("selections", mode, mode === "readwrite" ? { durability: "strict" } : undefined); }
      catch (cause) { db.close(); reject(cause); return; }
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onabort = () => { db.close(); reject(error || blocked("transaction", tx.error)); };
      tx.onerror = () => { error ||= blocked("transaction", tx.error); };
      const abort = cause => { error = cause; try { tx.abort(); } catch { db.close(); reject(cause); } };
      try { run(tx.objectStore("selections"), next => { value = next; }, abort); }
      catch (cause) { abort(cause); }
    });
  };
  return {
    binding,
    async capture(input) {
      if (!enabled) throw blocked("disabled");
      const initial = context(); validate(input);
      // The established handoff fingerprint covers source JSON insertion order.
      // Preserve those original bytes; canonical JSON is only used for hashing.
      const selection = clone(input), selectionJson = JSON.stringify(selection);
      const row = { version: 1, key: key(selection.handoff), bindingKey, operationId: selection.operationId,
        selectionJson, selectionHash: await personalArchiveHash(selection) };
      assertCurrent(initial);
      const saved = await transaction("readwrite", initial, (store, done, abort) => {
        const request = store.get(row.key);
        request.onsuccess = () => {
          try {
            assertCurrent(initial);
            if (request.result) done(request.result);
            else { store.add(row); done(row); }
          } catch (cause) { abort(cause); }
        };
      });
      const winner = await decode(saved); assertCurrent(initial);
      if (!same(winner.handoff, selection.handoff) || !same(winner.candidate, selection.candidate)
        || !same(winner.layoutTargets.map(target => [target.sourceId, target.name]), selection.layoutTargets.map(target => [target.sourceId, target.name]))) throw blocked("different-choice");
      return { selection: winner, reused: winner.operationId !== selection.operationId };
    },
    async read(handoff) {
      const initial = context(), frozen = clone(handoff);
      const row = await transaction("readonly", initial, (store, done) => {
        const request = store.get(key(frozen)); request.onsuccess = () => done(request.result);
      });
      const selection = row ? await decode(row) : null; assertCurrent(initial); return selection;
    },
    async list() {
      const initial = context();
      const rows = await transaction("readonly", initial, (store, done) => {
        const request = store.index("binding").getAll(bindingKey); request.onsuccess = () => done(request.result);
      });
      const selections = [];
      for (const row of rows) selections.push(await decode(row));
      assertCurrent(initial); return selections;
    }
  };
}
