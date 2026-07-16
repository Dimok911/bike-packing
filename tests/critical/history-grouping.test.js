import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  groupHistoryRecords,
  historySharedTemplateOptions,
  historyRecordKey,
  historyRecordRestoreLayoutIds,
  historyRecordScopeText,
  historyRollbackImpact,
  historyRecordTitle,
  restorableHistoryRecords,
  summarizeHistoryPayload
} from "../../src/sync/history.js";
import { replaceActivePublishedHistoryDraft } from "../../src/public/history-restore-view.js";
import { buildHistoryActionContext } from "../../src/sync/history-action.js";
import { closestEventTarget } from "../../src/ui/long-press-tooltip.js";
import {
  buildListSaveBody
} from "../../src/sync/save-body.js";
import {
  hasHistoryStateChanges,
  buildHistoryStateDiff,
  historyRecordAction,
  renderHistoryRecordArticle,
  renderHistoryRecordDetails,
  historyUndoConfirmation,
  syncHistoryActionButtonTooltips
} from "../../src/ui/history-diff.js";

function normalizeState(payload) {
  return payload || null;
}

test("CRITICAL history: a single history row keeps its content height", () => {
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const historyListRule = styles.match(/\.history-list\s*\{([^}]*)\}/)?.[1] || "";
  assert.match(historyListRule, /grid-auto-rows:\s*max-content/);
  assert.match(historyListRule, /align-content:\s*start/);
});

test("CRITICAL history: private list titles keep separate layout groups", () => {
  const payload = {
    activeLayoutId: "layout-active",
    layouts: {
      "layout-active": { id: "layout-active", name: "Active layout in payload" }
    },
    containers: {},
    items: {}
  };

  const groups = groupHistoryRecords([
    { id: 1, listId: "list-a", listTitle: "Touring 2025", payload },
    { id: 2, listId: "list-b", listTitle: "Touring 2026", payload }
  ], {
    normalizeRemoteState: normalizeState
  });

  assert.deepEqual(groups.map((group) => group.title).sort(), ["Touring 2025", "Touring 2026"]);
});

test("CRITICAL history: private record summary uses list title instead of stale payload layout title", () => {
  const payload = {
    activeLayoutId: "layout-active",
    layouts: {
      "layout-active": { id: "layout-active", name: "Stale payload title" }
    },
    containers: {
      "container-1": { id: "container-1", name: "Bag" }
    },
    items: {
      "item-1": { id: "item-1", name: "Item" }
    }
  };

  const summary = summarizeHistoryPayload(payload, {
    record: { id: 1, listId: "list-a", listTitle: "Current list title" },
    source: "private"
  });

  assert.match(summary, /Current list title/);
  assert.doesNotMatch(summary, /Stale payload title/);
});

test("CRITICAL history: private list row hides layout titles to avoid nested layout confusion", () => {
  const payload = {
    activeLayoutId: "layout-active",
    layouts: {
      "layout-active": { id: "layout-active", name: "Полная компоновка_2025" }
    },
    containers: {
      "container-1": { id: "container-1", name: "Сумка" }
    },
    items: {
      "item-1": { id: "item-1", name: "Вещь" }
    }
  };
  const record = {
    id: 1,
    listId: "list-2026",
    listTitle: "Полная компоновка 2026",
    createdAt: "2026-06-04T09:00:00.000Z",
    sourceDeviceName: "Телефон",
    payload
  };

  const html = renderHistoryRecordArticle(record, 0, [record], {
    activeSource: "private",
    formatDateTime: () => "04.06.2026, 09:00",
    recordKey: historyRecordKey,
    recordState: (item) => normalizeState(item.payload),
    recordTitle: historyRecordTitle,
    showTitle: false,
    summarizePayload: summarizeHistoryPayload
  });

  assert.doesNotMatch(html, /Полная компоновка 2026/);
  assert.doesNotMatch(html, /Полная компоновка_2025/);
  assert.doesNotMatch(html, /1 вещей/);
  assert.doesNotMatch(html, /1 контейнеров/);
  assert.match(html, /04\.06\.2026, 09:00/);
  assert.match(html, /Телефон/);
});

