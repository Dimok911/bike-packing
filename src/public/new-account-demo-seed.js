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

export function createNewAccountDemoSeedCoordinator({
  getState = () => null,
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
    markNewAccountDefaultDemoLayout(getState(), layoutId);
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
