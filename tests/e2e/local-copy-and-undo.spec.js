import { expect, test } from "@playwright/test";
import { createEmptyLayout, createGuestWorkspace, createItemInContainer, createRootContainer, prepareIsolatedRussianGuest, waitForApp } from "./guest-test-helpers.js";

test.beforeEach(async ({ page }) => prepareIsolatedRussianGuest(page));
const selectView = (page, view) => page.locator(`.tab[data-view="${view}"]`).evaluate((tab) => tab.click());

test("history shows a pouch rename without phantom deletions or moves", async ({ page }, testInfo) => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  await page.goto("/");
  await waitForApp(page);
  await page.route("**/__testsrc/**", async route => {
    const relative = new URL(route.request().url()).pathname.split("/__testsrc/")[1];
    if (!relative.startsWith("src/") || relative.includes("..")) return route.abort();
    await route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(relative), "utf8") });
  });
  await page.evaluate(async () => {
    const { renderHistoryRecordDetails } = await import("/__testsrc/src/ui/history-diff.js");
    const { isolateLinkedLayoutEntities } = await import("/__testsrc/src/state/layout-entity-isolation.js");
    const arrangement = { rootContainerIds: ["bag"], containers: {
      bag: { parentId: "", itemIds: [], childIds: ["p"], order: [{ type: "container", id: "p" }] },
      p: { parentId: "bag", childIds: [], itemIds: ["i"], order: [{ type: "item", id: "i" }] }
    }, items: { i: "p" } };
    const before = { containers: { bag: { id: "bag", name: "Сумка", nestable: true }, p: { id: "p", name: "Ремонт Light" } },
      items: { i: { id: "i", name: "Насос" } }, layouts: Object.fromEntries(["a", "b", "c"].map(id => [id, { id, name: id, rootContainerIds: ["bag"], arrangement: structuredClone(arrangement) }])) };
    const after = structuredClone(before); isolateLinkedLayoutEntities(after);
    after.containers[after.layouts.a.arrangement.items.i].name = "Ремонт Full";
    delete after.containers[after.layouts.b.arrangement.items.i];
    const record = { payload: before, createdAt: "2026-10-13T20:25:00Z" };
    document.querySelector("#historyDetailContent").innerHTML = renderHistoryRecordDetails(record, 0, [record], {
      recordState: r => r.payload, currentComparisonState: () => after
    });
    document.querySelector("#historyDetailTitle").textContent = "История переименования";
    document.querySelector("#historyDetailDialog").showModal();
  });
  const content = page.locator("#historyDetailContent");
  await expect(content).toContainText("Ремонт Light");
  await expect(content).toContainText("Ремонт Full");
  await expect(content).not.toContainText("Удалено");
  await expect(content).not.toContainText("перемещена");
  await expect(content.locator(".history-diff-group.changed li")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("history-rename.png") });
});

