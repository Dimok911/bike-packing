import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { experimentReleasePlugin } from "../../scripts/experiment-release-profile.mjs";

// Isolated test bundle only. Default build and source gates stay OFF.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [...(["admin-photo-whole-copy", "admin-photo-whole-copy-off"].includes(mode)
    ? [experimentReleasePlugin(fileURLToPath(new URL("../../", import.meta.url)))] : []),
    { name: "isolated-admin-template-ui", enforce: "pre", transform(code, id) {
    const wholeMode = ["admin-photo-whole-copy", "admin-photo-whole-copy-off"].includes(mode);
    const source = id.replaceAll("\\", "/").split("?")[0];
    if (wholeMode && source.endsWith("/src/app/app-tail-controllers.js")) {
      const anchor = 'showToast(localText(`Could not copy the template: ${error.message}`';
      if (!code.includes(anchor)) throw Error("Whole copy form diagnostic anchor changed");
      code = code.replace(anchor, 'globalThis.__adminUiLastError = { message: error.message, code: error.code, stack: error.stack, cause: String(error.cause?.stack || error.cause || "") }; ' + anchor);
    }
    if (["admin-photo-tree-copy", "admin-photo-tree-copy-off"].includes(mode) && source.endsWith("/src/public/admin-template-photo-tree-copy-flow.js")) {
      const anchor = "} catch { throw paused(); }";
      if (code.split(anchor).length !== 2) throw Error("Tree form diagnostic anchor changed");
      code = code.replace(anchor, '} catch (error) { globalThis.__treeFormFailure = { message: error.message, code: error.code, stack: error.stack, cause: String(error.cause?.stack || error.cause || ""), input: structuredClone(input) }; throw paused(); }');
    }
    if (["admin-photo-tree-copy", "admin-photo-tree-copy-off"].includes(mode) && source.endsWith("/src/sync/admin-template-photo-tree-copy-record.js")) {
      const anchor = "} catch { invalid(); }";
      if (code.split(anchor).length !== 4) throw Error("Tree record diagnostic anchors changed");
      code = code.replaceAll(anchor, '} catch (error) { globalThis.__treeRecordFailure ||= { message: error.message, code: error.code, stack: error.stack, cause: String(error.cause?.stack || error.cause || "") }; invalid(); }');
    }
    if (["admin-photo-tree-copy", "admin-photo-tree-copy-off"].includes(mode) && source.endsWith("/src/sync/admin-template-photo-copy-record.js")) {
      const anchor = "function assertEditor(";
      if (code.split(anchor).length !== 2) throw Error("Copy editor diagnostic anchor changed");
      code = code.replace(anchor, "function assertEditorDiagnosticOriginal(")
        + '\nfunction assertEditor(input) { try { return assertEditorDiagnosticOriginal(input); } catch (error) { globalThis.__treeEditorFailure = { message: error.message, code: error.code, stack: error.stack, cause: String(error.cause?.stack || error.cause || ""), input: structuredClone(input) }; throw error; } }\n';
    }
    if (["admin-photo-copy", "admin-photo-copy-off", "admin-photo-tree-copy", "admin-photo-tree-copy-off"].includes(mode) && source.endsWith("/src/app/app-tail-controllers.js")) {
      const anchor = 'onError: error => showToast(error.message, "error"),';
      if (!code.includes(anchor)) throw Error("Copy form diagnostic anchor changed");
      code = code.replace(anchor, 'onError: error => { globalThis.__adminUiLastError = { message: error.message, code: error.code, stack: error.stack, cause: String(error.cause?.stack || error.cause || "") }; showToast(error.message, "error"); },');
    }
    if (["admin-photo-edit", "admin-photo-replace", "admin-photo-replace-off", "admin-photo-create", "admin-photo-create-off"].includes(mode) && source.endsWith("/src/sync/admin-template-photo-edit-protocol.js")) {
      return code.replace("ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED = false", "ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED = true");
    }
    if ((["admin-photo-append", "admin-photo-replace", "admin-photo-replace-off", "admin-photo-create", "admin-photo-create-off", "admin-photo-copy", "admin-photo-copy-off", "admin-photo-tree-copy"].includes(mode) || mode === "personal-import" && process.env.BIKE_ADMIN_PHOTO_REGRESSION === "1")
      && source.endsWith("/src/sync/admin-template-photo-append-protocol.js")) {
      code = code.replace("ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED = false", "ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED = true");
      return mode === "admin-photo-replace" ? code.replace("ADMIN_TEMPLATE_PHOTO_REPLACE_ENABLED = false", "ADMIN_TEMPLATE_PHOTO_REPLACE_ENABLED = true") : code;
    }
    if (["admin-photo-append", "admin-photo-edit"].includes(mode) && source.endsWith("/app.js")) {
      const anchor = "  const before = snapshot.beforeState && adminTemplatePhotoEditorSnapshot(snapshot.beforeState, layoutId, snapshot.metadata);";
      if (!code.includes(anchor)) throw Error("Admin photo candidate diagnostic anchor changed");
      code = code.replace(anchor, anchor + `
  try {
    const mirrorText = localStorage.getItem(scopedLocalStorageKey(STORAGE_KEY));
    let mirror;
    try { mirror = mirrorText && adminTemplatePhotoEditorSnapshot(JSON.parse(mirrorText), layoutId, snapshot.metadata); }
    catch (error) { mirror = { diagnosticError: String(error.message) }; }
    (globalThis.__adminPhotoCandidateChecks ||= []).push({
      operationId: action.operationId, layoutId, current: JSON.parse(current), before, candidate, mirror,
      observed: clone(observed), expectedSource: clone(snapshot.state.layouts[layoutId].adminCausalSource),
      sourceMatches: canonicalTemplateJson(observed) === canonicalTemplateJson(snapshot.state.layouts[layoutId].adminCausalSource),
      bindingMatches: canonicalTemplateJson(observed?.binding) === canonicalTemplateJson(record.binding),
      currentMatchesBefore: Boolean(before && current === canonicalTemplateJson(before)),
      currentMatchesCandidate: current === canonicalTemplateJson(candidate), stack: new Error().stack
    });
  } catch (error) { globalThis.__adminPhotoCandidateDiagnosticError = String(error.message); }
`);
    }
    if (["admin-photo-create", "admin-photo-copy", "admin-photo-copy-off", "admin-photo-tree-copy"].includes(mode) && source.endsWith("/src/sync/admin-template-photo-create-protocol.js")) return code.replace("ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED = false", "ADMIN_TEMPLATE_PHOTO_CREATE_ENABLED = true");
    if (["admin-photo-copy", "admin-photo-tree-copy"].includes(mode) && source.endsWith("/src/sync/admin-template-photo-copy-protocol.js")) return code.replace("ADMIN_TEMPLATE_PHOTO_COPY_ENABLED = false", "ADMIN_TEMPLATE_PHOTO_COPY_ENABLED = true");
    if (mode === "admin-photo-tree-copy" && source.endsWith("/src/sync/admin-template-photo-tree-copy-protocol.js")) return code.replace("ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED = false", "ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED = true");
    if (wholeMode && source.endsWith("/app.js")) {
      const anchor = "function reportAdminTemplateSaveError(error) {";
      if (!code.includes(anchor)) throw Error("Whole copy admin diagnostic anchor changed");
      code = code.replace(anchor, anchor + " globalThis.__adminUiLastError = { message: error.message, code: error.code, stack: error.stack, cause: String(error.cause?.stack || error.cause || \"\") };");
    }
    if (mode === "personal-import" && source.endsWith("/app.js")) {
      code = code.replace('return outbox.capture({ snapshot, body, operationId });', 'globalThis.__adminUiCaptureCalls ||= []; globalThis.__adminUiCaptureCalls.push({ stack: new Error().stack, scope: currentViewScope(), activeLayoutId: state.activeLayoutId }); return outbox.capture({ snapshot, body, operationId });');
      code = code.replace('function reportAdminTemplateSaveError(error) {', 'function reportAdminTemplateSaveError(error) { globalThis.__adminUiLastError = String(error.adminCopyGuard || "") + String(error.message) + String(error.stack || error);')
        .replace('function reportPersonalPhotoFormError(error, { recovery } = {}) {', 'function reportPersonalPhotoFormError(error, { recovery } = {}) { globalThis.__adminUiLastError = String(error.adminCopyGuard || "") + String(error.message) + String(error.stack || error);');
    }
    if (mode === "personal-import" && source.includes("/src/sync/")) {
      code = code.replace(/(PERSONAL_ADMIN_TEMPLATE_IMPORT|PERSONAL_PENDING_ADMIN_TEMPLATE_IMPORT|PERSONAL_PUBLIC_IMPORT|PERSONAL_PUBLIC_ENTITY_COPY|PERSONAL_SAVE_OUTBOX|LIST_OPERATION_QUEUE|PERSONAL_PHOTO_ACTIONS|PERSONAL_PHOTO_BATCH_STORAGE|PERSONAL_PHOTO_OUTBOX|PERSONAL_PHOTO_BATCH_OUTBOX|PERSONAL_PHOTO_PUBLICATION_QUEUE|PERSONAL_PHOTO_STAGING|PERSONAL_PHOTO_BATCH_STAGING|PERSONAL_PHOTO_FORM|PERSONAL_PHOTO_FORM_UI)_ENABLED = false/g, "$1_ENABLED = true");
    }
    if (mode === "admin-photo-whole-copy-off" && source.endsWith("/src/sync/admin-template-photo-whole-copy-protocol.js"))
      return code.replace(/(ADMIN_TEMPLATE_PHOTO_WHOLE_COPY_ENABLED) = globalThis\.location\?\.origin === "https:\/\/experiment\.vniipo-help\.ru"/, "$1 = false");
    if (source.endsWith("/src/sync/admin-template-protocol.js")) return code.replace("ADMIN_TEMPLATE_OPERATIONS_ENABLED = false", "ADMIN_TEMPLATE_OPERATIONS_ENABLED = true");
    if (source.endsWith("/app.js")) return code + "\nwindow.__adminUiTest={setOrderCatalog:({demo,shared})=>{serverConfirmedDemoTemplates=demo;serverConfirmedSharedLayouts=shared;renderFilters();},openDemo:openAdminDemoLayout,openShared:openSharedLayoutForAdmin,snapshot:adminTemplateEditorSnapshot,openPrepared:openCausalAdminTemplate,refreshDrafts:refreshAdminTemplateDrafts,openItem:openItemDialog,openContainer:openRootContainerDialog,save:savePublishedLayoutRecord,privatePayload:()=>serializeState({forSync:true}),privateMeta:()=>syncMeta,openPrivate:id=>switchActiveLayout(id,{remember:false}),state:()=>state,user:()=>currentUser,scope:()=>currentViewScope()};\n"
      + (wholeMode || ["admin-photo-tree-copy", "admin-photo-tree-copy-off"].includes(mode)
        ? "Object.assign(window.__adminUiTest,{operationContext:adminTemplateOperationContext,mirrorContext:()=>{const key=scopedLocalStorageKey(STORAGE_KEY);return {key,scopeKey:localStorageScopeKey,raw:typeof readPersonalLocalValue==='function'?readPersonalLocalValue(key):localStorage.getItem(key),indexedDB:typeof ownsPersonalMirror==='function'&&ownsPersonalMirror(key)}},privateLoadContext:()=>({listId:currentPackingListId,initialRemoteLoadPending})});\n" : "");
    return code;
  } }],
  build: { outDir: mode === "admin-photo-whole-copy" ? "test-results/admin-template-photo-whole-copy-browser-on-build" : mode === "admin-photo-whole-copy-off" ? "test-results/admin-template-photo-whole-copy-browser-off-build" : mode === "personal-import" ? "test-results/admin-personal-import-ui-build"
    : mode === "admin-photo-tree-copy" ? "test-results/admin-template-photo-tree-copy-browser-on-build"
    : mode === "admin-photo-tree-copy-off" ? "test-results/admin-template-photo-tree-copy-browser-off-build"
    : mode === "admin-photo-copy" ? "test-results/admin-template-photo-copy-ui-build"
    : mode === "admin-photo-copy-off" ? "test-results/admin-template-photo-copy-off-ui-build"
    : mode === "admin-photo-create" ? "test-results/admin-template-photo-create-ui-build"
    : mode === "admin-photo-create-off" ? "test-results/admin-template-photo-create-off-ui-build"
    : mode === "admin-photo-replace" ? "test-results/admin-template-photo-replace-ui-build"
    : mode === "admin-photo-replace-off" ? "test-results/admin-template-photo-replace-off-ui-build"
    : mode === "admin-photo-edit" ? "test-results/admin-template-photo-edit-ui-build"
    : mode === "admin-photo-append" ? "test-results/admin-template-photo-append-ui-build" : "test-results/admin-template-ui-build", emptyOutDir: true },
}));