test("CRITICAL history: shared template options keep separate language targets", () => {
  const options = historySharedTemplateOptions([
    { id: "bikepacking-reference-bags", name: "Tristan Ridley Список снаряжения", language: "ru" },
    { id: "bikepacking-reference-bags-en", name: "Tristan Ridley Gear List", language: "en" }
  ], {
    languageLabel: (language) => language.toUpperCase()
  });

  assert.deepEqual(options.map((option) => option.id), [
    "bikepacking-reference-bags",
    "bikepacking-reference-bags-en"
  ]);
  assert.deepEqual(options.map((option) => option.label), [
    "Tristan Ridley Список снаряжения · RU",
    "Tristan Ridley Gear List · EN"
  ]);
});

test("CRITICAL history: list save body sends source device fields for history rows", () => {
  const body = buildListSaveBody({
    historyAction: {
      changeGroupId: "device-1:2026-06-05T00:00:00.000Z",
      affectedLayoutIds: ["layout-a"],
      changeScope: "layout"
    },
    nowIso: () => "2026-06-05T00:00:00.000Z",
    serializeState: () => ({ items: {}, containers: {}, layouts: {} }),
    syncDevice: { id: "device-1", name: "Windows" },
    syncMeta: {}
  });

  assert.equal(body.clientDeviceName, "Windows");
  assert.equal(body.sourceDeviceId, "device-1");
  assert.equal(body.sourceDeviceName, "Windows");
  assert.equal(body.changeGroupId, "device-1:2026-06-05T00:00:00.000Z");
  assert.deepEqual(body.affectedLayoutIds, ["layout-a"]);
  assert.equal(body.changeScope, "layout");
});

test("CRITICAL history: one action identifies every layout affected by changed entities", () => {
  const beforeState = {
    layouts: {
      a: { id: "a", itemIds: ["item-a"] },
      b: { id: "b", itemIds: ["item-b"] }
    },
    items: {
      "item-a": { id: "item-a", name: "Pump" },
      "item-b": { id: "item-b", name: "Tent" }
    },
    containers: {}
  };
  const afterState = structuredClone(beforeState);
  afterState.items["item-a"].name = "Mini pump";

  const context = buildHistoryActionContext({
    beforeState,
    afterState,
    changedAt: "2026-07-16T10:00:00.000Z",
    deviceId: "browser",
    getLayoutContainerIds: () => new Set(),
    getLayoutItemIds: (_state, layout) => new Set(layout?.itemIds || [])
  });

  assert.deepEqual(context, {
    changeGroupId: "browser:2026-07-16T10:00:00.000Z",
    affectedLayoutIds: ["a"],
    changeScope: "global"
  });
});

test("CRITICAL sync-save: forced list save keeps the current base revision for conflict retry", () => {
  const body = buildListSaveBody({
    forceOverwrite: true,
    nowIso: () => "2026-07-16T18:10:00.000Z",
    serializeState: () => ({ layouts: {} }),
    syncDevice: { id: "device-1", name: "Browser" },
    syncMeta: {
      localUpdatedAt: "2026-07-16T18:09:00.000Z",
      stateRevision: 17
    }
  });

  assert.equal(body.forceOverwrite, true);
  assert.equal(body.fullReplace, true);
  assert.equal(body.baseStateRevision, 17);
  assert.equal(body.stateRevision, 17);
});

test("CRITICAL history: missing device is omitted instead of rendered as a noisy placeholder", () => {
  const record = {
    id: 1,
    listId: "list-2026",
    listTitle: "Полная компоновка 2026",
    createdAt: "2026-06-04T09:00:00.000Z",
    payload: {
      activeLayoutId: "layout-active",
      layouts: {
        "layout-active": { id: "layout-active", name: "Полная компоновка_2025" }
      },
      containers: {},
      items: {}
    }
  };

  const html = renderHistoryRecordArticle(record, 0, [record], {
    activeSource: "private",
    formatDateTime: () => "04.06.2026, 09:00",
    recordKey: historyRecordKey,
    recordState: (item) => normalizeState(item.payload),
    recordTitle: historyRecordTitle,
    showTitle: false,
    summarizePayload: summarizeHistoryPayload
  });

  assert.doesNotMatch(html, /устройство не указано/);
  assert.match(html, /04\.06\.2026, 09:00/);
});

