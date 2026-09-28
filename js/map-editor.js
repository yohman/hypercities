import { loadMapLibraryRows } from "./map-library.js?v=editor-csv-1";

const fields = [
  ["Place & title", ["city", "title", "titleEn"]],
  ["Publication & description", ["creator", "publicationDate", "publisher", "copyright", "description", "caption", "captionEn"]],
  ["Collection & image", ["collectionSource", "imageRecord", "thumbnailUrl", "callNumber", "state"]],
  ["Tiles & rendering", ["tileType", "tileUrl", "projection", "minZoom", "maxZoom", "width", "height", "scale"]],
  ["Geographic bounds", ["mapping.swLat", "mapping.swLon", "mapping.neLat", "mapping.neLon", "mapping.altitude"]],
  ["Map time span", ["mapping.dateFrom.date", "mapping.dateFrom.timezone_type", "mapping.dateFrom.timezone", "mapping.dateTo.date", "mapping.dateTo.timezone_type", "mapping.dateTo.timezone"]],
  ["Additional map metadata", ["mapping.kml", "mapping.view", "mapping.zoom", "mapping.markerType", "mapping.markerState", "mapping.isNetworkLink", "mapping.isCollection", "mapping.georeferences", "mapping.id", "publicationDate.date", "publicationDate.timezone_type", "publicationDate.timezone"]]
];
const fieldLabels = {
  city: "Place / city",
  title: "Original title",
  titleEn: "English title · shown on HyperCities"
};
const fieldNames = fields.flatMap(([, names]) => names).concat(["id"]);
const list = document.querySelector("#record-list");
const form = document.querySelector("#record-form");
const fieldsHost = document.querySelector("#record-fields");
const search = document.querySelector("#record-search");
const placeFilter = document.querySelector("#place-filter");
const status = document.querySelector("#submit-status");
const previewStatus = document.querySelector("#preview-status");
const previewCoordinates = document.querySelector("#preview-coordinates");
const selectedTitle = document.querySelector("#selected-title");
const selectedSummary = document.querySelector("#selected-summary");
const mapInHypercities = document.querySelector("#map-in-hypercities");
const submit = document.querySelector("#submit-edit");
const recordIdLabel = document.querySelector("#record-id");
const selectedByQuery = new URLSearchParams(location.search).get("map");
let records = [];
let selected = null;
let preview = null;
let previewReady = false;
let previewGeneration = 0;

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }
function year(record) { return String(record["mapping.dateFrom.date"] || record.publicationDate || "").match(/\d{3,4}/)?.[0] || "date unknown"; }
function title(record) { return record.titleEn || record.title || "Untitled map"; }
function sortedRecords(input) { return [...input].sort((a, b) => (a.city || "").localeCompare(b.city || "") || Number(year(a)) - Number(year(b)) || title(a).localeCompare(title(b))); }
function visibleRecords() {
  const term = search.value.trim().toLocaleLowerCase();
  return sortedRecords(records.filter((record) => (!placeFilter.value || record.city === placeFilter.value)
    && (!term || [record.id, record.city, record.title, record.titleEn, record.creator, record.description, year(record)].join(" ").toLocaleLowerCase().includes(term))));
}
function drawList() {
  const matches = visibleRecords();
  const shown = matches.slice(0, 80);
  if (selected && matches.includes(selected) && !shown.includes(selected)) shown.push(selected);
  document.querySelector("#record-count").textContent = matches.length > 80 ? `${matches.length} maps · showing first 80; search to narrow` : `${matches.length} / ${records.length} maps`;
  list.innerHTML = shown.map((record) => `<button type="button" data-record-id="${esc(record.id)}" aria-current="${selected?.id === record.id ? "true" : "false"}"><strong>${esc(title(record))}</strong><span>${esc(record.city)} · ${esc(year(record))} · #${esc(record.id)}</span></button>`).join("");
}
function inputFor(key) {
  const label = fieldLabels[key] || key.replace(/^mapping\./, "").replace(/^publicationDate\./, "publication date · ").replaceAll(".", " · ").replace(/([a-z])([A-Z])/g, "$1 $2");
  const value = selected?.[key] ?? "";
  const disabled = key === "id" ? " disabled" : "";
  const long = /description|caption|georeferences|kml|view/i.test(key) || String(value).length > 115;
  const fieldValue = esc(value);
  return `<label class="map-editor-field" data-field-wrap="${esc(key)}"><span>${esc(label)}${key === "id" ? " · fixed" : ""}</span>${long
    ? `<textarea data-field="${esc(key)}"${disabled}>${fieldValue}</textarea>`
    : `<input data-field="${esc(key)}" value="${fieldValue}"${disabled} spellcheck="false" />`}</label>`;
}
function drawForm() {
  fieldsHost.innerHTML = `${fields.map(([group, names]) => `<section class="map-editor-fields-group"><h3>${esc(group)}</h3>${names.map(inputFor).join("")}</section>`).join("")}<section class="map-editor-fields-group map-editor-fields-group--fixed"><h3>Record identifier</h3>${inputFor("id")}</section>`;
  updateDirty();
}
function changesNow() {
  if (!selected) return {};
  return Object.fromEntries([...form.querySelectorAll("[data-field]:not(:disabled)")]
    .filter((input) => input.value !== (selected[input.dataset.field] ?? ""))
    .map((input) => [input.dataset.field, input.value]));
}
function updateDirty() {
  const changes = changesNow();
  submit.disabled = !Object.keys(changes).length;
  form.querySelectorAll("[data-field-wrap]").forEach((wrapper) => wrapper.classList.toggle("is-changed", Object.hasOwn(changes, wrapper.dataset.fieldWrap)));
  status.textContent = Object.keys(changes).length ? `${Object.keys(changes).length} changed field${Object.keys(changes).length === 1 ? "" : "s"} · not yet submitted` : "";
}
function tileTemplate(record) {
  const base = String(record.tileUrl || "").trim();
  if (!base) return null;
  return `${base.replace(/^http:/i, "https:").replace(/\/?$/, "/")}{z}/{x}/{y}.png`;
}
function setPreview(record) {
  if (!previewReady || !record) return;
  const generation = ++previewGeneration;
  const south = Number(record["mapping.swLat"]), west = Number(record["mapping.swLon"]);
  const north = Number(record["mapping.neLat"]), east = Number(record["mapping.neLon"]);
  const valid = [south, west, north, east].every(Number.isFinite) && south < north && west < east;
  previewStatus.textContent = "Loading map tiles…";
  previewCoordinates.textContent = valid ? `${south.toFixed(4)}, ${west.toFixed(4)}  —  ${north.toFixed(4)}, ${east.toFixed(4)}` : "Geographic bounds are incomplete";
  if (preview.getLayer("historical-map")) preview.removeLayer("historical-map");
  if (preview.getSource("historical-map")) preview.removeSource("historical-map");
  const template = tileTemplate(record);
  if (valid) preview.fitBounds([[west, south], [east, north]], { padding: 38, duration: 450, maxZoom: 15 });
  if (!template || !valid) { previewStatus.textContent = template ? "Add valid bounds to preview this map." : "No tile URL is recorded for this map."; return; }
  preview.addSource("historical-map", { type: "raster", tiles: [template], tileSize: 256, bounds: [west, south, east, north], minzoom: Number(record.minZoom || 0), maxzoom: Number(record.maxZoom || 22) });
  preview.addLayer({ id: "historical-map", type: "raster", source: "historical-map" });
  setTimeout(() => { if (generation === previewGeneration) previewStatus.textContent = "If tiles do not appear, check their endpoint or HTTPS support."; }, 5000);
}
function selectRecord(record) {
  selected = record;
  recordIdLabel.textContent = `#${record.id}`;
  selectedTitle.textContent = title(record);
  selectedSummary.textContent = `${record.city || "Unplaced"} · ${year(record)}${record.tileUrl ? ` · ${record.tileUrl}` : " · no tile endpoint"}`;
  mapInHypercities.href = `./?map=${encodeURIComponent(`map:${record.id}`)}`;
  mapInHypercities.hidden = false;
  drawList();
  drawForm();
  setPreview(record);
  history.replaceState(null, "", `?map=${encodeURIComponent(record.id)}`);
}
function issueUrl(changes) {
  const payload = { mapId: String(selected.id), changes };
  const issueBody = `Requested by @yohman. Only the allowlisted Map Library editor account can publish metadata changes.\n\n<!-- hypercities-map-edit:start -->\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\n<!-- hypercities-map-edit:end -->`;
  const query = new URLSearchParams({ title: `[Map metadata] ${selected.city || "Unplaced"} · ${title(selected).slice(0, 90)} (#${selected.id})`, body: issueBody });
  return `https://github.com/yohman/maplibrary/issues/new?${query}`;
}

