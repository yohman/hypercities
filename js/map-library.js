export const mapLibraryCsvUrl = "https://raw.githubusercontent.com/yohman/maplibrary/main/data/maps.csv";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value === "") quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); if (row.some((cell) => cell !== "")) rows.push(row); }
  if (!rows.length) return [];
  const [headers, ...records] = rows;
  return records.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

export async function loadMapLibraryRows() {
  const url = new URL(mapLibraryCsvUrl);
  url.searchParams.set("v", Date.now().toString());
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Map Library CSV unavailable (${response.status})`);
  const records = parseCsv(await response.text());
  if (!records.length || !records[0].id) throw new Error("Map Library CSV has no map records.");
  return records;
}

function yearFrom(value, fallback = 0) {
  const match = String(value ?? "").match(/(?:^|\D)(\d{3,4})(?:\D|$)/);
  return match ? Number(match[1]) : fallback;
}

export function nodeFromMapRecord(record, existing = {}) {
  const sourceRecordId = String(record.id || existing.source?.sourceRecordId || "");
  const south = Number(record["mapping.swLat"]);
  const west = Number(record["mapping.swLon"]);
  const north = Number(record["mapping.neLat"]);
  const east = Number(record["mapping.neLon"]);
  const validBounds = [west, south, east, north].every(Number.isFinite) && west < east && south < north;
  const startDate = record["mapping.dateFrom.date"] || "";
  const endDate = record["mapping.dateTo.date"] || startDate;
  const startYear = yearFrom(startDate, yearFrom(record.publicationDate, existing.temporal?.startYear || 0));
  const endYear = yearFrom(endDate, startYear);
  return {
    ...existing,
    id: existing.id || `map:${sourceRecordId}`,
    kind: "historical-map",
    title: record.titleEn || record.title || existing.title || "Untitled historical map",
    alternativeTitle: record.title || existing.alternativeTitle || null,
    source: { ...(existing.source || {}), dataset: "map-library", sourceRecordId },
    place: { ...(existing.place || {}), label: record.city || existing.place?.label || "Unplaced" },
    temporal: { ...(existing.temporal || {}), start: startDate, end: endDate, startYear, endYear },
    geometry: validBounds ? { ...(existing.geometry || {}), bbox: [west, south, east, north] } : existing.geometry,
    rendering: {
      ...(existing.rendering || {}), tileType: record.tileType || null, tileUrl: record.tileUrl || null,
      thumbnailUrl: record.thumbnailUrl || null, minZoom: Number(record.minZoom || 0), maxZoom: Number(record.maxZoom || 22),
      projection: record.projection || null
    },
    sourceRecord: record,
    eligibleForCoring: validBounds && startYear > 0
  };
}
