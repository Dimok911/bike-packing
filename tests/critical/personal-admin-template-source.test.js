import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publicEntityFixture } from "./personal-public-entity-fixture.js";
import { publicImportFixture } from "./personal-public-import-fixture.js";
import { personalAdminTemplateImportSource, PERSONAL_ADMIN_TEMPLATE_IMPORT_ENABLED, PERSONAL_ADMIN_TEMPLATE_IMPORT_CAPABILITY } from "../../src/sync/personal-admin-template-source.js";
import { assertPersonalPublicImportBody, assertPersonalPublicImportHashes, personalPublicImportReceipt } from "../../src/sync/personal-public-import-protocol.js";
import { createPersonalPublicImportSelectionStore } from "../../src/sync/personal-public-import-selection-store.js";
import { preparePersonalPublicEntitySelection } from "../../src/sync/personal-public-import-selection.js";
import { createExperimentTransport, EXPERIMENT_FRONTEND_ORIGIN } from "../../src/sync/experiment-transport.js";
import { createListOperationQueue, canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";

async function fixture(kind = "tree", photos = false) {
  const f = kind === "whole" ? await publicImportFixture(!photos) : await publicEntityFixture({ kind, photos });
  const source = { ...f.action.body.publicImport.source, kind: "admin-template", payloadDigest: f.action.body.publicImport.sourceHash };
  f.selection.source = structuredClone(source); f.action.body.publicImport.source = structuredClone(source);
  return f;
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
