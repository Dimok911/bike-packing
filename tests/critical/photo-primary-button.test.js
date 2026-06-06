import test from "node:test";
import assert from "node:assert/strict";
import {
  photoPrimaryButtonState,
  resolvePhotoPrimaryButtonPhotoCount
} from "../../src/ui/photo-primary-button.js";

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
