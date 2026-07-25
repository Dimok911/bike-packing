export function isManagedTemplateLayout(layout) {
  return Boolean(layout?.adminDemo || layout?.adminSharedSourceId || layout?.adminTemplateCopy);
}

export function isManagedTemplateUnpublished(layout) {
  return Boolean(isManagedTemplateLayout(layout) && layout?.templatePublished === false);
}

export function isManagedTemplateUnpublishPending(layout) {
  return Boolean(isManagedTemplateUnpublished(layout) && layout?.templateUnpublishPending === true);
}

export function isManagedTemplateDraftSyncPending(layout) {
  return Boolean(isManagedTemplateUnpublished(layout) && layout?.templateDraftSyncPending === true);
}

export function markManagedTemplateDraftSyncPending(layout) {
  if (!isManagedTemplateUnpublished(layout)) return false;
  layout.templateDraftSyncPending = true;
  return true;
}

export function clearManagedTemplateDraftSyncPending(layout) {
  if (!isManagedTemplateLayout(layout)) return false;
  delete layout.templateDraftSyncPending;
  return true;
}

export function markManagedTemplateUnpublishPending(layout) {
  if (!isManagedTemplateLayout(layout)) return false;
  layout.templatePublished = false;
  layout.templateUnpublishPending = true;
  delete layout.templateDraftSyncPending;
  return true;
}

export function markManagedTemplateUnpublished(layout) {
  if (!isManagedTemplateLayout(layout)) return false;
  layout.templatePublished = false;
  delete layout.templateUnpublishPending;
  delete layout.templateDraftSyncPending;
  return true;
}

export function markManagedTemplatePublished(layout) {
  if (!isManagedTemplateLayout(layout)) return false;
  layout.templatePublished = true;
  delete layout.templateUnpublishPending;
  delete layout.templateDraftSyncPending;
  delete layout.templateDraftServerHydrated;
  delete layout.templateDraftServerUpdatedAt;
  return true;
}

export function shouldAutoPublishManagedTemplate(layout) {
  return Boolean(isManagedTemplateLayout(layout) && !isManagedTemplateUnpublished(layout));
}

export function shouldConfirmManagedTemplateTransition(layout) {
  return !isManagedTemplateUnpublished(layout);
}

export function managedTemplatePublicationAction(layout) {
  if (!isManagedTemplateLayout(layout)) return "";
  if (isManagedTemplateUnpublishPending(layout)) return "retry-unpublish";
  return isManagedTemplateUnpublished(layout) ? "publish" : "unpublish";
}

export function managedTemplateOptionLabel(label, {
  draftMarker = "📝 Draft",
  unpublished = false
} = {}) {
  const text = String(label || "").trim();
  if (!unpublished || !text) return text;
  const marker = String(draftMarker || "📝").trim();
  return text.startsWith(`${marker} · `) ? text : `${marker} · ${text}`;
}
