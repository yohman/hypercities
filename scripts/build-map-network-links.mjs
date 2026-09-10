#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { networkKmlFilenameFor, networkKmlRecordFor } from "../js/take-map.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const graphPath = path.join(root, "data", "hyperbook-graph.json");
const outputDirectory = path.join(root, "data", "kml");

function normaliseMap(node) {
  const bbox = node.geometry?.bbox;
  if (!Array.isArray(bbox) || bbox.length !== 4 || !node.temporal?.startYear) return null;
  const values = bbox.map(Number);
  if (!values.every(Number.isFinite)) return null;
  return {
    id: node.id,
    title: node.title || node.alternativeTitle || "Untitled historical map",
    city: node.place?.label || node.sourceRecord?.city || "Unplaced",
    year: Number(node.temporal.startYear),
    endYear: Number(node.temporal.endYear || node.temporal.startYear),
    bbox: values,
    tileBase: node.rendering?.tileUrl || null,
    minZoom: Number(node.rendering?.minZoom ?? 0),
    maxZoom: Number(node.rendering?.maxZoom ?? 22),
    sourceId: node.source?.sourceRecordId || node.id,
    original: node,
  };
}

const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const maps = graph.nodes
  .filter((node) => node.kind === "historical-map" && node.eligibleForCoring !== false)
  .map(normaliseMap)
  .filter(Boolean);

fs.mkdirSync(outputDirectory, { recursive: true });
for (const map of maps) {
  fs.writeFileSync(path.join(outputDirectory, networkKmlFilenameFor(map)), networkKmlRecordFor(map));
}

console.log(`Wrote ${maps.length} hosted KML map records to ${path.relative(root, outputDirectory)}.`);
