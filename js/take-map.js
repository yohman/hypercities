import { tileTemplate } from "./data.js";

// Downloads may be opened from a local file, so their KML NetworkLink needs a
// stable HTTPS address that Google Earth can resolve independently of the app.
export const HYPERCITIES_PUBLIC_URL = "https://yohman.github.io/hypercities/";

function slug(value) {
  return String(value || "map").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function sourceRecord(map) { return map.original?.sourceRecord || {}; }

function xmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;"
  })[character]);
}

function decimal(value) { return Number(value).toFixed(6); }

function tileX(longitude, zoom) {
  return Math.floor(((longitude + 180) / 360) * (2 ** zoom));
}

function tileY(latitude, zoom) {
  const bounded = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (bounded * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * (2 ** zoom));
}

function tileLongitude(x, zoom) {
  return (x / (2 ** zoom)) * 360 - 180;
}

function tileLatitude(y, zoom) {
  const radians = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (2 ** zoom))));
  return (radians * 180) / Math.PI;
}

// The source raster is an XYZ tile pyramid. Google Earth cannot consume that
// template as a NetworkLink, but it can draw each source tile as a correctly
// positioned GroundOverlay. The library's recorded minimum zoom is its first
// complete, practical overview, so it keeps each linked KML compact.
function kmlRasterOverlays(map) {
  const template = tileTemplate(map);
  if (!template) return "";
  const [west, south, east, north] = map.bbox;
  const zoom = Math.max(0, Math.round(map.minZoom || 0));
  const tileLimit = (2 ** zoom) - 1;
  const startX = Math.max(0, Math.min(tileLimit, tileX(west, zoom)));
  const endX = Math.max(0, Math.min(tileLimit, tileX(east, zoom)));
  const startY = Math.max(0, Math.min(tileLimit, tileY(north, zoom)));
  const endY = Math.max(0, Math.min(tileLimit, tileY(south, zoom)));
  const overlays = [];
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const href = template.replace("{z}", String(zoom)).replace("{x}", String(x)).replace("{y}", String(y));
      overlays.push(`    <GroundOverlay>\n      <name>${xmlEscape(`${map.title} · raster tile ${zoom}/${x}/${y}`)}</name>\n      <drawOrder>1</drawOrder>\n      <Icon><href>${xmlEscape(href)}</href></Icon>\n      <LatLonBox>\n        <north>${decimal(tileLatitude(y, zoom))}</north>\n        <south>${decimal(tileLatitude(y + 1, zoom))}</south>\n        <east>${decimal(tileLongitude(x + 1, zoom))}</east>\n        <west>${decimal(tileLongitude(x, zoom))}</west>\n      </LatLonBox>\n    </GroundOverlay>`);
    }
  }
  return overlays.join("\n");
}

export function mapCitation(map) {
  const source = sourceRecord(map);
  const date = map.endYear !== map.year ? `${map.year}–${map.endYear}` : map.year;
  const collection = source.collectionSource ? ` ${source.collectionSource}.` : "";
  return `${map.title} (${date}). HyperCities Map Library.${collection}`;
}

export function networkKmlFilenameFor(map) {
  return `hypercities-map-${slug(map.id)}.kml`;
}

export function hostedNetworkKmlUrlFor(map) {
  return new URL(`data/kml/${networkKmlFilenameFor(map)}`, HYPERCITIES_PUBLIC_URL).href;
}

