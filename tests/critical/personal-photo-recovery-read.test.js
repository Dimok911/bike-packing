import test from "node:test";
import assert from "node:assert/strict";
import { readPersonalPhotoRecoveryInCurrentContext } from "../../src/sync/personal-photo-recovery-read.js";
import { createPersonalPublicImportSelectionStore } from "../../src/sync/personal-public-import-selection-store.js";
import { createPersonalServerImportSelectionStore } from "../../src/sync/personal-server-import-selection-store.js";

const binding = { environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a", scopeKey: "id:actor-a" };
const fixture = () => {
  const context = { ...binding, scope: "personal", generation: "before-layout-switch" };
  return { binding, context, getContext: () => context };
};

for (const [name, makeStore] of [["public", createPersonalPublicImportSelectionStore], ["server", createPersonalServerImportSelectionStore]]) {
  test(`${name} recovery rereads an empty journal when layout changes while awaiting its lock`, async () => {
    const f = fixture(); let locks = 0;
    const store = makeStore({ ...f, storage: { length: 0 }, locks: { request: async (_, run) => {
      if (++locks === 1) f.context.generation = "normalized-next-layout";
      return run();
    } } });
    const result = await readPersonalPhotoRecoveryInCurrentContext({ ...f, read: () => store.entries() });
    assert.deepEqual(result, []); assert.equal(locks, 2);
  });
}

test("discard a completed stale inventory and return only the new editor's read", async () => {
  const f = fixture(); let reads = 0;
  const result = await readPersonalPhotoRecoveryInCurrentContext({ ...f, read: async () => {
    if (++reads === 1) { f.context.generation = "new-layout"; return { entries: ["stale"] }; }
    return { entries: ["retained-action-needs-recovery"] };
  } });
  assert.equal(reads, 2); assert.deepEqual(result.entries, ["retained-action-needs-recovery"]);
});

for (const code of ["storage-unavailable", "photo-recovery-index", "public-selection-storage"]) {
  test(`a concurrent edit cannot disguise ${code} as a cancelled read`, async () => {
    const f = fixture(), failure = Object.assign(Error("original storage failure"), { code }); let reads = 0;
    await assert.rejects(readPersonalPhotoRecoveryInCurrentContext({ ...f, read: async () => {
      reads++; f.context.generation = "new-layout"; throw failure;
    } }), error => error === failure);
    assert.equal(reads, 1);
  });
}

for (const changed of [{ actorId: "actor-b", scopeKey: "id:actor-b" }, { listId: "list-b" }, { scope: "readonly" }]) {
  test(`do not retry or adopt inventory after switching ${Object.keys(changed).join("/")}`, async () => {
    const f = fixture(); let reads = 0;
    await assert.rejects(readPersonalPhotoRecoveryInCurrentContext({ ...f, read: async () => {
      reads++; Object.assign(f.context, changed); return [];
    } }), { code: "photo-recovery-superseded" });
    assert.equal(reads, 1);
  });
}

test("continuous changes pause without returning an unverified inventory", async () => {
  const f = fixture(); let reads = 0;
  await assert.rejects(readPersonalPhotoRecoveryInCurrentContext({ ...f, read: async () => {
    f.context.generation = `edit-${++reads}`; return [];
  } }), { code: "photo-recovery-superseded" });
  assert.equal(reads, 3);
});

test("a context failure without a changed generation remains an error", async () => {
  const f = fixture(), failure = Object.assign(Error("inconsistent reader"), {
    code: "photo-recovery-context", isPersonalPhotoRecoveryBlocked: true
  });
  await assert.rejects(readPersonalPhotoRecoveryInCurrentContext({ ...f, read: async () => { throw failure; } }), error => error === failure);
});


test("a receipt arriving during an inventory read refreshes the observation without latching a photo failure", async () => {
  const { createPersonalSaveOutbox } = await import("../../src/sync/personal-save-outbox.js");
  const { inspectPersonalPhotoRecovery } = await import("../../src/sync/personal-photo-recovery-inventory.js");
  const f = fixture(), rows = new Map();
  const storage = { get length() { return rows.size; }, key: i => [...rows.keys()][i],
    getItem: key => rows.get(key) ?? null, setItem: (key, raw) => rows.set(key, raw), removeItem: key => rows.delete(key) };
  const writer = createPersonalSaveOutbox({ ...binding, storage });
  const payload = { items: {}, containers: {}, layouts: {} };
  const record = writer.capture({ snapshot: payload, body: { payload, baseStateRevision: 1 } });
  let reads = 0, receiptArrived = false;
  const result = await readPersonalPhotoRecoveryInCurrentContext({ ...f, read: () => {
    reads++;
    return inspectPersonalPhotoRecovery({ getContext: f.getContext,
      outbox: createPersonalSaveOutbox({ ...binding, storage }), store: { binding, ids: async () => {
        if (!receiptArrived) {
          receiptArrived = true; writer.markApplied({ operationId: record.action.operationId, stateRevision: 2 }); writer.compact();
          writer.adoptRemoteBaseline({ payload, snapshot: payload, stateRevision: 2 });
        }
        return [];
      } } });
  } });
  assert.equal(reads, 2); assert.deepEqual(result.entries, []); assert.equal(writer.hasPending(), false);
});
