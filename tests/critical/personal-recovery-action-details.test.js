import test from "node:test";
import assert from "node:assert/strict";
import { describePersonalRecoveryActions as describe, explainPersonalRecoveryReason as explain } from "../../src/ui/personal-recovery-action-details.js";
import { personalPlacementIntent, preparePersonalPlacementMutation } from "../../src/sync/personal-placement-mutation.js";

const clone = value => structuredClone(value);
const payload = () => ({ items: { item: { id: "item", name: "Палатка", weight: 100 }, second: { id: "second", name: "Тент" } },
  containers: { bag: { id: "bag", name: "Рамная сумка", itemIds: [], childIds: [], photos: [] },
    target: { id: "target", name: "Подседельная сумка", itemIds: [], childIds: [], photos: [] } },
  layouts: { layout: { id: "layout", name: "Поход", rootContainerIds: ["target"],
    arrangement: { rootContainerIds: ["target"], containers: { target: { parentId: "", childIds: [], itemIds: [], order: [] } }, items: {}, packedItems: {} } } },
  activeLayoutId: "layout", packedItems: {} });
function record(value = payload(), body = {}) {
  return { action: { operationId: "saved-operation", environment: "bike-packing-experiment", actorId: "actor", scopeKey: "id:actor", listId: "list", generation: 1,
    kind: "list.update", body: { baseStateRevision: 9, payload: value, ...body } } };
}
function placement(action) {
  const bag = ["link-root", "link-container", "remove-container", "move-container", "move-root", "replace-container", "lift-container"].includes(action);
  const value = { type: "placement", version: 1, layoutId: "layout", action, ids: [bag ? "bag" : "item"],
    removedItemIds: [], removedContainerIds: [], deletedContainerIds: [] };
  if (action === "set-packed") value.packed = false;
  if (["move-item", "move-container", "move-root", "lift-container", "link-item", "link-container", "link-root"].includes(action)) value.targetIndex = null;
  if (["move-item", "move-container", "link-item", "link-container"].includes(action)) value.targetContainerId = "target";
  if (action.startsWith("link-")) {
    value.linkedItemIds = bag ? [] : ["item"]; value.linkedContainerIds = bag ? ["bag"] : [];
    if (action === "link-root") value.includeContents = false;
  }
  if (["remove-item", "replace-item"].includes(action)) value.removedItemIds = ["item"];
  if (["remove-container", "replace-container"].includes(action)) value.removedContainerIds = ["bag"];
  if (action.startsWith("replace-")) value.replacementId = bag ? "target" : "second";
  if (action === "group-items") { value.ids = ["item", "second"]; value.groupId = "new-group"; }
  return personalPlacementIntent(value);
}

for (const action of ["remove-item", "remove-container", "set-packed", "move-item", "move-container", "move-root", "group-items", "replace-item",
  "replace-container", "lift-container", "link-item", "link-container", "link-root"]) {
  test(`validated ${action} has useful RU/EN text without requiring a merge base`, () => {
    const saved = record(payload(), { userPlacement: placement(action) });
    for (const language of ["ru", "en"]) {
      const result = describe([saved], { language })[0];
      assert.equal(result.detailUnavailable, false); assert.equal(result.operationId, saved.action.operationId);
      assert.ok(result.title.length > 5); assert.ok(result.lines.some(line => line.includes("Поход")));
      assert.equal(result.title.includes(action), false);
    }
  });
}

test("native link-root describes adding an existing bag, not creating a catalog entity", () => {
  const state = payload(), before = clone(state);
  const prepared = preparePersonalPlacementMutation(state, { layoutId: "layout", action: "link-root", ids: ["bag"], includeContents: false });
  const saved = record(prepared.snapshot, { userPlacement: prepared.intent });
  const result = describe([saved])[0];
  assert.match(result.title, /существующую сумку в укладку/); assert.doesNotMatch(result.title, /созда|новую/i);
  assert.ok(result.lines.includes("Сумка: Рамная сумка")); assert.ok(result.lines.includes("Без содержимого"));
  assert.deepEqual(state, before); assert.deepEqual(Object.keys(prepared.snapshot.containers), Object.keys(before.containers));
});

