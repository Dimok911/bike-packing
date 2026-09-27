import test from 'node:test';
import assert from 'node:assert/strict';
import { compileApprovedCatalog } from '../../scripts/compile-approved-manufacturer-catalog.mjs';
import { catalogPhotoSelection } from '../../src/data/manufacturer-catalog-photo-selection.js';
import { catalogReviewPublication } from '../../src/data/manufacturer-catalog-review-publication.js';
const old='https://photos.test/old.jpg', fresh='https://photos.test/new.jpg';
const base={id:'bag',name:'Bag',volume:4,weight:240,sourceUrl:'https://example.test/bag',sourceImageUrls:[old],imageAssetPaths:['assets/manufacturer-catalog/test/old.jpg']};
const opts={publishedAt:'2026-09-27T20:00:00Z',resolveImage:url=>'assets/manufacturer-catalog/test/'+(url===old?'old':'new')+'.jpg'};
const change=(fields=[],extra={})=>({id:'changed:bag',productId:'bag',type:'changed',decision:'approved',before:base,after:{...base,weight:318,sourceImageUrls:[fresh]},fields,reviewedAt:'2026-09-27T19:00:00Z',reviewScanId:'scan',...extra});
test('publish only approved fields, never stale photo snapshot specifications',()=>{
 const photo=change([{field:'sourceImageUrls',before:[old],after:[fresh]}]);
 const data=change([{field:'weight',before:240,after:245}],{after:{...base,weight:245}});
 assert.equal(compileApprovedCatalog([base],[data,photo],opts)[0].weight,245);
});
test('saved photograph selection retains old image and excludes proposed image',()=>{
 const c=change();c.photoSelection=catalogPhotoSelection(c,[old]);const e=compileApprovedCatalog([base],[c],opts)[0];
 assert.deepEqual(e.sourceImageUrls,[old]);assert.deepEqual(e.imageAssetPaths,base.imageAssetPaths);assert.equal(e.imageVariantSource,'manual-catalog-review');
});
test('pending decisions and stale baseline prevent publication',()=>{
 assert.throws(()=>compileApprovedCatalog([base],[change([],{decision:'pending'})],opts),/Unreviewed/);
 assert.throws(()=>compileApprovedCatalog([base],[change([{field:'weight',before:200,after:318}])],opts),/Stale baseline/);
});
test('stale selections and empty approved galleries prevent publication',()=>{
 const c=change();c.photoSelection={availableUrls:[old],selectedUrls:[old]};assert.throws(()=>compileApprovedCatalog([base],[c],opts),/Stale photograph/);
 c.photoSelection=catalogPhotoSelection(c,[]);assert.throws(()=>compileApprovedCatalog([base],[c],opts),/Empty approved/);
});
test('rejected changes preserve baseline; additions and deletions require approval',()=>{
 assert.equal(compileApprovedCatalog([base],[change([],{decision:'rejected'})],opts)[0].weight,240);
 assert.equal(compileApprovedCatalog([base],[change([],{type:'missing',after:null})],opts).length,0);
 const added=change([],{type:'added',productId:'new',after:{...base,id:'new'}});assert.equal(compileApprovedCatalog([base],[added],opts).length,2);
});
test('manual approval resolves pending gallery evidence with explicit provenance and aligned arrays',()=>{
 const c=change([{field:'imageReviewRequired',before:undefined,after:true}],{after:{...base,imageReviewRequired:true,unassignedImageCount:3}});c.photoSelection=catalogPhotoSelection(c,[old]);
 const e=compileApprovedCatalog([base],[c],opts)[0];assert.equal(e.imageReviewRequired,undefined);assert.equal(e.unassignedImageCount,undefined);assert.deepEqual(e.imageVolumeOptions,[[4]]);assert.equal(e.imageReviewApproval.scanId,'scan');
});
test('conflicting approvals and missing image assets prevent publication',()=>{
 const c=change([{field:'weight',before:240,after:318}]);assert.throws(()=>compileApprovedCatalog([base],[c,change([{field:'weight',before:240,after:250}])],opts),/Conflicting/);
 c.photoSelection=catalogPhotoSelection(c);assert.throws(()=>compileApprovedCatalog([base],[c],{...opts,resolveImage:()=>null}),/Unresolved photograph/);
});
test('publication receipt matches exact saved decision and does not cover later review',()=>{
 const r={scanId:'scan',changeId:'change',reviewedAt:'2026-09-27T19:00:00Z'};
 assert.equal(catalogReviewPublication({...r},[r]),r);
 assert.equal(catalogReviewPublication({...r,reviewedAt:'2026-09-27T19:01:00Z'},[r]),null);
 assert.equal(catalogReviewPublication({...r,scanId:'new'},[r]),null);
});

test('a volume correction preserves unchanged gallery with updated source size evidence',()=>{
 const baseline={...base,imageVolumeOptions:[[4]]};
 const c=change([{field:'volume',before:4,after:6},{field:'volumeOptions',before:undefined,after:[6]}],{after:{...baseline,volume:6,volumeOptions:[6],imageVolumeOptions:[[6]],imageVariantSource:'manufacturer-selected-variant-gallery'}});
 const e=compileApprovedCatalog([baseline],[c],opts)[0];assert.deepEqual(e.imageVolumeOptions,[[6]]);assert.deepEqual(e.sourceImageUrls,[old]);
});
test('photo approval is scoped to final approved volume regardless of change order',()=>{
 const photo=change();photo.photoSelection=catalogPhotoSelection(photo);
 const data=change([{field:'volume',before:4,after:6},{field:'volumeOptions',before:undefined,after:[6]}]);
 assert.deepEqual(compileApprovedCatalog([base],[photo,data],opts)[0].imageVolumeOptions,[[6]]);
});
