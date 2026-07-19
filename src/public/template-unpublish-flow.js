import {
  isManagedTemplateLayout,
  isManagedTemplateUnpublishPending,
  markManagedTemplateUnpublishPending,
  markManagedTemplateUnpublished
} from "./template-publication.js";

export async function unpublishManagedTemplateFlow({
  layout,
  target,
  state,
  cancelPublishedLayoutSave = () => {},
  unpublishPublishedTemplate = async () => false,
  persistStateSnapshot = () => {}
} = {}) {
  if (!layout || !target || !isManagedTemplateLayout(layout)) return false;
  if (layout.templatePublished === false && !isManagedTemplateUnpublishPending(layout)) return false;
  cancelPublishedLayoutSave(layout.id);

  const previousPublished = layout.templatePublished;
  const previousPending = layout.templateUnpublishPending;
  markManagedTemplateUnpublishPending(layout);
  const persistedLocally = persistStateSnapshot(state);
  if (persistedLocally === false) {
    if (previousPublished === undefined) delete layout.templatePublished;
    else layout.templatePublished = previousPublished;
    if (previousPending === undefined) delete layout.templateUnpublishPending;
    else layout.templateUnpublishPending = previousPending;
    return false;
  }

  const unpublished = await unpublishPublishedTemplate(target, layout);
  if (!unpublished) return false;
  markManagedTemplateUnpublished(layout);
  persistStateSnapshot(state);
  return true;
}
