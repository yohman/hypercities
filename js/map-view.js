import { asPolygon, containsCoordinate, tileDiagnostic, tileTemplate } from "./data.js";

// HyperCities book-cover red, with a quieter shade for unselected extents.
const RED = [166, 42, 38];
const RED_BRIGHT = [218, 56, 51];
const ESRI_WORLD_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const NOTE_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48"><path d="M20 2c-10 0-18 8-18 18 0 13 18 26 18 26s18-13 18-26C38 10 30 2 20 2Z" fill="#da3833" stroke="#f5eee4" stroke-width="2"/><path d="M12 15h16M12 20h16M12 25h11" stroke="#fffaf0" stroke-width="2" stroke-linecap="round"/></svg>')}`;
const NOTE_ICON_PENDING = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48"><path d="M20 2c-10 0-18 8-18 18 0 13 18 26 18 26s18-13 18-26C38 10 30 2 20 2Z" fill="#111212" stroke="#da3833" stroke-width="2"/><path d="M12 15h16M12 20h16M12 25h11" stroke="#fffaf0" stroke-width="2" stroke-linecap="round"/></svg>')}`;

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
  constructor({ maps, onCore, onDepth, onPreview, onFieldEncounter, onInteraction, onTileStatus, onBasemapChange, onRasterOpacityChange, onAnnotationPlace, onAnnotationSelect, onAnnotationViewMove }) {
    Object.assign(this, { maps, onCore, onDepth, onPreview, onFieldEncounter, onInteraction, onTileStatus, onBasemapChange, onRasterOpacityChange, onAnnotationPlace, onAnnotationSelect, onAnnotationViewMove, hoverIds: new Set(), annotations: [] });
    this.rasterLayerId = "historical-raster";
    this.rasterSourceId = "historical-raster-source";
    this.satelliteLayerId = "esri-world-imagery";
    this.satelliteSourceId = "esri-world-imagery-source";
    this.basemapMode = "dark";
    this.rasterOpacity = 1;
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
    this.darkBasemapLayerIds = (this.map.getStyle().layers || []).map((layer) => layer.id);
    this.installSatelliteBasemap();
    this.overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
    this.map.addControl(this.overlay);
    this.map.on("mousemove", (event) => this.handleMove(event.lngLat));
    this.map.on("click", (event) => { if (!this.annotationMode) this.handleClick(event.lngLat); });
    // A note is placed on the visible raster, so use the canvas's own click
    // coordinates while this mode is armed. It remains reliable when a deck.gl
    // layer is present and avoids treating a map pan as a placement.
    this.map.getCanvas().addEventListener("click", (event) => {
      if (!this.annotationMode) return;
      const bounds = this.map.getCanvas().getBoundingClientRect();
      this.handleClick(this.map.unproject([event.clientX - bounds.left, event.clientY - bounds.top]));
    }, true);
    this.map.on("move", () => this.onAnnotationViewMove?.());
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
    this.onBasemapChange?.({ mode: this.basemapMode });
    this.onRasterOpacityChange?.({ opacity: this.rasterOpacity, hasHistorical: false });
  }

  installSatelliteBasemap() {
    if (!this.map.getSource(this.satelliteSourceId)) {
      this.map.addSource(this.satelliteSourceId, {
        type: "raster",
        tiles: [ESRI_WORLD_IMAGERY],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© Esri"
      });
    }
    if (!this.map.getLayer(this.satelliteLayerId)) {
      this.map.addLayer({
        id: this.satelliteLayerId,
        type: "raster",
        source: this.satelliteSourceId,
        layout: { visibility: "none" }
      });
    }
  }

  setBasemap(mode) {
    if (!this.map || !["dark", "satellite"].includes(mode)) return;
    const satellite = mode === "satellite";
    this.darkBasemapLayerIds.forEach((id) => {
      if (!this.map.getLayer(id)) return;
      this.map.setLayoutProperty(id, "visibility", satellite ? "none" : "visible");
    });
    if (this.map.getLayer(this.satelliteLayerId)) {
      this.map.setLayoutProperty(this.satelliteLayerId, "visibility", satellite ? "visible" : "none");
    }
    this.basemapMode = mode;
    this.onBasemapChange?.({ mode });
  }

  setRasterOpacity(opacity) {
    const next = Math.max(0, Math.min(1, Number(opacity)));
    if (!Number.isFinite(next)) return;
    this.rasterOpacity = next;
    if (this.map?.getLayer(this.rasterLayerId)) {
      this.map.setPaintProperty(this.rasterLayerId, "raster-opacity", next);
    }
    this.onRasterOpacityChange?.({ opacity: next, hasHistorical: Boolean(this.map?.getLayer(this.rasterLayerId)) });
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
    if (this.coreActive && this.annotationMode) {
      if (this.selectedMap) this.onAnnotationPlace?.(lngLat);
      return;
    }
    if (!this.coreActive) this.onCore(this.maps.filter((map) => containsCoordinate(map, lngLat)), lngLat);
  }

  handleMapError(event) {
    if (event.sourceId === this.rasterSourceId || event.error?.message?.includes(this.rasterSourceId)) {
      this.onTileStatus({ state: "failed", message: "The browser could not load this raster source; the footprint remains available." });
    }
  }

  forwardTimewellGesture(event) {
    const canvas = this.map?.getCanvas();
    if (!canvas) return;
    const common = {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey
    };
    if (event.type === "wheel") {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        ...common,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        deltaMode: event.deltaMode
      }));
      return;
    }
    const pointerInit = {
      ...common,
      button: event.button,
      buttons: event.buttons,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      pressure: event.pressure
    };
    canvas.dispatchEvent(new PointerEvent(event.type, pointerInit));
    // MapLibre's mouse gesture handler remains the reliable route on desktop;
    // synthetic PointerEvents do not generate the browser's compatibility
    // MouseEvents by themselves.
    if (event.pointerType === "mouse") {
      const mouseType = { pointerdown: "mousedown", pointermove: "mousemove", pointerup: "mouseup", pointercancel: "mouseup" }[event.type];
      if (mouseType) canvas.dispatchEvent(new MouseEvent(mouseType, pointerInit));
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
    if (this.annotationsVisible && this.annotations.length) {
      const crowded = this.annotations.length >= 50;
      const noteSize = crowded ? 18 : this.annotations.length >= 20 ? 21 : 26;
      layers.push(new deck.IconLayer({
        id: "map-annotations",
        data: this.annotations,
        pickable: !this.annotationMode,
        getPosition: (annotation) => [annotation.context.point.lng, annotation.context.point.lat],
        getIcon: () => ({ url: NOTE_ICON, width: 40, height: 48, anchorX: 20, anchorY: 46 }),
        getSize: (annotation) => annotation.id === this.activeAnnotationId || annotation.id === this.hoverAnnotationId ? noteSize + 7 : noteSize,
        sizeUnits: "pixels",
        onHover: (info) => {
          const next = info.object?.id || null;
          if (next === this.hoverAnnotationId) return;
          this.hoverAnnotationId = next;
          this.map.getCanvas().style.cursor = next ? "pointer" : "";
          this.renderFootprints();
        },
        onClick: (info) => { if (info.object) this.onAnnotationSelect?.(info.object); },
        updateTriggers: { getSize: [this.activeAnnotationId, this.hoverAnnotationId, noteSize] }
      }));
    }
    if (this.pendingAnnotationPoint) {
      layers.push(new deck.IconLayer({
        id: "pending-map-annotation", data: [this.pendingAnnotationPoint], pickable: false,
        getPosition: (point) => [point.lng, point.lat],
        getIcon: () => ({ url: NOTE_ICON_PENDING, width: 40, height: 48, anchorX: 20, anchorY: 46 }),
        getSize: 32, sizeUnits: "pixels"
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
    this.selectedMap = map;
    this.renderFootprints();
    const diagnostic = tileDiagnostic(map);
    this.activeTile = diagnostic;
    this.onTileStatus(diagnostic);
    const template = tileTemplate(map);
    if (!template) {
      this.onRasterOpacityChange?.({ opacity: this.rasterOpacity, hasHistorical: false });
      if (focus) this.focusMap(map);
      return;
    }
    try {
      this.map.addSource(this.rasterSourceId, {
        type: "raster", tiles: [template], tileSize: 256,
        minzoom: Math.max(0, map.minZoom), maxzoom: Math.max(map.minZoom || 0, map.maxZoom || 22), bounds: map.bbox
      });
      this.map.addLayer({ id: this.rasterLayerId, type: "raster", source: this.rasterSourceId, paint: { "raster-opacity": this.rasterOpacity } });
      this.onRasterOpacityChange?.({ opacity: this.rasterOpacity, hasHistorical: true });
      this.onTileStatus({ ...diagnostic, state: "loading", message: `${diagnostic.message} Browser is requesting secure raster tiles.` });
    } catch (error) {
      this.onTileStatus({ state: "failed", message: `Raster configuration failed: ${error.message}` });
    }
    // A selection remains a geographic movement even if its archival source
    // fails. Respect the source minimum: below it, valid tiles stay invisible.
    if (focus) this.focusMap(map);
  }

  focusMap(map, { point = null } = {}) {
    const bounds = [[map.bbox[0], map.bbox[1]], [map.bbox[2], map.bbox[3]]];
    const padding = this.focusPadding();
    const camera = this.map.cameraForBounds(bounds, { padding, maxZoom: 19 });
    if (!camera) return;
    const minimum = map.tileBase ? Math.max(0, map.minZoom || 0) : 0;
    const target = point && containsCoordinate(map, point)
      ? [point.lng, point.lat]
      : [(map.bbox[0] + map.bbox[2]) / 2, (map.bbox[1] + map.bbox[3]) / 2];
    const options = { center: target, zoom: Math.max(camera.zoom, minimum), duration: 620 };
    if (typeof padding !== "number") {
      options.offset = [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2];
    }
    this.map.easeTo(options);
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
    this.onRasterOpacityChange?.({ opacity: this.rasterOpacity, hasHistorical: false });
  }

  leaveCore() {
    this.removeRaster();
    this.setAnnotationMode(false);
    this.annotations = [];
    this.pendingAnnotationPoint = null;
    this.annotationsVisible = false;
    this.activeAnnotationId = null;
    this.coreActive = false;
    this.coreCoordinate = null;
    this.coreIds = null;
    this.selectedMapId = null;
    this.timewellHoverId = null;
    this.map.getContainer().classList.remove("field-cored");
    this.renderFootprints();
  }

  setAnnotations(annotations = [], { visible = true, activeId = null } = {}) {
    this.annotations = Array.isArray(annotations) ? annotations : [];
    this.annotationsVisible = Boolean(visible);
    this.activeAnnotationId = activeId || null;
    this.hoverAnnotationId = null;
    if (this.map) this.map.getCanvas().style.cursor = "";
    this.renderFootprints();
  }

  setAnnotationVisibility(visible) {
    this.annotationsVisible = Boolean(visible);
    if (!visible) { this.hoverAnnotationId = null; this.map?.getCanvas().style.setProperty("cursor", ""); }
    this.renderFootprints();
  }

  setAnnotationMode(active) {
    this.annotationMode = Boolean(active);
    if (active) { this.hoverAnnotationId = null; this.map?.getCanvas().style.setProperty("cursor", ""); }
    this.map?.getContainer().classList.toggle("annotation-mode", this.annotationMode);
  }

  setPendingAnnotation(point = null) {
    this.pendingAnnotationPoint = point;
    this.renderFootprints();
  }

  projectPoint(point) {
    return this.map?.project(point) || null;
  }

  getAnnotationCamera() {
    if (!this.map) return null;
    const center = this.map.getCenter();
    return { lng: center.lng, lat: center.lat, zoom: this.map.getZoom(), bearing: this.map.getBearing(), pitch: this.map.getPitch() };
  }
}
