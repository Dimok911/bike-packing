import test from "node:test";
import assert from "node:assert/strict";
import { drainPersonalSaveWithOrdinaryRecovery as run } from "../../src/sync/personal-ordinary-recovery-drain.js";

function fixture() {
  const calls = [], f = { calls, pending: false, eligible: true, generation: "old", records: [{ action: { body: { baseStateRevision: 1582 } } }],
    remote: { id: "list", ownerId: "actor", stateRevision: 1585 }, choice: "server", failure: Object.assign(Error("unknown"), { isOperationReceiptError: true }) };
  const outbox = {
    ordinaryRecoveryState: () => ({ pending: f.pending, eligible: f.eligible, actionCount: 1 }),
    list: () => structuredClone(f.records),
    ordinaryRecoveryCopy: () => { calls.push("export"); return structuredClone(f.records); },
    prepareOrdinaryRecoveryArchive: () => { calls.push("archive"); if (f.quota) throw Error("quota"); f.pending = true; },
    recoverOrdinaryWithServer: async () => { calls.push("recover"); if (f.recoveryFailure) throw f.recoveryFailure; f.pending = false; f.done = true; return { action: { operationId: "new" } }; }
  };
  f.options = { enabled: true, outbox, getContext: () => ({ actorId: "actor", listId: "list", generation: f.generation }),
    readRemote: async () => { calls.push("remote"); f.onRead?.(); return structuredClone(f.remote); },
    chooseServer: async details => { calls.push("choice"); f.onChoice?.(details); return f.choice; },
    onReconciled: () => calls.push("apply"),
    drain: async () => { calls.push("drain"); if (!f.done) throw f.failure; return "confirmed"; } };
  return f;
}

test("explicit server choice archives before recovery and applies only its durable successor", async () => {
  const f = fixture();
  assert.equal(await run(f.options), "confirmed");
  assert.deepEqual(f.calls, ["drain", "remote", "choice", "archive", "recover", "apply", "drain"]);
});
test("autosave offers a decision without making it", async () => {
  const f = fixture(); delete f.options.chooseServer;
  await assert.rejects(run(f.options), /Нажмите на индикатор/);
  assert.deepEqual(f.calls, ["drain", "remote"]);
});
test("download and decide later do not stop or send any original action", async () => {
  const f = fixture(); f.choice = "later"; f.onChoice = d => assert.deepEqual(d.getRecoveryCopy(), f.records);
  await assert.rejects(run(f.options), /Выбор отложен/);
  assert.deepEqual(f.calls, ["drain", "remote", "choice", "export"]);
});
test("archive quota failure prevents recovery", async () => {
  const f = fixture(); f.quota = true;
  await assert.rejects(run(f.options), /quota/);
  assert.equal(f.calls.includes("recover"), false);
});
test("cold pending choice resumes before ordinary drain, without asking again", async () => {
  const f = fixture(); f.pending = true;
  assert.equal(await run(f.options), "confirmed");
  assert.deepEqual(f.calls, ["recover", "apply", "drain"]);
});
test("interrupted recovery preserves the choice and never drains", async () => {
  const f = fixture(); f.pending = true; f.recoveryFailure = Error("lost acknowledgement");
  await assert.rejects(run(f.options), /lost acknowledgement/);
  assert.deepEqual(f.calls, ["recover"]); assert.equal(f.pending, true);
});

for (const pending of [false, true]) for (const field of ["actorId", "generation"]) {
  test(`late ${field} change after ${pending ? "cold" : "new"} recovery prevents UI application and dispatch`, async () => {
    const f = fixture(); f.pending = pending;
    const context = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor", scope: "personal", generation: "old" };
    f.options.getContext = () => ({ ...context });
    const recover = f.options.outbox.recoverOrdinaryWithServer;
    f.options.outbox.recoverOrdinaryWithServer = async (...args) => {
      const result = await recover(...args);
      // The durable phase has completed its own guards. Change context in the
      // caller handoff, where only the adapter can prevent stale UI application.
      context[field] = "other";
      return result;
    };
    await assert.rejects(run(f.options), /изменились/);
    assert.equal(f.calls.includes("apply"), false);
    assert.deepEqual(f.calls, pending ? ["recover"] : ["drain", "remote", "choice", "archive", "recover"]);
    assert.equal(f.done, true); // Keep the published recovery; do not roll it back.
  });
}

