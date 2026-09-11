import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publicEntityFixture } from "./personal-public-entity-fixture.js";
import { publicImportFixture } from "./personal-public-import-fixture.js";
import { personalAdminTemplateImportSource, PERSONAL_ADMIN_TEMPLATE_IMPORT_ENABLED, PERSONAL_ADMIN_TEMPLATE_IMPORT_CAPABILITY,
  PERSONAL_PENDING_ADMIN_TEMPLATE_IMPORT_ENABLED, PERSONAL_PENDING_ADMIN_TEMPLATE_IMPORT_CAPABILITY } from "../../src/sync/personal-admin-template-source.js";
import { assertPersonalPublicImportBody, assertPersonalPublicImportHashes, personalPublicImportReceipt,
  personalPublicImportSourceReads, validatePersonalPublicImportResult } from "../../src/sync/personal-public-import-protocol.js";
import { createPersonalPublicImportSelectionStore } from "../../src/sync/personal-public-import-selection-store.js";
import { preparePersonalPublicEntitySelection } from "../../src/sync/personal-public-import-selection.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createListOperationQueue, canonicalListOperationJson, validateWaitingOperation } from "../../src/sync/list-operation-queue.js";
import { createPersonalSaveOutbox } from "../../src/sync/personal-save-outbox.js";

async function fixture(kind = "tree", photos = false) {
  const f = kind === "whole" ? await publicImportFixture(!photos) : await publicEntityFixture({ kind, photos });
  const source = { ...f.action.body.publicImport.source, kind: "admin-template", payloadDigest: f.action.body.publicImport.sourceHash };
  f.selection.source = structuredClone(source); f.action.body.publicImport.source = structuredClone(source);
  return f;
}

async function pendingFixture(kind = "tree", photos = false) {
  const f = await fixture(kind, photos), source = f.action.body.publicImport.source;
  delete source.stateRevision; source.base = { operationId: crypto.randomUUID() };
  f.selection.source = structuredClone(source); f.action.body.causal.reads = [];
  return f;
}

