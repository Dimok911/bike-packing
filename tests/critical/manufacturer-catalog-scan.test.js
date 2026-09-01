import test from "node:test";
import assert from "node:assert/strict";
import "./manufacturer-catalog-review.test.js";
import {
  buildManufacturerCatalogScanReport,
  compareManufacturerCatalogSnapshots,
} from "../../src/data/manufacturer-catalog-scan.js";
import { MANUFACTURER_CATALOG_SOURCES } from "../../src/data/manufacturer-catalog-sources.js";
import {
  buildTailfinCatalogEntry,
  tailfinCatalogTargets,
} from "../../scripts/manufacturer-catalog/tailfin-adapter.mjs";
import {
  apiduraCatalogTargets,
  buildApiduraCatalogEntry,
} from "../../scripts/manufacturer-catalog/apidura-adapter.mjs";
import {
  buildRestrapCatalogEntry,
  restrapCatalogTargets,
} from "../../scripts/manufacturer-catalog/restrap-adapter.mjs";
import { validateManufacturerCatalogImport } from "../../scripts/validate-manufacturer-catalog-import.mjs";
import { manufacturerCatalogBaselineEntries } from "../../scripts/promote-manufacturer-catalog-baseline.mjs";

const bag = (id, brand, extra = {}) => ({
  id,
  brand,
  name: id,
  sourceUrl: `https://example.test/${id}`,
  volume: 20,
  mountingOptions: ["Quick-Lock2.1"],
  variants: [],
  ...extra,
});

test("CRITICAL catalog scan: detects additions, changes, and missing models without deleting evidence", () => {
  const result = compareManufacturerCatalogSnapshots(
    [bag("ortlieb-old", "ORTLIEB"), bag("ortlieb-back-roller", "ORTLIEB")],
    [bag("ortlieb-back-roller", "ORTLIEB", { mountingOptions: ["Quick-Lock2.1", "Quick-Lock3.1"] }), bag("arkel-new", "Arkel")]
  );
  assert.equal(result.changes.filter((item) => item.type === "added").length, 1);
  assert.equal(result.changes.filter((item) => item.type === "changed").length, 1);
  assert.equal(result.changes.filter((item) => item.type === "missing").length, 1);
  const missing = result.changes.find((item) => item.type === "missing");
  assert.equal(missing.before.id, "ortlieb-old");
  assert.equal(missing.after, null);
});

test("CRITICAL catalog scan: verification dates alone do not create material changes", () => {
  const before = bag("ortlieb-back-roller", "ORTLIEB", { sourceCheckedAt: "2026-07-30" });
  const after = bag("ortlieb-back-roller", "ORTLIEB", { sourceCheckedAt: "2026-08-30" });
  const result = compareManufacturerCatalogSnapshots([before], [after]);
  assert.equal(result.unchanged, 1);
  assert.deepEqual(result.changes, []);
});

test("CRITICAL catalog scan: set-volume basis changes require review", () => {
  const before = bag("arkel-set", "Arkel", {
    soldAsSet: true,
    setQuantity: 2,
    totalVolume: 54,
    volumeSetBasis: "composite-set",
  });
  const after = { ...before, volumeSetBasis: "equal-bags", volumePerBag: 27 };
  const result = compareManufacturerCatalogSnapshots([before], [after]);
  const change = result.changes.find(({ productId }) => productId === before.id);
  assert.deepEqual(change.fields.map(({ field }) => field), ["volumePerBag", "volumeSetBasis"]);
});

test("CRITICAL catalog scan: report keeps manufacturer adapters independent", () => {
  const report = buildManufacturerCatalogScanReport({
    approvedEntries: [bag("ortlieb-one", "ORTLIEB")],
    scannedEntries: [bag("ortlieb-one", "ORTLIEB"), bag("arkel-one", "Arkel")],
    manufacturers: MANUFACTURER_CATALOG_SOURCES,
    scannedAt: "2026-08-30T09:00:00.000Z",
  });
  assert.equal(report.manufacturers.length, 5);
  assert.equal(report.manufacturers.find((item) => item.id === "ortlieb").sourceCount, 6);
  assert.equal(report.manufacturers.find((item) => item.id === "arkel").sourceCount, 1);
  assert.equal(report.manufacturers.find((item) => item.id === "tailfin").sourceCount, 1);
  assert.equal(report.manufacturers.find((item) => item.id === "apidura").sourceCount, 1);
  assert.equal(report.manufacturers.find((item) => item.id === "restrap").sourceCount, 7);
  assert.equal(report.summary.added, 1);
});

