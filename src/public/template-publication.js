export function isManagedTemplateLayout(layout) {
  return Boolean(layout?.adminDemo || layout?.adminSharedSourceId || layout?.adminTemplateCopy);
}

export function isManagedTemplateUnpublished(layout) {
  return Boolean(isManagedTemplateLayout(layout) && layout?.templatePublished === false);
}

export function isManagedTemplateUnpublishPending(layout) {
  return Boolean(isManagedTemplateUnpublished(layout) && layout?.templateUnpublishPending === true);
}

export function markManagedTemplateUnpublishPending(layout) {
  if (!isManagedTemplateLayout(layout)) return false;
  layout.templatePublished = false;
  layout.templateUnpublishPending = true;
  return true;
}

export function markManagedTemplateUnpublished(layout) {
  if (!isManagedTemplateLayout(layout)) return false;
  layout.templatePublished = false;
  delete layout.templateUnpublishPending;
  return true;
}

export function markManagedTemplatePublished(layout) {
  if (!isManagedTemplateLayout(layout)) return false;
  layout.templatePublished = true;
  delete layout.templateUnpublishPending;
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
