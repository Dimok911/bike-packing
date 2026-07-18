export function dialogHasSavableChanges({ dialog = null, saveButton = null } = {}) {
  return Boolean(dialog?.open && saveButton && !saveButton.hidden && !saveButton.disabled);
}
