// The temporal core uses the book-cover red family: dark in depth, the
// cover colour at interaction points, and a restrained light on its surface.
const RED = [159, 40, 37];
const RED_BRIGHT = [218, 56, 51];
const RED_LIGHT = [239, 113, 106];
const INK = [241, 237, 228];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function metresPerLongitude(latitude) {
  return 111320 * Math.cos(latitude * Math.PI / 180);
}

function titleLines(title, target = 24) {
  const words = String(title || "Untitled historical map").trim().split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > target) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function titleSize(title) {
  const lines = titleLines(title).split("\n").length;
  return lines > 3 ? 8.5 : lines > 2 ? 9.5 : lines > 1 ? 10.5 : 12;
}

function coordinateLabel(core) {
  if (!core || !Number.isFinite(core.lat) || !Number.isFinite(core.lng)) return "";
  // deck.gl's compact default glyph atlas is intentionally ASCII-only here.
  // Keeping this navigational notation plain makes the live readout reliable.
  const latitude = `${core.lat < 0 ? "S" : "N"} ${Math.abs(core.lat).toFixed(4)}`;
  const longitude = `${core.lng < 0 ? "W" : "E"} ${Math.abs(core.lng).toFixed(4)}`;
  return `${latitude} / ${longitude}`;
}

/*
 * This is a core cross-section, not a second map. Each plate retains the
 * footprint's aspect ratio and the drilled point's relative position within
 * it. Geographic truth remains in the MapLibre field, which shows the full,
 * unscaled bounding box when a plate is selected.
 */
function makeCrossSection(maps, core) {
  const firstYear = maps[0]?.year || 0;
  const lastYear = maps.at(-1)?.year || firstYear + 1;
  const raw = maps.map((map, index) => {
    const [west, south, east, north] = map.bbox;
    const width = Math.max((east - west) * metresPerLongitude(core.lat), 1);
    const height = Math.max((north - south) * 110540, 1);
    return {
      map,
      index,
      area: Math.log10(width * height),
      aspect: clamp(width / height, 0.28, 3.6),
      coreX: clamp((core.lng - west) / (east - west), 0, 1),
      coreY: clamp((core.lat - south) / (north - south), 0, 1),
      yearGap: index ? Math.max(0, map.year - maps[index - 1].year) : 0
    };
  });
  const leastArea = Math.min(...raw.map((entry) => entry.area));
  const greatestArea = Math.max(...raw.map((entry) => entry.area));
  const areaSpan = Math.max(greatestArea - leastArea, 0.1);
  const largestGap = Math.max(...raw.map((entry) => entry.yearGap), 1);
  const gapLog = Math.log1p(largestGap);
  const spacing = raw.map((entry, index) => index ? 1 + 3.6 * Math.log1p(entry.yearGap) / gapLog : 0);
  const totalSpacing = Math.max(spacing.reduce((total, value) => total + value, 0), 1);
  let travelled = 0;
  const height = 1540;
  const entries = raw.map((entry, index) => {
    if (index) travelled += spacing[index];
    const areaFactor = 0.62 + ((entry.area - leastArea) / areaSpan) * 0.82;
    const base = 90 * areaFactor;
    const width = base * Math.sqrt(entry.aspect);
    const depth = base / Math.sqrt(entry.aspect);
    const z = maps.length === 1 ? 770 : 90 + travelled / totalSpacing * 1360;
    const west = -entry.coreX * width;
    const east = (1 - entry.coreX) * width;
    const south = -entry.coreY * depth;
    const north = (1 - entry.coreY) * depth;
    return {
      ...entry,
      z,
      polygon: [[west, south, z], [east, south, z], [east, north, z], [west, north, z], [west, south, z]]
    };
  });
  const spanYears = Math.max(0, lastYear - firstYear);

  return {
    firstYear,
    lastYear,
    height,
    entries,
    // The one red temporal annotation names the whole excavation, not every
    // interval between maps. Individual years remain attached to their plates.
    span: spanYears ? { position: [-84, 0, (entries[0].z + entries.at(-1).z) / 2], text: `${spanYears} years` } : null
  };
}

