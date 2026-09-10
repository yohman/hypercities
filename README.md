# HyperCities Hyperbook Graph

## Current phase: ontology and review sample

This repository contains a reviewable Phase 1 graph sample drawn from the complete *HyperCities: Thick Mapping in the Digital Humanities* PDF and a deliberately small static field prototype. It does not contain full-book extraction, a normalized Map Library import, or final site architecture.

The canonical review artifacts are:

- [hyperbook.json](data/phase-1-sample/hyperbook.json) - book-native objects: sections, passages, quotations, figures, and a code-fragment specimen.
- [entities.json](data/phase-1-sample/entities.json) - controlled vocabulary for people, voices, concepts, places, dates, events, projects, Windows, and technologies.
- [edges.json](data/phase-1-sample/edges.json) - typed relationships with strength, confidence, assertion status, and page-level evidence.
- [ontology/schema](schema/hyperbook-phase1.schema.json) - the portable artifact shapes and relation vocabulary.
- [review guide](docs/phase-1-sample-review.md) - the proposed ontology, sample coverage, and decisions needed before scaling.

Run the integrity check with:

```sh
node scripts/validate-phase1-sample.mjs
```

It verifies cross-file IDs, required object specimens, inclusive page ranges, declared source sections, typed edge evidence, and explicit versus inferred status.

## Phase boundary

The sample covers only these five review routes:

1. HyperCities and Thick Mapping lexicon
2. flaneur and Berlin
3. Los Angeles Ghost Maps
4. Georeferencing: “It is turtles all the way down”
5. Fukushima, Tohoku, and Mapping Events

The pre-existing [exploratory aggregate](data/hyperbook-graph.json) is deliberately not an input to the Phase 1 sample and should not be treated as the approved corpus. The next extraction should happen only after the ontology, vocabulary, and evidence policy in the sample are reviewed.

## Field prototype

`index.html` is a no-build, GitHub Pages-ready prototype. Serve the repository as static files and open its root URL. (A `file://` preview is intentionally not supported because browsers block the JSON graph/map reads.) It uses MapLibre GL JS for the dark geographic field and deck.gl's Cartesian `OrbitView` for an unbounded floating temporal cross-section. The well previews transparently on hover wherever historical-map depth exists; a click locks it to that coordinate. Each stratum preserves the footprint's aspect ratio and the core's relative position. Its temporal scale is elastic: every stratum receives room to be selected, while logarithmically compressed large intervals are named as gaps rather than dominating the well. Hovering a stratum or its year illuminates the corresponding true footprint in the map. Selecting a stratum moves the freely navigable map to its full, unscaled geographic bounds and attempts its legacy raster source, with fit padding that keeps the selected map outside the well's floating area. This avoids presenting a scale-normalized cross-section as a second geographic map. The Phase 1 sample supplies book encounters/evidence; the pre-existing exploratory map records are used only as an available historical-map source.

Stored legacy tile bases are HTTP. The prototype preserves each source value but upgrades the same host to HTTPS and derives the existing `{z}/{x}/{y}.png` pattern at display time. Its expandable map-data detail records that decision and any browser raster failure.
