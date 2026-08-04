import test from "node:test";
import assert from "node:assert/strict";

import { resolvePhotoLightboxPinchPan } from "../../src/ui/photo-lightbox-zoom.js";

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
