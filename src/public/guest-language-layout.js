function normalizedLanguage(value) {
  return String(value || "").trim().toLowerCase();
}

export function guestDefaultLayoutForLanguage(layouts = {}, language = "", {
  guestDemoCopyFlag = "guestDemoCopy",
  accountDefaultDemoFlag = ""
} = {}) {
  const targetLanguage = normalizedLanguage(language);
  if (!targetLanguage) return null;
  return Object.values(layouts || {}).find((layout) =>
    layout?.id &&
    Boolean(layout?.[guestDemoCopyFlag] || (accountDefaultDemoFlag && layout?.[accountDefaultDemoFlag])) &&
    normalizedLanguage(layout.demoSourceLanguage) === targetLanguage
  ) || null;
}

export function guestLanguageLayoutSwitchPlan({
  guestSession = false,
  accountDefaultDemo = false,
  readOnlyStateScope = false,
  sharedListRoute = false,
  layouts = {},
  activeLayoutId = "",
  previousLanguage = "",
  nextLanguage = "",
  sourceTemplateId = "",
  sourceLanguage = "",
  templateCatalog = [],
  findTemplateForLanguage = () => null,
  defaultTemplateListId = () => ""
} = {}) {
  const language = normalizedLanguage(nextLanguage);
  const enabled = Boolean((guestSession || accountDefaultDemo) && !sharedListRoute && language);
  const offerOpen = !readOnlyStateScope;
  if (!enabled) return { enabled: false, language, templateId: "", offerOpen };
  const activeLayout = readOnlyStateScope ? null : layouts?.[activeLayoutId] || null;
  const templateSourceId = String(sourceTemplateId || activeLayout?.demoSourceListId || "").trim();
  const templateSourceLanguage = sourceLanguage ||
    activeLayout?.demoSourceLanguage ||
    previousLanguage;
  const target = templateSourceId || activeLayout
    ? findTemplateForLanguage(
      templateCatalog,
      templateSourceId,
      language,
      { sourceLanguage: templateSourceLanguage }
    )
    : null;
  return {
    enabled: true,
    language,
    templateId: String(target?.listId || target?.id || defaultTemplateListId(language) || "").trim(),
    offerOpen
  };
}

export async function createGuestDefaultLayoutForLanguageIfMissing({
  enabled = false,
  layouts = {},
  language = "",
  guestDemoCopyFlag = "guestDemoCopy",
  accountDefaultDemoFlag = "",
  createLayout = async () => "",
  confirmOpen = async () => false,
  openLayout = () => {},
  offerOpen = true
} = {}) {
  if (!enabled) return { status: "skipped", layoutId: "" };
  const targetLanguage = normalizedLanguage(language);
  const existing = guestDefaultLayoutForLanguage(layouts, targetLanguage, {
    guestDemoCopyFlag,
    accountDefaultDemoFlag
  });
  if (existing) return { status: "exists", layoutId: existing.id };

  const createdLayoutId = String(await createLayout(targetLanguage) || "").trim();
  const createdLayout = layouts?.[createdLayoutId] || null;
  if (!createdLayoutId || !createdLayout) return { status: "failed", layoutId: "" };

  const shouldOpen = offerOpen
    ? Boolean(await confirmOpen({
      language: targetLanguage,
      layout: createdLayout,
      layoutId: createdLayoutId
    }))
    : false;
  if (shouldOpen) await openLayout(createdLayoutId);
  return {
    status: shouldOpen ? "opened" : "created",
    layoutId: createdLayoutId
  };
}

export async function handleGuestLanguageLayoutSwitch(options = {}) {
  const plan = guestLanguageLayoutSwitchPlan(options);
  const result = await createGuestDefaultLayoutForLanguageIfMissing({
    enabled: plan.enabled,
    layouts: options.layouts,
    language: plan.language,
    guestDemoCopyFlag: options.guestDemoCopyFlag,
    accountDefaultDemoFlag: options.accountDefaultDemoFlag,
    createLayout: () => options.createLayout?.(plan),
    confirmOpen: options.confirmOpen,
    openLayout: options.openLayout,
    offerOpen: plan.offerOpen
  });
  return { ...result, offerOpen: plan.offerOpen };
}
