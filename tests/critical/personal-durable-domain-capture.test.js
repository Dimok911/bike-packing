import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { preparePersonalArchiveImport } from "../../src/sync/personal-archive-import.js";
import { preparePersonalHistoryRestore } from "../../src/sync/personal-history-restore.js";
import { preparePersonalListMigration } from "../../src/sync/personal-list-migration.js";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";

const hash = value => createHash("sha256").update(canonicalListOperationJson(value)).digest("hex");
const layout = id => ({ id, name: id, rootContainerIds: [],
  arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} } });

async function fixture(kind) {
  const context = { environment: "bike-packing-experiment", actorId: "actor", listId: "list",
    scopeKey: "id:actor", scope: "personal", generation: "before" };
  const state = { items: {}, containers: {}, layouts: { current: layout("current") }, locations: [], categories: [] };
  const payload = { ...structuredClone(state), items: { item: { id: "item", name: "Selected item" } } };
  const adopted = [];
  let complete, reject, captured, persisted = false, attempts = 0;
  const outbox = {
    binding: context, hasPending: () => persisted, recover: () => persisted ? captured : null,
    capture(input) {
      attempts++; captured = structuredClone(input);
      return new Promise((yes, no) => {
        complete = () => { persisted = true; yes(captured); }; reject = no;
      });
    }
  };
  const options = { outbox, getContext: () => context, getState: () => state, getRevision: () => 5,
    makeSnapshot: value => value, onCaptured: record => adopted.push(record) };
  let commit;
  if (kind === "archive") commit = await preparePersonalArchiveImport({ ...options,
    source: payload, mode: "full", sourceActiveLayoutId: "current", enabled: true });
  if (kind === "history") commit = await preparePersonalHistoryRestore({ ...options, historyId: 12,
    readPreview: async () => ({ ok: true, ...context, restore: { baseStateRevision: 5, payload,
      historyRestore: { version: 1, historyId: 12, historyPayloadHash: "a".repeat(64), layoutIds: [],
        targetStateRevision: 5, payloadHash: hash(payload) } } }) });
  if (kind === "migration") commit = await preparePersonalListMigration({ ...options, hasLocalChanges: () => false,
    readPreview: async () => ({ ok: true, ...context, migration: { baseStateRevision: 5, payload,
      migration: { version: 1, legacyPayloadHash: "a".repeat(64), projectedPayloadHash: hash(payload) } } }) });
  return { context, adopted, commit, complete: () => complete(), reject: error => reject(error), attempts: () => attempts };
}

for (const kind of ["archive", "history", "migration"]) {
  test(`${kind} waits for durable capture before adopting UI and retains one operation`, async () => {
    const f = await fixture(kind), result = f.commit();
    assert.equal(typeof result.then, "function");
    assert.equal(f.adopted.length, 0);
    assert.equal(f.commit(), null);
    f.complete();
    assert.deepEqual(f.adopted, []);
    const record = await result;
    assert.deepEqual(f.adopted, [record]);
    assert.equal(f.attempts(), 1);
  });

  test(`${kind} capture quota failure cannot adopt UI or allocate another operation`, async () => {
    const f = await fixture(kind), result = f.commit();
    f.reject(new DOMException("Quota", "QuotaExceededError"));
    await assert.rejects(result, { name: "QuotaExceededError" });
    assert.deepEqual(f.adopted, []);
    assert.equal(f.commit(), null);
    assert.equal(f.attempts(), 1);
  });

  test(`${kind} delayed durable result cannot replace a changed editor`, async () => {
    const f = await fixture(kind), result = f.commit();
    f.context.generation = "changed";
    f.complete();
    await assert.rejects(result, /изменились/);
    assert.deepEqual(f.adopted, []);
    assert.equal(f.attempts(), 1);
  });
}
