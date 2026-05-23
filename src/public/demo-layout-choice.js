export function demoLayoutChoiceForLanguage(language, {
  currentLanguage = "ru",
  defaultLanguage = "ru",
  demoSelectValue = "demo",
  normalizeLanguage = normalizeDemoLanguage
} = {}) {
  const normalized = normalizeLanguage(language || currentLanguage);
  return normalized === defaultLanguage ? demoSelectValue : `demo:${normalized}`;
}

export function isDemoLayoutChoice(choice, {
  demoSelectValue = "demo",
  supportedLanguages = [],
  normalizeLanguage = normalizeDemoLanguage
} = {}) {
  const value = String(choice || "").trim();
  if (value === demoSelectValue) return true;
  if (!value.startsWith("demo:")) return false;
  const language = value.slice("demo:".length);
  return Boolean(language && supportedLanguages.includes(normalizeLanguage(language)));
}

export function demoLanguageFromLayoutChoice(choice, {
  defaultLanguage = "ru",
  normalizeLanguage = normalizeDemoLanguage
} = {}) {
  const value = String(choice || "").trim();
  if (!value.startsWith("demo:")) return defaultLanguage;
  const language = value.slice("demo:".length);
  if (!language || language === "default") return defaultLanguage;
  return normalizeLanguage(language);
}

export function languageOptionLabel(language, {
  normalizeLanguage = normalizeDemoLanguage
} = {}) {
  return normalizeLanguage(language).toUpperCase();
}

function normalizeDemoLanguage(language) {
  return String(language || "ru").trim().toLowerCase() || "ru";
}
