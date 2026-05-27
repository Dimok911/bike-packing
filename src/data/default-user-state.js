import { COLLAPSE_DEFAULTS_VERSION } from "../config/constants.js";
import { REQUIRED_CHARGE_CATEGORY } from "./demo-data.js";
import { ITEM_DISPLAY_MODE_DEFAULT } from "../ui/item-display-mode.js";

export function createDefaultUserState() {
  const leftId = "demo-left-bag";
  const rightId = "demo-right-bag";
  const bikeId = "demo-bike";
  const selfId = "demo-on-self";
  const clothesKitId = "demo-clothes-kit";
  const repairKitId = "demo-repair-kit";
  const hygieneKitId = "demo-hygiene-kit";
  const foodKitId = "demo-food-kit";
  const bikePocketId = "demo-bike-pocket";
  const selfPocketId = "demo-self-pocket";
  const items = {
    "demo-item-jacket": {
      id: "demo-item-jacket",
      name: "Легкая куртка",
      weight: 280,
      location: "Дом",
      category: "Одежда",
      containerId: clothesKitId,
      note: ""
    },
    "demo-item-snack": {
      id: "demo-item-snack",
      name: "Перекус на день",
      weight: 450,
      location: "Надо купить",
      category: "Еда",
      containerId: foodKitId,
      note: ""
    },
    "demo-item-gas": {
      id: "demo-item-gas",
      name: "Газовый баллон",
      weight: 230,
      location: "Надо купить",
      category: "Кухня",
      containerId: leftId,
      note: ""
    },
    "demo-item-rain-pants": {
      id: "demo-item-rain-pants",
      name: "Дождевые штаны",
      weight: 230,
      location: "Дом",
      category: "Одежда",
      containerId: clothesKitId,
      note: ""
    },
    "demo-item-first-aid": {
      id: "demo-item-first-aid",
      name: "Мини-аптечка",
      weight: 190,
      location: "Дача",
      category: "Медицина",
      containerId: rightId,
      note: ""
    },
    "demo-item-tube": {
      id: "demo-item-tube",
      name: "Запасная камера",
      weight: 120,
      location: "Дом",
      category: "Ремонт",
      containerId: repairKitId,
      note: ""
    },
    "demo-item-tool": {
      id: "demo-item-tool",
      name: "Мультитул",
      weight: 180,
      location: "Не знаю где",
      category: "Ремонт",
      containerId: repairKitId,
      note: ""
    },
    "demo-item-patches": {
      id: "demo-item-patches",
      name: "Заплатки для камеры",
      weight: 35,
      location: "Дом",
      category: "Ремонт",
      containerId: repairKitId,
      note: ""
    },
    "demo-item-chain-link": {
      id: "demo-item-chain-link",
      name: "Замок цепи",
      weight: 12,
      location: "Не знаю где",
      category: "Ремонт",
      containerId: repairKitId,
      note: ""
    },
    "demo-item-toothbrush": {
      id: "demo-item-toothbrush",
      name: "Зубная щетка и паста",
      weight: 90,
      location: "Дом",
      category: "Гигиена",
      containerId: hygieneKitId,
      note: ""
    },
    "demo-item-towel": {
      id: "demo-item-towel",
      name: "Полотенце маленькое",
      weight: 110,
      location: "Дом",
      category: "Гигиена",
      containerId: hygieneKitId,
      note: ""
    },
    "demo-item-porridge": {
      id: "demo-item-porridge",
      name: "Каши на завтрак",
      weight: 360,
      location: "Надо купить",
      category: "Еда",
      containerId: foodKitId,
      note: ""
    },
    "demo-item-mug": {
      id: "demo-item-mug",
      name: "Кружка",
      weight: 95,
      location: "Дом",
      category: "Кухня",
      containerId: foodKitId,
      note: ""
    },
    "demo-item-bottle": {
      id: "demo-item-bottle",
      name: "Фляга с водой",
      weight: 850,
      location: "Уже на велосипеде",
      category: "Вода",
      containerId: bikeId,
      note: ""
    },
    "demo-item-pump": {
      id: "demo-item-pump",
      name: "Насос",
      weight: 160,
      location: "Уже на велосипеде",
      category: "Ремонт",
      containerId: bikePocketId,
      note: ""
    },
    "demo-item-front-light": {
      id: "demo-item-front-light",
      name: "Передний фонарь",
      weight: 95,
      location: "Дом",
      category: "Электроника",
      containerId: bikePocketId,
      note: ""
    },
    "demo-item-phone": {
      id: "demo-item-phone",
      name: "Телефон",
      weight: 210,
      location: "Дом",
      category: "Электроника",
      containerId: selfPocketId,
      note: ""
    },
    "demo-item-documents": {
      id: "demo-item-documents",
      name: "Документы",
      weight: 80,
      location: "Дом",
      category: "Документы",
      containerId: selfPocketId,
      note: ""
    },
    "demo-item-glasses": {
      id: "demo-item-glasses",
      name: "Очки",
      weight: 35,
      location: "Не знаю где",
      category: "Прочее",
      containerId: selfId,
      note: ""
    },
    "demo-item-powerbank": {
      id: "demo-item-powerbank",
      name: "Повербанк",
      weight: 320,
      location: "Дом",
      category: "Электроника",
      containerId: selfPocketId,
      note: ""
    }
  };
  return {
    locations: ["Дом", "Дача", "Уже на велосипеде", "Надо купить", "Не знаю где"],
    categories: ["Одежда", "Еда", "Вода", "Ремонт", "Медицина", "Кухня", "Электроника", "Документы", "Гигиена", REQUIRED_CHARGE_CATEGORY, "Прочее"],
    containers: {
      [leftId]: {
        id: leftId,
        name: "Левая сумка",
        parentId: null,
        childIds: [clothesKitId, foodKitId],
        itemIds: ["demo-item-gas"],
        order: [
          { type: "container", id: clothesKitId },
          { type: "container", id: foodKitId },
          { type: "item", id: "demo-item-gas" }
        ]
      },
      [clothesKitId]: {
        id: clothesKitId,
        name: "Пакет с одеждой",
        parentId: leftId,
        childIds: [],
        itemIds: ["demo-item-jacket", "demo-item-rain-pants"],
        order: [
          { type: "item", id: "demo-item-jacket" },
          { type: "item", id: "demo-item-rain-pants" }
        ]
      },
      [foodKitId]: {
        id: foodKitId,
        name: "Пакет с едой",
        parentId: leftId,
        childIds: [],
        itemIds: ["demo-item-snack", "demo-item-porridge", "demo-item-mug"],
        order: [
          { type: "item", id: "demo-item-snack" },
          { type: "item", id: "demo-item-porridge" },
          { type: "item", id: "demo-item-mug" }
        ]
      },
      [rightId]: {
        id: rightId,
        name: "Правая сумка",
        parentId: null,
        childIds: [repairKitId, hygieneKitId],
        itemIds: ["demo-item-first-aid"],
        order: [
          { type: "container", id: repairKitId },
          { type: "container", id: hygieneKitId },
          { type: "item", id: "demo-item-first-aid" }
        ]
      },
      [repairKitId]: {
        id: repairKitId,
        name: "Пакет для ремонта",
        parentId: rightId,
        childIds: [],
        itemIds: ["demo-item-tube", "demo-item-tool", "demo-item-patches", "demo-item-chain-link"],
        order: [
          { type: "item", id: "demo-item-tube" },
          { type: "item", id: "demo-item-tool" },
          { type: "item", id: "demo-item-patches" },
          { type: "item", id: "demo-item-chain-link" }
        ]
      },
      [hygieneKitId]: {
        id: hygieneKitId,
        name: "Гигиена",
        parentId: rightId,
        childIds: [],
        itemIds: ["demo-item-toothbrush", "demo-item-towel"],
        order: [
          { type: "item", id: "demo-item-toothbrush" },
          { type: "item", id: "demo-item-towel" }
        ]
      },
      [bikeId]: {
        id: bikeId,
        name: "На велосипеде",
        parentId: null,
        childIds: [bikePocketId],
        itemIds: ["demo-item-bottle"],
        order: [
          { type: "item", id: "demo-item-bottle" },
          { type: "container", id: bikePocketId }
        ]
      },
      [bikePocketId]: {
        id: bikePocketId,
        name: "Бардачок на раме",
        parentId: bikeId,
        childIds: [],
        itemIds: ["demo-item-pump", "demo-item-front-light"],
        order: [
          { type: "item", id: "demo-item-pump" },
          { type: "item", id: "demo-item-front-light" }
        ]
      },
      [selfId]: {
        id: selfId,
        name: "На себе",
        parentId: null,
        childIds: [selfPocketId],
        itemIds: ["demo-item-glasses"],
        order: [
          { type: "item", id: "demo-item-glasses" },
          { type: "container", id: selfPocketId }
        ]
      },
      [selfPocketId]: {
        id: selfPocketId,
        name: "Карманы куртки",
        parentId: selfId,
        childIds: [],
        itemIds: ["demo-item-phone", "demo-item-documents", "demo-item-powerbank"],
        order: [
          { type: "item", id: "demo-item-phone" },
          { type: "item", id: "demo-item-documents" },
          { type: "item", id: "demo-item-powerbank" }
        ]
      }
    },
    items,
    layouts: {
      "layout-main": {
        id: "layout-main",
        name: "Демо-укладка",
        rootContainerIds: [leftId, rightId, bikeId, selfId]
      }
    },
    activeLayoutId: "layout-main",
    collapsedContainers: {
      [repairKitId]: true,
      [hygieneKitId]: true,
      [foodKitId]: true,
      [clothesKitId]: true,
      [bikePocketId]: true,
      [selfPocketId]: true
    },
    collapseDefaultsVersion: COLLAPSE_DEFAULTS_VERSION,
    itemDisplayMode: ITEM_DISPLAY_MODE_DEFAULT,
    showItemMeta: false,
    showFilterContext: false,
    collectionMode: false,
    showOnlyUnpacked: false,
    packedItems: {}
  };
}
