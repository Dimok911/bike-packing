import test from "node:test";
import assert from "node:assert/strict";
import { createCausalActionJournal } from "../../src/sync/causal-action-journal.js";

function fixture() {
  const values = new Map(), tails = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const locks = { request: (key, callback) => {
    const result = (tails.get(key) || Promise.resolve()).catch(() => {}).then(callback); tails.set(key, result); return result;
  } };
  return { storage, locks, make: () => createCausalActionJournal({ storage, locks, actorId: "actor-a" }) };
}

test("action creation records write/read dependencies, freezes copy inputs, and survives reload without clock ordering", async () => {
  const f = fixture(), journal = f.make();
  const update = await journal.enqueue({ kind: "list.update", listId: "a", body: { baseStateRevision: 16, payload: { parameter: "new" } } });
  const body = { payload: { parameter: "new" } };
  const pendingCopy = journal.enqueue({ kind: "list.create", listId: "b", body, sourceReads: [{ listId: "a", revision: 16 }] });
  body.payload.parameter = "later mutation";
  const copy = await pendingCopy;
  const deletion = await f.make().enqueue({ kind: "list.delete", listId: "a" });
  assert.equal(copy.body.payload.parameter, "new");
  assert.deepEqual(copy.body.causal.reads, [{ listId: "a", operationId: update.operationId }]);
  assert.deepEqual(deletion.body.causal.dependsOn.map(dep => dep.operationId), [update.operationId, copy.operationId]);
  assert.equal(deletion.body.causal.baseOperationId, update.operationId);
  assert.equal(deletion.generation, 2); assert.equal(copy.generation, 1);
  const unrelated = await journal.enqueue({ kind: "list.update", listId: "c", body: { baseStateRevision: 8 } });
  assert.deepEqual(unrelated.body.causal.dependsOn, []);
  assert.deepEqual(f.make().list(), [update, copy, deletion, unrelated]);
  assert.deepEqual(await f.make().enqueue(JSON.parse(copy.inputJson)), copy);
  await assert.rejects(journal.enqueue({ kind: "list.create", listId: "a" }), /Deleted/);
});

test("two tabs persist each action once with per-object generation; no timestamp or UUID sorting", async () => {
  const f = fixture(), one = f.make(), two = f.make();
  const [a, b] = await Promise.all([one.enqueue({ kind: "list.update", listId: "a", body: { baseStateRevision: 1 } }),
    two.enqueue({ kind: "list.update", listId: "a", body: { baseStateRevision: 1 } })]);
  assert.equal(b.body.causal.baseOperationId, a.operationId);
  assert.equal(b.generation, 2);
  await assert.rejects(one.enqueue({ ...JSON.parse(a.inputJson), body: { different: true } }), /reused/);
});

test("photo publication and history restore use the same dependency DAG as DB changes and cross-list readers", async () => {
  const f = fixture(), journal = f.make();
  const source = await journal.enqueue({ kind: "photos.mutate", listId: "a", body: { baseStateRevision: 1, action: "attach" } });
  const copy = await f.make().enqueue({ kind: "photos.mutate", listId: "b", body: { baseStateRevision: 4, action: "copy" }, sourceReads: [{ listId: "a", revision: 1 }] });
  const restore = await journal.enqueue({ kind: "list.restore", listId: "a", body: { historyRestore: { historyId: 123 } } });
  assert.deepEqual(copy.body.causal.reads, [{ listId: "a", operationId: source.operationId }]);
  assert.deepEqual(restore.body.causal.dependsOn, [{ operationId: source.operationId, listId: "a" }, { operationId: copy.operationId, listId: "b" }]);
  assert.deepEqual(f.make().list(), [source, copy, restore]);
});

test("storage, source version and scope failures prevent action registration", async () => {
  const f = fixture();
  await assert.rejects(f.make().enqueue({ kind: "list.create", listId: "b", sourceReads: [{ listId: "a" }] }), /revision/);
  await assert.rejects(f.make().enqueue({ kind: "list.create", listId: "__proto__" }), /Invalid/);
  assert.equal(f.make().list().length, 0);
  f.storage.setItem = () => { throw Error("quota"); };
  await assert.rejects(f.make().enqueue({ kind: "list.create", listId: "a" }), /quota/);
  assert.equal(f.make().list().length, 0);
  assert.throws(() => createCausalActionJournal({ ...f, actorId: "actor-a", environmentId: "production" }), /scope/);
});

test("oversized copy does not persist an action or add a phantom reader dependency", async () => {
  const f = fixture(), journal = f.make();
  const source = await journal.enqueue({ kind: "list.create", listId: "a", body: { payload: {} } });
  await assert.rejects(journal.enqueue({ kind: "list.create", listId: "b", body: { payload: { notes: "я".repeat(1600000) } },
    sourceReads: [{ listId: "a", revision: 1 }] }), { code: "payload-size" });
  assert.deepEqual(f.make().list(), [source]);
  const deletion = await f.make().enqueue({ kind: "list.delete", listId: "a" });
  assert.deepEqual(deletion.body.causal.dependsOn, [{ operationId: source.operationId, listId: "a" }]);
});
