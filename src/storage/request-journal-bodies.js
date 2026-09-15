import { createPersonalDataRepository } from "./personal-data-repository.js";
import { canonicalOperationJson } from "../protocol/operation-identity.js";

const environment = "bike-packing-experiment";
const fail = () => new Error("Не удалось прочитать сохранённое действие. Исходные данные оставлены на устройстве.");
const digest = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
const binding = entry => ({ environment, actorId: entry.recovery.actorId,
  listId: entry.id, scopeKey: `id:${entry.recovery.actorId}` });
const key = entry => JSON.stringify([entry.id, entry.recovery.actorId, entry.recovery.listId, entry.recovery.payloadDigest]);

// Only the large request body moves. The synchronous transport marker remains
// the cross-tab barrier, and is published AFTER the body transaction and readback.
// Legacy records are untouched. A body is retired only after the transport has
// durably recorded a terminal receipt, which no longer needs the original body.
export function createRequestJournalBodies({ repository = createPersonalDataRepository({
  databaseName: "bike-packing-request-bodies-v1" }) } = {}) {
  const cache = new Map();
  const verify = async (entry, raw) => {
    const saved = entry.recovery;
    if (saved?.type !== "list" || saved.protocol !== "causal-v1" || saved.kind !== "list.update"
      || entry.id !== saved.operationId || !/^[a-f0-9]{64}$/.test(saved.payloadDigest || "")) throw fail();
    const body = JSON.parse(raw);
    if (await digest(canonicalOperationJson({ environment, actorId: saved.actorId,
      kind: saved.kind, listId: saved.listId, body })) !== saved.payloadDigest) throw fail();
    return body;
  };
  const read = async entry => {
    if (entry.bodyReference?.version !== 1 || Object.keys(entry.bodyReference).length !== 1) throw fail();
    const view = await repository.read(binding(entry));
    const row = view.entries.find(row => row.namespace === "snapshot" && row.key === "body");
    if (!row) throw fail();
    const body = await verify(entry, row.raw);
    cache.set(key(entry), body);
    return body;
  };
  return {
    async capture(entry) {
      const raw = canonicalOperationJson(entry.recovery.body);
      await verify(entry, raw);
      const owner = binding(entry), view = await repository.read(owner);
      if (view.entries.length === 0) await repository.commit(owner, { expectedRevision: view.revision,
        puts: [{ namespace: "snapshot", key: "body", raw }] });
      else if (view.entries.length !== 1 || view.entries[0].raw !== raw) throw fail();
      const compact = { ...entry, bodyReference: { version: 1 }, recovery: { ...entry.recovery } };
      delete compact.recovery.body;
      await read(compact);
      return compact;
    },
    async prepare(entries) {
      for (const entry of entries) if (entry.bodyReference && !entry.confirmed) await read(entry);
    },
    // Caller holds the same cross-tab lock used for body+marker publication.
    // A missing marker cannot be an in-progress publish under that lock.
    async pruneUnreferenced(hasMarker) {
      for (const owner of await repository.listBindings()) {
        if (hasMarker(owner.listId)) continue;
        const view = await repository.read(owner);
        if (view.entries.some(row => row.namespace === "snapshot" && row.key === "body")) {
          await repository.commit(owner, { expectedRevision: view.revision,
            deletes: [{ namespace: "snapshot", key: "body" }] });
        }
      }
    },
    async retire(entry) {
      if (!entry.confirmed || !entry.receipt || !entry.bodyReference) return false;
      const owner = binding(entry), view = await repository.read(owner);
      if (view.entries.some(row => row.namespace === "snapshot" && row.key === "body")) {
        await repository.commit(owner, { expectedRevision: view.revision,
          deletes: [{ namespace: "snapshot", key: "body" }] });
      }
      cache.delete(key(entry));
      return true;
    },
    hydrate(entry) {
      if (!entry.bodyReference || entry.confirmed) return entry;
      const body = cache.get(key(entry));
      // An unseen marker from another tab stays a barrier until prepare reads it.
      return { ...entry, recovery: { ...entry.recovery, ...(body ? { body: structuredClone(body) } : {}) } };
    },
  };
}

export function serializeRequestJournalEntry(entry) {
  if (!entry.bodyReference) return JSON.stringify(entry);
  const compact = { ...entry, recovery: { ...entry.recovery } };
  delete compact.recovery.body;
  return JSON.stringify(compact);
}
