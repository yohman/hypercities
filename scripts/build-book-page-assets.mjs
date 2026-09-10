#!/usr/bin/env node

/**
 * Build a static, browser-readable facsimile archive for HyperCities: Thick
 * Mapping in the Digital Humanities and locate the exact quotations used by
 * the Encounter Fragment Library on those pages.
 *
 * The images are deliberately generated from the supplied source edition. The
 * location data is a visual aid for the reader, not a replacement for the
 * textual provenance that remains in the Hyperbook graph.
 *
 * Usage:
 *   node scripts/build-book-page-assets.mjs [path/to/book.pdf]
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const sourcePdf = resolve(root, process.argv[2] || "eScholarship UC item 3mh5t455.pdf");
const outputDirectory = join(root, "assets", "book-pages");
const locationPath = join(root, "data", "book-page-locations.json");
const hyperbookPath = join(root, "data", "hyperbook", "hyperbook.json");
const encountersPath = join(root, "data", "hyperbook", "encounters.json");
const renderResolution = 144;
// One quotation begins at the very last two words of p. 201 and completes on
// p. 202. Poppler's page-local text order cannot reconstruct that split word,
// so this source-checked start rectangle keeps the visual trail honest.
const sourceCheckedPartialLocations = {
  "quote:150-every-classroom-we-entered-reflected-this-fact-whic": {
    page: 201,
    matchConfidence: "partial-page",
    matchCoverage: 0.07,
    rect: { left: 0.34979, top: 0.5627, width: 0.12486, height: 0.02257 },
  },
};

if (!existsSync(sourcePdf)) {
  throw new Error(`Source PDF not found: ${sourcePdf}`);
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" });
}

function attribute(markup, name) {
  const match = markup.match(new RegExp(`${name}="([^"]*)"`));
  return match ? Number(match[1]) : 0;
}

function unescapeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tokens(value) {
  return unescapeXml(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function pageWords(markup) {
  const pages = [];
  const pagePattern = /<page\s+([^>]*)>([\s\S]*?)<\/page>/g;
  let pageMatch;
  let pageNumber = 0;
  while ((pageMatch = pagePattern.exec(markup))) {
    pageNumber += 1;
    const width = attribute(pageMatch[1], "width");
    const height = attribute(pageMatch[1], "height");
    const rawWords = [];
    const wordPattern = /<word\s+([^>]*)>([\s\S]*?)<\/word>/g;
    let wordMatch;
    while ((wordMatch = wordPattern.exec(pageMatch[2]))) {
      const text = unescapeXml(wordMatch[2]);
      if (!tokens(text).length) continue;
      const box = {
        xMin: attribute(wordMatch[1], "xMin"),
        yMin: attribute(wordMatch[1], "yMin"),
        xMax: attribute(wordMatch[1], "xMax"),
        yMax: attribute(wordMatch[1], "yMax"),
      };
      rawWords.push({ text, box });
    }
    const words = [];
    for (let index = 0; index < rawWords.length; index += 1) {
      const current = rawWords[index];
      const next = rawWords[index + 1];
      // Poppler preserves a line-ending discretionary hyphen as two words
      // (for example, “Hy-” + “perCity”).  Join it here so the text layer can
      // meet the graph's normalized quotation without losing its visual box.
      if (/[-\u2010]$/.test(current.text) && next && /^[A-Za-z]/.test(next.text)) {
        const joined = `${current.text.slice(0, -1)}${next.text}`;
        const joinedTokens = tokens(joined);
        if (joinedTokens.length === 1) {
          words.push({
            token: joinedTokens[0],
            box: {
              xMin: Math.min(current.box.xMin, next.box.xMin),
              yMin: Math.min(current.box.yMin, next.box.yMin),
              xMax: Math.max(current.box.xMax, next.box.xMax),
              yMax: Math.max(current.box.yMax, next.box.yMax),
            },
          });
          index += 1;
          continue;
        }
      }
      tokens(current.text).forEach((token) => words.push({ token, box: current.box }));
    }
    pages.push({ pageNumber, width, height, words });
  }
  return pages;
}

function tokenMatches(pageToken, quoteToken) {
  return pageToken === quoteToken
    // The final line on a page can retain a discretionary hyphen while the
    // continuation lives on the following page (for example, class- / room).
    || (pageToken.length >= 4 && quoteToken.startsWith(pageToken));
}

function startsAt(pageTokens, quoteTokens, start, seedLength) {
  const available = Math.min(seedLength, pageTokens.length - start);
  if (available < 2) return false;
  for (let index = 0; index < available; index += 1) {
    if (!tokenMatches(pageTokens[start + index].token, quoteTokens[index])) return false;
  }
  return true;
}

function locateQuote(page, quoteText) {
  const quoteTokens = tokens(quoteText);
  if (quoteTokens.length < 3) return null;

  const seedLength = Math.min(6, quoteTokens.length);
  const starts = [];
  for (let start = 0; start < page.words.length; start += 1) {
    if (startsAt(page.words, quoteTokens, start, seedLength)) starts.push(start);
  }

  let best = null;
  for (const start of starts) {
    let pageIndex = start;
    let quoteIndex = 0;
    let lastMatch = start;
    let gaps = 0;
    const maxGaps = Math.max(30, Math.ceil(quoteTokens.length * 0.45));
    while (pageIndex < page.words.length && quoteIndex < quoteTokens.length && gaps <= maxGaps) {
      if (tokenMatches(page.words[pageIndex].token, quoteTokens[quoteIndex])) {
        lastMatch = pageIndex;
        pageIndex += 1;
        quoteIndex += 1;
        continue;
      }
      pageIndex += 1;
      gaps += 1;
    }
    const coverage = quoteIndex / quoteTokens.length;
    // A source quotation can begin on its cited page and continue onto the
    // next.  Preserve the first-page highlight in that case instead of
    // manufacturing a false whole-quote rectangle on a different page.
    if (coverage < 0.05) continue;
    const span = page.words.slice(start, lastMatch + 1);
    const bounds = span.reduce(
      (box, word) => ({
        xMin: Math.min(box.xMin, word.box.xMin),
        yMin: Math.min(box.yMin, word.box.yMin),
        xMax: Math.max(box.xMax, word.box.xMax),
        yMax: Math.max(box.yMax, word.box.yMax),
      }),
      { xMin: Infinity, yMin: Infinity, xMax: 0, yMax: 0 },
    );
    const candidate = { coverage, bounds };
    if (!best || candidate.coverage > best.coverage) best = candidate;
  }

  if (!best) return null;
  return {
    matchConfidence: best.coverage >= 0.98 ? "high" : best.coverage >= 0.7 ? "review" : "partial-page",
    matchCoverage: Number(best.coverage.toFixed(3)),
    rect: {
      left: Number((best.bounds.xMin / page.width).toFixed(5)),
      top: Number((best.bounds.yMin / page.height).toFixed(5)),
      width: Number(((best.bounds.xMax - best.bounds.xMin) / page.width).toFixed(5)),
      height: Number(((best.bounds.yMax - best.bounds.yMin) / page.height).toFixed(5)),
    },
  };
}

function sourcePage(object) {
  return object?.provenance?.printedPages?.[0] || null;
}

const info = execFileSync("pdfinfo", [sourcePdf], { cwd: root, encoding: "utf8" });
const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
if (!Number.isInteger(pageCount) || pageCount < 1) {
  throw new Error("Could not determine the source PDF page count.");
}

mkdirSync(outputDirectory, { recursive: true });
const tempDirectory = mkdtempSync(join(tmpdir(), "hypercities-book-pages-"));

try {
  const existingPages = readdirSync(outputDirectory).filter((file) => /^page-\d{3}\.webp$/.test(file));
  if (existingPages.length !== pageCount || process.argv.includes("--render-pages")) {
    const renderPrefix = join(tempDirectory, "page");
    run("pdftoppm", ["-f", "1", "-l", String(pageCount), "-r", String(renderResolution), "-png", sourcePdf, renderPrefix]);
    const pngs = readdirSync(tempDirectory).filter((file) => /^page-\d+\.png$/.test(file)).sort();
    if (pngs.length !== pageCount) {
      throw new Error(`Expected ${pageCount} rendered pages; found ${pngs.length}.`);
    }
    pngs.forEach((pngName, index) => {
      const pageNumber = String(index + 1).padStart(3, "0");
      run("cwebp", ["-quiet", "-q", "82", join(tempDirectory, pngName), "-o", join(outputDirectory, `page-${pageNumber}.webp`)]);
    });
  } else {
    console.log(`Reusing ${pageCount} existing WebP page images.`);
  }

  const bboxPath = join(tempDirectory, "book-bbox.xhtml");
  run("pdftotext", ["-bbox-layout", sourcePdf, bboxPath]);
  const pages = pageWords(readFileSync(bboxPath, "utf8"));
  const hyperbook = JSON.parse(readFileSync(hyperbookPath, "utf8"));
  const encounters = JSON.parse(readFileSync(encountersPath, "utf8"));
  const objectsById = new Map(hyperbook.objects.map((object) => [object.id, object]));
  const quoteIds = new Set(encounters.encounters
    .filter((encounter) => encounter.kind === "quotation")
    .map((encounter) => encounter.sourceObjectId));
  const highlights = {};
  const unresolved = [];

  [...quoteIds].sort().forEach((quoteId) => {
    const quote = objectsById.get(quoteId);
    const pageNumber = sourcePage(quote);
    const page = pages[pageNumber - 1];
    const location = (page && locateQuote(page, quote?.text || "")) || sourceCheckedPartialLocations[quoteId];
    if (!location) {
      unresolved.push({ quoteId, page: pageNumber, reason: "No sufficiently exact text match in the cited page." });
      return;
    }
    highlights[quoteId] = { page: pageNumber, ...location };
  });

  const result = {
    schemaVersion: "1.0.0",
    id: "hyperbook-page-locations",
    generatedFrom: {
      sourceFile: basename(sourcePdf),
      sourceDocumentId: "source:hypercities-thick-mapping-2014",
      pageCount,
      renderResolution,
      pageImagePattern: "./assets/book-pages/page-###.webp",
    },
    evidencePolicy: "Highlight rectangles are derived from the source PDF text layer. Their purpose is visual orientation; printed page provenance in the Hyperbook remains authoritative.",
    highlights,
    unresolved,
  };
  writeFileSync(locationPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Rendered ${pageCount} WebP pages to ${outputDirectory}`);
  console.log(`Located ${Object.keys(highlights).length}/${quoteIds.size} quotation highlights; ${unresolved.length} need review.`);
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