test("CRITICAL history: record details describe the action forward from its previous version", () => {
  const previousPayload = {
    activeLayoutId: "layout-active",
    layouts: {
      "layout-active": { id: "layout-active", name: "Trip 2026" }
    },
    containers: {},
    items: {}
  };
  const latestPayload = {
    activeLayoutId: "layout-active",
    layouts: {
      "layout-active": { id: "layout-active", name: "Trip 2026" }
    },
    containers: {},
    items: {
      "item-1": { id: "item-1", name: "Pump" }
    }
  };
  const currentPayload = {
    ...latestPayload,
    items: {
      ...latestPayload.items,
      "item-2": { id: "item-2", name: "Tent" }
    }
  };
  const records = [
    { id: 2, listId: "list-2026", listTitle: "Trip 2026", createdAt: "2026-06-04T10:00:00.000Z", payload: latestPayload },
    { id: 1, listId: "list-2026", listTitle: "Trip 2026", createdAt: "2026-06-04T09:00:00.000Z", payload: previousPayload }
  ];

  const html = renderHistoryRecordDetails(records[1], 1, records, {
    activeSource: "private",
    currentComparisonState: () => currentPayload,
    formatDateTime: () => "04.06.2026, 10:00",
    recordState: (item) => normalizeState(item.payload),
    recordTitle: historyRecordTitle,
    restoreComparisonTitle: "Changes in this undo step",
    summarizePayload: summarizeHistoryPayload
  });

  assert.match(html, /Changes in this undo step/);
  assert.match(html, /Pump/);
  assert.doesNotMatch(html, /Tent/);
  assert.match(html, /history-diff-group added/);
  assert.doesNotMatch(html, /Trip 2026/);
  assert.doesNotMatch(html, /Отличий не найдено/);

  const latestStepHtml = renderHistoryRecordDetails(records[0], 0, records, {
    activeSource: "private",
    currentComparisonState: () => currentPayload,
    recordState: (item) => normalizeState(item.payload),
    restoreComparisonTitle: "Changes in this undo step",
    summarizePayload: summarizeHistoryPayload
  });
  assert.match(latestStepHtml, /Tent/);
  assert.doesNotMatch(latestStepHtml, /Pump/);
});

test("CRITICAL history: current-state snapshots are not offered as restore targets", () => {
  const previousPayload = { items: { old: { id: "old" } }, containers: {}, layouts: {} };
  const currentPayload = { items: { current: { id: "current" } }, containers: {}, layouts: {} };
  const records = restorableHistoryRecords([
    { id: 2, createdAt: "2026-07-16T10:00:00.000Z", payload: currentPayload },
    { id: 1, createdAt: "2026-07-16T09:00:00.000Z", payload: previousPayload }
  ], currentPayload, {
    recordState: (record) => record.payload
  });

  assert.deepEqual(records.map((record) => record.id), [1]);
});

test("CRITICAL history: service-only newest snapshot is hidden and exposes the real undo action", () => {
  const beforeAddition = {
    items: {},
    containers: {},
    layouts: { layout: { id: "layout", name: "Trip" } }
  };
  const currentPayload = {
    items: {
      power: { id: "power", name: "Блок питания 65 W", updatedAt: "2026-07-16T21:34:00.000Z" }
    },
    containers: {},
    layouts: { layout: { id: "layout", name: "Trip" } }
  };
  const serviceOnlySnapshot = structuredClone(currentPayload);
  serviceOnlySnapshot.items.power.updatedAt = "2026-07-16T21:33:00.000Z";
  assert.equal(hasHistoryStateChanges(serviceOnlySnapshot, currentPayload), false);

  const records = restorableHistoryRecords([
    { id: 2, snapshotKind: "undo", payload: serviceOnlySnapshot, createdAt: "2026-07-16T21:34:00.000Z" },
    { id: 1, snapshotKind: "undo", payload: beforeAddition, createdAt: "2026-07-16T21:32:00.000Z" }
  ], currentPayload, {
    recordState: (record) => record.payload,
    statesDiffer: hasHistoryStateChanges
  });

  assert.deepEqual(records.map((record) => record.id), [1]);
  assert.deepEqual(historyRecordAction(records[0], 0, records, {
    currentComparisonState: () => currentPayload,
    recordState: (record) => record.payload
  }), {
    entityType: "items",
    operation: "added",
    count: 1,
    title: "Блок питания 65 W"
  });
  const html = renderHistoryRecordArticle(records[0], 0, records, {
    activeSource: "private",
    recordState: (record) => record.payload,
    restoreTextForRecord: () => "Отменить добавление «Блок питания 65 W»"
  });
  assert.match(html, /Отменить добавление «Блок питания 65 W»/);
});

