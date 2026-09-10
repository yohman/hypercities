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

const mapsPath = path.resolve(
  argument('--maps', '/private/tmp/hypercities-map-library.csv'),
);
const bookPath = path.resolve(
  argument('--book', path.join(root, 'eScholarship UC item 3mh5t455.pdf')),
);
const outputPath = path.resolve(
  argument('--output', path.join(root, 'data/hyperbook-graph.json')),
);
const mapSourceUrl =
  'https://raw.githubusercontent.com/yohman/maplibrary/main/data/maps.csv';

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// Deliberately dependency-free: the library export contains quoted commas and
// embedded line breaks, both of which a split(',') parser would corrupt.
function parseCsv(source) {
  const rows = [];
  let cell = '';
  let row = [];
  let quoted = false;

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
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some((value) => value.trim()))
    .map((record) =>
      Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])),
    );
}

const trimmed = (value) => (value || '').trim();
const numberOrNull = (value) => {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : null;
};
const yearFromDate = (value) => {
  const match = trimmed(value).match(/^(\d{4})-/);
  return match ? Number.parseInt(match[1], 10) : null;
};
const slug = (value) =>
  trimmed(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'unlocated';
const placeId = (label) => `place:city:${slug(label)}`;

function normalisedBounds(record) {
  const north = numberOrNull(record['mapping.neLat']);
  const east = numberOrNull(record['mapping.neLon']);
  const south = numberOrNull(record['mapping.swLat']);
  const west = numberOrNull(record['mapping.swLon']);
  if ([north, east, south, west].some((value) => value === null)) return null;

  return {
    // The source fields are retained unchanged below. This envelope tolerates
    // historical rows whose NE/SW longitudes were entered in reverse order.
    bbox: [Math.min(west, east), Math.min(south, north), Math.max(west, east), Math.max(south, north)],
    sourceCorners: { northEast: [east, north], southWest: [west, south] },
  };
}

const mapRows = parseCsv(fs.readFileSync(mapsPath, 'utf8'));
const nodes = [];
const edges = [];
const nodeIds = new Set();
let edgeSequence = 0;

function addNode(node) {
  if (nodeIds.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`);
  nodeIds.add(node.id);
  nodes.push(node);
  return node;
}

function addEdge(from, predicate, to, evidence) {
  edges.push({
    id: `edge:${String(++edgeSequence).padStart(4, '0')}`,
    from,
    predicate,
    to,
    evidence,
  });
}

function addBookPassage(id, title, startPage, endPage, summary, form = 'essay') {
  return addNode({
    id: `passage:${id}`,
    kind: 'book-passage',
    title,
    form,
    source: { dataset: 'book', locator: { bookPages: [startPage, endPage], pdfPages: [startPage, endPage] } },
    summary,
  });
}

function addConcept(id, title, description) {
  return addNode({ id: `concept:${id}`, kind: 'concept', title, description });
}

function linkPassageToConcept(passage, concept, predicate = 'develops') {
  addEdge(`passage:${passage}`, predicate, `concept:${concept}`, {
    type: 'book-locator',
    sourceNode: `passage:${passage}`,
  });
}

addNode({
  id: 'work:hypercities-hyperbook',
  kind: 'work',
  title: 'HyperCities: Thick Mapping in the Digital Humanities',
  summary: 'A structured, navigable graph of the book and its links to the HyperCities Map Library.',
  source: { dataset: 'book', locator: { bookPages: [6, 212], pdfPages: [6, 212] } },
});

const passages = [
  ['preface', 'Preface', 6, 11, 'Frames the book as a staged, polyvocal hyperbook rather than a finished mapping platform.'],
  ['lexicon-hypercities', 'Lexicon: HyperCities', 12, 14, 'Defines an open, geotemporal field for connecting lives, events, media, and places.'],
  ['lexicon-thick-mapping', 'Lexicon: Thick Mapping', 15, 18, 'Treats mapping as ongoing, contested, layered cultural work rather than a stable representation.'],
  ['lexicon-digital-humanities', 'Lexicon: Digital Humanities', 19, 21, 'Locates digital humanities in interpretation, participation, contingency, and an open future.'],
  ['humanities-flaneur', 'The Humanities in the Digital Humanities', 22, 30, 'Uses the flaneur and Berlin to make movement through space a descent into heterogeneous historical time.'],
  ['brief-history', 'HyperCities: A Very Brief History', 31, 48, 'Follows HyperCities from Berlin temporal topographies to a platform, API, and participatory network.'],
  ['thick-mapping-dh', 'Thick Mapping in the Digital Humanities', 49, 65, 'Develops zoom, time-layers, historical method, straying, and contingency as a non-linear cartographic practice.'],
  ['window-ghost-maps', 'Window: Los Angeles Ghost Maps', 66, 73, 'Shows how layered cartography, imagery, and narrative make prior lives and injustices visible in Los Angeles.'],
  ['window-pdub', 'Window: PDub Productions: Mapping HiFi', 74, 83, 'Shows a community-made, multimedia map of Historic Filipinotown that redistributes narrative authority.'],
  ['media-archaeology', 'Toward a Media Archaeology of Google Earth', 84, 105, 'Examines the histories, power, pleasures, and assumptions embedded in global, aerial, zoomable interfaces.'],
  ['counter-mapping', 'Counter-Mapping', 106, 109, 'Positions mapped participation and representational friction against the authority of a single world view.'],
  ['georeferencing', 'Georeferencing: It is turtles all the way down', 110, 127, 'Recasts georeferencing as a relation among representations, exposing reference systems and their politics.'],
  ['window-rome', 'Window: Rome: Jumping over the Line', 128, 133, 'Opens a 4D, interpretive Rome in which reconstruction, data, and scholarly argument remain visible and revisable.'],
  ['window-tehran', 'Window: Mapping the 2009 Election Protests in Tehran', 134, 139, 'Uses social media and protestor reports to chart contested protest narratives while retaining their risks.'],
  ['participatory-dh', 'Participatory Digital Humanities', 140, 149, 'Treats public witnessing, trusted social relations, and uneven access as central to participatory knowledge work.'],
  ['event-hypercities-now', 'On the Event: HyperCities Now', 150, 171, 'Contrasts aggregate views with singular witness, and develops events as incomplete, networked, and multiple.'],
  ['tohoku-twitter', 'Mapping Events: Tohoku and Twitter', 172, 183, 'Follows crisis mapping, social media, emotional signal, and the tension between data scale and situated response.'],
  ['gallery-tohoku', 'Gallery: A Journey through Tohoku, Japan', 184, 203, 'Brings personal observation, photographs, disaster sites, radiation, and remembrance into a spatial narrative.'],
  ['endnotes', 'Endnotes', 204, 210, 'Documents the book’s extended theoretical, technical, and historical citation network.', 'apparatus'],
  ['acknowledgments', 'Acknowledgments', 211, 211, 'Records the collaborators, institutions, collections, and communities that made the project possible.', 'apparatus'],
  ['credits', 'Credits', 212, 212, 'Attributes figures, images, and visual materials used throughout the book.', 'apparatus'],
];
passages.forEach(([id, title, start, end, summary, form]) => addBookPassage(id, title, start, end, summary, form));

const orderedPassages = passages.map(([id]) => `passage:${id}`);
orderedPassages.forEach((id) => addEdge('work:hypercities-hyperbook', 'contains', id, { type: 'book-structure' }));
orderedPassages.slice(1).forEach((id, index) => addEdge(orderedPassages[index], 'followedBy', id, { type: 'book-sequence' }));

[
  ['hypercities', 'HyperCities', 'An unfinished, open field for navigating the past, present, and future of places through intersecting stories, media, and participation.'],
  ['thick-mapping', 'Thick mapping', 'A critical, layered practice of making, reading, contesting, and remaking spatial narratives.'],
  ['digital-humanities', 'Digital humanities', 'Interpretive and design-centered humanities work that uses the digital to invite multiple readings and public participation.'],
  ['flaneur', 'The flaneur', 'A figure of urban wandering whose movement across a city can also become movement through historical time.'],
  ['derive', 'Derive', 'Purposeful drifting: a non-linear movement through place, encounter, association, and unexpected relation.'],
  ['time-layers', 'Time-layers', 'Coexisting, non-simultaneous historical strata that make a present place heterogeneous.'],
  ['palimpsest', 'Palimpsest', 'A place understood as layered traces rather than a single, clean surface or timeline.'],
  ['ghosts', 'Ghosts', 'Erased, muted, or absent people, structures, and histories made newly perceivable through care and narration.'],
  ['zoom', 'Zoom', 'A historical method that changes the scale of attention, moving between local texture and comparative structure.'],
  ['counter-mapping', 'Counter-mapping', 'Mapping that exposes representational power and creates alternatives, tensions, and opportunities for contestation.'],
  ['windows', 'Windows', 'Situated openings in which project authors, communities, and media forms articulate different mapping practices.'],
  ['events', 'Events', 'Unfinished, multi-scalar occurrences whose meanings emerge through witnesses, records, time, and later narration.'],
  ['georeferencing', 'Georeferencing', 'The act of making a relation between representations; it does not discover a neutral or final ground.'],
  ['turtles', 'Turtles all the way down', 'A refusal of an ultimate cartographic reference point: every base map and coordinate system is another representation.'],
  ['multiplicity', 'Multiplicity', 'The coexistence of many voices, paths, media, scales, and interpretations without forced resolution.'],
  ['contingency', 'Contingency', 'The possibility that a route, encounter, or meaning could be otherwise; a condition for straying and an open future.'],
  ['open-future', 'The open future', 'Potential futures remain unclosed, inviting participation while resisting deterministic historical narratives.'],
  ['participation', 'Participation', 'The ability to contribute, annotate, witness, and contest a shared cultural record, with attention to uneven power.'],
  ['polyvocality', 'Polyvocality', 'Multiple authors, genres, formats, and situated voices held in relation without a single neutral narrator.'],
  ['projection', 'Projection', 'A contingent technical and political choice that makes one world legible while distorting or excluding others.'],
  ['basemap', 'Basemap', 'A provisional reference layer whose apparent neutrality should be questioned rather than treated as final ground.'],
  ['body-at-risk', 'Body at risk', 'Embodied proximity and vulnerability that disrupt the detached, totalizing gaze of an abstract observer.'],
  ['archive', 'Archive', 'A partial, designed record that can preserve, omit, and reconfigure traces of an event or place.'],
  ['singular-voice', 'Singular voice', 'The irreducible witness or account that resists being fully absorbed into aggregate visualizations.'],
].forEach(([id, title, description]) => addConcept(id, title, description));

const passageConcepts = {
  preface: ['hypercities', 'thick-mapping', 'polyvocality', 'multiplicity', 'body-at-risk'],
  'lexicon-hypercities': ['hypercities', 'georeferencing', 'ghosts', 'open-future', 'participation'],
  'lexicon-thick-mapping': ['thick-mapping', 'time-layers', 'palimpsest', 'counter-mapping', 'multiplicity'],
  'lexicon-digital-humanities': ['digital-humanities', 'multiplicity', 'contingency', 'open-future', 'participation'],
  'humanities-flaneur': ['flaneur', 'derive', 'time-layers', 'palimpsest', 'ghosts', 'zoom'],
  'brief-history': ['hypercities', 'time-layers', 'zoom', 'windows', 'participation', 'archive'],
  'thick-mapping-dh': ['thick-mapping', 'zoom', 'time-layers', 'palimpsest', 'derive', 'contingency', 'multiplicity'],
  'window-ghost-maps': ['ghosts', 'palimpsest', 'thick-mapping', 'counter-mapping'],
  'window-pdub': ['windows', 'participation', 'polyvocality', 'counter-mapping', 'thick-mapping'],
  'media-archaeology': ['zoom', 'projection', 'basemap', 'body-at-risk', 'multiplicity'],
  'counter-mapping': ['counter-mapping', 'projection', 'basemap', 'flaneur', 'time-layers'],
  georeferencing: ['georeferencing', 'turtles', 'projection', 'basemap', 'counter-mapping'],
  'window-rome': ['windows', 'time-layers', 'multiplicity', 'participation'],
  'window-tehran': ['windows', 'events', 'participation', 'counter-mapping', 'singular-voice'],
  'participatory-dh': ['participation', 'polyvocality', 'multiplicity', 'archive', 'singular-voice'],
  'event-hypercities-now': ['events', 'archive', 'singular-voice', 'multiplicity', 'time-layers'],
  'tohoku-twitter': ['events', 'zoom', 'archive', 'singular-voice', 'body-at-risk'],
  'gallery-tohoku': ['events', 'ghosts', 'body-at-risk', 'singular-voice', 'open-future'],
};
Object.entries(passageConcepts).forEach(([passage, concepts]) =>
  concepts.forEach((concept) => linkPassageToConcept(passage, concept)),
);
linkPassageToConcept('lexicon-hypercities', 'hypercities', 'defines');
linkPassageToConcept('lexicon-thick-mapping', 'thick-mapping', 'defines');
linkPassageToConcept('lexicon-digital-humanities', 'digital-humanities', 'defines');
linkPassageToConcept('georeferencing', 'georeferencing', 'defines');
linkPassageToConcept('georeferencing', 'turtles', 'defines');

const bookPlaces = [
  ['Berlin', 'city'], ['Los Angeles', 'city'], ['Historic Filipinotown', 'neighborhood'], ['Rome', 'city'],
  ['Tehran', 'city'], ['Cairo', 'city'], ['Benghazi', 'city'], ['Tohoku', 'region'], ['Fukushima', 'region'],
  ['Sendai', 'city'], ['Yuriage', 'locality'], ['Okawa', 'locality'], ['Namie', 'city'], ['Omi Province', 'region'],
].map(([label, spatialType]) => ({ label, spatialType }));
const places = new Map();
function ensurePlace(label, spatialType = 'city', source = 'book') {
  const id = placeId(label);
  if (!places.has(id)) {
    const node = addNode({ id, kind: 'place', title: label, spatialType, source: { dataset: source } });
    places.set(id, node);
  }
  return id;
}
bookPlaces.forEach(({ label, spatialType }) => ensurePlace(label, spatialType));

const cases = [
  ['berlin-temporal-topographies', 'Berlin: temporal topographies', 'brief-history', ['Berlin'], ['time-layers', 'palimpsest', 'zoom', 'hypercities']],
  ['los-angeles-ghost-maps', 'Los Angeles Ghost Maps', 'window-ghost-maps', ['Los Angeles'], ['ghosts', 'palimpsest', 'counter-mapping', 'thick-mapping']],
  ['historic-filipinotown', 'PDub Productions: Mapping HiFi', 'window-pdub', ['Los Angeles', 'Historic Filipinotown'], ['participation', 'polyvocality', 'windows', 'counter-mapping']],
  ['rome-jumping-over-the-line', 'Rome: Jumping over the Line', 'window-rome', ['Rome'], ['windows', 'time-layers', 'multiplicity']],
  ['tehran-election-protests', 'Tehran election protests, 2009', 'window-tehran', ['Tehran'], ['events', 'singular-voice', 'participation', 'counter-mapping']],
  ['hypercities-now', 'HyperCities Now: Egypt and Libya', 'event-hypercities-now', ['Cairo', 'Benghazi'], ['events', 'archive', 'singular-voice', 'multiplicity']],
  ['tohoku-social-media', 'Tohoku: social media after 3.11', 'tohoku-twitter', ['Tohoku', 'Fukushima', 'Sendai'], ['events', 'archive', 'body-at-risk', 'zoom']],
  ['tohoku-gallery', 'A Journey through Tohoku, Japan', 'gallery-tohoku', ['Tohoku', 'Yuriage', 'Okawa', 'Namie', 'Fukushima'], ['events', 'ghosts', 'body-at-risk', 'singular-voice']],
  ['georeferencing-experiments', 'Georeferencing experiments', 'georeferencing', ['Berlin', 'Omi Province'], ['georeferencing', 'turtles', 'projection', 'basemap', 'counter-mapping']],
];

cases.forEach(([id, title, passage, locations, concepts]) => {
  addNode({
    id: `case:${id}`,
    kind: 'case-study',
    title,
    source: { dataset: 'book', sourceNode: `passage:${passage}` },
    spatialAnchors: locations.map((location) => ensurePlace(location)),
    summary: 'A situated, non-exhaustive route through the HyperCities argument.',
  });
  addEdge(`passage:${passage}`, 'presents', `case:${id}`, { type: 'book-locator', sourceNode: `passage:${passage}` });
  locations.forEach((location) => addEdge(`case:${id}`, 'situatedIn', ensurePlace(location), { type: 'book-locator', sourceNode: `passage:${passage}` }));
  concepts.forEach((concept) => addEdge(`case:${id}`, 'activates', `concept:${concept}`, { type: 'book-locator', sourceNode: `passage:${passage}` }));
});

const interactions = [
  ['stray', 'STRAY', 'Move laterally through an unexpected relation rather than follow a prescribed route.', ['derive', 'flaneur', 'contingency', 'multiplicity']],
  ['descend', 'DESCEND', 'Move downward into overlapping time-layers and the relations that make a present place thick.', ['time-layers', 'palimpsest', 'ghosts', 'georeferencing']],
  ['surface', 'SURFACE', 'Return to the present view without treating it as the final or neutral layer.', ['zoom', 'basemap', 'projection', 'contingency']],
  ['windows', 'WINDOWS', 'Enter a situated project, voice, or medium as an argument with its own conditions and stakes.', ['windows', 'polyvocality', 'participation', 'multiplicity']],
  ['take-a-map', 'TAKE A MAP', 'Carry one historical map and its provenance into a new route through related places, times, and ideas.', ['archive', 'projection', 'georeferencing', 'open-future']],
  ['core', 'CORE', 'At a selected geographic extent, stack intersecting historical maps by temporal interval to make their reference relations inspectable.', ['georeferencing', 'turtles', 'time-layers', 'palimpsest', 'zoom']],
];
interactions.forEach(([id, title, description, concepts]) => {
  addNode({
    id: `interaction:${id}`,
    kind: 'proposed-interaction',
    title,
    description,
    status: 'proposal',
    ...(id === 'core'
      ? { inputs: ['geographic extent', 'temporal interval'], output: 'time-ordered map stack with source references' }
      : {}),
  });
  concepts.forEach((concept) =>
    addEdge(`interaction:${id}`, 'conceptuallyGroundedIn', `concept:${concept}`, {
      type: 'synthesis',
      status: 'proposal',
      rationale: 'A redesign interpretation grounded in the cited concept; not a claim that this label or interaction appears in the book.',
    }),
  );
});

const mapNodes = [];
const seenSourceIds = new Set();
mapRows.forEach((record, rowIndex) => {
  const sourceId = trimmed(record.id) || `row-${rowIndex + 2}`;
  if (seenSourceIds.has(sourceId)) throw new Error(`Duplicate Map Library id: ${sourceId}`);
  seenSourceIds.add(sourceId);
  const city = trimmed(record.city) || 'Unlocated';
  const location = normalisedBounds(record);
  const temporal = {
    start: trimmed(record['mapping.dateFrom.date']) || null,
    end: trimmed(record['mapping.dateTo.date']) || null,
    startYear: yearFromDate(record['mapping.dateFrom.date']),
    endYear: yearFromDate(record['mapping.dateTo.date']),
  };
  const node = addNode({
    id: `map:${sourceId}`,
    kind: 'historical-map',
    title: trimmed(record.titleEn) || trimmed(record.title) || `Map ${sourceId}`,
    alternativeTitle: trimmed(record.title) || null,
    source: { dataset: 'map-library', sourceRecordId: sourceId, sourceRow: rowIndex + 2 },
    place: { id: ensurePlace(city, 'city', 'map-library'), label: city },
    temporal,
    geometry: location,
    rendering: {
      tileType: trimmed(record.tileType) || null,
      tileUrl: trimmed(record.tileUrl) || null,
      thumbnailUrl: trimmed(record.thumbnailUrl) || null,
      minZoom: numberOrNull(record.minZoom),
      maxZoom: numberOrNull(record.maxZoom),
      projection: trimmed(record.projection) || null,
    },
    // Retained verbatim so data cleaning can be explicit and reversible later.
    sourceRecord: record,
    eligibleForCoring: Boolean(location && temporal.start && temporal.end),
  });
  mapNodes.push(node);
  addEdge(node.id, 'depicts', node.place.id, { type: 'map-library-metadata', sourceRecordId: sourceId });
});

const caseCityLinks = new Map([
  ['berlin', ['case:berlin-temporal-topographies', 'case:georeferencing-experiments']],
  ['los-angeles', ['case:los-angeles-ghost-maps', 'case:historic-filipinotown']],
  ['rome', ['case:rome-jumping-over-the-line']],
  ['tehran', ['case:tehran-election-protests']],
]);
mapNodes.forEach((map) => {
  const cityKey = slug(map.place.label);
  (caseCityLinks.get(cityKey) || []).forEach((caseId) =>
    addEdge(map.id, 'sharesGeographicFieldWith', caseId, {
      type: 'deterministic-spatial-join',
      join: 'normalised Map Library city equals a case-study city anchor',
      status: 'contextual',
      caution: 'This makes a spatial route available; it does not assert that the book reproduces or discusses this particular map.',
    }),
  );
});

const graph = {
  schemaVersion: '0.1.0',
  id: 'graph:hypercities-hyperbook',
  title: 'HyperCities Hyperbook Graph',
  purpose: 'A source-traceable graph for spatial, temporal, and conceptual exploration; it is not a website specification or a reconstruction of the original platform.',
  sources: [
    {
      id: 'source:book',
      title: 'HyperCities: Thick Mapping in the Digital Humanities',
      creators: ['Todd Presner', 'David Shepard', 'Yoh Kawano'],
      publicationYear: 2014,
      localFile: path.relative(root, bookPath),
      sha256: digest(bookPath),
      license: 'CC BY 4.0',
      pagesCovered: [6, 212],
    },
    {
      id: 'source:map-library',
      title: 'HyperCities Map Library',
      sourceUrl: mapSourceUrl,
      retrievedAt: '2026-09-09',
      sha256: digest(mapsPath),
      recordCount: mapRows.length,
      retainedFields: Object.keys(mapRows[0] || {}),
    },
  ],
  queryContracts: {
    core: {
      input: { geographicExtent: 'WGS84 bounding box', temporalInterval: '[start, end]' },
      candidates: 'historical-map nodes whose normalised bbox intersects the requested extent and whose temporal interval intersects the requested interval',
      ordering: 'temporal.start ascending, then sourceRecordId',
      displayRequirement: 'Show the original map metadata, source corners, and reference/projection data alongside any stack.',
    },
    derive: {
      input: { currentNode: 'any graph node', mode: 'conceptual|spatial|temporal' },
      candidates: 'one-hop and two-hop paths that diversify predicate type and do not repeat the immediately prior concept or place',
      displayRequirement: 'Expose the path and its evidence rather than presenting a route as an objective recommendation.',
    },
    takeAMap: {
      input: { mapId: 'historical-map node id' },
      candidates: 'the map, its place, contextual cases, and passage/concept paths reached through those cases',
      displayRequirement: 'Keep the complete sourceRecord and tile/provenance fields reachable.',
    },
  },
  nodeKinds: ['work', 'book-passage', 'concept', 'place', 'case-study', 'proposed-interaction', 'historical-map'],
  nodes,
  edges,
  integrity: {
    bookPageCoverage: [6, 212],
    bookPassageCount: passages.length,
    mapRecordCount: mapNodes.length,
    note: 'Map Library source records are preserved verbatim. Normalised bounding boxes are derived solely to make spatial intersection queries reliable.',
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, outputPath)} with ${nodes.length} nodes and ${edges.length} edges.`);
