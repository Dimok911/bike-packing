import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";

function fixture() {
  const values = new Map();
  let rejectWrites = false;
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (rejectWrites) throw Error("Synthetic storage quota");
      values.set(key, value);
    },
    removeItem(key) {
      if (rejectWrites) throw Error("Unexpected cleanup");
      values.delete(key);
    }
  };
  const binding = { environment: "bike-packing-experiment", actorId: "review-owner",
    listId: "review-list", scopeKey: "id:review-owner" };
  const make = () => createPersonalSaveOutbox({ storage, ...binding });
  const input = (weight, revision = 5) => ({
    snapshot: { items: { item: { id: "item", name: "Saved item", weight } }, localUi: "packing" },
    body: { baseStateRevision: revision, payload: { items: { item: { id: "item", name: "Saved item", weight } } } }
  });
  return { values, storage, binding, make, input, outbox: make(),
    rejectWrites: value => { rejectWrites = value; } };
}

test("review retains the confirmed anchor for ancestry and distinguishes the next pending action on cold read", () => {
  const f = fixture(), confirmed = f.outbox.capture(f.input(100));
  f.outbox.markApplied({ operationId: confirmed.action.operationId, stateRevision: 6 });
  f.outbox.compact();
  const pending = f.outbox.capture(f.input(250, 6));
  const cold = f.make(), bytes = [...f.values];
  f.rejectWrites(true);
  const review = cold.ordinaryRecoveryReview();
  assert.deepEqual(review.records.map(row => row.action.operationId),
    [confirmed.action.operationId, pending.action.operationId]);
  assert.deepEqual(review.confirmedOperationIds, [confirmed.action.operationId]);
  assert.equal(review.records[1].action.body.causal.baseOperationId, confirmed.action.operationId);
  assert.equal(cold.hasPending(), true);
  assert.deepEqual([...f.values], bytes);
});

test("valid applied markers remain visible before compact, including a failed checkpoint publication", () => {
  const f = fixture(), first = f.outbox.capture(f.input(100));
  f.outbox.markApplied({ operationId: first.action.operationId, stateRevision: 6 });
  const second = f.outbox.capture(f.input(250, 6));
  f.outbox.markApplied({ operationId: second.action.operationId, stateRevision: 7 });
  assert.equal(f.outbox.confirmedBoundary(), null);
  const bytes = [...f.values];
  f.rejectWrites(true);
  assert.deepEqual(f.outbox.compact(), { removed: 0, pending: true });
  const review = f.make().ordinaryRecoveryReview();
  assert.deepEqual(review.confirmedOperationIds, [first.action.operationId, second.action.operationId]);
  assert.equal(review.records.length, 2);
  assert.deepEqual([...f.values], bytes);
});

test("review data is detached and an unconfirmed record never gains an invented confirmation", () => {
  const f = fixture(), pending = f.outbox.capture(f.input(100)), bytes = [...f.values];
  const original = f.outbox.ordinaryRecoveryReview();
  assert.deepEqual(original.confirmedOperationIds, []);
  const changed = f.outbox.ordinaryRecoveryReview();
  changed.records[0].action.body.payload.items.item.name = "Changed by a view";
  changed.records[0].snapshot.items.item.weight = 999;
  changed.records[0].action.generation = 90;
  changed.confirmedOperationIds.push(pending.action.operationId);
  changed.records.length = 0;
  assert.deepEqual(f.outbox.ordinaryRecoveryReview(), original);
  assert.deepEqual(f.make().ordinaryRecoveryReview(), original);
  assert.deepEqual([...f.values], bytes);
});

test("review rejects a malformed local applied marker without repairing or deleting journal bytes", () => {
  const f = fixture(), record = f.outbox.capture(f.input(100));
  f.outbox.markApplied({ operationId: record.action.operationId, stateRevision: 6 });
  const key = [...f.values.keys()].find(value => value.endsWith(`applied:${record.action.operationId}:6`));
  assert.ok(key);
  const marker = JSON.parse(f.values.get(key));
  marker.stateRevision = 0;
  f.values.set(key, JSON.stringify(marker));
  const bytes = [...f.values];
  f.rejectWrites(true);
  assert.throws(() => f.make().ordinaryRecoveryReview(), error =>
    error.isPersonalSaveBlocked === true && error.code === "storage");
  assert.deepEqual([...f.values], bytes);
});