test("CRITICAL history: public-copy provenance is hidden from user-facing changes", () => {
  const previousState = {
    items: {
      gas: {
        id: "gas",
        name: "Газовый баллон",
        weight: 100,
        sharedSourceId: "admin-demo-item-gas",
        _publicCopySourceId: "admin-demo-item-gas",
        _publicCopySourceKind: "item",
        _publicCopySourceLayoutId: "layout-admin-demo"
      }
    },
    containers: {},
    layouts: {}
  };
  const provenanceCleanedState = {
    items: { gas: { id: "gas", name: "Газовый баллон", weight: 100 } },
    containers: {},
    layouts: {}
  };
  assert.equal(hasHistoryStateChanges(previousState, provenanceCleanedState), false);

  const userChangedState = structuredClone(provenanceCleanedState);
  userChangedState.items.gas.weight = 120;
  const diff = buildHistoryStateDiff(previousState, userChangedState);
  assert.equal(diff.items.changed.length, 1);
  assert.deepEqual(diff.items.changed[0].details, ["Вес: 100 g → 120 g"]);
  assert.doesNotMatch(JSON.stringify(diff), /sharedSourceId|publicCopySource/);
});

test("CRITICAL history: detail modal content follows the selected interface language", () => {
  const previousState = {
    items: { gas: { id: "gas", name: "Gas canister", weight: 100 } },
    containers: {},
    layouts: {}
  };
  const currentState = {
    items: { gas: { id: "gas", name: "Gas canister", weight: 120 } },
    containers: {},
    layouts: {}
  };
  const record = {
    id: 1,
    createdAt: "2026-05-26T01:18:00.000Z",
    payload: previousState
  };
  const english = (en) => en;
  const detailsHtml = renderHistoryRecordDetails(record, 0, [record], {
    activeSource: "private",
    currentComparisonState: () => currentState,
    formatDateTime: () => "5/26/2026, 1:18 AM",
    localText: english,
    recordState: (item) => item.payload,
    restoreComparisonTitle: "What changed compared with the previous version",
    summarizePayload: summarizeHistoryPayload
  });
  assert.match(detailsHtml, /1 items · 0 containers/);
  assert.match(detailsHtml, /Items/);
  assert.match(detailsHtml, /Changed: 1/);
  assert.match(detailsHtml, /Weight: 100 g → 120 g/);
  assert.doesNotMatch(detailsHtml, /Вещи|Изменено|Вес|контейнеров/);

  const rowHtml = renderHistoryRecordArticle(record, 0, [record], {
    localText: english,
    recordState: (item) => item.payload,
    restoreTextForRecord: () => "Undo action"
  });
  assert.match(rowHtml, />Details<\/button>/);
  assert.doesNotMatch(rowHtml, /Детали/);
});

test("CRITICAL history: detailed actions lead into older daily checkpoints without duplicate days", () => {
  const records = restorableHistoryRecords([
    { id: 5, listId: "list-1", snapshotKind: "undo", createdAt: "2026-07-16T10:00:00.000Z", payload: { step: 5 } },
    { id: 4, listId: "list-1", snapshotKind: "daily", snapshotDay: "2026-07-16", createdAt: "2026-07-16T09:00:00.000Z", payload: { step: 4 } },
    { id: 3, listId: "list-1", snapshotKind: "undo", createdAt: "2026-07-15T23:00:00.000Z", payload: { step: 3 } },
    { id: 2, listId: "list-1", snapshotKind: "daily", snapshotDay: "2026-07-15", createdAt: "2026-07-15T22:00:00.000Z", payload: { step: 2 } },
    { id: 1, listId: "list-1", snapshotKind: "daily", snapshotDay: "2026-07-14", createdAt: "2026-07-14T22:00:00.000Z", payload: { step: 1 } }
  ], null, { recordState: (record) => record.payload });

  assert.deepEqual(records.map((record) => record.id), [5, 3, 1]);
});

test("CRITICAL history: only a single-layout action requests an independent layout restore", () => {
  const layoutRecord = {
    snapshotKind: "undo",
    changeScope: "layout",
    affectedLayoutIds: ["layout-a"]
  };
  assert.deepEqual(historyRecordRestoreLayoutIds(layoutRecord), ["layout-a"]);
  assert.deepEqual(historyRecordRestoreLayoutIds({ ...layoutRecord, changeScope: "global" }), []);
  assert.equal(historyRecordScopeText(layoutRecord, {
    layouts: { "layout-a": { name: "Summer trip" } }
  }, {
    layout: (name) => `Layout: ${name}`
  }), "Layout: Summer trip");
  assert.equal(historyRecordScopeText({ snapshotKind: "daily" }, {}, {
    daily: "Daily checkpoint"
  }), "Daily checkpoint");
});

