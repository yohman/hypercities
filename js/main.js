import { loadData, tileDiagnostic } from "./data.js";
import { CoreView } from "./core-view.js";
import { driftOffer, mapContext, nodeEncounter, strayOffer } from "./graph.js";
import { MapView } from "./map-view.js";
import { Interface } from "./ui.js";

const app = { data: null, field: null, core: null, ui: null, coreMaps: [], selected: null, context: null, activeEncounter: null, tile: null, stray: null, drift: null, trail: [], history: [] };

function pushTrail(label, id, why = null) {
  const last = app.trail.at(-1);
  if (last?.id === id) return;
  app.trail.push({ label, id, why });
  if (app.trail.length > 7) app.trail.shift();
  app.ui.renderJourney(app.trail);
}

function render() {
  if (!app.selected) return;
  app.ui.renderCore({ map: app.selected, coreMaps: app.coreMaps, context: app.context, tile: app.tile, stray: app.stray, drift: app.drift, activeEncounter: app.activeEncounter });
}

function selectMap(map, { keepEncounter = false, trailWhy = null, focus = true } = {}) {
  if (!map) return;
  app.selected = map;
  app.context = mapContext(app.data, map);
  app.activeEncounter = keepEncounter ? app.activeEncounter : null;
  app.tile = tileDiagnostic(map);
  app.stray = strayOffer(app.data, app.context, app.trail.map((item) => item.id));
  app.drift = driftOffer(app.data.maps, map);
  app.core.select(map, { focus });
  app.field.showRaster(map, { focus });
  pushTrail(`${map.city} ${map.year}`, map.id, trailWhy || "Selected from the temporal stack; X/Y remains the map’s geographic footprint and Z is its historical position.");
  render();
}

function previewCore(maps, lngLat) {
  app.core.preview([...maps].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title)), lngLat);
}

function enterCore(maps, lngLat) {
  if (!maps.length) { app.ui.field("No sampled historical layer holds this point. Keep moving; the field remains open."); return; }
  app.history.push({ type: "field" });
  app.coreMaps = [...maps].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  app.field.enterCore(lngLat, app.coreMaps);
  app.core.enter(app.coreMaps, lngLat);
  app.ui.lockedCore(app.coreMaps);
  // A core begins at its uppermost surviving layer. The visitor can descend
  // immediately, without needing a second click in the timewell.
  selectMap(app.coreMaps.at(-1), {
    trailWhy: "The newest map opens the core; descend to move into its earlier layers."
  });
}

function moveTime(direction) {
  const index = app.coreMaps.findIndex((map) => map.id === app.selected.id);
  const next = direction === "older" ? app.coreMaps[index - 1] : app.coreMaps[index + 1];
  if (next) selectMap(next);
}

function followNode(nodeId, why = null) {
  const encounter = nodeEncounter(app.data, nodeId);
  if (!encounter) return;
  app.history.push({ type: "map", map: app.selected.id });
  app.activeEncounter = encounter;
  app.stray = strayOffer(app.data, { relations: encounter.links }, app.trail.map((item) => item.id));
  app.drift = null;
  pushTrail(encounter.title, nodeId, why || `Followed a graph relation with source evidence in ${encounter.provenance ? `book pp. ${encounter.provenance.printedPages.join("–")}` : "the Phase 1 sample"}.`);
  render();
}

function acceptStray(nodeId) { const offer = app.stray; followNode(nodeId, offer?.explanation || "A lateral graph movement."); }

function acceptDrift(mapId) {
  const offer = app.drift;
  const map = app.data.maps.find((candidate) => candidate.id === mapId);
  if (!map) return;
  app.history.push({ type: "map", map: app.selected.id });
  app.coreMaps = [map];
  const core = { lng: (map.bbox[0] + map.bbox[2]) / 2, lat: (map.bbox[1] + map.bbox[3]) / 2 };
  app.field.enterCore(core, [map]);
  app.core.enter([map], core);
  selectMap(map, { trailWhy: offer?.explanation || "Temporal juxtaposition; not a claimed scholarly relation." });
}

function leaveCore() {
  app.core.leave(); app.field.leaveCore(); app.coreMaps = []; app.selected = null; app.context = null; app.activeEncounter = null; app.stray = null; app.drift = null; app.history = []; app.ui.field();
}

function stepBack() {
  const previous = app.history.pop();
  if (!previous || previous.type === "field") { leaveCore(); return; }
  const map = app.data.maps.find((candidate) => candidate.id === previous.map);
  if (map) { app.activeEncounter = null; selectMap(map); }
}

function keyboard(event) {
  if (document.querySelector("#help-dialog").open) return;
  if (event.key === "Escape" || event.key === "ArrowLeft") { event.preventDefault(); stepBack(); return; }
  if (!app.selected) return;
  if (event.key === "ArrowDown") { event.preventDefault(); moveTime("older"); }
  if (event.key === "ArrowUp") { event.preventDefault(); moveTime("newer"); }
  if ((event.key === "ArrowRight" || event.key === " ") && app.stray) { event.preventDefault(); acceptStray(app.stray.id); }
}

async function start() {
  try {
    app.data = await loadData();
    app.ui = new Interface({ node: followNode, time: moveTime, stray: acceptStray, drift: acceptDrift, surface: leaveCore });
    app.core = new CoreView({
      onSelect: (map) => selectMap(map),
      onHover: (map) => app.field.highlightTimewellMap(map)
    });
    app.field = new MapView({
      maps: app.data.maps,
      onCore: enterCore,
      onDepth: (maps) => app.ui.showDepth(maps),
      onPreview: previewCore,
      onTileStatus: (status) => { app.tile = status; render(); }
    });
    await app.field.init();
    app.ui.field();
    document.addEventListener("keydown", keyboard);
  } catch (error) {
    const directFile = window.location.protocol === "file:";
    document.querySelector("#field-prompt").innerHTML = directFile
      ? "<p>This field needs a static web preview. Open it through GitHub Pages or a local HTTP server so the book graph and map records can be read.</p>"
      : `<p>Unable to open the field: ${error.message}</p>`;
    console.error(error);
  }
}

start();
