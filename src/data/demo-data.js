import { DEMO_SHARED_LAYOUT_ID } from "../config/constants.js";

export const REQUIRED_CHARGE_CATEGORY = "Требует заряда";

export const categories = [
  "Сон",
  "Одежда",
  "Кухня",
  "Еда",
  "Вода",
  "Ремонт",
  "Медицина",
  "Электроника",
  "Документы",
  "Гигиена",
  "Навигация",
  "Велозапчасти",
  "Инструменты",
  REQUIRED_CHARGE_CATEGORY,
  "Прочее"
];

export const locations = ["Дом", "Дача", "Уже на велосипеде", "Надо купить", "Не знаю где"];

export const sharedLayouts = [
  {
    id: "bikepacking-reference-bags",
    name: "Bikepacking reference",
  subtitle: "Шаблон",
    roots: [
      {
        id: "rockgeist-52-hz-frame-bag",
        name: "Frame Bag - Rockgeist 52 Hz",
        description: "Waterproof XL frame bag, 11 L.",
        weightGrams: 380,
        volumeLiters: 11,
        weightAlt: "14.1 oz",
        photoKind: "frame",
        items: []
      },
      {
        id: "bad-boy-bar-bag",
        name: "Handlebar Bag - The Bad Boy Bar Bag",
        description: "Large custom front bag, about 40-50 L.",
        weightGrams: 730,
        volumeLiters: 45,
        weightAlt: "1.6 lbs",
        photoKind: "bar",
        items: [
          {
            id: "padded-camera-insert",
            name: "Padded Camera Insert",
            description: "Padded insert for camera gear inside the hip pack.",
            weightGrams: 50,
            weightAlt: "1.8 oz",
            photoKind: "camera"
          },
          {
            id: "durston-wapta-30",
            name: "Packable Backpack - Durston Wapta 30",
            description: "Packable 30 L backpack for multi-day hikes.",
            weightGrams: 405,
            volumeLiters: 30,
            weightAlt: "14.3 oz",
            photoKind: "backpack"
          }
        ]
      },
      {
        id: "revelate-terrapin-14",
        name: "Seat Pack - Revelate Designs Terrapin 14L",
        description: "Stable waterproof seat pack, 14 L.",
        weightGrams: 560,
        volumeLiters: 14,
        weightAlt: "1.2 lbs",
        photoKind: "seat",
        items: []
      },
      {
        id: "tailfin-flip-15",
        name: "Top Tube Bag - Tailfin Flip 1.5 L",
        description: "Rainproof electronics bag with quick access.",
        weightGrams: 187,
        volumeLiters: 1.5,
        weightAlt: "6.6 oz",
        photoKind: "top",
        items: []
      },
      {
        id: "revelate-feeder-bags",
        name: "Feeder Bags - Revelate Designs",
        description: "Stem bags with stretchy side pockets.",
        weightGrams: 105,
        weightAlt: "3.7 oz each",
        photoKind: "feeder",
        items: []
      },
      {
        id: "rockgeist-big-dumpling",
        name: "Hip Pack - Rockgeist Big Dumpling",
        description: "Waterproof rolltop hip pack.",
        weightGrams: 377,
        weightAlt: "13.3 oz",
        photoKind: "hip",
        items: []
      },
      {
        id: "shared-small-gear",
        name: "Small gear",
        description: "Навесное и мелкие элементы этой укладки.",
        weightGrams: 0,
        weightAlt: "",
        photoKind: "bag",
        items: [
          {
            id: "oneup-composite-pedals",
            name: "Pedals - OneUp Components Composite",
            description: "Flat pedals for riding without clip-ins.",
            weightGrams: 350,
            weightAlt: "12.5 oz",
            photoKind: "pedals"
          },
          {
            id: "haute-twisted-t-rack",
            name: "Handlebar Rack - Haute Twisted T-Rack",
            description: "Support rack for a top-loading bar bag.",
            weightGrams: 155,
            weightAlt: "5.5 oz",
            photoKind: "rack"
          }
        ]
      }
    ],
    bags: [
      {
        id: "oneup-composite-pedals",
        name: "Pedals - OneUp Components Composite",
        description: "Flat pedals for riding without clip-ins.",
        weightGrams: 350,
        weightAlt: "12.5 oz",
        copyType: "item",
        photoKind: "pedals"
      },
      {
        id: "rockgeist-52-hz-frame-bag",
        name: "Frame Bag - Rockgeist 52 Hz",
        description: "Waterproof XL frame bag, 11 L.",
        weightGrams: 380,
        volumeLiters: 11,
        weightAlt: "14.1 oz",
        photoKind: "frame"
      },
      {
        id: "bad-boy-bar-bag",
        name: "Handlebar Bag - The Bad Boy Bar Bag",
        description: "Large custom front bag, about 40-50 L.",
        weightGrams: 730,
        volumeLiters: 45,
        weightAlt: "1.6 lbs",
        photoKind: "bar"
      },
      {
        id: "haute-twisted-t-rack",
        name: "Handlebar Rack - Haute Twisted T-Rack",
        description: "Support rack for a top-loading bar bag.",
        weightGrams: 155,
        weightAlt: "5.5 oz",
        copyType: "item",
        photoKind: "rack"
      },
      {
        id: "revelate-terrapin-14",
        name: "Seat Pack - Revelate Designs Terrapin 14L",
        description: "Stable waterproof seat pack, 14 L.",
        weightGrams: 560,
        volumeLiters: 14,
        weightAlt: "1.2 lbs",
        photoKind: "seat"
      },
      {
        id: "tailfin-flip-15",
        name: "Top Tube Bag - Tailfin Flip 1.5 L",
        description: "Rainproof electronics bag with quick access.",
        weightGrams: 187,
        volumeLiters: 1.5,
        weightAlt: "6.6 oz",
        photoKind: "top"
      },
      {
        id: "revelate-feeder-bags",
        name: "Feeder Bags - Revelate Designs",
        description: "Stem bags with stretchy side pockets.",
        weightGrams: 105,
        weightAlt: "3.7 oz each",
        photoKind: "feeder"
      },
      {
        id: "rockgeist-big-dumpling",
        name: "Hip Pack - Rockgeist Big Dumpling",
        description: "Waterproof rolltop hip pack.",
        weightGrams: 377,
        weightAlt: "13.3 oz",
        photoKind: "hip"
      },
      {
        id: "padded-camera-insert",
        name: "Padded Camera Insert",
        description: "Padded insert for camera gear inside the hip pack.",
        weightGrams: 50,
        weightAlt: "1.8 oz",
        copyType: "item",
        photoKind: "camera"
      },
      {
        id: "durston-wapta-30",
        name: "Packable Backpack - Durston Wapta 30",
        description: "Packable 30 L backpack for multi-day hikes.",
        weightGrams: 405,
        volumeLiters: 30,
        weightAlt: "14.3 oz",
        photoKind: "backpack"
      }
    ]
  }
];

