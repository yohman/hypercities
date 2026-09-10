import { objectKind, phasePlaceId, titleFor } from "./data.js";

function score(edge) { return edge.strength * edge.confidence + (edge.assertion === "explicit" ? 0.08 : 0); }
function relatedEdges(data, id) { return data.edges.filter((edge) => edge.from === id || edge.to === id).map((edge) => ({ edge, other: edge.from === id ? edge.to : edge.from })); }
function passageIdsForPlace(data, placeId) {
  return relatedEdges(data, placeId).filter(({ edge, other }) => edge.relationType === "situated-in" && objectKind(data, other) === "passage").map(({ other }) => other);
}
function quoteForPassage(data, passageId) {
  const quote = relatedEdges(data, passageId).find(({ edge, other }) => edge.relationType === "quoted-from" && objectKind(data, other) === "quotation");
  return quote ? data.objects.get(quote.other) : null;
}

export function mapContext(data, map) {
  const placeId = phasePlaceId(map.city);
  if (!placeId) return { placeId: null, passages: [], relations: [], quote: null, title: null };
  const passages = passageIdsForPlace(data, placeId).map((id) => data.objects.get(id)).filter(Boolean);
  const directRelations = passages.flatMap((passage) => relatedEdges(data, passage.id)
    .filter(({ other }) => other !== placeId && ["concept", "person", "project", "window", "event", "technology", "date", "time-range"].includes(objectKind(data, other)))
    .map(({ edge, other }) => ({ id: other, label: titleFor(data, other), kind: objectKind(data, other), edge, passage }))
  ).sort((a, b) => score(b.edge) - score(a.edge));
  const sectionRelations = passages.flatMap((passage) => {
    const containers = relatedEdges(data, passage.id).filter(({ edge, other }) => edge.relationType === "contains" && ["section", "window", "gallery"].includes(objectKind(data, other)));
    return containers.flatMap(({ other: sectionId }) => relatedEdges(data, sectionId)
      .filter(({ edge, other }) => edge.relationType === "contains" && other !== passage.id && objectKind(data, other) === "passage")
      .flatMap(({ other: siblingId }) => relatedEdges(data, siblingId)
        .filter(({ other }) => ["concept", "person", "project", "window", "event"].includes(objectKind(data, other)))
        .map(({ edge, other }) => ({
          id: other, label: titleFor(data, other), kind: objectKind(data, other), passage: data.objects.get(siblingId),
          edge: { ...edge, relationType: "co-appears-in-section", strength: +(edge.strength * 0.65).toFixed(2), confidence: +(edge.confidence * 0.75).toFixed(2), assertion: "inferred", evidence: { ...edge.evidence, note: `${edge.evidence.note} Offered through an inferred shared-section traversal.` } }
        }))
      )
    );
  });
  const relations = [...directRelations, ...sectionRelations].sort((a, b) => score(b.edge) - score(a.edge));
  const unique = [];
  const seen = new Set();
  for (const relation of relations) if (!seen.has(relation.id)) { unique.push(relation); seen.add(relation.id); }
  const lead = passages[0] || null;
  return { placeId, passages, relations: unique, quote: lead ? quoteForPassage(data, lead.id) : null, title: titleFor(data, placeId) };
}

export function nodeEncounter(data, nodeId) {
  const entity = data.entities.get(nodeId);
  const object = data.objects.get(nodeId);
  const source = entity || object;
  if (!source) return null;
  const links = relatedEdges(data, nodeId)
    .filter(({ other }) => ["concept", "person", "project", "window", "event", "place"].includes(objectKind(data, other)))
    .map(({ edge, other }) => ({ id: other, label: titleFor(data, other), kind: objectKind(data, other), edge }))
    .sort((a, b) => score(b.edge) - score(a.edge));
  return { id: nodeId, title: entity?.preferredLabel || object?.title || nodeId, kind: entity?.type || object?.kind || "object", summary: entity?.definition || object?.summary || null, provenance: source.provenance || null, links, source };
}

export function strayOffer(data, context, trailIds) {
  if (!context?.relations?.length) return null;
  const candidates = context.relations.filter((relation) => !trailIds.slice(-3).includes(relation.id))
    .map((relation) => ({ ...relation, weight: score(relation.edge) + Math.random() * 0.42 }));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.weight - a.weight);
  const band = candidates.slice(0, Math.min(4, candidates.length));
  const chosen = band[Math.floor(Math.random() * band.length)];
  return { ...chosen, explanation: `${chosen.edge.assertion}; ${chosen.edge.relationType}; strength ${chosen.edge.strength.toFixed(2)}, confidence ${chosen.edge.confidence.toFixed(2)}. ${chosen.edge.evidence.note}` };
}

export function driftOffer(maps, map) {
  const seed = Number(String(map.sourceId).replace(/\D/g, "")) || 0;
  if (seed % 4 !== 0) return null;
  const nearby = maps.filter((candidate) => candidate.city !== map.city && Math.abs(candidate.year - map.year) <= 8);
  if (!nearby.length) return null;
  const sorted = nearby.sort((a, b) => Math.abs(a.year - map.year) - Math.abs(b.year - map.year));
  const chosen = sorted[Math.floor(Math.random() * Math.min(8, sorted.length))];
  return { map: chosen, explanation: `Temporal juxtaposition only: ${chosen.city} ${chosen.year} is within ${Math.abs(chosen.year - map.year)} years of ${map.city} ${map.year}; no scholarly relation is claimed.` };
}
