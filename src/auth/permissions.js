export const FRONTEND_PERMISSION_ACTIONS = Object.freeze({
  ADMIN_SESSION: "admin.session",
  TEMPLATES_CATALOG_VIEW: "templates.catalog.view",
  TEMPLATES_WRITE: "templates.write"
});

export const FRONTEND_CAPABILITIES = Object.freeze({
  TEMPLATES_WRITE: "templates:write"
});

const KNOWN_ROLES = new Set(["guest", "user", "admin"]);

export function normalizeAuthAuthorization(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const version = Number.parseInt(String(source?.version ?? ""), 10);
  const role = String(source?.role || "").trim().toLowerCase();
  const capabilities = Array.from(new Set(
    (Array.isArray(source?.capabilities) ? source.capabilities : [])
      .map((capability) => String(capability || "").trim())
      .filter(Boolean)
  ));
  const serverProvided = Boolean(source && Number.isFinite(version) && version > 0 && KNOWN_ROLES.has(role));
  return {
    version: serverProvided ? version : 0,
    role: serverProvided ? role : "guest",
    capabilities: serverProvided ? capabilities : [],
    serverProvided
  };
}

export function hasAuthCapability(authorization, capability) {
  const normalized = normalizeAuthAuthorization(authorization);
  const target = String(capability || "").trim();
  return Boolean(normalized.serverProvided && target && normalized.capabilities.includes(target));
}

export function can(action, {
  authorization = null,
  serverSessionConfirmed = false,
  templatesBlocked = false
} = {}) {
  const canWriteTemplates = Boolean(
    serverSessionConfirmed &&
    hasAuthCapability(authorization, FRONTEND_CAPABILITIES.TEMPLATES_WRITE)
  );
  if (action === FRONTEND_PERMISSION_ACTIONS.TEMPLATES_CATALOG_VIEW) {
    return hasAuthCapability(authorization, FRONTEND_CAPABILITIES.TEMPLATES_WRITE);
  }
  if (action === FRONTEND_PERMISSION_ACTIONS.ADMIN_SESSION) return canWriteTemplates;
  if (action === FRONTEND_PERMISSION_ACTIONS.TEMPLATES_WRITE) {
    return canWriteTemplates && !templatesBlocked;
  }
  return false;
}