search.addEventListener("input", drawList);
placeFilter.addEventListener("change", drawList);
list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-record-id]");
  if (button) selectRecord(records.find((record) => String(record.id) === button.dataset.recordId));
});
form.addEventListener("input", (event) => {
  updateDirty();
  if (selected && ["tileUrl", "mapping.swLat", "mapping.swLon", "mapping.neLat", "mapping.neLon", "minZoom", "maxZoom"].includes(event.target.dataset.field)) {
    const current = { ...selected, ...Object.fromEntries([...form.querySelectorAll("[data-field]")].map((input) => [input.dataset.field, input.value])) };
    clearTimeout(form.previewTimer);
    form.previewTimer = setTimeout(() => setPreview(current), 350);
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const changes = changesNow();
  if (!Object.keys(changes).length) return;
  const target = issueUrl(changes);
  if (target.length > 7000) { status.textContent = "This edit is too large for a prefilled issue. Submit fewer long fields at a time."; return; }
  status.textContent = "Opening a prefilled GitHub issue. Review the change and submit it there to publish.";
  window.open(target, "_blank", "noopener,noreferrer");
});

try {
  records = await loadMapLibraryRows();
  const cities = [...new Set(records.map((record) => record.city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  placeFilter.insertAdjacentHTML("beforeend", cities.map((city) => `<option value="${esc(city)}">${esc(city)}</option>`).join(""));
  drawList();
  const initial = records.find((record) => String(record.id) === selectedByQuery) || sortedRecords(records)[0];
  if (initial) selectRecord(initial);
  preview = new maplibregl.Map({ container: "map-editor-preview", style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json", center: [0, 25], zoom: 1.1, attributionControl: false });
  preview.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  preview.on("load", () => { previewReady = true; if (selected) setPreview(selected); });
  preview.on("error", (event) => { if (event.sourceId === "historical-map") previewStatus.textContent = "Map tiles could not be loaded; metadata can still be edited."; });
} catch (error) {
  document.querySelector("#record-count").textContent = "Map Library unavailable";
  list.innerHTML = `<p>${esc(error.message)}<br>Open this page on the public site or a local web server.</p>`;
  previewStatus.textContent = "Could not load the public map records.";
}
