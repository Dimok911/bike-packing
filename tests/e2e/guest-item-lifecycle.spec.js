import { expect, test } from "@playwright/test";
import {
  createGuestWorkspace,
  createItemInContainer,
  prepareIsolatedRussianGuest,
  waitForApp,
} from "./guest-test-helpers.js";

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

test("guest edits an item and bag and keeps changes after reload", async ({ page }) => {
  const original = {
    layoutName: "Редактирование данных",
    containerName: "Исходная сумка",
    itemName: "Исходная вещь",
  };
  const changedContainerName = "Изменённая сумка";
  const changedItemName = "Изменённая вещь";
  const { container, item } = await createGuestWorkspace(page, { ...original, weight: "125" });

  await item.locator(".item-title-hitarea").click();
  await expect(page.locator("#itemDialog")).toBeVisible();
  await page.locator("#itemName").fill(changedItemName);
  await page.locator("#itemWeight").fill("275");
  await page.locator("#saveItemBtn").click();

  const changedItem = container.locator("[data-item-id]").filter({ hasText: changedItemName });
  await expect(changedItem).toHaveCount(1);
  await expect(changedItem).toContainText("275");

  await container.getByRole("heading", { name: original.containerName }).click();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await page.locator("#rootContainerName").fill(changedContainerName);
  await page.locator("#saveRootContainerBtn").click();

  await page.reload();
  await waitForApp(page);
  const restoredContainer = page.locator("#packingView [data-root-container-id]").filter({ hasText: changedContainerName });
  await expect(restoredContainer).toHaveCount(1);
  await expect(restoredContainer.locator("[data-item-id]").filter({ hasText: changedItemName })).toContainText("275");
  await expect(page.locator("#packingView")).not.toContainText(original.containerName);
  await expect(page.locator("#packingView")).not.toContainText(original.itemName);
});

test("guest searches items and clears the search", async ({ page }) => {
  const { container } = await createGuestWorkspace(page, {
    layoutName: "Проверка поиска",
    containerName: "Сумка для поиска",
    itemName: "Насос велосипедный электрический",
  });
  await createItemInContainer(page, container, "Синий насос");

  await page.locator("#searchInput").fill("насос электрический");
  await expect(container.locator("[data-item-id]").filter({ hasText: "Насос велосипедный электрический" })).toBeVisible();
  await expect(container.locator("[data-item-id]").filter({ hasText: "Насос велосипедный электрический" }).locator("mark")).toHaveCount(2);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Синий насос" })).toHaveCount(0);
  await expect(page.locator("#clearSearchBtn")).toBeVisible();

  await page.locator("#clearSearchBtn").click();
  await expect(page.locator("#searchInput")).toHaveValue("");
  await expect(container.locator("[data-item-id]").filter({ hasText: "Насос велосипедный электрический" })).toBeVisible();
  await expect(container.locator("[data-item-id]").filter({ hasText: "Синий насос" })).toBeVisible();
});

