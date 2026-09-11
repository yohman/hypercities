# Full-book Hyperbook data draft

This is a static, reviewable data layer for *HyperCities: Thick Mapping in the Digital Humanities*. HyperCities reads it to select encounters; source facts, Map Graph records, and editorial activation behavior remain separate.

## Artifact boundary

| Artifact | Role | May contain editorial activation? |
| --- | --- | --- |
| `data/hyperbook/hyperbook.json` | Source-book hierarchy and book objects | No |
| `data/hyperbook/entities.json` | Controlled identity vocabulary | No |
| `data/hyperbook/edges.json` | Source-graph relationships | No |
| `data/hyperbook/encounters.json` | Encounter-sized source objects with parent links | No |
| `data/hyperbook/experience-affordances.json` | Proposed conditions for a later Experience Graph | Yes, and only here |
| `data/hyperbook/analysis.json` | Counts, hub/repetition observations, and review priorities | No |
| `data/hyperbook/derives.json` | Auditable conceptual pathways used for this review | No |
| `data/book-page-locations.json` | Source-page rectangles for quotation-reader highlighting | No — derived visual locator only |
| `assets/book-pages/page-###.webp` | 212 static facsimile pages from the supplied edition | No |

The Map Graph remains the existing map-library data in `data/hyperbook-graph.json`; this extraction neither imports nor alters it.

## Provenance model

Every source object and controlled entity has a `provenance` record:

```json
{
  "sourceDocumentId": "source:hypercities-thick-mapping-2014",
  "sectionId": "section:view-above-below",
  "printedPages": [110, 110],
  "locator": "Printed p. 110"
}
```

Passages use curated, coherent page ranges. Quotations point to one exact printed page and also retain `sourcePassageId`. Their text is a normalized extraction from the supplied PDF—not an invented paraphrase—and `transcriptionStatus` requires source-page review before a typeset public display. A `sourceTextHash` on each passage records the extraction snapshot used during review.

## Hyperbook Graph

`hyperbook.json` contains `section`, `passage`, `quotation`, `figure-reference`, and `code-fragment` objects. A passage is the scholarly unit: a deliberately defined thematic range, never an automatically split paragraph. Quotations, figures, and code fragments belong to passages through edges.

`entities.json` gives recurring references one stable identifier, aliases, entity type, first literal-book provenance, and (for places) `placeScale`. Current types include person, narrative voice, concept, place, date, time range, event, project, Window, and technology.

`edges.json` uses categorical, not numerical, assessment:

| Field | Values | Meaning |
| --- | --- | --- |
| `assertion` | `book-explicit`, `book-inferred` | Literal source support, or clearly marked interpretive indexing |
| `confidence` | `high`, `medium`, `low` | Evidential support |
| `strength` | `strong`, `moderate`, `light` | Potential traversal usefulness |

`book-inferred` is deliberately narrow: the current extraction only uses `co-articulated-with` where two literal concepts occur in the same coherent passage. It does not claim that the book formally defines their relation.

## Encounter Fragment Library

`encounters.json` is not a second passage graph. It contains smaller, displayable source objects such as quotations, passage titles, concepts, people, projects, Windows, and events. Each fragment has:

- `sourceObjectId` and, where relevant, `sourcePassageId`;
- exact page or passage-range provenance;
- `sourceStatus` (`book-explicit` here);
- a display safety note; and
- editorial suitability without prescribing an interface treatment.

Thus a passage can stay intact for scholarship while several distinct entry points can lead a visitor into it.

## Editorial affordances

Every record in `experience-affordances.json` is explicitly `editorial`. Its `sourceBasis` points back to literal book evidence, while `activation` names a possible future state cue. The five dimensions are:

- `spatial` — direct, named city/district/site/region references only;
- `temporal` — historical change, layering, event time, memory, or open future;
- `cartographic` — mapping, georeferencing, basemaps, projection, scale, representation, archive, network;
- `interactional` — wandering, descend/surface, zoom, compare, revisit, layer, drift, witness; and
- `conceptual` — controlled concepts literally present in the source fragment.

An affordance is a defensible invitation, not a statement that the book tells the visitor to perform the action.

## Geographic safety and future selection

The data has no country or nearest-quotation fallback. Country entities are retained as source facts, but the generator forbids them from producing spatial affordances. A spatial affordance can only use a literal, direct city/district/site/region mention and includes `direct-place-match-only` as a state cue.

Future selection should be allowed to return no encounter. It should apply `analysis.json`’s source-passage and concept cooldown policy, then balance direct geography with cartographic, interactional, temporal, conceptual, and deliberately labelled editorial resonances.

The site also has one narrow, labelled editorial regional thread: a core coordinate within Japan can activate Yoh Kawano's *Mapping Events* passages, with particular weight for explicit Tohoku/Fukushima passage links. This is not a country-level spatial relation and does not assert that the current historical map depicts Fukushima; the UI and provenance detail identify it as an editorial Japan activation.

## Static source-page reader

`scripts/build-book-page-assets.mjs` renders the supplied PDF at 144 dpi to `assets/book-pages/page-###.webp` and writes `data/book-page-locations.json`. It attempts to locate each exact quotation from `encounters.json` in its cited source page, preserving a page-local rectangle only. A quotation that crosses a page break highlights its visible starting portion; the reader says that it continues. The generated image and rectangle are visual orientation aids, while the Hyperbook's printed-page provenance remains authoritative.

```sh
node scripts/build-book-page-assets.mjs
```

## Rebuild and validate

The committed JSON is static and GitHub Pages-ready. To regenerate it from the supplied edition:

```sh
mkdir -p tmp/hyperbook-extraction
pdftotext -raw "eScholarship UC item 3mh5t455.pdf" tmp/hyperbook-extraction/book-raw.txt
node scripts/build-hyperbook-full.mjs tmp/hyperbook-extraction/book-raw.txt
node scripts/validate-hyperbook-full.mjs tmp/hyperbook-extraction/book-raw.txt
```

The validator checks unique IDs, complete p. 6–203 passage coverage, page-safe provenance, literal quotation presence on its cited page, cross-file references, explicit/inferred/editorial separation, duplicate quotation encounters, the country-fallback prohibition, and current analysis counts.

`node scripts/simulate-hyperbook-derives.mjs` regenerates the four conceptual pathways in `derives.json` and fails if their cited map or encounter source is no longer present.
