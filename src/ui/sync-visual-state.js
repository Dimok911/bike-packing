const SYNC_VISUAL_HELP = {
  synced: "Зелёная точка: синхронизировано.",
  dirty: "Оранжевая точка: есть локальные изменения, нужна синхронизация.",
  syncing: "Зелёная мигающая точка: идёт загрузка или сохранение.",
  offline: "Жёлтая точка: офлайн или локальный режим.",
  error: "Красная точка: ошибка синхронизации или сервер недоступен.",
  local: "Серая точка: локальное состояние без активной синхронизации."
};

const ERROR_MESSAGE_PARTS = [
  "не удалось",
  "нет соединения",
  "сервер недоступен"
];

const SYNCING_MESSAGE_PARTS = [
  "сохраня",
  "загружа",
  "проверя"
];

export function resolveSyncVisualState({
  loggedIn = false,
  unlocked = false,
  message = "",
  adminApiWarning = false,
  forcedOffline = false,
  rememberedOffline = false,
  readOnlyScope = false,
  dirty = false
} = {}) {
  const lowerMessage = message.toLowerCase();
  if (adminApiWarning) return "error";
  if (forcedOffline) return "offline";
  if (ERROR_MESSAGE_PARTS.some((part) => lowerMessage.includes(part))) return "error";
  if (!loggedIn && unlocked) return readOnlyScope ? "synced" : "offline";
  if (rememberedOffline) return dirty ? "dirty" : "offline";
  if (loggedIn && SYNCING_MESSAGE_PARTS.some((part) => lowerMessage.includes(part))) return "syncing";
  if (loggedIn && dirty) return "dirty";
  if (loggedIn) return "synced";
  return "local";
}

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
