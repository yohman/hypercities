# HyperCities Hyperbook Graph

## Current phase: full-book Hyperbook + TimeWell prototype

This repository contains a reviewable full-book Hyperbook Graph and Encounter Fragment Library drawn from *HyperCities: Thick Mapping in the Digital Humanities*, together with the existing static map/TimeWell prototype. It does not introduce a backend, normalize the full Map Library, or modify the current interaction during the extraction phase.

The canonical full-book review artifacts are:

- [hyperbook.json](data/hyperbook/hyperbook.json) - source-book hierarchy, passages, quotations, figure references, and code fragments.
- [entities.json](data/hyperbook/entities.json) - controlled vocabulary with aliases, entity types, geography scale, and source provenance.
- [edges.json](data/hyperbook/edges.json) - explicit and explicitly-labelled inferred source relationships.
- [encounters.json](data/hyperbook/encounters.json) - encounter-sized source objects linked back to the scholarly passages.
- [experience-affordances.json](data/hyperbook/experience-affordances.json) - separate, editorial activation proposals for a future Experience Graph.
- [analysis.json](data/hyperbook/analysis.json) - diversity, repetition, hub, and review analysis.
- [derives.json](data/hyperbook/derives.json) - four auditable, data-level dérive simulations.
- [book-page-locations.json](data/book-page-locations.json) - visual source-page locations for the exact quotation encounters.
- [book-pages](assets/book-pages) - 212 source-faithful WebP page images used by the quotation reader.
- [full schema / policy](docs/hyperbook-full-schema.md) and [dérive tests](docs/hyperbook-derives.md).

The earlier Phase 1 sample remains as a historical ontology specimen:

- [hyperbook.json](data/phase-1-sample/hyperbook.json) - book-native objects: sections, passages, quotations, figures, and a code-fragment specimen.
- [entities.json](data/phase-1-sample/entities.json) - controlled vocabulary for people, voices, concepts, places, dates, events, projects, Windows, and technologies.
- [edges.json](data/phase-1-sample/edges.json) - typed relationships with strength, confidence, assertion status, and page-level evidence.
- [ontology/schema](schema/hyperbook-phase1.schema.json) - the portable artifact shapes and relation vocabulary.
- [review guide](docs/phase-1-sample-review.md) - the proposed ontology, sample coverage, and decisions needed before scaling.

Generate the full-book draft and run its integrity check with:

```sh
pdftotext -raw "eScholarship UC item 3mh5t455.pdf" tmp/hyperbook-extraction/book-raw.txt
node scripts/build-hyperbook-full.mjs tmp/hyperbook-extraction/book-raw.txt
node scripts/simulate-hyperbook-derives.mjs
node scripts/validate-hyperbook-full.mjs tmp/hyperbook-extraction/book-raw.txt
node scripts/build-book-page-assets.mjs
```

It verifies cross-file IDs, exact quoted-page matches, complete passage coverage, typed evidence, the editorial boundary, and the no-country-geographic-fallback rule.

## Extraction boundary

The full-book draft covers the substantive book (printed pp. 6–203). Its scholarly passage hierarchy includes:

1. Preface and Lexicon
2. The Humanities in the Digital Humanities, including Berlin and Thick Mapping
3. Los Angeles Ghost Maps and PDub
4. The View from Above / Below, Counter-Mapping, and georeferencing
5. Rome and Tehran Windows
6. Mapping Events / Mapping Social Media
7. Tohoku gallery

The pre-existing [exploratory aggregate](data/hyperbook-graph.json) remains a map-source convenience for the prototype. It is not an input to the full-book source graph. The TimeWell now selects from the full Encounter Fragment Library using direct place evidence where it exists, then explicitly labelled cartographic, interactional, temporal, conceptual, and editorial resonances. It maintains encounter and passage cooldowns so one familiar quotation does not dominate a dérive.

An intentional, visibly labelled regional activation exists for a core whose clicked coordinate is in Japan: it selects only Yoh Kawano's *Mapping Events* passages (including Tohoku/Fukushima) as an editorial Japan thread. This does not assert that each selected map is of Fukushima, and it never turns a country name into an otherwise-general geographic fallback.

## Field prototype

`index.html` is a no-build, GitHub Pages-ready prototype. Serve the repository as static files and open its root URL. (A `file://` preview is intentionally not supported because browsers block the JSON graph/map reads.) It uses MapLibre GL JS for the dark geographic field and deck.gl's Cartesian `OrbitView` for an unbounded floating temporal cross-section. The well previews transparently on hover wherever historical-map depth exists; a click locks it to that coordinate. Each stratum preserves the footprint's aspect ratio and the core's relative position. Its temporal scale is elastic: every stratum receives room to be selected, while logarithmically compressed large intervals are named as gaps rather than dominating the well. Hovering a stratum or its year illuminates the corresponding true footprint in the map. Selecting a stratum moves the freely navigable map to its full, unscaled geographic bounds and attempts its legacy raster source, with fit padding that keeps the selected map outside the well's floating area. Clicking a quotation opens the original source page with the source text highlighted; Escape or a click outside returns to the same dérive. The full Encounter Fragment Library supplies Hyperbook encounters/evidence; the pre-existing exploratory map records are used only as an available historical-map source.

Stored legacy tile bases are HTTP. The prototype preserves each source value but upgrades the same host to HTTPS and derives the existing `{z}/{x}/{y}.png` pattern at display time. Its expandable map-data detail records that decision and any browser raster failure.
