const SYNC_VISUAL_HELP = {
  synced: "Зелёная точка: синхронизировано.",
  dirty: "Оранжевая точка: есть локальные изменения, нужна синхронизация.",
  syncing: "Зелёная мигающая точка: идёт загрузка или сохранение.",
  offline: "Жёлтая точка: офлайн или локальный режим.",
  error: "Красная точка: ошибка синхронизации или сервер недоступен.",
  local: "Серая точка: локальное состояние без активной синхронизации."
};

export function syncVisualHelp(stateName = "local") {
  return `${SYNC_VISUAL_HELP[stateName] || SYNC_VISUAL_HELP.local} Нажмите, чтобы проверить сервер и сохранить изменения.`;
}

export function applySyncVisualState({
  body = document.body,
  syncButton,
  stateName = "local"
} = {}) {
  body?.classList.toggle("sync-local", stateName === "local");
  body?.classList.toggle("sync-offline", stateName === "offline");
  body?.classList.toggle("sync-syncing", stateName === "syncing");
  body?.classList.toggle("sync-dirty", stateName === "dirty");
  body?.classList.toggle("sync-synced", stateName === "synced");
  body?.classList.toggle("sync-error", stateName === "error");
  if (!syncButton) return;
  syncButton.dataset.syncState = stateName;
  const help = syncVisualHelp(stateName);
  syncButton.title = help;
  syncButton.setAttribute("aria-label", help);
}
