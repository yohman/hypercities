import { containsCoordinate, loadData, tileDiagnostic } from "./data.js";
import { CoreView } from "./core-view.js?v=timewell-no-turtle-1";
import { apertureFor, driftOffer, fieldFragment, isPlaceNode, mapContext, mapEncounter, nodeEncounter, strayOffer } from "./graph.js";
import { MapView } from "./map-view.js?v=notes-navigation-1";
import { AnnotationStore, annotationContext } from "./annotations.js?v=note-autoshow-1";
import { annotationSimulationRequest, simulatedAnnotations } from "./annotations-simulation.js";
import { downloadText, kmlFilenameFor, kmlFor } from "./take-map.js";
import { Interface } from "./ui.js?v=origins-2";

const app = { data: null, field: null, core: null, ui: null, annotations: null, simulation: null, simulatedNotes: [], pendingAnnotations: [], mapAnnotations: [], annotationsVisible: true, timewellExpanded: false, activeAnnotationId: null, annotationMode: false, annotationDraft: null, annotationFloatOpen: false, annotationArrivalFocused: false, coreMaps: [], corePoint: null, selected: null, context: null, bookEncounter: null, activeEncounter: null, tile: null, stray: null, drift: null, takeMode: false, trail: [], history: [], seenEncounterIds: [], seenPassageIds: [], seenNodeIds: [], recentConceptIds: [] };

function annotationsForMap(mapId) {
  if (app.simulation?.mapId === mapId) return app.simulatedNotes;
  const published = app.annotations?.forMap(mapId) || [];
  const pending = app.pendingAnnotations.filter((note) => note.context.mapId === mapId && !published.some((live) => live.id === note.id));
  return [...pending, ...published];
}

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
  syncTimewellSize();
  app.ui.renderCore({ map: app.selected, coreMaps: app.coreMaps, encounter: app.activeEncounter || app.bookEncounter, tile: app.tile, lateral: app.stray, drift: app.drift, annotations: app.mapAnnotations, annotationsVisible: app.annotationsVisible, annotationMode: app.annotationMode, annotationCompact: app.annotationMode || Boolean(app.annotationDraft), annotationOpen: app.annotationFloatOpen, annotationSimulation: app.simulation?.mapId === app.selected.id });
}

function syncTimewellSize() {
  const button = document.querySelector("#timewell-size");
  const addingNote = app.annotationMode || Boolean(app.annotationDraft);
  const canShrink = Boolean(app.selected && (addingNote || (app.annotationsVisible && app.mapAnnotations.length)));
  const compact = canShrink && (addingNote || !app.timewellExpanded);
  app.core?.setCompact(compact);
  button.hidden = !canShrink;
  button.classList.toggle("is-compact", compact);
  button.innerHTML = compact
    ? `<span>EXPAND ↗</span>`
    : "SHRINK TIMEWELL ↘";
  button.setAttribute("aria-label", compact ? "Expand TimeWell" : "Shrink TimeWell");
}

function showActiveAnnotation() {
  if (!app.annotationFloatOpen || !app.selected || !app.field) return;
  const index = app.mapAnnotations.findIndex((annotation) => annotation.id === app.activeAnnotationId);
  if (index < 0) { app.ui.hideAnnotationFloat(); return; }
  const annotation = app.mapAnnotations[index];
  app.ui.showAnnotationNote({ annotation, index, count: app.mapAnnotations.length, point: app.field.projectPoint(annotation.context.point), map: app.selected });
}

function moveAnnotationFloatWithMap() {
  const point = app.annotationDraft?.point || (app.annotationFloatOpen && app.mapAnnotations.find((annotation) => annotation.id === app.activeAnnotationId)?.context.point);
  if (point) app.ui.positionAnnotationFloat(app.field.projectPoint(point));
}