function memoryStorage() {
  const values = new Map();
  return { values, get length() { return values.size; }, key: index => [...values.keys()][index],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

function operationExpected(action) {
  const { environment, actorId, kind, listId, body } = action;
  return { ...action, payloadDigest: createHash("sha256").update(canonicalListOperationJson({ environment, actorId, kind, listId, body })).digest("hex") };
}

function waitingReceipt(expected) {
  return { ok: true, operation: { id: expected.operationId, environment: expected.environment, actorId: expected.actorId,
    listId: expected.listId, kind: expected.kind, payloadDigest: expected.payloadDigest, state: "waiting" }, result: null,
    waiting: { code: "dependency_not_committed", retrySameOperation: true, operationIds: [expected.body.publicImport.source.base.operationId] } };
}

test("administrative import source is explicit, immutable and disabled by default", async () => {
  assert.equal(PERSONAL_ADMIN_TEMPLATE_IMPORT_ENABLED, false);
  const f = await fixture(), source = f.selection.source;
  assert.deepEqual(personalAdminTemplateImportSource(source), source);
  for (const mutate of [s => { s.kind = "public-template"; }, s => { delete s.payloadDigest; }, s => { s.payloadDigest = "x".repeat(64); },
    s => { s.stateRevision = 0; }, s => { s.language = "zz"; }, s => { s.listId = "personal"; }, s => { s.base = { operationId: crypto.randomUUID() }; }]) {
    const changed = structuredClone(source); mutate(changed); assert.throws(() => personalAdminTemplateImportSource(changed));
  }
  const cloned = personalAdminTemplateImportSource(source); source.stateRevision++; assert.notEqual(cloned.stateRevision, source.stateRevision);
});

for (const kind of ["item", "empty", "tree", "catalog", "whole"]) test(`administrative source ${kind} uses private allocator with exact source proof`, async () => {
  const f = await fixture(kind), original = structuredClone(f.action.body);
  assert.deepEqual(assertPersonalPublicImportBody(f.action.body, f.options), f.plan);
  await assertPersonalPublicImportHashes(f.action.body); assert.deepEqual(f.action.body, original);
  if (kind !== "whole") assert.deepEqual(preparePersonalPublicEntitySelection(f.selection, { enabled: true, createUuid: (() => {
    const ids = [f.selection.operationId, ...f.selection.ownerTargets.map(row => row.targetId.replace(/^(item|container)-/, ""))]; return () => ids.shift();
  })() }), f.selection);
  const changed = structuredClone(f.action.body); changed.publicImport.source.payloadDigest = "0".repeat(64);
  await assert.rejects(assertPersonalPublicImportHashes(changed));
});

test("administrative source files require a separate adapter and cannot be silently dropped", async () => {
  for (const kind of ["item", "tree", "whole"]) {
    const f = await fixture(kind, true);
    assert.throws(() => assertPersonalPublicImportBody(f.action.body, f.options));
    await assert.rejects(assertPersonalPublicImportHashes(f.action.body));
  }
});

test("administrative source selection and action survive cold reads, quota and changed proof", async () => {
  const f = await fixture(), values = new Map(), context = { ...f.binding, scope: "personal", generation: "selected-admin-copy" };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const make = enabled => createPersonalPublicImportSelectionStore({ binding: f.binding, getContext: () => context, storage,
    locks: { request: async (key, run) => run() }, enabled, publicEntityEnabled: enabled });
  await make(true).capture(f.selection); await make(true).rememberAction({ selection: f.selection, action: f.action });
  assert.deepEqual((await make(false).entries())[0].action, f.action);
  const before = [...values], changed = structuredClone(f.selection); changed.source.stateRevision++;
  await assert.rejects(make(true).capture(changed)); assert.deepEqual([...values], before);
  storage.setItem = () => { throw Error("quota"); };
  const next = structuredClone(f.selection); next.operationId = crypto.randomUUID();
  await assert.rejects(make(true).capture(next)); assert.deepEqual([...values], before);
});

test("administrative import queue requires its capability and recovers a lost ACK without another POST", async () => {
  const f = await fixture(), values = new Map(), receipts = new Map(), calls = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const locks = { request: async (key, run) => run() }, context = { ...f.binding, scope: "personal", generation: "reverse-editor" };
  let capability = false, lose = true;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options }); let data;
    if (url.endsWith("/auth/me")) data = { user: { id: f.binding.actorId } };
    else if (url.endsWith("/capabilities")) data = { capabilities: ["personalListCausalOperationsV1", "personalPhotoPublicationV1", "personalCausalPublicImportV1", "personalCausalPublicEntitiesV1", ...(capability ? [PERSONAL_ADMIN_TEMPLATE_IMPORT_CAPABILITY] : [])] };
    else if (options.method === "POST") {
      const input = JSON.parse(options.body), { operationId: id, expectedActorId: actorId, ...rest } = input, intent = { ...rest, actorId };
      data = { ok: true, operation: { ...intent, id, payloadDigest: createHash("sha256").update(canonicalListOperationJson(intent)).digest("hex"), state: "committed" },
        result: { status: 200, payload: { ok: true, stateRevision: f.action.body.baseStateRevision + 1, list: { id: f.binding.listId, stateRevision: f.action.body.baseStateRevision + 1, payload: f.plan.payload },
          publicPhotos: [], publicImport: personalPublicImportReceipt(f.action.body.publicImport) } } };
      receipts.set(id, data); if (lose) throw Error("lost ACK");
    } else data = receipts.get(url.split("/").at(-1)) || { ok: true, operation: { state: "unknown" } };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const make = (enabled = true) => createListOperationQueue({ enabled: true, photoEnabled: true, publicImportEnabled: true, publicEntityEnabled: true, adminTemplateImportEnabled: enabled,
    transport: createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, storage, locks, selection: "direct" }), getContext: () => context, storage, locks, fetchImpl });
  const input = { path: `/bike-packing/lists/${f.binding.listId}/import`, method: "POST", body: JSON.stringify(f.action.body), operationId: f.action.operationId, receiptOnly: true };
  await assert.rejects(make(false).run(input)); assert.equal(calls.length, 0);
  await assert.rejects(make().run(input)); assert.equal(calls.filter(row => row.options.method === "POST").length, 0);
  capability = true; await make().run(input); lose = false; capability = false;
  await make().run(input); assert.equal(calls.filter(row => row.options.method === "POST").length, 1);
});