test("recovery may publish a new durable record without changing its original editor context", async () => {
  const f = fixture(); f.pending = true;
  const recover = f.options.outbox.recoverOrdinaryWithServer;
  f.options.outbox.recoverOrdinaryWithServer = async (...args) => {
    const result = await recover(...args);
    f.records = [result];
    return result;
  };
  assert.equal(await run(f.options), "confirmed");
  assert.deepEqual(f.calls, ["recover", "apply", "drain"]);
});

test("a rejected async UI callback pauses without draining or leaking an unhandled rejection", async () => {
  const f = fixture(); f.pending = true;
  const unhandled = [], listen = error => unhandled.push(error);
  process.on("unhandledRejection", listen);
  try {
    f.options.onReconciled = () => {
      f.calls.push("async-apply");
      return Promise.reject(Error("async callback rejected"));
    };
    await assert.rejects(run(f.options), /must be synchronous/);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
    assert.deepEqual(f.calls, ["recover", "async-apply"]);
    assert.equal(f.done, true);
  } finally { process.off("unhandledRejection", listen); }
});

test("declining a conflict choice never opens ordinary keep-server fallback", async () => {
  const f = fixture(); f.failure.code = "reconciliation-cancelled";
  await assert.rejects(run(f.options), f.failure);
  assert.deepEqual(f.calls, ["drain"]);
});

test("a reconciliation context failure never offers another decision for a different editor", async () => {
  const f = fixture(); f.failure.code = "context";
  await assert.rejects(run(f.options), f.failure);
  assert.deepEqual(f.calls, ["drain"]);
});
for (const where of ["onRead", "onChoice"]) test(`context change during ${where} prevents archival or dispatch`, async () => {
  const f = fixture(); f[where] = () => { f.generation = "other"; };
  await assert.rejects(run(f.options), /изменились/);
  assert.equal(f.calls.includes("archive"), false); assert.equal(f.calls.includes("recover"), false);
});
test("same editor but another retained action invalidates the choice", async () => {
  const f = fixture(); f.onChoice = () => f.records.push({ action: { body: { baseStateRevision: 1582 } } });
  await assert.rejects(run(f.options), /изменились/); assert.equal(f.calls.includes("archive"), false);
});
for (const remote of [{ id: "other", ownerId: "actor", stateRevision: 1585 }, { id: "list", ownerId: "other", stateRevision: 1585 },
  { id: "list", ownerId: "actor", stateRevision: 1582 }, { id: "list", ownerId: "actor", stateRevision: 1585, deleted: true }]) {
  test(`unavailable newer owned state does not offer recovery ${JSON.stringify(remote)}`, async () => {
    const f = fixture(); f.remote = remote;
    await assert.rejects(run(f.options), f.failure); assert.deepEqual(f.calls, ["drain", "remote"]);
  });
}
test("gate off preserves a prior choice without sending or canceling", async () => {
  const f = fixture(); f.pending = true; f.options.enabled = false;
  await assert.rejects(run(f.options), /недоступно/); assert.deepEqual(f.calls, []);
});
test("unrelated failure and unsupported operations retain the original error", async () => {
  for (const setup of [f => { f.failure = Error("unrelated"); }, f => { f.eligible = false; }, f => { f.options.enabled = false; }]) {
    const f = fixture(); setup(f);
    await assert.rejects(run(f.options), f.failure); assert.deepEqual(f.calls, ["drain"]);
  }
});
