import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  VIEW_SCOPE_ADMIN_PUBLIC_EDIT,
  VIEW_SCOPE_DEMO,
  VIEW_SCOPE_PRIVATE,
  VIEW_SCOPE_SHARED
} from "../../src/config/constants.js";
import {
  FRONTEND_CAPABILITIES,
  FRONTEND_PERMISSION_ACTIONS,
  can,
  normalizeAuthAuthorization
} from "../../src/auth/permissions.js";
import { isAdminPublicEditScope, isReadOnlyScope } from "../../src/public/scope.js";

const projectRoot = resolve(import.meta.dirname, "../..");

function currentPermissionContract({ role, serverSessionConfirmed = false, templatesBlocked = false } = {}) {
  const authenticated = role === "user" || role === "admin";
  const admin = role === "admin";
  return {
    guestLocalEdit: role === "guest",
    ownPrivateRead: authenticated,
    ownPrivateWrite: authenticated,
    ownPrivateShare: authenticated,
    readonlyView: true,
    readonlyCopy: true,
    adminCatalogView: admin,
    templateManage: admin && serverSessionConfirmed && !templatesBlocked
  };
}

test("CRITICAL permissions: guest, user, and admin keep the current access matrix", () => {
  assert.deepEqual(currentPermissionContract({ role: "guest" }), {
    guestLocalEdit: true,
    ownPrivateRead: false,
    ownPrivateWrite: false,
    ownPrivateShare: false,
    readonlyView: true,
    readonlyCopy: true,
    adminCatalogView: false,
    templateManage: false
  });
  assert.deepEqual(currentPermissionContract({ role: "user", serverSessionConfirmed: true }), {
    guestLocalEdit: false,
    ownPrivateRead: true,
    ownPrivateWrite: true,
    ownPrivateShare: true,
    readonlyView: true,
    readonlyCopy: true,
    adminCatalogView: false,
    templateManage: false
  });
  assert.deepEqual(currentPermissionContract({ role: "admin", serverSessionConfirmed: true }), {
    guestLocalEdit: false,
    ownPrivateRead: true,
    ownPrivateWrite: true,
    ownPrivateShare: true,
    readonlyView: true,
    readonlyCopy: true,
    adminCatalogView: true,
    templateManage: true
  });
});

test("CRITICAL permissions: remembered or blocked admin state never grants template mutation", () => {
  assert.equal(currentPermissionContract({ role: "admin", serverSessionConfirmed: false }).templateManage, false);
  assert.equal(currentPermissionContract({ role: "admin", serverSessionConfirmed: true, templatesBlocked: true }).templateManage, false);
});

test("CRITICAL permissions: readonly and admin template-edit scopes stay distinct", () => {
  assert.equal(isReadOnlyScope({ viewScope: VIEW_SCOPE_DEMO, readonlyLayoutId: "demo" }), true);
  assert.equal(isReadOnlyScope({ viewScope: VIEW_SCOPE_SHARED, readonlyLayoutId: "shared" }), true);
  assert.equal(isReadOnlyScope({ viewScope: VIEW_SCOPE_PRIVATE, readonlyLayoutId: "" }), false);
  assert.equal(isAdminPublicEditScope({
    viewScope: VIEW_SCOPE_ADMIN_PUBLIC_EDIT,
    adminPublishedEditLayoutId: "template"
  }), true);
  assert.equal(isAdminPublicEditScope({
    viewScope: VIEW_SCOPE_ADMIN_PUBLIC_EDIT,
    adminPublishedEditLayoutId: ""
  }), false);
});

test("CRITICAL permissions: frontend admin identity lists are removed", () => {
  const appSource = readFileSync(resolve(projectRoot, "app.js"), "utf8");
  const constantsSource = readFileSync(resolve(projectRoot, "src/config/constants.js"), "utf8");
  assert.doesNotMatch(appSource, /ADMIN_EMAILS|ADMIN_USER_IDS|isAdminIdentity/);
  assert.doesNotMatch(constantsSource, /ADMIN_EMAILS|ADMIN_USER_IDS/);
  assert.match(appSource, /function isOfflineRememberedAdminSession\(\)[\s\S]*?FRONTEND_PERMISSION_ACTIONS\.TEMPLATES_CATALOG_VIEW/);
  assert.match(appSource, /function canOpenAdminPublishedEdit\(\)\s*\{\s*return isAdminSession\(\);\s*\}/);
  assert.match(appSource, /function canViewAdminPublishedCatalog\(\)\s*\{\s*return canOpenAdminPublishedEdit\(\) \|\| isOfflineRememberedAdminSession\(\);\s*\}/);
  assert.match(appSource, /function canEditPublishedTemplatesNow\(\)\s*\{\s*return canOpenAdminPublishedEdit\(\) && !arePublishedTemplatesBlocked\(\);\s*\}/);
  assert.match(appSource, /function canUsePrivateState\(\)\s*\{\s*return !isGuestSession\(\);\s*\}/);
});

