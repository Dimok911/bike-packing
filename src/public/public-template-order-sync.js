import { publicTemplateMetadataPath } from "./public-template-metadata.js";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function orderValue(entry) {
  const value = Number(entry?.layoutOrder);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function catalogIdentity(entry, type) {
  if (type === "demo") return normalizeText(entry?.listId || entry?.demoListId || entry?.id);
  return normalizeText(entry?.sharedLayoutId || entry?.id);
}

function changedCatalogOrders(before = [], after = [], type = "shared") {
  const beforeOrders = new Map((Array.isArray(before) ? before : [])
    .map((entry) => [catalogIdentity(entry, type), orderValue(entry)]));
  return (Array.isArray(after) ? after : [])
    .map((entry) => {
      const sourceId = catalogIdentity(entry, type);
      const layoutOrder = orderValue(entry);
      if (!sourceId || layoutOrder === null || beforeOrders.get(sourceId) === layoutOrder) return null;
      return {
        type,
        sourceId,
        layoutOrder,
        name: normalizeText(entry?.name || entry?.title || sourceId),
        language: normalizeText(entry?.language) || "ru"
      };
    })
    .filter(Boolean);
}

export function publicTemplateOrderUpdates({
  beforeDemoTemplates = [],
  afterDemoTemplates = [],
  beforeSharedTemplates = [],
  afterSharedTemplates = []
} = {}) {
  return [
    ...changedCatalogOrders(beforeDemoTemplates, afterDemoTemplates, "demo"),
    ...changedCatalogOrders(beforeSharedTemplates, afterSharedTemplates, "shared")
  ];
}

export function publicTemplateOrderPatchRequest(update, {
  demoAdminPathForPublicListId
} = {}) {
  const target = update?.type === "demo"
    ? { type: "demo", demoListId: update.sourceId, language: update.language }
    : { type: "shared", sharedId: update?.sourceId };
  const path = publicTemplateMetadataPath(target, { demoAdminPathForPublicListId });
  if (!path || !Number.isInteger(update?.layoutOrder) || update.layoutOrder < 1) return null;
  return {
    path,
    body: {
      title: update.name,
      name: update.name,
      language: update.language,
      layoutOrder: update.layoutOrder
    }
  };
}

export async function persistPublicTemplateOrderUpdates(updates = [], {
  apiFetch,
  demoAdminPathForPublicListId
} = {}) {
  const requests = updates.map((update) => ({
    update,
    request: publicTemplateOrderPatchRequest(update, { demoAdminPathForPublicListId })
  }));
  if (requests.some(({ request }) => !request)) throw new Error("Invalid public template order request");
  return Promise.all(requests.map(async ({ update, request }) => {
    const data = await apiFetch(request.path, {
      method: "PATCH",
      body: JSON.stringify(request.body)
    });
    if (Number(data?.layoutOrder) !== update.layoutOrder) {
      throw new Error(`The API did not confirm layoutOrder for ${update.sourceId}`);
    }
    return data;
  }));
}