test("history handles a placed suffix, quantity metadata and a real rename", async ({ page }, testInfo) => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  await page.goto("/");
  await waitForApp(page);
  await page.route("**/__testsrc/**", async route => {
    const relative = new URL(route.request().url()).pathname.split("/__testsrc/")[1];
    if (!relative.startsWith("src/") || relative.includes("..")) return route.abort();
    await route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(relative), "utf8") });
  });
  await page.evaluate(async () => {
    const { renderHistoryRecordDetails } = await import("/__testsrc/src/ui/history-diff.js");
    const { isolateLinkedLayoutEntities } = await import("/__testsrc/src/state/layout-entity-isolation.js");
    const arrangement = { rootContainerIds: ["bag"], containers: {
      bag: { parentId: "", itemIds: [], childIds: ["p"], order: [{ type: "container", id: "p" }] },
      p: { parentId: "bag", childIds: [], itemIds: ["i"], order: [{ type: "item", id: "i" }] }
    }, items: { i: "p" } };
    const before = { containers: { bag: { id: "bag", name: "Сумка", nestable: true }, p: { id: "p", name: "Ремонт Light" } },
      items: { i: { id: "i", name: "Насос" } }, layouts: Object.fromEntries(["a", "b", "c"].map(id => [id, { id, name: id, rootContainerIds: ["bag"], arrangement: structuredClone(arrangement) }])) };
    const { temporaryContainerId } = await import("/__testsrc/src/state/layout-temporary-containers.js");
    const id = temporaryContainerId("a", "p");
    before.containers[id] = { ...before.containers.p, id };
    const after = structuredClone(before); isolateLinkedLayoutEntities(after);
    const suffix = `${id}-2`;
    after.layouts.a.arrangement = JSON.parse(JSON.stringify(after.layouts.a.arrangement).replaceAll(id, suffix));
    after.containers[suffix] = { ...before.containers.p, id: suffix };
    after.layouts.b.arrangement.itemQuantityMigrationVersion = 3;
    after.containers[after.layouts.a.arrangement.items.i].name = "Ремонт Full";
    delete after.containers[after.layouts.b.arrangement.items.i];
    const record = { payload: before, createdAt: "2026-10-13T20:25:00Z" };
    document.querySelector("#historyDetailContent").innerHTML = renderHistoryRecordDetails(record, 0, [record], {
      recordState: r => r.payload, currentComparisonState: () => after
    });
    document.querySelector("#historyDetailTitle").textContent = "История переименования";
    document.querySelector("#historyDetailDialog").showModal();
  });
  const content = page.locator("#historyDetailContent");
  await expect(content).toContainText("Ремонт Light");
  await expect(content).toContainText("Ремонт Full");
  await expect(content).not.toContainText("Удалено");
  await expect(content).not.toContainText("перемещена");
  await expect(content.locator(".history-diff-group.changed li")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("history-rename.png") });
});

test("bag copy offers only missing items and an expandable list of existing items", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const { container } = await createGuestWorkspace(page, { layoutName: "Исходная", containerName: "Исходная сумка", itemName: "Насос" });
  await createItemInContainer(page, container, "Палатка");
  await createEmptyLayout(page, "Целевая");
  await createRootContainer(page, "Другая сумка");
  await page.locator('#layoutSelect').selectOption({ label: 'Исходная' });
  await page.locator('#packingView [data-item-id]').filter({ hasText: 'Насос' }).locator('.item-title-hitarea').click();
  await page.locator('#itemCopyToContainerBtn').evaluate(button => button.click());
  await page.locator('#containerPickerLayoutSelect').selectOption({ label: 'Целевая' });
  await page.locator('#containerPickerBoard [data-pick-container]').filter({ hasText: 'Другая сумка' }).click();
  await expect(page.locator('#layoutSelect option:checked')).toHaveText('Целевая');
  const openCopy = async () => {
    await page.locator('#layoutSelect').selectOption({ label: 'Исходная' });
    await selectView(page, 'packing');
    await page.locator('#packingView [data-root-container-id]').filter({ hasText: 'Исходная сумка' }).locator('.container-title h2').first().click();
    await page.locator('#rootContainerCopyToContainerBtn').evaluate(button => button.click());
    await page.locator('#containerPickerLayoutSelect').selectOption({ label: 'Целевая' });
    await page.locator('#containerPickerBoard [data-pick-root-index]').first().click();
    await expect(page.locator('#confirmDialog')).toBeVisible();
  };
  await openCopy();
  await expect(page.locator('#confirmDialog button:visible')).toHaveText(['Добавить без дубликатов', 'Не копировать']);
  await expect(page.locator('#confirmDialog header .icon-button')).toBeHidden();
  await expect(page.locator('#confirmText')).toContainText('1 вещей уже есть');
  await expect(page.locator('#confirmText')).toContainText('1 вещей можно добавить без дублей');
  const details = page.locator('#confirmDialog .copy-duplicate-details');
  await expect(details.locator('li')).toBeHidden();
  await details.locator('summary').click();
  await expect(details.locator('li')).toHaveText(['Насос']);
  await page.screenshot({ path: testInfo.outputPath('copy-existing-items.png'), fullPage: true });
  await page.locator('#confirmCancelBtn').click();
  await page.reload(); await waitForApp(page);
  await page.locator('#layoutSelect').selectOption({ label: 'Целевая' });
  await expect(page.locator('#packingView [data-item-id]')).toHaveCount(1);
  await openCopy();
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('#layoutSelect option:checked')).toHaveText('Целевая');
  await expect(page.locator('#packingView [data-item-id]')).toHaveCount(2);
  await expect(page.locator('#packingView [data-root-container-id]').filter({ hasText: 'Другая сумка' }).locator('[data-item-id]')).toHaveCount(1);
  await selectView(page, 'items');
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(2);
  await expect(page.locator('#itemsView')).not.toContainText('copy');
  await openCopy();
  await expect(page.locator('#confirmOkBtn')).toBeDisabled();
  await page.locator('#confirmDialog summary').click();
  await expect(page.locator('#confirmDialog li')).toHaveCount(2);
  expect((await page.locator('#confirmDialog li').allTextContents()).sort()).toEqual(['Насос', 'Палатка']);
  await page.locator('#confirmCancelBtn').click();
});