test("CRITICAL history: deep rollback warns about later actions in the same history stream", () => {
  const records = [
    { id: 5, listId: "list-a", snapshotKind: "undo" },
    { id: 4, listId: "list-b", snapshotKind: "undo" },
    { id: 3, listId: "list-a", snapshotKind: "undo" },
    { id: 2, listId: "list-a", snapshotKind: "undo" }
  ];
  assert.deepEqual(historyRollbackImpact(records[3], 3, records), {
    isDeepRollback: true,
    newerActionCount: 2,
    crossesCheckpoint: false
  });
  const confirmation = historyUndoConfirmation({
    actionText: "Отменить добавление «Фонарь»",
    isDeepRollback: true,
    newerActionCount: 2,
    localText: (_en, ru) => ru
  });
  assert.equal(confirmation.title, "Отменить добавление «Фонарь»");
  assert.match(confirmation.highlightText, /расположенные выше: 2/);
  assert.equal(confirmation.highlightCount, "+2");
  assert.equal(confirmation.tone, "danger");
});

test("CRITICAL history: demo and template rows use undo actions instead of publish-version buttons", () => {
  const record = { id: 1, payload: { items: {}, containers: {}, layouts: {} } };
  const html = renderHistoryRecordArticle(record, 0, [record], {
    activeSource: "shared",
    publishText: "Publish this version",
    recordState: (item) => item.payload,
    restoreTextForRecord: () => "Undo action"
  });
  assert.match(html, /Undo action/);
  assert.doesNotMatch(html, /Publish this version/);
  assert.match(html, /class="ghost history-action-button"/);
  assert.match(html, /data-history-action-button/);
  assert.match(html, /aria-label="Undo action"/);
});

test("CRITICAL history: truncated undo buttons expose their full action on hover and long press", () => {
  const attributes = new Map();
  const button = {
    textContent: "Undo addition of a very long item name",
    scrollWidth: 320,
    clientWidth: 180,
    dataset: {},
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    }
  };
  const root = {
    querySelectorAll: () => [button]
  };

  syncHistoryActionButtonTooltips(root);
  assert.equal(attributes.get("title"), button.textContent);
  assert.equal(attributes.get("aria-label"), button.textContent);
  assert.equal(button.dataset.touchTooltip, button.textContent);

  button.clientWidth = 360;
  syncHistoryActionButtonTooltips(root);
  assert.equal(attributes.has("title"), false);
  assert.equal("touchTooltip" in button.dataset, false);
  assert.equal(attributes.get("aria-label"), button.textContent);
});

test("CRITICAL history: long-press tooltip ignores non-element event targets", () => {
  assert.equal(closestEventTarget({ target: {} }, "[data-touch-tooltip]"), null);
  assert.equal(closestEventTarget({ target: null }, "[data-touch-tooltip]"), null);
  assert.equal(closestEventTarget(null, "[data-touch-tooltip]"), null);

  const matchingTarget = {};
  assert.equal(closestEventTarget({
    target: {
      closest: (selector) => selector === "[data-touch-tooltip]" ? matchingTarget : null
    }
  }, "[data-touch-tooltip]"), matchingTarget);
});

test("CRITICAL history: restoring a published template replaces the active admin draft immediately", () => {
  const state = {
    activeLayoutId: "draft-old",
    layouts: {
      "draft-old": { id: "draft-old", adminSharedSourceId: "shared-one" }
    }
  };
  const calls = [];
  const restoredPayload = { activeLayoutId: "published", layouts: { published: { id: "published" } } };

  const replacement = replaceActivePublishedHistoryDraft({
    activateLayout: (layoutId) => {
      calls.push(`activate:${layoutId}`);
      state.activeLayoutId = layoutId;
    },
    materializeSharedLayout: (sharedId) => {
      calls.push(`materialize:${sharedId}`);
      const layout = { id: "draft-new", adminSharedSourceId: sharedId };
      state.layouts[layout.id] = layout;
      return layout;
    },
    payload: restoredPayload,
    removeLayoutTree: (layoutId) => {
      calls.push(`remove:${layoutId}`);
      delete state.layouts[layoutId];
      return true;
    },
    state,
    target: { type: "shared", sharedId: "shared-one" }
  });

  assert.equal(replacement?.id, "draft-new");
  assert.equal(state.activeLayoutId, "draft-new");
  assert.deepEqual(calls, ["remove:draft-old", "materialize:shared-one", "activate:draft-new"]);
});
