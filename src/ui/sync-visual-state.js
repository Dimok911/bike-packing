import { REMOTE_REFRESH_INTERVAL_MS } from "../config/constants.js";

const SYNC_VISUAL_HELP = {
  ru: {
    synced: "Зелёная точка: синхронизировано.",
    dirty: "Оранжевая точка: есть локальные изменения, нужна синхронизация.",
    syncing: "Зелёная мигающая точка: идёт загрузка или сохранение.",
    offline: "Жёлтая точка: офлайн или локальный режим.",
    error: "Красная точка: ошибка синхронизации или сервер недоступен.",
    local: "Серая точка: локальное состояние без активной синхронизации."
  },
  en: {
    synced: "Green dot: synced.",
    dirty: "Orange dot: there are local changes waiting to sync.",
    syncing: "Blinking green dot: loading or saving is in progress.",
    offline: "Yellow dot: offline or local mode.",
    error: "Red dot: sync error or the server is unavailable.",
    local: "Gray dot: local state without active sync."
  }
};

const ERROR_MESSAGE_PARTS = [
  "не удалось",
  "нет соединения",
  "сервер недоступен",
  "could not",
  "no connection",
  "server unavailable"
];

const SYNCING_MESSAGE_PARTS = [
  "сохраня",
  "загружа",
  "проверя",
  "saving",
  "loading",
  "checking"
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

export function syncVisualHelp(stateName = "local", language = "ru") {
  const normalizedLanguage = language === "en" ? "en" : "ru";
  const stateHelp = SYNC_VISUAL_HELP[normalizedLanguage];
  const refreshIntervalSeconds = Math.round(REMOTE_REFRESH_INTERVAL_MS / 1000);
  const actionHelp = normalizedLanguage === "en"
    ? `When online, your changes sync right after editing. With no local changes waiting, the app checks for changes from other devices every ${refreshIntervalSeconds} seconds and when you return to the tab. Press to sync now.`
    : `При наличии интернета ваши изменения синхронизируются сразу после редактирования. Если локальных изменений в очереди нет, приложение проверяет изменения с других устройств каждые ${refreshIntervalSeconds} секунд и при возвращении во вкладку. Нажмите, чтобы синхронизировать сейчас.`;
  return `${stateHelp[stateName] || stateHelp.local} ${actionHelp}`;
}

export function applySyncVisualState({
  body = document.body,
  syncButton,
  stateName = "local",
  language = "ru"
} = {}) {
  body?.classList.toggle("sync-local", stateName === "local");
  body?.classList.toggle("sync-offline", stateName === "offline");
  body?.classList.toggle("sync-syncing", stateName === "syncing");
  body?.classList.toggle("sync-dirty", stateName === "dirty");
  body?.classList.toggle("sync-synced", stateName === "synced");
  body?.classList.toggle("sync-error", stateName === "error");
  if (!syncButton) return;
  syncButton.dataset.syncState = stateName;
  const help = syncVisualHelp(stateName, language);
  syncButton.title = help;
  syncButton.setAttribute("aria-label", help);
}
