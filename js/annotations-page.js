import { AnnotationStore, annotationDeepLink } from "./annotations.js?v=note-autoshow-1";
import { annotationSimulationRequest, simulatedAnnotations } from "./annotations-simulation.js";
import { loadData } from "./data.js";

const list = document.querySelector("#annotations-list");
const refresh = document.querySelector("#annotations-refresh");
const search = document.querySelector("#annotations-search");
const simulationNotice = document.querySelector("#annotations-simulation");
const expanded = new Set();
const shownNotes = new Map();
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
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(annotation);
  }
  const term = search.value.trim().toLocaleLowerCase();
  const matches = [...groups].map(([id, notes]) => {
    const map = maps.get(id);
    const title = map?.title || notes[0].context.title || "Historical map";
    const city = map?.city || notes[0].context.city || "Unplaced";
    const year = map?.year || notes[0].context.year || "";
    const mapMatch = `${title} ${city} ${year}`.toLocaleLowerCase().includes(term);
    const filtered = !term || mapMatch ? notes : notes.filter((note) => `${note.text} ${note.tag} ${note.name || ""}`.toLocaleLowerCase().includes(term));
    return { id, title, city, year, notes: filtered, total: notes.length, latest: notes[0].timestampValue };
  }).filter((group) => group.notes.length).sort((a, b) => b.latest - a.latest || a.title.localeCompare(b.title));
  if (!matches.length) {
    list.innerHTML = `<p class="annotations-state">No maps or notes match this search.</p>`;
    return;
  }
  if (!expanded.size && !term) expanded.add(matches[0].id);
  const visible = matches.slice(0, shownMaps);
  list.innerHTML = visible.map((group) => {
    const limit = shownNotes.get(group.id) || 8;
    const noteRows = group.notes.slice(0, limit).map((annotation) => {
      const tags = (annotation.tags || (annotation.tag ? annotation.tag.split(",") : [])).map((tag) => tag.trim().replace(/^#+/, "")).filter(Boolean);
      const tagCopy = tags.map((tag) => `<span class="annotations-tag">#${escapeHtml(tag)}</span>`).join("");
      const byline = annotation.name ? `<span>${escapeHtml(annotation.name)}</span>` : "";
      return `<article class="annotation-card"><blockquote>${escapeHtml(annotation.text)}</blockquote><footer>${byline}<span>${escapeHtml(noteDate(annotation.timestamp))}</span><span>${escapeHtml(pointLabel(annotation.context.point))}</span>${tagCopy}<a href="${escapeHtml(annotationDeepLink(annotation))}">OPEN MAP <span aria-hidden="true">↗</span></a></footer></article>`;
    }).join("");
    const more = group.notes.length > limit ? `<button class="annotations-more" type="button" data-more-notes="${escapeHtml(group.id)}">SHOW ${Math.min(8, group.notes.length - limit)} MORE NOTES ↓</button>` : "";
    return `<section class="annotation-group"><details data-map-group="${escapeHtml(group.id)}"${expanded.has(group.id) ? " open" : ""}><summary><span class="annotation-group-identity"><small>${escapeHtml(group.city)}${group.year ? ` · ${escapeHtml(group.year)}` : ""}</small><strong>${escapeHtml(group.title)}</strong></span><span class="annotation-group-count">${group.total} NOTE${group.total === 1 ? "" : "S"} <i aria-hidden="true">↓</i></span></summary><div class="annotation-group-notes">${noteRows}${more}</div></details></section>`;
  }).join("") + (matches.length > shownMaps ? `<button class="annotations-more-maps" type="button">SHOW MORE MAPS ↓ <span>${shownMaps} OF ${matches.length}</span></button>` : "");
}

async function start({ force = false } = {}) {
  refresh.disabled = true;
  try {
    const [store, data] = await Promise.all([AnnotationStore.load(), loadData()]);
    const maps = new Map(data.maps.map((map) => [map.id, map]));
    const simulation = annotationSimulationRequest(window.location.search);
    const simulationMap = simulation && maps.get(simulation.mapId);
    if (simulationMap) {
      store.annotations = simulatedAnnotations(simulationMap, simulation.count).reverse();
      simulationNotice.innerHTML = `${simulation.count} temporary notes on ${escapeHtml(simulationMap.title)}. Nothing here has been submitted. <a href="./?map=${encodeURIComponent(simulationMap.id)}&simulateNotes=60">VIEW MAP ↗</a>`;
      simulationNotice.hidden = false;
    } else {
      simulationNotice.hidden = true;
      await store.refresh({ force });
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
start();
