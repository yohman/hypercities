#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const argument = (name, fallback) => {
  const position = process.argv.indexOf(name);
  return position === -1 ? fallback : process.argv[position + 1];
};
const graphPath = path.resolve(argument('--graph', path.join(root, 'data/hyperbook-graph.json')));
const extent = (argument('--extent', '') || '').split(',').map(Number);
const years = (argument('--years', '') || '').split(',').map(Number);

if (extent.length !== 4 || extent.some((value) => !Number.isFinite(value))) {
  throw new Error('Pass --extent west,south,east,north in WGS84 coordinates.');
}
if (years.length !== 2 || years.some((value) => !Number.isInteger(value))) {
  throw new Error('Pass --years start,end as whole years.');
}

const [west, south, east, north] = extent;
const [startYear, endYear] = years;
if (west > east || south > north || startYear > endYear) {
  throw new Error('Extent and year ranges must be ordered from low to high.');
}

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const contextualCases = new Map();
for (const edge of graph.edges) {
  if (edge.predicate !== 'sharesGeographicFieldWith') continue;
  const matches = contextualCases.get(edge.from) || [];
  matches.push(edge.to);
  contextualCases.set(edge.from, matches);
}

const intersects = ([mapWest, mapSouth, mapEast, mapNorth]) =>
  mapWest <= east && mapEast >= west && mapSouth <= north && mapNorth >= south;
const overlapsYears = (temporal) =>
  temporal.startYear !== null && temporal.endYear !== null && temporal.startYear <= endYear && temporal.endYear >= startYear;

const stack = graph.nodes
  .filter((node) => node.kind === 'historical-map' && node.eligibleForCoring)
  .filter((node) => intersects(node.geometry.bbox) && overlapsYears(node.temporal))
  .sort((left, right) => left.temporal.startYear - right.temporal.startYear || left.id.localeCompare(right.id))
  .map((node) => ({
    id: node.id,
    title: node.title,
    place: node.place.label,
    temporal: node.temporal,
    normalizedBbox: node.geometry.bbox,
    sourceCorners: node.geometry.sourceCorners,
    projection: node.rendering.projection,
    tileUrl: node.rendering.tileUrl,
    contextualCases: contextualCases.get(node.id) || [],
    provenance: node.source,
  }));

console.log(JSON.stringify({
  operation: 'CORE',
  status: 'proposal-query-contract',
  input: { extent: [west, south, east, north], years: [startYear, endYear] },
  count: stack.length,
  stack,
}, null, 2));
