import test from "node:test";
import assert from "node:assert/strict";
import { createOperationJournal, createConfirmedDelivery, canonicalOperationJson, matchesOperationIdentity } from "../../src/protocol/index.js";

const identity = { id: "operation-1", namespace: "another-project", owner: "user-a", resource: "note-1", kind: "rename", digest: "digest-a" };
function fixture() {
  const rows = new Map(), state = { dropIntent: false, dropProof: false, failRead: false, corruptBody: false };
  const journal = createOperationJournal({
    read: async id => { if (state.failRead) throw Error("offline-store"); return rows.get(id); },
    writeIntent: async intent => {
      if (rows.has(intent.identity.id)) throw Error("duplicate");
      if (!state.dropIntent) rows.set(intent.identity.id, structuredClone(intent));
      if (state.corruptBody) rows.get(intent.identity.id).body.title = "Changed by storage";
    },
    writeConfirmation: async (entry, proof) => {
      if (!state.dropProof) rows.set(entry.identity.id, { ...rows.get(entry.identity.id), proof: structuredClone(proof) });
      return true;
    },
    identityOf: entry => entry.identity, confirmationOf: entry => entry.proof,
    contentOf: entry => entry.body, captureContentOf: intent => intent.body,
  });
  return { journal, rows, state, intent: { identity, body: { title: "New title" } } };
}

test("identity covers project, owner, resource, command, ID and immutable digest", async () => {
  const f = fixture(); await f.journal.capture(identity, f.intent);
  for (const key of Object.keys(identity)) {
    assert.equal(matchesOperationIdentity({ ...identity, [key]: "other" }, identity), false);
    assert.equal(matchesOperationIdentity(identity, { ...identity, [key]: "" }), false);
    if (key !== "id") await assert.rejects(f.journal.find({ ...identity, [key]: "other" }), { code: "identity-reuse" });
  }
  await assert.rejects(f.journal.capture(identity, f.intent), { code: "already-recorded" });
  assert.deepEqual((await f.journal.find(identity)).body, f.intent.body);
});

test("durable readback detects a silent write failure before any network request", async () => {
  const f = fixture(); f.state.dropIntent = true; let sends = 0;
  const delivery = createConfirmedDelivery({ capture: intent => f.journal.capture(identity, intent), send: () => sends++ });
  await assert.rejects(delivery.deliverNew(f.intent), { code: "intent-not-persisted" });
  assert.equal(sends, 0);
  f.state.dropIntent = false; f.state.corruptBody = true;
  await assert.rejects(delivery.deliverNew(f.intent), { code: "intent-content-changed" });
  assert.equal(sends, 0);
});

test("foreign proof or silently lost proof does not settle the original intent", async () => {
  const f = fixture(), entry = await f.journal.capture(identity, f.intent), proof = { state: "committed", revision: 2 };
  await assert.rejects(f.journal.confirm(entry, proof, { ...identity, owner: "user-b" }), { code: "foreign-receipt" });
  assert.equal(f.rows.get(identity.id).proof, undefined);
  f.state.dropProof = true;
  await assert.rejects(f.journal.confirm(entry, proof, identity), { code: "proof-not-persisted" });
  assert.deepEqual(f.rows.get(identity.id).body, f.intent.body);
  f.state.dropProof = false; await f.journal.confirm(entry, proof, identity);
  assert.deepEqual((await f.journal.find(identity)).proof, proof);
  f.rows.set(identity.id, { identity: { ...identity, digest: "changed" } });
  await assert.rejects(f.journal.confirm(entry, proof, identity), { code: "identity-reuse" });
});

test("recovery stays read-only unless an adapter revalidates a frozen retry", async () => {
  let sends = 0, reads = 0, allowed = false, context = "original";
  const entry = { id: "unchanged" }, waiting = { state: "waiting" };
  const delivery = createConfirmedDelivery({
    readReceipt: () => { reads++; return waiting; },
    send: value => { assert.equal(value, entry); sends++; return { state: "committed" }; },
    accept: (_entry, receipt) => { if (receipt.state !== "committed") throw Error("waiting"); return receipt; },
  });
  await assert.rejects(delivery.recover(entry), /waiting/);
  const options = { assertCurrent: () => { if (context !== "original") throw Error("context"); },
    prepareRecovery: async (_entry, receipt) => ({ receipt, beforeDispatch: async () => {
      if (!allowed) throw Error("retry-not-authorized");
    } }),
  };
  await assert.rejects(delivery.recover(entry, options), /retry-not-authorized/);
  assert.equal(sends, 0);
  allowed = true;
  assert.equal((await delivery.recover(entry, options)).receipt.state, "committed");
  assert.equal(sends, 1);
  options.prepareRecovery = async (_entry, receipt) => ({ receipt, beforeDispatch: async () => { context = "changed"; } });
  await assert.rejects(delivery.recover(entry, options), /context/);
  assert.equal(sends, 1); assert.equal(reads, 4);
});

test("canonical JSON keeps existing UTF-8 binding semantics and array order", () => {
  assert.equal(canonicalOperationJson({ title: "Фляга", a: [2, 1] }), '{"a":[2,1],"title":"Фляга"}');
  assert.notEqual(canonicalOperationJson([1, 2]), canonicalOperationJson([2, 1]));
});