function mapKmlDocument(map, { networkLink = null, includePlacemark = true } = {}) {
  const [west, south, east, north] = map.bbox;
  const source = sourceRecord(map);
  const years = map.endYear === map.year ? String(map.year) : `${map.year}–${map.endYear}`;
  const raster = tileTemplate(map);
  const rasterOverlays = kmlRasterOverlays(map);
  const coordinates = [[west, south], [east, south], [east, north], [west, north], [west, south]]
    .map(([longitude, latitude]) => `${longitude},${latitude},0`)
    .join(" ");
  const data = [
    ["mapId", map.id],
    ["place", map.city],
    ["years", years],
    ["sourceRecordId", map.sourceId],
    ["collection", source.collectionSource || ""],
    ["creator", source.creator || ""],
    ["citation", mapCitation(map)],
    ["tileTemplate", raster || ""],
    ["groundOverlayTiles", rasterOverlays ? "Source XYZ tiles included as KML GroundOverlays at the recorded minimum zoom." : "No renderable source tiles are recorded."],
    ["rasterAvailability", raster ? "Original XYZ tiles, rendered here as KML GroundOverlays at the recorded minimum zoom." : "No raster endpoint is recorded."],
    ["exportScope", "Georeferenced footprint, provenance, and a source-tile raster overview at the recorded minimum zoom."]
  ].map(([name, value]) => `      <Data name="${xmlEscape(name)}"><value>${xmlEscape(value)}</value></Data>`).join("\n");
  const linkedRecord = networkLink
    ? `\n    <NetworkLink>\n      <name>${xmlEscape(`Live HyperCities record — ${map.title}`)}</name>\n      <visibility>1</visibility>\n      <open>1</open>\n      <Link>\n        <href>${xmlEscape(networkLink)}</href>\n        <refreshMode>onInterval</refreshMode>\n        <refreshInterval>3600</refreshInterval>\n      </Link>\n    </NetworkLink>`
    : "";
  const placemark = includePlacemark
    ? `\n    <Placemark>\n      <name>${xmlEscape(map.title)}</name>\n      <description>${xmlEscape(`HyperCities Map Library footprint · ${map.city} · ${years}`)}</description>\n      <TimeSpan><begin>${xmlEscape(`${map.year}-01-01`)}</begin><end>${xmlEscape(`${map.endYear}-12-31`)}</end></TimeSpan>\n      <ExtendedData>\n${data}\n      </ExtendedData>\n      <styleUrl>#hypercities-footprint</styleUrl>\n      <Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${coordinates}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n    </Placemark>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlEscape(networkLink ? `HyperCities Network Link — ${map.title}` : map.title)}</name>
    <description>${xmlEscape(`${map.title}, ${map.city}, ${years}. ${mapCitation(map)}`)}</description>
    <Style id="hypercities-footprint">
      <LineStyle><color>ff5e6ad6</color><width>2</width></LineStyle>
      <PolyStyle><color>285e6ad6</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
${placemark}
${rasterOverlays}
${linkedRecord}
  </Document>
</kml>`;
}

// KML NetworkLinks must resolve to KML/KMZ files, not an XYZ template. This
// file is both a local map overlay and a live pointer to its hosted record;
// MapLibre and QGIS remain the full-resolution, interactive raster routes.
export function kmlFor(map) {
  return mapKmlDocument(map, { networkLink: hostedNetworkKmlUrlFor(map), includePlacemark: false });
}

export function networkKmlRecordFor(map) {
  return mapKmlDocument(map);
}

export function mapLibreSnippetFor(map) {
  const template = tileTemplate(map);
  if (!template) return "// This map has no recorded tile template.";
  const [west, south, east, north] = map.bbox;
  const center = [(west + east) / 2, (south + north) / 2];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
  <style>html, body, #map { width: 100%; height: 100%; margin: 0; }</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script>
const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
  center: [${decimal(center[0])}, ${decimal(center[1])}],
  zoom: ${Math.max(0, map.minZoom - 1)}
});
map.addControl(new maplibregl.NavigationControl(), "top-right");

map.on("load", () => {
  map.addSource("historical-map", {
    type: "raster",
    tiles: [${JSON.stringify(template)}],
    tileSize: 256,
    bounds: [${decimal(west)}, ${decimal(south)}, ${decimal(east)}, ${decimal(north)}],
    minzoom: ${map.minZoom}, maxzoom: ${map.maxZoom},
    attribution: ${JSON.stringify(mapCitation(map))}
  });
  map.addLayer({ id: "historical-map", type: "raster", source: "historical-map" });
  map.fitBounds([[${decimal(west)}, ${decimal(south)}], [${decimal(east)}, ${decimal(north)}]], { padding: 24 });
});
</script>
</body>
</html>`;
}

export function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function kmlFilenameFor(map) {
  const name = `${slug(map.city)}-${map.year}-${slug(map.title).slice(0, 54)}`;
  return `hypercities-network-link-${name}.kml`;
}