test("native removal describes placement removal while the original bag remains", () => {
  const linked = preparePersonalPlacementMutation(payload(), { layoutId: "layout", action: "link-root", ids: ["bag"] }).snapshot;
  const removed = preparePersonalPlacementMutation(linked, { layoutId: "layout", action: "remove-container", ids: ["bag"] });
  assert.ok(removed.snapshot.containers.bag);
  const result = describe([record(removed.snapshot, { userPlacement: removed.intent })])[0];
  assert.equal(result.title, "Убрать сумку из укладки");
  assert.equal(result.lines.some(line => /удалить неиспользуемый/.test(line)), false);
});

test("packed values, destinations, replacement and group names describe the saved descriptor", () => {
  const state = payload(); state.containers["new-group"] = { id: "new-group", name: "Ночёвка" };
  assert.match(describe([record(state, { userPlacement: { ...placement("set-packed"), packed: true } })])[0].title, /собранными/);
  assert.match(describe([record(state, { userPlacement: placement("set-packed") })], { language: "en" })[0].title, /not packed/);
  assert.ok(describe([record(state, { userPlacement: placement("move-item") })])[0].lines.includes("Сумка назначения: Подседельная сумка"));
  assert.ok(describe([record(state, { userPlacement: placement("replace-item") })])[0].lines.includes("Замена: Тент"));
  assert.ok(describe([record(state, { userPlacement: placement("group-items") })])[0].lines.includes("Группа: Ночёвка"));
});

test("no descriptor and no saved base explicitly leaves details unavailable", () => {
  const saved = record(); saved.snapshot = payload(); saved.snapshot.containers.bag.name = "Not a base";
  const result = describe([saved])[0];
  assert.equal(result.detailUnavailable, true); assert.equal(result.title, "Сохранённое изменение укладки");
  assert.match(result.lines[0], /в этой записи отсутствует/);
  assert.doesNotMatch(JSON.stringify(result), /Not a base|причина|исходной версии/);
});

test("field differences use only the exact saved base, with several fields in one record", () => {
  const before = payload(), after = clone(before); after.items.item.weight = 250; after.items.item.name = "Новая палатка";
  const saved = record(after); saved.mergeBase = { stateRevision: 9, payload: before };
  const result = describe([saved])[0];
  assert.equal(result.detailUnavailable, false); assert.ok(result.lines.length >= 2);
  assert.match(result.lines.join(" "), /100/); assert.match(result.lines.join(" "), /250/); assert.match(result.lines.join(" "), /Новая палатка/);
  assert.doesNotMatch(JSON.stringify(result), /клик|click|нажатие/);
  saved.mergeBase.stateRevision = 8;
  assert.equal(describe([saved])[0].detailUnavailable, true);
});

test("only the exact direct causal predecessor provides a local comparison", () => {
  const parent = record(), next = record(); next.action.operationId = "next"; next.action.generation = 2;
  next.action.body.payload.items.item.weight = 250;
  next.action.body.causal = { baseOperationId: parent.action.operationId, dependsOn: [{ operationId: parent.action.operationId, listId: "list" }], reads: [] };
  assert.equal(describe([parent, next])[1].detailUnavailable, false);
  for (const change of [p => { p.action.actorId = "other"; }, p => { p.action.listId = "other"; }, p => { p.action.generation = 0; },
    p => { p.action.body.baseStateRevision = 8; }, p => { p.photoState = {}; }]) {
    const changed = clone(parent); change(changed); assert.equal(describe([changed, next])[1].detailUnavailable, true);
  }
  const unbound = clone(next); unbound.action.body.causal.dependsOn = [];
  assert.equal(describe([parent, unbound])[1].detailUnavailable, true);
  assert.equal(describe([parent, clone(parent), next])[2].detailUnavailable, true);
});

