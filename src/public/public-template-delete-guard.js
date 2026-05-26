function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeLanguage(value = "") {
  return normalizeText(value).toLowerCase();
}

function demoTemplateId(entry) {
  return normalizeText(entry?.listId || entry?.id);
}

function sharedTemplateId(entry) {
  return normalizeText(entry?.id);
}

function isConfirmedTemplate(entry) {
  return Boolean(entry?.serverConfirmed || entry?.runtimeSharedTemplate || entry?.linkedSharedList);
}

function templateLanguage(entry, fallbackLanguage = "") {
  return normalizeLanguage(entry?.language || entry?.adminDemoLanguage || fallbackLanguage);
}

export function hasOtherDemoTemplateInLanguage(templates = [], {
  listId = "",
  language = ""
} = {}) {
  const targetId = normalizeText(listId);
  const targetLanguage = normalizeLanguage(language);
  if (!targetId || !targetLanguage) return true;
  const confirmed = templates.filter((entry) =>
    isConfirmedTemplate(entry) &&
    templateLanguage(entry, targetLanguage) === targetLanguage
  );
  if (!confirmed.some((entry) => demoTemplateId(entry) === targetId)) return true;
  return confirmed.some((entry) => demoTemplateId(entry) !== targetId);
}

export function hasOtherSharedTemplateInLanguage(templates = [], {
  sharedId = "",
  language = ""
} = {}) {
  const targetId = normalizeText(sharedId);
  const targetLanguage = normalizeLanguage(language);
  if (!targetId || !targetLanguage) return true;
  const confirmed = templates.filter((entry) =>
    isConfirmedTemplate(entry) &&
    templateLanguage(entry, targetLanguage) === targetLanguage
  );
  if (!confirmed.some((entry) => sharedTemplateId(entry) === targetId)) return true;
  return confirmed.some((entry) => sharedTemplateId(entry) !== targetId);
}

export function publicTemplateDeleteBlockReason({
  target = null,
  layout = null,
  deletePublished = false,
  demoTemplates = [],
  sharedTemplates = [],
  languageLabel = (language) => language
} = {}) {
  if (!deletePublished || !target) return "";
  if (target.type === "demo") {
    const language = normalizeLanguage(target.language || layout?.adminDemoLanguage || layout?.language);
    const listId = target.demoListId || layout?.adminDemoListId || "";
    if (hasOtherDemoTemplateInLanguage(demoTemplates, { listId, language })) return "";
    return `Нельзя удалить последний demo-шаблон для языка ${languageLabel(language)}.`;
  }
  if (target.type === "shared") {
    const language = normalizeLanguage(layout?.language || target.language);
    const sharedId = target.sharedId || layout?.adminSharedSourceId || "";
    if (hasOtherSharedTemplateInLanguage(sharedTemplates, { sharedId, language })) return "";
    return `Нельзя удалить последний shared-шаблон для языка ${languageLabel(language)}.`;
  }
  return "";
}
