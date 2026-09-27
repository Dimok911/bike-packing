import test from 'node:test';
import assert from 'node:assert/strict';
import { topeakVariantOptions, topeakVariantEvidence, collectTopeakVariantEvidence } from '../../scripts/manufacturer-catalog/topeak-variant-evidence.mjs';
import { wooGalleryEvidence, withManufacturerGalleryEvidence } from '../../scripts/manufacturer-catalog/gallery-evidence.mjs';
import { arkelGalleryEvidence } from '../../scripts/manufacturer-catalog/arkel-gallery-evidence.mjs';
import { tailfinGalleryEvidence } from '../../scripts/manufacturer-catalog/tailfin-gallery-evidence.mjs';
import { preserveApprovedManufacturerGallery, assertPublishableManufacturerGalleries } from '../../scripts/manufacturer-catalog/gallery-preservation.mjs';
import { resolveManufacturerGallery } from '../../scripts/manufacturer-catalog/resolve-gallery.mjs';
import { repairManufacturerGalleries } from '../../scripts/repair-manufacturer-galleries.mjs';
import { selectManufacturerVariantImages } from '../../src/data/manufacturer-catalog-image-variants.js';
import { compareManufacturerCatalogSnapshots } from '../../src/data/manufacturer-catalog-scan.js';
const htmlJson = value => JSON.stringify(value).replaceAll('"', '&quot;');
const picture = name => `https://brand.test/${name}.jpg`;
const product = (volume = 4) => ({ id: 'bag-4l', brand: 'Test', sourceUrl: 'https://brand.test/bag', volume, volumeOptions: [volume],
  variants: [{ sku: 'S4', title: 'Small', volume }], sourceImageUrls: [picture('old')], sourceImageUrl: picture('old'),
  imageAssetPaths: ['assets/manufacturer-catalog/test/old.jpg'], imageAssetPath: 'assets/manufacturer-catalog/test/old.jpg' });

test('Topeak checks the returned model, size and colour before accepting a gallery', () => {
  const option = { modelId: '78', size: 'Micro', color: 'Black' };
  const response = { model_id: 78, size: 'Micro', color: 'Black', id: 'TC2471B', left_img: '<img src="https://www.topeak.com/storage/app/media/micro.jpg"><img src="https://tracker.test/logo.jpg">' };
  assert.equal(topeakVariantEvidence(response, option, 'https://www.topeak.com/global/en/product/129-AERO').sourceImageUrls.length, 1);
  assert.throws(() => topeakVariantEvidence({ ...response, size: 'Large' }, option, 'https://www.topeak.com'), /different variant/);
  assert.throws(() => topeakVariantEvidence({ ...response, left_img: '' }, option, 'https://www.topeak.com'), /no gallery/);
});

test('Topeak requests each selected size instead of copying the default gallery', async () => {
  const html = '<script>var product_id = 129;</script><li class="size-option" data-mod-id="78" data-size="Micro" data-color="Black"></li><li class="size-option" data-mod-id="79" data-size="Large" data-color="Black"></li>';
  assert.equal(topeakVariantOptions(html).length, 2);
  const rows = await collectTopeakVariantEvidence({ html, sourceUrl: 'https://www.topeak.com/global/en/product/129-AERO', requestVariant: async q => ({ model_id: q.modelId, id: 'TC'+q.modelId, size: q.size, color: q.color, left_img: `<img src="https://www.topeak.com/storage/app/media/${q.size}.jpg">` }) });
  assert.notDeepEqual(rows[0].sourceImageUrls, rows[1].sourceImageUrls);
});

test('Woo reads explicit variation galleries and shared wildcard galleries', () => {
  const entry = { ...product(), variants: [{ sku: 'S4', title: 'Small', volume: 4 }, { sku: 'S6', title: 'Large', volume: 6 }] };
  const raw = [{ attributes: { attribute_size: '' }, gallery_images_html: `<img src="${picture('shared')}">` }];
  const html = `<div class="woocommerce-product-gallery"><img src="${picture('default')}"></div><form data-product_variations="${htmlJson(raw)}"></form>`;
  assert.deepEqual(wooGalleryEvidence(html, entry).map(e => e.sourceImageUrls), [[picture('shared')], [picture('shared')]]);
});

test('Revelate selects Iconic variation images rather than the default size', () => {
  const raw = [{ variation_id: 11, sku: 'S4', attributes: { attribute_size: 'Small' } }];
  const html = `<div class="iconic-woothumbs-all-images-wrap" data-default="${htmlJson([{url:picture('large')}])}"></div><form data-product_variations="${htmlJson(raw)}"></form><script>window.iconic_woothumbs_variations_data[12] = ${JSON.stringify({11:[{large_src:picture('small')}]})};</script>`;
  assert.deepEqual(wooGalleryEvidence(html, product())[0].sourceImageUrls, [picture('small')]);
  assert.throws(() => wooGalleryEvidence(html.replace('"11":', '"15":'), product()), /Missing selected/);
});

test('Arkel separates explicit capacities but retains shared source gallery details', () => {
  const entry = { ...product(), variants: [{sku:'S4',volume:4},{sku:'S6',volume:6}] };
  const data = { variants: [{id:1,sku:'S4',title:'Black / 4 L'},{id:2,sku:'S6',title:'Black / 6 L'}], images: [
    {id:10,src:picture('small'),variant_ids:[1],alt:'4 L'}, {id:11,src:picture('large'),variant_ids:[2],alt:'6 L'}, {id:12,src:picture('zip'),alt:'Waterproof zipper'} ] };
  const html = data.images.map(i => `<div class="product-main-slide"><img data-photoswipe-src="${i.src}" alt="${i.alt}"></div>`).join('');
  assert.deepEqual(arkelGalleryEvidence(html, entry, data).map(e=>e.sourceImageUrls), [[picture('small'),picture('zip')],[picture('large'),picture('zip')]]);
});

