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
    let directFile = null;
    const imageTypes = [...(item?.types || [])].filter((type) =>
      String(type || "").toLowerCase().startsWith("image/")
    );
    if (typeof item?.getType !== "function") continue;
    if (imageTypes.length) {
      for (const imageType of imageTypes) {
        try {
          const file = normalizeClipboardImageBlob(await item.getType(imageType), imageType);
          if (!file) continue;
          directFile = file;
          break;
        } catch {
          // Some WebKit clipboard items expose an image representation that cannot
          // be materialized. Try the next image representation from the same item.
        }
      }
    }
    if (isGifClipboardImage(directFile)) {
      files.push(directFile);
      continue;
    }
    const sourceFile = await clipboardItemSourceImage(item, {
      fetchImpl,
      gifOnly: Boolean(directFile)
    });
    if (sourceFile && (!directFile || isGifClipboardImage(sourceFile))) files.push(sourceFile);
    else if (directFile) files.push(directFile);
  }
  return files;
}

async function clipboardItemSourceImage(item, { fetchImpl, gifOnly = false }) {
  const representations = [
    ["text/html", clipboardImageSourcesFromHtml],
    ["text/uri-list", clipboardImageSourcesFromUriList],
    ["text/plain", clipboardImageSourcesFromPlainText]
  ];
  for (const [expectedType, sourceParser] of representations) {
    const type = clipboardItemType(item, expectedType);
    if (!type) continue;
    try {
      const value = await readClipboardBlobText(await item.getType(type));
      const sources = sourceParser(value).filter((source) => !gifOnly || clipboardSourceLikelyGif(source));
      const file = await firstFetchableClipboardImage(sources, { fetchImpl });
      if (file) return file;
    } catch {
      // Try the next URL representation when this clipboard flavor cannot be read.
    }
  }
  return null;
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

export function clipboardImageSourcesFromPlainText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => supportedClipboardImageSource(value));
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
      if (blob) return nameClipboardImageBlob(blob, source, response);
    } catch {
      // Try the next representation. Cross-origin URLs commonly fail here,
      // while WebKit-generated blob: and data: URLs remain readable.
    }
  }
  return null;
}

function nameClipboardImageBlob(blob, source, response) {
  const headerName = decodeClipboardFileName(response?.headers?.get?.("X-File-Name") || "");
  const sourceName = clipboardImageNameFromSource(source, blob.type);
  const name = headerName || sourceName;
  if (!name || blob?.name) return blob;
  if (typeof File === "function") {
    return new File([blob], name, { type: blob.type, lastModified: Date.now() });
  }
  try {
    Object.defineProperty(blob, "name", { value: name, configurable: true });
  } catch {
    // Blob metadata is optional; the bytes and MIME type are sufficient.
  }
  return blob;
}

function decodeClipboardFileName(value) {
  try {
    return decodeURIComponent(String(value || "")).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").slice(0, 180);
  } catch {
    return "";
  }
}

function clipboardImageNameFromSource(source, type) {
  const extensions = {
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic"
  };
  try {
    if (/^https?:\/\//i.test(String(source || ""))) {
      const name = decodeURIComponent(new URL(source).pathname.split("/").pop() || "");
      if (name) return name;
    }
  } catch {
    // Use a MIME-based fallback below.
  }
  return `clipboard-image.${extensions[String(type || "").toLowerCase()] || "img"}`;
}

function isGifClipboardImage(file) {
  return String(file?.type || "").toLowerCase() === "image/gif" || /\.gif$/i.test(String(file?.name || ""));
}

function clipboardSourceLikelyGif(source) {
  return /^data:image\/gif[;,]/i.test(String(source || "")) || /\.gif(?:$|[?#])/i.test(String(source || ""));
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
  if (!directReadPending && !shouldHandlePhotoPasteTarget(event?.target)) return [];
  const items = [...(event?.clipboardData?.items || [])];
  if (directFiles.some(isGifClipboardImage)) return directFiles;
  const representations = [
    ["text/html", clipboardImageSourcesFromHtml],
    ["text/uri-list", clipboardImageSourcesFromUriList],
    ["text/plain", clipboardImageSourcesFromPlainText]
  ];
  for (const [expectedType, sourceParser] of representations) {
    const item = items.find((entry) =>
      entry?.kind === "string" && String(entry.type || "").toLowerCase() === expectedType
    );
    if (!item) continue;
    const value = await readDataTransferItemText(item);
    const sources = sourceParser(value).filter((source) => !directFiles.length || clipboardSourceLikelyGif(source));
    const file = await firstFetchableClipboardImage(sources, { fetchImpl });
    if (file && (!directFiles.length || isGifClipboardImage(file))) return [file];
  }
  return directFiles;
}

function readDataTransferItemText(item) {
  if (typeof item?.getAsString !== "function") return Promise.resolve("");
  return new Promise((resolve) => item.getAsString((value) => resolve(String(value || ""))));
}

export function shouldHandlePhotoPasteTarget(target) {
  return !target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}