function labelEntries(entries, selectedId, hoverId) {
  const step = Math.max(1, Math.ceil(entries.length / 8));
  const important = new Set([0, entries.length - 1]);
  entries.forEach((entry, index) => {
    if (index % step === 0 || entry.map.id === selectedId || entry.map.id === hoverId) important.add(index);
  });
  return entries.filter((_, index) => important.has(index));
}

export class CoreView {
  constructor({ onSelect, onHover, onMapGesture }) {
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.onMapGesture = onMapGesture;
    this.container = document.querySelector("#core-renderer");
    this.caption = document.querySelector("#well-caption");
  }

  preview(maps, core) {
    if (this.locked) return;
    if (!maps.length) { this.clearPreview(); return; }
    const signature = maps.map((map) => map.id).join(",");
    const changedWell = signature !== this.previewSignature;
    this.core = core;
    this.stack = makeCrossSection(maps, core);
    this.selectedId = null;
    this.hoverId = null;
    this.container.classList.add("is-preview");
    this.caption.hidden = true;
    this.container.setAttribute("aria-label", `TimeWell with ${maps.length} layer${maps.length === 1 ? "" : "s"}, from ${this.stack.firstYear} to ${this.stack.lastYear}`);
    this.viewState = this.fitView();
    if (!this.deck) this.createDeck();
    this.deck.setProps({ viewState: this.viewState });
    this.previewSignature = signature;
    if (changedWell && !this.hasIntroduced) {
      this.hasIntroduced = true;
      this.startAppearance();
    } else {
      this.progress = 1;
      this.render();
    }
  }

  clearPreview() {
    if (this.locked) return;
    if (this.appearanceFrame) cancelAnimationFrame(this.appearanceFrame);
    this.appearanceFrame = null;
    this.container.classList.remove("is-preview");
    this.caption.hidden = true;
    if (this.deck) this.deck.setProps({ layers: [] });
    this.stack = null;
    this.previewSignature = null;
  }

  enter(maps, core) {
    const signature = maps.map((map) => map.id).join(",");
    const cameFromPreview = this.previewSignature === signature && this.stack;
    this.locked = true;
    this.core = core;
    this.stack = makeCrossSection(maps, core);
    this.selectedId = null;
    this.hoverId = null;
    this.container.classList.remove("is-preview");
    this.container.classList.add("is-active");
    this.caption.hidden = true;
    this.container.setAttribute("aria-label", `TimeWell with ${maps.length} layer${maps.length === 1 ? "" : "s"}, from ${this.stack.firstYear} to ${this.stack.lastYear}`);
    this.viewState = this.fitView();
    if (!this.deck) this.createDeck();
    this.deck.setProps({ viewState: this.viewState });
    this.previewSignature = signature;
    if (cameFromPreview || this.hasIntroduced) {
      this.progress = 1;
      this.render();
    } else {
      this.hasIntroduced = true;
      this.startAppearance();
    }
  }

