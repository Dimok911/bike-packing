import { createStoredZip } from "../utils/simple-zip.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const paused = () => Object.assign(new Error("Не удалось подготовить точную копию фотографий. Не очищайте данные сайта."),
  { isPersonalPhotoRecoveryBlocked: true, code: "photo-recovery-export" });

// Not a normal backup and deliberately has no automatic importer. The raw
// journal and byte inventory remain useful even when intent hashes are damaged.
export async function createPersonalPhotoRecoveryArchive({ store, getContext, getRecoveryCopy, inventory = null, memoryForm = null, guestSelectionStore = null, publicSelectionStore = null }) {
  const initial = { ...getContext?.() }, binding = store?.binding;
  const assertCurrent = () => {
    const current = getContext?.();
    if (!binding || binding.environment !== "bike-packing-experiment" || binding.scopeKey !== `id:${binding.actorId}`
      || !initial.generation || initial.scope !== "personal" || current?.scope !== "personal" || current.generation !== initial.generation
      || Object.keys(binding).some(key => initial[key] !== binding[key] || current[key] !== binding[key])) throw paused();
  };
  assertCurrent();
  const copy = getRecoveryCopy();
  if (copy?.environment !== binding.environment || copy.scopeKey !== binding.scopeKey || copy.automaticImportAllowed !== false) throw paused();
  const frozenCopy = JSON.stringify(copy);
  const rows = await store.recoveryRecords(); assertCurrent();
  if (!Array.isArray(rows) || new Set(rows.map(row => row.operationId)).size !== rows.length) throw paused();
  const entries = [{ name: "personal-queue.json", content: frozenCopy }], files = [];
  let totalBytes = new TextEncoder().encode(frozenCopy).byteLength;
  let guestRows = null;
  if (guestSelectionStore) {
    if (!same(guestSelectionStore.binding, binding)) throw paused();
    guestRows = JSON.stringify(await guestSelectionStore.recoveryRecords()); assertCurrent();
    totalBytes += new TextEncoder().encode(guestRows).byteLength;
    if (totalBytes > 256 * 1024 * 1024) throw paused();
    entries.push({ name: "guest-import-selections.json", content: guestRows });
  }
  let memoryFormIncluded = false;
  let publicRows = null;
  if (publicSelectionStore) {
    if (!same(publicSelectionStore.binding, binding)) throw paused();
    publicRows = JSON.stringify(await publicSelectionStore.recoveryRecords()); assertCurrent();
    totalBytes += new TextEncoder().encode(publicRows).byteLength;
    if (totalBytes > 256 * 1024 * 1024) throw paused();
    entries.push({ name: "public-import-selections.json", content: publicRows });
  }
  if (memoryForm) {
    if (!same(memoryForm.request?.binding, binding) || memoryForm.automaticImportAllowed !== false
      || !Array.isArray(memoryForm.files) || memoryForm.files.length > 50) throw paused();
    const { files: selected, captured, ...formMetadata } = memoryForm;
    const metadata = JSON.stringify({ ...formMetadata, files: selected.map(({ fileName, file, thumb }) => ({
      fileName, type: file?.type, size: file?.size, thumbType: thumb?.type, thumbSize: thumb?.size
    })), dispatchable: false, warning: "Frozen UI draft, not a dispatchable operation or server confirmation." });
    entries.push({ name: "opened-form/form.json", content: metadata });
    totalBytes += new TextEncoder().encode(metadata).byteLength;
    for (const [index, part] of selected.entries()) {
      if (!(part.file instanceof Blob) || part.thumb !== null && !(part.thumb instanceof Blob)) throw paused();
      totalBytes += part.file.size + (part.thumb?.size || 0);
      if (totalBytes > 256 * 1024 * 1024) throw paused();
      entries.push({ name: `opened-form/${index}/original.bin`, content: await part.file.arrayBuffer() }); assertCurrent();
      if (part.thumb) { entries.push({ name: `opened-form/${index}/thumbnail.bin`, content: await part.thumb.arrayBuffer() }); assertCurrent(); }
    }
    memoryFormIncluded = true;
  }
  // This in-memory ZIP is bounded. Refuse rather than produce a truncated
  // recovery copy or exceed classic ZIP limits; originals remain untouched.
  if (rows.length > 1000) throw paused();
  // UUID sorting here only stabilizes archive filenames; it is NOT action order.
  for (const { operationId, record, claim, claims } of [...rows].sort((a, b) => a.operationId.localeCompare(b.operationId))) {
    if (!/^[a-f0-9-]{36}$/.test(operationId) || record?.key !== JSON.stringify([JSON.stringify(binding), operationId])
      || record.bindingKey !== JSON.stringify(binding)) throw paused();
    if (record.version === 2) {
      const { files: parts, ...raw } = record, prefix = `photos/${operationId}`;
      const metadataParts = [], included = [];
      if (Array.isArray(parts) && parts.length > 50) throw paused();
      for (const [index, part] of (Array.isArray(parts) ? parts : []).entries()) {
        const { file, thumb, ...partMetadata } = part || {};
        // Index-based names preserve even a malformed/duplicate stage ID
        // without letting an untrusted ID change the archive path.
        const partPrefix = `${prefix}/parts/${index}`;
        const saved = { index, stageOperationId: part?.stageOperationId ?? null,
          fullBytesIncluded: file instanceof ArrayBuffer, thumbnailBytesIncluded: thumb instanceof ArrayBuffer,
          thumbnailAbsent: thumb === null, intentVerified: false };
        metadataParts.push({ ...partMetadata,
          ...(saved.fullBytesIncluded ? {} : { unreadableOriginalValue: file ?? null }),
          ...(saved.thumbnailBytesIncluded || thumb === null ? {} : { unreadableThumbnailValue: thumb ?? null }) });
        totalBytes += (saved.fullBytesIncluded ? file.byteLength : 0) + (saved.thumbnailBytesIncluded ? thumb.byteLength : 0);
        if (totalBytes > 256 * 1024 * 1024) throw paused();
        if (saved.fullBytesIncluded) entries.push({ name: `${partPrefix}/original.bin`, content: file });
        if (saved.thumbnailBytesIncluded) entries.push({ name: `${partPrefix}/thumbnail.bin`, content: thumb });
        included.push(saved);
      }
      const metadata = JSON.stringify({ ...raw, files: metadataParts, dispatchClaim: claim, dispatchClaims: claims || [],
        ...(Array.isArray(parts) ? {} : { unreadableFilesValue: parts ?? null }) });
      totalBytes += new TextEncoder().encode(metadata).byteLength;
      if (totalBytes > 256 * 1024 * 1024) throw paused();
      entries.push({ name: `${prefix}/record.json`, content: metadata });
      files.push({ operationId, batch: true, parts: included, intentVerified: false, fileInventoryReadable: Array.isArray(parts) });
      continue;
    }
    const { file, thumb, ...raw } = record, prefix = `photos/${operationId}`;
    const metadata = JSON.stringify({ ...raw, dispatchClaim: claim,
      ...(file instanceof ArrayBuffer ? {} : { unreadableOriginalValue: file ?? null }),
      ...(thumb instanceof ArrayBuffer || thumb === null ? {} : { unreadableThumbnailValue: thumb ?? null }) });
    totalBytes += new TextEncoder().encode(metadata).byteLength + (file?.byteLength || 0) + (thumb?.byteLength || 0);
    if (totalBytes > 256 * 1024 * 1024) throw paused();
    entries.push({ name: `${prefix}/record.json`, content: metadata });
    const saved = { operationId, fullBytesIncluded: file instanceof ArrayBuffer, thumbnailBytesIncluded: thumb instanceof ArrayBuffer,
      thumbnailAbsent: thumb === null, intentVerified: false };
    if (saved.fullBytesIncluded) entries.push({ name: `${prefix}/original.bin`, content: file });
    if (saved.thumbnailBytesIncluded) entries.push({ name: `${prefix}/thumbnail.bin`, content: thumb });
    // Corrupt bytes are still exported, with no assertion that they are valid.
    files.push(saved);
  }
  const afterIds = await store.ids(); assertCurrent();
  if (!same([...afterIds].sort(), rows.map(row => row.operationId).sort()) || frozenCopy !== JSON.stringify(getRecoveryCopy())) throw paused();
  const manifest = { format: "bike-packing-photo-recovery-v1", binding, automaticImportAllowed: false,
    ...(guestRows !== null ? { guestSelectionsIncluded: true, guestSelectionsVerified: false } : {}),
    ...(publicRows !== null ? { publicSelectionsIncluded: true, publicSelectionsVerified: false } : {}),
    serverConfirmationIncluded: false, coverage: memoryFormIncluded ? "current-list-local-photo-journal-and-opened-form" : "current-list-local-photo-journal-only", files,
    ...(memoryFormIncluded ? { openedFormIncluded: true, openedFormDispatchable: false } : {}),
    inventory: inventory?.binding && same(inventory.binding, binding) ? inventory : null,
    missingPhotoOperationIds: (inventory?.entries || []).filter(entry => entry.state === "missing-file").map(entry => entry.operationId),
    warning: "Local recovery evidence only. Do not import automatically, send publicly, delete originals or infer server confirmation." };
  entries.unshift({ name: "recovery-manifest.json", content: JSON.stringify(manifest, null, 2) });
  const blob = await createStoredZip(entries); assertCurrent();
  const finalIds = await store.ids(); assertCurrent();
  if (guestRows !== null && guestRows !== JSON.stringify(await guestSelectionStore.recoveryRecords())) throw paused();
  if (publicRows !== null && publicRows !== JSON.stringify(await publicSelectionStore.recoveryRecords())) throw paused();
  assertCurrent();
  if (!same([...finalIds].sort(), rows.map(row => row.operationId).sort()) || frozenCopy !== JSON.stringify(getRecoveryCopy())) throw paused();
  return { blob, fileName: "bike-packing-photo-recovery.zip", manifest };
}
