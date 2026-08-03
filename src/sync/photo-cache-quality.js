export function photoCacheSourceSignature(fullUrl = "", thumbUrl = "", updatedAt = "") {
  const normalizedFullUrl = String(fullUrl || "").trim();
  return [
    normalizedFullUrl,
    String(thumbUrl || normalizedFullUrl).trim(),
    String(updatedAt || "").trim()
  ].join("|");
}

export async function photoBlobsAreDistinct(fullBlob, thumbBlob) {
  if (!fullBlob) return false;
  if (!thumbBlob) return true;
  if (fullBlob === thumbBlob) return false;
  if (Number(fullBlob.size) !== Number(thumbBlob.size)) return true;
  if (typeof fullBlob.arrayBuffer !== "function" || typeof thumbBlob.arrayBuffer !== "function") {
    return false;
  }
  try {
    const chunkSize = 1024 * 1024;
    const size = Number(fullBlob.size) || 0;
    for (let offset = 0; offset < size; offset += chunkSize) {
      const end = Math.min(size, offset + chunkSize);
      const [fullBuffer, thumbBuffer] = await Promise.all([
        fullBlob.slice(offset, end).arrayBuffer(),
        thumbBlob.slice(offset, end).arrayBuffer()
      ]);
      const fullBytes = new Uint8Array(fullBuffer);
      const thumbBytes = new Uint8Array(thumbBuffer);
      if (fullBytes.length !== thumbBytes.length) return true;
      for (let index = 0; index < fullBytes.length; index += 1) {
        if (fullBytes[index] !== thumbBytes[index]) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