test("pending administrative source freezes exactly one parent UUID and never invents a revision read", async () => {
  assert.equal(PERSONAL_PENDING_ADMIN_TEMPLATE_IMPORT_ENABLED, false);
  const f = await pendingFixture(), source = f.selection.source, saved = structuredClone(source);
  const clone = personalAdminTemplateImportSource(source);
  assert.deepEqual(clone, saved); assert.deepEqual(personalPublicImportSourceReads(source), []);
  source.base.operationId = crypto.randomUUID(); assert.deepEqual(clone, saved);
  for (const mutate of [s => { s.stateRevision = 8; }, s => { delete s.base; }, s => { s.base = {}; },
    s => { s.base.operationId = "not-uuid"; }, s => { s.base.operationId = s.base.operationId.toUpperCase(); },
    s => { s.base.revision = 8; }, s => { s.base = { stateRevision: 8 }; }, s => { s.base = null; },
    s => { s.kind = "public-template"; }, s => { s.extra = true; }]) {
    const changed = structuredClone(saved); mutate(changed);
    assert.throws(() => personalPublicImportSourceReads(changed));
  }
});

test("pending administrative item, container and whole copies preserve the full source proof without personal parent dependencies", async () => {
  for (const kind of ["item", "empty", "tree", "catalog", "whole"]) {
    const f = await pendingFixture(kind), original = structuredClone(f.action.body);
    assert.deepEqual(assertPersonalPublicImportBody(f.action.body, f.options), f.plan);
    await assertPersonalPublicImportHashes(f.action.body); assert.deepEqual(f.action.body, original);
    for (const mutate of [body => { body.causal.reads = [{ listId: body.publicImport.source.listId, revision: 8 }]; },
      body => { body.causal.dependsOn.push({ operationId: body.publicImport.source.base.operationId, listId: f.binding.listId }); },
      body => { body.publicImport.source.base.operationId = body.publicImport.operationId; },
      body => { body.publicImport.source.stateRevision = 8; }]) {
      const changed = structuredClone(original); mutate(changed);
      assert.throws(() => assertPersonalPublicImportBody(changed, f.options));
    }
    const changed = structuredClone(original); changed.publicImport.sourcePayload.items.item.name = "Changed selected source";
    await assert.rejects(assertPersonalPublicImportHashes(changed));
  }
  for (const kind of ["item", "tree", "whole"]) {
    const f = await pendingFixture(kind, true);
    assert.throws(() => assertPersonalPublicImportBody(f.action.body, f.options));
  }
});