test("a confirmed parent is hidden but still supplies the exact base for a pending change", () => {
  const parent = record(), next = record(); next.action.operationId = "pending-operation"; next.action.generation = 2;
  next.action.body.payload.items.item.weight = 250;
  next.action.body.causal = { baseOperationId: parent.action.operationId,
    dependsOn: [{ operationId: parent.action.operationId, listId: "list" }], reads: [] };
  const records = [parent, next], confirmedOperationIds = [parent.action.operationId], before = clone({ records, confirmedOperationIds });
  const result = describe(records, { confirmedOperationIds });
  assert.equal(result.length, 1); assert.equal(result[0].operationId, "pending-operation");
  assert.equal(result[0].detailUnavailable, false);
  assert.match(result[0].lines.join(" "), /100/); assert.match(result[0].lines.join(" "), /250/);
  assert.deepEqual({ records, confirmedOperationIds }, before);
});

test("only exact confirmed IDs hide records; invalid values and generation guesses do not", () => {
  const first = record(), next = record(); next.action.operationId = "next"; next.action.generation = 2;
  const records = [first, next], ids = records.map(row => row.action.operationId);
  for (const confirmedOperationIds of [[], [null, {}, 1], ["unknown", " saved-operation ", "SAVED-OPERATION"], "saved-operation", null]) {
    assert.deepEqual(describe(records, { confirmedOperationIds }).map(row => row.operationId), ids);
  }
  assert.deepEqual(describe(records, { confirmedOperationIds: ["next"] }).map(row => row.operationId), ["saved-operation"]);
  assert.deepEqual(describe(records, { confirmedOperationIds: [...ids, ...ids] }), []);
});

test("missing names fall back only to a revision-matching saved base, otherwise to the ID", () => {
  const after = payload(); delete after.containers.bag;
  const saved = record(after, { userPlacement: placement("remove-container") }); saved.mergeBase = { stateRevision: 9, payload: payload() };
  assert.ok(describe([saved])[0].lines.includes("Сумка: Рамная сумка"));
  saved.mergeBase.stateRevision = 8;
  assert.ok(describe([saved])[0].lines.includes("Сумка: bag"));
});

test("invalid placement and unsupported operation kinds never get an invented descriptor", () => {
  const saved = record(payload(), { userPlacement: { ...placement("link-root"), linkedContainerIds: [] } });
  saved.mergeBase = { stateRevision: 9, payload: payload() };
  assert.equal(describe([saved])[0].detailUnavailable, true);
  saved.action.kind = "photos.mutate"; saved.action.body.userPlacement = placement("link-root");
  assert.equal(describe([saved])[0].detailUnavailable, true);
});

test("large groups are bounded with explicit omitted details; names remain plain text and inputs stay immutable", () => {
  const saved = record(payload(), { userPlacement: placement("set-packed") });
  saved.action.body.payload.items.item.name = '<img src=x onerror="alert(1)">';
  saved.action.body.userPlacement.ids = ["item", ...Array.from({ length: 12 }, (_, i) => `item-${i}`)];
  const before = clone(saved), result = describe([saved])[0];
  assert.equal(result.lines.length, 6); assert.match(result.lines.at(-1), /не показано/);
  assert.ok(result.lines.some(line => line.includes('<img src=x onerror="alert(1)">')));
  result.lines[0] = "changed";
  assert.deepEqual(saved, before);
});

test("only explicit reasons explain a blocker; a missing head base and arbitrary error text prove nothing", () => {
  assert.match(explain({ reason: "missing-base" }), /исходной версии/);
  assert.match(explain({ reason: "photo-inventory" }), /не означает, что вы меняли/);
  assert.match(explain({ reason: "ordinary-rebase-loss" }), /перенос удаления/);
  assert.match(explain({ hasConflicts: true }), /изменены по-разному/);
  assert.match(explain({ reason: "missing-base" }, { language: "en" }), /original version/);
  assert.match(explain({ reason: "photo-inventory" }, { language: "en" }), /does not establish/);
  assert.match(explain({ reason: "ordinary-rebase-loss" }, { language: "en" }), /separate check/);
  assert.match(explain({ hasConflicts: true }, { language: "en" }), /changed differently/);
  for (const value of [null, {}, { mergeBase: null }, { code: "unknown", message: "missing-base" }, { hasConflicts: "yes" }]) {
    assert.match(explain(value), /точная причина паузы не определена/);
    assert.match(explain(value, { language: "en" }), /does not establish why/);
  }
});
