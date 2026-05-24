export const BIKE_GEOMETRY_M = Object.freeze({
  size: "M",
  bikeSizeCm: 54,
  seatTubeCenterToTop: 510,
  seatTubeEffective: 540,
  topTubeEffective: 545,
  headTubeLength: 140,
  seatTubeAngleDeg: 73,
  headTubeAngleDeg: 71,
  chainstayLength: 450,
  wheelbase: 1048,
  bottomBracketDrop: 78,
  forkOffset: 52,
  trail: 62,
  stack: 582,
  reach: 367,
  stem: 100,
  handlebarWidth: 420,
  crank: 170,
  wheelSize: 700,
  seatPostDiameter: 27.2
});

export const BIKE_GEOMETRY_SCENE_SCALE = 0.0044;

function degreesToRadians(value) {
  return (Number(value) || 0) * Math.PI / 180;
}

function point(x = 0, y = 0) {
  return { x, y };
}

function add(a, b) {
  return point(a.x + b.x, a.y + b.y);
}

function multiply(vector, scalar) {
  return point(vector.x * scalar, vector.y * scalar);
}

function unitFromAngle(degrees) {
  const angle = degreesToRadians(degrees);
  return point(Math.cos(angle), Math.sin(angle));
}

function scenePoint(source, { anchor, scale = BIKE_GEOMETRY_SCENE_SCALE }, z = 0) {
  return {
    x: (source.x - anchor.x) * scale,
    y: (source.y - anchor.y) * scale,
    z
  };
}

export function bikeGeometryFrame(geometry = BIKE_GEOMETRY_M, options = {}) {
  const scale = Number(options.scale) || BIKE_GEOMETRY_SCENE_SCALE;
  const wheelRadius = Number(geometry.wheelSize) / 2;
  const bottomBracketDrop = Number(geometry.bottomBracketDrop) || 0;
  const chainstayLength = Number(geometry.chainstayLength) || 0;
  const wheelbase = Number(geometry.wheelbase) || 0;
  const bottomBracketForward = Math.sqrt(Math.max(0, chainstayLength ** 2 - bottomBracketDrop ** 2));
  const rearAxle = point(0, wheelRadius);
  const frontAxle = point(wheelbase, wheelRadius);
  const anchor = point(rearAxle.x - wheelRadius, 0);
  const rotationCenter = point((rearAxle.x + frontAxle.x) / 2, (rearAxle.y + frontAxle.y) / 2);
  const bottomBracket = point(bottomBracketForward, wheelRadius - bottomBracketDrop);
  const headTop = point(
    bottomBracket.x + (Number(geometry.reach) || 0),
    bottomBracket.y + (Number(geometry.stack) || 0)
  );
  const seatTubeDirection = unitFromAngle(180 - (Number(geometry.seatTubeAngleDeg) || 73));
  const headTubeDirection = unitFromAngle(180 - (Number(geometry.headTubeAngleDeg) || 71));
  const seatTop = add(bottomBracket, multiply(seatTubeDirection, Number(geometry.seatTubeCenterToTop) || 0));
  const headBottom = add(headTop, multiply(headTubeDirection, -(Number(geometry.headTubeLength) || 0)));
  const seatPostTop = add(seatTop, multiply(seatTubeDirection, 155));
  const stemDirection = unitFromAngle(8);
  const stemEnd = add(headTop, multiply(stemDirection, Number(geometry.stem) || 0));
  const saddleCenter = add(seatPostTop, point(-80, 18));
  const handlebarCenter = add(stemEnd, point(18, -28));

  const context = { anchor, scale };
  return {
    geometry,
    scale,
    anchor: scenePoint(anchor, context),
    dimensions: {
      wheelRadius: wheelRadius * scale,
      tireRadius: 28 * scale,
      rimRadius: Math.max(0, (wheelRadius - 78) * scale),
      handlebarWidth: (Number(geometry.handlebarWidth) || 420) * scale,
      saddleLength: 265 * scale,
      saddleWidth: 145 * scale,
      tubeRadius: 17 * scale,
      slimTubeRadius: 13 * scale,
      seatPostRadius: ((Number(geometry.seatPostDiameter) || 27.2) / 2) * scale
    },
    points: {
      rearAxle: scenePoint(rearAxle, context),
      frontAxle: scenePoint(frontAxle, context),
      rotationCenter: scenePoint(rotationCenter, context),
      bottomBracket: scenePoint(bottomBracket, context),
      seatTop: scenePoint(seatTop, context),
      headTop: scenePoint(headTop, context),
      headBottom: scenePoint(headBottom, context),
      seatPostTop: scenePoint(seatPostTop, context),
      stemEnd: scenePoint(stemEnd, context),
      saddleCenter: scenePoint(saddleCenter, context),
      handlebarCenter: scenePoint(handlebarCenter, context)
    }
  };
}