test("CRITICAL catalog scan: a future manufacturer is not folded into an existing brand", () => {
  const report = buildManufacturerCatalogScanReport({
    approvedEntries: [],
    scannedEntries: [bag("new-brand-one", "New Brand")],
    manufacturers: [{ id: "new-brand", name: "New Brand", collections: [["new-brand.json", "https://example.test/products.json"]] }],
    scannedAt: "2026-08-30T09:00:00.000Z",
  });
  assert.equal(report.manufacturers[0].productCount, 1);
  assert.equal(report.changes[0].manufacturerId, "new-brand");
});

test("CRITICAL catalog scan: absent optional values and explicit nulls are equivalent", () => {
  const before = bag("tailfin-new", "Tailfin", {
    volumePerBag: null,
    weightMin: null,
    waterproofRating: null,
  });
  const after = bag("tailfin-new", "Tailfin");
  const result = compareManufacturerCatalogSnapshots([before], [after]);
  assert.equal(result.unchanged, 1);
  assert.deepEqual(result.changes, []);
});

test("CRITICAL catalog scan: non-breaking spaces do not create review noise", () => {
  const before = bag("apidura-existing", "Apidura", {
    manufacturerDetails: "Hexalon developed for Apidura. PFAs and PFC-free.",
  });
  const after = bag("apidura-existing", "Apidura", {
    manufacturerDetails: "Hexalon developed for\u00a0Apidura. PFAs and PFC-free.",
  });
  const result = compareManufacturerCatalogSnapshots([before], [after]);
  assert.equal(result.unchanged, 1);
  assert.deepEqual(result.changes, []);
});

test("CRITICAL catalog scan: all official image URLs are reviewable and the Action stores the image snapshot", () => {
  const before = bag("ortlieb-gallery", "ORTLIEB", {
    sourceImageUrls: ["https://cdn.shopify.com/front.jpg"]
  });
  const after = bag("ortlieb-gallery", "ORTLIEB", {
    sourceImageUrls: ["https://cdn.shopify.com/front.jpg", "https://cdn.shopify.com/side.jpg"]
  });
  const result = compareManufacturerCatalogSnapshots([before], [after]);
  assert.deepEqual(result.changes[0].fields.map(({ field }) => field), ["sourceImageUrls"]);
});

test("CRITICAL catalog scan: Tailfin adapter discovers only official bag product pages", () => {
  const targets = tailfinCatalogTargets(`
    <a href="/us/cargopack/">CargoPack</a>
    <a href="https://www.tailfin.cc/us/product/frame-bags/half-frame-bag/">Half Frame Bag</a>
    <a href="/us/product/pannier-rack-top-bags/fork-packs/fork-packs/">Fork Packs</a>
    <a href="/us/product/accessories/bar-bag-accessories/">Accessory</a>
    <a href="https://example.test/us/product/frame-bags/not-official/">Other host</a>
  `);
  assert.deepEqual(targets.map(({ handle }) => handle), ["cargopack", "fork-packs", "half-frame-bag"]);
  assert.ok(targets.every(({ url }) => url.startsWith("https://www.tailfin.cc/us/")));
});

test("CRITICAL catalog scan: Apidura adapter discovers bags and excludes accessories and on-body products", () => {
  const targets = apiduraCatalogTargets(`<urlset>
    <url><loc>https://www.apidura.com/shop/expedition-saddle-pack/</loc></url>
    <url><loc>https://www.apidura.com/shop/aero-frame-module/</loc></url>
    <url><loc>https://www.apidura.com/shop/expedition-stem-pack/</loc></url>
    <url><loc>https://www.apidura.com/shop/backcountry-food-pouch/</loc></url>
    <url><loc>https://www.apidura.com/shop/expedition-front-rack-pack/</loc></url>
    <url><loc>https://www.apidura.com/shop/hydration-vest/</loc></url>
    <url><loc>https://www.apidura.com/shop/frame-pack-hydration-bladder/</loc></url>
    <url><loc>https://www.apidura.com/shop/frame-pack-replacement-strap/</loc></url>
    <url><loc>https://example.test/shop/foreign-frame-pack/</loc></url>
  </urlset>`);
  assert.deepEqual(targets.map(({ handle }) => handle), [
    "aero-frame-module",
    "backcountry-food-pouch",
    "expedition-front-rack-pack",
    "expedition-saddle-pack",
    "expedition-stem-pack",
  ]);
  assert.ok(targets.every(({ url }) => url.startsWith("https://www.apidura.com/shop/")));
});

