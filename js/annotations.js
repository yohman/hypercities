const CONFIG_PATH = "./data/annotations-config.json";

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value, limit = 1200) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function safeId(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function safeMapId(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_:-]/g, "").slice(0, 120);
}

function decodeGviz(text) {
  const match = String(text).match(/google\.visualization\.Query\.setResponse\((.*)\);?\s*$/s);
  if (!match) throw new Error("The annotation feed did not return a Google Sheets table.");
  const table = JSON.parse(match[1]);
  const labels = (table.table?.cols || []).map((column) => String(column.label || "").trim());
  return (table.table?.rows || []).map((row) => {
    const record = {};
    labels.forEach((label, index) => { record[label] = row.c?.[index]?.v ?? ""; });
    return record;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);

  const [headers = [], ...body] = rows;
  return body.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function decodeFeed(text) {
  return String(text).includes("google.visualization.Query.setResponse") ? decodeGviz(text) : parseCsv(text);
}

function parseContext(value) {
  const params = new URLSearchParams(String(value || ""));
  const point = String(params.get("point") || "").split(",").map(finiteNumber);
  const core = String(params.get("core") || "").split(",").map(finiteNumber);
  const camera = String(params.get("camera") || "").split(",").map(finiteNumber);
  const mapId = safeMapId(params.get("map"));
  if (!mapId || point.length !== 2 || point.some((item) => item === null)) return null;
  return {
    id: safeId(params.get("id")) || null,
    mapId,
    title: cleanText(params.get("title"), 240),
    city: cleanText(params.get("city"), 100),
    year: finiteNumber(params.get("year")),
    point: { lng: point[0], lat: point[1] },
    core: core.length === 2 && core.every((item) => item !== null) ? { lng: core[0], lat: core[1] } : null,
    camera: camera.length >= 3 && camera.slice(0, 3).every((item) => item !== null)
      ? { lng: camera[0], lat: camera[1], zoom: camera[2], bearing: camera[3] ?? 0, pitch: camera[4] ?? 0 }
      : null,
    basemap: cleanText(params.get("ground"), 20),
    opacity: finiteNumber(params.get("veil"))
  };
}

function toTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseRow(row, labels) {
  const context = parseContext(row[labels.context]);
  const text = cleanText(row[labels.annotation], 1200);
  if (!context || !text) return null;
  const timestamp = String(row[labels.timestamp] || "");
  const tag = cleanText(row[labels.tag], 80).replace(/^#+/, "");
  const tags = tag.split(",").map((item) => item.trim().replace(/^#+/, "")).filter(Boolean).slice(0, 8);
  const name = cleanText(row[labels.name], 80);
  const fallback = `${context.mapId}-${timestamp}-${text}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  return {
    id: context.id || fallback,
    timestamp,
    timestampValue: toTimestamp(timestamp),
    text,
    tag,
    tags,
    name,
    context
  };
}

function contextParam({ map, point, core, camera, basemap, opacity }) {
  const params = new URLSearchParams();
  const annotationId = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const rounded = (value, decimals = 5) => Number(value).toFixed(decimals);
  params.set("id", annotationId);
  params.set("map", map.id);
  params.set("title", map.title);
  params.set("city", map.city);
  params.set("year", String(map.year));
  params.set("point", `${rounded(point.lng)},${rounded(point.lat)}`);
  if (core) params.set("core", `${rounded(core.lng)},${rounded(core.lat)}`);
  if (camera) params.set("camera", [rounded(camera.lng), rounded(camera.lat), rounded(camera.zoom, 2), rounded(camera.bearing || 0, 1), rounded(camera.pitch || 0, 1)].join(","));
  if (basemap) params.set("ground", basemap);
  if (Number.isFinite(opacity)) params.set("veil", String(Math.round(opacity * 100)));
  return params.toString();
}

export class AnnotationStore {
  constructor(config) {
    this.config = config || {};
    this.annotations = [];
    this.lastFetchedAt = 0;
  }

  get live() {
    return this.config?.status === "live" && Boolean(this.config?.sheet?.feedUrl) && Boolean(this.config?.form?.viewUrl);
  }

  static async load() {
    try {
      const response = await fetch(CONFIG_PATH, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not read annotations configuration (${response.status})`);
      return new AnnotationStore(await response.json());
    } catch (error) {
      console.warn("Annotations are unavailable.", error);
      return new AnnotationStore({ status: "unavailable" });
    }
  }

  async refresh({ force = false } = {}) {
    if (!this.live) return this.annotations;
    if (!force && Date.now() - this.lastFetchedAt < 20_000) return this.annotations;
    const feedUrl = new URL(this.config.sheet.feedUrl);
    if (force) feedUrl.searchParams.set("_hypercities", String(Date.now()));
    const response = await fetch(feedUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`The annotations feed returned ${response.status}.`);
    const rows = decodeFeed(await response.text());
    const labels = this.config.labels || {};
    this.annotations = rows.map((row) => normaliseRow(row, labels)).filter(Boolean)
      .sort((a, b) => b.timestampValue - a.timestampValue || b.id.localeCompare(a.id));
    this.lastFetchedAt = Date.now();
    return this.annotations;
  }

  forMap(mapId) {
    return this.annotations.filter((annotation) => annotation.context.mapId === mapId);
  }

  buildFormUrl(context) {
    if (!this.live) return null;
    const entries = this.config.form?.entries || {};
    if (!entries.annotation || !entries.tag || !entries.context) return null;
    const url = new URL(this.config.form.viewUrl);
    url.searchParams.set("usp", "pp_url");
    url.searchParams.set(entries.context, contextParam(context));
    return url.toString();
  }

  buildFormSubmission(context) {
    if (!this.live) return null;
    const entries = this.config.form?.entries || {};
    if (!this.config.form?.submitUrl || !entries.annotation || !entries.tag || !entries.name || !entries.context) return null;
    return {
      action: this.config.form.submitUrl,
      entries,
      context: contextParam(context)
    };
  }
}

export function annotationContext({ map, point, core, camera, basemap, opacity }) {
  return { map, point, core, camera, basemap, opacity };
}

export function annotationDeepLink(annotation) {
  const params = new URLSearchParams({ map: annotation.context.mapId, annotation: annotation.id });
  if (annotation.simulated) params.set("simulateNotes", "60");
  return `./?${params.toString()}`;
}
