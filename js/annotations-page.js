import { AnnotationStore, annotationDeepLink } from "./annotations.js?v=annotation-note-filters-2";
import { annotationSimulationRequest, simulatedAnnotations } from "./annotations-simulation.js";
import { loadData } from "./data.js";

const list = document.querySelector("#annotations-list");
const refresh = document.querySelector("#annotations-refresh");
const search = document.querySelector("#annotations-search");
const expanded = new Set();
const shownNotes = new Map();
const groupFilters = new Map();
let shownMaps = 18;
let currentStore = null;
let currentMaps = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function noteDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Submitted";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function pointLabel(point) {
  const latitude = `${point.lat < 0 ? "S" : "N"} ${Math.abs(point.lat).toFixed(4)}`;
  const longitude = `${point.lng < 0 ? "W" : "E"} ${Math.abs(point.lng).toFixed(4)}`;
  return `${latitude} · ${longitude}`;
}

function render(store, maps) {
  currentStore = store;
  currentMaps = maps;
  if (!store.live) {
    list.innerHTML = `<p class="annotations-state">The public annotation stream is not open yet.</p>`;
    refresh.hidden = true;
    return;
  }
  const records = store.annotations;
  if (!records.length) {
    list.innerHTML = `<p class="annotations-state">No notes have been left yet. Open a historical map and choose <em>annotate</em> to begin.</p>`;
    return;
  }
  const groups = new Map();
  for (const annotation of records) {
    const id = annotation.context.mapId;
    const simulation = Boolean(annotation.simulated);
    const key = simulation ? `${id}::class-simulation` : id;
    if (!groups.has(key)) groups.set(key, { id, simulation, notes: [] });
    groups.get(key).notes.push(annotation);
  }
  const term = search.value.trim().toLocaleLowerCase();
  const matches = [...groups].map(([key, group]) => {
    const { id, simulation, notes } = group;
    const map = maps.get(id);
    const title = map?.title || notes[0].context.title || "Historical map";
    const city = map?.city || notes[0].context.city || "Unplaced";
    const year = map?.year || notes[0].context.year || "";
    const mapMatch = `${title} ${city} ${year}`.toLocaleLowerCase().includes(term);
    const filtered = !term || mapMatch ? notes : notes.filter((note) => `${note.text} ${note.tag} ${note.name || ""}`.toLocaleLowerCase().includes(term));
    return { key, id, simulation, title, city, year, notes: filtered, total: notes.length, latest: notes[0].timestampValue };
  }).filter((group) => group.notes.length).sort((a, b) => b.latest - a.latest || a.title.localeCompare(b.title));
  if (!matches.length) {
    list.innerHTML = `<p class="annotations-state">No maps or notes match this search.</p>`;
    return;
  }
  if (!expanded.size && !term) {
    const firstPublicGroup = matches.find((group) => !group.simulation);
    if (firstPublicGroup) expanded.add(firstPublicGroup.key);
  }
  const visible = matches.slice(0, shownMaps);
  list.innerHTML = visible.map((group) => {
    const limit = shownNotes.get(group.key) || 8;
    const filter = groupFilters.get(group.key) || { alias: "", search: "" };
    const filteredNotes = group.notes.filter((annotation) => {
      const matchesAlias = !filter.alias || annotation.name === filter.alias;
      const searchable = `${annotation.text} ${annotation.tag} ${(annotation.tags || []).join(" ")} ${annotation.name || ""}`.toLocaleLowerCase();
      return matchesAlias && (!filter.search || searchable.includes(filter.search.toLocaleLowerCase()));
    });
    const aliases = [...new Set(group.notes.map((annotation) => annotation.name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const noteFilters = `<div class="annotation-list-filters"><label><span>ALIAS</span><select aria-label="Filter notes by alias" data-note-alias="${escapeHtml(group.key)}"><option value="">ALL ALIASES · ${aliases.length}</option>${aliases.map((alias) => `<option value="${escapeHtml(alias)}"${filter.alias === alias ? " selected" : ""}>${escapeHtml(alias)}</option>`).join("")}</select></label><label class="annotation-notes-search"><span>SEARCH NOTES</span><input type="search" aria-label="Search notes in this map" placeholder="A word, phrase, or tag" value="${escapeHtml(filter.search)}" data-note-search="${escapeHtml(group.key)}" /></label><small>${filteredNotes.length} OF ${group.notes.length}</small></div>`;
    const noteRows = filteredNotes.slice(0, limit).map((annotation) => {
      const tags = (annotation.tags || (annotation.tag ? annotation.tag.split(",") : [])).map((tag) => tag.trim().replace(/^#+/, "")).filter(Boolean);
      const tagCopy = tags.map((tag) => `<span class="annotations-tag">#${escapeHtml(tag)}</span>`).join("");
      const byline = annotation.name ? `<span>${escapeHtml(annotation.name)}</span>` : "";
      return `<article class="annotation-card"><blockquote>${escapeHtml(annotation.text)}</blockquote><footer>${byline}<span>${escapeHtml(noteDate(annotation.timestamp))}</span><span>${escapeHtml(pointLabel(annotation.context.point))}</span>${tagCopy}<a href="${escapeHtml(annotationDeepLink(annotation))}">OPEN MAP <span aria-hidden="true">↗</span></a></footer></article>`;
    }).join("");
    const more = filteredNotes.length > limit ? `<button class="annotations-more" type="button" data-more-notes="${escapeHtml(group.key)}">SHOW ${Math.min(8, filteredNotes.length - limit)} MORE NOTES ↓</button>` : "";
    const noFilteredNotes = filteredNotes.length ? "" : `<p class="annotations-state annotation-filter-empty">No notes match these filters.</p>`;
    const eyebrow = group.simulation ? "SIMULATION · 20 STUDENT ALIASES" : `${escapeHtml(group.city)}${group.year ? ` · ${escapeHtml(group.year)}` : ""}`;
    const count = group.simulation ? `${group.total} SIMULATED NOTES` : `${group.total} NOTE${group.total === 1 ? "" : "S"}`;
    if (group.simulation) {
      const mapHref = `./?map=${encodeURIComponent(group.id)}&simulateNotes=${group.total}`;
      return `<section class="annotation-group annotation-group--simulation"><div class="simulation-entry-head"><span class="annotation-group-identity"><small>${eyebrow}</small><a class="simulation-map-link" href="${escapeHtml(mapHref)}"><strong>${escapeHtml(group.title)}</strong><span aria-hidden="true">↗</span></a></span><a class="simulation-open-map" href="${escapeHtml(mapHref)}">OPEN MAP</a></div><details data-map-group="${escapeHtml(group.key)}"${expanded.has(group.key) ? " open" : ""}><summary><span>EXPLORE THE NOTES</span><span class="annotation-group-count">${count} <i aria-hidden="true">↓</i></span></summary><div class="annotation-group-notes">${noteFilters}${noteRows}${noFilteredNotes}${more}</div></details></section>`;
    }
    return `<section class="annotation-group"><details data-map-group="${escapeHtml(group.key)}"${expanded.has(group.key) ? " open" : ""}><summary><span class="annotation-group-identity"><small>${eyebrow}</small><strong>${escapeHtml(group.title)}</strong></span><span class="annotation-group-count">${count} <i aria-hidden="true">↓</i></span></summary><div class="annotation-group-notes">${noteFilters}${noteRows}${noFilteredNotes}${more}</div></details></section>`;
  }).join("") + (matches.length > shownMaps ? `<button class="annotations-more-maps" type="button">SHOW MORE MAPS ↓ <span>${shownMaps} OF ${matches.length}</span></button>` : "");
}

async function start({ force = false } = {}) {
  refresh.disabled = true;
  try {
    const [store, data] = await Promise.all([AnnotationStore.load(), loadData()]);
    const maps = new Map(data.maps.map((map) => [map.id, map]));
    await store.refresh({ force });
    const requestedSimulation = annotationSimulationRequest(window.location.search);
    const simulationMap = (requestedSimulation && maps.get(requestedSimulation.mapId)) || maps.get("map:396");
    if (simulationMap) {
      const count = requestedSimulation?.count || 200;
      const classNotes = simulatedAnnotations(simulationMap, count).reverse();
      store.annotations = [...store.annotations.filter((note) => !note.simulated), ...classNotes];
    }
    render(store, maps);
  } catch (error) {
    list.innerHTML = `<p class="annotations-state">The annotation stream could not be opened. The maps remain available.</p>`;
    console.warn("Could not open annotations page.", error);
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener("click", () => start({ force: true }));
search.addEventListener("input", () => { shownMaps = 18; if (currentStore && currentMaps) render(currentStore, currentMaps); });
list.addEventListener("toggle", (event) => {
  const details = event.target.closest("[data-map-group]");
  if (!details) return;
  if (details.open) expanded.add(details.dataset.mapGroup); else expanded.delete(details.dataset.mapGroup);
}, true);
list.addEventListener("click", (event) => {
  const noteButton = event.target.closest("[data-more-notes]");
  if (noteButton) {
    shownNotes.set(noteButton.dataset.moreNotes, (shownNotes.get(noteButton.dataset.moreNotes) || 8) + 8);
    render(currentStore, currentMaps);
  }
  if (event.target.closest(".annotations-more-maps")) {
    shownMaps += 18;
    render(currentStore, currentMaps);
  }
});
list.addEventListener("change", (event) => {
  const select = event.target.closest("[data-note-alias]");
  if (!select || !currentStore || !currentMaps) return;
  const key = select.dataset.noteAlias;
  if (select.closest("details[data-map-group]")?.open) expanded.add(key);
  const filter = groupFilters.get(key) || { alias: "", search: "" };
  groupFilters.set(key, { ...filter, alias: select.value });
  shownNotes.set(key, 8);
  render(currentStore, currentMaps);
});
list.addEventListener("input", (event) => {
  const input = event.target.closest("[data-note-search]");
  if (!input || !currentStore || !currentMaps) return;
  const key = input.dataset.noteSearch;
  if (input.closest("details[data-map-group]")?.open) expanded.add(key);
  const filter = groupFilters.get(key) || { alias: "", search: "" };
  const caret = input.selectionStart;
  groupFilters.set(key, { ...filter, search: input.value });
  shownNotes.set(key, 8);
  render(currentStore, currentMaps);
  const replacement = [...list.querySelectorAll("[data-note-search]")].find((item) => item.dataset.noteSearch === key);
  replacement?.focus();
  replacement?.setSelectionRange(caret, caret);
});
start();
