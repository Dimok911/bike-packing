import { createStoredZip } from "../utils/simple-zip.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const paused = () => Object.assign(new Error("Не удалось подготовить точную копию фотографий. Не очищайте данные сайта."),
  { isPersonalPhotoRecoveryBlocked: true, code: "photo-recovery-export" });

// Not a normal backup and deliberately has no automatic importer. The raw
// journal and byte inventory remain useful even when intent hashes are damaged.
export async function createPersonalPhotoRecoveryArchive({ store, getContext, getRecoveryCopy, inventory = null }) {
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
  // This in-memory ZIP is bounded. Refuse rather than produce a truncated
  // recovery copy or exceed classic ZIP limits; originals remain untouched.
  if (rows.length > 1000) throw paused();
  // UUID sorting here only stabilizes archive filenames; it is NOT action order.
  for (const { operationId, record, claim } of [...rows].sort((a, b) => a.operationId.localeCompare(b.operationId))) {
    if (!/^[a-f0-9-]{36}$/.test(operationId) || record?.key !== JSON.stringify([JSON.stringify(binding), operationId])
      || record.bindingKey !== JSON.stringify(binding)) throw paused();
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
    serverConfirmationIncluded: false, coverage: "current-list-local-photo-journal-only", files,
    inventory: inventory?.binding && same(inventory.binding, binding) ? inventory : null,
    missingPhotoOperationIds: (inventory?.entries || []).filter(entry => entry.state === "missing-file").map(entry => entry.operationId),
    warning: "Local recovery evidence only. Do not import automatically, send publicly, delete originals or infer server confirmation." };
  entries.unshift({ name: "recovery-manifest.json", content: JSON.stringify(manifest, null, 2) });
  const blob = await createStoredZip(entries); assertCurrent();
  const finalIds = await store.ids(); assertCurrent();
  if (!same([...finalIds].sort(), rows.map(row => row.operationId).sort()) || frozenCopy !== JSON.stringify(getRecoveryCopy())) throw paused();
  return { blob, fileName: "bike-packing-photo-recovery.zip", manifest };
}
