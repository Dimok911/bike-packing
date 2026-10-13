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
  await page.locator('#localUndoBtn').click();
  await expect(page.locator('#confirmDialog')).toContainText("Офлайн имя");
  await page.locator('#confirmOkBtn').click();
  await selectView(page, "items");
  await expect(page.locator('#itemsView [data-list-item-id]')).toHaveCount(1);
  await expect(page.locator('#itemsView')).toContainText("Насос");
  await expect(page.locator('#itemsView')).not.toContainText("Офлайн имя");
});
