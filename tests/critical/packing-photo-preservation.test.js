import test from "node:test";
import assert from "node:assert/strict";
import {
  capturePackingPhotoRenderState,
  restorePackingPhotoRenderState
} from "../../src/ui/packing-photo-preservation.js";

function createImage(localId, { loaded = true } = {}) {
  const attributes = new Map([
    ["src", `blob:${localId}`],
    ["data-photo-local-source-id", localId],
    ["alt", ""]
  ]);
  return {
    complete: loaded,
    naturalWidth: loaded ? 640 : 0,
    dataset: { photoLocalSourceId: localId },
    getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
    removeAttribute(name) {
      attributes.delete(name);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
      if (name === "data-photo-local-source-id") this.dataset.photoLocalSourceId = value;
    },
    replaceWith() {}
  };
}

function createGallery(images, activeIndex = 0) {
  const track = { clientWidth: 300, scrollLeft: activeIndex * 300 };
  return {
    dataset: {},
    querySelector(selector) {
      return selector === ".photo-gallery-track" ? track : null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-photo-open] img") return images;
      if (selector === ".photo-gallery-dot") return [];
      return [];
    }
  };
}

function createRoot(gallery, images) {
  return {
    querySelectorAll(selector) {
      if (selector === "[data-photo-gallery]") return [gallery];
      if (selector === "[data-photo-gallery] img") return images;
      return [];
    }
  };
}

test("packing rerender reuses a decoded photo node and preserves gallery position", () => {
  const oldImages = [createImage("photo-1"), createImage("photo-2")];
  const snapshot = capturePackingPhotoRenderState(createRoot(createGallery(oldImages, 1), oldImages));
  const replacements = [createImage("photo-1", { loaded: false }), createImage("photo-2", { loaded: false })];
  const restored = [];
  replacements.forEach((replacement, index) => {
    replacement.replaceWith = (image) => restored[index] = image;
  });
  const nextGallery = createGallery(replacements);

  restorePackingPhotoRenderState(createRoot(nextGallery, replacements), snapshot);

  assert.deepEqual(restored, oldImages);
  assert.equal(nextGallery.dataset.photoInitialIndex, "1");
});

test("packing rerender does not preserve an image that has not finished loading", () => {
  const oldImage = createImage("photo-1", { loaded: false });
  const snapshot = capturePackingPhotoRenderState(createRoot(createGallery([oldImage]), [oldImage]));
  const replacement = createImage("photo-1", { loaded: false });
  let replaced = false;
  replacement.replaceWith = () => replaced = true;

  restorePackingPhotoRenderState(createRoot(createGallery([replacement]), [replacement]), snapshot);

  assert.equal(replaced, false);
});