export const bikepackingReferenceExtraRoots = [
  {
    id: "shared-shelter-sleep",
    name: "Shelter & sleep",
    description: "Tent, quilt, sleeping pad and camp basics.",
    weightGrams: 0,
    photoKind: "bag",
    items: [
      sharedGearItem("durston-x-dome-1-plus", "Tent - Durston X-Dome 1+", 980, "2.2 lbs", "Phenomenal tent; packed in a 6L dry sack and stored in the handlebar bag."),
      sharedGearItem("ee-enigma-10f-12c", "Quilt - Enlightened Equipment Enigma 10F/-12C", 628, "22.15 oz", "Excellent warmth-to-weight quilt, 950 down fill, stuffed into the seat pack."),
      sharedGearItem("big-agnes-rapide-sl-insulated", "Pad - Big Agnes Rapide SL Insulated", 482, "17 oz", "Comfortable lightweight inflatable pad, stored in the seat pack."),
      sharedGearItem("nemo-fillo-elite", "Pillow - Nemo Fillo Elite", 120, "4.2 oz", "Modified with memory foam for more cushion, stored in the seat pack."),
      sharedGearItem("sea-to-summit-airlite-towel", "Towel - Sea to Summit Airlite", 48, "1.7 oz", "Tiny lightweight towel, stored in the front pocket of the handlebar bag."),
      sharedGearItem("tentlab-deuce-2", "Camp Trowel - TheTentLab Deuce #2", 17, "0.6 oz", "Tiny titanium trowel, stored with toilet paper in a waterproof bag."),
      sharedGearItem("universal-sink-plug", "Universal Sink Plug", 10, "0.3 oz", "Small laundry helper, stored with the toiletries bag."),
      sharedGearItem("peak-design-packing-cube-xxs", "Toiletries Bag - Peak Design Packing Cube XXS", 200, "7.1 oz", "Small toiletries kit for basics, stored in the seat pack.")
    ]
  },
  {
    id: "shared-riding-clothing",
    name: "Riding clothing",
    description: "Clothes worn on the bike and packed layers.",
    weightGrams: 0,
    photoKind: "bag",
    items: [
      sharedGearItem("isobaa-merino-riding-shirt", "Riding Shirt - Isobaa Merino", 180, "6.3 oz", "Merino riding shirt for warm and wet conditions."),
      sharedGearItem("ornot-lightweight-mission-shorts", "Riding Shorts - Ornot Lightweight Mission", 200, "7.1 oz", "Lightweight riding shorts."),
      sharedGearItem("bedrock-cairn-evo-3d-pro", "Riding Footwear - Bedrock Cairn Evo 3D Pro", 500, "1.1 lbs", "Sandals for warm weather and river crossings."),
      sharedGearItem("paka-active-brief", "Underwear - Paka Active 6\" Brief", 100, "3.5 oz each", "Alpaca underwear for cycling, carried as three pairs."),
      sharedGearItem("gripgrab-supergel-gloves", "Riding Gloves - GripGrab SuperGel", 150, "5.3 oz", "Comfortable padded riding gloves."),
      sharedGearItem("giro-manifest-spherical", "Helmet - Giro Manifest Spherical", 346, "12.2 oz", "Comfortable ventilated helmet for daily riding."),
      sharedGearItem("ombraz-viale", "Sunglasses - Ombraz Viale", 22, "0.8 oz", "Armless sunglasses with comfortable lenses."),
      sharedGearItem("bedrock-split-toe-socks", "Socks - Bedrock Split-Toe", 80, "2.8 oz", "Split-toe socks for sandals, stored in seat pack and handlebar pouch."),
      sharedGearItem("merino-wool-buff", "Buff - Merino Wool", 50, "1.8 oz", "Dust, sun and warmth layer; doubles as a hat."),
      sharedGearItem("ornot-lightweight-mission-trousers", "Trousers - Ornot Lightweight Mission", 250, "8.8 oz", "Technical trousers for evenings and days off."),
      sharedGearItem("ee-torrid-puffy", "Puffy - Enlightened Equipment Torrid", 223, "7.86 oz", "Warm synthetic layer that still works when wet."),
      sharedGearItem("montbell-versalite-rain-jacket", "Rain Jacket - Montbell Versalite", 182, "6.4 oz", "Tiny packable rain jacket with pit zips."),
      sharedGearItem("waterproof-socks", "Waterproof Socks", 120, "4.2 oz", "Warm backup socks for cold wet conditions."),
      sharedGearItem("senchi-designs-a90", "Midlayer - Senchi Designs A90", 125, "4.4 oz", "Very light warm midlayer, stored in the front pouch."),
      sharedGearItem("defeet-duragloves", "Warm Gloves - DeFeet DuraGloves", 70, "2.5 oz", "Wool gloves that still help when soaked."),
      sharedGearItem("isobaa-merino-long-sleeve", "Long Sleeved Top - Isobaa Merino", 180, "6.3 oz", "Spare long-sleeved merino top for evenings or days off.")
    ]
  },
  {
    id: "shared-electronics-media",
    name: "Electronics & media",
    description: "Navigation, cameras, storage, charging and small electronics.",
    weightGrams: 0,
    photoKind: "bag",
    items: [
      sharedGearItem("coros-dura-bike-computer", "Bike Computer - Coros Dura", 100, "3.5 oz", "Long-battery bike computer attached with an out-front mount."),
      sharedGearItem("fuji-x100vi", "Camera 1 - Fuji X100VI", 521, "1.2 lbs", "Compact fixed-lens camera with spare batteries."),
      sharedGearItem("dji-pocket-3", "Camera 2 - DJI Pocket 3", 195, "6.9 oz", "Small vlogging and gimbal camera."),
      sharedGearItem("aoka-carbon-tripod", "Tripod - Aoka Carbon", 500, "1.1 lbs", "Light full-sized tripod, stored in the front handlebar pouch."),
      sharedGearItem("dji-mini-5-pro", "Drone 1 - DJI Mini 5 Pro with RC2", 750, "1.7 lbs", "Drone and remote, with one spare battery."),
      sharedGearItem("hoverair-pro-max", "Drone 2 - HOVERAir Pro Max", 257, "9.1 oz", "Fast-deploy follow-shot drone with spare battery."),
      sharedGearItem("macbook-air-m4", "Laptop - MacBook Air M4", 1240, "2.7 lbs", "Light video-editing laptop in a padded handlebar-bag case."),
      sharedGearItem("sandisk-extreme-memory-cards", "Memory Cards - Sandisk Extreme", 2, "0.1 oz", "Memory cards for cameras, plus spares stored with the laptop."),
      sharedGearItem("samsung-t7-2tb", "SSD - Samsung T7 2TB", 57, "2 oz", "Backup storage for laptop and camera footage."),
      sharedGearItem("dji-mic-3", "Microphone - DJI Mic 3", 221, "7.8 oz", "Audio kit for filming, stored in frame/top tube bags."),
      sharedGearItem("soundcore-liberty-4", "Headphones 1 - Anker Soundcore Liberty 4", 60, "2.1 oz", "Noise-cancelling earbuds for wind and travel."),
      sharedGearItem("shokz-openfit", "Headphones 2 - Shokz OpenFit", 60, "2.1 oz", "Open-ear headphones for quiet roads."),
      sharedGearItem("iphone-17-pro", "Smartphone - iPhone 17 Pro", 206, "7.3 oz", "High-end phone in a Peak Design case."),
      sharedGearItem("peak-design-out-front-phone-mount", "Phone Bar Mount - Peak Design Out Front", 93, "3.3 oz", "Magnetic handlebar mount for quick phone attachment."),
      sharedGearItem("peak-design-mobile-tripod", "Mobile Tripod - Peak Design", 76, "2.7 oz", "Phone tripod for quick on-the-go shots."),
      sharedGearItem("coros-vertix-2s", "Watch - Coros Vertix 2S", 70, "2.5 oz", "Smartwatch paired with the bike computer."),
      sharedGearItem("inui-20000-power-banks", "Power Banks - INIU 20,000 mAh", 326, "11.5 oz each", "Two power banks for one to two weeks of charging."),
      sharedGearItem("iniu-65w-wall-charger", "Wall Charger - INIU 65W PD", 115, "4.1 oz", "Fast USB wall charger with multiple ports."),
      sharedGearItem("fenix-hm50r-v20", "Headtorch - Fenix HM50R V2.0", 78, "2.75 oz", "USB rechargeable headtorch with long battery life."),
      sharedGearItem("kindle-paperwhite", "Ereader - Kindle Paperwhite", 211, "7.4 oz", "Backlit e-reader for tent reading."),
      sharedGearItem("hummingbird-mk1", "Beard Trimmer - Hummingbird MK1", 118, "4.16 oz", "Tiny travel beard trimmer."),
      sharedGearItem("cateye-wearable-x", "Red Light Blinkie - Cateye Wearable X", 20, "0.7 oz", "Small rear light for rare night riding.")
    ]
  },
  {
    id: "shared-cooking-water",
    name: "Cooking, water & food",
    description: "Water storage, stove kit and food basics.",
    weightGrams: 0,
    photoKind: "bag",
    items: [
      sharedGearItem("platypus-quickdraw", "Water Filter - Platypus QuickDraw", 63, "2.2 oz", "Fast-flow water filter, stored in the side pouch of the handlebar bag."),
      sharedGearItem("water-storage-bottles", "Water Storage - Bottles", 106, "3.75 oz", "Four one-litre bottles around the bike."),
      sharedGearItem("trail-designs-sidewinder-ti-tri", "Stove - Trail Designs Sidewinder Ti-Tri", 40, "1.4 oz", "Efficient alcohol stove and windscreen."),
      sharedGearItem("trail-designs-kojin", "Burner - Trail Designs Kojin", 17, "0.6 oz", "Alcohol burner stored inside the pot."),
      sharedGearItem("evernew-900ml-titanium-pot", "Pot - Evernew 900 ml Titanium", 115, "4.06 oz", "900 ml titanium pot stored in the food bag."),
      sharedGearItem("home-made-pot-cosy", "Pot Cosy - Home Made", 50, "1.8 oz", "Simple pot cosy for camp cooking."),
      sharedGearItem("snow-peak-titanium-spork", "Spork - Snow Peak Titanium", 16, "0.6 oz", "Two titanium sporks, one in hip pack and one in food bag."),
      sharedGearItem("inside-pot-extras", "Inside the Pot - Extras", 90, "3.2 oz", "Dish brush, dish cloth, lighter and small pot of salt."),
      sharedGearItem("cnoc-2l-water-bladder", "Water Bladder - CNOC 2L", 76, "2.7 oz", "Two-litre bladder used with the water filter."),
      sharedGearItem("food", "Food", 0, "", "Food stored between frame bag and handlebar bag, with extra capacity in a 30L backpack.")
    ]
  },
  {
    id: "shared-tools-repair",
    name: "Tools, repair & safety",
    description: "Bike tools, repair kits, first aid and small safety items.",
    weightGrams: 0,
    photoKind: "bag",
    items: [
      sharedGearItem("topeak-ratchet-rocket-lite-dx", "Tool Kit - Topeak Ratchet Rocket Lite DX", 180, "6.3 oz", "Ratchet kit with bits and adjusters, stored in top tube bag."),
      sharedGearItem("benchmade-bugout", "Pocket Knife - Benchmade Bugout", 52, "1.85 oz", "Small pocket knife for quick access."),
      sharedGearItem("victorinox-handyman", "Swiss Army Knife - Victorinox Handyman", 155, "5.5 oz", "Favourite Victorinox with scissors, file, saw, pliers and can opener."),
      sharedGearItem("abus-bordo-lite-6055", "Bike Lock - ABUS Bordo Lite 6055 (85 cm)", 500, "1.1 lbs", "Compact bike lock stored on the downtube."),
      sharedGearItem("click-stand", "Bike Stand - Click-Stand", 75, "2.6 oz", "Light stand for keeping the bike upright."),
      sharedGearItem("cycplus-as2-ultra", "E-Pump - CYCPLUS AS2 Ultra", 105, "3.7 oz", "Tiny electronic pump with pressure gauge."),
      sharedGearItem("lezyne-pocket-drive-hv", "Backup Pump - Lezyne Pocket Drive HV", 89, "3.1 oz", "Light backup pump for expeditions."),
      sharedGearItem("tubeless-repair-kit", "Tubeless Repair Kit", 100, "3.5 oz", "Tube, plugs, boot, sealant, valve core remover and tyre levers."),
      sharedGearItem("chain-maintenance-kit", "Chain Maintenance Kit", 100, "3.5 oz", "Dry lube and rag for chain cleaning."),
      sharedGearItem("sewing-kit", "Sewing Kit", 30, "1.1 oz", "Basic sewing kit plus curved upholstery needle."),
      sharedGearItem("first-aid-kit", "First Aid Kit", 100, "3.5 oz", "Basic first aid kit in a waterproof bag."),
      sharedGearItem("general-repair-kit", "General Repair Kit", 100, "3.5 oz", "Tape, cable ties, pad patches, buckles and spare bolts."),
      sharedGearItem("pinion-lockring-tool", "Pinion Lockring Tool", 50, "1.8 oz", "Pinion-specific lockring tool for front chainring or sprocket."),
      sharedGearItem("lezyne-multi-chain-pliers", "Lezyne Multi-Chain Pliers", 60, "2.1 oz", "Chain-breaker, disc rotor aligner and quick-link pliers.")
    ]
  }
];

bikepackingReferenceExtraRoots.forEach((root) => sharedLayouts[0].roots.push(root));
sharedLayouts[0].bags.push(
  ...bikepackingReferenceExtraRoots.flatMap((root) =>
    root.items.map((item) => ({ ...item, copyType: "item" }))
  )
);

export function sharedGearItem(id, name, weightGrams, weightAlt, description) {
  return {
    id,
    name,
    description,
    weightGrams,
    weightAlt,
    photoKind: "bag"
  };
}

export const demoSharedLayout = {
  id: DEMO_SHARED_LAYOUT_ID,
  name: "Демо-укладка",
  subtitle: "Демо для всех",
  roots: [],
  statePayload: null,
  statePayloadByLanguage: {}
};
