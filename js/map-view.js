import { asPolygon, containsCoordinate, tileDiagnostic, tileTemplate } from "./data.js";

// HyperCities book-cover red, with a quieter shade for unselected extents.
const RED = [166, 42, 38];
const RED_BRIGHT = [218, 56, 51];

function grayscale(color, dimming = 0.45) {
  if (typeof color !== "string") return null;
  let red; let green; let blue; let alpha = null;
  const hex = color.match(/^#([0-9a-f]{3,8})$/i);
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (hex) {
    const value = hex[1].length <= 4
      ? [...hex[1]].map((character) => character + character).join("")
      : hex[1];
    red = Number.parseInt(value.slice(0, 2), 16);
    green = Number.parseInt(value.slice(2, 4), 16);
    blue = Number.parseInt(value.slice(4, 6), 16);
    alpha = value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : null;
  } else if (rgb) {
    const values = rgb[1].split(",").map((value) => value.trim());
    [red, green, blue] = values.slice(0, 3).map(Number);
    alpha = values[3] === undefined ? null : Number(values[3]);
  } else return null;
  if (![red, green, blue].every(Number.isFinite)) return null;
  const lightness = Math.round((red * 0.2126 + green * 0.7152 + blue * 0.0722) * dimming);
  return alpha === null ? `rgb(${lightness}, ${lightness}, ${lightness})` : `rgba(${lightness}, ${lightness}, ${lightness}, ${alpha})`;
}

export class MapView {
  constructor({ maps, onCore, onDepth, onPreview, onFieldEncounter, onInteraction, onTileStatus }) {
    Object.assign(this, { maps, onCore, onDepth, onPreview, onFieldEncounter, onInteraction, onTileStatus, hoverIds: new Set() });
    this.rasterLayerId = "historical-raster";
    this.rasterSourceId = "historical-raster-source";
  }

  async init() {
    this.map = new maplibregl.Map({
      container: "map",
      style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      center: [10, 27], zoom: 1.7, minZoom: 1.25, attributionControl: false,
      // Arrow keys belong to HyperCities: up/down move through the TimeWell
      // and left/right follow the current conceptual path, never the basemap.
      keyboard: false
    });
    await new Promise((resolve) => this.map.once("load", resolve));
    this.neutraliseBasemap();
    this.overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
    this.map.addControl(this.overlay);
    this.map.on("mousemove", (event) => this.handleMove(event.lngLat));
    this.map.on("click", (event) => this.handleClick(event.lngLat));
    this.map.on("zoomstart", (event) => { this.visitorZooming = Boolean(event.originalEvent); });
    this.map.on("zoomend", () => {
      if (this.coreActive && this.visitorZooming) this.onInteraction?.("zoom-change");
      this.visitorZooming = false;
    });
    this.map.on("error", (event) => this.handleMapError(event));
    this.map.on("sourcedata", (event) => {
      if (event.sourceId === this.rasterSourceId && event.isSourceLoaded && this.activeTile) {
        this.onTileStatus({ ...this.activeTile, state: "loaded", message: `${this.activeTile.message} Current requested tiles loaded over HTTPS.` });
      }
    });
    this.renderFootprints();
  }

  neutraliseBasemap() {
    const colorProperties = {
      background: ["background-color"],
      fill: ["fill-color", "fill-outline-color"],
      line: ["line-color"],
      circle: ["circle-color", "circle-stroke-color"],
      symbol: ["text-color", "icon-color"]
    };
    for (const layer of this.map.getStyle().layers || []) {
      // Carto defines the most visible country line as a zoom-stop expression,
      // not a literal color. Handle that pair explicitly so it cannot bypass
      // the generic colour neutralisation below.
      if (layer.id === "boundary_country_outline" || layer.id === "boundary_country_inner") {
        this.map.setPaintProperty(layer.id, "line-color", "rgb(48, 48, 48)");
        this.map.setPaintProperty(layer.id, "line-opacity", layer.id === "boundary_country_inner" ? 0.34 : 0.16);
        continue;
      }
      for (const property of colorProperties[layer.type] || []) {
        // Country and administrative boundary lines are context, never a
        // competing graphic system. Keep fills unchanged, but dim linework
        // more strongly than the rest of the neutral basemap.
        const neutral = grayscale(this.map.getPaintProperty(layer.id, property), layer.type === "line" ? 0.24 : 0.45);
        if (neutral) this.map.setPaintProperty(layer.id, property, neutral);
      }
      if (layer.type === "raster") this.map.setPaintProperty(layer.id, "raster-saturation", -1);
    }
  }

  handleMove(lngLat) {
    if (this.coreActive) return;
    const matches = this.maps.filter((map) => containsCoordinate(map, lngLat));
    const ids = new Set(matches.map((map) => map.id));
    const changed = ids.size !== this.hoverIds.size || [...ids].some((id) => !this.hoverIds.has(id));
    if (changed) {
      this.hoverIds = ids;
      this.onDepth(matches, lngLat);
      this.onFieldEncounter?.(matches, this.map.project(lngLat), lngLat);
      this.renderFootprints();
    }
    this.onPreview(matches, lngLat);
  }

  handleClick(lngLat) {
    if (!this.coreActive) this.onCore(this.maps.filter((map) => containsCoordinate(map, lngLat)), lngLat);
  }

  handleMapError(event) {
    if (event.sourceId === this.rasterSourceId || event.error?.message?.includes(this.rasterSourceId)) {
      this.onTileStatus({ state: "failed", message: "The browser could not load this raster source; the footprint remains available." });
    }
  }

  renderFootprints() {
    const layers = [new deck.PolygonLayer({
      id: "historical-map-extents", data: this.maps, pickable: true, stroked: true, filled: false,
      getPolygon: (map) => asPolygon(map),
      getLineColor: (map) => map.id === this.timewellHoverId
          ? [...RED_BRIGHT, 230]
        : map.id === this.selectedMapId
          ? [241, 237, 228, 230]
        : this.coreIds?.has(map.id)
          ? [...RED_BRIGHT, 135]
        : this.hoverIds.has(map.id)
            ? [...RED_BRIGHT, 198]
            : [...RED, 81],
      getLineWidth: (map) => map.id === this.timewellHoverId ? 2.2 : map.id === this.selectedMapId ? 2.5 : this.coreIds?.has(map.id) ? 1.4 : 1,
      lineWidthUnits: "pixels",
      updateTriggers: { getLineColor: [[...this.hoverIds].join(","), this.selectedMapId, this.timewellHoverId, [...(this.coreIds || [])].join(",")] }
    })];
    if (this.coreCoordinate) {
      layers.push(new deck.ScatterplotLayer({
        id: "core-origin", data: [this.coreCoordinate], pickable: false, filled: true, stroked: true,
        getPosition: (point) => [point.lng, point.lat], getRadius: 18, radiusUnits: "pixels",
        getFillColor: [...RED, 50], getLineColor: [...RED_BRIGHT, 255], getLineWidth: 2,
        parameters: { depthTest: false }
      }));
    }
    this.overlay.setProps({ layers });
  }

  enterCore(lngLat, maps = []) {
    this.coreActive = true;
    this.coreCoordinate = lngLat;
    this.coreIds = new Set(maps.map((map) => map.id));
    this.hoverIds = new Set();
    this.map.getContainer().classList.add("field-cored");
    this.renderFootprints();
  }

  highlightTimewellMap(map) {
    const nextId = map?.id || null;
    if (nextId === this.timewellHoverId) return;
    this.timewellHoverId = nextId;
    this.renderFootprints();
  }

  showRaster(map, { focus = true } = {}) {
    this.removeRaster();
    this.selectedMapId = map.id;
    this.renderFootprints();
    const diagnostic = tileDiagnostic(map);
    this.activeTile = diagnostic;
    this.onTileStatus(diagnostic);
    const template = tileTemplate(map);
    if (!template || !this.map.isStyleLoaded()) return;
    try {
      this.map.addSource(this.rasterSourceId, {
        type: "raster", tiles: [template], tileSize: 256,
        minzoom: Math.max(0, map.minZoom), maxzoom: Math.max(map.minZoom || 0, map.maxZoom || 22), bounds: map.bbox
      });
      this.map.addLayer({ id: this.rasterLayerId, type: "raster", source: this.rasterSourceId, paint: { "raster-opacity": 1 } });
      if (focus) {
        this.map.fitBounds([[map.bbox[0], map.bbox[1]], [map.bbox[2], map.bbox[3]]], {
          padding: this.focusPadding(), duration: 620, maxZoom: 13
        });
      }
      this.onTileStatus({ ...diagnostic, state: "loading", message: `${diagnostic.message} Browser is requesting secure raster tiles.` });
    } catch (error) {
      this.onTileStatus({ state: "failed", message: `Raster configuration failed: ${error.message}` });
    }
  }

  focusPadding() {
    if (!this.coreActive) return 70;
    const { clientWidth, clientHeight } = this.map.getContainer();
    if (window.matchMedia("(max-width: 780px)").matches) {
      return { top: 70, right: 44, bottom: Math.round(clientHeight * 0.7) + 32, left: 44 };
    }
    const timeWellWidth = Math.min(Math.max(clientWidth * 0.48, 420), 680);
    return { top: 70, right: Math.round(timeWellWidth) + 66, bottom: 70, left: 70 };
  }

  removeRaster() {
    if (!this.map || !this.map.isStyleLoaded()) return;
    if (this.map.getLayer(this.rasterLayerId)) this.map.removeLayer(this.rasterLayerId);
    if (this.map.getSource(this.rasterSourceId)) this.map.removeSource(this.rasterSourceId);
    this.activeTile = null;
  }

  leaveCore() {
    this.removeRaster();
    this.coreActive = false;
    this.coreCoordinate = null;
    this.coreIds = null;
    this.selectedMapId = null;
    this.timewellHoverId = null;
    this.map.getContainer().classList.remove("field-cored");
    this.renderFootprints();
  }
}
