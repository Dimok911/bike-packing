const normalizeText = (value) => String(value || "").trim();

export function normalizeAdminTemplateHistoryRecords(records = []) {
  const byKey = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const kind = normalizeText(record?.publicTemplateKind || record?.role);
    const isShared = kind === "shared-layout";
    const listId = normalizeText(record?.listId || record?.id);
    const sharedId = normalizeText(record?.sharedLayoutId || (listId.startsWith("public-shared-layout-")
      ? listId.slice("public-shared-layout-".length)
      : ""));
    const id = isShared ? sharedId : listId;
    const language = normalizeText(record?.language).toLowerCase();
    if (!id || !language || (kind !== "demo" && !isShared)) return;
    const name = normalizeText(record?.name || record?.title || id) || id;
    const entry = {
      id,
      listId: isShared ? listId : id,
      sharedId: isShared ? id : "",
      demoListId: isShared ? "" : id,
      name,
      title: name,
      language,
      publicTemplateKind: isShared ? "shared-layout" : "demo",
      published: record?.published !== false,
      updatedAt: normalizeText(record?.updatedAt || record?.updated_at)
    };
    byKey.set(`${entry.publicTemplateKind}:${id}`, entry);
  });
  return [...byKey.values()];
}

export function adminDemoHistoryEntries(records = []) {
  return normalizeAdminTemplateHistoryRecords(records)
    .filter((entry) => entry.publicTemplateKind === "demo");
}

export function adminSharedHistoryEntries(records = []) {
  return normalizeAdminTemplateHistoryRecords(records)
    .filter((entry) => entry.publicTemplateKind === "shared-layout")
    .map((entry) => ({
      id: entry.sharedId,
      name: entry.name,
      language: entry.language,
      published: entry.published,
      updatedAt: entry.updatedAt
    }));
}
