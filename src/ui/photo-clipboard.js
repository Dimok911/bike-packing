export function clipboardImageFiles(clipboardData) {
  const result = [];
  const seen = new Set();
  const add = (file) => {
    if (!file || !String(file.type || "").toLowerCase().startsWith("image/")) return;
    const key = `${file.name || ""}:${file.type || ""}:${file.size || 0}:${file.lastModified || 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(file);
  };
  const directFiles = [...(clipboardData?.files || [])].filter((file) =>
    String(file?.type || "").toLowerCase().startsWith("image/")
  );
  if (directFiles.length) {
    directFiles.forEach(add);
    return result;
  }
  [...(clipboardData?.items || [])].forEach((item) => {
    if (item?.kind === "file" && String(item.type || "").toLowerCase().startsWith("image/")) add(item.getAsFile?.());
  });
  return result;
}

export async function readClipboardImageFiles(clipboard) {
  if (typeof clipboard?.read !== "function") return null;
  const files = [];
  const clipboardItems = await clipboard.read();
  for (const item of clipboardItems || []) {
    const imageType = [...(item?.types || [])].find((type) =>
      String(type || "").toLowerCase().startsWith("image/")
    );
    if (!imageType || typeof item?.getType !== "function") continue;
    const file = await item.getType(imageType);
    if (String(file?.type || "").toLowerCase().startsWith("image/")) files.push(file);
  }
  return files;
}

export function shouldHandlePhotoPasteTarget(target) {
  return !target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}
