# Phase 1: Hyperbook Graph review sample

## Proposal

The Hyperbook is a network of source-traceable intellectual objects, not a PDF converted into a flat set of keywords. It separates the book's compositional objects from the entities that recur across them:

| Artifact | Responsibility |
| --- | --- |
| `hyperbook.json` | Book-native units: sections, passages, quotations, figures/images, and code fragments. |
| `entities.json` | Controlled entities resolved across the book: people, narrative voices, concepts, places, dates/time ranges, events, projects, Windows, and technologies. |
| `edges.json` | Relationships among objects and entities. Each has a relation type, strength, confidence, assertion status, and exact evidence locator. |

The source locator is mandatory everywhere: source document ID, section ID, inclusive printed-page range, and a human-readable locator. In other words, a visitor can always travel from a claim, quote, or relationship back to a bounded location in the book.

## Ontology

Book objects are structural or documentary units:

- `section`, `window`, `gallery`, and `apparatus` retain the book’s own organization.
- `passage` is a review-sized intellectual unit, not automatically a page or paragraph.
- `quotation` is a short exact transcription connected back to its passage.
- `figure` and `image` retain their caption, figure number where supplied, and page location.
- `code-fragment` preserves a source transcription, language, purpose, and page-local call-out.

Controlled entities use stable IDs such as `place:berlin`, `person:walter-benjamin`, and `concept:georeferencing`. Display labels can change; IDs do not. Aliases such as `flaneur` / `flâneur`, `TP` / Todd Presner, and `L.A.` / Los Angeles resolve to one canonical entity. No coordinates are introduced for a book place until a later reviewed authority-linking step.

The sample explicitly distinguishes `narrative-voice` from `person`. A page tagged `(YK)` is a book voice, which is then connected to `person:yoh-kawano` through an evidence-backed `represents` edge. This preserves the book’s polyvocal construction without assuming that every sentence is an uncomplicated authorial assertion.

## Relation policy

`relationType` is controlled: `contains`, `defines`, `develops`, `situated-in`, `presents`, `documents`, `uses`, `depicts`, `quoted-from`, and related types live in the formal schema. Every edge includes:

- `strength` - how useful the relation should be for future traversal (0 to 1).
- `confidence` - confidence in the extraction or interpretation (0 to 1).
- `assertion` - `explicit` when directly stated or structurally given by the book; `inferred` when it is an interpretive bridge.
- `evidence` - a page- and section-specific locator with a short explanation.

For example, the flaneur-to-`derive` edge is intentionally `inferred`, with modest strength and confidence: the sample proposes it as a navigational bridge rather than pretending the cited pages use the term. In contrast, the Ghost Maps passage-to-`concept:ghosts` edge is `explicit` because the text directly says that mapping can make those ghosts visible.

## Sample coverage

The review sample includes 34 book objects, 52 controlled entities, and 55 typed edges.

| Route | Book objects | What it tests |
| --- | --- | --- |
| HyperCities / Thick Mapping | Lexicon passages and two quotations, pp. 12-19 | Concepts, definitions, open and unfinished systems |
| flaneur / Berlin | Passages, Benjamin, Berlin, pp. 22-30 | Person, voice, place, concept, and an explicitly marked inferred bridge |
| Los Angeles Ghost Maps | Window, figure, passages, Phil Ethington, pp. 66-73 | Windows, project, image/figure, ghosts, thick maps, and place nesting |
| Georeferencing | Passages, two quotations, Omi figure, pp. 110-127 | Basemap critique, concepts, figure provenance, and conceptual argument |
| Fukushima / Tohoku / Mapping Events | Passages, dates, events, projects, Twitter Search API, pp. 140-203 | Events, time ranges, technologies, archives, witnessing, and multiscalar narratives |

The single AJAX code object (p. 38) is a deliberately bounded schema specimen. It verifies that code can be represented without opening a sixth interpretive route.

## Map-library boundary

`maps.json` is intentionally deferred. The future normalized map artifact should keep source record IDs and raw metadata, then add (without overwriting) normalized bounds, temporal intervals, place links, tile endpoints, and georeferencing/projection data. It should use the same `place:*`, `time-range:*`, `technology:*`, and evidence conventions as this sample.

Only after review should map edges be generated. A geographic overlap can suggest a route to a passage or concept, but must be recorded as inferred/contextual unless the book explicitly names that map. This prevents a spatial join from being mistaken for a scholarly claim.

## Decisions requested before scale-up

1. Is a passage a good editorial unit, or should the graph work at paragraph, spread, or call-out granularity?
2. Does the entity vocabulary separate concepts, projects, places, and narrative voices at the right level of detail?
3. Should inferred concepts such as `derive` remain as reviewable bridges, or be kept out until an editor explicitly authorizes them?
4. Are strength and confidence useful as two separate fields, and who will set them during full extraction?
5. Which external authorities, if any, should later resolve people and places without replacing the book’s own names, dates, or uncertainty?

No whole-book extraction or Map Library normalization should proceed until these decisions are reviewed.
