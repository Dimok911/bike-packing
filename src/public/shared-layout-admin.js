import {
  removeRuntimeSharedLayout,
  pruneRuntimeSharedLayouts
} from "./shared-layouts.js";
import {
  adminSharedTemplateIdentityKeys,
  isTemplateCopySharedId
} from "../state/layout-manage.js";
import {
  removeManagedSharedTemplateTreesFromState,
  removeUnconfirmedManagedSharedTemplateTreesFromState
} from "../state/layout-delete.js";

export async function deletePublishedSharedTemplate({
  sharedId,
  apiFetch,
  timeoutMs,
  layoutsByLanguage,
  warn = () => {}
} = {}) {
  const id = String(sharedId || "").trim();
  if (!id) return false;
  if (typeof apiFetch === "function") {
    try {
      await apiFetch(`/bike-packing/admin/shared-layouts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        timeoutMs
      });
    } catch (error) {
      if (!isAlreadyDeletedSharedTemplateError(error)) throw error;
      warn("[bike-packing] Shared layout delete skipped because public record is already absent.", { id, error });
    }
  }
  // The API owns public index cleanup. Re-saving demo-state from the browser can
  // fail on legacy broken photo references and keep deleted templates stuck.
  removeRuntimeSharedLayout(layoutsByLanguage, id);
  return true;
}

function runtimeLayoutMatchesDeletedTemplate(layout, targetKeys, fallbackLanguage) {
  if (!layout?.runtimeSharedTemplate || !isTemplateCopySharedId(layout.id) || !targetKeys?.size) return false;
  const layoutKeys = adminSharedTemplateIdentityKeys({
    sharedId: layout.id,
    name: layout.name,
    language: layout.language || fallbackLanguage,
    runtimeSharedTemplate: true
  });
  return layoutKeys.some((key) => targetKeys.has(key));
}

export function purgeDeletedSharedTemplateFromFrontendState({
  targetState,
  layoutsByLanguage,
  sharedId = "",
  name = "",
  language = "ru"
} = {}) {
  const id = String(sharedId || "").trim();
  if (!id) return { removedRuntimeCount: 0, removedLayoutIds: [] };
  const fallbackLanguage = String(language || "ru").trim().toLowerCase() || "ru";
  const targetKeys = new Set(adminSharedTemplateIdentityKeys({
    sharedId: id,
    name,
    language: fallbackLanguage,
    runtimeSharedTemplate: isTemplateCopySharedId(id)
  }));
  const removedRuntimeExact = removeRuntimeSharedLayout(layoutsByLanguage, id) ? 1 : 0;
  const removedRuntimeByIdentity = isTemplateCopySharedId(id)
    ? pruneRuntimeSharedLayouts(layoutsByLanguage, (layout) =>
        runtimeLayoutMatchesDeletedTemplate(layout, targetKeys, fallbackLanguage)
      )
    : 0;
  const removedLayoutIds = removeManagedSharedTemplateTreesFromState(targetState, {
    sharedId: id,
    name,
    language: fallbackLanguage
  });
  return {
    removedRuntimeCount: removedRuntimeExact + removedRuntimeByIdentity,
    removedLayoutIds
  };
}

export function purgeUnconfirmedSharedTemplatesFromFrontendState({
  targetState,
  layoutsByLanguage,
  confirmedSharedLayouts = [],
  fallbackLanguage = "ru"
} = {}) {
  const confirmedIds = new Set(confirmedSharedLayouts.map((layout) => String(layout?.id || "").trim()).filter(Boolean));
  const removedRuntimeCount = pruneRuntimeSharedLayouts(layoutsByLanguage, (layout) =>
    Boolean(layout?.runtimeSharedTemplate && layout?.id && !confirmedIds.has(layout.id))
  );
  const removedLayoutIds = removeUnconfirmedManagedSharedTemplateTreesFromState(targetState, {
    confirmedSharedLayouts,
    fallbackLanguage
  });
  return {
    removedRuntimeCount,
    removedLayoutIds
  };
}

function isAlreadyDeletedSharedTemplateError(error) {
  if (error?.status !== 404) return false;
  const message = `${error?.message || ""} ${error?.data?.message || ""} ${error?.data?.error || ""}`;
  return /not\s+found|not\s+been\s+created|has\s+not\s+been\s+created|missing/i.test(message);
}
