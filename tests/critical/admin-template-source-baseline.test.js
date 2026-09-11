import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplateSourceBaseline } from "../../src/sync/admin-template-source-baseline.js";
import { adminTemplateCommandPlan } from "../../src/sync/admin-template-save-plan.js";
import { pendingAdminTemplateCopySource } from "../../src/sync/admin-template-copy-source.js";
import { randomUUID } from "node:crypto";

function fixture() {
  const binding = { actorId: "admin-a", environment: "bike-packing-experiment", itemKey: "demo-state:a", listId: "public-demo-state-a" };
  const context = { ...binding, scope: "admin-template", admin: true, generation: "initial" }, values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const prepared = { ok: true, ...binding, exists: true, deleted: false, stateRevision: 7, visibility: "private", indexes: [],
    metadata: { title: "Server label", description: "", language: "ru" }, payload: { layouts: { old: { id: "old", name: "Old data title" } }, items: {} } };
  const editor = { payload: { layouts: { main: { id: "main", name: "Server label" } }, items: {} }, metadata: structuredClone(prepared.metadata) };
  const make = (layoutId = "editor-a", extra = {}) => createAdminTemplateSourceBaseline({ binding, layoutId, getContext: () => context,
    storage, locks: { request: (_key, task) => task() }, ...extra });
  return { binding, context, values, storage, prepared, editor, make };
}

test("read baseline freezes raw server and normalized editor snapshots before await and survives reload", async () => {
  const f = fixture(), original = structuredClone(f.prepared), editor = structuredClone(f.editor), task = f.make().capture(f.prepared, f.editor);
  f.prepared.payload.layouts.old.name = "Late server mutation"; f.editor.payload.layouts.main.name = "Later editor";
  assert.equal(await task, true); const saved = await f.make().read();
  assert.deepEqual(saved.payload, original.payload); assert.deepEqual(saved.editorSnapshot, editor); assert.equal(saved.stateRevision, 7);
  assert.equal(await f.make().capture(original, editor), true); assert.equal(f.values.size, 1);
  saved.payload.layouts.old.name = "Caller mutation"; assert.deepEqual((await f.make().read()).payload, original.payload);
});

test("cache quota leaves opening available and cannot erase or replace an earlier baseline", async () => {
  const f = fixture(); f.storage.setItem = () => { throw new DOMException("Quota", "QuotaExceededError"); };
  assert.equal(await f.make().capture(f.prepared, f.editor), false); assert.equal(await f.make().read(), null);
  f.storage.setItem = (key, value) => f.values.set(key, value); await f.make().capture(f.prepared, f.editor);
  const original = await f.make().read(); f.prepared.stateRevision++;
  await assert.rejects(f.make().capture(f.prepared, f.editor)); assert.deepEqual(await f.make().read(), original);
});

test("baselines cannot cross editor, actor or generation and reject corrupted content", async () => {
  const f = fixture(); await f.make().capture(f.prepared, f.editor);
  assert.equal(await f.make("another-editor").read(), null);
  f.context.actorId = "admin-b"; await assert.rejects(f.make().read()); f.context.actorId = "admin-a";
  const changed = f.make("editor-b", { locks: { request: (_key, task) => { f.context.generation = "changed"; return task(); } } });
  await assert.rejects(changed.capture(f.prepared, f.editor)); assert.equal(f.values.size, 1);
  const key = [...f.values.keys()][0], damaged = JSON.parse(f.values.get(key)); damaged.baseline.payload.items.injected = { id: "injected" };
  f.values.set(key, JSON.stringify(damaged)); await assert.rejects(f.make().read());
});

test("metadata based on a server revision consumes only that editor's exact prepared baseline", async () => {
  const f = fixture(); f.prepared.metadata.description = "  legacy description  ";
  f.editor.metadata.title = "Normalized label"; f.editor.payload.layouts.main.name = "Normalized label";
  f.editor.metadata.description = "legacy description";
  await f.make().capture(f.prepared, f.editor); const baseline = await f.make().read();
  const candidate = structuredClone(f.editor); candidate.metadata.title = "Pending label";
  candidate.payload.layouts.main.name = "Pending label"; candidate.payload.layouts.main.language = "ru";
  const plan = adminTemplateCommandPlan({ binding: f.binding, operationId: randomUUID(), kind: "template.metadata", editorSnapshot: candidate,
    body: { version: 1, base: { stateRevision: 7 }, metadata: { title: "Pending label", language: "ru" } } });
  const source = { exists: true, binding: f.binding, planId: plan.id, base: { operationId: plan.id } }, saved = { plan, cancelRequested: false };
  const result = await pendingAdminTemplateCopySource(source, saved, candidate, [], { baseline });
  assert.deepEqual(result.payload, f.prepared.payload); assert.deepEqual(result.source.base, source.base);
  for (const wrong of [{ ...baseline, stateRevision: 8 }, { ...baseline, binding: { ...baseline.binding, actorId: "other" } }]) {
    await assert.rejects(pendingAdminTemplateCopySource(source, saved, candidate, [], { baseline: wrong }));
  }
  const changed = structuredClone(candidate); changed.payload.items.extra = { id: "extra" };
  const forged = { ...saved, plan: { ...plan, editorSnapshot: changed } };
  await assert.rejects(pendingAdminTemplateCopySource(source, forged, changed, [], { baseline }));
});
