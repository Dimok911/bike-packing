import test from "node:test";
import assert from "node:assert/strict";

import { resolvePhotoLightboxPinchPan, resolvePhotoLightboxWheelScale } from "../../src/ui/photo-lightbox-zoom.js";

test("wheel zoom respects gesture magnitude regardless of event frequency", () => {
  const combined = resolvePhotoLightboxWheelScale({ scale: 1.5, deltaY: -20, ctrlKey: true });
  let divided = 1.5;
  for (let i = 0; i < 10; i++) divided = resolvePhotoLightboxWheelScale({ scale: divided, deltaY: -2, ctrlKey: true });
  assert.ok(Math.abs(combined - divided) < 1e-12);
  const small = resolvePhotoLightboxWheelScale({ deltaY: -0.2, ctrlKey: true });
  assert.ok(small > 1 && small < 1.01);
  assert.equal(resolvePhotoLightboxWheelScale({ scale: combined, deltaY: 0 }), combined);
});

test("wheel zoom normalizes units and reverses without drift", () => {
  const pixels = resolvePhotoLightboxWheelScale({ scale: 2, deltaY: -16 });
  assert.equal(resolvePhotoLightboxWheelScale({ scale: 2, deltaY: -1, deltaMode: 1 }), pixels);
  assert.equal(resolvePhotoLightboxWheelScale({ scale: 2, deltaY: -0.02, deltaMode: 2, pageHeight: 800 }), pixels);
  assert.ok(Math.abs(resolvePhotoLightboxWheelScale({ scale: pixels, deltaY: 16 }) - 2) < 1e-12);
  assert.equal(resolvePhotoLightboxWheelScale({ scale: 2, deltaY: -10000 }), 4);
  assert.equal(resolvePhotoLightboxWheelScale({ scale: 2, deltaY: 10000 }), 1);
});

function transformedPoint({ origin, pan, scale, point }) {
  return origin + pan + point * scale;
}

test("photo lightbox pinch keeps an edge point under stationary fingers", () => {
  const originX = 195;
  const startCenterX = 340;
  const focalPointX = startCenterX - originX;
  const pan = resolvePhotoLightboxPinchPan({
    startScale: 1,
    nextScale: 2,
    startCenterX,
    startCenterY: 420,
    centerX: startCenterX,
    centerY: 420,
    originX,
    originY: 420
  });

  assert.equal(pan.x, -145);
  assert.equal(transformedPoint({ origin: originX, pan: pan.x, scale: 2, point: focalPointX }), startCenterX);
});

test("photo lightbox pinch keeps its focal point while zooming and positioning", () => {
  const originX = 195;
  const originY = 420;
  const startScale = 2;
  const startPanX = -80;
  const startPanY = 35;
  const startCenterX = 300;
  const startCenterY = 500;
  const centerX = 320;
  const centerY = 470;
  const focalPointX = (startCenterX - originX - startPanX) / startScale;
  const focalPointY = (startCenterY - originY - startPanY) / startScale;
  const pan = resolvePhotoLightboxPinchPan({
    startScale,
    nextScale: 3,
    startPanX,
    startPanY,
    startCenterX,
    startCenterY,
    centerX,
    centerY,
    originX,
    originY
  });

  assert.equal(transformedPoint({ origin: originX, pan: pan.x, scale: 3, point: focalPointX }), centerX);
  assert.equal(transformedPoint({ origin: originY, pan: pan.y, scale: 3, point: focalPointY }), centerY);
});
