import { loadMapById, tileTemplate } from "./data.js";

const status = document.querySelector("#preview-status");
const mapId = new URLSearchParams(window.location.search).get("map");

function showStatus(message) {
  status.textContent = message;
  status.hidden = false;
}

try {
  const record = await loadMapById(mapId);
  const template = record && tileTemplate(record);
  if (!record || !template) throw new Error("No source tile template is recorded for this map.");

  const [west, south, east, north] = record.bbox;
  const preview = new maplibregl.Map({
    container: "preview-map",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
    center: [(west + east) / 2, (south + north) / 2],
    zoom: Math.max(0, record.minZoom - 1),
    attributionControl: false
  });
  preview.addControl(new maplibregl.NavigationControl(), "top-right");

  preview.on("load", () => {
    preview.addSource("historical-map", {
      type: "raster",
      tiles: [template],
      tileSize: 256,
      bounds: record.bbox,
      minzoom: record.minZoom,
      maxzoom: record.maxZoom
    });
    preview.addLayer({ id: "historical-map", type: "raster", source: "historical-map" });
    preview.fitBounds([[west, south], [east, north]], { padding: 12, duration: 0 });
  });
  preview.on("sourcedata", (event) => {
    if (event.sourceId === "historical-map" && event.isSourceLoaded) status.hidden = true;
  });
  preview.on("error", (event) => {
    if (event.sourceId === "historical-map") showStatus("The source tiles did not respond in this browser.");
  });
} catch (error) {
  showStatus(error.message || "This map preview could not be prepared.");
}
