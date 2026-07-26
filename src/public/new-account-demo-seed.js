import { isGeneratedEmptyLayoutPlaceholder } from "./demo-template-state.js";

export const NEW_ACCOUNT_DEFAULT_DEMO_FLAG = "newAccountDefaultDemo";

function isPrivateLayout(layout) {
  return Boolean(
    layout?.id &&
    !layout.adminDemo &&
    !layout.adminSharedSourceId &&
    !layout.publicCatalogLayoutId &&
    !layout.guestDemoCopy
  );
}

export function markNewAccountDefaultDemoLayout(state, layoutId) {
  const layout = state?.layouts?.[String(layoutId || "").trim()];
  if (!isPrivateLayout(layout)) return false;
  layout[NEW_ACCOUNT_DEFAULT_DEMO_FLAG] = true;
  return true;
}

export function isNewAccountDefaultDemoAccount(state) {
  const privateLayouts = Object.values(state?.layouts || {}).filter(isPrivateLayout);
  return Boolean(
    privateLayouts.length &&
    privateLayouts.every((layout) => Boolean(layout[NEW_ACCOUNT_DEFAULT_DEMO_FLAG]))
  );
}

export function shouldSeedNewAccountDemoLayout(state) {
  if (!state || typeof state !== "object") return false;
  if (Object.keys(state.containers || {}).length || Object.keys(state.items || {}).length) return false;
  const privateLayouts = Object.values(state.layouts || {}).filter(isPrivateLayout);
  if (!privateLayouts.length) return true;
  return privateLayouts.length === 1 && isGeneratedEmptyLayoutPlaceholder(privateLayouts[0]);
}

export function removeNewAccountEmptyLayoutPlaceholder(state, keepLayoutId = "") {
  if (!state?.layouts || typeof state.layouts !== "object") return [];
  const retainedLayoutId = String(keepLayoutId || "").trim();
  const removedLayoutIds = Object.entries(state.layouts)
    .filter(([layoutId, layout]) =>
      layoutId !== retainedLayoutId &&
      isGeneratedEmptyLayoutPlaceholder(layout)
    )
    .map(([layoutId]) => layoutId);
  removedLayoutIds.forEach((layoutId) => {
    delete state.layouts[layoutId];
  });
  if (removedLayoutIds.includes(state.activeLayoutId)) {
    state.activeLayoutId = retainedLayoutId;
  }
  return removedLayoutIds;
}

export function createNewAccountDemoSeedCoordinator({
  getState = () => null,
  getDisplayPreferences = () => null,
  applyDisplayPreferences = () => false,
  createDefaultLayout = async () => "",
  persistDefaultLayout = async () => true,
  onError = () => {}
} = {}) {
  let completedForSession = false;
  let offerInFlight = null;

  async function runOffer() {
    if (!shouldSeedNewAccountDemoLayout(getState())) {
      return { handled: false, status: "account-not-empty", layoutId: "" };
    }
    let layoutId = "";
    try {
      layoutId = String(await createDefaultLayout() || "").trim();
    } catch (error) {
      onError(error);
      return { handled: true, status: "seed-failed", layoutId: "" };
    }
    if (!layoutId) {
      return { handled: true, status: "seed-failed", layoutId: "" };
    }
    removeNewAccountEmptyLayoutPlaceholder(getState(), layoutId);
    markNewAccountDefaultDemoLayout(getState(), layoutId);
    try {
      const preferences = getDisplayPreferences();
      if (preferences && typeof preferences === "object") {
        applyDisplayPreferences(preferences);
      }
    } catch (error) {
      onError(error);
    }
    completedForSession = true;
    try {
      const saved = await persistDefaultLayout(layoutId);
      return {
        handled: true,
        status: saved === false ? "pending-save" : "seeded",
        layoutId
      };
    } catch (error) {
      onError(error);
      return { handled: true, status: "pending-save", layoutId };
    }
  }

  async function offer() {
    if (completedForSession) {
      return { handled: false, status: "already-handled", layoutId: "" };
    }
    if (offerInFlight) return offerInFlight;
    offerInFlight = runOffer().finally(() => {
      offerInFlight = null;
    });
    return offerInFlight;
  }

  return { offer };
}