test('Tailfin uses selected component images and cannot activate accessory-dependent galleries', () => {
  const option={component_id:'size',option_id:1,option_title:'4 L',option_product_data:{image_data:{image_src:picture('small')}}};
  const scenarios={scenarios:['size4','accessory'],scenario_data:{size:{1:['size4','accessory']},accessory:{0:['size4','accessory'],1:['size4'],2:['size4','accessory']}},scenario_settings:{overlay_image:{size4:`<img src="${picture('selected')}">`,accessory:`<img src="${picture('accessory')}">`}}};
  const html=`<div class="composite_component" data-item_id="size" data-nav_title="Size"><div data-options_data="${htmlJson([option])}"></div></div><div data-scenario_data="${htmlJson(scenarios)}"></div>`;
  assert.deepEqual(tailfinGalleryEvidence(html, product())[0].sourceImageUrls,[picture('selected')]);
  assert.deepEqual(tailfinGalleryEvidence(html,product(6)),[]);
});

test('gallery evidence stays aligned and does not leak sibling images with empty SKUs', () => {
  const entry = {...product(), variants:[{sku:'',volume:4},{sku:'',volume:6}]};
  const evidence=[{sku:'',volume:4,sourceImageUrls:[picture('four')]},{sku:'',volume:6,sourceImageUrls:[picture('six')]}];
  const result=selectManufacturerVariantImages(withManufacturerGalleryEvidence(entry,evidence));
  assert.deepEqual(result.sourceImageUrls,[picture('four')]);
  assert.equal(result.imageAssetPaths.length,1);
  assert.throws(()=>withManufacturerGalleryEvidence(entry,evidence.slice(0,1)),/Incomplete/);
});

test('missing source gallery preserves the approved snapshot without showing a photo deletion', () => {
  const approved=product();const fresh={...approved,sourceImageUrls:[],sourceImageUrl:'',imageAssetPaths:[],imageAssetPath:''};
  const result=preserveApprovedManufacturerGallery(fresh,approved);
  assert.deepEqual(result.sourceImageUrls,approved.sourceImageUrls);
  assert.deepEqual(result.imageAssetPaths,approved.imageAssetPaths);
  assert.equal(result.imageReviewRequired,true);
  assert.deepEqual(result.pendingImageGallery.sourceImageUrls,[]);
  const changes = compareManufacturerCatalogSnapshots([approved],[result]).changes;
  assert.equal(changes.length,1);
  assert.deepEqual(changes[0].fields.map(f=>f.field),['imageReviewRequired']);
  assert.throws(()=>assertPublishableManufacturerGalleries([result]),/publication blocked/);
});

test('unknown size metadata is kept for review, never converted to a verified empty gallery', () => {
  const entry={...product(),brand:'Tailfin',variants:[{sku:'S4',volume:4},{sku:'S6',volume:6}]};
  const result=resolveManufacturerGallery(entry);
  assert.deepEqual(result.sourceImageUrls,entry.sourceImageUrls);
  assert.equal(result.imageReviewRequired,true);
  assert.deepEqual(result.pendingImageGallery.sourceImageUrls,entry.sourceImageUrls);
});

test('gallery preservation cannot copy photos from another model or capacity', () => {
  const fresh={...product(6),sourceImageUrls:[]};
  assert.deepEqual(preserveApprovedManufacturerGallery(fresh,product(4)).sourceImageUrls,[]);
  assert.deepEqual(preserveApprovedManufacturerGallery(fresh,{...product(6),id:'different'}).sourceImageUrls,[]);
});

test('repair keeps current specifications, restores original references and holds unresolved replacements', () => {
  const original=product();const current={...original,material:'Corrected material',sourceImageUrls:[],imageAssetPaths:[]};
  const resolved=repairManufacturerGalleries([current],[original],{[original.sourceUrl]:[{sku:'S4',volume:4,sourceImageUrls:[picture('new')]}]},'2026-09-27');
  assert.equal(resolved.entries[0].material,'Corrected material');
  assert.deepEqual(resolved.entries[0].sourceImageUrls,[picture('new')]);
  assert.equal(resolved.audit[0].status,'verified');
  const held=repairManufacturerGalleries([current],[original],{},'2026-09-27');
  assert.deepEqual(held.entries[0].sourceImageUrls,original.sourceImageUrls);
  assert.equal(held.audit[0].status,'preserved-needs-review');
  assert.throws(()=>assertPublishableManufacturerGalleries(held.entries),/publication blocked/);
});

test('one selected SKU keeps its expandable-capacity gallery aligned', () => {
 const entry={...product(4.3),brand:'Blackburn',volumeOptions:[4.3,5.8]};
 const result=selectManufacturerVariantImages(resolveManufacturerGallery(entry));
 assert.deepEqual(result.sourceImageUrls,entry.sourceImageUrls);
 assert.deepEqual(result.imageVolumeOptions,[[4.3,5.8]]);
 assert.equal(result.imageReviewRequired,undefined);
});
test('a disjoint size filter preserves raw evidence and cannot approve an empty gallery', () => {
 const entry={...product(4),imageVolumeOptions:[[6]]};
 const selected=selectManufacturerVariantImages(entry);
 assert.equal(selected.imageReviewRequired,true);
 assert.deepEqual(selected.pendingImageGallery.sourceImageUrls,entry.sourceImageUrls);
 const preserved=preserveApprovedManufacturerGallery(selected,product(4));
 assert.deepEqual(preserved.sourceImageUrls,entry.sourceImageUrls);
 assert.throws(()=>assertPublishableManufacturerGalleries([preserved]),/publication blocked/);
});