async function refreshAnnotations({ force = false } = {}) {
  if (!app.annotations || !app.selected) return;
  const selectedId = app.selected.id;
  try {
    await app.annotations.refresh({ force });
    app.pendingAnnotations = app.pendingAnnotations.filter((note) => !app.annotations.annotations.some((live) => live.id === note.id));
  } catch (error) {
    // A public note feed must never interrupt the map. The selected layer and
    // its source record remain fully usable if Google Sheets is momentarily
    // unavailable.
    console.warn("Could not refresh annotations.", error);
  }
  if (!app.selected || app.selected.id !== selectedId) return;
  app.mapAnnotations = annotationsForMap(selectedId);
  if (!app.mapAnnotations.some((annotation) => annotation.id === app.activeAnnotationId)) {
    const requested = new URLSearchParams(window.location.search).get("annotation");
    app.activeAnnotationId = app.mapAnnotations.some((annotation) => annotation.id === requested)
      ? requested
      : app.mapAnnotations[0]?.id || null;
  }
  const requested = new URLSearchParams(window.location.search).get("annotation");
  if (requested && !app.annotationArrivalFocused) {
    const arrival = app.mapAnnotations.find((annotation) => annotation.id === requested);
    if (arrival) {
      app.annotationArrivalFocused = true;
      app.field.focusMap(app.selected, { point: arrival.context.point });
      app.annotationFloatOpen = true;
    }
  }
  app.field.setAnnotations(app.mapAnnotations, { visible: app.annotationsVisible, activeId: app.annotationFloatOpen ? app.activeAnnotationId : null });
  render();
  showActiveAnnotation();
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
  app.annotationMode = false;
  app.annotationDraft = null;
  app.annotationFloatOpen = false;
  app.ui.hideAnnotationFloat();
  app.field.setPendingAnnotation(null);
  app.annotationsVisible = true;
  app.field.setAnnotationMode(false);
  app.core.setPassThrough(false);
  app.mapAnnotations = annotationsForMap(map.id);
  if (!app.mapAnnotations.some((annotation) => annotation.id === app.activeAnnotationId)) app.activeAnnotationId = null;
  app.core.select(map, { focus });
  app.field.showRaster(map, { focus });
  app.ui.showGroundForMap();
  app.field.setAnnotations(app.mapAnnotations, { visible: app.annotationsVisible, activeId: null });
  pushTrail(`${map.city} ${map.year}`, map.id, trailWhy || "Selected from the temporal stack; X/Y remains the map’s geographic footprint and Z is its historical position.");
  recordEncounter(visibleEncounter?.fragment);
  render();
  refreshAnnotations();
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
  app.timewellExpanded = false;
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
    pushTrail(encounter.title, nodeId, why || `Reached ${label} through the book; no historical map layer is available here.`);
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
  app.timewellExpanded = false;
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
  app.timewellExpanded = false;
  app.corePoint = core;
  app.field.enterCore(core, app.coreMaps);
  app.core.enter(app.coreMaps, core);
  selectMap(map, { trailWhy: offer?.explanation || "Temporal juxtaposition; not a claimed scholarly relation.", interaction: "drift" });
}

