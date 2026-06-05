import test from "node:test";
import assert from "node:assert/strict";
import {
  groupHistoryRecords,
  historySharedTemplateOptions,
  historyRecordKey,
  historyRecordTitle,
  summarizeHistoryPayload
} from "../../src/sync/history.js";
import {
  buildListSaveBody
} from "../../src/sync/save-body.js";
import {
  renderHistoryRecordArticle,
  renderHistoryRecordDetails
} from "../../src/ui/history-diff.js";

function normalizeState(payload) {
  return payload || null;
}

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
    nowIso: () => "2026-06-05T00:00:00.000Z",
    serializeState: () => ({ items: {}, containers: {}, layouts: {} }),
    syncDevice: { id: "device-1", name: "Windows" },
    syncMeta: {}
  });

  assert.equal(body.clientDeviceName, "Windows");
  assert.equal(body.sourceDeviceId, "device-1");
  assert.equal(body.sourceDeviceName, "Windows");
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

test("CRITICAL history: latest record details compare against the previous history record", () => {
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
  const records = [
    { id: 2, listId: "list-2026", listTitle: "Trip 2026", createdAt: "2026-06-04T10:00:00.000Z", payload: latestPayload },
    { id: 1, listId: "list-2026", listTitle: "Trip 2026", createdAt: "2026-06-04T09:00:00.000Z", payload: previousPayload }
  ];

  const html = renderHistoryRecordDetails(records[0], 0, records, {
    activeSource: "private",
    currentComparisonState: () => latestPayload,
    formatDateTime: () => "04.06.2026, 10:00",
    recordState: (item) => normalizeState(item.payload),
    recordTitle: historyRecordTitle,
    summarizePayload: summarizeHistoryPayload
  });

  assert.match(html, /Изменения относительно предыдущей версии/);
  assert.match(html, /Pump/);
  assert.doesNotMatch(html, /Trip 2026/);
  assert.doesNotMatch(html, /Отличий не найдено/);
});
