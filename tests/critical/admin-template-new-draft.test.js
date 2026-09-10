import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeNewAdminTemplateDraft } from "../../src/public/admin-template-new-draft.js";
import { adminTemplateSavePlan } from "../../src/sync/admin-template-save-plan.js";

for (const kind of ["demo", "shared"]) test(`new ${kind} draft has a fresh bounded target and an absence-only create plan`, () => {
  const targetId = randomUUID(), layout = { id: "local-draft", name: "New", adminDemo: kind === "demo", rootContainerIds: [], arrangement: { containers: {}, items: {} } };
  const original = structuredClone(layout), result = initializeNewAdminTemplateDraft(layout, { actorId: "admin-a", kind, targetId });
  assert.deepEqual(layout, original); assert.equal(result.templatePublished, false);
  const source = result.adminCausalSource;
  assert.equal(source.binding.listId.length <= 64, true); assert.equal(source.exists, false); assert.equal(source.base, null);
  const plan = adminTemplateSavePlan({ binding: source.binding, operationId: randomUUID(), base: null, exists: false, visibility: null,
    payload: { layouts: { [result.id]: result } }, metadata: { title: "New", description: "", language: "ru" } });
  assert.equal(plan.operations.length, 1); assert.equal(plan.operations[0].kind, "template.create"); assert.equal(plan.operations[0].body.base, null);
  assert.notEqual(initializeNewAdminTemplateDraft(layout, { actorId: "admin-a", kind }).adminCausalSource.binding.listId, source.binding.listId);
});

test("new draft initialization rejects existing causal state, content, actor and invalid identity", () => {
  const empty = { id: "draft", rootContainerIds: [], arrangement: {} }, args = { actorId: "admin-a", kind: "demo" };
  for (const layout of [{ ...empty, adminCausalSource: {} }, { ...empty, rootContainerIds: ["bag"] },
    { ...empty, arrangement: { items: { item: "bag" } } }, { ...empty, arrangement: { containers: { bag: {} } } }]) {
    assert.throws(() => initializeNewAdminTemplateDraft(layout, args));
  }
  assert.throws(() => initializeNewAdminTemplateDraft(empty, { ...args, actorId: "" }));
  assert.throws(() => initializeNewAdminTemplateDraft(empty, { ...args, targetId: "existing-source" }));
});
