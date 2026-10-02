import { tripTracks } from "./trip-track.js";
import { clonePhotoWithUploadState } from "./item-photos.js";
import { layoutMediaSnapshot, layoutMediaSignature, layoutVideoUrls } from "./layout-media.js";
import { normalizeLayoutNotes } from "./layout-notes.js";

// Photos stay in the layout's asset pool so upload, backup and offline caching
// keep their existing contracts. tripId is editorial metadata, like caption.
export function layoutTripsSnapshot(layout) {
  const photos = layoutMediaSnapshot(layout).photos;
  const seen = new Set();
  const trips = (Array.isArray(layout?.trips) ? layout.trips : []).filter(trip => trip && typeof trip === "object").map((trip, index) => {
    let id = String(trip.id || `trip-${index + 1}`);
    while (seen.has(id)) id += "-copy";
    seen.add(id);
    return { id, tracks: tripTracks(trip), trackOrder: trip.trackOrder === "manual" ? "manual" : "date", name: String(trip.name || "").trim(), notes: normalizeLayoutNotes(trip.notes), notesHtml: String(trip.notesHtml || ""), privateNotes: normalizeLayoutNotes(trip.privateNotes), privateNotesHtml: String(trip.privateNotesHtml || ""), publishNotes: trip.publishNotes === true, videoUrl: layoutVideoUrls(trip)[0] || "", videoUrls: layoutVideoUrls(trip), photos: [] };
  });
  if (!trips.length && (photos.length || normalizeLayoutNotes(layout?.notes) || layoutVideoUrls(layout).length)) {
    trips.push({ id: "trip-legacy", name: "", notes: normalizeLayoutNotes(layout?.notes), notesHtml: String(layout?.notesHtml || ""), videoUrl: layoutVideoUrls(layout)[0] || "", videoUrls: layoutVideoUrls(layout), photos: [] });
  }
  for (const photo of photos) {
    // Older clients and imports may leave an unassigned photo: retain it.
    const trip = trips.find(candidate => candidate.id === photo.tripId) || trips[0];
    if (trip) { photo.tripId = trip.id; trip.photos.push(photo); }
  }
  return trips;
}

export function tripDisplayName(trip, index = 0, language = "ru") {
  return String(trip?.name || "").trim() || (language === "en" ? `Trip ${index + 1}` : `Поездка ${index + 1}`);
}

export function layoutTripCount(layout) {
  const payload = layout?.statePayload;
  const source = payload?.layouts ? payload.layouts[payload.activeLayoutId] || Object.values(payload.layouts)[0] : layout;
  const records = Array.isArray(source?.trips) ? source.trips.filter(trip => trip && typeof trip === "object").length : 0;
  const count = records || (source?.photos?.length || normalizeLayoutNotes(source?.notes) || layoutVideoUrls(source).length ? 1 : 0);
  return count;
}

export function layoutTripCountLabel(layout, language = "ru") {
  const count = layoutTripCount(layout);
  if (!count) return "";
  if (language === "en") return `${count} ${count === 1 ? "trip" : "trips"}`;
  const word = count % 100 >= 11 && count % 100 <= 14 ? "поездок" : count % 10 === 1 ? "поездка" : count % 10 >= 2 && count % 10 <= 4 ? "поездки" : "поездок";
  return `${count} ${word}`;
}

export function layoutTripsSignature(trips) {
  return JSON.stringify(trips.map(trip => [trip.id, String(trip.name || "").trim(), normalizeLayoutNotes(trip.notes), trip.notesHtml || "", normalizeLayoutNotes(trip.privateNotes), trip.privateNotesHtml || "", trip.publishNotes === true, tripTracks(trip), trip.trackOrder === "manual" ? "manual" : "date", layoutMediaSignature(trip)]));
}

export function applyLayoutTrips(layout, trips) {
  if (layoutTripsSignature(layoutTripsSnapshot(layout)) === layoutTripsSignature(trips)) return false;
  const photos = [];
  layout.trips = trips.map(trip => {
    const media = layoutMediaSnapshot(trip);
    for (const photo of media.photos) {
      const live = (layout.photos || []).find(candidate => candidate.id === photo.id || (photo.localId && candidate.localId === photo.localId));
      photos.push(Object.assign(clonePhotoWithUploadState(live || photo), { caption: photo.caption || "", tripId: trip.id }));
    }
    return { id: trip.id, tracks: tripTracks(trip), trackOrder: trip.trackOrder === "manual" ? "manual" : "date", name: String(trip.name || "").trim(), notes: normalizeLayoutNotes(trip.notes), notesHtml: trip.notesHtml || "", privateNotes: normalizeLayoutNotes(trip.privateNotes), privateNotesHtml: trip.privateNotesHtml || "", publishNotes: trip.publishNotes === true, videoUrl: media.videoUrl, videoUrls: media.videoUrls };
  });
  if (photos.length) layout.photos = photos;
  else delete layout.photos;
  delete layout.notes;
  delete layout.notesHtml;
  delete layout.videoUrl;
  delete layout.videoUrls;
  return true;
}
