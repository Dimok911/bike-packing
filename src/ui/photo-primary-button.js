export function resolvePhotoPrimaryButtonPhotoCount({
  explicitCount = null,
  sourceCount = null,
  previewCount = null,
  domCount = null
} = {}) {
  const explicit = normalizePhotoCount(explicitCount);
  if (explicit !== null) return explicit;
  const source = normalizePhotoCount(sourceCount);
  if (source !== null) return source;
  const preview = normalizePhotoCount(previewCount);
  if (preview !== null) return preview;
  return normalizePhotoCount(domCount) || 0;
}

export function photoPrimaryButtonState({
  activeIndex = 0,
  photoCount = 0,
  primaryText = "Make primary",
  alreadyPrimaryText = "Photo is already primary",
  forceDisabled = false
} = {}) {
  const count = normalizePhotoCount(photoCount) || 0;
  if (count <= 1) {
    return {
      hidden: true,
      disabled: true,
      textContent: primaryText
    };
  }

  const safeActiveIndex = Math.max(0, Math.min(count - 1, Math.trunc(Number(activeIndex) || 0)));
  const isPrimary = safeActiveIndex === 0;
  return {
    hidden: false,
    disabled: Boolean(forceDisabled) || isPrimary,
    textContent: isPrimary ? alreadyPrimaryText : primaryText
  };
}

export function applyPhotoPrimaryButtonState(button, state) {
  if (!button || !state) return;
  button.hidden = Boolean(state.hidden);
  button.disabled = Boolean(state.disabled);
  button.textContent = state.textContent || "";
}

function normalizePhotoCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  return Math.max(0, Math.trunc(count));
}
