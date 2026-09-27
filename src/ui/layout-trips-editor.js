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
  const mediaField = dialog.querySelector("[data-layout-media-editor]");
  const empty = host.querySelector("[data-trips-empty]");
  let trips = [];
  let active = -1;
  const media = createLayoutMediaEditor({ ...options, getLimit: () => Math.max(0, options.getLimit() - trips.reduce((total, trip, index) => total + (index === active ? 0 : trip.photos.length), 0)), onChange: () => { updateBusy(); onChange(); } });
  const language = () => localText("en", "ru");
  function updateBusy() {
    for (const control of [select, add, remove]) control.disabled = media.isBusy();
  }
  function flush() {
    if (!trips[active]) return;
    const fields = readNoteFields(notes);
    Object.assign(trips[active], { name: name.value.trim(), notes: fields.note, notesHtml: fields.noteHtml || "", ...media.snapshot() });
  }
  function renderChoices() {
    select.replaceChildren(...trips.map((trip, index) => new Option(tripDisplayName(trip, index, language()), String(index))));
    select.value = String(active);
    select.hidden = remove.hidden = nameField.hidden = !trips.length;
    noteField.hidden = mediaField.hidden = !trips.length;
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
    media.open(trip, { preserveCreated });
    renderChoices();
  }
  select.addEventListener("change", () => {
    const next = Number(select.value);
    if (!media.validate()) { select.value = String(active); return; }
    flush(); show(next); onChange();
  });
  add.addEventListener("click", () => {
    if (media.isBusy() || (trips.length && !media.validate())) return;
    flush();
    trips.push({ id: `trip-${crypto.randomUUID()}`, name: "", notes: "", notesHtml: "", photos: [], videoUrl: "" });
    show(trips.length - 1); onChange(); name.focus();
  });
  remove.addEventListener("click", async () => {
    if (media.isBusy() || !trips[active]) return;
    const id = trips[active].id;
    const confirmed = await options.confirmRemove(tripDisplayName(trips[active], active, language()));
    if (!confirmed || trips[active]?.id !== id || media.isBusy()) return;
    trips.splice(active, 1); show(Math.min(active, trips.length - 1)); onChange();
  });
  name.addEventListener("input", () => { flush(); renderChoices(); onChange(); });
  return {
    open(layout, selectedId) {
      trips = layoutTripsSnapshot(layout);
      host.querySelector("[data-trips-label]").textContent = localText("Trips", "Поездки");
      host.querySelector("[data-trip-name-label]").textContent = localText("Trip name", "Название поездки");
      select.setAttribute("aria-label", localText("Edit trip", "Редактируемая поездка"));
      add.textContent = localText("Add trip", "Добавить поездку");
      remove.textContent = localText("Delete trip", "Удалить поездку");
      empty.textContent = localText("Add a trip to tell its story and attach photos. The gear list is shared by all trips.", "Добавьте поездку: её описание, фотографии и видео. Состав вещей общий для всех поездок.");
      dialog.querySelector("#layoutEditNotesLabel").textContent = localText("Trip description and notes", "Описание и заметки к поездке");
      show(trips.length ? Math.max(0, trips.findIndex(trip => trip.id === selectedId)) : -1, false);
    },
    snapshot: () => { flush(); return trips; },
    signature: () => { flush(); return layoutTripsSignature(trips); },
    isBusy: media.isBusy,
    validate: () => !trips.length || media.validate(),
    addFiles: files => trips.length ? media.addFiles(files) : Promise.resolve(),
    sessionToken: media.sessionToken,
    close: layout => { media.close(layout); trips = []; active = -1; }
  };
}
