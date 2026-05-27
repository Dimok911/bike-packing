import { clonePlain } from "../utils/json.js";
import {
  comparableValueForMerge,
  isPlacementOnlyLocalChangeAgainstDeletedRemote
} from "./conflict-merge.js";

export function mergeStringList(baseList, localList, remoteList) {
  const result = [];
  [...remoteList, ...localList].forEach((value) => {
    if (typeof value === "string" && !result.includes(value)) result.push(value);
  });
  baseList.forEach((value) => {
    if (localList.includes(value) && remoteList.includes(value) && !result.includes(value)) result.push(value);
  });
  return result;
}

export function mergeScalarField(key, baseValue, localValue, remoteValue, conflicts, {
  settingLabel = (fieldKey) => fieldKey,
  valuesEqual = (left, right) => left === right
} = {}) {
  const localChanged = !valuesEqual(localValue, baseValue);
  const remoteChanged = !valuesEqual(remoteValue, baseValue);
  if (localChanged && remoteChanged && !valuesEqual(localValue, remoteValue)) {
    conflicts.push({
      type: "setting",
      id: key,
      label: settingLabel(key),
      localValue: clonePlain(localValue),
      remoteValue: clonePlain(remoteValue),
      baseValue: clonePlain(baseValue),
      localHas: true,
      remoteHas: true
    });
    return remoteValue;
  }
  if (localChanged) return localValue;
  return remoteValue;
}

export function mergeRecordMap(type, baseMap, localMap, remoteMap, conflicts, {
  cloneValue = clonePlain,
  conflictLabel = (_type, id) => id,
  valuesEqual = (left, right) => left === right
} = {}) {
  const merged = {};
  const ids = new Set([...Object.keys(baseMap), ...Object.keys(localMap), ...Object.keys(remoteMap)]);
  ids.forEach((id) => {
    const baseHas = Object.prototype.hasOwnProperty.call(baseMap, id);
    const localHas = Object.prototype.hasOwnProperty.call(localMap, id);
    const remoteHas = Object.prototype.hasOwnProperty.call(remoteMap, id);
    const baseValue = baseMap[id];
    const localValue = localMap[id];
    const remoteValue = remoteMap[id];
    const baseCompare = comparableValueForMerge(type, baseValue);
    const localCompare = comparableValueForMerge(type, localValue);
    const remoteCompare = comparableValueForMerge(type, remoteValue);
    const localChanged = baseHas ? !valuesEqual(localCompare, baseCompare) || !localHas : localHas;
    const remoteChanged = baseHas ? !valuesEqual(remoteCompare, baseCompare) || !remoteHas : remoteHas;

    if (
      remoteChanged &&
      !remoteHas &&
      isPlacementOnlyLocalChangeAgainstDeletedRemote(type, baseCompare, localCompare, {
        baseHas,
        localHas,
        remoteHas
      }, { valuesEqual })
    ) {
      return;
    }

    if (localChanged && remoteChanged && !valuesEqual(localCompare, remoteCompare)) {
      conflicts.push({
        type,
        id,
        label: conflictLabel(type, id, localValue, remoteValue, baseValue),
        localValue: localHas ? cloneValue(localValue) : null,
        remoteValue: remoteHas ? cloneValue(remoteValue) : null,
        baseValue: baseHas ? cloneValue(baseValue) : null,
        localHas,
        remoteHas
      });
      if (remoteHas) merged[id] = cloneValue(remoteValue);
      return;
    }
    if (localChanged) {
      if (localHas) merged[id] = cloneValue(localValue);
      return;
    }
    if (remoteHas) merged[id] = cloneValue(remoteValue);
  });
  return merged;
}

export function mergeStateFromBase(baseState, localState, remoteState, {
  cloneValue = clonePlain,
  conflictLabel = (_type, id) => id,
  normalizeItemDisplayMode = (value) => value,
  settingLabel = (fieldKey) => fieldKey,
  valuesEqual = (left, right) => left === right,
  afterMerge = () => {}
} = {}) {
  if (!baseState) return { merged: null, conflicts: [{ type: "state", label: "Нет базовой серверной копии" }] };
  const merged = cloneValue(remoteState);
  const conflicts = [];
  const mergeRecordMapOptions = { cloneValue, conflictLabel, valuesEqual };
  const mergeScalarFieldOptions = { settingLabel, valuesEqual };

  merged.locations = mergeStringList(baseState.locations || [], localState.locations || [], remoteState.locations || []);
  merged.categories = mergeStringList(baseState.categories || [], localState.categories || [], remoteState.categories || []);
  merged.items = mergeRecordMap("item", baseState.items || {}, localState.items || {}, remoteState.items || {}, conflicts, mergeRecordMapOptions);
  merged.containers = mergeRecordMap("container", baseState.containers || {}, localState.containers || {}, remoteState.containers || {}, conflicts, mergeRecordMapOptions);
  merged.layouts = mergeRecordMap("layout", baseState.layouts || {}, localState.layouts || {}, remoteState.layouts || {}, conflicts, mergeRecordMapOptions);
  merged.collapsedContainers = cloneValue(localState.collapsedContainers || remoteState.collapsedContainers || {});
  merged.packedItems = mergeRecordMap("packed", baseState.packedItems || {}, localState.packedItems || {}, remoteState.packedItems || {}, conflicts, mergeRecordMapOptions);

  ["activeLayoutId", "collapseDefaultsVersion"].forEach((key) => {
    merged[key] = mergeScalarField(key, baseState[key], localState[key], remoteState[key], conflicts, mergeScalarFieldOptions);
  });
  merged.itemDisplayMode = normalizeItemDisplayMode(localState.itemDisplayMode);
  merged.showItemMeta = merged.itemDisplayMode === "meta" || merged.itemDisplayMode === "meta-photos";
  merged.showFilterContext = Boolean(localState.showFilterContext);
  merged.collectionMode = Boolean(mergeScalarField(
    "collectionMode",
    Boolean(baseState.collectionMode),
    Boolean(localState.collectionMode),
    Boolean(remoteState.collectionMode),
    conflicts,
    mergeScalarFieldOptions
  ));
  merged.showOnlyUnpacked = Boolean(mergeScalarField(
    "showOnlyUnpacked",
    Boolean(baseState.showOnlyUnpacked && baseState.collectionMode),
    Boolean(localState.showOnlyUnpacked && localState.collectionMode),
    Boolean(remoteState.showOnlyUnpacked && remoteState.collectionMode),
    conflicts,
    mergeScalarFieldOptions
  ) && merged.collectionMode);

  afterMerge(merged);
  return { merged, conflicts };
}

export function applyConflictChoices(mergedState, conflicts, choices, {
  cloneValue = clonePlain,
  afterApply = () => {}
} = {}) {
  conflicts.forEach((conflict, index) => {
    const choice = choices[index] || "local";
    const useLocal = choice === "local";
    const value = useLocal ? conflict.localValue : conflict.remoteValue;
    const exists = useLocal ? conflict.localHas : conflict.remoteHas;
    if (conflict.type === "setting") {
      if (exists) mergedState[conflict.id] = cloneValue(value);
      return;
    }
    const target = conflictTargetMap(mergedState, conflict.type);
    if (!target) return;
    if (exists) target[conflict.id] = cloneValue(value);
    else delete target[conflict.id];
  });
  afterApply(mergedState);
}

export function conflictTargetMap(targetState, type) {
  if (type === "item") return targetState.items;
  if (type === "container") return targetState.containers;
  if (type === "layout") return targetState.layouts;
  if (type === "collapsed") return targetState.collapsedContainers;
  if (type === "packed") return targetState.packedItems;
  return null;
}
