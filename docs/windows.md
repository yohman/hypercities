# Windows — four independent readings

WINDOWS is available in Explore and its hover shortcuts. Four entrances open the book's four project stories in a dedicated reader, without moving the underlying map.

| Window | Original book pages | Credited voice |
| --- | --- | --- |
| Los Angeles Ghost Maps | 66–73 | Phil Ethington |
| PDub Productions: Mapping HiFi | 74–83 | Mike Blockstein and Reanne Estrada, Public Matters |
| Rome: Jumping Over the Line | 128–133 | Diane Favro and Chris Johanson |
| Mapping the 2009 Election Protests in Tehran | 134–139 | Xárene Eskandar |

Ranges and credits were checked against the supplied book's W1–W4 sections, including their final pages. Images reuse the complete original page facsimiles in `assets/book-pages`, preserving illustrations, captions, and typography. Page numbers match the source's printed numbering. Introductions and entrance questions are editorial summaries, not source quotations.

The reader stays within the selected story. Wide screens show original facing pages with a one-pixel gutter; narrow screens show one page. Previous/next controls and arrow keys turn pages. “Four Windows” returns to the chooser; “Continue in the full book” opens READ at the current page. Escape and the map control close the overlay. These are facsimile readings, not newly transcribed, reflowable text; image alt text identifies pages but does not substitute for a complete accessible transcript.

Implementation: `js/windows.js`, the `#stories-window` dialog in `index.html`, and the Windows styles in `styles.css`. No new services or dependencies.
