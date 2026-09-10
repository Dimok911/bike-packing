import test from "node:test";
import assert from "node:assert/strict";
import { hydrateCausalAdminTemplateDrafts } from "../../src/public/admin-template-causal-hydration.js";

function fixture() {
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-demo-state-a", itemKey: "demo-state:a" };
  const record = { publicTemplateKind: "demo", demoListId: binding.listId, published: false, visibility: "private", adminPayloadEndpoint: "/old" };
  const prepared = { ok: true, ...binding, exists: true, deleted: false, stateRevision: 7, visibility: "private", indexes: [],
    metadata: { title: "Prepared title", description: "Prepared note", language: "ru" }, payload: { layouts: { main: { id: "main" } }, items: {} } };
  const context = { actorId: "admin-a", admin: true, generation: "initial" }, layouts = {};
  let reads = 0, materialized = 0, writes = 0, afterRead = () => {}, afterCatalog = () => {};
  const options = { getContext: () => context, getLayouts: () => layouts, getBinding: () => binding,
    readCatalog: async () => { afterCatalog(); return { lists: [record] }; }, normalizeRecords: value => value,
    readTemplate: async () => { reads++; afterRead(); return structuredClone(prepared); },
    materialize: () => { materialized++; return layouts.editor = { id: "editor", adminDemo: true, adminDemoListId: binding.listId }; }, persist: () => writes++ };
  return { binding, record, prepared, context, layouts, options, run: () => hydrateCausalAdminTemplateDrafts(options),
    counts: () => ({ reads, materialized, writes }), afterRead: fn => { afterRead = fn; }, afterCatalog: fn => { afterCatalog = fn; } };
}

test("new draft hydration uses the prepared snapshot and revision without a business write", async () => {
  const f = fixture(); assert.equal((await f.run()).restored, 1);
  assert.deepEqual(f.layouts.editor.adminCausalSource.base, { stateRevision: 7 });
  assert.equal(f.layouts.editor.name, "Prepared title"); assert.equal(f.layouts.editor.note, "Prepared note");
  assert.deepEqual(f.counts(), { reads: 1, materialized: 1, writes: 1 });
});

test("background hydration preserves both old unprepared drafts and pending prepared drafts", async () => {
  const f = fixture(); f.layouts.editor = { id: "editor", adminDemo: true, adminDemoListId: f.binding.listId,
    templatePublished: false, name: "Unsent local name", templateDraftSyncPending: true };
  const before = structuredClone(f.layouts); assert.equal((await f.run()).migrationPending, 1); assert.deepEqual(f.layouts, before);
  f.layouts.editor.adminCausalSource = { binding: f.binding, base: { operationId: "pending" } };
  assert.equal((await f.run()).migrationPending, 0); assert.equal(f.layouts.editor.name, "Unsent local name");
  assert.deepEqual(f.counts(), { reads: 0, materialized: 0, writes: 0 });
});

test("account, route or role changes during catalog or payload reads stop before materialization", async () => {
  for (const stage of ["afterCatalog", "afterRead"]) for (const change of [{ actorId: "admin-b" }, { generation: "other route" }, { admin: false }]) {
    const f = fixture(); f[stage](() => Object.assign(f.context, change));
    await assert.rejects(f.run()); assert.equal(f.counts().materialized, 0); assert.equal(f.counts().writes, 0);
  }
});

test("stale private catalog rows cannot materialize a removed, published, foreign or multi-layout template", async () => {
  for (const change of [{ deleted: true }, { exists: false }, { visibility: "public" }, { payload: { layouts: { a: {}, b: {} } } }]) {
    const f = fixture(); Object.assign(f.prepared, change); assert.equal((await f.run()).restored, 0);
  }
  const foreign = fixture(); foreign.prepared.actorId = "admin-b"; await assert.rejects(foreign.run());
  assert.equal(foreign.counts().materialized, 0);
});

test("a draft created while preparation was waiting is preserved", async () => {
  const f = fixture(); f.afterRead(() => { f.layouts.local = { id: "local", adminDemo: true, adminDemoListId: f.binding.listId,
    templatePublished: false, name: "Created meanwhile" }; });
  assert.equal((await f.run()).restored, 0); assert.equal(f.counts().materialized, 0);
  assert.equal(f.layouts.local.name, "Created meanwhile");
});
