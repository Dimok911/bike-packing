import test from "node:test";
import assert from "node:assert/strict";
import { adminClientFixture } from "../fixtures/admin-template-client-fixture.js";
import { createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { createAdminTemplateSaveFlow, adminTemplateEditorSource } from "../../src/public/admin-template-causal-save-flow.js";

function fixture() {
  const f = adminClientFixture(), snapshot = f.action().body;
  const layout = { id: "ui-layout", templatePublished: false, adminCausalSource: adminTemplateEditorSource(f.binding, {
    ok: true, ...f.binding, exists: true, stateRevision: 7, visibility: "private", indexes: [] }) };
  let persisted = 0;
  const changes = [], plans = () => createAdminTemplateSavePlans({ binding: f.binding, client: f.make().client, getContext: () => f.context,
    storage: { get length() { return f.values.size; }, key: i => [...f.values.keys()][i], getItem: key => f.values.get(key) ?? null,
      setItem: (key, value) => { if (f.state.quota) throw Error("Quota"); f.values.set(key, value); } },
    locks: { request: async (_key, fn) => fn() }, enabled: true });
  const make = () => createAdminTemplateSaveFlow({ getLayout: id => id === layout.id ? layout : null,
    getContext: () => f.context, snapshot: () => ({ payload: snapshot.payload, metadata: snapshot.metadata }),
    plansFor: plans, persist: () => persisted++, notify: state => changes.push(state), enabled: true });
  return { ...f, snapshot, layout, make, plans, changes, persisted: () => persisted };
}

test("the editor preserves its observed revision; late preparation cannot authorize an edited snapshot", () => {
  const f = fixture();
  assert.equal(f.layout.adminCausalSource.base.stateRevision, 7);
  for (const changed of [{ actorId: "admin-b" }, { listId: "private-list" }, { deleted: true }, { stateRevision: 0 }]) {
    assert.throws(() => adminTemplateEditorSource(f.binding, { ok: true, ...f.binding, exists: true, stateRevision: 7, visibility: "private", indexes: [], ...changed }));
  }
});
test("consecutive edits freeze two candidates and persist an explicit predecessor before autosave", async () => {
  const f = fixture(), flow = f.make();
  const first = flow.capture(f.layout.id, { published: false }); f.snapshot.payload.items.a.name = "Second captured item";
  const second = flow.capture(f.layout.id, { published: false });
  const [a,b] = await Promise.all([first, second]); assert.notEqual(a.operationId, b.operationId);
  const plans = await f.plans().list(), older = plans.find(value => value.plan.id === a.operationId), newer = plans.find(value => value.plan.id === b.operationId);
  assert.equal(older.plan.operations[0].body.payload.items.a.name, "Captured name");
  assert.equal(newer.plan.operations[0].body.payload.items.a.name, "Second captured item");
  assert.deepEqual(newer.plan.operations[0].body.base, { operationId: a.operationId });
  const result = await flow.flush(f.layout.id); assert.equal(result.applied, true); assert.equal(f.posts().length, 2);
  assert.deepEqual(f.layout.adminCausalSource.base, { stateRevision: 9 }); assert.equal(f.layout.adminCausalSource.planId, null);
});
test("reload after an unknown write resumes the saved chain without collecting a fresh payload", async () => {
  const f = fixture(); await f.make().capture(f.layout.id, { published: true });
  const id = f.layout.adminCausalSource.planId; f.state.lose = true; f.state.hidden = true;
  await assert.rejects(f.make().flush(f.layout.id)); assert.equal(f.layout.adminCausalSource.planId, id);
  f.state.lose = false; f.state.hidden = false;
  const result = await f.make().flush(f.layout.id); assert.equal(result.applied, true); assert.equal(f.layout.templatePublished, true);
  assert.equal(f.posts().length, 2); assert.deepEqual(f.layout.adminCausalSource.base, { stateRevision: 9 });
});
test("an old ACK cannot clear a newer visible edit even if it was not queued yet", async () => {
  const f = fixture(), flow = f.make(); await flow.capture(f.layout.id, { published: false });
  f.state.afterPost = () => { f.snapshot.metadata.title = "New unsent title"; };
  const result = await flow.flush(f.layout.id); assert.equal(result.applied, false);
  assert.ok(f.layout.adminCausalSource.planId); assert.equal(f.layout.templateDraftSyncPending, true);
  assert.equal(f.snapshot.metadata.title, "New unsent title");
});
test("the editor's administrative source metadata never becomes a published payload field", async () => {
  const f = fixture(), flow = f.make(); f.snapshot.payload.layouts = { one: { id: "one", adminCausalSource: { arbitrary: "private editor metadata" } } };
  await flow.capture(f.layout.id, { published: false }); await flow.flush(f.layout.id);
  assert.equal(JSON.stringify(f.posts()).includes("private editor metadata"), false);
});

test("local pending indicators do not invalidate a confirmed candidate or enter its payload", async () => {
  const f = fixture(), flow = f.make(); f.snapshot.payload.layouts = { one: f.layout };
  const first = await flow.capture(f.layout.id, { published: false });
  const repeated = await flow.capture(f.layout.id, { published: false });
  assert.deepEqual(repeated, first);
  assert.equal((await flow.flush(f.layout.id)).applied, true);
  assert.equal(f.posts().length, 1);
  for (const key of ["adminCausalSource", "templateDraftSyncPending", "templatePublished"])
    assert.equal(Object.hasOwn(JSON.parse(f.posts()[0].options.body).body.payload.layouts.one, key), false);
});
test("capture failure and route changes leave business requests unsent", async () => {
  const f = fixture(), flow = f.make(); f.state.quota = true;
  await assert.rejects(flow.capture(f.layout.id, { published: false })); await assert.rejects(flow.flush(f.layout.id)); assert.equal(f.posts().length, 0);
  const next = fixture(), fresh = next.make(), capture = fresh.capture(next.layout.id, { published: false }); next.context.generation = "new route";
  await assert.rejects(capture); assert.equal(next.posts().length, 0);
});

test("a crash between plan durability and editor-pointer durability recovers the original plan", async () => {
  const f = fixture(), previous = structuredClone(f.layout.adminCausalSource);
  const captured = await f.make().capture(f.layout.id, { published: false });
  f.layout.adminCausalSource = previous; delete f.layout.templateDraftSyncPending;
  const reloaded = f.make(); assert.deepEqual(await reloaded.recover(f.layout.id), { state: "pending" });
  assert.equal(f.layout.adminCausalSource.planId, captured.operationId);
  assert.equal((await reloaded.flush(f.layout.id)).applied, true); assert.equal(f.posts().length, 1);
  assert.equal(JSON.parse(f.posts()[0].options.body).operationId, captured.operationId);
});

test("another tab's durable successor cannot be replaced by capturing a fresh operation", async () => {
  const f = fixture(), previous = structuredClone(f.layout.adminCausalSource);
  await f.make().capture(f.layout.id, { published: false }); f.layout.adminCausalSource = previous;
  f.snapshot.payload.items.a.name = "Unsent competing edit";
  await assert.rejects(f.make().capture(f.layout.id, { published: false }), { code: "admin-template-editor-recovery-required" });
  await assert.rejects(f.make().recover(f.layout.id), { code: "admin-template-editor-recovery-required" });
  assert.equal((await f.plans().list()).length, 1); assert.equal(f.posts().length, 0);
  assert.equal(f.snapshot.payload.items.a.name, "Unsent competing edit");
});

test("two already saved branches require an explicit choice instead of timestamp ordering", async () => {
  const f = fixture(), action = f.action();
  const input = { operationId: action.operationId, exists: true, visibility: "private", base: { stateRevision: 7 },
    payload: f.snapshot.payload, metadata: f.snapshot.metadata, published: false };
  await f.plans().capture(input); await f.plans().capture({ ...input, operationId: f.action().operationId });
  await assert.rejects(f.make().recover(f.layout.id), { code: "admin-template-editor-recovery-required" });
  assert.equal(f.layout.adminCausalSource.planId, null); assert.equal(f.posts().length, 0);
});

test("metadata is a distinct immutable command following the pending data save", async () => {
  const f = fixture(), flow = f.make();
  const data = await flow.capture(f.layout.id, { published: false });
  f.snapshot.metadata.title = "Changed title";
  const metadata = { title: "Changed title", language: "ru", layoutOrder: 2 };
  await flow.captureCommand(f.layout.id, { kind: "template.metadata", metadata }); metadata.title = "Late mutation";
  assert.equal((await flow.flush(f.layout.id)).applied, true);
  const requests = f.posts().map(call => JSON.parse(call.options.body));
  assert.deepEqual(requests.map(request => request.kind), ["template.save", "template.metadata"]);
  assert.deepEqual(requests[1].body.base, { operationId: data.operationId });
  assert.deepEqual(requests[1].body.metadata, { title: "Changed title", language: "ru", layoutOrder: 2 });
  assert.equal(Object.hasOwn(requests[1].body, "payload"), false);
  assert.deepEqual(f.layout.adminCausalSource.base, { stateRevision: 9 });
});

test("a saved delete resumes after reload and prevents a new save of the same target", async () => {
  const f = fixture(), flow = f.make();
  const command = await flow.captureCommand(f.layout.id, { kind: "template.delete" });
  await assert.rejects(flow.capture(f.layout.id));
  assert.equal((await f.make().flush(f.layout.id)).applied, true);
  assert.equal(f.layout.adminCausalSource.deleted, true);
  await assert.rejects(f.make().capture(f.layout.id));
  assert.equal(f.posts().length, 1); assert.equal(JSON.parse(f.posts()[0].options.body).operationId, command.operationId);
});

test("a command survives pointer loss and a delayed command receipt cannot clear newer fields", async () => {
  const f = fixture(), original = structuredClone(f.layout.adminCausalSource);
  await f.make().captureCommand(f.layout.id, { kind: "template.metadata", metadata: { title: f.snapshot.metadata.title, language: "ru" } });
  f.layout.adminCausalSource = original;
  const recovered = f.make(); await recovered.recover(f.layout.id);
  f.state.afterPost = () => { f.snapshot.metadata.title = "New unsent title"; };
  assert.equal((await recovered.flush(f.layout.id)).applied, false);
  assert.ok(f.layout.adminCausalSource.planId); assert.equal(f.posts().length, 1);
});
