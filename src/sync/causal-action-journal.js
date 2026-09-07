import { assertListOperationPayload } from "./list-operation-payload.js";

// Action-creation primitive for the disabled causal pilot. UI adapters must
// explicitly use it; legacy saveState does NOT yet record a complete user DAG.
const environment = "bike-packing-experiment";
const prefix = "bike-packing-causal-actions-v1";
const clone = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error(message); };
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const target = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "constructor", "prototype"].includes(value);

export function createCausalActionJournal({ storage, locks = globalThis.navigator?.locks, actorId,
  environmentId = environment } = {}) {
  if (!actorId || environmentId !== environment) fail("Invalid causal journal scope");
  const key = `${prefix}:${environment}:${actorId}`;
  const read = () => {
    if (!storage) fail("Durable action storage unavailable");
    const raw = storage.getItem(key);
    const journal = raw == null ? { version: 1, environment, actorId, actions: {}, heads: {} } : JSON.parse(raw);
    if (journal.version !== 1 || journal.environment !== environment || journal.actorId !== actorId
      || !journal.actions || !journal.heads) fail("Unreadable or mismatched causal journal");
    return journal;
  };
  return {
    list: () => clone(Object.values(read().actions)),
    async enqueue({ operationId = crypto.randomUUID(), kind, listId, body = {}, sourceReads = [] }) {
      // Snapshot BEFORE waiting for another tab. No later copy from live state.
      const input = clone({ operationId, kind, listId, body, sourceReads });
      if (!uuid(operationId) || !["list.create", "list.update", "list.restore", "list.delete", "items.sync", "containers.sync", "layouts.sync", "dictionaries.sync", "photos.mutate"].includes(kind)
        || !target(listId) || !body || typeof body !== "object" || Array.isArray(body) || body.causal !== undefined
        || !Array.isArray(sourceReads) || sourceReads.length > 32) fail("Invalid causal action");
      if (!locks?.request) fail("Cross-tab action lock unavailable");
      return locks.request(key, () => {
        const journal = read();
        const inputJson = JSON.stringify(input);
        const existing = journal.actions[operationId];
        if (existing) {
          if (existing.inputJson !== inputJson) fail("Action ID reused with different inputs");
          return clone(existing);
        }
        const head = journal.heads[listId] || { generation: 0, writer: null, readers: [] };
        if (head.deleted) fail("Deleted object ID cannot be reused");
        const deps = new Map(), reads = [];
        const depend = predecessor => {
          if (!predecessor) return;
          const action = journal.actions[predecessor];
          if (!action) fail("Missing journal predecessor");
          deps.set(predecessor, { operationId: predecessor, listId: action.listId });
        };
        depend(head.writer);
        for (const reader of head.readers) depend(reader);
        const sources = new Set();
        for (const source of input.sourceReads) {
          if (!target(source?.listId) || sources.has(source.listId) || source.listId === listId) fail("Invalid source read set");
          sources.add(source.listId);
          const sourceHead = journal.heads[source.listId] || { generation: 0, writer: null, readers: [] };
          if (sourceHead.deleted) fail("Cannot derive from a deleted source");
          if (sourceHead.writer) {
            depend(sourceHead.writer);
            reads.push({ listId: source.listId, operationId: sourceHead.writer });
          } else {
            if (!Number.isSafeInteger(source.revision) || source.revision < 1) fail("Source revision required");
            reads.push({ listId: source.listId, revision: source.revision });
          }
          // Subsequent writes/deletes of A wait until a copy has consumed A.
          journal.heads[source.listId] = { ...sourceHead, readers: [...sourceHead.readers, operationId] };
        }
        if (deps.size > 32) fail("Dependency fan-in limit; action was not saved");
        const causal = { dependsOn: [...deps.values()], reads,
          ...(head.writer && kind !== "list.create" ? { baseOperationId: head.writer } : {}) };
        if (kind !== "list.create" && !head.writer && (!Number.isSafeInteger(input.body.baseStateRevision) || input.body.baseStateRevision < 1)) fail("Target base revision required");
        const action = { operationId, actorId, environment, kind, listId, generation: head.generation + 1,
          body: { ...input.body, causal }, inputJson };
        assertListOperationPayload(action);
        journal.actions[operationId] = action;
        journal.heads[listId] = { generation: action.generation, writer: operationId, readers: [], deleted: kind === "list.delete" };
        // One synchronous replacement under a short lock, before any dispatch.
        storage.setItem(key, JSON.stringify(journal));
        return clone(action);
      });
    },
  };
}
