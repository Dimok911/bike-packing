import { canonicalListOperationJson } from "./list-operation-queue.js";

const map = value => value !== null && typeof value === "object" && !Array.isArray(value);
const emptyOwners = value => map(value) && ["items", "containers"].every(key => map(value[key]) && !Object.keys(value[key]).length)
  && map(value.layouts);
const preservesLayouts = (next, previous) => Object.keys(previous.layouts).every(id => next.layouts[id]?.id === id);

// A heuristic exception, NOT network or overwrite authority. The caller has
// already read/validated the scoped outbox. Walk its causal parents, never dates
// or array order, to prove that the list really was empty at the confirmed base.
// Every intervening action must remain empty; deleting the last owner does not
// qualify and still needs its explicit deletion intent.
export function isKnownEmptyPersonalSave({ records, operationId, payload }) {
  if (!Array.isArray(records) || !emptyOwners(payload)) return false;
  const byId = new Map(records.map(record => [record?.action?.operationId, record]));
  if (byId.size !== records.length) return false;
  let record = byId.get(operationId);
  if (!record || canonicalListOperationJson(payload) !== canonicalListOperationJson(record.action.body?.payload)) return false;
  const visited = new Set();
  while (record) {
    const action = record.action, body = action.body;
    if (visited.has(action.operationId) || action.kind !== "list.update" || record.photoState
      || record.reconciliation || record.localReconciliation || body.force || body.forceOverwrite
      || !emptyOwners(body.payload)) return false;
    visited.add(action.operationId);
    const base = record.mergeBase;
    if (base) return Number.isSafeInteger(base.stateRevision) && base.stateRevision > 0
      && base.stateRevision === body.baseStateRevision && emptyOwners(base.payload) && preservesLayouts(body.payload, base.payload);
    const parentId = body.causal?.baseOperationId, previous = byId.get(parentId);
    if (!parentId || !previous || previous.action.actorId !== action.actorId || previous.action.listId !== action.listId
      || previous.action.scopeKey !== action.scopeKey || previous.action.environment !== action.environment
      || !body.causal.dependsOn?.some(dep => dep.operationId === parentId && dep.listId === action.listId)
      || !emptyOwners(previous.action.body?.payload) || !preservesLayouts(body.payload, previous.action.body.payload)) return false;
    record = previous;
  }
  return false;
}
