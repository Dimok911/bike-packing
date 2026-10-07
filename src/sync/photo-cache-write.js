// Detach IndexedDB-backed bytes before overwriting a record or starting upload.
// Read every byte BEFORE opening a write transaction or replacing the old record.
export async function detachPhotoCacheRecordBlobs(record) {
  const next = { ...record };
  const copies = new Map();
  for (const key of ['blob', 'thumbBlob']) {
    const source = record?.[key];
    if (source == null) continue;
    if (!copies.has(source)) {
      if (typeof source.arrayBuffer !== 'function') throw new TypeError(`Unreadable photo cache ${key}`);
      const bytes = await source.arrayBuffer();
      if (bytes.byteLength !== source.size || bytes.byteLength === 0) {
        throw new Error(`Incomplete photo cache ${key}`);
      }
      copies.set(source, new Blob([bytes], { type: source.type || '' }));
    }
    next[key] = copies.get(source);
  }
  return next;
}
