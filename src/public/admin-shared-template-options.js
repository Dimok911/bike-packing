import {
  adminSharedTemplateIdentityKeys,
  adminTemplateDraftChoice,
  dedupeAdminSharedTemplateCandidates,
  isTemplateCopySharedId
} from "../state/layout-manage.js";

export function compareSharedTemplateAdminOrder(a, b, {
  supportedLanguages = [],
  normalizeLanguage = (value) => String(value || "").trim().toLowerCase() || "ru",
  fallbackLanguage = "ru",
  locale = "ru"
} = {}) {
  const aOrder = Number(a?.layoutOrder);
  const bOrder = Number(b?.layoutOrder);
  const aHasOrder = Number.isFinite(aOrder);
  const bHasOrder = Number.isFinite(bOrder);
  if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
  if (aHasOrder && !bHasOrder) return -1;
  if (!aHasOrder && bHasOrder) return 1;
  const languageRank = (layout) => {
    const language = normalizeLanguage(layout?.language || fallbackLanguage);
    const index = supportedLanguages.map(normalizeLanguage).indexOf(language);
    return index >= 0 ? index : supportedLanguages.length;
  };
  const languageOrder = languageRank(a) - languageRank(b);
  if (languageOrder) return languageOrder;
  return String(a?.name || "").localeCompare(String(b?.name || ""), locale);
}

export function selectLocalAdminTemplateCopyLayouts({
  layouts = {},
  canOpen = false,
  isDeletedSharedLayoutId = () => false,
  fallbackLanguage = "ru",
  isLayoutMeaningful = () => false,
  templateCopySourceScore = () => 0,
  compareEntries = (a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "ru")
} = {}) {
  if (!canOpen) return [];
  const candidates = Object.values(layouts || {})
    .filter((layout) =>
      layout?.adminTemplateCopy &&
      layout.adminSharedSourceId &&
      !isDeletedSharedLayoutId(layout.adminSharedSourceId)
    )
    .map((layout, index) => ({
      layout,
      priority: isLayoutMeaningful(layout.id) ? 120 : 75,
      contentScore: templateCopySourceScore(layout),
      updatedAt: layout.updatedAt || "",
      identityKeys: adminSharedTemplateIdentityKeys({
        sharedId: layout.adminSharedSourceId,
        name: layout.name,
        language: layout.language || fallbackLanguage,
        adminTemplateCopy: true
      }),
      order: index
    }));
  return dedupeAdminSharedTemplateCandidates(candidates)
    .map((candidate) => candidate.layout)
    .sort(compareEntries);
}

