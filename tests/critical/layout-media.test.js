import test from "node:test";
import assert from "node:assert/strict";
import { applyLayoutMedia, layoutMediaSnapshot, normalizeLayoutVideoUrl } from "../../src/state/layout-media.js";
import { compactLayoutForEntitySync } from "../../src/sync/serialize.js";
import { getUploadablePhotoEntries } from "../../src/sync/photo-upload-scope.js";
import { collectStatePhotoRefs } from "../../src/backup/archive.js";
import { normalizeItemPhotos } from "../../src/state/item-photos.js";
import { collectOfflinePhotoCacheTasks } from "../../src/sync/offline-photo-cache.js";
import { isMeaningfulPackingState, isSuspiciousEmptyPackingState } from "../../src/state/diagnostics.js";
import { resolvePreferredLayoutId } from "../../src/state/layout-choice.js";

test("layout media edits are isolated until save, including ordering and removal", () => {
  const layout = { id: "layout-a", notes: "Keep notes", photos: [{ id: "a", caption: "Bike" }, { id: "b", caption: "Bags" }] };
  const draft = layoutMediaSnapshot(layout);
  draft.photos.reverse();
  draft.photos[0].caption = "Packed bags";
  assert.equal(layout.photos[0].id, "a");
  assert.equal(layout.photos[1].caption, "Bags");
  assert.equal(applyLayoutMedia(layout, draft), true);
  assert.equal(layout.photos[0].caption, "Packed bags");
  assert.equal(layout.notes, "Keep notes");
  assert.equal(applyLayoutMedia(layout, draft), false);
  applyLayoutMedia(layout, { photos: [], videoUrl: "" });
  assert.equal(layout.photos, undefined);
});

test("only web video links are accepted", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://user:secret@example.org", "not a link"]) {
    assert.equal(normalizeLayoutVideoUrl(value), "");
  }
  assert.equal(normalizeLayoutVideoUrl(" https://youtu.be/example "), "https://youtu.be/example");
});

test("a layout with only media is not discarded as an empty state", () => {
  const state = { items: {}, containers: {}, layouts: { trip: { id: "trip", photos: [{ id: "p" }] } } };
  assert.equal(isMeaningfulPackingState(state), true);
  assert.equal(isSuspiciousEmptyPackingState(state), false);
  assert.equal(resolvePreferredLayoutId(state, "trip"), "trip");
});

test("saving a caption retains a photo upload completed while the editor was open", () => {
  const layout = { photos: [{ id: "p", localId: "p", status: "pending" }] };
  const draft = layoutMediaSnapshot(layout);
  Object.assign(layout.photos[0], { status: "synced", url: "https://example.org/p.jpg" });
  draft.photos[0].caption = "Packed";
  applyLayoutMedia(layout, draft);
  assert.equal(layout.photos[0].status, "synced");
  assert.equal(layout.photos[0].url, "https://example.org/p.jpg");
  assert.equal(layout.photos[0].caption, "Packed");
});

test("captions and order survive synchronization, backup and offline cache discovery", () => {
  const photos = [{ id: "b", caption: "Packed", url: "https://example.org/b.jpg", thumbUrl: "https://example.org/b-small.jpg" }, { id: "a", caption: "Unpacked", url: "https://example.org/a.jpg" }];
  const layout = { id: "layout-a", photos, videoUrl: "https://youtu.be/example" };
  const compact = compactLayoutForEntitySync(layout);
  assert.deepEqual(compact.photos.map((photo) => [photo.id, photo.caption]), [["b", "Packed"], ["a", "Unpacked"]]);
  const state = { layouts: { "layout-a": layout }, items: {}, containers: {} };
  assert.equal(collectStatePhotoRefs(state, normalizeItemPhotos).filter((ref) => ref.entityType === "layout").length, 2);
  assert.equal(collectOfflinePhotoCacheTasks(state).length, 2);
});

test("photo uploads are scoped to the requested layout and skip public layouts in private sync", () => {
  const record = (id, extra = {}) => ({ id, rootContainerIds: [], photos: [{ id: `photo-${id}`, localId: `photo-${id}`, status: "pending" }], ...extra });
  const state = { layouts: { a: record("a"), b: record("b"), c: record("c", { adminDemo: true }) }, items: {}, containers: {} };
  assert.deepEqual(getUploadablePhotoEntries(state, { layoutId: "a" }).map((entry) => [entry.entityType, entry.entity.id]), [["layout", "a"]]);
  assert.deepEqual(getUploadablePhotoEntries(state).map((entry) => entry.entity.id), ["a", "b"]);
});


