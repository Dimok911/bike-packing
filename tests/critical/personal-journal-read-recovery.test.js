import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalSaveRecovery } from "../../src/sync/personal-save-recovery.js";
const tick = () => new Promise(resolve => setImmediate(resolve));
const missing = () => Object.assign(Error("unprepared"), { code: "storage", reason: "personal-journal-reference-not-prepared", isPersonalSaveBlocked: true });
const scopeKey = "id:test";

test("new journal references unlock read failures after hydration without replaying the caller", async () => {
  let reads = 0, hydrated = 0, ready = 0;
  const recovery = createPersonalSaveRecovery({ refreshStorage: async scope => { assert.equal(scope, scopeKey); hydrated++; }, onReadReady: () => ready++ });
  const outbox = recovery.outbox(() => ({ hasPending() { reads++; throw missing(); } }), scopeKey);
  assert.throws(() => outbox.hasPending(), /unprepared/); assert.notEqual(recovery.message(), "");
  await tick(); assert.equal(recovery.message(), "");
  assert.deepEqual([reads, hydrated, ready], [1, 1, 1]);
});

test("capture failure remains blocked and retains its draft instead of replaying", async () => {
  let hydrations = 0;
  const recovery = createPersonalSaveRecovery({ refreshStorage: async () => hydrations++ });
  const outbox = recovery.outbox(() => ({ capture() { throw missing(); } }), scopeKey);
  assert.throws(() => outbox.capture({ snapshot: { name: "unsaved" } }));
  await tick(); assert.equal(hydrations, 0); assert.notEqual(recovery.message(), "");
  assert.deepEqual(recovery.recoveryCopy({ length: 0 }).unconfirmedMemoryDraft, { name: "unsaved" });
});

test("a draft arriving while hydration waits prevents automatic unlocking", async () => {
  let finish; const error = missing();
  const recovery = createPersonalSaveRecovery({ refreshStorage: () => new Promise(resolve => { finish = resolve; }) });
  recovery.report(error, { scopeKey, readOnly: true }); await tick();
  recovery.report(error, { scopeKey, snapshot: { name: "keep" } }); finish(); await tick();
  assert.notEqual(recovery.message(), ""); assert.equal(recovery.recoveryCopy({ length: 0 }).memoryDraftAvailable, true);
});

test("changed accounts and broken bodies cannot unlock the editor", async () => {
  for (const mode of ["scope", "broken"]) {
    let current = true, finish, ready = 0;
    const recovery = createPersonalSaveRecovery({ isCurrentScope: () => current,
      refreshStorage: () => new Promise((resolve, reject) => { finish = mode === "broken" ? () => reject(Error("body verification failed")) : resolve; }),
      onReadReady: () => ready++ });
    recovery.report(missing(), { scopeKey, readOnly: true }); await tick();
    if (mode === "scope") current = false;
    finish(); await tick(); assert.notEqual(recovery.message(), ""); assert.equal(ready, 0);
  }
});

test("recovery export awaits hydration and rejects an account change during the read", async () => {
  let hydrated = false, current = true;
  const key = "bike-packing-personal-save-v1:" + encodeURIComponent(JSON.stringify({ environment: "bike-packing-experiment", actorId: "test", listId: "list", scopeKey })) + ":checkpoint";
  const storage = { length: 1, key: () => key, getItem() { if (!hydrated) throw missing(); return "exact original bytes"; } };
  const recovery = createPersonalSaveRecovery({ isCurrentScope: () => current, refreshStorage: async () => { hydrated = true; } });
  recovery.report(missing(), { scopeKey });
  assert.equal(recovery.recoveryCopy(storage).storageReadable, false);
  const copy = await recovery.preparedRecoveryCopy(storage);
  assert.equal(copy.storageReadable, true); assert.equal(copy.journalEntries[0].value, "exact original bytes");
  const pending = recovery.preparedRecoveryCopy(storage); current = false;
  await assert.rejects(pending, /context changed/);
});

test("a capture attempted during hydration retains its draft and never invokes the writer", async () => {
  let finish, writes = 0;
  const recovery = createPersonalSaveRecovery({ refreshStorage: () => new Promise(resolve => { finish = resolve; }) });
  const guarded = recovery.outbox(() => ({ hasPending() { throw missing(); }, capture() { writes++; } }), scopeKey);
  assert.throws(() => guarded.hasPending()); await tick();
  assert.throws(() => guarded.capture({ snapshot: { title: "new draft" } })); finish(); await tick();
  assert.equal(writes, 0); assert.notEqual(recovery.message(), "");
  assert.deepEqual(recovery.recoveryCopy({ length: 0 }).unconfirmedMemoryDraft, { title: "new draft" });
});

test("a concurrent real failure owns the stop even when hydration later succeeds or fails", async () => {
  for (const fails of [false, true]) {
    let finish, ready = 0;
    const recovery = createPersonalSaveRecovery({ refreshStorage: () => new Promise((resolve, reject) => { finish = fails ? () => reject(Error("read failed")) : resolve; }), onReadReady: () => ready++ });
    recovery.report(missing(), { scopeKey, readOnly: true }); await tick();
    const error = Object.assign(Error("photo recovery required"), { code: "photo-recovery", isPersonalSaveBlocked: true });
    assert.equal(recovery.report(error, { scopeKey, snapshot: { title: "keep real failure" } }), true);
    finish(); await tick(); assert.equal(ready, 0); assert.equal(recovery.owns(error), true);
    assert.equal(recovery.recoveryCopy({ length: 0 }).unconfirmedMemoryDraft.title, "keep real failure");
  }
});
