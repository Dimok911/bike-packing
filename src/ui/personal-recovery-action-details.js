import { personalPlacementIntent } from "../sync/personal-placement-mutation.js";
import { buildHistoryStateDiff } from "./history-diff.js";

const plain = value => value && typeof value === "object" && !Array.isArray(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const text = value => typeof value === "string" ? value.trim() : "";
const short = value => text(value).length > 240 ? `${text(value).slice(0, 239)}…` : text(value);
const translate = language => (en, ru) => language === "en" ? en : ru;
const placementTitles = {
  "link-root": ["Add an existing bag to the layout", "Добавить существующую сумку в укладку"],
  "link-container": ["Place an existing bag inside another bag", "Разместить существующую сумку внутри другой сумки"],
  "link-item": ["Add an existing item to the layout", "Добавить существующую вещь в укладку"],
  "remove-item": ["Remove an item from the layout", "Убрать вещь из укладки"],
  "remove-container": ["Remove a bag from the layout", "Убрать сумку из укладки"],
  "move-item": ["Move an item within the layout", "Переместить вещь в укладке"],
  "move-container": ["Move a bag within the layout", "Переместить сумку в укладке"],
  "move-root": ["Change the order of bag columns", "Изменить порядок колонок сумок"],
  "group-items": ["Group items", "Объединить вещи в группу"],
  "replace-item": ["Replace an item in the layout", "Заменить вещь в укладке"],
  "replace-container": ["Replace a bag in the layout", "Заменить сумку в укладке"],
  "lift-container": ["Move a nested bag to its own column", "Вынести вложенную сумку в отдельную колонку"]
};

// Only a saved boundary or the exact direct causal predecessor can describe
// what this record changed. A current server/editor snapshot is never input.
function savedBase(record, byId) {
  const action = record?.action, body = action?.body;
  if (!revision(body?.baseStateRevision)) return null;
  if (record.mergeBase?.stateRevision === body.baseStateRevision && plain(record.mergeBase.payload)) return record.mergeBase.payload;
  const parentId = body.causal?.baseOperationId, parent = byId.get(parentId), previous = parent?.action;
  if (!parentId || !previous || previous.kind !== "list.update" || parent.photoState
    || !["environment", "actorId", "scopeKey", "listId"].every(key => typeof action[key] === "string" && action[key] && previous[key] === action[key])
    || !Number.isSafeInteger(action.generation) || previous.generation !== action.generation - 1
    || previous.body?.baseStateRevision !== body.baseStateRevision || !plain(previous.body.payload)
    || !body.causal.dependsOn?.some(dependency => dependency.operationId === parentId && dependency.listId === action.listId)) return null;
  return previous.body.payload;
}

function bounded(lines, t) {
  const visible = lines.slice(0, 5).map(short);
  if (lines.length > visible.length) visible.push(t(`More details omitted: ${lines.length - visible.length}.`, `Ещё подробностей не показано: ${lines.length - visible.length}.`));
  return visible;
}

function describePlacement(intent, payload, base, t) {
  const name = (collection, id) => short(payload?.[collection]?.[id]?.name) || short(base?.[collection]?.[id]?.name) || short(id);
  const isBag = ["link-root", "link-container", "remove-container", "move-container", "move-root", "replace-container", "lift-container"].includes(intent.action);
  const collection = isBag ? "containers" : "items";
  const lines = [t(`Layout: ${name("layouts", intent.layoutId)}`, `Укладка: ${name("layouts", intent.layoutId)}`)];
  for (const id of intent.ids) lines.push(`${isBag ? t("Bag", "Сумка") : t("Item", "Вещь")}: ${name(collection, id)}`);
  if (intent.targetContainerId) lines.push(t(`Destination bag: ${name("containers", intent.targetContainerId)}`, `Сумка назначения: ${name("containers", intent.targetContainerId)}`));
  if (intent.replacementId) lines.push(t(`Replacement: ${name(collection, intent.replacementId)}`, `Замена: ${name(collection, intent.replacementId)}`));
  if (intent.groupId) lines.push(t(`Group: ${name("containers", intent.groupId)}`, `Группа: ${name("containers", intent.groupId)}`));
  if (intent.action === "link-root") lines.push(intent.includeContents ? t("With its contents", "С содержимым") : t("Without its contents", "Без содержимого"));
  for (const id of intent.deletedContainerIds) lines.push(t(`Also delete the unused container: ${name("containers", id)}`, `Также удалить неиспользуемый контейнер: ${name("containers", id)}`));
  const title = intent.action === "set-packed"
    ? intent.packed ? t("Mark items as packed", "Отметить вещи собранными") : t("Mark items as not packed", "Отметить вещи несобранными")
    : t(...placementTitles[intent.action]);
  return { title, lines: bounded(lines, t), detailUnavailable: false };
}

function describeDiff(base, payload, t) {
  // History's pure comparison returns text. Do not use its HTML renderers or
  // infer a copy action from similarities between added and existing layouts.
  const diff = buildHistoryStateDiff(structuredClone(base), structuredClone(payload), { localText: t });
  const lines = [];
  for (const [collection, label] of [["items", t("Item", "Вещь")], ["containers", t("Bag", "Сумка")],
    ["layouts", t("Layout", "Укладка")], ["packed", t("Packing mark", "Отметка сборки")], ["settings", t("Setting", "Настройка")]]) {
    for (const operation of ["added", "removed", "changed"]) for (const row of diff[collection][operation]) {
      const entity = `${label}: ${row.title}`;
      if (operation === "added") lines.push(t(`Record added — ${entity}`, `Добавлена запись — ${entity}`));
      else if (operation === "removed") lines.push(t(`Record removed — ${entity}`, `Удалена запись — ${entity}`));
      else for (const detail of row.details) lines.push(`${entity} — ${detail}`);
    }
  }
  return lines.length ? { title: t("Saved layout changes", "Сохранённые изменения укладки"), lines: bounded(lines, t), detailUnavailable: false } : null;
}

export function describePersonalRecoveryActions(records, { language = "ru", confirmedOperationIds = [] } = {}) {
  const t = translate(language), rows = Array.isArray(records) ? records : [], byId = new Map();
  const confirmed = new Set(Array.isArray(confirmedOperationIds) ? confirmedOperationIds.filter(id => typeof id === "string" && id) : []);
  for (const record of rows) {
    const id = record?.action?.operationId;
    if (id) byId.set(id, byId.has(id) ? null : record);
  }
  // Validated applied IDs affect display only. Keep confirmed predecessors in
  // byId so pending records can still describe their exact saved local change.
  return rows.filter(record => !confirmed.has(record?.action?.operationId)).map(record => {
    const operationId = text(record?.action?.operationId);
    const unavailable = { operationId, title: t("Saved layout change", "Сохранённое изменение укладки"),
      lines: [t("Detailed description is not available in this record.", "Подробное описание в этой записи отсутствует.")], detailUnavailable: true };
    if (record?.action?.kind !== "list.update" || !plain(record.action.body?.payload)) return unavailable;
    const body = record.action.body, base = savedBase(record, byId);
    try {
      if (Object.hasOwn(body, "userPlacement")) return { operationId, ...describePlacement(personalPlacementIntent(body.userPlacement), body.payload, base, t) };
      return base ? { operationId, ...(describeDiff(base, body.payload, t) || unavailable) } : unavailable;
    } catch { return unavailable; }
  });
}

export function explainPersonalRecoveryReason(failure, { language = "ru" } = {}) {
  const t = translate(language), reason = failure?.reason || failure?.code;
  if (reason === "missing-base") return t("The saved original version needed to compare these changes is unavailable. The changes remain on this device.",
    "Нет сохранённой исходной версии, необходимой для сравнения этих изменений. Изменения остались на устройстве.");
  if (reason === "photo-inventory") return t("The photo references could not be safely reconciled. This does not establish that you edited the photos.",
    "Не удалось безопасно сверить ссылки на фотографии. Это не означает, что вы меняли сами фотографии.");
  if (reason === "ordinary-rebase-loss") return t("Combining these versions would remove records or placements. That removal needs a separate check.",
    "При объединении версий удаляются записи или размещения. Такой перенос удаления требует отдельной проверки.");
  if (failure?.hasConflicts === true) return t("The same data was changed differently. A choice between the versions is needed.",
    "Одни и те же данные изменены по-разному. Требуется выбор между версиями.");
  return t("The save is not yet confirmed. The available information does not establish why recovery paused; the changes remain on this device.",
    "Сохранение ещё не подтверждено. По имеющимся данным точная причина паузы не определена; изменения остались на устройстве.");
}
