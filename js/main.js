import { loadData, tileDiagnostic } from "./data.js";
import { CoreView } from "./core-view.js";
import { apertureFor, driftOffer, fieldFragment, isPlaceNode, mapContext, mapEncounter, nodeEncounter, strayOffer } from "./graph.js";
import { MapView } from "./map-view.js";
import { downloadText, kmlFilenameFor, kmlFor } from "./take-map.js";
import { Interface } from "./ui.js";

const app = { data: null, field: null, core: null, ui: null, coreMaps: [], corePoint: null, selected: null, context: null, bookEncounter: null, activeEncounter: null, tile: null, stray: null, drift: null, takeMode: false, trail: [], history: [], seenEncounterIds: [], seenPassageIds: [], seenNodeIds: [], recentConceptIds: [] };

function pushTrail(label, id, why = null) {
  const last = app.trail.at(-1);
  if (last?.id === id) return;
  app.trail.push({ label, id, why });
  if (app.trail.length > 7) app.trail.shift();
  app.ui.renderJourney(app.trail);
}

function fragmentTraceLabel(fragment) {
  if (fragment.kind !== "quotation") return fragment.text;
  const words = fragment.text.replace(/[“”]/g, "").split(/\s+/).filter(Boolean);
  return `${words.slice(0, 5).join(" ")}…`;
}

function recordEncounter(fragment) {
  if (!fragment || app.seenEncounterIds.at(-1) === fragment.id) return;
  app.seenEncounterIds.push(fragment.id);
  app.seenPassageIds.push(fragment.passageId);
  app.recentConceptIds.push(...(fragment.conceptIds || []));
  if (app.seenEncounterIds.length > 24) app.seenEncounterIds.shift();
  if (app.seenPassageIds.length > 12) app.seenPassageIds.shift();
  if (app.recentConceptIds.length > 20) app.recentConceptIds.splice(0, app.recentConceptIds.length - 20);
  pushTrail(fragmentTraceLabel(fragment), fragment.id, fragment.arrival?.detail || "A sourced Hyperbook encounter.");
}

function encounterState(map, interaction = "select-map") {
  const cues = ["select-map", "compare-representations", "raster-basemap-alignment"];
  if (app.coreMaps.length > 3) cues.push("core-depth-many"); else cues.push("core-depth");
  if (interaction === "move-earlier") cues.push("move-earlier", "move-earlier-or-later", "select-temporal-layer", "move-within-place");
  if (interaction === "move-later") cues.push("move-later", "move-earlier-or-later", "select-temporal-layer", "move-within-place");
  if (interaction === "zoom-change") cues.push("zoom-change");
  if (interaction === "return") cues.push("return-to-place", "revisit-trace");
  if (interaction === "lateral") cues.push("lateral-traverse", "conceptual-continuity");
  if (interaction === "drift") cues.push("lateral-drift", "same-time-juxtaposition");
  return { map, core: app.corePoint, cues, conceptIds: app.recentConceptIds };
}

function selectionOptions(map, interaction) {
  return {
    context: app.context,
    state: encounterState(map, interaction),
    seenEncounterIds: app.seenEncounterIds,
    seenPassageIds: app.seenPassageIds,
    seenNodeIds: app.seenNodeIds
  };
}

function render() {
  if (!app.selected) return;
  app.ui.renderCore({ map: app.selected, coreMaps: app.coreMaps, encounter: app.activeEncounter || app.bookEncounter, tile: app.tile, lateral: app.stray, drift: app.drift });
}

function selectMap(map, { keepEncounter = false, trailWhy = null, focus = true, interaction = "select-map" } = {}) {
  if (!map) return;
  if (app.takeMode) app.ui.closeTakeMap(false);
  app.selected = map;
  app.context = mapContext(app.data, map);
  app.bookEncounter = mapEncounter(app.data, map, selectionOptions(map, interaction));
  app.activeEncounter = keepEncounter ? app.activeEncounter : null;
  app.tile = tileDiagnostic(map);
  const visibleEncounter = app.activeEncounter || app.bookEncounter;
  app.stray = strayOffer(app.data, { relations: visibleEncounter?.links || app.context.relations }, app.trail.map((item) => item.id));
  // Temporal drift is an occasional consequence of a conceptual dérive, not
  // a persistent competing prompt on every historical map layer.
  app.drift = null;
  app.core.select(map, { focus });
  app.field.showRaster(map, { focus });
  pushTrail(`${map.city} ${map.year}`, map.id, trailWhy || "Selected from the temporal stack; X/Y remains the map’s geographic footprint and Z is its historical position.");
  recordEncounter(visibleEncounter?.fragment);
  render();
}

function previewCore(maps, lngLat) {
  app.core.preview([...maps].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title)), lngLat);
}

