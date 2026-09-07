const fail = () => { throw Error("Локальный файл фото повреждён или неполон. Исходные данные не удалены."); };
const validBlob = value => value instanceof Blob && value.size > 0 && value.size <= 10 * 1024 * 1024 && value.type.startsWith("image/");

// Opt-in representation for newly prepared form images. Older Blob cache rows
// are read unchanged. This evictable preview cache is not operation authority.
export async function encodePhotoCacheBinary(record) {
  if (!validBlob(record?.blob) || record.thumbBlob != null && !validBlob(record.thumbBlob) || record.binaryPhotoCache !== undefined) fail();
  const { blob, thumbBlob = null, ...metadata } = record;
  const part = async value => value && ({ type: value.type, bytes: await value.arrayBuffer() });
  return { ...metadata, binaryPhotoCache: { version: 1, file: await part(blob), thumb: await part(thumbBlob) } };
}

export function decodePhotoCacheBinary(record) {
  if (!Object.hasOwn(record, "binaryPhotoCache")) return record;
  const { binaryPhotoCache: binary, ...metadata } = record;
  const part = value => {
    if (!value || !(value.bytes instanceof ArrayBuffer) || !value.bytes.byteLength || value.bytes.byteLength > 10 * 1024 * 1024
      || typeof value.type !== "string" || !value.type.startsWith("image/")) fail();
    return new Blob([value.bytes], { type: value.type });
  };
  if (binary?.version !== 1 || Object.hasOwn(record, "blob") || Object.hasOwn(record, "thumbBlob")) fail();
  return { ...metadata, blob: part(binary.file), thumbBlob: binary.thumb === null ? null : part(binary.thumb) };
}