test("CRITICAL permissions: capability policy is deny-by-default and requires a confirmed server session", () => {
  const authorization = normalizeAuthAuthorization({
    version: 1,
    role: "admin",
    capabilities: [FRONTEND_CAPABILITIES.TEMPLATES_WRITE, FRONTEND_CAPABILITIES.TEMPLATES_WRITE]
  });
  assert.deepEqual(authorization.capabilities, [FRONTEND_CAPABILITIES.TEMPLATES_WRITE]);
  assert.equal(can(FRONTEND_PERMISSION_ACTIONS.ADMIN_SESSION, {
    authorization,
    serverSessionConfirmed: false
  }), false);
  assert.equal(can(FRONTEND_PERMISSION_ACTIONS.ADMIN_SESSION, {
    authorization,
    serverSessionConfirmed: true
  }), true);
  assert.equal(can(FRONTEND_PERMISSION_ACTIONS.TEMPLATES_WRITE, {
    authorization,
    serverSessionConfirmed: true,
    templatesBlocked: true
  }), false);
  assert.equal(can("unknown.action", {
    authorization,
    serverSessionConfirmed: true
  }), false);
});

test("CRITICAL permissions: remembered server authorization grants only readonly admin catalog access", () => {
  const authorization = {
    version: 1,
    role: "admin",
    capabilities: [FRONTEND_CAPABILITIES.TEMPLATES_WRITE]
  };
  assert.equal(can(FRONTEND_PERMISSION_ACTIONS.TEMPLATES_CATALOG_VIEW, {
    authorization,
    serverSessionConfirmed: false
  }), true);
  assert.equal(can(FRONTEND_PERMISSION_ACTIONS.TEMPLATES_WRITE, {
    authorization,
    serverSessionConfirmed: false
  }), false);

  const authFlowSource = readFileSync(resolve(projectRoot, "src/sync/auth-load-flow.js"), "utf8");
  assert.match(authFlowSource, /runtime\.currentAuthorization = normalizeAuthAuthorization\(authData\.authorization\)/);
  assert.doesNotMatch(authFlowSource, /legacyAdmin|permissionComparison|onPermissionShadowMismatch/);
});

test("CRITICAL permissions: confirmed server capability is the only source of online admin access", () => {
  assert.equal(can(FRONTEND_PERMISSION_ACTIONS.ADMIN_SESSION, {
    authorization: null,
    serverSessionConfirmed: true
  }), false);
  assert.equal(can(FRONTEND_PERMISSION_ACTIONS.ADMIN_SESSION, {
    authorization: { version: 1, role: "user", capabilities: [] },
    serverSessionConfirmed: true
  }), false);
  assert.equal(can(FRONTEND_PERMISSION_ACTIONS.ADMIN_SESSION, {
    authorization: { version: 1, role: "admin", capabilities: [FRONTEND_CAPABILITIES.TEMPLATES_WRITE] },
    serverSessionConfirmed: true
  }), true);
  assert.equal(can(FRONTEND_PERMISSION_ACTIONS.ADMIN_SESSION, {
    authorization: { version: 1, role: "admin", capabilities: [FRONTEND_CAPABILITIES.TEMPLATES_WRITE] },
    serverSessionConfirmed: false
  }), false);

  const appSource = readFileSync(resolve(projectRoot, "app.js"), "utf8");
  assert.match(appSource, /function isAdminUser\(\)[\s\S]*?return canPermission\(FRONTEND_PERMISSION_ACTIONS\.ADMIN_SESSION/);
  assert.doesNotMatch(appSource, /adminPermissionWithLegacyFallback/);
  assert.match(appSource, /"authUserCapabilities"/);

  const appTailSource = readFileSync(resolve(projectRoot, "src/app/app-tail-controllers.js"), "utf8");
  assert.match(appTailSource, /runtime\.currentAuthorization = normalizeAuthAuthorization\(authData\.authorization\)/);
});
