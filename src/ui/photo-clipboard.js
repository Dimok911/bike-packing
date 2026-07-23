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

export async function readClipboardImageFiles(clipboard, {
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof clipboard?.read !== "function") return null;
  const files = [];
  const clipboardItems = await clipboard.read();
  for (const item of clipboardItems || []) {
    const itemFileCountStart = files.length;
    const imageTypes = [...(item?.types || [])].filter((type) =>
      String(type || "").toLowerCase().startsWith("image/")
    );
    if (typeof item?.getType !== "function") continue;
    if (imageTypes.length) {
      for (const imageType of imageTypes) {
        try {
          const file = normalizeClipboardImageBlob(await item.getType(imageType), imageType);
          if (!file) continue;
          files.push(file);
          break;
        } catch {
          // Some WebKit clipboard items expose an image representation that cannot
          // be materialized. Try the next image representation from the same item.
        }
      }
    }
    if (files.length > itemFileCountStart) continue;
    const htmlType = clipboardItemType(item, "text/html");
    if (htmlType) {
      try {
        const html = await readClipboardBlobText(await item.getType(htmlType));
        const file = await firstFetchableClipboardImage(
          clipboardImageSourcesFromHtml(html),
          { fetchImpl }
        );
        if (file) {
          files.push(file);
          continue;
        }
      } catch {
        // Fall through to the URI representation when WebKit cannot expose the
        // HTML image blob outside the native paste event.
      }
    }
    const uriType = clipboardItemType(item, "text/uri-list");
    if (uriType) {
      try {
        const uriList = await readClipboardBlobText(await item.getType(uriType));
        const file = await firstFetchableClipboardImage(
          clipboardImageSourcesFromUriList(uriList),
          { fetchImpl }
        );
        if (file) files.push(file);
      } catch {
        // A copied cross-origin image URL may be unavailable to fetch because
        // of CORS. In that case the clipboard correctly remains image-empty.
      }
    }
  }
  return files;
}

function clipboardItemType(item, expectedType) {
  return [...(item?.types || [])].find((type) =>
    String(type || "").toLowerCase() === expectedType
  ) || "";
}

async function readClipboardBlobText(blob) {
  if (typeof blob?.text === "function") return blob.text();
  if (typeof FileReader !== "function") return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read clipboard text."));
    reader.readAsText(blob);
  });
}

export function clipboardImageSourcesFromHtml(html) {
  const sources = [];
  const source = String(html || "");
  const imagePattern = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let match = imagePattern.exec(source);
  while (match) {
    const value = decodeClipboardHtmlAttribute(match[1] || match[2] || match[3] || "");
    if (supportedClipboardImageSource(value) && !sources.includes(value)) sources.push(value);
    match = imagePattern.exec(source);
  }
  return sources;
}

export function clipboardImageSourcesFromUriList(uriList) {
  return String(uriList || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value && !value.startsWith("#") && supportedClipboardImageSource(value));
}

function decodeClipboardHtmlAttribute(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function supportedClipboardImageSource(value) {
  return /^(?:blob:|data:image\/|https?:\/\/)/i.test(String(value || "").trim());
}

async function firstFetchableClipboardImage(sources, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") return null;
  for (const source of sources || []) {
    try {
      const response = await fetchImpl(source);
      if (!response?.ok && response?.status !== 0) continue;
      const declaredType = clipboardImageTypeFromSource(source);
      const blob = normalizeClipboardImageBlob(await response.blob(), declaredType);
      if (blob) return blob;
    } catch {
      // Try the next representation. Cross-origin URLs commonly fail here,
      // while WebKit-generated blob: and data: URLs remain readable.
    }
  }
  return null;
}

function clipboardImageTypeFromSource(source) {
  const dataType = String(source || "").match(/^data:(image\/[^;,]+)/i)?.[1];
  if (dataType) return dataType.toLowerCase();
  const cleanPath = String(source || "").split(/[?#]/, 1)[0].toLowerCase();
  if (cleanPath.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/.test(cleanPath)) return "image/jpeg";
  if (cleanPath.endsWith(".webp")) return "image/webp";
  if (cleanPath.endsWith(".gif")) return "image/gif";
  return "";
}

export function normalizeClipboardImageBlob(blob, declaredType = "") {
  if (!blob) return null;
  const actualType = String(blob.type || "").toLowerCase();
  if (actualType.startsWith("image/")) return blob;
  const imageType = String(declaredType || "").toLowerCase();
  if (!imageType.startsWith("image/")) return null;
  try {
    return new Blob([blob], { type: imageType });
  } catch {
    return null;
  }
}

export function photoPasteEventImageFiles(event, { directReadPending = false } = {}) {
  if (!directReadPending && !shouldHandlePhotoPasteTarget(event?.target)) return [];
  return clipboardImageFiles(event?.clipboardData);
}

export async function readPhotoPasteEventImageFiles(event, {
  directReadPending = false,
  fetchImpl = globalThis.fetch
} = {}) {
  const directFiles = photoPasteEventImageFiles(event, { directReadPending });
  if (directFiles.length) return directFiles;
  if (!directReadPending && !shouldHandlePhotoPasteTarget(event?.target)) return [];
  const items = [...(event?.clipboardData?.items || [])];
  const htmlItem = items.find((item) =>
    item?.kind === "string" && String(item.type || "").toLowerCase() === "text/html"
  );
  if (htmlItem) {
    const html = await readDataTransferItemText(htmlItem);
    const file = await firstFetchableClipboardImage(
      clipboardImageSourcesFromHtml(html),
      { fetchImpl }
    );
    if (file) return [file];
  }
  const uriItem = items.find((item) =>
    item?.kind === "string" && String(item.type || "").toLowerCase() === "text/uri-list"
  );
  if (!uriItem) return [];
  const uriList = await readDataTransferItemText(uriItem);
  const file = await firstFetchableClipboardImage(
    clipboardImageSourcesFromUriList(uriList),
    { fetchImpl }
  );
  return file ? [file] : [];
}

function readDataTransferItemText(item) {
  if (typeof item?.getAsString !== "function") return Promise.resolve("");
  return new Promise((resolve) => item.getAsString((value) => resolve(String(value || ""))));
}

export function shouldHandlePhotoPasteTarget(target) {
  return !target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}
