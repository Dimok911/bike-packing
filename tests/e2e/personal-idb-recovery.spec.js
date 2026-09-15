import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Private exports are supplied only by a local environment variable. Never
// include them in source, logs, screenshots or an external network request.
test("phone export recovers and confirms in native IndexedDB without writing the full legacy store", async ({ page, context }) => {
  test.skip(!process.env.BIKE_PHONE_RECOVERY_FILE, "Requires the user's local recovery export");
  test.setTimeout(60000);
  const exported = JSON.parse(await readFile(process.env.BIKE_PHONE_RECOVERY_FILE, "utf8"));
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === "https://repository.test" && /^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(url.pathname)) {
      return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    }
    if (url.origin === "https://repository.test" && url.pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local storage recovery test</title>" });
    await route.abort();
  });
  await page.goto("https://repository.test");
  const completion = page.evaluate(async exported => {
    const { createPersonalDataRepository } = await import("/src/storage/personal-data-repository.js");
    const { preparePersonalDataMigration } = await import("/src/storage/personal-data-migration.js");
    const { createPersonalAsyncOutbox } = await import("/src/sync/personal-async-outbox.js");
    const { drainPersonalSaveWithOrdinaryRecovery } = await import("/src/sync/personal-ordinary-recovery-drain.js");
    const { askPersonalOrdinaryRecovery } = await import("/src/ui/personal-ordinary-recovery-dialog.js");
    const { canonicalListOperationJson } = await import("/src/sync/list-operation-queue.js");
    const { STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY, SYNC_META_KEY } = await import("/src/config/constants.js");
    const binding = exported.binding, getContext = () => ({ ...binding, scope: "personal", generation: "phone-before-choice" });
    for (const entry of exported.entries) localStorage.setItem(entry.key, entry.value);
    for (const key of [STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY]) localStorage.setItem(`${key}::${binding.scopeKey}`, JSON.stringify(exported.snapshot));
    const before = JSON.stringify(Object.entries(localStorage).sort()), originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    let writes = 0;
    Storage.prototype.setItem = () => { writes++; throw new DOMException("Legacy store is full", "QuotaExceededError"); };
    Storage.prototype.removeItem = () => { writes++; throw Error("Do not discard legacy data"); };
    try {
      const repository = await createPersonalDataRepository().open();
      await preparePersonalDataMigration({ repository, storage: localStorage, binding, getContext });
      const adapter = await createPersonalAsyncOutbox({ repository, binding, getContext, nativeOptions: { ordinaryRecoveryEnabled: true } });
      const original = adapter.readView().head, payload = structuredClone(original.action.body.payload);
      // Controlled server fixture, not a read of the real server. A visible
      // changed layout proves that cold loading adopts the selected version.
      const layoutId = Object.keys(payload.layouts)[0];
      payload.layouts[layoutId].name = "Server version selected in local test";
      const proof = async request => {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalListOperationJson({
          environment: binding.environment, actorId: binding.actorId, kind: "list.update", listId: binding.listId, body: JSON.parse(request.body)
        })));
        return { historicalOnly: true, operation: { id: request.operationId, ...binding, kind: "list.update", state: "rejected",
          payloadDigest: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("") },
          resultStatus: 409, rejectionCode: "operation_cancelled", cancellation: { version: 1, operationId: request.operationId,
            noBusinessEffects: true, operationCannotApply: true } };
      };
      let originalDispatched = false, successor = null;
      const queue = { cancelExact: proof, inspect: proof, run: async request => {
        if (request.operationId === original.action.operationId) originalDispatched = true;
        return { stateRevision: 1586 };
      } };
      await drainPersonalSaveWithOrdinaryRecovery({ enabled: true, outbox: adapter, queue, getContext,
        readRemote: async () => ({ id: binding.listId, ownerId: binding.actorId, stateRevision: 1585, payload }),
        chooseServer: details => askPersonalOrdinaryRecovery(details),
        onReconciled: record => { successor = record; },
        drain: () => {
          if (!successor) throw Object.assign(Error("The retained phone save needs review"), { isOperationReceiptError: true });
          return adapter.settleOrdinary({ queue, prepareConfirmation: (_, record) => [
            { key: `${STORAGE_KEY}::${binding.scopeKey}`, raw: JSON.stringify(record.snapshot) },
            { key: `${BASE_STATE_KEY}::${binding.scopeKey}`, raw: JSON.stringify(record.action.body.payload) },
            { key: `${SYNC_META_KEY}::${binding.scopeKey}`, raw: JSON.stringify({ dirty: false, stateRevision: 1586 }) }
          ] });
        }
      });
      const view = adapter.readView(); repository.close();
      return { binding, successorId: successor.action.operationId, layoutId, pending: adapter.status().pending,
        originalDispatched, writes, legacyUnchanged: JSON.stringify(Object.entries(localStorage).sort()) === before,
        snapshotCount: view.snapshots.length };
    } finally { Storage.prototype.setItem = originalSet; Storage.prototype.removeItem = originalRemove; }
  }, exported);
  // Drive the real recovery dialog, not an automatic test-only server choice.
  // Observe early setup failures without leaving an unhandled rejection.
  completion.catch(() => {});
  const dialog = page.locator("#personalOrdinaryRecoveryDialog");
  const opened = await Promise.race([dialog.waitFor({ state: "visible" }).then(() => true), completion.then(() => false)]);
  expect(opened).toBe(true);
  await dialog.getByRole("button", { name: "Загрузить серверную версию", exact: true }).click();
  const result = await completion;
  await expect(dialog).toHaveCount(0);
  expect(result.pending).toBe(false); expect(result.originalDispatched).toBe(false);
  expect(result.writes).toBe(0); expect(result.legacyUnchanged).toBe(true);
  await page.reload();
  const cold = await page.evaluate(async ({ binding, successorId, layoutId }) => {
    const { createPersonalDataRepository } = await import("/src/storage/personal-data-repository.js");
    const { createPersonalAsyncOutbox } = await import("/src/sync/personal-async-outbox.js");
    const { STORAGE_KEY } = await import("/src/config/constants.js");
    const repository = await createPersonalDataRepository().open();
    const adapter = await createPersonalAsyncOutbox({ repository, binding,
      getContext: () => ({ ...binding, scope: "personal", generation: "after-reload" }), nativeOptions: { ordinaryRecoveryEnabled: true } });
    const view = adapter.readView(), snapshot = JSON.parse(view.snapshots.find(row => row.key === `${STORAGE_KEY}::${binding.scopeKey}`).raw);
    return { pending: adapter.status().pending, recoveryPending: view.recoveryState.pending,
      sameSuccessor: view.head.action.operationId === successorId, selectedVersion: snapshot.layouts[layoutId].name === "Server version selected in local test" };
  }, result);
  expect(cold).toEqual({ pending: false, recoveryPending: false, sameSuccessor: true, selectedVersion: true });
});
