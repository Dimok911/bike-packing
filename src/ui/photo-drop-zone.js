import { readPhotoPasteEventImageFiles } from "./photo-clipboard.js";

// Read transfer strings while the drop event owns the data store. Browsers may
// revoke access after the first asynchronous image download.
export function snapshotPhotoTransfer(transfer) {
  return {
    files: [...(transfer?.files || [])],
    items: ["text/html", "text/uri-list", "text/plain"].map((type) => {
      const value = transfer?.getData?.(type) || "";
      return { kind: "string", type, getAsString: (callback) => callback(value) };
    })
  };
}

export function hasPhotoTransfer(transfer) {
  return [...(transfer?.types || [])].some((type) =>
    ["Files", "text/html", "text/uri-list", "text/plain"].includes(type));
}

export function bindPhotoDropZone({ zone, dialog, onFiles, fetchImage, canReceive = () => true, onEmpty = () => {}, onError = () => {} }) {
  if (!zone || !dialog) return;
  let depth = 0;
  let generation = 0;
  let importing = false;
  const clear = () => { depth = 0; zone.classList.remove("photo-drop-active"); };
  const allowed = (event) => dialog.open && hasPhotoTransfer(event.dataTransfer);
  zone.addEventListener("dragenter", (event) => {
    if (!allowed(event)) return;
    event.preventDefault();
    if (!canReceive() || importing) return;
    depth++;
    zone.classList.add("photo-drop-active");
  });
  zone.addEventListener("dragover", (event) => {
    if (!allowed(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = importing || !canReceive() ? "none" : "copy";
    zone.classList.toggle("photo-drop-active", !importing && canReceive());
  });
  zone.addEventListener("dragleave", () => {
    if (--depth <= 0) clear();
  });
  zone.addEventListener("drop", async (event) => {
    if (!allowed(event)) return;
    event.preventDefault();
    event.stopPropagation();
    clear();
    if (importing || !canReceive()) return;
    const token = generation;
    const clipboardData = snapshotPhotoTransfer(event.dataTransfer);
    importing = true;
    zone.setAttribute("aria-busy", "true");
    try {
      const files = await readPhotoPasteEventImageFiles({ clipboardData }, { directReadPending: true, fetchImpl: fetchImage });
      if (generation !== token || !dialog.open || !canReceive()) return;
      if (files.length) await onFiles(files);
      else onEmpty();
    } catch (error) {
      if (generation === token && dialog.open) onError(error);
    } finally {
      if (generation === token) {
        importing = false;
        zone.removeAttribute("aria-busy");
      }
    }
  });
  dialog.addEventListener("close", () => {
    generation++;
    importing = false;
    zone.removeAttribute("aria-busy");
    clear();
  });
  zone.addEventListener("dragend", clear);
}