test("search opens an item at the matching note text and navigates repeated matches", async ({ page }) => {
  const query = "контрольная метка";
  const note = [
    `${query} в начале заметки`,
    ...Array.from({ length: 45 }, (_, index) => `Подробная строка ${index + 1} о подготовке к поездке.`),
    `${query} в середине заметки`,
    ...Array.from({ length: 35 }, (_, index) => `Дополнительная строка ${index + 1} со списком снаряжения.`),
    `${query} в конце заметки`
  ].join("\n");
  const { item } = await createGuestWorkspace(page, {
    layoutName: "Навигация по заметке",
    containerName: "Сумка с подробностями",
    itemName: "Предмет с длинной заметкой",
  });

  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemNote").fill(note);
  await page.locator("#itemPhotoInput").setInputFiles({
    name: "note-match.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#d7e4df"/></svg>')
  });
  await expect(page.locator("#itemPhotoPreview img")).toBeVisible();
  await page.locator("#saveItemBtn").click();

  await page.locator('.tab[data-view="items"]').click();
  await page.locator("#searchInput").fill(query);
  const result = page.locator("#itemsView .items-list .item-card").filter({ hasText: "Предмет с длинной заметкой" });
  await expect(result.locator(".search-note-match-badge")).toBeVisible();
  await expect(result.locator(".item-photo")).toBeVisible();
  const badgePlacement = await result.evaluate((card) => {
    const badge = card.querySelector(".search-note-match-badge")?.getBoundingClientRect();
    const photo = card.querySelector(".item-photo")?.getBoundingClientRect();
    return badge && photo ? {
      badgeBottom: badge.bottom,
      badgeTop: badge.top,
      cardBottom: card.getBoundingClientRect().bottom,
      cardTop: card.getBoundingClientRect().top,
      photoBottom: photo.bottom,
      photoTop: photo.top
    } : null;
  });
  expect(badgePlacement.badgeTop).toBeGreaterThanOrEqual(badgePlacement.cardTop);
  expect(badgePlacement.badgeBottom).toBeLessThanOrEqual(badgePlacement.cardBottom);
  expect(badgePlacement.badgeTop).toBeGreaterThanOrEqual(badgePlacement.photoTop);
  expect(badgePlacement.badgeTop).toBeLessThan(badgePlacement.photoBottom);
  await result.locator(".search-note-match-badge").click();

  const navigation = page.locator("#itemNoteSearchNav");
  const textarea = page.locator("#itemNote");
  await expect(page.locator("#itemDialog")).toBeVisible();
  await expect(navigation).toBeVisible();
  await expect(textarea).toBeFocused();
  await expect(page.locator("#itemNoteSearchStatus")).toHaveText("Совпадение 1 из 3");
  await expect(page.locator("#itemNoteSearchQuery")).toHaveText(query);
  await expect(textarea).toHaveJSProperty("selectionStart", note.indexOf(query));
  await expect(textarea).toHaveJSProperty("selectionEnd", note.indexOf(query) + query.length);
  const centeredNote = await textarea.evaluate((element) => {
    const fieldRect = element.closest(".note-field").getBoundingClientRect();
    const dialog = element.closest("dialog");
    const dialogCard = element.closest(".dialog-card");
    const dialogRect = dialog.getBoundingClientRect();
    const fieldCenter = (fieldRect.top + fieldRect.bottom) / 2;
    const dialogCenter = (dialogRect.top + dialogRect.bottom) / 2;
    return {
      cardClientHeight: dialogCard.clientHeight,
      cardScrollHeight: dialogCard.scrollHeight,
      cardScrollTop: dialogCard.scrollTop,
      centerDelta: Math.abs(fieldCenter - dialogCenter),
      dialogClientHeight: dialog.clientHeight,
      dialogHeight: dialogRect.height,
      dialogScrollHeight: dialog.scrollHeight,
      dialogScrollTop: dialog.scrollTop,
      fieldBottom: fieldRect.bottom,
      fieldTop: fieldRect.top
    };
  });
  expect(centeredNote.centerDelta, JSON.stringify(centeredNote)).toBeLessThan(centeredNote.dialogHeight * 0.25);

  await page.locator("#itemNoteSearchNext").click();
  const secondStart = note.indexOf(query, query.length);
  await expect(page.locator("#itemNoteSearchStatus")).toHaveText("Совпадение 2 из 3");
  await expect(textarea).toHaveJSProperty("selectionStart", secondStart);
  await expect(textarea).toHaveJSProperty("selectionEnd", secondStart + query.length);
  await expect.poll(() => textarea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await page.locator("#itemNoteSearchNext").click();
  await expect(page.locator("#itemNoteSearchStatus")).toHaveText("Совпадение 3 из 3");
  await page.locator("#itemNoteSearchNext").click();
  await expect(page.locator("#itemNoteSearchStatus")).toHaveText("Совпадение 1 из 3");
});

test("guest filters packed items and unpacks everything with state kept after reload", async ({ page }) => {
  const itemName = "Собранная аптечка";
  const unpackedItemName = "Несобранная фляга";
  const { container, item } = await createGuestWorkspace(page, {
    layoutName: "Режим сбора",
    containerName: "Сумка режима сбора",
    itemName,
  });
  await createItemInContainer(page, container, unpackedItemName);

  await page.locator("#menuBtn").click();
  await expect(page.locator("#topMenu")).toBeVisible();
  await page.locator("#collectionMenuBtn").click();
  const packToggle = item.locator("[data-toggle-packed]");
  await expect(packToggle).toBeVisible();
  await packToggle.click();
  await expect(item).toHaveClass(/\bpacked-item\b/);

  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#collectionModeBtn")).toHaveClass(/\bactive\b/);
  const restoredItem = page.locator("#packingView [data-item-id]").filter({ hasText: itemName });
  await expect(restoredItem).toHaveClass(/\bpacked-item\b/);
  await expect(restoredItem.locator("[data-toggle-packed]")).toHaveText("✓");

  await page.locator("#unpackedOnlyBtn").click();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: itemName })).toHaveCount(0);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: unpackedItemName })).toBeVisible();

  await page.locator("#unpackedOnlyBtn").click();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: itemName })).toBeVisible();
  await page.locator("#unpackAllBtn").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#packingView [data-item-id].packed-item")).toHaveCount(0);

  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#collectionModeBtn")).toHaveClass(/\bactive\b/);
  await expect(page.locator("#packingView [data-item-id].packed-item")).toHaveCount(0);
});

test("guest quantity contributes to exact total weight after reload", async ({ page }) => {
  await createGuestWorkspace(page, {
    layoutName: "Расчёт веса",
    containerName: "Сумка расчёта веса",
    itemName: "Три баллона",
    weight: "125",
    quantity: "3",
  });

  await expect(page.locator("#summary")).toContainText("375 г");
  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#summary")).toContainText("375 г");
});

test("guest deletes an item forever and it does not return after reload", async ({ page }) => {
  const itemName = "Вещь для удаления";
  const { item } = await createGuestWorkspace(page, {
    layoutName: "Удаление вещи",
    containerName: "Сумка удаления",
    itemName,
  });

  await item.locator(".item-title-hitarea").click();
  await expect(page.locator("#itemDialog")).toBeVisible();
  await page.locator("#itemDeleteForeverBtn").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmOkBtn").click();

  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: itemName })).toHaveCount(0);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: itemName })).toHaveCount(0);
  const persistedItemNames = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1") || "null");
    return Object.values(state?.items || {}).map((item) => item?.name);
  });
  expect(persistedItemNames).not.toContain(itemName);
});
