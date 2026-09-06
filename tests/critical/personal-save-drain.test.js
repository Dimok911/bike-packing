import test from "node:test";
import assert from "node:assert/strict";
import { drainPersonalSaveWithReconciliation } from "../../src/sync/personal-save-drain.js";

test("personal drain applies only a durably reconciled candidate before dispatching its new action", async () => {
  const calls = [], record = { action: { operationId: "new" } };
  const result = await drainPersonalSaveWithReconciliation({ outbox: {
    async drain() { calls.push("drain"); if (calls.length === 1) throw { isOperationReceiptError: true }; return "confirmed"; },
    async reconcile() { calls.push("durable"); return record; }
  }, onReconciled(value) { assert.equal(value, record); calls.push("ui"); } });
  assert.equal(result, "confirmed"); assert.deepEqual(calls, ["drain", "durable", "ui", "drain"]);
});

test("personal drain never spins indefinitely, bypasses a recovery latch, or invents settlement after an unknown result", async () => {
  for (const failure of ["changing-server", "storage", "offline", "unknown"]) {
    let drains = 0, reconciliations = 0, applications = 0;
    await assert.rejects(drainPersonalSaveWithReconciliation({ outbox: {
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