test("duplicate filters live in each catalog and stay independent", async ({ page }) => {
  const { container } = await createGuestWorkspace(page, { layoutName: "Проверка дубликатов", containerName: "Сумка А", itemName: "Насос" });
  await createItemInContainer(page, container, "Палатка");
  await createRootContainer(page, "Рюкзак");
  await selectView(page, "items");
  await page.locator('[data-list-item-id]').filter({ hasText: "Насос" }).locator('[data-copy-item]').click();
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('[data-list-item-id]').filter({ hasText: "Насос copy" })).toHaveCount(1);
  await selectView(page, "bags");
  await page.locator('[data-copy-root]').first().click();
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator("#findDuplicatesBtn")).toHaveCount(0);
  await expect(page.locator("#bagsView [data-copy-root]")).toHaveCount(3);
  await page.locator("#rootContainerUsageFilter").selectOption("duplicates");
  await expect(page.locator('#rootContainerUsageFilter option:checked')).toHaveText("Дубликаты (2)");
  await expect(page.locator('#bagsView .catalog-duplicate-group')).toHaveCount(1);
  await expect(page.locator('#bagsView .catalog-duplicate-group [data-copy-root]')).toHaveCount(2);
  await expect(page.locator('#bagsView [data-copy-root]')).toHaveCount(2);
  await expect(page.locator('#bagsView .catalog-duplicates-notice')).toBeVisible();
  await selectView(page, "items");
  await expect(page.locator("#itemUsageFilter")).toHaveValue("all");
  await expect(page.locator("#itemsView [data-list-item-id]")).toHaveCount(3);
  await page.locator("#itemUsageFilter").selectOption("duplicates");
  await expect(page.locator('#itemUsageFilter option:checked')).toHaveText("Дубликаты (2)");
  await expect(page.locator('#itemsView .catalog-duplicate-group')).toHaveCount(1);
  await expect(page.locator('#itemsView .catalog-duplicate-group [data-list-item-id]')).toHaveCount(2);
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(2);
  await expect(page.locator('#itemsView')).not.toContainText("Палатка");
  await page.locator("#itemUsageFilter").selectOption("all");
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(3);
  await selectView(page, "bags");
  await expect(page.locator("#rootContainerUsageFilter")).toHaveValue("duplicates");
  await page.locator("#rootContainerUsageFilter").selectOption("all");
  await expect(page.locator("#bagsView [data-copy-root]")).toHaveCount(3);
});

