import { isEntitySyncRevisionConflict } from "./entity-sync.js";

export async function syncCreatedLayoutEntityTypes({
  assertConfirmed = () => {},
  baseState = null,
  expectedContainerIds = [],
  expectedItemIds = [],
  getCurrentListId = () => "",
  layoutId = "",
  listId = "",
  refreshRevisionFromConflict = async () => false,
  rememberResult = () => {},
  syncEntityType = async () => ({})
} = {}) {
  let activeListId = listId;
  const syncType = async (type) => {
    let result;
    try {
      result = await syncEntityType(type, { baseState, listId: activeListId });
    } catch (error) {
      if (!isCreatedLayoutRevisionConflict(error) || !(await refreshRevisionFromConflict(error, type))) throw error;
      result = await syncEntityType(type, { baseState, listId: activeListId });
    }
    rememberResult(result);
    if (!activeListId) activeListId = String(getCurrentListId() || "");
    return result;
  };

  const item = await syncType("item");
  const container = await syncType("container");
  const layout = await syncType("layout");
  const dictionary = await syncType("dictionary");

  assertConfirmed(item, "items", expectedItemIds);
  assertConfirmed(container, "containers", expectedContainerIds);
  assertConfirmed(layout, "layouts", [layoutId]);

  const orderedResults = [item, container, layout, dictionary];
  return {
    item,
    container,
    layout,
    dictionary,
    integrityMeta: [...orderedResults].reverse().find((result) => result?.integrityMeta)?.integrityMeta || null,
    serverUpdatedAt: [...orderedResults].reverse().find((result) => result?.serverUpdatedAt)?.serverUpdatedAt || ""
  };
}

export function isCreatedLayoutRevisionConflict(error) {
  return isEntitySyncRevisionConflict(error);
}

export function createdLayoutSyncErrorText(error, language = "ru") {
  const code = String(error?.data?.code || error?.code || "").trim();
  const messages = {
    stale_state_revision: {
      en: "The server version changed while the copy was being saved",
      ru: "Серверная версия изменилась во время сохранения копии"
    },
    state_revision_mismatch: {
      en: "The server and local list revisions do not match",
      ru: "Ревизии серверного и локального списка не совпадают"
    },
    missing_base_state_revision: {
      en: "The server list revision was not loaded before saving",
      ru: "Перед сохранением не была загружена ревизия серверного списка"
    }
  };
  const localized = messages[code];
  if (localized) return language === "en" ? localized.en : localized.ru;
  return String(error?.message || (language === "en" ? "Unknown sync error" : "Неизвестная ошибка синхронизации"));
}
