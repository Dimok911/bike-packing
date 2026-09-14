import test from "node:test";
import assert from "node:assert/strict";
import { drainPersonalSaveWithReconciliation } from "../../src/sync/personal-save-drain.js";

const getContext = () => ({ environment: "bike-packing-experiment", actorId: "actor", listId: "list",
  scopeKey: "id:actor", scope: "personal", generation: "original" });

test("personal drain applies only a durably reconciled candidate before dispatching its new action", async () => {
  const calls = [], record = { action: { operationId: "new" } };
  const result = await drainPersonalSaveWithReconciliation({ getContext, outbox: {
    async drain() { calls.push("drain"); if (calls.length === 1) throw { isOperationReceiptError: true }; return "confirmed"; },
    async reconcile() { calls.push("durable"); return record; }
  }, onReconciled(value) { assert.equal(value, record); calls.push("ui"); } });
  assert.equal(result, "confirmed"); assert.deepEqual(calls, ["drain", "durable", "ui", "drain"]);
});

test("personal drain never spins indefinitely, bypasses a recovery latch, or invents settlement after an unknown result", async () => {
  for (const failure of ["changing-server", "storage", "offline", "unknown"]) {
    let drains = 0, reconciliations = 0, applications = 0;
    await assert.rejects(drainPersonalSaveWithReconciliation({ getContext, outbox: {
      async drain() { drains++; throw Object.assign(Error(failure), {
        isOperationReceiptError: failure !== "offline", isPersonalSaveBlocked: failure === "storage"
      }); },
      async reconcile() { reconciliations++; if (failure === "unknown") throw Error("unknown receipt"); return {}; }
    }, onReconciled() { applications++; } }));
    assert.equal(drains, failure === "changing-server" ? 3 : 1);
    assert.equal(reconciliations, failure === "changing-server" ? 2 : failure === "unknown" ? 1 : 0);
    assert.equal(applications, failure === "changing-server" ? 2 : 0);
  }
});

test("adopting a newer current snapshot finishes without dispatching or applying an old receipt again", async () => {
  const calls = [];
  const result = await drainPersonalSaveWithReconciliation({ getContext, outbox: {
    async drain() { calls.push("historical-stale"); throw { isOperationReceiptError: true }; },
    async reconcile() { calls.push("atomic-adoption"); return { adoptedBaseline: true }; }
  }, onReconciled() { assert.fail("not a new business action"); },
  onAdopted(value) { assert.equal(value.adoptedBaseline, true); calls.push("current-ui"); return "adopted"; } });
  assert.equal(result, "adopted"); assert.deepEqual(calls, ["historical-stale", "atomic-adoption", "current-ui"]);
});

test("each immutable successor is checked before dispatch, including a freshly reconciled one", async () => {
  const calls = [];
  let candidate = "old";
  await assert.rejects(drainPersonalSaveWithReconciliation({
    getContext,
    beforeDrain() { calls.push(`check:${candidate}`); if (candidate === "new") throw Error("file mutation stopped"); },
    outbox: {
      async drain() { calls.push("drain"); throw { isOperationReceiptError: true }; },
      async reconcile() { calls.push("reconcile"); candidate = "new"; return {}; }
    }, onReconciled() { calls.push("ui"); }
  }), /file mutation stopped/);
  assert.deepEqual(calls, ["check:old", "drain", "reconcile", "ui", "check:new"]);
});

test("failed or asynchronous preflight cannot dispatch or reconcile", async () => {
  for (const beforeDrain of [() => { throw Error("blocked"); }, async () => {}]) {
    await assert.rejects(drainPersonalSaveWithReconciliation({ getContext, beforeDrain,
      outbox: { drain() { assert.fail("must not dispatch"); }, reconcile() { assert.fail("must not reconcile"); } }
    }));
  }
});

test("read-only preparation is followed by a synchronous check for every successor", async () => {
  const calls = []; let candidate = "first";
  const result = await drainPersonalSaveWithReconciliation({
    getContext,
    async prepareBeforeDrain() { calls.push(`read:${candidate}`); },
    beforeDrain() { calls.push(`check:${candidate}`); },
    outbox: {
      async drain() {
        calls.push(`drain:${candidate}`);
        if (candidate === "first") throw { isOperationReceiptError: true };
        return "confirmed";
      },
      async reconcile() { candidate = "next"; return {}; }
    }, onReconciled() { calls.push("apply:next"); }
  });
  assert.equal(result, "confirmed");
  assert.deepEqual(calls, ["read:first", "check:first", "drain:first", "apply:next", "read:next", "check:next", "drain:next"]);
});

test("failed preparation and a context changed during its read never dispatch", async () => {
  for (const readFails of [true, false]) {
    let current = "original";
    await assert.rejects(drainPersonalSaveWithReconciliation({
      getContext,
      async prepareBeforeDrain() {
        if (readFails) throw Error("server baseline unavailable");
        await Promise.resolve(); current = "changed";
      },
      beforeDrain() { if (current !== "original") throw Error("editor changed"); },
      outbox: { drain() { assert.fail("must not dispatch"); }, reconcile() { assert.fail("must not reconcile"); } }
    }), readFails ? /baseline unavailable/ : /editor changed/);
  }
});

for (const adoptedBaseline of [false, true]) for (const field of ["actorId", "generation"]) {
  test(`late ${field} change after ${adoptedBaseline ? "adoption" : "reconciliation"} does not apply to another editor`, async () => {
    const context = getContext(), calls = [], record = { adoptedBaseline, action: { operationId: "new" } };
    const reconcile = async () => { calls.push("durable"); return record; };
    await assert.rejects(drainPersonalSaveWithReconciliation({
      getContext: () => ({ ...context }),
      outbox: {
        async drain() { calls.push("drain"); throw { isOperationReceiptError: true }; },
        async reconcile() {
          const result = await reconcile();
          // The phase finished its internal checks; invalidate only the
          // awaited caller handoff before the UI can see its durable result.
          context[field] = "other";
          return result;
        }
      },
      onReconciled() { calls.push("reconciled-ui"); },
      onAdopted() { calls.push("adopted-ui"); }
    }), error => error.isOperationReceiptError === true && error.code === "context");
    assert.deepEqual(calls, ["drain", "durable"]);
    assert.equal(record.action.operationId, "new");
  });
}

test("each later reconciliation binds the generation after the preceding UI application", async () => {
  const context = getContext(), calls = []; let attempt = 0;
  const result = await drainPersonalSaveWithReconciliation({
    getContext: () => ({ ...context }),
    outbox: {
      async drain() { if (attempt < 2) throw { isOperationReceiptError: true }; return "confirmed"; },
      async reconcile() { calls.push(`durable:${context.generation}`); return { generation: `successor-${++attempt}` }; }
    },
    onReconciled(record) { context.generation = record.generation; calls.push(`ui:${context.generation}`); }
  });
  assert.equal(result, "confirmed");
  assert.deepEqual(calls, ["durable:original", "ui:successor-1", "durable:successor-1", "ui:successor-2"]);
});

test("current adoption retains its callback's asynchronous return contract", async () => {
  const result = await drainPersonalSaveWithReconciliation({ getContext,
    outbox: { async drain() { throw { isOperationReceiptError: true }; }, async reconcile() { return { adoptedBaseline: true }; } },
    onReconciled() { assert.fail("adoption must not create an action"); },
    async onAdopted() { await Promise.resolve(); return "adopted"; }
  });
  assert.equal(result, "adopted");
});
