import { objectKind, titleFor } from "./data.js";

const LINK_KINDS = new Set(["concept", "person", "project", "window", "event", "place", "technology", "date", "time-range"]);
const STRENGTH = { strong: 1, moderate: 0.66, light: 0.34 };
const CONFIDENCE = { high: 1, medium: 0.68, low: 0.36 };
const DIRECT_PLACE_SCALES = new Set(["city", "district", "site", "region"]);
// This is only an editorial activation region. It is not an assertion that a
// map anywhere in this box is a Fukushima map. The selected passages retain
// their own explicit Tohoku/Fukushima provenance.
const JAPAN_ACTIVATION_BOUNDS = { west: 122, east: 154.5, south: 24, north: 46.5 };

function value(value, scale) { return typeof value === "number" ? value : scale[value] || 0.5; }
function score(edge) { return value(edge?.strength, STRENGTH) * value(edge?.confidence, CONFIDENCE) + (edge?.assertion === "book-explicit" || edge?.assertion === "explicit" ? 0.08 : 0); }
function relatedEdges(data, id) { return data.edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => ({ edge, other: edge.from === id ? edge.to : edge.from })); }
function unique(items, key = (item) => item.id) {
  const seen = new Set();
  return items.filter((item) => { const id = key(item); if (seen.has(id)) return false; seen.add(id); return true; });
}
function slug(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function pageLabel(provenance) {
  const [start, end] = provenance?.printedPages || [];
  if (!start) return "";
  return start === end ? `p. ${start}` : `pp. ${start}–${end}`;
}
function readableTag(tag) {
  const names = {
    compare: "comparison", layer: "layers", wander: "wandering", drift: "drift",
    "historical-change": "historical change", "memory-time": "memory", "event-time": "event time",
    "open-future": "the open future", "time-layering": "time-layers", "scale-and-zoom": "scale",
    "raster-basemap-alignment": "alignment", "conceptual-continuity": "an idea already in motion"
  };
  return names[tag] || String(tag || "the map").replace(/-/g, " ");
}
function takeWeighted(candidates, count = 1) {
  const remaining = [...candidates];
  const selected = [];
  while (remaining.length && selected.length < count) {
    const max = Math.max(...remaining.map((item) => item.weight));
    const weights = remaining.map((item) => Math.exp((item.weight - max) * 1.15));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = Math.random() * total;
    let index = 0;
    for (; index < weights.length - 1; index += 1) { cursor -= weights[index]; if (cursor <= 0) break; }
    selected.push(remaining.splice(index, 1)[0]);
  }
  return selected;
}
function recent(options, key) { return new Set((options?.[key] || []).slice(-(key.includes("Passage") ? 6 : 16))); }
function sourceLabel(data, encounter) {
  const passageId = encounter.sourcePassageId;
  const voice = passageId && relatedEdges(data, passageId).find(({ edge }) => edge.relationType === "narrated-by");
  return voice ? titleFor(data, voice.other) : "HyperCities";
}
function link(data, id, edge, passageId = null, bonus = 0) {
  return { id, label: titleFor(data, id), kind: objectKind(data, id), edge, passageId, weight: score(edge) + bonus };
}
function passageIdsForNode(data, id) {
  if (objectKind(data, id) === "passage") return [id];
  return unique(relatedEdges(data, id)
    .filter(({ other }) => objectKind(data, other) === "passage")
    .map(({ other }) => other));
}
function containersForPassage(data, passageId) {
  return relatedEdges(data, passageId)
    .filter(({ edge, other }) => edge.relationType === "contains" && ["chapter", "windows", "gallery"].includes(objectKind(data, other)))
    .map(({ edge, other }) => ({ id: other, edge, kind: objectKind(data, other), label: titleFor(data, other) }));
}
function directPassageLinks(data, passageId, bonus = 0) {
  return unique(relatedEdges(data, passageId)
    .filter(({ other }) => LINK_KINDS.has(objectKind(data, other)))
    .map(({ edge, other }) => link(data, other, edge, passageId, bonus)));
}
function coreIsInJapan(core) {
  return Boolean(core && core.lng >= JAPAN_ACTIVATION_BOUNDS.west && core.lng <= JAPAN_ACTIVATION_BOUNDS.east
    && core.lat >= JAPAN_ACTIVATION_BOUNDS.south && core.lat <= JAPAN_ACTIVATION_BOUNDS.north);
}
function japanThreadPassageIds(data) {
  const yohPassages = relatedEdges(data, "voice:yoh-kawano")
    .filter(({ edge, other }) => edge.relationType === "narrated-by" && objectKind(data, other) === "passage")
    .map(({ other }) => other);
  return new Set(yohPassages.filter((id) => (data.objects.get(id)?.provenance?.printedPages?.[0] || 0) >= 172));
}
function fukushimaThreadPassageIds(data) {
  return new Set(["place:fukushima", "place:tohoku"].flatMap((id) => passageIdsForNode(data, id)));
}
function placeIdsForMap(data, map) {
  const city = slug(map.city);
  return new Set([...data.entities.values()]
    .filter((entity) => entity.type === "place" && DIRECT_PLACE_SCALES.has(entity.placeScale))
    .filter((entity) => [entity.preferredLabel, ...(entity.aliases || [])].some((label) => slug(label) === city))
    .map((entity) => entity.id));
}
function spatialAffordancesForMap(data, map) {
  const placeIds = placeIdsForMap(data, map);
  const placeTags = new Set([...placeIds].map((id) => slug(titleFor(data, id))));
  return data.affordances.filter((affordance) => affordance.dimension === "spatial" && placeTags.has(slug(affordance.tag)));
}
function encounterFor(data, id) { return data.encounters.get(id) || null; }
function encounterPassage(encounter) { return encounter?.sourcePassageId || null; }
function encounterLinks(data, encounter, options = {}) {
  const passageId = encounterPassage(encounter);
  if (!passageId) return [];
  const seen = recent(options, "seenNodeIds");
  const links = directPassageLinks(data, passageId)
    .filter((item) => item.id !== encounter.sourceObjectId && !seen.has(item.id))
    .map((item) => ({ ...item, weight: item.weight + (item.kind === "concept" ? 0.28 : 0) + Math.random() * 0.22 }));
  return takeWeighted(unique(links), 2);
}
function encounterConceptIds(data, encounter) {
  const passageId = encounterPassage(encounter);
  if (!passageId) return [];
  return directPassageLinks(data, passageId).filter((item) => item.kind === "concept").map((item) => item.id);
}
function stateAffordances(data, encounter, state, directAffordanceIds) {
  const cues = new Set(state.cues || []);
  const concepts = new Set(state.conceptIds || []);
  const affordances = data.affordancesByEncounter.get(encounter.id) || [];
  return affordances.map((affordance) => {
    const cueMatch = (affordance.activation?.stateCues || []).filter((cue) => cues.has(cue));
    const direct = directAffordanceIds.has(affordance.id);
    const conceptualContinuity = affordance.dimension === "conceptual" && concepts.has(`concept:${slug(affordance.tag)}`);
    const timed = affordance.dimension === "temporal" && /^\d{3,4}$/.test(affordance.tag || "") && Math.abs(Number(affordance.tag) - state.map.year) <= 14;
    return { affordance, cueMatch, direct, conceptualContinuity, timed };
  });
}
function arrivalFor(candidate, state, mode) {
  const match = candidate.matches.find((item) => item.direct) || candidate.matches.find((item) => item.cueMatch.length) || candidate.matches.find((item) => item.conceptualContinuity) || candidate.matches[0];
  const affordance = match?.affordance;
  const tag = affordance?.tag || "the map";
  const label = readableTag(tag);
  const detail = affordance
    ? `Editorial ${affordance.dimension} resonance: ${tag}. Source basis: ${affordance.sourceBasis?.assertion || "book-explicit"}.`
    : "Editorial encounter selection with source provenance retained.";
  if (mode === "japan") {
    return {
      mode,
      label: "a Japan thread · Yoh Kawano",
      detail: "Editorial regional activation: this core lies in Japan, so the encounter is drawn from Yoh Kawano’s book-explicit Mapping Events passages on Tohoku/Fukushima. It does not claim that the selected historical map depicts those sites."
    };
  }
  if (mode === "spatial") return { mode, label: `here, in ${state.map.city}`, detail };
  if (mode === "sideways") return { mode, label: `a side street through ${label}`, detail };
  if ((state.cues || []).includes("move-earlier")) return { mode, label: `descending through ${label}`, detail };
  if ((state.cues || []).includes("move-later")) return { mode, label: `surfacing through ${label}`, detail };
  if ((state.cues || []).includes("zoom-change")) return { mode, label: `at a changed scale: ${label}`, detail };
  if ((state.cues || []).includes("return-to-place")) return { mode, label: `on returning: ${label}`, detail };
  return { mode, label: `through ${label}`, detail };
}
function makeFragment(data, encounter, arrival) {
  return {
    id: encounter.id,
    kind: encounter.kind,
    text: encounter.displayText,
    passageId: encounter.sourcePassageId,
    sourceObjectId: encounter.sourceObjectId,
    source: `${sourceLabel(data, encounter)} · ${pageLabel(encounter.provenance)}`,
    provenance: encounter.provenance,
    apertureId: encounter.id,
    arrival,
    conceptIds: encounterConceptIds(data, encounter)
  };
}
function candidatesForMap(data, map, state, allowed = null) {
  const directAffordances = spatialAffordancesForMap(data, map);
  const directAffordanceIds = new Set(directAffordances.map((item) => item.id));
  const seenEncounterIds = recent(state, "seenEncounterIds");
  const seenPassageIds = recent(state, "seenPassageIds");
  const japanThread = coreIsInJapan(state.core);
  const japanPassages = japanThread ? japanThreadPassageIds(data) : new Set();
  const fukushimaPassages = japanThread ? fukushimaThreadPassageIds(data) : new Set();
  const raw = (allowed || data.encounterList).filter((encounter) => {
    if (encounter.kind === "quotation" || encounter.kind === "passage-title") return true;
    return encounter.editorialSuitability === "strong";
  }).map((encounter) => {
    const matches = stateAffordances(data, encounter, state, directAffordanceIds);
    const direct = matches.some((item) => item.direct);
    const cueMatches = matches.flatMap((item) => item.cueMatch);
    const continuity = matches.some((item) => item.conceptualContinuity);
    const timed = matches.some((item) => item.timed);
    const isJapanThread = japanPassages.has(encounter.sourcePassageId);
    const isFukushimaThread = fukushimaPassages.has(encounter.sourcePassageId);
    const kindBonus = encounter.kind === "quotation" ? 0.46 : encounter.kind === "passage-title" ? 0.18 : -0.05;
    const suitability = encounter.editorialSuitability === "strong" ? 0.26 : 0;
    const freshness = seenEncounterIds.has(encounter.id) ? -12 : seenPassageIds.has(encounter.sourcePassageId) ? -4.2 : 0;
    const weight = (direct ? 3.3 : 0) + cueMatches.length * 0.72 + (continuity ? 0.58 : 0) + (timed ? 0.4 : 0)
      + (isJapanThread ? 3.8 : 0) + (isFukushimaThread ? 1.1 : 0) + kindBonus + suitability + freshness + Math.random() * 0.34;
    return { encounter, matches, direct, cueMatches, continuity, timed, japanThread: isJapanThread, fukushimaThread: isFukushimaThread, weight };
  });
  const fresh = raw.filter((candidate) => !seenEncounterIds.has(candidate.encounter.id) && !seenPassageIds.has(candidate.encounter.sourcePassageId));
  // A passage cooldown is a real safeguard, not a preference that vanishes
  // as soon as the current interaction has fewer than ten candidates.
  return fresh.length >= 3 ? fresh : raw.filter((candidate) => !seenEncounterIds.has(candidate.encounter.id));
}
function chooseCandidate(candidates, state) {
  const direct = candidates.filter((candidate) => candidate.direct);
  const resonant = candidates.filter((candidate) => !candidate.direct && (candidate.cueMatches.length || candidate.continuity || candidate.timed));
  const sideStreet = resonant.filter((candidate) => candidate.matches.some((item) => ["cartographic", "interactional", "conceptual"].includes(item.affordance.dimension)));
  let mode = "resonance";
  let pool = resonant.length ? resonant : candidates;
  const japan = candidates.filter((candidate) => candidate.japanThread);
  if (japan.length) {
    // A coordinate inside Japan opens a deliberately labelled Yoh/Fukushima
    // thread. This is editorial activation, never a broad geographic claim.
    mode = "japan";
    pool = japan;
  } else if (sideStreet.length >= 8 && (state.seenEncounterIds || []).length > 1 && Math.random() < 0.24) {
    mode = "sideways";
    // A sideways encounter stays source-grounded, but it makes room for a
    // surprising voice rather than always taking the most literal relation.
    pool = sideStreet.filter((candidate) => candidate.weight > 0.5);
  } else if (direct.length && Math.random() < 0.46) {
    mode = "spatial";
    pool = direct;
  }
  // The headings and named fragments are useful doors, but the book should
  // ordinarily speak in its own sentences rather than becoming an index.
  const quotations = pool.filter((candidate) => candidate.encounter.kind === "quotation");
  if ((mode === "japan" && quotations.length) || (quotations.length >= 4 && Math.random() < 0.76)) pool = quotations;
  const band = [...pool].sort((a, b) => b.weight - a.weight).slice(0, Math.max(10, Math.min(72, pool.length)));
  const chosen = takeWeighted(band, 1)[0] || null;
  return chosen && { ...chosen, mode };
}

export function mapContext(data, map) {
  const placeIds = placeIdsForMap(data, map);
  const directAffordances = spatialAffordancesForMap(data, map);
  const directEncounterIds = new Set(directAffordances.map((item) => item.encounterId));
  const passages = unique([...directEncounterIds].map((id) => encounterFor(data, id)?.sourcePassageId).filter(Boolean));
  const relations = unique(passages.flatMap((passageId) => directPassageLinks(data, passageId)));
  return { placeIds, directAffordances, directEncounterIds, passages, relations, title: map.city };
}

export function mapEncounter(data, map, options = {}) {
  if (Array.isArray(options)) options = { seenEncounterIds: options };
  const state = { map, cues: ["select-map", "compare-representations"], ...options.state, seenEncounterIds: options.seenEncounterIds || [], seenPassageIds: options.seenPassageIds || [] };
  const context = options.context || mapContext(data, map);
  const chosen = chooseCandidate(candidatesForMap(data, map, state), state);
  if (!chosen) return { context, fragment: null, links: [] };
  const fragment = makeFragment(data, chosen.encounter, arrivalFor(chosen, state, chosen.mode));
  return { context, fragment, links: encounterLinks(data, chosen.encounter, options), selection: chosen };
}

export function fieldFragment(data, maps, options = {}) {
  const map = [...maps].sort((a, b) => a.year - b.year)[0];
  if (!map) return null;
  const encounter = mapEncounter(data, map, {
    ...options,
    state: { map, cues: ["core-depth", "select-map"], ...(options.state || {}) }
  });
  return encounter.fragment ? { ...encounter.fragment, links: encounter.links, city: map.city } : null;
}

export function nodeEncounter(data, nodeId, options = {}) {
  const entity = data.entities.get(nodeId);
  const object = data.objects.get(nodeId);
  const source = entity || object;
  if (!source) return null;
  const passages = passageIdsForNode(data, nodeId);
  const direct = data.encounterList.filter((encounter) => encounter.sourceObjectId === nodeId);
  const passageEncounters = data.encounterList.filter((encounter) => passages.includes(encounter.sourcePassageId));
  const allowed = unique([...direct, ...passageEncounters]);
  const state = {
    map: options.map || { city: "the field", year: 0 },
    cues: ["conceptual-continuity", "lateral-traverse", ...(options.state?.cues || [])],
    conceptIds: [nodeId, ...(options.state?.conceptIds || [])],
    seenEncounterIds: options.seenEncounterIds || [],
    seenPassageIds: options.seenPassageIds || []
  };
  const chosen = chooseCandidate(candidatesForMap(data, state.map, state, allowed), state);
  if (!chosen) return null;
  const fragment = makeFragment(data, chosen.encounter, arrivalFor(chosen, state, "resonance"));
  return {
    id: nodeId,
    title: entity?.preferredLabel || object?.title || nodeId,
    kind: entity?.type || object?.kind || "object",
    provenance: fragment.provenance,
    fragment,
    links: encounterLinks(data, chosen.encounter, options),
    source
  };
}

export function apertureFor(data, nodeId) {
  const encounter = encounterFor(data, nodeId);
  const sourceId = encounter?.sourceObjectId || nodeId;
  const object = data.objects.get(sourceId);
  const entity = data.entities.get(sourceId) || data.entities.get(nodeId);
  const source = object || entity;
  if (!source && !encounter) return null;
  const passageId = encounter?.sourcePassageId || (object?.kind === "passage" ? sourceId : passageIdsForNode(data, sourceId)[0] || null);
  const passage = passageId ? data.objects.get(passageId) : null;
  const container = passageId ? containersForPassage(data, passageId)[0] : null;
  const quote = object?.kind === "quotation" ? object.text : null;
  const page = encounter?.provenance?.printedPages?.[0] || source?.provenance?.printedPages?.[0] || null;
  const pageLocation = quote ? data.bookPageLocations?.[sourceId] || null : null;
  return {
    id: encounter?.id || container?.id || nodeId,
    kind: encounter?.kind || object?.kind || entity?.type || "object",
    title: passage?.title || encounter?.displayText || object?.title || entity?.preferredLabel || "HyperCities",
    quote,
    page,
    pageImage: page ? `./assets/book-pages/page-${String(page).padStart(3, "0")}.webp` : null,
    pageLocation,
    source: `${encounter ? sourceLabel(data, encounter) : "HyperCities"}${encounter?.provenance ? ` · ${pageLabel(encounter.provenance)}` : ""}`,
    provenance: encounter?.provenance || source?.provenance || null,
    figure: passageId ? relatedEdges(data, passageId).map(({ other }) => data.objects.get(other)).find((item) => item?.kind === "figure-reference") || null : null,
    container
  };
}

export function isPlaceNode(data, nodeId) { return objectKind(data, nodeId) === "place"; }

export function strayOffer(data, context, trailIds = []) {
  const recentTrail = new Set(trailIds.slice(-5));
  const candidates = (context?.relations || [])
    .filter((relation) => !recentTrail.has(relation.id))
    .map((relation) => ({ ...relation, weight: relation.weight + Math.random() * 0.7 }));
  const chosen = takeWeighted(candidates.sort((a, b) => b.weight - a.weight).slice(0, 14), 1)[0];
  if (!chosen) return null;
  return {
    ...chosen,
    explanation: `A lateral book path via ${chosen.edge.assertion}; ${chosen.edge.relationType}; ${chosen.edge.evidence?.note || "source-grounded relation"}.`
  };
}

export function driftOffer(data, map, { force = false } = {}) {
  const seed = Number(String(map.sourceId).replace(/\D/g, "")) || 0;
  if (!force && seed % 4 !== 0) return null;
  let nearby = data.maps.filter((candidate) => candidate.city !== map.city && Math.abs(candidate.year - map.year) <= 8);
  if (!nearby.length && force) nearby = data.maps.filter((candidate) => candidate.city !== map.city && placeIdsForMap(data, candidate).size && Math.abs(candidate.year - map.year) <= 50);
  if (!nearby.length) return null;
  const bookLinked = nearby.filter((candidate) => placeIdsForMap(data, candidate).size);
  const sorted = (bookLinked.length ? bookLinked : nearby).sort((a, b) => Math.abs(a.year - map.year) - Math.abs(b.year - map.year));
  const chosen = sorted[Math.floor(Math.random() * Math.min(8, sorted.length))];
  return { map: chosen, explanation: `Temporal juxtaposition only: ${chosen.city} ${chosen.year} is within ${Math.abs(chosen.year - map.year)} years of ${map.city} ${map.year}; no scholarly relation is claimed.` };
}
