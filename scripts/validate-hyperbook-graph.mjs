#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const argument = (name, fallback) => {
  const position = process.argv.indexOf(name);
  return position === -1 ? fallback : process.argv[position + 1];
};
const graphPath = path.resolve(argument('--graph', path.join(root, 'data/hyperbook-graph.json')));
const bookPath = path.resolve(argument('--book', path.join(root, 'eScholarship UC item 3mh5t455.pdf')));
const mapsPath = path.resolve(argument('--maps', '/private/tmp/hypercities-map-library.csv'));
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const issues = [];
const assert = (condition, message) => {
  if (!condition) issues.push(message);
};
const sha256 = (filePath) =>
  crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

assert(graph.schemaVersion === '0.1.0', 'Unexpected schemaVersion.');
assert(Array.isArray(graph.nodes) && graph.nodes.length > 0, 'Graph has no nodes.');
assert(Array.isArray(graph.edges) && graph.edges.length > 0, 'Graph has no edges.');

const ids = new Set();
for (const node of graph.nodes || []) {
  assert(typeof node.id === 'string' && node.id.length > 0, 'Node without a usable id.');
  assert(typeof node.kind === 'string' && node.kind.length > 0, `Node ${node.id} has no kind.`);
  assert(typeof node.title === 'string' && node.title.length > 0, `Node ${node.id} has no title.`);
  assert(!ids.has(node.id), `Duplicate node id ${node.id}.`);
  ids.add(node.id);
}

const edgeIds = new Set();
for (const edge of graph.edges || []) {
  assert(!edgeIds.has(edge.id), `Duplicate edge id ${edge.id}.`);
  edgeIds.add(edge.id);
  assert(ids.has(edge.from), `Edge ${edge.id} refers to missing source ${edge.from}.`);
  assert(ids.has(edge.to), `Edge ${edge.id} refers to missing target ${edge.to}.`);
  assert(typeof edge.predicate === 'string' && edge.predicate.length > 0, `Edge ${edge.id} has no predicate.`);
  assert(edge.evidence && typeof edge.evidence.type === 'string', `Edge ${edge.id} has no typed evidence.`);
}

const passages = graph.nodes
  .filter((node) => node.kind === 'book-passage')
  .sort((left, right) => left.source.locator.bookPages[0] - right.source.locator.bookPages[0]);
assert(passages.length === graph.integrity.bookPassageCount, 'Book passage count does not match integrity metadata.');
assert(passages[0]?.source.locator.bookPages[0] === 6, 'Book passages do not begin on page 6.');
assert(passages.at(-1)?.source.locator.bookPages[1] === 212, 'Book passages do not end on page 212.');
for (let index = 1; index < passages.length; index += 1) {
  const previousEnd = passages[index - 1].source.locator.bookPages[1];
  const currentStart = passages[index].source.locator.bookPages[0];
  assert(currentStart === previousEnd + 1, `Gap or overlap between ${passages[index - 1].id} and ${passages[index].id}.`);
}

const maps = graph.nodes.filter((node) => node.kind === 'historical-map');
assert(maps.length === graph.integrity.mapRecordCount, 'Map count does not match integrity metadata.');
assert(maps.length === graph.sources.find((source) => source.id === 'source:map-library')?.recordCount, 'Map count does not match source metadata.');
for (const map of maps) {
  assert(map.source?.dataset === 'map-library', `Map ${map.id} does not identify Map Library provenance.`);
  assert(map.sourceRecord && typeof map.sourceRecord === 'object', `Map ${map.id} lacks a verbatim source record.`);
  assert(ids.has(map.place?.id), `Map ${map.id} refers to a missing place.`);
  assert(typeof map.eligibleForCoring === 'boolean', `Map ${map.id} lacks a coring eligibility flag.`);
}

const core = graph.nodes.find((node) => node.id === 'interaction:core');
assert(core?.kind === 'proposed-interaction' && core.status === 'proposal', 'CORE must remain explicitly marked as a proposal.');

const bookSource = graph.sources.find((source) => source.id === 'source:book');
const mapSource = graph.sources.find((source) => source.id === 'source:map-library');
assert(bookSource && mapSource, 'Both authoritative sources must be declared.');
if (bookSource && fs.existsSync(bookPath)) {
  assert(bookSource.sha256 === sha256(bookPath), 'Book PDF hash does not match the graph provenance.');
}
if (mapSource && fs.existsSync(mapsPath)) {
  assert(mapSource.sha256 === sha256(mapsPath), 'Map CSV hash does not match the graph provenance.');
}

if (issues.length) {
  console.error(`Hyperbook graph validation failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):`);
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exitCode = 1;
} else {
  console.log(`Hyperbook graph valid: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${maps.length} Map Library records.`);
}