test("CRITICAL catalog scan: Apidura anti-bot HTML fails closed instead of reporting an empty catalog", () => {
  assert.throws(
    () => apiduraCatalogTargets('<meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=sitemap">'),
    /anti-bot challenge/
  );
});

test("CRITICAL catalog scan: Restrap adapter keeps bags and excludes ordering aids and duplicate charity editions", () => {
  const targets = restrapCatalogTargets([
    { handle: "saddle-pack-4-5l", title: "Saddle Pack (4.5 Litres)", vendor: "Restrap", product_type: "Saddle Bags" },
    { handle: "switch-pannier-5-litres", title: "Switch Pannier (5 Litres)", vendor: "Restrap", product_type: "All" },
    { handle: "race-musette", title: "Race Musette (3 Litres)", vendor: "Restrap", product_type: "Accessories" },
    { handle: "custom-frame-bag-design-kit", title: "Custom Frame Bag Design Kit", vendor: "Restrap", product_type: "Frame Bags" },
    { handle: "yorkshire-dales-charity-musette", title: "Yorkshire Dales Charity Musette", vendor: "Restrap", product_type: "All" },
    { handle: "foreign-saddle-bag", title: "Foreign Saddle Bag", vendor: "Another", product_type: "Saddle Bags" },
  ]);
  assert.deepEqual(targets.map(({ handle }) => handle), ["race-musette", "saddle-pack-4-5l", "switch-pannier-5-litres"]);
});

