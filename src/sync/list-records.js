export function createRemoteListRecordSelector({
  normalizeRemoteListRecord,
  normalizeRemoteState,
  countPrivateLayouts,
  isMeaningfulPackingState,
  remoteUpdatedAt,
  timeValue,
  isReadOnlyRecord = () => false
} = {}) {
  function remoteRecordStateInfo(record) {
    const normalized = record ? normalizeRemoteListRecord(record) : null;
    const remoteState = normalizeRemoteState(normalized?.payload);
    return {
      record: normalized,
      state: remoteState,
      count: countPrivateLayouts(remoteState),
      meaningful: Boolean(remoteState && isMeaningfulPackingState(remoteState)),
      updatedAt: timeValue(remoteUpdatedAt(normalized))
    };
  }

  function remoteRecordPrivateLayoutCount(record) {
    return remoteRecordStateInfo(record).count;
  }

  function pickRicherRemoteListRecord(currentRecord, nextRecord) {
    if (!currentRecord) return nextRecord || null;
    if (!nextRecord) return currentRecord || null;
    const current = remoteRecordStateInfo(currentRecord);
    const next = remoteRecordStateInfo(nextRecord);
    if (next.count !== current.count) return next.count > current.count ? next.record : current.record;
    if (next.meaningful !== current.meaningful) return next.meaningful ? next.record : current.record;
    if (next.updatedAt !== current.updatedAt) return next.updatedAt > current.updatedAt ? next.record : current.record;
    return current.record || next.record || null;
  }

  function bestCatalogListRecord(lists) {
    return lists
      .filter((list) => !isReadOnlyRecord(list))
      .map((list) => normalizeRemoteListRecord(list))
      .reduce((best, list) => pickRicherRemoteListRecord(best, list), null);
  }

  return {
    remoteRecordStateInfo,
    remoteRecordPrivateLayoutCount,
    pickRicherRemoteListRecord,
    bestCatalogListRecord
  };
}
