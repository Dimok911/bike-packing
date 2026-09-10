import { defineConfig } from "vite";

// Isolated test bundle only. Default build and source gates stay OFF.
export default defineConfig({
  base: "./",
  plugins: [{ name: "isolated-admin-template-ui", enforce: "pre", transform(code, id) {
    const source = id.replaceAll("\\", "/").split("?")[0];
    if (source.endsWith("/src/sync/admin-template-protocol.js")) return code.replace("ADMIN_TEMPLATE_OPERATIONS_ENABLED = false", "ADMIN_TEMPLATE_OPERATIONS_ENABLED = true");
    if (source.endsWith("/app.js")) return code + "\nwindow.__adminUiTest={setOrderCatalog:({demo,shared})=>{serverConfirmedDemoTemplates=demo;serverConfirmedSharedLayouts=shared;renderFilters();},openDemo:openAdminDemoLayout,openShared:openSharedLayoutForAdmin,snapshot:adminTemplateEditorSnapshot,openPrepared:openCausalAdminTemplate,refreshDrafts:refreshAdminTemplateDrafts,openItem:openItemDialog,openContainer:openRootContainerDialog,save:savePublishedLayoutRecord,state:()=>state,user:()=>currentUser,scope:()=>currentViewScope()};\n";
  } }],
  build: { outDir: "test-results/admin-template-ui-build", emptyOutDir: true },
});