test("CRITICAL catalog scan: Restrap adapter normalizes official metrics, variants, ratings, and gallery", () => {
  const entry = buildRestrapCatalogEntry({
    checkedAt: "2026-09-02",
    sourceUrl: "https://restrap.com/products/saddle-pack-4-5l",
    product: {
      handle: "saddle-pack-4-5l",
      title: "Saddle Pack (4.5 Litres)",
      vendor: "Restrap",
      product_type: "Saddle Bags",
      tags: ["4.5L", "IP6K6", "waterproof"],
      body_html: "<p>1000D textured nylon and TPU-coated nylon.</p><p>Product Weight - 280g</p><p>Capacity - 4.5L</p>",
      variants: [
        { title: "Black", sku: "RS_SPK_45L_BLK", grams: 331, available: true },
        { title: "Olive", sku: "RS_SPK_45L_OLV", grams: 331, available: true },
      ],
      images: [
        { src: "https://cdn.shopify.com/s/files/1/restrap-front.jpg?v=1" },
        { src: "https://cdn.shopify.com/s/files/1/restrap-side.jpg?v=1" },
      ],
    },
  });
  assert.equal(entry.id, "restrap-saddle-pack-4-5l");
  assert.equal(entry.category, "saddle");
  assert.deepEqual(entry.volumeOptions, [4.5]);
  assert.deepEqual(entry.weightOptions, [280]);
  assert.ok(entry.variants.every(({ weight }) => weight === 280));
  assert.equal(entry.waterproof, "IP6K6");
  assert.equal(entry.waterproofRating, "IP6K6");
  assert.match(entry.material, /1000D nylon/);
  assert.equal(entry.sourceImageUrls.length, 2);
  assert.ok(entry.sourceImageUrls.every((url) => /width=700/.test(url)));
  assert.ok(entry.imageAssetPaths.every((path) => /^assets\/manufacturer-catalog\/restrap\//.test(path)));
});

test("CRITICAL catalog scan: checked imports accept only complete official manufacturer evidence", () => {
  const report = {
    schemaVersion: 1,
    id: "catalog-scan-checked",
    scannedAt: "2026-08-30T18:55:40.000Z",
    status: "complete",
    manufacturers: [{ id: "apidura", name: "Apidura", status: "complete", errors: [] }],
    summary: { products: 1, added: 1, changed: 0, missing: 0, errors: 0 },
    changes: [{
      id: "apidura:added:apidura-racing-frame-pack",
      manufacturerId: "apidura",
      type: "added",
      sourceUrl: "https://www.apidura.com/shop/racing-frame-pack/",
    }],
  };
  assert.equal(validateManufacturerCatalogImport(report).changes, 1);
  assert.throws(
    () => validateManufacturerCatalogImport({ ...report, changes: [{ ...report.changes[0], sourceUrl: "https://example.test/frame-pack/" }] }),
    /does not match apidura/
  );
  assert.throws(
    () => validateManufacturerCatalogImport({ ...report, status: "partial" }),
    /must be complete/
  );
});

test("CRITICAL catalog scan: first manufacturer snapshot becomes baseline without accepting unrelated changes", () => {
  const existing = [
    { id: "ortlieb-existing", brand: "ORTLIEB", imageAssetPaths: ["assets/manufacturer-catalog/ortlieb/existing.jpg"] },
    { id: "tailfin-stale", brand: "Tailfin", imageAssetPaths: ["assets/manufacturer-catalog/tailfin/stale.jpg"] },
  ];
  const report = {
    changes: [
      { type: "added", manufacturerId: "tailfin", after: { id: "tailfin-new", brand: "Tailfin", sourceUrl: "https://www.tailfin.cc/us/new/", sourceImageUrls: ["https://media.tailfin.cc/new.jpeg"], variants: [{ sku: "TF-NEW" }] } },
      { type: "added", manufacturerId: "apidura", after: { id: "apidura-new", brand: "Apidura", sourceUrl: "https://www.apidura.com/shop/new/", sourceImageUrls: ["https://medias.apidura.com/new.webp"], variants: [{ sku: "AP-NEW" }] } },
      { type: "changed", manufacturerId: "ortlieb", after: { id: "ortlieb-existing", brand: "ORTLIEB", name: "Unexpected source change" } },
      { type: "added", manufacturerId: "arkel", after: { id: "arkel-pending", brand: "Arkel", imageAssetPaths: ["assets/manufacturer-catalog/arkel/pending.jpg"] } },
    ],
  };
  const promoted = manufacturerCatalogBaselineEntries(existing, report, ["tailfin", "apidura"]);
  assert.deepEqual(promoted.map(({ id }) => id), ["ortlieb-existing", "apidura-new", "tailfin-new"]);
  assert.equal(promoted[0].name, undefined);
  assert.deepEqual(promoted[1].imageAssetPaths, ["assets/manufacturer-catalog/apidura/new.webp"]);
  assert.deepEqual(promoted[2].imageAssetPaths, ["assets/manufacturer-catalog/tailfin/new.jpg"]);
  assert.equal(promoted[1].variantCount, 1);
  assert.equal(promoted[2].variantCount, 1);
});

test("CRITICAL catalog scan: Apidura adapter keeps size weights, technical details, and the full product gallery", () => {
  const entry = buildApiduraCatalogEntry({
    checkedAt: "2026-08-30",
    sourceUrl: "https://www.apidura.com/shop/expedition-saddle-pack/",
    product: {
      slug: "expedition-saddle-pack",
      name: "Expedition Saddle Pack",
      sku: "PE0-0000-000",
      is_in_stock: true,
      short_description: "Stable, spacious storage for multi-day bikepacking trips.",
      images: [
        { src: "https://medias.apidura.com/2026/08/expedition-saddle-front.jpg" },
        { src: "https://medias.apidura.com/2026/08/expedition-saddle-side.jpg" },
      ],
    },
    html: `<main><h1>Expedition Saddle Pack</h1>
      <img src="https://medias.apidura.com/2026/08/expedition-saddle-riding.jpg">
      <img src="https://medias.apidura.com/2026/08/expedition-grade-fabric-icon.png">
      <h3>Materials &amp; Technology</h3><p>Expedition Grade Fabric</p><p>100% waterproof and ultra durable construction.</p>
      <h3>Product Information</h3><p>Weight</p><p>– 9L: 379g<br>– 13L: 439g<br>– 16L: 462g</p>
      <p>Attachment System – saddle rails and seatpost</p><p>Waterproofing – Seam Welded</p>
      <h3>Care &amp; Maintenance</h3>
      <section class="related-posts"><img src="https://medias.apidura.com/2026/08/unrelated-frame-pack.jpg"></section>
    </main>`,
  });
  assert.equal(entry.id, "apidura-expedition-saddle-pack");
  assert.equal(entry.category, "saddle");
  assert.deepEqual(entry.volumeOptions, [9, 13, 16]);
  assert.deepEqual(entry.weightOptions, [379, 439, 462]);
  assert.deepEqual(entry.variants.map(({ weight }) => weight), [379, 439, 462]);
  assert.equal(entry.waterproof, "Waterproof");
  assert.match(entry.manufacturerDetails, /Attachment System/);
  assert.equal(entry.sourceImageUrls.length, 3);
  assert.ok(entry.imageAssetPaths.every((path) => /^assets\/manufacturer-catalog\/apidura\//.test(path)));
});

test("CRITICAL catalog scan: Apidura named sizes pair capacity with the product-only weight", () => {
  const entry = buildApiduraCatalogEntry({
    checkedAt: "2026-08-30",
    sourceUrl: "https://www.apidura.com/shop/aero-frame-module/",
    product: { slug: "aero-frame-module", name: "Aero Frame Module" },
    html: `<main><h1>Aero Frame Module</h1>
      <img src="https://medias.apidura.com/2026/08/aero-frame-module.jpg">
      <h3>Product Information</h3><p>Weight<br>
      – Frame module (Small) – 169g<br>– Frame module (Medium) – 205g<br>– Frame module (Large) – 235g</p>
      <p>Total System Weight<br>– Aero System (Small) – 269g<br>– Aero System (Medium) – 305g<br>– Aero System (Large) – 335g</p>
      <p>Capacity<br>– Frame module (Small) – 1.1L<br>– Frame module (Medium) – 1.5L<br>– Frame module (Large) – 2.8L</p>
      <h3>Care &amp; Maintenance</h3>
    </main>`,
  });
  assert.deepEqual(entry.volumeOptions, [1.1, 1.5, 2.8]);
  assert.deepEqual(entry.weightOptions, [169, 205, 235]);
  assert.deepEqual(entry.variants.map(({ weight }) => weight), [169, 205, 235]);
  assert.equal(entry.variantWeightsAuthoritative, true);
});

test("CRITICAL catalog scan: Apidura names use the collection and heading instead of SEO suffixes", () => {
  const entry = buildApiduraCatalogEntry({
    checkedAt: "2026-08-30",
    sourceUrl: "https://www.apidura.com/shop/backcountry-food-pouch/",
    product: { slug: "backcountry-food-pouch", name: "backcountry food pouch" },
    html: `<html><head><meta property="og:title" content="Backcountry Food Pouch | Bike Feed Bag"></head>
      <body><main><h1>Food Pouch (0.8L)</h1>
      <img src="https://medias.apidura.com/2026/08/backcountry-food-pouch.jpg">
      <h3>Product Information</h3><p>Weight – 55g</p><h3>Care &amp; Maintenance</h3>
      </main></body></html>`,
  });
  assert.equal(entry.name, "Backcountry Food Pouch (0.8L)");
});

test("CRITICAL catalog scan: Apidura notes exclude locale-specific storefront controls", () => {
  const entry = buildApiduraCatalogEntry({
    sourceUrl: "https://www.apidura.com/shop/apidura-x-canyon-frame-pack/",
    product: { slug: "apidura-x-canyon-frame-pack", name: "Apidura x Canyon Frame Pack" },
    html: `<main><h1>Apidura x Canyon Frame Pack</h1>
      <p>$ 160.00</p><p>Limit reached 0</p><p>Add To Cart</p>
      <img src="https://medias.apidura.com/2026/08/canyon-frame-pack.jpg">
      <h2>Description</h2><p>A durable lightweight frame bag.</p>
      <h2>Technical</h2><p>Hexalon&nbsp;waterproof laminate.</p></main>`,
  });
  assert.match(entry.manufacturerDetails, /^Description\b/);
  assert.match(entry.manufacturerDetails, /Hexalon waterproof laminate/);
  assert.doesNotMatch(entry.manufacturerDetails, /\$ 160|Add To Cart|Limit reached/);
});

test("CRITICAL catalog scan: Tailfin adapter preserves sizes, technical details, and every product image", () => {
  const entry = buildTailfinCatalogEntry({
    sourceUrl: "https://www.tailfin.cc/us/product/frame-bags/half-frame-bag/",
    checkedAt: "2026-08-30",
    html: `
      <html><head>
        <meta name="description" content="Waterproof frame storage for long rides.">
        <script type="application/ld+json">{
          "@type":"Product","name":"Half Frame Bag","sku":"TF-HFB",
          "image":["https://media.tailfin.cc/app/uploads/2026/08/half-frame-front.jpg"],
          "offers":{"availability":"https://schema.org/InStock"}
        }</script>
      </head><body><main>
        <h1>Half Frame Bag</h1>
        <img data-large_image="https://media.tailfin.cc/app/uploads/2026/08/half-frame-side.jpg">
        <img src="https://media.tailfin.cc/app/uploads/2026/08/tailfin-logo.png">
        <section id="specifications"><h2>Specifications</h2>
          <h3>2.3 Litres</h3><p>Weight 248g including Straps</p>
          <h3>3.0 Litres</h3><p>Weight 290g including Straps</p>
          <p>Construction 210D Hypalon &amp; 210D Diamond RipStop</p>
          <p>100% Waterproof</p>
        </section><h2>Media Reviews</h2><img src="https://media.tailfin.cc/app/uploads/2026/08/unrelated-review.jpg">
      </main></body></html>
    `,
  });
  assert.equal(entry.id, "tailfin-half-frame-bag");
  assert.equal(entry.brand, "Tailfin");
  assert.equal(entry.category, "frame");
  assert.deepEqual(entry.volumeOptions, [2.3, 3]);
  assert.deepEqual(entry.weightOptions, [248, 290]);
  assert.equal(entry.variants.length, 2);
  assert.equal(entry.waterproof, "Waterproof");
  assert.match(entry.material, /210D Hypalon/);
  assert.match(entry.manufacturerDetails, /Specifications/);
  assert.equal(entry.sourceImageUrls.length, 2);
  assert.ok(entry.imageAssetPaths.every((path) => /^assets\/manufacturer-catalog\/tailfin\//.test(path)));
});

test("CRITICAL catalog scan: Tailfin adapter excludes pocket capacity and load kilograms from product size and weight", () => {
  const entry = buildTailfinCatalogEntry({
    sourceUrl: "https://www.tailfin.cc/us/cargopack/",
    checkedAt: "2026-08-30",
    html: `
      <html><head><script type="application/ld+json">{
        "@type":"Product","name":"CargoPack","image":"https://media.tailfin.cc/app/uploads/2026/08/cargopack-1200x800.jpg"
      }</script></head><body><main><h1>CargoPack</h1>
        <section id="specifications"><h2>Specifications</h2>
          <p>Weight 922g (1000g with pannier mounts)</p><p>Volume 18L (+3.0L Pockets)</p>
          <p>Maximum Load 27kg</p><p>Max. Capacity with Panniers: 62L</p>
          <p>Construction 210D Hypalon</p>
        </section>
      </main></body></html>
    `,
  });
  assert.deepEqual(entry.volumeOptions, [18]);
  assert.deepEqual(entry.weightOptions, [1000]);
  assert.equal(entry.loadKg, 27);
  assert.equal(entry.sourceImageUrl, "https://media.tailfin.cc/app/uploads/2026/08/cargopack-1200x800.jpg");
});

test("CRITICAL catalog scan: Tailfin Bar Bag weights stay attached to the matching volume", () => {
  const entry = buildTailfinCatalogEntry({
    sourceUrl: "https://www.tailfin.cc/us/bar-bag-system/",
    html: `<main><h1>Bar Bag System</h1><img src="https://media.tailfin.cc/bar-bag.jpg">
      <section id="specifications">Specifications
        Drop Small Weight 552g 181g Bar Clamp Hardware Volume 4.0L – 9.1L
        Drop Large Weight 636g 181g Bar Clamp Hardware Volume 6.7L – 12.5L
        Flat Small Weight 604g 181g Bar Clamp Hardware Volume 5.8L – 14.7L
        Flat Large Weight 679g 181g Bar Clamp Hardware Volume 8.7L – 18.9L
      </section></main>`,
  });
  assert.deepEqual(entry.volumeOptions, [9.1, 12.5, 14.7, 18.9]);
  assert.deepEqual(entry.weightOptions, [733, 817, 785, 860]);
});

test("CRITICAL catalog scan: Tailfin Bar Cage and Top Tube variants include their complete fitted weight", () => {
  const barCage = buildTailfinCatalogEntry({
    sourceUrl: "https://www.tailfin.cc/us/product/bar-systems/bar-cage/",
    html: `<main><h1>Bar Cage (+ Bag)</h1><img src="https://media.tailfin.cc/bar-cage.jpg">
      <section id="specifications">Specifications
        Bar Cage Weight 277g Material Alloy
        Bar Cage Bag Specifications
        Bar Cage Bag – Small\nWeight 222g\nVolume 8 Litre
        Bar Cage Bag – Medium\nWeight 255g\nVolume 11 Litre
        Bar Cage Bag – Large\nWeight 285g\nVolume 15 Litre
      </section></main>`,
  });
  assert.deepEqual(barCage.volumeOptions, [8, 11, 15]);
  assert.deepEqual(barCage.weightOptions, [499, 532, 562]);

  const topTube = buildTailfinCatalogEntry({
    sourceUrl: "https://www.tailfin.cc/us/product/top-tube-cockpit/top-tube-bag/",
    html: `<main><h1>Top Tube Bag</h1><img src="https://media.tailfin.cc/top-tube.jpg">
      <section id="specifications">Specifications
        0.8 Litre Zip\nWeight\n138g – Direct mount\n150g Strap mount
        1.1 Litre Zip + Flip\nWeight Zip\n154g – Direct mount\n166g Strap mount\nWeight Flip\n168g – Direct mount\n180g Strap mount
        1.5 Litre Zip + Flip\nWeight Zip\n178g – Direct mount\n190g Strap mount\nWeight Flip\n187g – Direct mount\n199g Strap mount
        What's in the box
      </section></main>`,
  });
  assert.deepEqual(topTube.volumeOptions, [0.8, 1.1, 1.5]);
  assert.deepEqual(topTube.weightOptions, [150, 180, 199]);
});

test("CRITICAL catalog scan: Tailfin installed weights preserve manufacturer size order", () => {
  const entry = buildTailfinCatalogEntry({
    sourceUrl: "https://www.tailfin.cc/us/product/frame-bags/half-frame-bag/",
    html: `<main><h1>Half Frame Bag</h1><img src="https://media.tailfin.cc/half-frame.jpg">
      <section id="specifications">Specifications
        2.3 Litres\nWeight\n200g\n248g including Straps
        3.0 Litres\nWeight\n242g\n290g including Straps
        3.8 Litres\nWeight\n284g\n332g including Straps
      </section></main>`,
  });
  assert.deepEqual(entry.volumeOptions, [2.3, 3, 3.8]);
  assert.deepEqual(entry.weightOptions, [248, 290, 332]);
});

test("CRITICAL catalog scan: Tailfin Rear Top Tube weights follow the named geometry", () => {
  const entry = buildTailfinCatalogEntry({
    sourceUrl: "https://www.tailfin.cc/us/product/top-tube-cockpit/rear-top-tube-bag/",
    html: `<main><h1>Rear Top Tube Bag</h1><img src="https://media.tailfin.cc/rear-top-tube.jpg">
      <section id="specifications">Specifications
        Road/Gravel Rear Top Tube Bag – 0.9L\nWeight\n109g – Mounted with 2 Straps\n118g – Mounted with 3 Straps\nVolume\n0.9L
        MTB Rear Top Tube Bag – 0.8L\nWeight\n112g – Mounted with 2 Straps\n121g – Mounted with 3 Straps\nVolume\n0.9L (MTB Geometry)
      </section></main>`,
  });
  assert.deepEqual(entry.volumeOptions, [0.8, 0.9]);
  assert.deepEqual(entry.weightOptions, [121, 118]);
});
