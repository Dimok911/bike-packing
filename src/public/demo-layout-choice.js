export function demoLayoutChoiceForLanguage(language, {
  currentLanguage = "ru",
  defaultLanguage = "ru",
  demoSelectValue = "demo",
  normalizeLanguage = normalizeDemoLanguage
} = {}) {
  const normalized = normalizeLanguage(language || currentLanguage);
  return normalized === defaultLanguage ? demoSelectValue : `demo:${normalized}`;
}

export function demoLayoutChoiceForTemplate(entry, {
  currentLanguage = "ru",
  defaultLanguage = "ru",
  demoSelectValue = "demo",
  normalizeLanguage = normalizeDemoLanguage
} = {}) {
  const language = normalizeLanguage(entry?.language || currentLanguage);
  const listId = String(entry?.listId || entry?.id || "").trim();
  if (!listId) {
    return demoLayoutChoiceForLanguage(language, {
      currentLanguage,
      defaultLanguage,
      demoSelectValue,
      normalizeLanguage
    });
  }
  return `demo:${language}:${encodeURIComponent(listId)}`;
}

export function isDemoLayoutChoice(choice, {
  demoSelectValue = "demo",
  supportedLanguages = [],
  normalizeLanguage = normalizeDemoLanguage
} = {}) {
  const value = String(choice || "").trim();
  if (value === demoSelectValue) return true;
  if (!value.startsWith("demo:")) return false;
  const language = value.slice("demo:".length).split(":")[0] || "";
  return Boolean(language && supportedLanguages.includes(normalizeLanguage(language)));
}

export function demoLanguageFromLayoutChoice(choice, {
  defaultLanguage = "ru",
  normalizeLanguage = normalizeDemoLanguage
} = {}) {
  const value = String(choice || "").trim();
  if (!value.startsWith("demo:")) return defaultLanguage;
  const language = value.slice("demo:".length).split(":")[0] || "";
  if (!language || language === "default") return defaultLanguage;
  return normalizeLanguage(language);
}

export function demoTemplateIdFromLayoutChoice(choice) {
  const value = String(choice || "").trim();
  if (!value.startsWith("demo:")) return "";
  const parts = value.split(":");
  if (parts.length < 3) return "";
  try {
    return decodeURIComponent(parts.slice(2).join(":"));
  } catch {
    return parts.slice(2).join(":");
  }
}

export function languageOptionLabel(language, {
  normalizeLanguage = normalizeDemoLanguage
} = {}) {
  return normalizeLanguage(language).toUpperCase();
}

function normalizeDemoLanguage(language) {
  return String(language || "ru").trim().toLowerCase() || "ru";
}
