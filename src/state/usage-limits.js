export const USER_USAGE_LIMITS = {
  photosPerRecord: 3,
  items: 500,
  containers: 50,
  categories: 50,
  locations: 10
};

export const ADMIN_USAGE_LIMITS = {
  photosPerRecord: 50,
  items: Infinity,
  containers: Infinity,
  categories: Infinity,
  locations: Infinity
};

export function usageLimitsForRole(isAdmin = false) {
  return isAdmin ? ADMIN_USAGE_LIMITS : USER_USAGE_LIMITS;
}

export function usageLimitForRole(name, isAdmin = false) {
  return usageLimitsForRole(isAdmin)[name] ?? Infinity;
}

export function canAddUsageEntries({ current = 0, add = 1, limit = Infinity } = {}) {
  if (!Number.isFinite(limit)) return true;
  return Number(current || 0) + Number(add || 0) <= limit;
}

export function usageLimitExceededMessage(name, limit, language = currentDocumentLanguage()) {
  const english = language === "en";
  const labels = english ? {
    photosPerRecord: "Photos: the standard-user limit is 3 per item or bag.",
    items: "Items: the standard-user limit is 500.",
    containers: "Bags and storage places: the standard-user limit is 50.",
    categories: "Categories: the standard-user limit is 50.",
    locations: "Storage places: the standard-user limit is 10."
  } : {
    photosPerRecord: "Фото: лимит для обычного пользователя - 3 на одну вещь или сумку.",
    items: "Вещи: лимит для обычного пользователя - 500 шт.",
    containers: "Сумки и места хранения: лимит для обычного пользователя - 50 шт.",
    categories: "Категории: лимит для обычного пользователя - 50 шт.",
    locations: "Места хранения: лимит для обычного пользователя - 10 шт."
  };
  return labels[name] || (english ? `Limit reached: ${limit}` : `Достигнут лимит: ${limit}`);
}
import { currentDocumentLanguage } from "../utils/language.js";
