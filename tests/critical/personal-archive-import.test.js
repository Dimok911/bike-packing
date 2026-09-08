import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { preparePersonalArchiveImport } from "../../src/sync/personal-archive-import.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";
import { PERSONAL_ARCHIVE_IMPORT_ENABLED, assertPersonalArchiveImportHashes, personalArchiveImportReceipt, validatePersonalArchiveImportResult } from "../../src/sync/personal-archive-import-protocol.js";
import { validPersonalRestoreCancellation } from "../../src/sync/personal-restore-cancellation.js";
import { restoreFullBackupFlow, restoreSelectedBackupLayoutsFlow } from "../../src/backup/restore-flow.js";

function fixture() {
  const context = { environment: "bike-packing-experiment", actorId: "actor", listId: "list", scopeKey: "id:actor", scope: "personal", generation: "archive" };
  const emptyLayout = id => ({ id, name: id, rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} } });
  const source = { items: { archived: { id: "archived", name: "Saved owner", weight: 42 } }, containers: {}, layouts: { source: emptyLayout("source") }, locations: [], categories: [] };
  const current = { items: { old: { id: "old", name: "Current owner" } }, containers: {}, layouts: { current: emptyLayout("current") }, locations: [], categories: [] };
  const values = new Map(), storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = (archiveImportEnabled = true) => createPersonalSaveOutbox({ ...context, storage, archiveImportEnabled });
  const outbox = make(); outbox.adoptRemoteBaseline({ snapshot: current, payload: current, stateRevision: 5 });
  const adopted = [], operationId = randomUUID(), options = { source, mode: "full", sourceActiveLayoutId: "source", outbox,
    getContext: () => context, getState: () => current, getRevision: () => 5, enabled: true, operationId,
    makeSnapshot: (payload, _before, activeLayoutId) => ({ ...payload, activeLayoutId }),
    onCaptured: record => { assert.deepEqual(make().recover(), record); adopted.push(record); } };
  return { source, current, context, storage, values, make, outbox, adopted, options, operationId };
}

test("archive action freezes source before hashing, persists before UI and recovers the same ID/body and dependent edit after lost ACK", async () => {
  assert.equal(PERSONAL_ARCHIVE_IMPORT_ENABLED, false);
  const f = fixture(), previous = structuredClone(f.current), prepared = preparePersonalArchiveImport(f.options);
  f.source.items.archived.name = "Not selected";
  const commit = await prepared; assert.deepEqual(f.current, previous); assert.equal(f.adopted.length, 0);
  const record = commit(); assert.equal(commit(), null); assert.equal(record.action.kind, "list.import");
  assert.equal(record.action.operationId, f.operationId); assert.equal(record.snapshot.items.archived.name, "Saved owner");
  await assertPersonalArchiveImportHashes(record.action.body);
  const next = structuredClone(record.action.body.payload); next.items.archived.weight = 99;
  const child = f.outbox.capture({ snapshot: next, body: { payload: next, baseStateRevision: 5 } });
  assert.equal(child.action.kind, "list.update"); assert.equal(child.action.body.archiveImport, undefined);
  assert.equal(child.action.body.causal.baseOperationId, record.action.operationId);
  const oldBytes = [...f.values], requests = [];
  await assert.rejects(f.make().drain({ getContext: () => f.context, queue: { run: async input => { requests.push(input); throw Error("lost ACK"); } } }), /lost ACK/);
  assert.deepEqual([...f.values], oldBytes); assert.equal(requests[0].operationId, record.action.operationId); assert.equal(requests[0].path, "/bike-packing/lists/list/import");
  await assert.rejects(f.make(false).drain({ getContext: () => f.context, queue: { run: () => assert.fail("disabled") } }), /ещё не включён/);
});

test("archive refuses changed account/editor, pending predecessors, quota and wrong receipt without adopting a partial result", async () => {
  for (const field of ["actorId", "generation", "listId"]) {
    const f = fixture(), commit = await preparePersonalArchiveImport(f.options); f.context[field] = "changed";
    assert.throws(commit, /изменились/); assert.equal(f.adopted.length, 0);
  }
  const pending = fixture(); pending.outbox.capture({ snapshot: pending.current, body: { payload: pending.current, baseStateRevision: 5 } });
  await assert.rejects(preparePersonalArchiveImport(pending.options), /Сначала подтвердите/);
  const quota = fixture(), commit = await preparePersonalArchiveImport(quota.options); quota.storage.setItem = () => { throw Error("quota"); };
  assert.throws(commit, /места/); assert.equal(quota.adopted.length, 0);
  const f = fixture(), saved = (await preparePersonalArchiveImport(f.options))(), expected = saved.action;
  const result = { ok: true, stateRevision: 6, archiveImport: personalArchiveImportReceipt(expected.body.archiveImport),
    list: { id: "list", stateRevision: 6, payload: { ...structuredClone(expected.body.payload), packedItems: {} } } };
  assert.equal(validatePersonalArchiveImportResult(result, expected), true);
  for (const change of [value => value.archiveImport.sourceHash = "b".repeat(64), value => value.list.payload.items.archived.weight++, value => value.list.stateRevision++]) {
    const damaged = structuredClone(result); change(damaged); assert.equal(validatePersonalArchiveImportResult(damaged, expected), false);
  }
});

