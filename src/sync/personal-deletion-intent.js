import { deleteItemFromState } from "../state/item-ops.js";
import { deleteRootContainerFromState } from "../state/container-ops.js";
import { removeItemFromLayoutArrangement } from "../state/layout-ops.js";

export function personalDeletionIntent(value) {
  if (!["item", "container"].includes(value?.type) || typeof value.id !== "string" || !value.id
    || ["__proto__", "prototype", "constructor"].includes(value.id)) throw Error("Неизвестное действие удаления.");
  return { type: value.type, id: value.id };
}

// Reduce only the comparison baseline, never live state. This is not a general
// force save: unrelated losses must still pass the ordinary regression guard.
export function personalDeletionReference(base, records) {
  if (!base) return null;
  const reference = JSON.parse(JSON.stringify(base));
  let declared = false;
  for (const record of records) {
    const value = record.action?.body?.userDeletion;
    if (!value) continue;
    const intent = personalDeletionIntent(value);
    const entities = record.action.body.payload?.[intent.type === "item" ? "items" : "containers"];
    if (!entities || Object.prototype.hasOwnProperty.call(entities, intent.id)) throw Error("Снимок не соответствует заявленному удалению.");
    declared = true;
    if (intent.type === "item") deleteItemFromState(reference, intent.id, { removeItemFromLayoutArrangement });
    else deleteRootContainerFromState(reference, intent.id);
  }
  return declared ? reference : null;
}

export function preservesUndeletedEntities(current, reference) {
  const includes = (actual, expected) => Object.keys(expected || {}).every(id => Object.prototype.hasOwnProperty.call(actual || {}, id));
  if (!["items", "containers", "layouts"].every(type => includes(current?.[type], reference?.[type]))) return false;
  return Object.entries(reference.layouts || {}).every(([id, layout]) =>
    ["items", "containers"].every(type => includes(current.layouts[id]?.arrangement?.[type], layout.arrangement?.[type])));
}
