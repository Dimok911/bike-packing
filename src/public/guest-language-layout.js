function normalizedLanguage(value) {
  return String(value || "").trim().toLowerCase();
}

export function guestDefaultLayoutForLanguage(layouts = {}, language = "", {
  guestDemoCopyFlag = "guestDemoCopy"
} = {}) {
  const targetLanguage = normalizedLanguage(language);
  if (!targetLanguage) return null;
  return Object.values(layouts || {}).find((layout) =>
    layout?.id &&
    Boolean(layout?.[guestDemoCopyFlag]) &&
    normalizedLanguage(layout.demoSourceLanguage) === targetLanguage
  ) || null;
}

export function guestLanguageLayoutSwitchPlan({
  guestSession = false,
  readOnlyStateScope = false,
  sharedListRoute = false,
  layouts = {},
  activeLayoutId = "",
  previousLanguage = "",
  nextLanguage = "",
  templateCatalog = [],
  findTemplateForLanguage = () => null,
  defaultTemplateListId = () => ""
} = {}) {
  const language = normalizedLanguage(nextLanguage);
  const enabled = Boolean(guestSession && !readOnlyStateScope && !sharedListRoute && language);
  if (!enabled) return { enabled: false, language, templateId: "" };
  const activeLayout = layouts?.[activeLayoutId] || null;
  const target = activeLayout
    ? findTemplateForLanguage(
      templateCatalog,
      activeLayout.demoSourceListId || "",
      language,
      { sourceLanguage: activeLayout.demoSourceLanguage || previousLanguage }
    )
    : null;
  return {
    enabled: true,
    language,
    templateId: String(target?.listId || target?.id || defaultTemplateListId(language) || "").trim()
  };
}

export async function createGuestDefaultLayoutForLanguageIfMissing({
  enabled = false,
  layouts = {},
  language = "",
  guestDemoCopyFlag = "guestDemoCopy",
  createLayout = async () => "",
  confirmOpen = async () => false,
  openLayout = () => {}
} = {}) {
  if (!enabled) return { status: "skipped", layoutId: "" };
  const targetLanguage = normalizedLanguage(language);
  const existing = guestDefaultLayoutForLanguage(layouts, targetLanguage, { guestDemoCopyFlag });
  if (existing) return { status: "exists", layoutId: existing.id };

  const createdLayoutId = String(await createLayout(targetLanguage) || "").trim();
  const createdLayout = layouts?.[createdLayoutId] || null;
  if (!createdLayoutId || !createdLayout) return { status: "failed", layoutId: "" };

  const shouldOpen = Boolean(await confirmOpen({
    language: targetLanguage,
    layout: createdLayout,
    layoutId: createdLayoutId
  }));
  if (shouldOpen) await openLayout(createdLayoutId);
  return {
    status: shouldOpen ? "opened" : "created",
    layoutId: createdLayoutId
  };
}

export async function handleGuestLanguageLayoutSwitch(options = {}) {
  const plan = guestLanguageLayoutSwitchPlan(options);
  return createGuestDefaultLayoutForLanguageIfMissing({
    enabled: plan.enabled,
    layouts: options.layouts,
    language: plan.language,
    guestDemoCopyFlag: options.guestDemoCopyFlag,
    createLayout: () => options.createLayout?.(plan),
    confirmOpen: options.confirmOpen,
    openLayout: options.openLayout
  });
}
