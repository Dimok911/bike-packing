import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { PERSONAL_COMPACT_CAPTURE_ENABLED } from "../../src/sync/personal-compact-record.js";

const clone = value => structuredClone(value);
function fixture() {
  const values = new Map();
  const storage = { get length() { return values.size; }, key: n => [...values.keys()][n],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const binding = { actorId: "actor", listId: "list", scopeKey: "id:actor" };
  const make = enabled => createPersonalSaveOutbox({ storage, ...binding, compactCaptureEnabled: enabled });
  const base = { items: Object.fromEntries(Array.from({ length: 1000 }, (_, i) =>
    [`item-${i}`, { id: `item-${i}`, name: `Item ${i}`, notes: "notes ".repeat(40) }])), containers: {}, layouts: {} };
  const outbox = make(true);
  outbox.adoptRemoteBaseline({ snapshot: base, payload: base, stateRevision: 5 });
  let current = clone(base);
  const rename = (id, name, box = outbox) => {
    const snapshot = clone(current); snapshot.items[id].name = name;
    const result = box.captureItemRename({ itemId: id, name, snapshot });
    current = snapshot; return result;
  };
  return { values, storage, base, outbox, make, rename, current: () => clone(current) };
}

test("compact capture keeps one base and small commands; cold OFF reader reconstructs every rename", t => {
  assert.equal(PERSONAL_COMPACT_CAPTURE_ENABLED, false);
  const f = fixture(), records = [];
  for (let i = 0; i < 8; i++) records.push(f.rename(`item-${i}`, `renamed ${i}`));
  const rows = [...f.values.values()].map(JSON.parse);
  assert.equal(rows.length, 8);
  assert.ok(rows.every(row => row.version === 4 && row.action.kind === "item.rename"));
  assert.equal(rows.filter(row => row.source.payload).length, 1);
  assert.ok(rows.slice(1).every(row => JSON.stringify(row).length < 1500));
  const bytes = [...f.values.values()].reduce((sum, raw) => sum + Buffer.byteLength(raw), 0);
  assert.ok(bytes < Buffer.byteLength(JSON.stringify(f.base)) * 1.1, `queue grew to ${bytes}`);
  t.diagnostic(`8 renames: ${bytes} UTF-8 bytes total; shared base ${Buffer.byteLength(JSON.stringify(f.base))} bytes; largest subsequent record ${Math.max(...rows.slice(1).map(row => Buffer.byteLength(JSON.stringify(row))))} bytes`);
  assert.deepEqual(f.make(false).recoverSnapshot(), f.current());
  assert.deepEqual(f.make(false).list().map(row => row.action), records.map(row => row.action));
  assert.ok(records.every(row => !Object.hasOwn(row.action.body, "payload")));
});

test("legacy update, two compact renames and later full update share one causal order", () => {
  const f = fixture(), legacy = clone(f.base); legacy.items['item-900'].notes = 'other edit';
  const old = f.outbox.capture({ snapshot: legacy, body: { payload: legacy, baseStateRevision: 5 } });
  const one = clone(legacy); one.items['item-0'].name = 'one';
  const a = f.outbox.captureItemRename({ itemId: 'item-0', name: 'one', snapshot: one });
  const two = clone(one); two.items['item-0'].name = 'two';
  const b = f.outbox.captureItemRename({ itemId: 'item-0', name: 'two', snapshot: two });
  const last = clone(two); last.items['item-1'].notes = 'last edit';
  const c = f.outbox.capture({ snapshot: last, body: { payload: last, baseStateRevision: 5 } });
  assert.equal(a.action.body.causal.baseOperationId, old.action.operationId);
  assert.equal(b.action.body.expectedName, 'one');
  assert.equal(b.action.body.causal.baseOperationId, a.action.operationId);
  assert.equal(c.action.body.causal.baseOperationId, b.action.operationId);
  assert.deepEqual(f.make(false).recoverSnapshot(), last);
});

test("confirmed compaction retains the exact decoding base before removing ancestors", () => {
  const f = fixture(); f.rename('item-0', 'one'); const head = f.rename('item-1', 'two');
  const key = [...f.values.keys()].find(key => key.endsWith(head.action.operationId));
  const immutable = f.values.get(key);
  f.outbox.markApplied({ operationId: head.action.operationId, stateRevision: 7 });
  assert.ok(f.outbox.compact().removed > 0);
  assert.equal(f.values.get(key), immutable, 'action bytes never change during retirement');
  const cold = f.make(false);
  assert.deepEqual(cold.recoverSnapshot(), f.current());
  assert.deepEqual(cold.confirmedBase().payload, f.current());
  assert.equal(cold.hasPending(), false);
  assert.equal(cold.list().length, 1);
});

test("refresh after confirmation preserves historical command decoding and newer server baseline", () => {
  const f = fixture(); f.rename('item-0', 'one'); const head = f.rename('item-1', 'two');
  f.outbox.markApplied({ operationId: head.action.operationId, stateRevision: 7 });
  const remote = f.current(); remote.items['item-2'].name = 'another device';
  f.outbox.adoptRemoteBaseline({ payload: remote, snapshot: remote, stateRevision: 8 });
  f.outbox.compact();
  assert.deepEqual(f.make(false).recoverSnapshot(), remote);
  assert.equal(f.make(false).list()[0].compactState.payload.items['item-2'].name, 'Item 2');
  const next = clone(remote); next.items['item-3'].name = 'after refresh';
  const action = f.outbox.captureItemRename({ itemId: 'item-3', name: 'after refresh', snapshot: next });
  assert.equal(action.action.previousLocalOperationId, head.action.operationId);
  assert.equal(action.action.body.baseStateRevision, 8);
  assert.deepEqual(f.make(false).recoverSnapshot(), next);
});

test("missing or cross-owner source blocks reading instead of consulting a mutable mirror", () => {
  for (const corrupt of ['missing', 'owner', 'cycle']) {
    const f = fixture(); const first = f.rename('item-0', 'one'); const last = f.rename('item-1', 'two');
    const key = [...f.values.keys()].find(key => key.endsWith(first.action.operationId));
    if (corrupt === 'missing') f.values.delete(key);
    else { const row = JSON.parse(f.values.get(key));
      if (corrupt === 'owner') row.action.actorId = 'other';
      else row.source = { operationId: last.action.operationId };
      f.values.set(key, JSON.stringify(row)); }
    assert.throws(() => f.make(false), error => error.code === 'storage');
  }
});

test("capture refuses a hidden second edit and OFF writer, without publishing anything", () => {
  const f = fixture(), snapshot = clone(f.base); snapshot.items['item-0'].name = 'rename';
  snapshot.items['item-1'].notes = 'hidden';
  assert.throws(() => f.outbox.captureItemRename({ itemId: 'item-0', name: 'rename', snapshot }), error => error.code === 'compact-input');
  assert.throws(() => f.make(false).captureItemRename({ itemId: 'item-0', name: 'rename', snapshot }), error => error.code === 'compact-capture-disabled');
  assert.equal(f.values.size, 0);
});

test("quota and changed editor during durable write preserve predecessor and report an unsent draft", async () => {
  for (const changed of [false, true]) {
    const f = fixture(); f.rename('item-0', 'first'); const before = [...f.values];
    const snapshot = f.current(); snapshot.items['item-1'].name = 'second';
    let checks = 0;
    f.storage.writeRequired = async (key, raw, { assertCurrent }) => {
      await Promise.resolve(); assertCurrent();
      throw new DOMException('full', 'QuotaExceededError');
    };
    await assert.rejects(async () => f.outbox.captureItemRename({ itemId: 'item-1', name: 'second', snapshot },
      { assertCurrent: () => { if (changed && ++checks > 2) throw Object.assign(Error('changed'), { code: 'context', isPersonalSaveBlocked: true }); } }),
    error => changed ? error.code === 'context' : error.code === 'quota' && error.unconfirmedMemoryDraft.items['item-1'].name === 'second');
    assert.deepEqual([...f.values], before);
    assert.deepEqual(f.make(false).recoverSnapshot(), f.current());
  }
});

test("storage-only rollout blocks mixed-chain delivery before any transport call", async () => {
  const f = fixture(); f.rename('item-0', 'first');
  let calls = 0;
  await assert.rejects(f.outbox.drain({ queue: { run() { calls++; }, inspect() { calls++; } }, getContext() { calls++; } }),
    error => error.code === 'compact-delivery-disabled');
  assert.equal(calls, 0);
});

test("a stopped compaction is readable at each checkpoint/write/delete boundary", () => {
  const f = fixture(); f.rename('item-0', 'one'); const head = f.rename('item-1', 'two');
  f.outbox.markApplied({ operationId: head.action.operationId, stateRevision: 7 });
  const states = [], put = f.storage.setItem, remove = f.storage.removeItem;
  f.storage.setItem = (key, raw) => { put(key, raw); states.push([...f.values]); };
  f.storage.removeItem = key => { remove(key); states.push([...f.values]); };
  f.outbox.compact();
  assert.ok(states.length >= 2, 'checkpoint publication and ancestor deletion were observed');
  for (const entries of states) {
    f.values.clear(); for (const [key, value] of entries) f.values.set(key, value);
    assert.deepEqual(f.make(false).recoverSnapshot(), f.current());
    assert.equal(f.make(false).hasPending(), false);
  }
});

test("two editors cannot silently attach a rename to an unobserved newer command", () => {
  const f = fixture(); f.rename('item-0', 'one'); const stale = f.make(true);
  const snapshot = f.current(); snapshot.items['item-2'].name = 'stale edit';
  f.rename('item-1', 'two'); const before = [...f.values];
  assert.throws(() => stale.captureItemRename({ itemId: 'item-2', name: 'stale edit', snapshot }),
    error => error.code === 'stale-tab');
  assert.deepEqual([...f.values], before);
});
