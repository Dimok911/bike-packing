import { timeValue } from "../utils/time.js";

export function itemCreatedTime(item) {
  const created = timeValue(item?.createdAt || item?.created_at);
  if (created) return created;
  const idTime = Number(String(item?.id || "").match(/^item-(\d+)/)?.[1] || 0);
  if (idTime) return idTime;
  return timeValue(item?.updatedAt || item?.updated_at);
}

export function containerCreatedTime(container) {
  const created = timeValue(container?.createdAt || container?.created_at);
  if (created) return created;
  const idTime = Number(String(container?.id || "").match(/^container-(\d+)/)?.[1] || 0);
  if (idTime) return idTime;
  return timeValue(container?.updatedAt || container?.updated_at);
}

export function containerPath(targetState, containerId) {
  const names = [];
  let current = targetState.containers?.[containerId];
  while (current) {
    names.unshift(current.name);
    current = current.parentId ? targetState.containers?.[current.parentId] : null;
  }
  return names.join(" / ");
}