test("pending administrative selection and fileless outbox survive cold OFF reads with their original source and private scope", async () => {
  const f = await pendingFixture(), storage = memoryStorage(), locks = { request: async (key, run) => run() };
  const context = { ...f.binding, scope: "personal", generation: "pending-admin-copy" };
  const journal = enabled => createPersonalPublicImportSelectionStore({ binding: f.binding, storage, locks,
    getContext: () => context, enabled, publicEntityEnabled: enabled });
  await journal(true).capture(f.selection);
  const outbox = createPersonalSaveOutbox({ ...f.binding, storage, photoEnabled: true, publicImportEnabled: true, publicEntityEnabled: true });
  outbox.adoptRemoteBaseline({ snapshot: f.options.base, payload: f.options.base, stateRevision: f.action.body.baseStateRevision });
  const body = structuredClone(f.action.body); delete body.causal;
  const plan = outbox.preparePhoto({ snapshot: f.plan.payload, payload: f.plan.payload, body, operationId: f.action.operationId });
  assert.deepEqual(plan.action.body.causal, { reads: [], dependsOn: [] });
  const record = await outbox.capturePhoto({ plan, getContext: () => context });
  await journal(true).rememberAction({ selection: f.selection, action: record.action });
  const cold = createPersonalSaveOutbox({ ...f.binding, storage });
  assert.deepEqual(cold.recover().action, record.action);
  assert.deepEqual((await journal(false).entries())[0].action, record.action);
  const before = [...storage.values], changed = structuredClone(f.selection); changed.source.base.operationId = crypto.randomUUID();
  await assert.rejects(journal(true).capture(changed)); assert.deepEqual([...storage.values], before);
  await assert.rejects(cold.drain({ getContext: () => context, queue: {} }));
  assert.deepEqual(cold.recover().action, record.action);
  context.scope = "admin"; await assert.rejects(journal(false).entries());
  context.scope = "personal";
  const key = [...storage.values.keys()].find(key => {
    const value = JSON.parse(storage.getItem(key)); return value.version === 3 && value.action?.operationId === f.action.operationId;
  });
  assert.ok(key);
  const corrupt = JSON.parse(storage.getItem(key)); corrupt.action.body.causal.reads = [{ listId: f.selection.source.listId, revision: 8 }];
  storage.setItem(key, JSON.stringify(corrupt));
  assert.throws(() => createPersonalSaveOutbox({ ...f.binding, storage }).recover());
});

test("waiting proof allows only the exact administrative source UUID and unchanged private operation binding", async () => {
  const f = await pendingFixture(), expected = operationExpected(f.action), proof = waitingReceipt(expected);
  assert.equal(validateWaitingOperation(proof, expected), true);
  for (const mutate of [value => { value.waiting.operationIds = [crypto.randomUUID()]; },
    value => { value.waiting.operationIds.push(crypto.randomUUID()); }, value => { value.waiting.operationIds = []; },
    value => { value.waiting.retrySameOperation = false; }, value => { value.waiting.code = "unknown"; },
    value => { value.operation.actorId = "other"; }, value => { value.operation.listId = "other"; },
    value => { value.operation.id = crypto.randomUUID(); }, value => { value.operation.payloadDigest = "0".repeat(64); },
    value => { value.operation.environment = "other"; }, value => { value.operation.kind = "list.update"; },
    value => { value.operation.state = "unknown"; }, value => { value.result = {}; }]) {
    const changed = structuredClone(proof); mutate(changed); assert.equal(validateWaitingOperation(changed, expected), false);
  }
  for (const mutate of [value => { value.body.publicImport.source.stateRevision = 8; },
    value => { value.body.publicImport.source.base.operationId = crypto.randomUUID(); },
    value => { value.body.publicImport.operationId = crypto.randomUUID(); },
    value => { value.body.causal.dependsOn = [{ listId: value.listId, operationId: value.body.publicImport.source.base.operationId }]; },
    value => { value.body.causal.reads = [{ listId: value.body.publicImport.source.listId, revision: 8 }]; }]) {
    const changed = structuredClone(expected); mutate(changed); assert.equal(validateWaitingOperation(proof, changed), false);
  }
});

