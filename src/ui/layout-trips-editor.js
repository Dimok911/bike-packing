import { createTripTrackEditor } from "./trip-track-editor.js";
import { createLayoutDraftPhotoUploads } from "../sync/layout-draft-photo-uploads.js";
import { createLayoutMediaEditor } from "./layout-media-editor.js";
import { layoutTripsSnapshot, layoutTripsSignature, tripDisplayName } from "../state/layout-trips.js";
import { loadNoteFields, readNoteFields } from "./rich-note-content.js";

export function createLayoutTripsEditor(options) {
  const { dialog, localText, onChange } = options;
  const host = dialog.querySelector("[data-layout-trips-editor]");
  const select = host.querySelector("select");
  const add = host.querySelector("[data-trip-add]");
  const remove = host.querySelector("[data-trip-remove]");
  const nameField = host.querySelector("[data-trip-name-field]");
  const name = host.querySelector("[data-trip-name]");
  const notes = dialog.querySelector("#layoutEditNotes");
  const noteField = notes.closest(".note-field");
  const privateField = dialog.querySelector("[data-trip-private-field]");
  const privateNotes = dialog.querySelector("#layoutTripNotes");
  const publishNotes = privateField.querySelector("[data-trip-publish-notes]");
  const mediaField = dialog.querySelector("[data-layout-media-editor]");
  const trackField = document.createElement("section");
  trackField.className = "trip-track-editor";
  trackField.dataset.tripTrackEditor = "";
  mediaField.after(trackField);
  const trackEditor = createTripTrackEditor({ host: trackField, localText, onChange: () => { updateBusy(); onChange(); } });
  const isBusy = () => media.isBusy() || trackEditor.isBusy();
  const empty = host.querySelector("[data-trips-empty]");
  let uploads = null;
  let trips = [];
  let active = -1;
  const media = createLayoutMediaEditor({ ...options, onPhotoAdded: photo => { photo.tripId = trips[active]?.id; return uploads?.add(photo); }, getLimit: () => Math.max(0, options.getLimit() - trips.reduce((total, trip, index) => total + (index === active ? 0 : trip.photos.length), 0)), onChange: () => { updateBusy(); onChange(); } });
  const language = () => localText("en", "ru");
  function updateBusy() {
    for (const control of [select, add, remove]) control.disabled = isBusy();
  }
  function flush() {
    if (!trips[active]) return;
    const fields = readNoteFields(notes);
    const privateFields = readNoteFields(privateNotes);
    Object.assign(trips[active], { privateNotes: privateFields.note, privateNotesHtml: privateFields.noteHtml || "", publishNotes: publishNotes.checked, name: name.value.trim(), notes: fields.note, notesHtml: fields.noteHtml || "", ...media.snapshot(), track: trackEditor.snapshot() });
  }
  function renderChoices() {
    select.replaceChildren(...trips.map((trip, index) => new Option(tripDisplayName(trip, index, language()), String(index))));
    select.value = String(active);
    select.hidden = remove.hidden = nameField.hidden = !trips.length;
    noteField.hidden = privateField.hidden = mediaField.hidden = trackField.hidden = !trips.length;
    noteField.setAttribute("aria-hidden", String(!trips.length));
    empty.hidden = Boolean(trips.length);
    updateBusy();
  }
  function show(index, preserveCreated = true) {
    active = index;
    const trip = trips[active];
    name.value = trip?.name || "";
    name.placeholder = tripDisplayName(trip, Math.max(0, active), language());
    loadNoteFields(notes, { note: trip?.notes, noteHtml: trip?.notesHtml });
    loadNoteFields(privateNotes, { note: trip?.privateNotes, noteHtml: trip?.privateNotesHtml });
    publishNotes.checked = trip?.publishNotes === true;
    trackEditor.open(trip?.track);
    media.open(trip, { preserveCreated });
    renderChoices();
  }
  select.addEventListener("change", () => {
    const next = Number(select.value);
    if (isBusy() || !media.validate()) { select.value = String(active); return; }
    flush(); show(next); onChange();
  });
  add.addEventListener("click", () => {
    if (isBusy() || (trips.length && !media.validate())) return;
    flush();
    trips.push({ id: `trip-${crypto.randomUUID()}`, name: "", notes: "", notesHtml: "", photos: [], videoUrl: "" });
    show(trips.length - 1); onChange(); name.focus();
  });
  remove.addEventListener("click", async () => {
    if (isBusy() || !trips[active]) return;
    const id = trips[active].id;
    const confirmed = await options.confirmRemove(tripDisplayName(trips[active], active, language()));
    if (!confirmed || trips[active]?.id !== id || isBusy()) return;
    trips.splice(active, 1); show(Math.min(active, trips.length - 1)); onChange();
  });
  name.addEventListener("input", () => { flush(); renderChoices(); onChange(); });
  return {
    open(layout, selectedId) {
      uploads?.close();
      trips = layoutTripsSnapshot(layout);
      const scope = options.getUploadScope?.();
      uploads = options.uploadPhotos ? createLayoutDraftPhotoUploads({
        layoutId: layout.id,
        getTrips: () => { flush(); return [...trips]; },
        getSavedLayout: () => options.getSavedLayout(layout.id),
        isCurrentScope: () => options.getUploadScope?.() === scope,
        uploadPhotos: options.uploadPhotos,
        onProgress: () => { media.refreshUploads(); onChange(); }
      }) : null;
      host.querySelector("[data-trips-label]").textContent = localText("Trips", "Поездки");
      host.querySelector("[data-trip-name-label]").textContent = localText("Trip name", "Название поездки");
      select.setAttribute("aria-label", localText("Edit trip", "Редактируемая поездка"));
      add.textContent = localText("Add trip", "Добавить поездку");
      remove.textContent = localText("Delete trip", "Удалить поездку");
      empty.textContent = localText("Add a trip to tell its story and attach photos. The gear list is shared by all trips.", "Добавьте поездку: её описание, фотографии и видео. Состав вещей общий для всех поездок.");
      dialog.querySelector("#layoutEditNotesLabel").textContent = localText("Trip description", "Описание поездки");
      dialog.querySelector("#layoutTripNotesLabel").textContent = localText("Trip notes", "Заметки к поездке");
      privateField.querySelector("[data-trip-publish-notes-label]").textContent = localText("Show notes in the shared publication", "Показывать заметки в публикации по ссылке");
      show(trips.length ? Math.max(0, trips.findIndex(trip => trip.id === selectedId)) : -1, false);
    },
    snapshot: () => { flush(); return trips; },
    signature: () => { flush(); return layoutTripsSignature(trips); },
    isBusy,
    validate: () => !isBusy() && (!trips.length || media.validate()),
    addFiles: files => trips.length ? media.addFiles(files) : Promise.resolve(),
    sessionToken: media.sessionToken,
    close: layout => { uploads?.close(); uploads = null; media.close(layout); trackEditor.close(); trips = []; active = -1; }
  };
}
