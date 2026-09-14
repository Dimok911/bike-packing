import test from "node:test";
import assert from "node:assert/strict";
import { drainPersonalSaveWithOrdinaryRecovery as run } from "../../src/sync/personal-ordinary-recovery-drain.js";

function fixture() {
  const calls = [], f = { calls, pending: false, eligible: true, generation: "old", records: [{ action: { body: { baseStateRevision: 1582 } } }],
    remote: { id: "list", ownerId: "actor", stateRevision: 1585 }, choice: "server", failure: Object.assign(Error("unknown"), { isOperationReceiptError: true }) };
  const outbox = {
    ordinaryRecoveryState: () => ({ pending: f.pending, eligible: f.eligible, actionCount: 1 }),
    list: () => structuredClone(f.records),
    ordinaryRecoveryReview: () => ({ records: f.records, confirmedOperationIds: f.confirmedOperationIds || [] }),
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

test("version comparison uses the validated head rather than record order and cannot alter the stored versions", async () => {
  const f = fixture();
  f.choice = "later";
  const saved = { action: { operationId: "saved-head", kind: "list.update", body: { baseStateRevision: 1582,
    payload: { items: {}, containers: { bag: { id: "bag", name: "Saved bag" } }, layouts: {} } } } };
  const ancestor = { action: { operationId: "older", kind: "list.update", body: { baseStateRevision: 1582, payload: { items: {} } } } };
  f.records = [saved, ancestor];
  f.remote.payload = { items: {}, containers: { bag: { id: "bag", name: "Server bag" } }, layouts: {} };
  f.options.outbox.ordinaryRecoveryReview = () => ({ records: f.records, confirmedOperationIds: ["older"], headOperationId: "saved-head" });
  const original = structuredClone({ records: f.records, remote: f.remote });
  f.onChoice = details => {
    assert.deepEqual(details.comparison, { local: saved.action.body.payload, remote: f.remote.payload, serverRevision: 1585 });
    details.comparison.local.containers.bag.name = "UI mutation";
    details.comparison.remote.containers.bag.name = "UI mutation";
  };
  await assert.rejects(run(f.options), /Выбор отложен/);
  assert.deepEqual({ records: f.records, remote: f.remote }, original);
  assert.equal(f.calls.includes("archive"), false);
  assert.equal(f.calls.includes("recover"), false);
});

test("explicit server choice archives before recovery and applies only its durable successor", async () => {
  const f = fixture();
  assert.equal(await run(f.options), "confirmed");
  assert.deepEqual(f.calls, ["drain", "remote", "choice", "archive", "recover", "apply", "drain"]);
});

test("dialog can report failed preparation and still export originals without cancelling", async () => {
  const f = fixture(); f.quota = true; f.choice = "later";
  f.onChoice = details => {
    assert.throws(details.prepareServerChoice, /quota/);
    assert.deepEqual(details.getRecoveryCopy(), f.records);
  };
  await assert.rejects(run(f.options), /Выбор отложен/);
  assert.equal(f.pending, false);
  assert.deepEqual(f.calls, ["drain", "remote", "choice", "archive", "export"]);
});

test("preparing a dialog choice rejects a changed editor before publishing an archive", async () => {
  const f = fixture();
  f.onChoice = details => { f.generation = "changed"; details.prepareServerChoice(); };
  await assert.rejects(run(f.options), /Аккаунт или местные изменения изменились/);
  assert.equal(f.calls.includes("archive"), false);
  assert.equal(f.calls.includes("recover"), false);
});
test("autosave offers a decision without making it", async () => {
  const f = fixture(); delete f.options.chooseServer;
  await assert.rejects(run(f.options), error => {
    assert.match(error.message, /Разобрать изменения/);
    assert.equal(error.recoveryReviewNeeded, true);
    return true;
  });
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

test("review gets detached saved records and only the failure fields needed for an explanation", async () => {
  const f = fixture();
  f.records = [{ version: 1, action: { operationId: "saved-operation", generation: 1, kind: "list.update",
    body: { baseStateRevision: 1582, payload: { containers: { bag: { id: "bag", name: "Saved bag" } } },
      userPlacement: { type: "placement", version: 1, action: "link-root", layoutId: "layout", ids: ["bag"] } } },
    mergeBase: { stateRevision: 1582, payload: { containers: {} } }, snapshot: { selectedLayoutId: "layout" } }];
  // The coordinator must detach the review DTO even if a trusted outbox reader
  // returns its record objects directly. Review edits cannot rewrite an intent.
  f.options.outbox.list = () => f.records;
  f.confirmedOperationIds = ["confirmed-parent"];
  const original = structuredClone(f.records);
  Object.assign(f.failure, { code: "reconciliation-conflict", reason: "photo-inventory",
    conflicts: [{ localValue: { privateNote: "not a UI diagnostic" } }], body: { privateData: true } });
  f.onChoice = details => {
    assert.deepEqual(details.records, original);
    assert.notStrictEqual(details.records, f.records);
    assert.notStrictEqual(details.records[0].action.body, f.records[0].action.body);
    assert.deepEqual(details.confirmedOperationIds, ["confirmed-parent"]);
    details.confirmedOperationIds.push("saved-operation");
    assert.deepEqual(f.confirmedOperationIds, ["confirmed-parent"]);
    assert.deepEqual(details.failure, { code: "reconciliation-conflict", reason: "photo-inventory", hasConflicts: true });
    assert.deepEqual(Object.keys(details.failure).sort(), ["code", "hasConflicts", "reason"]);
    for (const key of ["message", "stack", "conflicts", "body"]) assert.equal(Object.hasOwn(details.failure, key), false);
    details.records[0].action.body.payload.containers.bag.name = "Changed in UI";
    details.records[0].action.body.userPlacement.ids.push("another-bag");
    details.records[0].mergeBase.payload.containers.added = { id: "added" };
    details.records[0].snapshot.selectedLayoutId = "another-layout";
    details.records.length = 0;
    details.failure.reason = "changed in UI";
    assert.deepEqual(f.records, original);
    assert.equal(f.failure.reason, "photo-inventory");
  };
  assert.equal(await run(f.options), "confirmed");
  assert.deepEqual(f.records, original);
  assert.deepEqual(f.calls, ["drain", "remote", "choice", "archive", "recover", "apply", "drain"]);
});

test("an unclassified failure is not given an invented diagnostic or raw error message", async () => {
  const f = fixture(); f.choice = "later";
  f.failure.message = "server response with private details";
  f.failure.conflicts = [];
  f.onChoice = details => {
    assert.deepEqual(details.failure, { code: undefined, reason: undefined, hasConflicts: false });
    assert.equal(Object.hasOwn(details.failure, "message"), false);
    assert.equal(Object.hasOwn(details.failure, "conflicts"), false);
  };
  await assert.rejects(run(f.options), error => error.recoveryReviewNeeded === true);
  assert.deepEqual(f.calls, ["drain", "remote", "choice"]);
});

test("deferring review keeps its visible affordance without archiving, recovering or redraining", async () => {
  for (const choice of ["later", null, undefined]) {
    const f = fixture(); f.choice = choice;
    const original = structuredClone(f.records);
    await assert.rejects(run(f.options), error => {
      assert.equal(error.code, "ordinary-recovery-pending");
      assert.equal(error.isOperationReceiptError, true);
      assert.equal(error.recoveryReviewNeeded, true);
      return true;
    });
    assert.deepEqual(f.calls, ["drain", "remote", "choice"]);
    assert.deepEqual(f.records, original);
    assert.equal(f.pending, false);
    assert.equal(f.done, undefined);
  }
});

for (const scenario of ["inaccessible state", "different owner", "rejected context", "context changed during state read", "context changed during review"]) {
  test(`${scenario} never advertises an actionable recovery review`, async () => {
    const f = fixture();
    if (scenario === "inaccessible state") f.options.readRemote = async () => { f.calls.push("remote"); throw Error("unreachable"); };
    if (scenario === "different owner") f.remote.ownerId = "another-actor";
    if (scenario === "rejected context") f.failure.code = "context";
    if (scenario === "context changed during state read") f.onRead = () => { f.generation = "different"; };
    if (scenario === "context changed during review") f.onChoice = () => { f.generation = "different"; };
    await assert.rejects(run(f.options), error => {
      assert.equal(Object.hasOwn(error, "recoveryReviewNeeded"), false);
      if (["inaccessible state", "different owner", "rejected context"].includes(scenario)) assert.strictEqual(error, f.failure);
      else assert.equal(error.code, "ordinary-recovery-pending");
      return true;
    });
    const expected = scenario === "rejected context" ? ["drain"] : scenario === "context changed during review"
      ? ["drain", "remote", "choice"] : ["drain", "remote"];
    assert.deepEqual(f.calls, expected);
    assert.equal(f.pending, false);
    assert.equal(f.done, undefined);
  });
}
