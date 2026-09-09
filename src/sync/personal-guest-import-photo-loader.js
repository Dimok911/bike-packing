import { photoCacheSourceSignature } from "./photo-cache-quality.js";

// Always read the guest namespace explicitly after sign-in. A preview-only
// cache entry or thumb URL is not an original file for a new personal copy.
export async function loadPersonalGuestImportPhoto({ photo }, { getCachedPhoto, fetchPhoto, guestScope = "guest" }) {
  const frozen = structuredClone(photo), id = frozen.localId || frozen.id;
  const cached = id ? await getCachedPhoto(id, guestScope) : null;
  const signature = photoCacheSourceSignature(frozen.url, frozen.thumbUrl, frozen.updatedAt);
  const verified = cached?.fullBlobVerified === true && cached.blob instanceof Blob
    && (!frozen.url && frozen.status !== "synced" || cached.sourceSignature === signature);
  let file = verified ? cached.blob : null, thumb = verified && cached.thumbBlob instanceof Blob ? cached.thumbBlob : null;
  if (!file) {
    if (!frozen.url) throw Error("Не найден исходный файл гостевой фотографии. Миниатюра сохранена, перенос ожидает оригинал.");
    const response = await fetchPhoto(frozen.url, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw Error("Не удалось прочитать исходную гостевую фотографию. Перенос сохранён для восстановления.");
    file = await response.blob();
  }
  return { file, thumb, fileName: frozen.fileName || cached?.fileName || `${id}.${file.type.split("/")[1] || "jpg"}` };
}
