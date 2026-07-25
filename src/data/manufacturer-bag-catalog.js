export const MANUFACTURER_BAG_CATALOG_FAMILIES = [
  {
    id: "bikepacking",
    labelKey: "bagCatalog.family.bikepacking",
    descriptionKey: "bagCatalog.family.bikepackingDescription"
  },
  {
    id: "panniers",
    labelKey: "bagCatalog.family.panniers",
    descriptionKey: "bagCatalog.family.panniersDescription"
  }
];

export const MANUFACTURER_BAG_CATALOG_CATEGORIES = [
  {
    id: "saddle",
    family: "bikepacking",
    labelKey: "bagCatalog.category.saddle",
    descriptionKey: "bagCatalog.category.saddleDescription"
  },
  {
    id: "handlebar",
    family: "bikepacking",
    labelKey: "bagCatalog.category.handlebar",
    descriptionKey: "bagCatalog.category.handlebarDescription"
  },
  {
    id: "frame",
    family: "bikepacking",
    labelKey: "bagCatalog.category.frame",
    descriptionKey: "bagCatalog.category.frameDescription"
  },
  {
    id: "top-tube",
    family: "bikepacking",
    labelKey: "bagCatalog.category.topTube",
    descriptionKey: "bagCatalog.category.topTubeDescription"
  },
  {
    id: "fork",
    family: "bikepacking",
    labelKey: "bagCatalog.category.fork",
    descriptionKey: "bagCatalog.category.forkDescription"
  }
];

