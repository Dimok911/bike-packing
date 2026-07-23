import test from "node:test";
import assert from "node:assert/strict";
import {
  photoPrimaryButtonState,
  resolvePhotoPrimaryButtonPhotoCount
} from "../../src/ui/photo-primary-button.js";
import { moveOrderedPhoto } from "../../src/ui/photo-order-dialog.js";
import {
  clipboardImageSourcesFromHtml,
  clipboardImageSourcesFromUriList,
  clipboardImageFiles,
  normalizeClipboardImageBlob,
  photoPasteEventImageFiles,
  readClipboardImageFiles,
  readPhotoPasteEventImageFiles,
  shouldHandlePhotoPasteTarget
} from "../../src/ui/photo-clipboard.js";

test("CRITICAL photos: clipboard paste accepts images without hijacking text fields", () => {
  const image = { name: "paste.png", type: "image/png", size: 12, lastModified: 1 };
  const text = { name: "note.txt", type: "text/plain", size: 5, lastModified: 1 };
  assert.deepEqual(clipboardImageFiles({
    items: [
      { kind: "file", type: "image/png", getAsFile: () => image },
      { kind: "file", type: "text/plain", getAsFile: () => text }
    ],
    files: [image]
  }), [image]);
  assert.equal(shouldHandlePhotoPasteTarget({ closest: () => ({}) }), false);
  assert.equal(shouldHandlePhotoPasteTarget({ closest: () => null }), true);
});

test("CRITICAL photos: clipboard file list wins over duplicate item representation", () => {
  const file = { name: "clipboard.png", type: "image/png", size: 12, lastModified: 1 };
  const itemCopy = { name: "image.png", type: "image/png", size: 12, lastModified: 0 };
  assert.deepEqual(clipboardImageFiles({
    files: [file],
    items: [{ kind: "file", type: "image/png", getAsFile: () => itemCopy }]
  }), [file]);
});

test("CRITICAL photos: one-click clipboard read returns one image representation per item", async () => {
  const image = { type: "image/png", size: 12 };
  const files = await readClipboardImageFiles({
    read: async () => [
      { types: ["text/html", "image/png"], getType: async (type) => type === "image/png" ? image : null },
      { types: ["text/plain"], getType: async () => ({ type: "text/plain" }) }
    ]
  });
  assert.deepEqual(files, [image]);
});

test("CRITICAL photos: clipboard read falls back to another image representation", async () => {
  const image = { type: "image/jpeg", size: 12 };
  const files = await readClipboardImageFiles({
    read: async () => [{
      types: ["image/heic", "image/jpeg"],
      getType: async (type) => {
        if (type === "image/heic") throw new Error("unsupported representation");
        return image;
      }
    }]
  });
  assert.deepEqual(files, [image]);
});

test("CRITICAL photos: copied web images can be recovered from the clipboard HTML representation", async () => {
  const dataUrl = "data:image/png;base64,aW1hZ2UgYnl0ZXM=";
  const files = await readClipboardImageFiles({
    read: async () => [{
      types: ["text/html", "text/uri-list"],
      getType: async (type) => new Blob([
        type === "text/html" ? `<a href=\"https://example.com\"><img src=\"${dataUrl}\"></a>` : "https://example.com/image"
      ], { type })
    }]
  });
  assert.equal(files.length, 1);
  assert.equal(files[0].type, "image/png");
  assert.equal(await files[0].text(), "image bytes");
});

test("CRITICAL photos: clipboard HTML and URI parsing keeps only supported image sources", () => {
  assert.deepEqual(clipboardImageSourcesFromHtml(
    '<img src="blob:https://example.com/one"><img src="javascript:alert(1)"><img src="https://example.com/a.jpg?x=1&amp;y=2">'
  ), ["blob:https://example.com/one", "https://example.com/a.jpg?x=1&y=2"]);
  assert.deepEqual(clipboardImageSourcesFromUriList(
    "# copied image\nhttps://example.com/a.png\njavascript:alert(1)"
  ), ["https://example.com/a.png"]);
});

test("CRITICAL photos: a clipboard blob with a missing MIME type inherits its declared image type", async () => {
  const source = new Blob(["image bytes"]);
  const normalized = normalizeClipboardImageBlob(source, "image/png");
  assert.equal(normalized.type, "image/png");
  assert.equal(await normalized.text(), "image bytes");
});