function discoverField(maps, point, lngLat) {
  const fragment = fieldFragment(app.data, maps, {
    state: { core: lngLat },
    seenEncounterIds: app.seenEncounterIds,
    seenPassageIds: app.seenPassageIds
  });
  app.ui.showFieldEncounter(fragment, point);
}

function enterCore(maps, lngLat) {
  if (!maps.length) { app.ui.field("No sampled historical layer holds this point. Keep moving; the map remains open."); return; }
  app.history.push({ type: "field" });
  app.corePoint = lngLat;
  app.coreMaps = [...maps].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  app.field.enterCore(lngLat, app.coreMaps);
  app.core.enter(app.coreMaps, lngLat);
  app.ui.lockedCore(app.coreMaps);
  // A core begins at its uppermost surviving layer. The visitor can descend
  // immediately, without needing a second click in the timewell.
  selectMap(app.coreMaps.at(-1), {
    trailWhy: "The newest map opens the core; descend to move into its earlier layers.",
    interaction: "core"
  });
}

function moveTime(direction) {
  const index = app.coreMaps.findIndex((map) => map.id === app.selected.id);
  const next = direction === "older" ? app.coreMaps[index - 1] : app.coreMaps[index + 1];
  if (next) selectMap(next, { interaction: direction === "older" ? "move-earlier" : "move-later" });
}

function followNode(nodeId, why = null) {
  if (isPlaceNode(app.data, nodeId)) { moveToPlace(nodeId, why); return; }
  const encounter = nodeEncounter(app.data, nodeId, {
    map: app.selected,
    state: encounterState(app.selected, "lateral"),
    seenEncounterIds: app.seenEncounterIds,
    seenPassageIds: app.seenPassageIds,
    seenNodeIds: app.seenNodeIds
  });
  if (!encounter) return;
  app.history.push({ type: "map", map: app.selected.id });
  app.activeEncounter = encounter;
  app.stray = strayOffer(app.data, { relations: encounter.links }, app.trail.map((item) => item.id));
  // This is the one deliberately non-scholarly movement: the book's inferred
  // dérive can open a contemporaneous map elsewhere, with the distinction
  // preserved in its provenance trail.
  app.drift = nodeId === "concept:derive" ? driftOffer(app.data, app.selected, { force: true }) : null;
  pushTrail(encounter.title, nodeId, why || `Followed a Hyperbook relation with source evidence in ${encounter.provenance ? `book pp. ${encounter.provenance.printedPages.join("–")}` : "the Hyperbook"}.`);
  app.seenNodeIds.push(nodeId);
  if (app.seenNodeIds.length > 12) app.seenNodeIds.shift();
  recordEncounter(encounter.fragment);
  render();
}

function openAperture(nodeId) {
  const aperture = apertureFor(app.data, nodeId);
  if (!aperture) return;
  pushTrail(aperture.title, aperture.id, `Opened a Hyperbook ${aperture.kind}; closing it returns to this same dérive.`);
  app.ui.openAperture(aperture);
}

function moveToPlace(nodeId, why = null) {
  const label = app.data.entities.get(nodeId)?.preferredLabel;
  const maps = app.data.maps.filter((map) => map.city === label).sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  if (!maps.length) {
    const encounter = nodeEncounter(app.data, nodeId, {
      map: app.selected,
      state: encounterState(app.selected, "lateral"),
      seenEncounterIds: app.seenEncounterIds,
      seenPassageIds: app.seenPassageIds,
      seenNodeIds: app.seenNodeIds
    });
    if (!encounter) return;
    app.activeEncounter = encounter;
    pushTrail(encounter.title, nodeId, why || `Reached ${label} through the book; no historical map layer is available in this prototype.`);
    recordEncounter(encounter.fragment);
    render();
    return;
  }
  const seed = maps.at(-1);
  const core = { lng: (seed.bbox[0] + seed.bbox[2]) / 2, lat: (seed.bbox[1] + seed.bbox[3]) / 2 };
  const layers = maps.filter((map) => map.bbox[0] <= core.lng && map.bbox[2] >= core.lng && map.bbox[1] <= core.lat && map.bbox[3] >= core.lat);
  app.core.leave();
  app.field.leaveCore();
  app.coreMaps = layers.length ? layers : [seed];
  app.corePoint = core;
  app.field.enterCore(core, app.coreMaps);
  app.core.enter(app.coreMaps, core);
  app.ui.lockedCore(app.coreMaps);
  selectMap(app.coreMaps.at(-1), { trailWhy: why || `Followed a book path into ${label}.`, interaction: "lateral" });
}

function acceptStray(nodeId) { const offer = app.stray; followNode(nodeId, offer?.explanation || "A lateral Hyperbook movement."); }