test("duplicate groups keep three companions and exclude broken or different-weight items", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await createGuestWorkspace(page, { layoutName: "Группы копий", containerName: "Сумка", itemName: "Насос", weight: "120" });
  await selectView(page, "items");
  for (let i = 0; i < 2; i += 1) {
    await page.locator('#itemsView [data-copy-item]').first().click();
    await page.locator('#confirmOkBtn').click();
    await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(i + 2);
  }
  await page.locator('#itemUsageFilter').selectOption('duplicates');
  await expect(page.locator('#itemUsageFilter option:checked')).toHaveText('Дубликаты (3)');
  await expect(page.locator('#itemsView .catalog-duplicate-group')).toHaveCount(1);
  await expect(page.locator('#itemsView .catalog-duplicate-group h3')).toHaveText('Группа 1 · записей: 3');
  await expect(page.locator('#itemsView .catalog-duplicate-group [data-list-item-id]')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('duplicate-group.png'), fullPage: true });
  await page.locator('#itemsView [data-list-item-id]').last().click();
  await page.locator('#itemAvailabilityStatus').selectOption('broken');
  await page.locator('#saveItemBtn').evaluate(button => button.click());
  await expect(page.locator('#itemUsageFilter option:checked')).toHaveText('Дубликаты (2)');
  await expect(page.locator('#itemsView .catalog-duplicate-group [data-list-item-id]')).toHaveCount(2);
  await page.locator('#itemUsageFilter').selectOption('broken');
  await expect(page.locator('#itemUsageFilter option:checked')).toHaveText('Сломанные (1)');
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(1);
  await page.locator('#itemUsageFilter').selectOption('duplicates');
  await page.locator('#itemsView [data-list-item-id]').last().click();
  await page.locator('#itemWeight').fill('150');
  await page.locator('#saveItemBtn').evaluate(button => button.click());
  await expect(page.locator('#itemUsageFilter option:checked')).toHaveText('Дубликаты (0)');
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(0);
});

test("local undo restores an offline rename after a browser reload", async ({ page }) => {
  await createGuestWorkspace(page, { layoutName: "Проверка отмены", containerName: "Сумка А", itemName: "Насос" });
  await page.locator('#forceOfflineBtn').evaluate((button) => button.click());
  await selectView(page, "items");
  await page.locator('[data-list-item-id]').filter({ hasText: "Насос" }).click();
  await expect(page.locator('#itemDialog')).toBeVisible();
  await page.locator('#itemName').fill("Офлайн имя");
  await page.locator('#saveItemBtn').evaluate((button) => button.click());
  await expect(page.locator('#itemsView')).toContainText("Офлайн имя");
  await page.reload();
  await waitForApp(page);
  await page.locator('#menuBtn').click();
  await expect(page.locator('#localUndoBtn')).toBeEnabled();
  await expect(page.locator('#historyBtn')).not.toBeVisible();
  await expect(page.locator('#localUndoBtn')).toHaveText('Локальная история');
  await page.locator('#localUndoBtn').click();
  await expect(page.locator('#localHistoryDialog')).toBeVisible();
  await expect(page.locator('#localHistoryList')).toContainText('Офлайн имя');
  await page.locator('#localHistoryList [data-local-history-undo]').first().click();
  await expect(page.locator('#confirmDialog')).toContainText("Офлайн имя");
  await page.locator('#confirmCancelBtn').click();
  await expect(page.locator('#localHistoryList')).toContainText('Офлайн имя');
  await page.locator('#localHistoryList [data-local-history-undo]').first().click();
  await page.locator('#confirmOkBtn').click();
  await page.locator('#localHistoryDialog [aria-label="Закрыть"]').click();
  await selectView(page, "items");
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(1);
  await expect(page.locator('#itemsView')).toContainText("Насос");
  await expect(page.locator('#itemsView')).not.toContainText("Офлайн имя");
});