export const MANUFACTURER_BAG_CATALOG = [
  {
    id: "ortlieb-seat-pack-11-f9912",
    brand: "ORTLIEB",
    family: "bikepacking",
    category: "saddle",
    name: "Seat-Pack",
    variant: "11 L · black matt",
    sku: "F9912",
    weight: 345,
    volume: 11,
    loadKg: 3,
    dimensions: { width: 40, height: 26, depth: 15 },
    color: "black matt",
    waterproof: "IP64",
    material: "PU-coated Nylon (PS21R, PS33)",
    mounting: "Straps",
    imageUrl: "https://cdn.shopify.com/s/files/1/0850/0156/8588/files/productimage-f9912-front.jpg?v=1732788509&width=700",
    sourceUrl: "https://de.ortlieb.com/en/products/seat-pack",
    description: {
      en: "Variable-volume saddle bag for bikepacking.",
      ru: "Подседельная сумка с регулируемым объёмом для байкпакинга."
    },
    aliases: ["seat bag", "saddle bag", "подседельная", "седельная", "байкпакинг"]
  },
  {
    id: "ortlieb-handlebar-pack-9-f9933",
    brand: "ORTLIEB",
    family: "bikepacking",
    category: "handlebar",
    name: "Handlebar-Pack",
    variant: "9 L · dark sand",
    sku: "F9933",
    weight: 375,
    volume: 9,
    loadKg: 5,
    dimensions: { width: 40, height: 16, depth: 16 },
    color: "dark sand",
    waterproof: "IP64",
    material: "PU-coated Nylon (PS21R, PS33)",
    mounting: "Straps",
    imageUrl: "https://cdn.shopify.com/s/files/1/0850/0156/8588/files/productimage-f9933-front.jpg?v=1732787743&width=700",
    sourceUrl: "https://de.ortlieb.com/en/products/handlebar-pack",
    description: {
      en: "Compact handlebar roll for sleeping gear and light equipment.",
      ru: "Компактная рулевая сумка для спальника и лёгкого снаряжения."
    },
    aliases: ["handlebar bag", "handlebar roll", "рулевая", "на руль", "байкпакинг"]
  },
  {
    id: "ortlieb-frame-pack-rc-4-f9975",
    brand: "ORTLIEB",
    family: "bikepacking",
    category: "frame",
    name: "Frame-Pack RC",
    variant: "4 L · black matt",
    sku: "F9975",
    weight: 200,
    volume: 4,
    loadKg: 3,
    dimensions: { width: 40, height: 24, depth: 6 },
    color: "black matt",
    waterproof: "IP64",
    material: "PU-coated Nylon (PS21R, PS33)",
    mounting: "Straps",
    imageUrl: "https://cdn.shopify.com/s/files/1/0850/0156/8588/files/productimage-f9975-front.jpg?v=1732787518&width=700",
    sourceUrl: "https://de.ortlieb.com/en/products/frame-pack-rc",
    description: {
      en: "Frame bag with a roll closure and a wide opening.",
      ru: "Нарамная сумка с роллтопом и широким доступом к содержимому."
    },
    aliases: ["frame bag", "нарамная", "в раму", "рамная", "roll closure", "роллтоп"]
  },
  {
    id: "ortlieb-fuel-pack-1-f9963",
    brand: "ORTLIEB",
    family: "bikepacking",
    category: "top-tube",
    name: "Fuel-Pack",
    variant: "1 L · black matt",
    sku: "F9963",
    weight: 160,
    volume: 1,
    loadKg: 1,
    dimensions: { width: 21, height: 12, depth: 8.5 },
    color: "black matt",
    waterproof: "IP53",
    material: "PU-coated Nylon (PS21R, PS33)",
    mounting: "O-Straps / direct mount",
    imageUrl: "https://cdn.shopify.com/s/files/1/0850/0156/8588/files/productimage-f9963-front.jpg?v=1732787613&width=700",
    sourceUrl: "https://de.ortlieb.com/en/products/fuel-pack",
    description: {
      en: "Compact top-tube bag with one-handed magnetic closure.",
      ru: "Компактная сумка на верхнюю трубу с магнитной крышкой."
    },
    aliases: ["top tube", "toptube", "бензобак", "на верхнюю трубу", "кормушка"]
  },
  {
    id: "ortlieb-fork-pack-4-1-f9994",
    brand: "ORTLIEB",
    family: "bikepacking",
    category: "fork",
    name: "Fork-Pack",
    variant: "4.1 L · dark sand",
    sku: "F9994",
    weight: 290,
    volume: 4.1,
    loadKg: 3,
    dimensions: { width: 17.5, height: 28, depth: 11 },
    color: "dark sand",
    waterproof: "IP64",
    material: "PU-coated Nylon (PS21R, PS33)",
    mounting: "Quick-LockS",
    imageUrl: "https://cdn.shopify.com/s/files/1/0850/0156/8588/files/productimage-f9994-front.jpg?v=1753261625&width=700",
    sourceUrl: "https://de.ortlieb.com/en/products/fork-pack",
    description: {
      en: "Quick-release waterproof bag for a fork or vertical tube.",
      ru: "Водонепроницаемая быстросъёмная сумка на вилку или вертикальную трубу."
    },
    aliases: ["fork bag", "cargo cage", "на вилку", "вилочная", "quick-lock s", "qls"]
  },
  {
    id: "ortlieb-back-roller-core-f5006",
    brand: "ORTLIEB",
    family: "panniers",
    category: "pannier",
    name: "Back-Roller Core",
    variant: "20 L · red",
    sku: "F5006",
    weight: 820,
    volume: 20,
    loadKg: 9,
    dimensions: { width: 32, height: 42, depth: 17 },
    color: "red",
    waterproof: "IP64",
    material: "PVC-coated polyester (PD620, PS490)",
    mounting: "Quick-Lock2.1",
    imageUrl: "https://cdn.shopify.com/s/files/1/0850/0156/8588/files/productimage-f5006-front.jpg?v=1734974214&width=700",
    sourceUrl: "https://de.ortlieb.com/en/products/back-roller-core",
    description: {
      en: "Single waterproof rear pannier with a roll closure.",
      ru: "Одиночный водонепроницаемый задний панир с роллтопом."
    },
    aliases: ["rear pannier", "back roller", "задний панир", "багажник", "ql2.1"]
  },
  {
    id: "ortlieb-gravel-pack-single-f9987",
    brand: "ORTLIEB",
    family: "panniers",
    category: "pannier",
    name: "Gravel-Pack Single",
    variant: "14.5 L · black matt · QL3.1",
    sku: "F9987",
    weight: 540,
    volume: 14.5,
    loadKg: 9,
    dimensions: { width: 26, height: 37, depth: 12 },
    color: "black matt",
    waterproof: "IP64",
    material: "PU-coated Nylon (PS21R, PS33)",
    mounting: "Quick-Lock3.1",
    imageUrl: "https://cdn.shopify.com/s/files/1/0850/0156/8588/files/productimage-f9987-front.jpg?v=1734973420&width=700",
    sourceUrl: "https://de.ortlieb.com/en/products/gravel-pack-single",
    description: {
      en: "Lightweight single pannier for gravel and off-road touring.",
      ru: "Лёгкий одиночный панир для гравийных и внедорожных маршрутов."
    },
    aliases: ["gravel pannier", "single pannier", "гравийный панир", "багажник", "ql3.1"]
  }
];