function leaveCore() {
  closeAnnotation();
  app.ui.closeGround(true);
  app.timewellExpanded = false;
  app.core.leave(); app.field.leaveCore(); app.coreMaps = []; app.corePoint = null; app.selected = null; app.context = null; app.bookEncounter = null; app.activeEncounter = null; app.stray = null; app.drift = null; app.takeMode = false; app.annotationMode = false; app.mapAnnotations = []; app.activeAnnotationId = null; app.history = []; app.ui.clearTakeMap(); app.ui.field();
  syncTimewellSize();
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

function setBasemap(mode) { app.field.setBasemap(mode); }

function setRasterOpacity(opacity) { app.field.setRasterOpacity(opacity); }

function toggleAnnotations() {
  if (!app.selected || !app.mapAnnotations.length) return;
  app.annotationsVisible = !app.annotationsVisible;
  if (app.annotationsVisible) app.timewellExpanded = false;
  if (!app.annotationsVisible) { app.annotationFloatOpen = false; app.ui.hideAnnotationFloat(); }
  app.field.setAnnotations(app.mapAnnotations, { visible: app.annotationsVisible, activeId: app.annotationFloatOpen ? app.activeAnnotationId : null });
  render();
}

function openAnnotations() {
  if (!app.selected || !app.mapAnnotations.length) return;
  const wasHidden = !app.annotationsVisible;
  app.activeAnnotationId = app.mapAnnotations.some((annotation) => annotation.id === app.activeAnnotationId)
    ? app.activeAnnotationId : app.mapAnnotations[0].id;
  app.annotationFloatOpen = true;
  app.annotationsVisible = true;
  if (wasHidden) app.timewellExpanded = false;
  app.field.setAnnotations(app.mapAnnotations, { visible: true, activeId: app.activeAnnotationId });
  app.field.focusAnnotation(app.mapAnnotations.find((annotation) => annotation.id === app.activeAnnotationId)?.context.point);
  render();
  showActiveAnnotation();
}

function toggleAnnotationMode() {
  if (!app.selected || !app.annotations?.live) return;
  app.annotationMode = !app.annotationMode;
  if (app.annotationMode) app.timewellExpanded = false;
  app.annotationDraft = null;
  app.annotationFloatOpen = false;
  app.ui.hideAnnotationFloat();
  app.field.setPendingAnnotation(null);
  app.field.setAnnotations(app.mapAnnotations, { visible: app.annotationsVisible, activeId: null });
  app.field.setAnnotationMode(app.annotationMode);
  app.core.setPassThrough(app.annotationMode);
  render();
}

function stepAnnotation(direction) {
  if (!app.mapAnnotations.length) return;
  const current = app.mapAnnotations.findIndex((annotation) => annotation.id === app.activeAnnotationId);
  const next = (Math.max(0, current) + direction + app.mapAnnotations.length) % app.mapAnnotations.length;
  app.activeAnnotationId = app.mapAnnotations[next].id;
  app.annotationsVisible = true;
  app.annotationFloatOpen = true;
  app.field.setAnnotations(app.mapAnnotations, { visible: true, activeId: app.activeAnnotationId });
  app.field.focusAnnotation(app.mapAnnotations[next].context.point);
  render();
  showActiveAnnotation();
}

function selectAnnotation(annotation) {
  if (!annotation || annotation.context.mapId !== app.selected?.id) return;
  closeAnnotation();
  app.annotationMode = false;
  app.core.setPassThrough(false);
  app.annotationsVisible = true;
  app.activeAnnotationId = annotation.id;
  app.annotationFloatOpen = true;
  app.field.setAnnotationMode(false);
  app.field.setAnnotations(app.mapAnnotations, { visible: true, activeId: annotation.id });
  app.field.focusAnnotation(annotation.context.point);
  render();
  showActiveAnnotation();
}

function placeAnnotation(point) {
  if (!app.selected || !app.annotations?.live) return;
  if (!containsCoordinate(app.selected, point)) {
    app.ui.annotationPlacementHint("Choose a point inside the selected historical map.");
    return;
  }
  const submission = app.annotations.buildFormSubmission(annotationContext({
    map: app.selected,
    point,
    core: app.corePoint,
    camera: app.field.getAnnotationCamera(),
    basemap: app.ui.groundState.mode,
    opacity: app.ui.groundState.opacity
  }));
  if (!submission) return;
  app.annotationMode = false;
  app.core.setPassThrough(false);
  app.annotationDraft = { point, submission };
  app.field.setAnnotationMode(false);
  app.field.setPendingAnnotation(point);
  render();
  app.ui.showAnnotationDraft({ point, screenPoint: app.field.projectPoint(point), map: app.selected, submission });
}

function closeAnnotation() {
  app.annotationFloatOpen = false;
  app.annotationDraft = null;
  app.field?.setPendingAnnotation(null);
  app.ui.hideAnnotationFloat();
  if (app.selected) {
    app.field.setAnnotations(app.mapAnnotations, { visible: app.annotationsVisible, activeId: null });
    render();
  }
}

function changeAnnotationPoint() {
  closeAnnotation();
  app.annotationMode = true;
  app.core.setPassThrough(true);
  app.field.setAnnotationMode(true);
  render();
}

function confirmAnnotation({ text, name, tag }) {
  const draft = app.annotationDraft;
  if (!draft || !app.selected) return;
  const id = new URLSearchParams(draft.submission.context).get("id");
  if (!id) return;
  const note = {
    id, text: text.trim(), name: name.trim(), tag: tag.trim(),
    tags: tag.split(",").map((part) => part.trim().replace(/^#+/, "")).filter(Boolean).slice(0, 8),
    timestamp: new Date().toISOString(), timestampValue: Date.now(),
    context: { mapId: app.selected.id, point: draft.point }, pending: true
  };
  app.pendingAnnotations.unshift(note);
  app.annotationDraft = null;
  app.annotationFloatOpen = true;
  app.annotationsVisible = true;
  app.activeAnnotationId = id;
  app.field.setPendingAnnotation(null);
  app.mapAnnotations = annotationsForMap(app.selected.id);
  app.field.setAnnotations(app.mapAnnotations, { visible: true, activeId: id });
  render();
  showActiveAnnotation();
  pollSubmittedNote(id);
}

function pollSubmittedNote(id, attempts = 0) {
  window.setTimeout(async () => {
    await refreshAnnotations({ force: true });
    if (app.annotations?.annotations.some((note) => note.id === id)) return;
    const pending = app.pendingAnnotations.find((note) => note.id === id);
    if (!pending) return;
    if (attempts < 17) { pollSubmittedNote(id, attempts + 1); return; }
    pending.unconfirmed = true;
    if (app.selected?.id === pending.context.mapId) {
      app.mapAnnotations = annotationsForMap(app.selected.id);
      render();
      showActiveAnnotation();
    }
  }, attempts === 0 ? 2000 : 5000);
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
  if (document.querySelector("#origins-window").open) return;
  if (app.ui.bookEntryIsVisible()) return;
  if (document.querySelector("#help-dialog").open || !document.querySelector("#site-index").hidden || document.querySelector("#hyperbook-window").open || document.querySelector("#take-map-window").open) return;
  if ((app.annotationDraft || app.annotationFloatOpen) && event.key === "Escape") {
    event.preventDefault();
    closeAnnotation();
    return;
  }
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
  if (app.annotationMode && event.key === "Escape") {
    event.preventDefault();
    app.annotationMode = false;
    app.core.setPassThrough(false);
    app.field.setAnnotationMode(false);
    render();
    return;
  }
  if (app.annotationFloatOpen && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    stepAnnotation(event.key === "ArrowRight" ? 1 : -1);
    return;
  }
  if (event.key === "Escape" || event.key === "ArrowLeft") { event.preventDefault(); stepBack(); return; }
  if (!app.selected) return;
  if (event.key === "ArrowDown") { event.preventDefault(); moveTime("older"); }
  if (event.key === "ArrowUp") { event.preventDefault(); moveTime("newer"); }
  if ((event.key === "ArrowRight" || event.key === " ") && app.stray) { event.preventDefault(); acceptStray(app.stray.id); }
}

async function start() {
  try {
    app.ui = new Interface({ node: followNode, time: moveTime, stray: acceptStray, drift: acceptDrift, aperture: openAperture, read: () => app.ui.openRead(), surface: leaveCore, back: stepBack, take: beginTakeMap, takeSelected: openTakeMap, resumeTake: resumeTakeMap, exportMap, basemap: setBasemap, rasterOpacity: setRasterOpacity, annotations: toggleAnnotations, openAnnotations, annotate: toggleAnnotationMode, annotationStep: stepAnnotation, closeAnnotation, changeAnnotationPoint, confirmAnnotation });
    document.querySelector("#timewell-size").addEventListener("click", () => {
      app.timewellExpanded = !app.timewellExpanded;
      syncTimewellSize();
    });
    const pageParams = new URLSearchParams(window.location.search);
    if (pageParams.get("enter") === "map") app.ui.dismissBookEntry();
    [app.data, app.annotations] = await Promise.all([loadData(), AnnotationStore.load()]);
    app.simulation = annotationSimulationRequest(window.location.search);
    if (app.simulation) {
      const simulationMap = app.data.maps.find((map) => map.id === app.simulation.mapId);
      if (simulationMap) app.simulatedNotes = simulatedAnnotations(simulationMap, app.simulation.count);
    }
    app.ui.setBookEntryQuotes(app.data);
    app.core = new CoreView({
      onSelect: (map) => selectMap(map),
      onHover: (map) => app.field.highlightTimewellMap(map),
      onMapGesture: (event) => app.field.forwardTimewellGesture(event)
    });
    app.field = new MapView({
      maps: app.data.maps,
      onCore: enterCore,
      onDepth: (maps) => app.ui.showDepth(maps),
      onPreview: previewCore,
      onFieldEncounter: discoverField,
      onInteraction: respondToMapGesture,
      onTileStatus: (status) => { app.tile = status; render(); },
      onBasemapChange: (state) => app.ui.setGroundState(state),
      onRasterOpacityChange: (state) => app.ui.setGroundState(state),
      onAnnotationPlace: placeAnnotation,
      onAnnotationSelect: selectAnnotation,
      onAnnotationViewMove: moveAnnotationFloatWithMap
    });
    await app.field.init();
    app.ui.field();
    const requestedMapId = pageParams.get("map");
    const requestedMap = app.data.maps.find((map) => map.id === requestedMapId);
    if (requestedMap) {
      const core = { lng: (requestedMap.bbox[0] + requestedMap.bbox[2]) / 2, lat: (requestedMap.bbox[1] + requestedMap.bbox[3]) / 2 };
      const layers = app.data.maps.filter((map) => map.bbox[0] <= core.lng && map.bbox[2] >= core.lng && map.bbox[1] <= core.lat && map.bbox[3] >= core.lat)
        .sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
      app.ui.dismissBookEntry();
      app.corePoint = core;
      app.coreMaps = layers.length ? layers : [requestedMap];
      app.field.enterCore(core, app.coreMaps);
      app.core.enter(app.coreMaps, core);
      app.ui.lockedCore(app.coreMaps);
      selectMap(requestedMap, { focus: true, interaction: "annotation-link", trailWhy: "Arrived through a map annotation." });
    }
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
if (!window.__hypercitiesStarted) {
  window.__hypercitiesStarted = true;
  start();
}