test("CRITICAL photos: iOS direct-read paste accepts an image even when focus remains in a text field", () => {
  const image = { name: "paste.png", type: "image/png", size: 12, lastModified: 1 };
  const event = {
    target: { closest: () => ({}) },
    clipboardData: { files: [image] }
  };
  assert.deepEqual(photoPasteEventImageFiles(event), []);
  assert.deepEqual(photoPasteEventImageFiles(event, { directReadPending: true }), [image]);
});

test("CRITICAL photos: iOS paste event recovers a copied web image from HTML", async () => {
  const dataUrl = "data:image/png;base64,aW1hZ2UgYnl0ZXM=";
  const event = {
    target: { closest: () => ({}) },
    clipboardData: {
      items: [{
        kind: "string",
        type: "text/html",
        getAsString: (callback) => callback(`<img src=\"${dataUrl}\">`)
      }]
    }
  };
  const files = await readPhotoPasteEventImageFiles(event, { directReadPending: true });
  assert.equal(files.length, 1);
  assert.equal(files[0].type, "image/png");
  assert.equal(await files[0].text(), "image bytes");
});

test("CRITICAL photos: unsupported direct clipboard read keeps Ctrl+V fallback available", async () => {
  assert.equal(await readClipboardImageFiles({}), null);
});

test("CRITICAL photos: ordering moves secondary photos without changing the primary photo", () => {
  const photos = [{ id: "primary" }, { id: "second" }, { id: "third" }];
  const moved = moveOrderedPhoto(photos, 2, 1);
  assert.deepEqual(moved.photos.map((photo) => photo.id), ["primary", "third", "second"]);
  assert.equal(moved.changed, true);
  const blocked = moveOrderedPhoto(photos, 1, 0);
  assert.deepEqual(blocked.photos.map((photo) => photo.id), ["primary", "second", "third"]);
  assert.equal(blocked.changed, false);
});

test("CRITICAL photos: primary button is hidden only when there are fewer than two photos", () => {
  assert.equal(photoPrimaryButtonState({ photoCount: 0 }).hidden, true);
  assert.equal(photoPrimaryButtonState({ photoCount: 1 }).hidden, true);
  assert.equal(photoPrimaryButtonState({ photoCount: 2 }).hidden, false);
});

test("CRITICAL photos: primary button text and disabled state follow the active photo", () => {
  assert.deepEqual(photoPrimaryButtonState({
    activeIndex: 0,
    photoCount: 2,
    primaryText: "Make primary",
    alreadyPrimaryText: "Already primary"
  }), {
    hidden: false,
    disabled: true,
    textContent: "Already primary"
  });

  assert.deepEqual(photoPrimaryButtonState({
    activeIndex: 1,
    photoCount: 2,
    primaryText: "Make primary",
    alreadyPrimaryText: "Already primary"
  }), {
    hidden: false,
    disabled: false,
    textContent: "Make primary"
  });
});

test("CRITICAL photos: primary button can be force-disabled without being hidden", () => {
  assert.deepEqual(photoPrimaryButtonState({
    activeIndex: 1,
    photoCount: 2,
    forceDisabled: true,
    primaryText: "Make primary",
    alreadyPrimaryText: "Already primary"
  }), {
    hidden: false,
    disabled: true,
    textContent: "Make primary"
  });
});

test("CRITICAL photos: primary button count prefers explicit, state, then last preview before DOM", () => {
  assert.equal(resolvePhotoPrimaryButtonPhotoCount({
    explicitCount: 2,
    sourceCount: 0,
    previewCount: 0,
    domCount: 0
  }), 2);
  assert.equal(resolvePhotoPrimaryButtonPhotoCount({
    sourceCount: 2,
    previewCount: 1,
    domCount: 0
  }), 2);
  assert.equal(resolvePhotoPrimaryButtonPhotoCount({
    sourceCount: null,
    previewCount: 2,
    domCount: 0
  }), 2);
  assert.equal(resolvePhotoPrimaryButtonPhotoCount({
    sourceCount: null,
    previewCount: null,
    domCount: 2
  }), 2);
});