  createDeck() {
    this.deck = new deck.Deck({
      parent: this.container,
      views: new deck.OrbitView({ id: "time-well" }),
      controller: false,
      viewState: this.viewState,
      layers: []
    });
    this.installGestureRouting();
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.stack) return;
      this.viewState = this.fitView();
      this.deck.setProps({ viewState: this.viewState });
    });
    this.resizeObserver.observe(this.container);
  }

  installGestureRouting() {
    this.canvas = this.container.querySelector("canvas");
    if (!this.canvas) return;
    const picked = (event) => {
      const bounds = this.canvas.getBoundingClientRect();
      const info = this.deck.pickObject({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, radius: 5 });
      return Boolean(info?.picked);
    };
    const passPointer = (event) => {
      if (!this.passingGesture && event.type !== "pointerdown") return;
      this.onMapGesture?.(event);
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "pointerup" || event.type === "pointercancel") this.passingGesture = false;
    };
    this.canvas.addEventListener("pointerdown", (event) => {
      this.passingGesture = !picked(event);
      if (this.passingGesture) passPointer(event);
    }, true);
    this.canvas.addEventListener("pointermove", (event) => {
      if (this.passingGesture) passPointer(event);
    }, true);
    this.canvas.addEventListener("pointerup", passPointer, true);
    this.canvas.addEventListener("pointercancel", passPointer, true);
    this.canvas.addEventListener("wheel", (event) => {
      if (picked(event)) return;
      this.onMapGesture?.(event);
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, passive: false });
  }

  fitView() {
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 320);
    // Leave real visual air beneath the lower cap for the coordinate readout.
    // It is part of the drilled location, not a sideways annotation.
    const baseClearance = 92;
    const extentMin = -baseClearance;
    const extentMax = (this.stack?.height || 1540) + 82;
    const scale = Math.min(width / 720, height / (extentMax - extentMin)) * 0.9;
    return {
      target: [0, 0, (extentMin + extentMax) / 2],
      zoom: clamp(Math.log2(scale), -2.5, 0.5),
      rotationX: 58,
      rotationOrbit: 24
    };
  }

  select(map) {
    if (!this.stack || !map) return;
    this.selectedId = map.id;
    this.render();
  }

  startAppearance() {
    if (this.appearanceFrame) cancelAnimationFrame(this.appearanceFrame);
    this.progress = 0;
    const startedAt = performance.now();
    const duration = 780;
    const animate = (now) => {
      const raw = clamp((now - startedAt) / duration, 0, 1);
      this.progress = 1 - (1 - raw) ** 4;
      this.render();
      if (raw < 1) this.appearanceFrame = requestAnimationFrame(animate);
      else this.appearanceFrame = null;
    };
    this.render();
    this.appearanceFrame = requestAnimationFrame(animate);
  }

  setHover(info) {
    if (!this.locked) return;
    const nextId = info.object?.map?.id || null;
    if (nextId === this.hoverId) return;
    this.hoverId = nextId;
    this.onHover?.(info.object?.map || null);
    this.render();
  }

  render() {
    if (!this.deck || !this.stack) return;
    const progress = this.progress ?? 1;
    // Hovering is the invitation to a core, so it is intentionally more
    // legible than the quieter, already-entered stack. The TimeWell remains
    // translucent, but its own temporal lines win over the basemap beneath.
    const previewing = !this.locked;
    const top = (this.stack.height + 82) * progress;
    const focusId = this.hoverId || this.selectedId;
    const entries = this.stack.entries.map((entry) => ({
      ...entry,
      z: entry.z * progress,
      polygon: entry.polygon.map(([x, y, z]) => [x, y, z * progress])
    }));
    const labels = labelEntries(entries, this.selectedId, this.hoverId);
    const selected = entries.find((entry) => entry.map.id === focusId);
    const labelX = 154;
    const temporalSpan = this.stack.span && {
      ...this.stack.span,
      position: [this.stack.span.position[0], this.stack.span.position[1], this.stack.span.position[2] * progress]
    };
    // The layer span is physically attached to the bore: its marker begins
    // exactly above the top cap's center, then the text opens to the right.
    const wellCaption = {
      position: [0, 0, top + 40],
      text: `${entries.length} LAYER${entries.length === 1 ? "" : "S"} · ${this.stack.firstYear}–${this.stack.lastYear}`
    };
    const coreCoordinate = this.core && {
      // It sits at the visual base of the cylinder: centered below its lower
      // cap rather than competing with the core itself or the year labels.
      // OrbitView projects a purely vertical offset slightly to the right at
      // this fixed viewing angle. The modest x counter-offset centers the
      // readout beneath the projected lower cap, where the eye reads it.
      position: [-64, 0, -78],
      text: coordinateLabel(this.core)
    };

    this.deck.setProps({ layers: [
      new deck.PolygonLayer({
        id: "historical-strata",
        data: entries,
        pickable: true,
        stroked: true,
        filled: true,
        getPolygon: (entry) => entry.polygon,
        getLineColor: (entry) => entry.map.id === this.selectedId ? [...INK, 255] : entry.map.id === this.hoverId ? [...RED_BRIGHT, 255] : [...RED, previewing ? 235 : 185],
        getFillColor: (entry) => entry.map.id === this.selectedId ? [...RED_BRIGHT, 64] : [...RED, previewing ? 50 : 28],
        getLineWidth: (entry) => entry.map.id === this.selectedId ? 3 : entry.map.id === this.hoverId ? 2.2 : 1.15,
        lineWidthUnits: "pixels",
        extruded: true,
        getElevation: (entry) => entry.map.id === this.selectedId ? 20 : entry.map.id === this.hoverId ? 13 : 7,
        wireframe: true,
        parameters: { depthTest: true },
        onClick: (info) => { if (info.object) this.onSelect(info.object.map); },
        onHover: (info) => this.setHover(info)
      }),
      new deck.ColumnLayer({
        // A single high-resolution column gives the core true circular caps
        // and curved walls. It intentionally replaces the former flat strip
        // and its extra guide lines.
        id: "bore-cylinder",
        data: [{ position: [0, 0, 0], elevation: top }],
        getPosition: (item) => item.position,
        getElevation: (item) => item.elevation,
        // A screen-sized radius keeps the well's body legible while leaving
        // the highly variable map strata visible around the core.
        radius: 18,
        radiusUnits: "pixels",
        diskResolution: 48,
        filled: true,
        extruded: true,
        flatShading: false,
        getFillColor: [...RED, previewing ? 205 : 170],
        material: { ambient: 0.58, diffuse: 0.62, shininess: 34, specularColor: RED_LIGHT },
        parameters: { depthTest: true }
      }),
      new deck.ScatterplotLayer({
        id: "core-mouth",
        data: [{ position: [0, 0, 0] }],
        getPosition: (item) => item.position,
        getRadius: 16,
        radiusUnits: "pixels",
        filled: false,
        stroked: true,
        getLineColor: [...INK, 240],
        getLineWidth: 2,
        parameters: { depthTest: false }
      }),
      new deck.TextLayer({
        id: "well-caption-marker",
        data: [wellCaption],
        getPosition: (item) => item.position,
        getText: () => "|",
        getColor: [...RED_BRIGHT, 245],
        getSize: 11,
        sizeUnits: "pixels",
        getTextAnchor: "middle",
        getAlignmentBaseline: "bottom",
        billboard: true,
        fontFamily: "Avenir Next, Avenir, Helvetica Neue, sans-serif",
        fontWeight: "500",
        parameters: { depthTest: false }
      }),
      new deck.TextLayer({
        id: "well-caption-text",
        data: [wellCaption],
        getPosition: (item) => item.position,
        getText: (item) => item.text,
        getPixelOffset: [8, 0],
        getColor: [...RED_BRIGHT, 235],
        getSize: 8.5,
        sizeUnits: "pixels",
        getTextAnchor: "start",
        getAlignmentBaseline: "bottom",
        billboard: true,
        fontFamily: "Avenir Next, Avenir, Helvetica Neue, sans-serif",
        fontWeight: "500",
        characterSet: "0123456789 LAYERS·–",
        parameters: { depthTest: false }
      }),
      ...(coreCoordinate?.text ? [new deck.TextLayer({
        id: "core-coordinate",
        data: [coreCoordinate],
        getPosition: (item) => item.position,
        getText: (item) => item.text,
        getColor: [...INK, 182],
        getSize: 9.5,
        sizeUnits: "pixels",
        getTextAnchor: "middle",
        getAlignmentBaseline: "center",
        billboard: true,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "500",
        parameters: { depthTest: false }
      })] : []),
      new deck.ScatterplotLayer({
        id: "stratum-anchors",
        data: entries,
        pickable: true,
        getPosition: (entry) => [0, 0, entry.z],
        getRadius: (entry) => entry.map.id === this.selectedId ? 7 : entry.map.id === this.hoverId ? 5.6 : 3.2,
        radiusUnits: "pixels",
        getFillColor: (entry) => entry.map.id === this.selectedId ? [...INK, 255] : entry.map.id === this.hoverId ? [...RED_BRIGHT, 255] : [...RED_BRIGHT, 210],
        onClick: (info) => { if (info.object) this.onSelect(info.object.map); },
        onHover: (info) => this.setHover(info),
        parameters: { depthTest: false }
      }),
      new deck.ScatterplotLayer({
        id: "core-hit-zones",
        data: entries,
        pickable: true,
        getPosition: (entry) => [0, 0, entry.z],
        getRadius: 13,
        radiusUnits: "pixels",
        getFillColor: [0, 0, 0, 1],
        onClick: (info) => { if (info.object) this.onSelect(info.object.map); },
        onHover: (info) => this.setHover(info),
        parameters: { depthTest: false }
      }),
      new deck.LineLayer({
        id: "year-ticks",
        data: labels,
        getSourcePosition: (entry) => [0, 0, entry.z],
        getTargetPosition: (entry) => [labelX, 0, entry.z],
        getColor: (entry) => entry.map.id === this.selectedId ? [...INK, 230] : entry.map.id === this.hoverId ? [...RED_BRIGHT, 255] : [...INK, previewing ? 170 : 110],
        getWidth: (entry) => entry.map.id === this.selectedId ? 1.7 : entry.map.id === this.hoverId ? 1.5 : 1,
        widthUnits: "pixels",
        parameters: { depthTest: false }
      }),
      new deck.TextLayer({
        id: "years",
        data: labels,
        getPosition: (entry) => [labelX, 0, entry.z],
        getText: (entry) => String(entry.map.year),
        getColor: (entry) => entry.map.id === this.selectedId ? [...INK, 255] : entry.map.id === this.hoverId ? [...RED_BRIGHT, 255] : [...INK, previewing ? 238 : 205],
        getSize: (entry) => entry.map.id === this.selectedId ? 18 : entry.map.id === this.hoverId ? 16 : 13,
        sizeUnits: "pixels",
        getTextAnchor: "start",
        getAlignmentBaseline: "center",
        billboard: true,
        fontFamily: "Palatino Linotype, Book Antiqua, Georgia, serif",
        fontWeight: "700",
        pickable: true,
        onClick: (info) => { if (info.object) this.onSelect(info.object.map); },
        onHover: (info) => this.setHover(info),
        parameters: { depthTest: false }
      }),
      ...(temporalSpan ? [new deck.TextLayer({
        id: "temporal-span",
        data: [temporalSpan],
        getPosition: (item) => item.position,
        getText: (item) => item.text,
        getColor: [...RED_BRIGHT, 220],
        getSize: 11,
        sizeUnits: "pixels",
        getTextAnchor: "end",
        getAlignmentBaseline: "center",
        billboard: true,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        parameters: { depthTest: false }
      })] : []),
      ...(selected ? [new deck.TextLayer({
        id: "hovered-stratum",
        data: [selected],
        getPosition: (entry) => [26, 0, entry.z],
        getText: (entry) => titleLines(entry.map.title),
        getColor: [...RED_BRIGHT, 255],
        getSize: (entry) => titleSize(entry.map.title),
        sizeUnits: "pixels",
        getTextAnchor: "start",
        getAlignmentBaseline: "center",
        billboard: true,
        lineHeight: 1.08,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        parameters: { depthTest: false }
      })] : [])
    ] });
  }

  leave() {
    if (this.appearanceFrame) cancelAnimationFrame(this.appearanceFrame);
    this.appearanceFrame = null;
    this.locked = false;
    this.container.classList.remove("is-active");
    this.container.classList.remove("is-preview");
    this.caption.hidden = true;
    this.onHover?.(null);
    if (this.deck) this.deck.setProps({ layers: [] });
    this.stack = null;
    this.previewSignature = null;
  }
}
