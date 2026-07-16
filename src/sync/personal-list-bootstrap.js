export async function ensurePersonalListId({
  chooseDefaultList = () => null,
  clearCurrentListId = () => {},
  createList = async () => null,
  fetchLists = async () => [],
  getCurrentListId = () => "",
  isPublicTemplateListId = () => false,
  missingListMessage = "Personal list could not be created.",
  normalizeLists = (value) => Array.isArray(value) ? value : [],
  recordId = (record) => record?.id || "",
  rememberRecord = (record) => record,
  onResolved = () => {}
} = {}) {
  let currentListId = String(getCurrentListId() || "").trim();
  if (currentListId && isPublicTemplateListId(currentListId)) {
    clearCurrentListId();
    currentListId = String(getCurrentListId() || "").trim();
  }
  if (currentListId) return currentListId;

  const data = await fetchLists();
  const existing = chooseDefaultList(normalizeLists(data));
  if (existing) {
    const remembered = rememberRecord(existing);
    const existingId = String(recordId(remembered || existing) || "").trim();
    if (existingId) {
      onResolved(remembered || existing, data, { created: false });
      return existingId;
    }
  }

  const createdData = await createList();
  const createdRecord = rememberRecord(createdData);
  const createdId = String(recordId(createdRecord || createdData) || "").trim();
  if (!createdId) throw new Error(missingListMessage);
  onResolved(createdRecord || createdData, createdData, { created: true });
  return createdId;
}