function acceptDrift(mapId) {
  const offer = app.drift;
  const map = app.data.maps.find((candidate) => candidate.id === mapId);
  if (!map) return;
  app.history.push({ type: "map", map: app.selected.id });
  const core = { lng: (map.bbox[0] + map.bbox[2]) / 2, lat: (map.bbox[1] + map.bbox[3]) / 2 };
  const layers = app.data.maps.filter((candidate) => candidate.bbox[0] <= core.lng && candidate.bbox[2] >= core.lng && candidate.bbox[1] <= core.lat && candidate.bbox[3] >= core.lat)
    .sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  app.coreMaps = layers.length ? layers : [map];
  app.corePoint = core;
  app.field.enterCore(core, app.coreMaps);
  app.core.enter(app.coreMaps, core);
  selectMap(map, { trailWhy: offer?.explanation || "Temporal juxtaposition; not a claimed scholarly relation.", interaction: "drift" });
}

function leaveCore() {
  app.core.leave(); app.field.leaveCore(); app.coreMaps = []; app.corePoint = null; app.selected = null; app.context = null; app.bookEncounter = null; app.activeEncounter = null; app.stray = null; app.drift = null; app.takeMode = false; app.history = []; app.ui.clearTakeMap(); app.ui.field();
}

function beginTakeMap() {
  app.takeMode = true;
  app.ui.beginTakeMap(app.selected);
  if (app.selected) render();
}

function openTakeMap() {
  if (!app.selected) return;
  app.ui.openTakeMap(app.selected);
}

function resumeTakeMap() { render(); }

function exportMap(kind) {
  if (!app.selected) return;
  if (kind === "kml") downloadText(kmlFilenameFor(app.selected), kmlFor(app.selected), "application/vnd.google-earth.kml+xml");
}

function stepBack() {
  const previous = app.history.pop();
  if (!previous || previous.type === "field") { leaveCore(); return; }
  const map = app.data.maps.find((candidate) => candidate.id === previous.map);
  if (map) { app.activeEncounter = null; selectMap(map, { interaction: "return" }); }
}

function respondToMapGesture(cue) {
  if (!app.selected) return;
  app.activeEncounter = null;
  app.context = mapContext(app.data, app.selected);
  app.bookEncounter = mapEncounter(app.data, app.selected, selectionOptions(app.selected, cue));
  app.stray = strayOffer(app.data, { relations: app.bookEncounter.links }, app.trail.map((item) => item.id));
  recordEncounter(app.bookEncounter.fragment);
  render();
}

function keyboard(event) {
  if (app.ui.bookEntryIsVisible()) return;
  if (document.querySelector("#help-dialog").open || !document.querySelector("#site-index").hidden || document.querySelector("#hyperbook-window").open || document.querySelector("#take-map-window").open) return;
  if (event.key === "Escape" || event.key === "ArrowLeft") { event.preventDefault(); stepBack(); return; }
  if (!app.selected) return;
  if (event.key === "ArrowDown") { event.preventDefault(); moveTime("older"); }
  if (event.key === "ArrowUp") { event.preventDefault(); moveTime("newer"); }
  if ((event.key === "ArrowRight" || event.key === " ") && app.stray) { event.preventDefault(); acceptStray(app.stray.id); }
}

async function start() {
  try {
    app.ui = new Interface({ node: followNode, time: moveTime, stray: acceptStray, drift: acceptDrift, aperture: openAperture, read: () => app.ui.openRead(), surface: leaveCore, take: beginTakeMap, takeSelected: openTakeMap, resumeTake: resumeTakeMap, exportMap });
    app.data = await loadData();
    app.ui.setBookEntryQuotes(app.data);
    app.core = new CoreView({
      onSelect: (map) => selectMap(map),
      onHover: (map) => app.field.highlightTimewellMap(map)
    });
    app.field = new MapView({
      maps: app.data.maps,
      onCore: enterCore,
      onDepth: (maps) => app.ui.showDepth(maps),
      onPreview: previewCore,
      onFieldEncounter: discoverField,
      onInteraction: respondToMapGesture,
      onTileStatus: (status) => { app.tile = status; render(); }
    });
    await app.field.init();
    app.ui.field();
    document.addEventListener("keydown", keyboard);
  } catch (error) {
    const directFile = window.location.protocol === "file:";
    document.querySelector("#field-prompt").innerHTML = directFile
      ? "<p>This map needs a static web preview. Open it through GitHub Pages or a local HTTP server so the book graph and map records can be read.</p>"
      : `<p>Unable to open the map: ${error.message}</p>`;
    document.querySelector("#field-prompt").hidden = false;
    console.error(error);
  }
}

// A module should evaluate once, but this guard keeps embedded-browser reload
// quirks from registering a second set of map and interface listeners.
if (!window.__hypercitiesPrototypeStarted) {
  window.__hypercitiesPrototypeStarted = true;
  start();
}