for (const failFirstComparison of [false, true, "verified"]) {
test(`history list automatically omits technical pages and counts only visible entries (retry: ${failFirstComparison})`, async ({ page }) => {
  const verifiedSummary = failFirstComparison === "verified";
  let detailRequests = 0;
  let comparisonFailed = false;
  let finishOlderDetail;
  const olderDetailGate = new Promise(resolve => { finishOlderDetail = resolve; });
  const before = { items: { pump: { id: "pump", name: "Насос", weight: 100, quantity: 1 } },
    containers: { bag: { id: "bag", name: "Сумка", nestable: true } }, locations: [], categories: [],
    layouts: { a: { id: "a", name: "Моя укладка", rootContainerIds: ["bag"], arrangement: {
      rootContainerIds: ["bag"], items: { pump: "bag" }, containers: { bag: { parentId: "", childIds: [], itemIds: ["pump"], order: [{ type: "item", id: "pump" }] } }, itemQuantities: { pump: 1 }, packedItems: {}
    } } }, activeLayoutId: "a" };
  const after = structuredClone(before); after.items.pump.name = "Насос Full";
  const technical = structuredClone(after); technical.layouts.a.arrangement.itemQuantityMigrationVersion = 3;
  const action = { entityType: "items", operation: "changed", title: "Техническая запись" };
  const list = { id: "history-list", title: "Мой список", payload: technical };
  const requests = [];
  await page.route("**/letters-vniipo/api/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let data;
    if (path.endsWith("/auth/me")) data = { ok: true, user: { id: "history-user", email: "history@example.test" }, session: { expiresAt: "2030-01-01T00:00:00Z" } };
    else if (path.endsWith("/bike-packing/authorization")) data = { ok: true, authorization: { version: 1, role: "user", capabilities: [] } };
    else if (path.endsWith("/bike-packing/lists")) data = { ok: true, lists: [list] };
    else if (path.endsWith("/history-list/history")) {
      expect(url.searchParams.get("limit")).toBe("5");
      expect(url.searchParams.get("comparison")).toBe("visible-v1");
      requests.push(url.searchParams.get("cursor") || "first");
      if (verifiedSummary) return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({ok:true,records:[
        {id:2,listId:list.id,action:{entityType:"items",operation:"changed",title:"Насос Full"},comparisonVersion:"visible-v1",hasUserVisibleChanges:true,createdAt:"2026-10-13T20:25:00Z"},
        {id:1,listId:list.id,snapshotKind:"daily",comparisonVersion:"visible-v1",hasUserVisibleChanges:true,createdAt:"2026-10-12T20:25:00Z"}
      ],page:{hasMore:false,nextCursor:""}})});
      data = url.searchParams.has("cursor")
        ? { ok: true, records: [{ id: 2, listId: list.id, action, createdAt: "2026-10-13T20:25:00Z" }, { id: 1, listId: list.id, snapshotKind: "daily", createdAt: "2026-10-12T20:25:00Z" }], page: { hasMore: false, nextCursor: "" } }
        : { ok: true, records: [{ id: 3, listId: list.id, action, createdAt: "2026-10-14T00:05:00Z" }], page: { hasMore: true, nextCursor: "older" } };
    } else if (path.endsWith("/history-list/history/3") && failFirstComparison === true && !comparisonFailed) {
      comparisonFailed = true;
      return route.fulfill({ status: 502, contentType: "application/json", body: '{"ok":false}' });
    } else if (path.endsWith("/history-list/history/3")) data = { ok: true, record: { id: 3, payload: after }, comparisonPayload: technical, action };
    else if (path.endsWith("/history-list/history/2")) { detailRequests++; data = { ok: true, record: { id: 2, payload: before }, comparisonPayload: after, action }; }
    else if (path.endsWith("/history-list/history/1")) {
      await olderDetailGate;
      data = { ok: true, record: { id: 1, snapshotKind: "daily", payload: before }, comparisonPayload: after };
    }
    else if (path.endsWith("/bike-packing/lists/history-list")) data = { ok: true, record: list };
    if (data) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' });
  });
  await page.goto("/"); await waitForApp(page);
  // Reproduce a journal left by an older release even though the server already
  // contains the action. A stale baseline prevents the old activation shortcut.
  await page.evaluate(payload => {
    const suffix = "::id:history-user";
    const stateKey = "bike-packing-prototype-state-v1" + suffix;
    const saved = payload;
    localStorage.setItem(stateKey, JSON.stringify(saved));
    const staleBase = structuredClone(saved); staleBase.items.pump.weight = 999;
    localStorage.setItem("bike-packing-prototype-base-state-v1" + suffix, JSON.stringify(staleBase));
    localStorage.setItem("bike-packing-local-undo-v1" + suffix, JSON.stringify([{
      createdAt: "2026-10-13T20:25:00Z", names: ["Насос Full"],
      changes: [{ path: ["items", "pump", "name"], before: { exists: true, value: "Насос" }, after: { exists: true, value: "Насос Full" } }]
    }]));
  }, technical);
  await page.reload(); await waitForApp(page);
  await page.locator('#menuBtn').click();
  await expect(page.locator('#localUndoBtn')).not.toBeVisible();
  await expect(page.locator('#historyBtn')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("bike-packing-local-undo-v1::id:history-user")))).toEqual([]);
  await page.locator('#historyBtn').click();
  if (failFirstComparison === true) {
    await expect(page.locator('[data-history-retry]')).toBeVisible();
    await expect(page.locator('#historyList [data-history-record]')).toHaveCount(0);
    await expect(page.locator('#historyDetailDialog')).not.toBeVisible();
    expect(requests).toEqual(['first']);
    await page.locator('[data-history-retry]').click();
  }
  if (verifiedSummary) {
    await expect(page.locator('#historyList [data-history-record]')).toHaveCount(2);
    expect(detailRequests).toBe(0);
    await page.locator('#historyList [data-history-detail]').first().click();
    await expect(page.locator('#historyDetailContent')).toContainText('Насос → Насос Full');
    expect(detailRequests).toBe(1);
    finishOlderDetail();
  } else {
    await expect(page.locator('#historyList [data-history-record]')).toHaveCount(1);
    await expect(page.locator('#historyStatus')).toContainText('загружаю');
    await page.locator('#historyList [data-history-detail]').click();
    await expect(page.locator('#historyDetailContent')).toContainText('Насос → Насос Full');
    finishOlderDetail();
    await expect(page.locator('#historyList [data-history-record]')).toHaveCount(2);
  }
  await expect(page.locator('#historyDetailDialog')).toBeVisible();
  await page.locator('#historyDetailDialog [aria-label="Закрыть"]').click();
  await expect(page.locator('#historyStatus')).toContainText('найдено версий: 2');
  await expect(page.locator('#historyList')).toContainText('Изменена вещь «Насос Full»');
  await expect(page.locator('#historyList')).not.toContainText('Техническая запись');
  await expect(page.locator('#historyList [data-history-load-more]')).toHaveCount(0);
  expect(requests).toEqual(verifiedSummary ? ['first'] : failFirstComparison ? ['first', 'first', 'older'] : ['first', 'older']);
  await expect(page.locator('#historyList')).toContainText('Итоговая точка дня');
  await expect(page.locator('#historyList')).not.toContainText('Без пользовательских изменений');
  await page.locator('#historyList [data-history-record]').filter({ hasText: 'Итоговая точка дня' }).locator('[data-history-detail]').click();
  await expect(page.locator('#historyDetailTitle')).toHaveText('Итоговая точка дня');
  await page.locator('#historyDetailDialog [aria-label="Закрыть"]').click();
  await page.locator('#historyList [data-history-record]').filter({ hasText: 'Насос Full' }).locator('[data-history-detail]').click();
  await expect(page.locator('#historyDetailContent')).toContainText('Насос → Насос Full');
  await page.locator('#historyDetailDialog [aria-label="Закрыть"]').click();
  await page.locator('#historyList [data-history-record]').filter({ hasText: 'Насос Full' }).locator('[data-restore-history]').click();
  await expect(page.locator('#confirmDialog')).toBeVisible();
  await expect(page.locator('#confirmDialog')).not.toContainText('более поздних');
  await page.locator('#confirmCancelBtn').click();
});

}