import { applyLayoutTrips, layoutTripsSnapshot, layoutTripCountLabel } from "../../src/state/layout-trips.js";
import { createManagedLayoutCopyRecord } from "../../src/state/layout-manage.js";
import { buildHistoryStateDiff } from "../../src/ui/history-diff.js";

test("legacy media becomes a trip without mutating the original; saving keeps the common gear", () => {
  const layout = { id: "l", notes: "Weekend", notesHtml: "<p>Weekend</p>", photos: [{id:"p",localId:"p",status:"pending"}], arrangement: {items:{i:"b"}}, rootContainerIds:["b"] };
  const original = structuredClone(layout);
  const trips = layoutTripsSnapshot(layout);
  assert.deepEqual(layout, original);
  assert.equal(trips.length, 1);
  assert.equal(applyLayoutTrips(layout, trips), false);
  trips[0].name = "Weekend trip";
  Object.assign(layout.photos[0], {status:"synced",url:"https://example.org/p.jpg"});
  trips.push({id:"second",name:"Forest",notes:"Two nights",photos:[],videoUrl:""});
  assert.equal(applyLayoutTrips(layout, trips), true);
  assert.equal(layout.notes, undefined);
  assert.equal(layout.trips[0].notesHtml, "<p>Weekend</p>");
  assert.equal(layout.photos[0].url, "https://example.org/p.jpg");
  assert.equal(layout.photos[0].tripId, "trip-legacy");
  assert.deepEqual(layout.arrangement, original.arrangement);
  assert.deepEqual(layout.rootContainerIds, original.rootContainerIds);
  assert.equal(applyLayoutTrips(layout, layoutTripsSnapshot(layout)), false);
});

test("trip associations survive sync, normalization, copying and backup without cross-trip galleries", () => {
  const layout = {id:"l",trips:[{id:"one",name:"One"},{id:"two",name:"Two"}],photos:[{id:"a",tripId:"one",url:"https://example.org/a.jpg"},{id:"b",tripId:"two",url:"https://example.org/b.jpg"}]};
  const synced = compactLayoutForEntitySync(layout);
  normalizeItemPhotos(synced);
  const copy = createManagedLayoutCopyRecord({id:"copy",name:"Copy",sourceLayout:synced});
  const trips = layoutTripsSnapshot(copy);
  assert.deepEqual(trips.map(trip=>trip.photos.map(p=>p.id)), [["a"],["b"]]);
  trips[0].photos[0].caption = "Changed in copy";
  applyLayoutTrips(copy,trips);
  assert.equal(layout.photos[0].caption,undefined);
  const state = {layouts:{copy},items:{},containers:{}};
  assert.equal(collectStatePhotoRefs(state,normalizeItemPhotos).length,2);
  assert.equal(collectOfflinePhotoCacheTasks(state).length,2);
  assert.equal(isMeaningfulPackingState({layouts:{l:{id:"l",trips:[{id:"one",name:"Only story"}]}},items:{},containers:{}}),true);
  applyLayoutTrips(copy,[trips[1]]);
  assert.deepEqual(copy.photos.map(p=>p.id),["b"]);
  applyLayoutTrips(copy,[]);
  assert.equal(layoutTripsSnapshot(copy).length,0);
});

test("trip counts have correct Russian forms and legacy content counts once", () => {
  for (const [n,label] of [[1,"1 поездка"],[2,"2 поездки"],[5,"5 поездок"],[11,"11 поездок"],[21,"21 поездка"],[22,"22 поездки"]]) {
    assert.equal(layoutTripCountLabel({trips:Array.from({length:n},(_,i)=>({id:String(i)}))}),label);
  }
  assert.equal(layoutTripCountLabel({}),"");
  assert.equal(layoutTripCountLabel({notes:"Legacy"}),"1 поездка");
  assert.equal(layoutTripCountLabel({trips:[{id:"a"},{id:"b"}]},"en"),"2 trips");
});

