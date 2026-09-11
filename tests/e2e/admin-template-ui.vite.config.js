import { defineConfig } from "vite";

// Isolated test bundle only. Default build and source gates stay OFF.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [{ name: "isolated-admin-template-ui", enforce: "pre", transform(code, id) {
    const source = id.replaceAll("\\", "/").split("?")[0];
    if (mode === "personal-import" && source.endsWith("/app.js")) {
      code = code.replace('return outbox.capture({ snapshot, body, operationId });', 'globalThis.__adminUiCaptureCalls ||= []; globalThis.__adminUiCaptureCalls.push({ stack: new Error().stack, scope: currentViewScope(), activeLayoutId: state.activeLayoutId }); return outbox.capture({ snapshot, body, operationId });');
      code = code.replace('function reportAdminTemplateSaveError(error) {', 'function reportAdminTemplateSaveError(error) { globalThis.__adminUiLastError = String(error.adminCopyGuard || "") + String(error.message) + String(error.stack || error);')
        .replace('function reportPersonalPhotoFormError(error, { recovery } = {}) {', 'function reportPersonalPhotoFormError(error, { recovery } = {}) { globalThis.__adminUiLastError = String(error.adminCopyGuard || "") + String(error.message) + String(error.stack || error);');
    }
    if (mode === "personal-import" && source.includes("/src/sync/")) {
      code = code.replace(/(PERSONAL_ADMIN_TEMPLATE_IMPORT|PERSONAL_PUBLIC_IMPORT|PERSONAL_PUBLIC_ENTITY_COPY|PERSONAL_SAVE_OUTBOX|LIST_OPERATION_QUEUE|PERSONAL_PHOTO_ACTIONS|PERSONAL_PHOTO_BATCH_STORAGE|PERSONAL_PHOTO_OUTBOX|PERSONAL_PHOTO_BATCH_OUTBOX|PERSONAL_PHOTO_PUBLICATION_QUEUE|PERSONAL_PHOTO_STAGING|PERSONAL_PHOTO_BATCH_STAGING|PERSONAL_PHOTO_FORM|PERSONAL_PHOTO_FORM_UI)_ENABLED = false/g, "$1_ENABLED = true");
    }
    if (source.endsWith("/src/sync/admin-template-protocol.js")) return code.replace("ADMIN_TEMPLATE_OPERATIONS_ENABLED = false", "ADMIN_TEMPLATE_OPERATIONS_ENABLED = true");
    if (source.endsWith("/app.js")) return code + "\nwindow.__adminUiTest={setOrderCatalog:({demo,shared})=>{serverConfirmedDemoTemplates=demo;serverConfirmedSharedLayouts=shared;renderFilters();},openDemo:openAdminDemoLayout,openShared:openSharedLayoutForAdmin,snapshot:adminTemplateEditorSnapshot,openPrepared:openCausalAdminTemplate,refreshDrafts:refreshAdminTemplateDrafts,openItem:openItemDialog,openContainer:openRootContainerDialog,save:savePublishedLayoutRecord,privatePayload:()=>serializeState({forSync:true}),privateMeta:()=>syncMeta,openPrivate:id=>switchActiveLayout(id,{remember:false}),state:()=>state,user:()=>currentUser,scope:()=>currentViewScope()};\n";
    return code;
  } }],
  build: { outDir: mode === "personal-import" ? "test-results/admin-personal-import-ui-build" : "test-results/admin-template-ui-build", emptyOutDir: true },
}));
