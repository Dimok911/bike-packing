import test from "node:test";
import assert from "node:assert/strict";
import { commitPreparedPersonalChange } from "../../src/sync/personal-prepared-commit.js";

function fixture() {
  let resolve, reject;
  const transaction = new Promise((yes, no) => { resolve = yes; reject = no; });
  const f = { current: true, applied: 0, errors: [], resolve, reject };
  f.commit = persist => commitPreparedPersonalChange({ persist: persist || (() => transaction),
    isCurrent: () => f.current, apply: () => ++f.applied,
    onError: error => { f.errors.push(error); return false; } });
  return f;
}

test("pending transaction cannot apply the candidate or return a successful action", async () => {
  const f = fixture(); let completed = false;
  const result = f.commit().then(value => { completed = true; return value; });
  await Promise.resolve(); assert.equal(f.applied, 0); assert.equal(completed, false);
  f.resolve(true); assert.equal(await result, 1); assert.equal(f.applied, 1);
});

test("durable old-owner candidate is not installed after switching account or editing again", async () => {
  const f = fixture(), result = f.commit(); f.current = false; f.resolve(true);
  assert.equal(await result, false); assert.equal(f.applied, 0); assert.equal(f.errors.length, 1);
});

test("aborted transaction preserves the current screen and reports failure", async () => {
  const f = fixture(), result = f.commit(), failure = new Error("Transaction aborted");
  f.reject(failure); assert.equal(await result, false); assert.equal(f.applied, 0);
  assert.equal(f.errors[0], failure);
});

test("existing synchronous store keeps synchronous success and refusal semantics", () => {
  const f = fixture(); assert.equal(f.commit(() => true), 1);
  assert.equal(f.commit(() => false), false); assert.equal(f.applied, 1);
  assert.equal(f.commit(() => { throw new Error("Storage failed"); }), false);
  assert.equal(f.applied, 1);
});
