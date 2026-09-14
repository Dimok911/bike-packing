import { personalBusinessPayload } from "../sync/personal-business-payload.js";

const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const json = (value, depth = 0) => {
  if (depth > 100) return false;
  if (value === null || ["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if ((!plain(value) && !Array.isArray(value)) || Object.getOwnPropertySymbols(value).length) return false;
  return Array.isArray(value)
    ? Object.keys(value).length === value.length && Array.from(value).every(entry => json(entry, depth + 1))
    : Object.values(value).every(entry => json(entry, depth + 1));
};
const canonical = value => JSON.stringify(value, (_key, entry) => plain(entry)
  ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
const same = (left, right) => canonical(left) === canonical(right);
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const short = value => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 240) : "";
const own = (value, key) => Object.hasOwn(value, key);
const layoutMetadata = ["updatedAt", "updatedByDeviceId", "updatedByDeviceName"];
const metadata = value => Object.fromEntries(Object.entries(value).filter(([key]) => layoutMetadata.includes(key)));
const emptyRootNode = { parentId: "", itemIds: [], childIds: [], order: [] };
function arrangementResidual(arrangement, exclusiveRoots) {
  const result = without(arrangement, ["rootContainerIds"]);
  // A separately displayed empty root has no further contents to describe.
  // Any missing/extra field, nesting or content remains in the comparison.
  result.containers = Object.fromEntries(Object.entries(arrangement.containers).filter(([id, node]) =>
    !exclusiveRoots.has(id) || !same(node, emptyRootNode)));
  return result;
}
function layoutResidual(layout) {
  const ignored = ["arrangement", ...layoutMetadata];
  if (same(layout.rootContainerIds, layout.arrangement.rootContainerIds)) ignored.push("rootContainerIds");
  return without(layout, ignored);
}

// This is a two-snapshot display, never an action history, merge base, receipt
// or permission to replay a save. The caller supplies the saved payload and a
// freshly verified owned server payload, never the current editor state.
export function describePersonalRecoveryVersionComparison(input, options) {
  // A malformed historical record must not prevent the recovery choices from
  // opening. Never turn failed formatting into an equality claim.
  try { return describeComparison(input, options); }
  catch { return { available: false, lines: [], omittedCount: 0 }; }
}

function describeComparison({ local, remote, serverRevision } = {}, { language = "ru" } = {}) {
  const unavailable = { available: false, lines: [], omittedCount: 0 };
  if (!Number.isSafeInteger(serverRevision) || serverRevision <= 0) return unavailable;
  let saved, server;
  try {
    if (![local, remote].every(value => json(value))) return unavailable;
    [saved, server] = [local, remote].map(personalBusinessPayload);
    for (const payload of [saved, server]) for (const layout of Object.values(payload.layouts)) {
      const roots = layout.arrangement.rootContainerIds;
      if (roots.some(id => typeof id !== "string" || !own(payload.containers, id)) || new Set(roots).size !== roots.length) return unavailable;
    }
  } catch { return unavailable; }
  const t = (en, ru) => language === "en" ? en : ru;
  const lines = [];
  let count = 0;
  const add = line => { count++; if (lines.length < 8) lines.push(line); };
  const names = new Map();
  for (const collection of ["items", "containers", "layouts"]) {
    const index = new Map();
    for (const payload of [saved, server]) for (const [id, record] of Object.entries(payload[collection])) {
      const name = short(record.name) || short(id);
      if (!index.has(name)) index.set(name, new Set());
      index.get(name).add(id);
    }
    names.set(collection, index);
  }
  const label = (payload, collection, id) => {
    const name = short(payload[collection][id]?.name) || short(id);
    const ambiguous = names.get(collection).get(name)?.size > 1;
    return ambiguous ? `${name} [${short(id)}]` : name;
  };
  // Show placement differences before less immediately useful record details.
  for (const [id, left] of Object.entries(saved.layouts)) {
    if (!own(server.layouts, id)) continue;
    const right = server.layouts[id], layout = label(server, "layouts", id);
    const localRoots = left.arrangement.rootContainerIds, remoteRoots = right.arrangement.rootContainerIds;
    const localSet = new Set(localRoots), remoteSet = new Set(remoteRoots);
    for (const bag of remoteRoots.filter(bag => !localSet.has(bag))) add(t(
      `Layout «${layout}»: separate column only in the server version — ${label(server, "containers", bag)}.`,
      `Укладка «${layout}»: отдельная колонка только в серверной версии — ${label(server, "containers", bag)}.`));
    for (const bag of localRoots.filter(bag => !remoteSet.has(bag))) add(t(
      `Layout «${layout}»: separate column only in the saved copy — ${label(saved, "containers", bag)}.`,
      `Укладка «${layout}»: отдельная колонка только в сохранённой копии — ${label(saved, "containers", bag)}.`));
    if (!same(localRoots.filter(bag => remoteSet.has(bag)), remoteRoots.filter(bag => localSet.has(bag)))) add(t(
      `Layout «${layout}»: the order of shared bag columns differs.`, `Укладка «${layout}»: различается порядок общих колонок сумок.`));
    if (!same(arrangementResidual(left.arrangement, new Set(localRoots.filter(bag => !remoteSet.has(bag)))),
      arrangementResidual(right.arrangement, new Set(remoteRoots.filter(bag => !localSet.has(bag)))))) add(t(
      `Layout «${layout}»: placements, contents or packing marks also differ.`, `Укладка «${layout}»: также различаются размещения, содержимое или отметки сборки.`));
    if (!same(layoutResidual(left), layoutResidual(right))) add(t(
      `Layout «${layout}»: other layout data differs.`, `Укладка «${layout}»: различаются другие данные укладки.`));
    if (!same(metadata(left), metadata(right))) add(t(
      `Layout «${layout}»: the last modification time or device differs.`, `Укладка «${layout}»: различается время или устройство последнего изменения.`));
  }
  for (const [collection, noun] of [["layouts", t("Layout", "Укладка")], ["containers", t("Bag", "Сумка")], ["items", t("Item", "Вещь")]]) {
    for (const id of Object.keys(saved[collection])) if (!own(server[collection], id)) add(t(
      `${noun} «${label(saved, collection, id)}»: record only in the saved copy.`, `${noun} «${label(saved, collection, id)}»: запись только в сохранённой копии.`));
    for (const [id, right] of Object.entries(server[collection])) {
      const title = `${noun} «${label(server, collection, id)}»`;
      if (!own(saved[collection], id)) { add(t(`${title}: record only in the server version.`, `${title}: запись только в серверной версии.`)); continue; }
      if (collection === "layouts") continue;
      const left = saved[collection][id];
      if (!same(left.photos, right.photos)) add(t(`${title}: photo references differ.`, `${title}: различаются ссылки на фотографии.`));
      if (!same(without(left, ["photos"]), without(right, ["photos"]))) add(t(`${title}: other record data differs.`, `${title}: различаются другие данные записи.`));
    }
  }
  if (!same(without(saved, ["items", "containers", "layouts"]), without(server, ["items", "containers", "layouts"]))) add(t(
    "Other data or settings differ between the saved copy and the server version.", "В сохранённой копии и серверной версии различаются другие данные или настройки."));
  if (!count) add(t("No business-data differences found; display settings and mirrors are excluded. This does not confirm the save.",
    "Отличий в основных данных не найдено; настройки отображения и их копии не сравниваются. Это не подтверждает сохранение."));
  return { available: true, lines, omittedCount: count - lines.length };
}