test("trip edits enter history with rich description data and names", () => {
  const before={layouts:{l:{id:"l",name:"Kit",trips:[{id:"a",name:"First",notes:"Old"}]}},items:{},containers:{}};
  const after=structuredClone(before);
  after.layouts.l.trips[0]={id:"a",name:"Weekend",notes:"New",notesHtml:"<strong>New</strong>"};
  const diff=buildHistoryStateDiff(before,after);
  assert.equal(diff.layouts.changed.length,1);
  assert.match(JSON.stringify(diff),/Название поездки/);
  assert.match(JSON.stringify(diff),/Описание «Weekend»/);
});


test("multiple videos migrate from the old URL, preserve order and reject unsafe schemes", () => {
  const legacy={id:"l",trips:[{id:"t",videoUrl:"https://youtu.be/old",notes:"Description"}]};
  const trips=layoutTripsSnapshot(legacy);
  assert.deepEqual(trips[0].videoUrls,["https://youtu.be/old"]);
  trips[0].videoUrls.push("https://youtu.be/second");
  applyLayoutTrips(legacy,trips);
  assert.deepEqual(layoutTripsSnapshot(compactLayoutForEntitySync(legacy))[0].videoUrls,["https://youtu.be/old","https://youtu.be/second"]);
  assert.deepEqual(layoutMediaSnapshot({videoUrls:["javascript:alert(1)","https://example.org/video"]}).videoUrls,["https://example.org/video"]);
  assert.deepEqual(layoutMediaSnapshot({videoUrls:[],videoUrl:"https://youtu.be/old"}).videoUrls,[]);
});
test("private notes and publication opt-in survive editing, synchronization and copies separately from descriptions", () => {
  const layout={id:"a",trips:[{id:"t",notes:"Description",privateNotes:"Private",privateNotesHtml:"<b>Private</b>",publishNotes:false}]};
  const trips=layoutTripsSnapshot(layout);
  trips[0].publishNotes=true;applyLayoutTrips(layout,trips);
  const copy=createManagedLayoutCopyRecord({id:"b",sourceLayout:compactLayoutForEntitySync(layout)});
  assert.equal(copy.trips[0].notes,"Description");
  assert.equal(copy.trips[0].privateNotes,"Private");
  assert.equal(copy.trips[0].privateNotesHtml,"<b>Private</b>");
  assert.equal(copy.trips[0].publishNotes,true);
  assert.equal(layoutTripsSnapshot({trips:[{id:"t",notes:"Old description"}]})[0].publishNotes,false);
});


test("pending photo-only edits are local changes and survive a server refresh for trips, items and bags", async () => {
  const {hasPendingLocalPhotos,retainLocalPhotoUploads}=await import('../../src/sync/local-photo-state.js');
  const {compactPhotoForSync}=await import('../../src/sync/serialize.js');
  for(const key of ['layouts','items','containers']) {
    const first={id:'first',localId:'first',status:'pending',tripId:'trip'};
    const synced={id:'second',url:'/second',status:'synced'};
    const local={[key]:{record:{id:'record',photos:[first,synced],trips:[{id:'trip',name:'Trip'}]}}};
    const remote={[key]:{record:{id:'record',photos:[synced]}}};
    assert.equal(compactPhotoForSync(first),null);
    assert.equal(hasPendingLocalPhotos(local),true);
    assert.equal(retainLocalPhotoUploads(remote,local),1);
    assert.deepEqual(remote[key].record.photos.map(p=>p.id),['first','second']);
    assert.equal(retainLocalPhotoUploads(remote,local),0);
    assert.equal(retainLocalPhotoUploads({[key]:{}},local),0);
    const completed={[key]:{record:{id:'record',photos:[{...first,url:'/first',status:'synced'}]}}};
    assert.equal(retainLocalPhotoUploads(completed,local),0);
    assert.equal(hasPendingLocalPhotos(completed),false);
  }
});

test("trip snapshots retain live upload progress without serializing transient fields", async () => {
  const {layoutTripsSnapshot}=await import('../../src/state/layout-trips.js');
  const photo={id:'first',localId:'first',status:'uploading'};
  Object.defineProperty(photo,'uploadProgress',{value:45,enumerable:false});
  const trip=layoutTripsSnapshot({id:'layout',photos:[photo]})[0];
  assert.equal(layoutMediaSnapshot(trip).photos[0].uploadProgress,45);
  assert.equal(JSON.stringify(trip).includes('uploadProgress'),false);
});
