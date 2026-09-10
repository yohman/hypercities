import { asPolygon, containsCoordinate, tileDiagnostic, tileTemplate } from "./data.js";

const RED = [168, 75, 67];
const RED_BRIGHT = [226, 113, 99];

export class MapView {
  constructor({ maps, onCore, onDepth, onPreview, onTileStatus }) {
    Object.assign(this, { maps, onCore, onDepth, onPreview, onTileStatus, hoverIds: new Set() });
    this.rasterLayerId = "historical-raster";
    this.rasterSourceId = "historical-raster-source";
  }

  async init() {
    this.map = new maplibregl.Map({
      container: "map",
      style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      center: [10, 27], zoom: 1.7, minZoom: 1.25, attributionControl: false
    });
    await new Promise((resolve) => this.map.once("load", resolve));
    this.overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
    this.map.addControl(this.overlay);
    this.map.on("mousemove", (event) => this.handleMove(event.lngLat));
    this.map.on("click", (event) => this.handleClick(event.lngLat));
    this.map.on("error", (event) => this.handleMapError(event));
    this.map.on("sourcedata", (event) => {
      if (event.sourceId === this.rasterSourceId && event.isSourceLoaded && this.activeTile) {
        this.onTileStatus({ ...this.activeTile, state: "loaded", message: `${this.activeTile.message} Current requested tiles loaded over HTTPS.` });
      }
    });
    this.renderFootprints();
  }

  handleMove(lngLat) {
    if (this.coreActive) return;
    const matches = this.maps.filter((map) => containsCoordinate(map, lngLat));
    const ids = new Set(matches.map((map) => map.id));
    const changed = ids.size !== this.hoverIds.size || [...ids].some((id) => !this.hoverIds.has(id));
    if (changed) {
      this.hoverIds = ids;
      this.onDepth(matches, lngLat);
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
          ? [...RED_BRIGHT, 255]
        : map.id === this.selectedMapId
          ? [241, 237, 228, 255]
        : this.coreIds?.has(map.id)
          ? [...RED_BRIGHT, 150]
          : this.hoverIds.has(map.id)
            ? [...RED_BRIGHT, 220]
            : [...RED, 62],
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
      this.map.addLayer({ id: this.rasterLayerId, type: "raster", source: this.rasterSourceId, paint: { "raster-opacity": 0.76 } });
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