test("rejected import requires explicit keep-server and retains the source through the durable decision and reload", async () => {
  const f = fixture(), imported = (await preparePersonalArchiveImport(f.options))(), remote = { id: "list", ownerId: "actor", stateRevision: 6, payload: structuredClone(f.current) };
  const proof = { historicalOnly: true, resultStatus: 409, rejectionCode: "stale_state_revision", stateRevision: 6,
    operation: { ...f.outbox.binding, id: imported.action.operationId, kind: "list.import", state: "rejected", payloadDigest: "a".repeat(64) } };
  const options = { queue: { inspect: async () => proof }, getContext: () => f.context, readRemote: async () => remote, makeSnapshot: value => value };
  const original = [...f.values];
  await assert.rejects(f.outbox.reconcile({ ...options, resolveRejectedRestore: async () => "cancel" }), { code: "reconciliation-cancelled" });
  assert.deepEqual([...f.values], original);
  const kept = await f.outbox.reconcile({ ...options, resolveRejectedRestore: async details => { assert.equal(details.source, "archive"); return "keep-server"; } });
  assert.equal(kept.action.kind, "list.update"); assert.equal(kept.action.body.archiveImport, undefined);
  assert.equal(kept.reconciliation.decision.type, "keep-server-after-rejected-import"); assert.equal(validPersonalRestoreCancellation(kept), true);
  assert.deepEqual(f.make().recover(), kept); for (const [key, value] of original) assert.equal(f.values.get(key), value);
});

test("archive confirmation uses the prepared durable action and never falls through to legacy upload or overwrite", async () => {
  for (const mode of ["full", "replace", "copy"]) for (const confirm of [false, true]) {
    const f = fixture(), order = [], status = [], backupImportState = { state: f.source };
    const flow = mode === "full" ? restoreFullBackupFlow : restoreSelectedBackupLayoutsFlow;
    await flow({ backupImportState, selectedBackupLayoutIds: () => new Set(["source"]), selectedBackupRestoreMode: () => mode,
      preparePersonalArchiveImport: async request => {
        order.push("prepare"); assert.equal(request.mode, mode); if (mode !== "full") assert.deepEqual([...request.selectedIds], ["source"]);
        return preparePersonalArchiveImport(f.options);
      },
      askConfirmDialog: async () => { order.push("confirm"); f.source.items.archived.name = "Changed after choice"; return confirm; },
      prepareBackupPhotosForState: () => assert.fail("legacy file preparation"), replaceState: () => assert.fail("legacy state replacement"),
      restoreSelectedBackupLayoutsToState: () => assert.fail("legacy selected restore"), uploadPendingPhotos: () => assert.fail("legacy upload"),
      saveRemoteState: () => assert.fail("legacy overwrite"), setBackupStatus: (text, tone) => status.push({ text, tone }) });
    assert.deepEqual(order, ["prepare", "confirm"]); assert.equal(f.adopted.length, confirm ? 1 : 0);
    if (confirm) { assert.equal(f.adopted[0].snapshot.items.archived.name, "Saved owner"); assert.match(status.at(-1).text, /Ожидается подтверждение сервера/); }
  }
});

test("archive preparation or durable write failure keeps the dialog and cannot report success or use legacy writes", async () => {
  for (const phase of ["prepare", "commit"]) {
    const status = [];
    await restoreFullBackupFlow({ backupImportState: { state: {} }, askConfirmDialog: async () => true,
      preparePersonalArchiveImport: async () => { if (phase === "prepare") throw Error("chosen failure"); return () => { throw Error("chosen failure"); }; },
      replaceState: () => assert.fail("legacy replacement"), saveRemoteState: () => assert.fail("legacy network"),
      setBackupStatus: (text, tone) => status.push({ text, tone }), showToast: () => assert.fail("success toast") });
    assert.equal(status.length, 1); assert.equal(status[0].tone, "error"); assert.match(status[0].text, /chosen failure/);
  }
});