test("pending administrative queue gates first POST and exact waiting replay, then recovers committed lost ACK through cold read", async () => {
  const f = await pendingFixture(), expected = operationExpected(f.action), storage = memoryStorage(), calls = [];
  const locks = { request: async (key, run) => run() }, context = { ...f.binding, scope: "personal", generation: "pending-admin-copy" };
  let capability = false, sourceCommitted = false, lose = false, receipt = null;
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body }); let data;
    if (url.endsWith("/auth/me")) data = { user: { id: context.actorId } };
    else if (url.endsWith("/capabilities")) data = { capabilities: ["personalListCausalOperationsV1", "personalPhotoPublicationV1",
      "personalCausalPublicImportV1", "personalCausalPublicEntitiesV1", PERSONAL_ADMIN_TEMPLATE_IMPORT_CAPABILITY,
      ...(capability ? [PERSONAL_PENDING_ADMIN_TEMPLATE_IMPORT_CAPABILITY] : [])] };
    else if (options.method === "POST") {
      const posted = JSON.parse(options.body);
      assert.equal(posted.operationId, f.action.operationId); assert.deepEqual(posted.body, f.action.body);
      data = waitingReceipt(expected);
      if (sourceCommitted) {
        data.operation.state = "committed"; delete data.waiting;
        data.result = { status: 200, payload: { ok: true, stateRevision: f.action.body.baseStateRevision + 1,
          list: { id: f.binding.listId, stateRevision: f.action.body.baseStateRevision + 1, payload: f.plan.payload },
          publicPhotos: [], publicImport: personalPublicImportReceipt(f.action.body.publicImport) } };
      }
      receipt = structuredClone(data); if (lose) throw Error("lost ACK");
    } else data = receipt || { ok: true, operation: { state: "unknown" } };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const make = (enabled = true, readOnly = false) => createListOperationQueue({ enabled: !readOnly, photoEnabled: !readOnly,
    publicImportEnabled: !readOnly, publicEntityEnabled: !readOnly, adminTemplateImportEnabled: !readOnly,
    pendingAdminTemplateImportEnabled: enabled && !readOnly, readOnly,
    transport: createExperimentTransport({ locationLike: { origin: EXPERIMENT_FRONTEND_ORIGIN }, storage, locks, selection: "direct" }),
    getContext: () => context, storage, locks, fetchImpl });
  const input = { path: `/bike-packing/lists/${f.binding.listId}/import`, method: "POST", body: JSON.stringify(f.action.body),
    operationId: f.action.operationId, receiptOnly: true };
  const posts = () => calls.filter(call => call.method === "POST");
  await assert.rejects(make(false).run(input)); assert.equal(calls.length, 0);
  await assert.rejects(make().run(input)); assert.equal(posts().length, 0);
  capability = true;
  await assert.rejects(make().run(input), error => error.isOperationWaiting === true); assert.equal(posts().length, 1);
  capability = false;
  await assert.rejects(make().run(input)); assert.equal(posts().length, 1);
  await assert.rejects(make(false, true).inspect(input), error => error.isOperationWaiting === true); assert.equal(posts().length, 1);
  capability = true;
  receipt = { ok: true, operation: { state: "unknown" } };
  await assert.rejects(make().run(input)); assert.equal(posts().length, 1);
  receipt = waitingReceipt(expected); receipt.waiting.operationIds = [crypto.randomUUID()];
  await assert.rejects(make().run(input)); assert.equal(posts().length, 1);
  receipt = waitingReceipt(expected);
  const changed = structuredClone(f.action.body); changed.publicImport.source.base.operationId = crypto.randomUUID();
  await assert.rejects(make().run({ ...input, body: JSON.stringify(changed) })); assert.equal(posts().length, 1);
  sourceCommitted = true; lose = true;
  await make().run(input); assert.equal(posts().length, 2); assert.equal(posts()[0].body, posts()[1].body);
  assert.equal(validatePersonalPublicImportResult(receipt.result.payload, expected), true);
  const wrong = structuredClone(receipt.result.payload); wrong.publicImport.source = { ...wrong.publicImport.source, stateRevision: 9 };
  assert.equal(validatePersonalPublicImportResult(wrong, expected), false);
  capability = false;
  const proof = await make(false, true).inspect(input); assert.equal(proof.operation.state, "committed"); assert.equal(posts().length, 2);
});
