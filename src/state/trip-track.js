export const MAX_GPX_BYTES = 20 * 1024 * 1024;
export const MAX_TRACK_POINTS = 6000;
const MAX_SEGMENTS = 100;
const validPoint = point => Array.isArray(point) && point.length === 2 && point.every(value => typeof value === "number" && Number.isFinite(value)) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;

export function normalizeTrackStartedAt(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return "";
  const time = Date.parse(value);
  const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(time) || !Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10)) return "";
  return new Date(time).toISOString();
}

export function normalizeTripTrack(value) {
  if (!value || !Array.isArray(value.segments) || !value.segments.length || value.segments.length > MAX_SEGMENTS) return null;
  let count = 0;
  const segments = [];
  for (const segment of value.segments) {
    if (!Array.isArray(segment) || segment.length < 2 || (count += segment.length) > MAX_TRACK_POINTS || !segment.every(validPoint)) return null;
    segments.push(segment.map(point => point.map(coordinate => Number(coordinate.toFixed(6)))));
  }
  const startedAt = normalizeTrackStartedAt(value.startedAt);
  return { ...(startedAt ? { startedAt } : {}), name: String(value.name || "").slice(0, 200), fileName: String(value.fileName || "").slice(0, 200), segments };
}

// Unwrap longitude at the date line; segments remain separate (no invented joins).
export function projectTrackSegments(segments) {
  const anchor = segments[0]?.[0]?.[1] || 0;
  return segments.map(segment => {
    let previous = anchor;
    return segment.map(([lat, lon]) => {
      while (lon - previous > 180) lon -= 360;
      while (lon - previous < -180) lon += 360;
      previous = lon;
      const latitude = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
      return [lon * Math.PI / 180 * 6378137, Math.log(Math.tan(Math.PI / 4 + latitude / 2)) * 6378137];
    });
  });
}

function simplify(segment, projected, tolerance, budget) {
  const keep = new Set([0, segment.length - 1]);
  const stack = [[0, segment.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const [x, y] = projected[start];
    const dx = projected[end][0] - x, dy = projected[end][1] - y;
    const length = dx * dx + dy * dy;
    let furthest = -1, maximum = tolerance * tolerance;
    for (let i = start + 1; i < end; i++) {
      if (--budget.remaining < 0) throw new Error("complex");
      const [px, py] = projected[i];
      const t = length ? Math.max(0, Math.min(1, ((px - x) * dx + (py - y) * dy) / length)) : 0;
      const distance = (px - x - t * dx) ** 2 + (py - y - t * dy) ** 2;
      if (distance > maximum) { maximum = distance; furthest = i; }
    }
    if (furthest >= 0) { keep.add(furthest); stack.push([start, furthest], [furthest, end]); }
  }
  return [...keep].sort((a, b) => a - b).map(index => segment[index]);
}

export function compactTrackSegments(segments) {
  if (segments.reduce((sum, segment) => sum + segment.length, 0) <= MAX_TRACK_POINTS) return segments;
  const projected = projectTrackSegments(segments);
  let tolerance = 2, result;
  const budget = { remaining: 10000000 };
  do {
    result = segments.map((segment, index) => simplify(segment, projected[index], tolerance, budget));
    tolerance *= 2;
  } while (result.reduce((sum, segment) => sum + segment.length, 0) > MAX_TRACK_POINTS);
  return result;
}

export function parseTripGpx(text, fileName = "", Parser = globalThis.DOMParser) {
  if (typeof text !== "string" || text.length > MAX_GPX_BYTES) throw new Error("size");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("xml");
  const xml = new Parser().parseFromString(text, "application/xml");
  if (xml.getElementsByTagName("parsererror").length || xml.documentElement?.localName !== "gpx") throw new Error("xml");
  const children = (node, name) => [...node.children].filter(child => child.localName === name);
  const tracks = children(xml.documentElement, "trk");
  const routes = children(xml.documentElement, "rte");
  const sources = tracks.flatMap(track => children(track, "trkseg")).map(node => [node, "trkpt"]);
  if (!sources.length) sources.push(...routes.map(node => [node, "rtept"]));
  if (sources.length > MAX_SEGMENTS) throw new Error("complex");
  let count = 0, startedAt = "";
  const segments = sources.map(([node, tag]) => children(node, tag).map(point => {
    if (++count > 200000) throw new Error("complex");
    const latitude = point.getAttribute("lat"), longitude = point.getAttribute("lon");
    if (!latitude?.trim() || !longitude?.trim()) throw new Error("coordinates");
    const result = [Number(latitude), Number(longitude)];
    if (!validPoint(result)) throw new Error("coordinates");
    const recorded = normalizeTrackStartedAt(children(point, "time")[0]?.textContent?.trim());
    if (recorded && (!startedAt || recorded < startedAt)) startedAt = recorded;
    return result;
  })).filter(segment => segment.length >= 2);
  if (!segments.length) throw new Error("empty");
  const name = children(tracks[0] || routes[0] || xml.documentElement, "name")[0]?.textContent || fileName.replace(/\.gpx$/i, "");
  return normalizeTripTrack({ name, fileName, startedAt, segments: compactTrackSegments(segments) });
}
