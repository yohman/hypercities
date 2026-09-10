const phasePaths = {
  book: "./data/phase-1-sample/hyperbook.json",
  entities: "./data/phase-1-sample/entities.json",
  edges: "./data/phase-1-sample/edges.json",
  mapGraph: "./data/hyperbook-graph.json"
};

const placeAliases = new Map([
  ["berlin", "place:berlin"], ["los angeles", "place:los-angeles"], ["l.a.", "place:los-angeles"],
  ["tohoku", "place:tohoku"], ["fukushima", "place:fukushima"], ["sendai", "place:sendai"],
  ["ishinomaki", "place:ishinomaki"], ["onagawa", "place:onagawa"]
]);

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

function normaliseMap(node) {
  const bbox = node.geometry?.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !node.temporal?.startYear) return null;
  const [west, south, east, north] = bbox.map(Number);
  if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) return null;
  return {
    id: node.id,
    title: node.title || node.alternativeTitle || "Untitled historical map",
    alternativeTitle: node.alternativeTitle || null,
    city: node.place?.label || node.sourceRecord?.city || "Unplaced",
    year: Number(node.temporal.startYear),
    endYear: Number(node.temporal.endYear || node.temporal.startYear),
    bbox: [west, south, east, north],
    tileBase: node.rendering?.tileUrl || null,
    tileType: node.rendering?.tileType || null,
    minZoom: Number(node.rendering?.minZoom ?? 0),
    maxZoom: Number(node.rendering?.maxZoom ?? 22),
    sourceId: node.source?.sourceRecordId || node.id,
    original: node
  };
}

export function containsCoordinate(map, lngLat) {
  const [west, south, east, north] = map.bbox;
  return lngLat.lng >= west && lngLat.lng <= east && lngLat.lat >= south && lngLat.lat <= north;
}

export function asPolygon(map, elevation = 0) {
  const [west, south, east, north] = map.bbox;
  return [
    [west, south, elevation], [east, south, elevation], [east, north, elevation],
    [west, north, elevation], [west, south, elevation]
  ];
}

export function tileTemplate(map) {
  if (!map.tileBase) return null;
  const base = map.tileBase.endsWith("/") ? map.tileBase : `${map.tileBase}/`;
  return `${base.replace(/^http:/, "https:")}{z}/{x}/{y}.png`;
}

export function tileDiagnostic(map) {
  if (!map.tileBase) return { state: "missing", message: "No raster endpoint is recorded for this map." };
  const originalProtocol = new URL(map.tileBase).protocol;
  const secure = tileTemplate(map);
  if (originalProtocol === "http:") {
    return {
      state: "upgraded",
      message: "Stored as HTTP; this prototype upgrades the same host to HTTPS before loading tiles.",
      originalUrl: map.tileBase,
      url: secure
    };
  }
  return { state: "recorded", message: "Secure raster template recorded.", url: secure };
}

export async function loadData() {
  const [book, entityDoc, edgeDoc, mapGraph] = await Promise.all([
    loadJson(phasePaths.book), loadJson(phasePaths.entities), loadJson(phasePaths.edges), loadJson(phasePaths.mapGraph)
  ]);
  const maps = mapGraph.nodes
    .filter((node) => node.kind === "historical-map" && node.eligibleForCoring !== false)
    .map(normaliseMap).filter(Boolean)
    .sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  return {
    book,
    entities: new Map(entityDoc.entities.map((entity) => [entity.id, entity])),
    objects: new Map(book.objects.map((object) => [object.id, object])),
    edges: edgeDoc.edges,
    maps
  };
}

export function phasePlaceId(city) { return placeAliases.get(String(city).trim().toLowerCase()) || null; }
export function titleFor(data, id) { return data.entities.get(id)?.preferredLabel || data.objects.get(id)?.title || id; }
export function objectKind(data, id) { return data.entities.get(id)?.type || data.objects.get(id)?.kind || "object"; }