export function buildAdminSharedTemplateOptions({
  canOpen = false,
  localLayouts = [],
  linkedSharedListLayout = null,
  sharedLayouts = [],
  serverConfirmedSharedLayouts = [],
  requireServerConfirmationForSharedTemplates = false,
  requireServerConfirmationForTemplateCopies = false,
  allowUnconfirmedLocalLayouts = false,
  isDeletedSharedLayoutId = () => false,
  fallbackLanguage = "ru",
  isLayoutMeaningful = () => false,
  templateCopySourceScore = () => 0,
  sharedLayoutStatePayload = () => null,
  sharedPayloadActiveLayout = () => null,
  compareLayouts = (a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "ru"),
  labels = {}
} = {}) {
  if (!canOpen) return [];
  const candidates = [];
  let order = 0;
  const languageLabel = labels.languageOptionLabel || ((language) => String(language || fallbackLanguage).toUpperCase());
  const optionLabel = labels.publicTemplateOptionLabel || (({ prefix, name, languageLabel: label }) =>
    `${prefix}: ${name} (${label})`);
  const templatePrefix = labels.templatePrefix || "Template";
  const defaultName = labels.defaultName || "Template";
  const confirmedSharedTemplateKeys = new Set(serverConfirmedSharedLayouts.flatMap((layout) =>
    adminSharedTemplateIdentityKeys({
      sharedId: layout.id,
      name: layout.name,
      language: layout.language || fallbackLanguage,
      adminTemplateCopy: Boolean(layout.adminTemplateCopy),
      runtimeSharedTemplate: true
    })
  ));
  const pushCandidate = (candidate) => {
    const sharedTemplateCandidate = Boolean(
      candidate?.layout?.adminSharedSourceId ||
      candidate?.layout?.runtimeSharedTemplate ||
      candidate?.layout?.id
    );
    const templateCopyCandidate = Boolean(
      candidate?.layout?.adminTemplateCopy ||
      candidate?.layout?.runtimeSharedTemplate ||
      isTemplateCopySharedId(candidate?.layout?.id) ||
      isTemplateCopySharedId(candidate?.layout?.adminSharedSourceId)
    );
    const mustBeServerConfirmed = (
      (requireServerConfirmationForSharedTemplates && sharedTemplateCandidate) ||
      (requireServerConfirmationForTemplateCopies && templateCopyCandidate)
    );
    if (
      mustBeServerConfirmed &&
      !(allowUnconfirmedLocalLayouts && candidate.localDraft) &&
      !(candidate.identityKeys || []).some((key) => confirmedSharedTemplateKeys.has(key))
    ) return;
    candidates.push(candidate);
  };

  localLayouts.forEach((layout) => {
    pushCandidate({
      layout,
      localDraft: true,
      priority: isLayoutMeaningful(layout.id) ? 120 : 75,
      contentScore: templateCopySourceScore(layout),
      updatedAt: layout.updatedAt || "",
      identityKeys: adminSharedTemplateIdentityKeys({
        sharedId: layout.adminSharedSourceId,
        name: layout.name,
        language: layout.language || fallbackLanguage,
        adminTemplateCopy: true
      }),
      order: order++,
      option: [
        adminTemplateDraftChoice(layout.id),
        optionLabel({
          prefix: templatePrefix,
          name: layout.name || defaultName,
          languageLabel: languageLabel(layout.language || fallbackLanguage)
        }),
        "shared"
      ]
    });
  });

  if (linkedSharedListLayout?.id && !isDeletedSharedLayoutId(linkedSharedListLayout.id)) {
    pushCandidate({
      layout: linkedSharedListLayout,
      priority: 60,
      contentScore: 0,
      updatedAt: linkedSharedListLayout.updatedAt || "",
      identityKeys: adminSharedTemplateIdentityKeys({
        sharedId: linkedSharedListLayout.id,
        name: linkedSharedListLayout.name,
        language: linkedSharedListLayout.language || fallbackLanguage,
        runtimeSharedTemplate: Boolean(linkedSharedListLayout.runtimeSharedTemplate)
      }),
      order: order++,
      option: [
        `shared:${linkedSharedListLayout.id}`,
        `${templatePrefix}: ${linkedSharedListLayout.name}`,
        "shared"
      ]
    });
  }

  sharedLayouts.forEach((layout) => {
    const sourceState = sharedLayoutStatePayload(layout);
    const sourceLayout = sharedPayloadActiveLayout(sourceState);
    pushCandidate({
      layout,
      priority: layout.runtimeSharedTemplate ? 95 : 50,
      contentScore: templateCopySourceScore(sourceLayout, sourceState),
      updatedAt: layout.updatedAt || "",
      identityKeys: adminSharedTemplateIdentityKeys({
        sharedId: layout.id,
        name: layout.name,
        language: layout.language || fallbackLanguage,
        runtimeSharedTemplate: Boolean(layout.runtimeSharedTemplate)
      }),
      order: order++,
      option: [
        `shared:${layout.id}`,
        `${templatePrefix}: ${layout.name} (${languageLabel(layout.language || fallbackLanguage)})`,
        "shared"
      ]
    });
  });

  return dedupeAdminSharedTemplateCandidates(candidates)
    .sort((a, b) => compareLayouts(a.layout, b.layout))
    .map((entry) => entry.option);
}
