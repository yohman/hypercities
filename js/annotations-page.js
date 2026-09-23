import { AnnotationStore, annotationDeepLink } from "./annotations.js";
import { loadData } from "./data.js";

const list = document.querySelector("#annotations-list");
const refresh = document.querySelector("#annotations-refresh");

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
  list.innerHTML = records.map((annotation) => {
    const map = maps.get(annotation.context.mapId);
    const title = map?.title || annotation.context.title || "Historical map";
    const city = map?.city || annotation.context.city || "Unplaced";
    const year = map?.year || annotation.context.year || "";
    const tag = annotation.tag ? `<span class="annotations-tag">#${escapeHtml(annotation.tag)}</span>` : "";
    return `<article class="annotation-card"><p class="annotation-card-map">${escapeHtml(city)}${year ? ` · ${escapeHtml(year)}` : ""}</p><h2>${escapeHtml(title)}</h2><blockquote>${escapeHtml(annotation.text)}</blockquote><footer><span>${escapeHtml(noteDate(annotation.timestamp))}</span><span>${escapeHtml(pointLabel(annotation.context.point))}</span>${tag}<a href="${escapeHtml(annotationDeepLink(annotation))}">OPEN MAP <span aria-hidden="true">↗</span></a></footer></article>`;
  }).join("");
}

async function start({ force = false } = {}) {
  refresh.disabled = true;
  try {
    const [store, data] = await Promise.all([AnnotationStore.load(), loadData()]);
    await store.refresh({ force });
    const maps = new Map(data.maps.map((map) => [map.id, map]));
    render(store, maps);
  } catch (error) {
    list.innerHTML = `<p class="annotations-state">The annotation stream could not be opened. The maps remain available.</p>`;
    console.warn("Could not open annotations page.", error);
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener("click", () => start({ force: true }));
start();
