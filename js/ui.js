import { tileTemplate } from "./data.js";
import { hostedNetworkKmlUrlFor, mapLibreSnippetFor } from "./take-map.js";
import { openingQuotes } from "./opening-quotes.js";

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function pages(provenance) { if (!provenance?.printedPages) return ""; const [start, end] = provenance.printedPages; return start === end ? `book p. ${start}` : `book pp. ${start}–${end}`; }
function sourceDetails(provenance, tile, relation, movementNote = null) {
  const edge = relation?.edge;
  return `<details class="data-details"><summary>source</summary>${provenance ? `<p>${escapeHtml(pages(provenance))} · ${escapeHtml(provenance.locator || "")}</p>` : ""}${edge ? `<p class="evidence">${escapeHtml(edge.relationType)} · ${escapeHtml(edge.assertion)} · ${escapeHtml(edge.evidence?.note || "")}</p>` : ""}${movementNote ? `<p class="evidence">${escapeHtml(movementNote)}</p>` : ""}${tile ? `<p><strong>Tiles:</strong> ${escapeHtml(tile.message)}<br><code>${escapeHtml(tile.url || tile.originalUrl || "No endpoint")}</code></p>` : ""}</details>`;
}
function pathButtons(links = []) {
  return links.map((item) => `<button type="button" data-node="${escapeHtml(item.id)}">${escapeHtml(item.label)} <span aria-hidden="true">→</span></button>`).join("");
}
function mapRecord(map) {
  const record = map?.original?.sourceRecord || {};
  const fields = [
    ["Creator", record.creator],
    ["Publisher", record.publisher],
    ["Collection", record.collectionSource],
    ["Scale", record.scale],
    ["Projection", record.projection]
  ].filter(([, value]) => value && value !== "N/ATEST");
  if (!fields.length) return "";
  return `<details class="map-record"><summary>map record</summary><dl>${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></details>`;
}
function strayCopy(lateral) {
  if (!lateral) return "";
  const kind = String(lateral.kind || "book thread").replace(/-/g, " ");
  const assertion = lateral.edge?.assertion === "book-explicit" ? "book-explicit" : lateral.edge?.assertion === "book-inferred" ? "book-inferred" : "editorial resonance";
  return `<button class="stray-path" type="button" data-node="${escapeHtml(lateral.id)}" aria-label="Stray through ${escapeHtml(lateral.label)}"><span class="stray-symbol" aria-hidden="true"><i></i><i></i><i></i></span><span class="stray-copy"><small>STRAY</small><strong>through ${escapeHtml(lateral.label)}</strong><em>${escapeHtml(kind)} · ${escapeHtml(assertion)}</em></span><span class="stray-arrow" aria-hidden="true">→</span></button>`;
}

const BOOK_PAGE_COUNT = 212;
// The source PDF begins with a few blank publication leaves. READ begins at
// the printed table of contents, while the previous controls still expose the
// complete scanned sequence.
const BOOK_READ_START_PAGE = 5;
const SVG_NS = "http://www.w3.org/2000/svg";
const BOOK_ENTRY_QUOTE_IDS = Object.freeze([
  "quote:001-a-hypercity-is-a-real-city-overlaid-with-thick-infor", "quote:002-hyper-adds-to-extends-and-proliferates-many-tex", "quote:003-to-address-the-first-question-the-book-brings-toget", "quote:006-as-the-book-progresses-the-long-form-narratives-bre", "quote:009-the-book-also-features-contributions-written-and-des",
  "quote:011-every-story-matters-every-voice-can-be-heard-every", "quote:012-imagine-a-search-and-discovery-tool-for-this-web-in", "quote:010-in-this-respect-hypercities-are-much-larger-than-tw", "quote:154-mapping-is-not-a-one-time-thing-and-maps-are-not-st", "quote:014-thick-maps-are-sometimes-called-deep-maps-because-t", "quote:013-thick-maps-are-not-simply-more-data-on-maps-but-in", "quote:016-this-is-why-hypercities-is-not-primarily-a-technolog",
  "quote:019-in-other-words-maybe-the-past-is-always-there-quiet", "quote:155-as-the-flaneur-walked-along-the-streets-he-was-cond", "quote:018-i-wonder-what-would-it-mean-to-drive-downward-into", "quote:024-that-s-because-all-of-these-pasts-co-exist-in-vario", "quote:029-but-rather-than-taking-chronology-as-the-sole-organi", "quote:030-through-the-google-maps-and-earth-apis-hypercities",
  "quote:036-the-project-began-with-the-protests-in-tahrir-square", "quote:038-this-shifted-the-problem-of-preservation-from-one-of", "quote:044-instead-they-offer-various-optics-for-seeing-remem", "quote:048-thick-mapping-begins-to-look-like-an-ever-expanding", "quote:156-the-historian-who-maps-the-past-makes-these-ghosts-v", "quote:090-as-much-as-thick-mapping-is-interested-in-denatural", "quote:093-google-maps-makes-choices-about-what-counts-for-accu", "quote:096-from-its-inception-the-dynamic-hypercities-platform", "quote:099-looking-forward-it-is-not-enough-to-fly-from-paragr",
  "quote:105-many-are-very-hard-to-watch-as-they-are-maps-of-eve", "quote:112-these-archives-are-not-simply-documents-of-the-past", "quote:159-the-event-has-no-end-time", "quote:119-events-are-ever-thicker-networks-of-events-no-matte", "quote:123-the-database-of-tweets-thus-represents-a-geographica", "quote:126-in-every-case-the-archive-is-less-than-the-event-a", "quote:130-it-is-no-longer-a-question-of-whether-or-not-social", "quote:132-at-the-same-time-the-team-used-the-perspectives-and", "quote:137-living-abroad-gave-me-the-opportunity-to-analyze-the", "quote:139-the-memories-of-the-past-from-so-many-distant-locati", "quote:145-the-openness-of-the-data-remains-an-important-long", "quote:153-the-event-has-many-lives-and-afterlives-through-haun", "quote:160-the-event-remains"
]);

function randomBetween(min, max) { return min + Math.random() * (max - min); }
function sourceQuoteText(text) {
  // The extraction occasionally closes a word onto an opening or closing curly
  // quote. Restore that missing typographic whitespace without changing words.
  return String(text).replace(/([\p{L}\p{N}])“/gu, "$1 “").replace(/”([\p{L}\p{N}])/gu, "” $1");
}

function meanderingPath(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const perpendicular = { x: -dy / length, y: dx / length };
  const points = [start];
  const firstTurn = Math.random() > 0.5 ? 1 : -1;
  for (const [index, progress] of [0.16, 0.36, 0.58, 0.78, 0.9].entries()) {
    // The map gives each route its direction; chance only perturbs the walk.
    const turn = index % 2 === 0 ? firstTurn : -firstTurn;
    const deviation = turn * randomBetween(0.38, 1) * Math.min(128, length * 0.24);
    points.push({
      x: start.x + dx * progress + perpendicular.x * deviation,
      y: start.y + dy * progress + perpendicular.y * deviation
    });
  }
  points.push(end);
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const previous = points[index - 1];
    if (index === points.length - 1) return `${path} Q ${previous.x.toFixed(1)} ${previous.y.toFixed(1)} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    const midpoint = { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 };
    return `${path} Q ${previous.x.toFixed(1)} ${previous.y.toFixed(1)} ${midpoint.x.toFixed(1)} ${midpoint.y.toFixed(1)}`;
  }, "");
}

export class Interface {
  constructor(actions) {
    this.actions = actions;
    this.depth = document.querySelector("#depth-indicator");
    this.bookEntry = document.querySelector("#book-entry");
    this.bookEntryDismiss = document.querySelector("#book-entry-dismiss");
    this.bookEntryCopy = document.querySelector(".book-entry-copy");
    this.bookEntryQuote = document.querySelector("#book-entry-quote");
    this.bookEntryRead = document.querySelector("#book-entry-read");
    this.fieldPrompt = document.querySelector("#field-prompt");
    this.fieldEncounter = document.querySelector("#field-encounter");
    this.encounter = document.querySelector("#encounter");
    this.encounterContent = document.querySelector("#encounter-content");
    this.takePrompt = document.querySelector("#take-prompt");
    this.takeMap = document.querySelector("#take-map-window");
    this.takeMapContent = document.querySelector("#take-map-window-content");
    this.takeMapReturnOnClose = false;
    this.journey = document.querySelector("#journey");
    this.journeyContent = document.querySelector("#journey-content");
    this.journeyToggle = document.querySelector("#journey-toggle");
    this.touchNavigation = document.querySelector("#touch-navigation");
    this.touchState = null;
    this.help = document.querySelector("#help-dialog");
    this.index = document.querySelector("#site-index");
    this.indexToggle = document.querySelector("#index-toggle");
    this.indexDrift = document.querySelector("#index-drift");
    this.surface = document.querySelector("#surface");
    this.window = document.querySelector("#hyperbook-window");
    this.windowContent = document.querySelector("#hyperbook-window-content");
    this.bookReader = null;
    this.bookEntryQuotes = openingQuotes;
    this.currentBookEntryQuote = null;
    this.renderBookEntryQuote();
    this.bookEntryDismiss.addEventListener("click", () => this.dismissBookEntry());
    this.bookEntryRead.addEventListener("click", () => this.openBookEntryQuote());
    document.querySelector("#help-toggle").addEventListener("click", () => this.help.showModal());
    document.querySelector("#help-close").addEventListener("click", () => this.help.close());
    this.indexToggle.addEventListener("click", () => {
      // Some embedded browsers replay the opener's click when a fullscreen
      // layer takes focus. Keep that replay from immediately closing Explore.
      const now = performance.now();
      const previous = Number(this.indexToggle.dataset.lastToggleAt || 0);
      if (now - previous < 300) return;
      this.indexToggle.dataset.lastToggleAt = String(now);
      this.toggleIndex();
    });
    document.querySelector("#index-close").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeIndexAfterPointer();
    });
    this.index.querySelector("[data-index-field]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeIndexAfterPointer(() => this.actions.surface());
    });
    this.index.querySelector("[data-index-take]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeIndexAfterPointer(() => this.actions.take());
    });
    this.index.querySelector("[data-index-read]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeIndexAfterPointer(() => this.actions.read());
    });
    document.querySelector("#hyperbook-window-close").addEventListener("click", () => this.window.close());
    document.querySelector("#take-map-window-close").addEventListener("click", () => this.closeTakeMap(true));
    // Native dialogs already close on Escape. Treat a click on the backdrop as
    // the same gentle return to the dérive, while preserving clicks inside the
    // page itself for selection, scrolling, and inspection.
    this.window.addEventListener("click", (event) => {
      if (event.target !== this.window) return;
      const bounds = this.window.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) this.window.close();
    });
    this.window.addEventListener("close", () => {
      this.window.classList.remove("is-book-page");
      this.window.classList.remove("is-book-spread");
      this.bookReader = null;
    });
    this.takeMap.addEventListener("cancel", () => { this.takeMapReturnOnClose = true; });
    this.takeMap.addEventListener("click", (event) => {
      if (event.target !== this.takeMap) return;
      const bounds = this.takeMap.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) this.closeTakeMap(true);
    });
    this.takeMap.addEventListener("close", () => {
      const resume = this.takeMapReturnOnClose;
      this.takeMapReturnOnClose = false;
      this.takeMapContent.replaceChildren();
      if (resume) this.actions.resumeTake();
    });
    document.addEventListener("keydown", (event) => {
      if (!this.bookEntry.hidden) {
        if (["Enter", " ", "Escape"].includes(event.key)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.dismissBookEntry();
        }
        return;
      }
      if (!this.index.hidden) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.closeIndex();
        }
        return;
      }
      if (!this.window.open || !this.bookReader) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.turnBookPage(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        this.turnBookPage(1);
      }
    });
    this.surface.addEventListener("click", () => this.actions.surface());
    this.journeyToggle.addEventListener("click", () => {
      const open = this.journeyContent.hidden;
      this.journeyContent.hidden = !open;
      this.journeyToggle.setAttribute("aria-expanded", String(open));
    });
    this.touchNavigation.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-touch-move]");
      if (!button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      const move = button.dataset.touchMove;
      if (move === "newer") this.actions.time("newer");
      if (move === "older") this.actions.time("older");
      if (move === "stray" && this.touchState?.lateral) this.actions.stray(this.touchState.lateral.id);
      if (move === "back") this.actions.back();
    });
    window.addEventListener("resize", () => {
      if (this.window.open && this.bookReader) {
        const shouldSpread = this.shouldUseBookSpread();
        if (shouldSpread !== this.bookReader.isSpread) this.renderBookPage();
      }
      this.renderTouchNavigation();
    });
  }

  bookEntryIsVisible() {
    return !this.bookEntry.hidden;
  }

  setBookEntryQuotes(data) {
    const quotes = BOOK_ENTRY_QUOTE_IDS
      .map((id) => data.objects.get(id))
      .filter((quote) => quote?.kind === "quotation" && quote.provenance?.printedPages?.[0])
      .map((quote) => ({
        id: quote.id,
        page: quote.provenance.printedPages[0],
        text: sourceQuoteText(quote.text),
        pageLocation: data.bookPageLocations?.[quote.id] || null
      }));
    if (!quotes.length) return;
    this.bookEntryQuotes = quotes;
    this.renderBookEntryQuote(this.currentBookEntryQuote?.id);
  }

  renderBookEntryQuote(avoidId = null) {
    let previousId = null;
    try { previousId = sessionStorage.getItem("hypercities-book-entry-quote"); } catch { /* file origins may deny storage */ }
    const choices = this.bookEntryQuotes.filter((quote) => quote.id !== previousId && quote.id !== avoidId);
    const quote = choices[Math.floor(Math.random() * choices.length)] || this.bookEntryQuotes[0];
    try { sessionStorage.setItem("hypercities-book-entry-quote", quote.id); } catch { /* the current quotation is still usable */ }
    this.currentBookEntryQuote = quote;
    this.bookEntryCopy.dataset.sourceQuote = quote.id;
    this.bookEntryQuote.textContent = `“${sourceQuoteText(quote.text)}”`;
    this.bookEntryRead.innerHTML = `${quote.page} <span aria-hidden="true">↗</span>`;
    this.bookEntryRead.setAttribute("aria-label", `Open page ${quote.page} in READ`);
  }

  openBookEntryQuote() {
    const quote = this.currentBookEntryQuote;
    if (!quote) return;
    this.openRead(quote.page, { id: quote.id, page: quote.page, pageImage: true, pageLocation: quote.pageLocation });
  }

  dismissBookEntry() {
    if (this.bookEntry.hidden || this.bookEntry.classList.contains("is-dismissing")) return;
    this.bookEntry.classList.add("is-dismissing");
    this.bookEntryDismiss.tabIndex = -1;
    // Keep the quotation in the document until its fade completes, then make
    // the map the only active surface again. A first click opens the field;
    // it does not silently turn into a core at an accidental coordinate.
    window.setTimeout(() => {
      this.bookEntry.hidden = true;
      this.bookEntry.setAttribute("aria-hidden", "true");
    }, 720);
  }

  toggleIndex() {
    // Explore is an opener, not a toggle: its own close mark and Escape are
    // the stable ways back. This also makes an opener-click replay harmless.
    if (!this.index.hidden) return;
    // The map-return action belongs to the TimeWell state underneath. Hide it
    // while the Explore overlay is open so the two layers never compete.
    if (!("restoreSurface" in this.index.dataset)) {
      this.index.dataset.restoreSurface = String(!this.surface.hidden);
    }
    this.surface.hidden = true;
    this.index.hidden = false;
    document.body.classList.add("explore-open");
    this.indexToggle.setAttribute("aria-expanded", "true");
    this.drawIndexDrift();
    this.index.focus({ preventScroll: true });
  }

  closeIndex() {
    if (this.index.hidden) return;
    this.index.hidden = true;
    document.body.classList.remove("explore-open");
    this.indexToggle.setAttribute("aria-expanded", "false");
    this.indexDrift.replaceChildren();
    this.surface.hidden = this.index.dataset.restoreSurface !== "true";
    delete this.index.dataset.restoreSurface;
    this.indexToggle.focus({ preventScroll: true });
  }

  closeIndexAfterPointer(then = null) {
    // Keep the full-screen layer present until the pointer sequence ends;
    // otherwise a close click can land on the map beneath it.
    setTimeout(() => {
      this.closeIndex();
      then?.();
    }, 220);
  }

  drawIndexDrift() {
    const field = this.index.querySelector("[data-index-field]");
    const destinations = [...this.index.querySelectorAll(".index-route--future")];
    if (!field || !destinations.length) return;
    const from = field.getBoundingClientRect();
    const target = destinations[Math.floor(Math.random() * destinations.length)].getBoundingClientRect();
    const start = { x: from.right + 20, y: from.top + from.height * randomBetween(0.25, 0.75) };
    const end = { x: target.left - 12, y: target.top + target.height * randomBetween(0.26, 0.72) };
    this.indexDrift.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
    this.indexDrift.replaceChildren();
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", meanderingPath(start, end));
    const arrival = document.createElementNS(SVG_NS, "circle");
    arrival.setAttribute("cx", end.x.toFixed(1));
    arrival.setAttribute("cy", end.y.toFixed(1));
    arrival.setAttribute("r", "2.4");
    this.indexDrift.append(path, arrival);
  }

  showDepth() { this.depth.hidden = true; }

  field() {
    this.depth.hidden = true;
    this.surface.hidden = true;
    this.fieldPrompt.hidden = true;
    this.encounter.hidden = true;
    this.journey.hidden = true;
    this.clearFieldEncounter();
    this.takePrompt.hidden = true;
    this.touchState = null;
    this.touchNavigation.hidden = true;
    this.closeTakeMap(false);
  }

  lockedCore() {
    this.depth.hidden = true;
    this.surface.hidden = false;
    this.fieldPrompt.hidden = true;
    this.encounter.hidden = true;
    this.journey.hidden = true;
    this.clearFieldEncounter();
    this.takePrompt.hidden = true;
    this.touchNavigation.hidden = true;
    this.closeTakeMap(false);
  }

  beginTakeMap(map) {
    this.closeTakeMap(false);
    this.takePrompt.hidden = Boolean(map);
  }

  clearTakeMap() {
    this.takePrompt.hidden = true;
    this.closeTakeMap(false);
  }

  openTakeMap(map) {
    const source = map.original?.sourceRecord || {};
    const years = map.endYear === map.year ? map.year : `${map.year}–${map.endYear}`;
    const collection = source.collectionSource || "Collection not recorded";
    const creator = source.creator ? `${source.creator}. ` : "";
    const rights = source.copyright
      ? `Recorded rights statement: ${source.copyright}`
      : "No rights statement is recorded here. The original raster remains with its source.";
    const template = tileTemplate(map);
    const qgis = template
      ? `<p class="take-platform-kicker">Desktop map / QGIS</p><h2>Open this raster in QGIS</h2><ol><li>Open the <strong>Browser</strong> panel. Right-click <strong>XYZ Tiles</strong> and choose <strong>New Connection…</strong>.</li><li>Name it after this map and paste the template below as the URL.</li><li>Double-click the new connection to add it to the project.</li></ol><code>${escapeHtml(template)}</code><p class="take-platform-note">If the layer does not draw, the external source has not accepted the connection. The original source's access terms still apply.</p>`
      : `<p class="take-platform-kicker">Desktop map / QGIS</p><h2>No tile connection recorded</h2><p>This map can still be located through its citation, but this record has no URL that QGIS can open as a raster layer.</p>`;
    const previewUrl = `./take-map-preview.html?map=${encodeURIComponent(map.id)}`;
    const snippet = mapLibreSnippetFor(map);
    const networkKmlUrl = hostedNetworkKmlUrlFor(map);
    const kmlPanel = `<section class="take-tab-panel take-platform" id="take-panel-kml" role="tabpanel" aria-labelledby="take-tab-kml" data-take-tab-panel="kml" hidden>
      <p class="take-platform-kicker">KML / Google Earth</p>
      <h2>Keep a live link to this map in Google Earth</h2>
      <ol class="take-network-steps">
        <li>Download the KML and open it with <strong>File → Open…</strong> in Google Earth Pro.</li>
        <li>Or choose <strong>Add → Network Link…</strong>, give it a name, paste this link, and select <strong>OK</strong>.</li>
      </ol>
      <div class="take-network-url"><code>${escapeHtml(networkKmlUrl)}</code><button class="take-code-copy" type="button" data-copy-network-link>Copy link</button></div>
      <button class="take-download" type="button" data-map-export="kml"><span>DOWNLOAD NETWORK-LINK KML</span><span>.kml ↓</span></button>
      <p class="take-platform-note">The download draws the recorded historical raster as a geographic overview and keeps a live link to the hosted HyperCities record, refreshed hourly. Use the MapLibre or QGIS routes for full-resolution interactive tiles.</p>
    </section>`;
    this.takePrompt.hidden = true;
    this.encounter.hidden = true;
    this.takeMapContent.innerHTML = `<div class="take-map-sticky"><header class="take-map-header"><p class="window-kind">Take a map · map ${escapeHtml(map.sourceId)}</p><h1>${escapeHtml(map.title)}</h1><p>${escapeHtml(map.city)} · ${escapeHtml(years)}</p><p class="take-map-source">${escapeHtml(creator)}${escapeHtml(collection)}</p></header><nav class="take-map-tabs" role="tablist" aria-label="Ways to take this map"><button type="button" role="tab" id="take-tab-web" aria-selected="true" aria-controls="take-panel-web" data-take-tab="web">MapLibre</button><button type="button" role="tab" id="take-tab-kml" aria-selected="false" aria-controls="take-panel-kml" data-take-tab="kml">KML / Google Earth</button><button type="button" role="tab" id="take-tab-qgis" aria-selected="false" aria-controls="take-panel-qgis" data-take-tab="qgis">QGIS</button></nav></div><section class="take-tab-panel take-web-map" id="take-panel-web" role="tabpanel" aria-labelledby="take-tab-web" data-take-tab-panel="web"><p class="take-platform-kicker">Live web map / MapLibre</p><h2>Carry the original tile connection into a small web map</h2><iframe title="Live MapLibre map: ${escapeHtml(map.title)}" src="${escapeHtml(previewUrl)}"></iframe><p class="take-platform-note">This is a live MapLibre map: pan and zoom inside it. It uses the same recorded tile connection as HyperCities; an external source may still decline to load in a browser.</p><details class="take-code" open><summary>Complete MapLibre page</summary><div class="take-code-intro"><p>Copy this complete HTML page. It includes the document, head, body, MapLibre setup, bounds, zoom range, citation, and this map's source URL.</p><button class="take-code-copy" type="button" data-copy-map-code>Copy code</button></div><pre><code>${escapeHtml(snippet)}</code></pre></details></section>${kmlPanel}<section class="take-tab-panel take-platform" id="take-panel-qgis" role="tabpanel" aria-labelledby="take-tab-qgis" data-take-tab-panel="qgis" hidden>${qgis}</section><section class="take-source-note"><p class="take-platform-kicker">Source condition</p><p>${escapeHtml(rights)}</p></section>`;
    this.takeMapContent.querySelectorAll("[data-map-export]").forEach((button) => button.addEventListener("click", () => this.actions.exportMap(button.dataset.mapExport)));
    this.takeMapContent.querySelectorAll("[data-take-tab]").forEach((button) => button.addEventListener("click", () => this.activateTakeMapTab(button.dataset.takeTab)));
    this.takeMapContent.querySelector("[data-copy-map-code]")?.addEventListener("click", (event) => this.copyTakeMapCode(snippet, event.currentTarget));
    this.takeMapContent.querySelector("[data-copy-network-link]")?.addEventListener("click", (event) => this.copyTakeMapCode(networkKmlUrl, event.currentTarget));
    this.takeMapReturnOnClose = true;
    this.takeMap.showModal();
    this.takeMap.scrollTop = 0;
  }

  activateTakeMapTab(tab) {
    this.takeMapContent.querySelectorAll("[data-take-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.takeTab === tab));
    });
    this.takeMapContent.querySelectorAll("[data-take-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.takeTabPanel !== tab;
    });
  }

  async copyTakeMapCode(code, button) {
    const originalLabel = button.textContent;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = code;
      fallback.setAttribute("readonly", "");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.append(fallback);
      fallback.select();
      const copied = document.execCommand("copy");
      fallback.remove();
      if (!copied) return;
    }
    button.textContent = "Copied";
    setTimeout(() => {
      if (document.body.contains(button)) button.textContent = originalLabel;
    }, 1500);
  }

  closeTakeMap(resume = false) {
    if (!this.takeMap.open) return;
    this.takeMapReturnOnClose = resume;
    this.takeMap.close();
  }

  showFieldEncounter(fragment, point) {
    if (!fragment) { this.clearFieldEncounter(); return; }
    const left = Math.max(30, Math.min(window.innerWidth - 350, point.x + 34));
    const top = Math.max(76, Math.min(window.innerHeight - 160, point.y - 56));
    this.fieldEncounter.hidden = false;
    this.fieldEncounter.style.left = `${left}px`;
    this.fieldEncounter.style.top = `${top}px`;
    // Before a core is locked this is a passing voice in the field, never a
    // control that can steal the click/tap needed to excavate that place.
    const content = fragment.kind === "quotation"
      ? `<p class="field-fragment-quote">“${escapeHtml(fragment.text)}”</p>`
      : `<p class="field-fragment-name">${escapeHtml(fragment.text)}</p>`;
    this.fieldEncounter.innerHTML = `${content}<p>${escapeHtml(fragment.arrival?.label || fragment.source)}</p>`;
  }

  clearFieldEncounter() {
    this.fieldEncounter.hidden = true;
    this.fieldEncounter.replaceChildren();
  }

  renderCore({ map, coreMaps, encounter, tile, lateral, drift }) {
    this.depth.hidden = true;
    this.fieldPrompt.hidden = true;
    this.touchState = { map, coreMaps, lateral };
    this.renderTouchNavigation();
    this.encounter.hidden = !encounter;
    if (!encounter) return;
    const fragment = encounter.fragment || encounter.quote || null;
    const title = fragment && fragment.kind !== "quotation"
      ? `<button class="fragment-name" type="button" data-aperture="${escapeHtml(fragment.apertureId)}" aria-label="Open the cited book page for ${escapeHtml(fragment.text)}"><span>${escapeHtml(fragment.text)}</span><span class="quote-aperture" aria-hidden="true">read ↗</span></button>`
      : encounter.title && !fragment ? `<button class="fragment-name" type="button" data-aperture="${escapeHtml(encounter.id)}" aria-label="Open the cited book page for ${escapeHtml(encounter.title)}"><span>${escapeHtml(encounter.title)}</span><span class="quote-aperture" aria-hidden="true">read ↗</span></button>` : "";
    const quote = fragment?.kind === "quotation" ? `<button class="fragment-quote" type="button" data-aperture="${escapeHtml(fragment.apertureId)}" aria-label="Open the cited book page for this quotation"><span class="quote-text">“${escapeHtml(fragment.text)}”</span><span class="quote-aperture" aria-hidden="true">read ↗</span></button>` : "";
    // The offer shown here is exactly the one accepted by keyboard/touch
    // STRAY. No movement should depend on an invisible alternative link.
    const offer = !drift ? strayCopy(lateral) : "";
    const driftOffer = drift ? `<button class="stray-path drift-path" type="button" data-drift="${escapeHtml(drift.map.id)}"><span class="stray-symbol" aria-hidden="true"><i></i><i></i><i></i></span><span class="stray-copy"><small>DRIFT</small><strong>elsewhere, ${escapeHtml(drift.map.year)}</strong><em>temporal juxtaposition · editorial</em></span><span class="stray-arrow" aria-hidden="true">→</span></button>` : "";
    // This is an archival action on the selected object, not another direction
    // in the dérive. It stays with the map identity rather than competing with
    // the book movement and the visitor's trace.
    const takeOffer = `<button class="take-map-quiet" type="button" data-take-map><i aria-hidden="true"></i><span>take map</span></button>`;
    this.surface.hidden = false;
    const arrival = fragment?.arrival?.label || "a thread in the book";
    this.encounterContent.innerHTML = `<div class="encounter-flow"><section class="encounter-stage map-stage"><p class="stage-kicker">selected map</p><p class="map-marker">${escapeHtml(map.city)} · ${map.year}</p><div class="map-title-row"><h2>${escapeHtml(map.title)}</h2>${takeOffer}</div>${mapRecord(map)}</section><section class="encounter-stage book-stage"><p class="stage-kicker">the book enters <span>${escapeHtml(arrival)}</span></p>${title || quote}</section>${driftOffer || offer ? `<section class="encounter-stage stray-stage">${driftOffer || offer}</section>` : ""}</div>`;
    this.bindTraversal(this.encounterContent);
  }

  renderTouchNavigation() {
    const { map, coreMaps, lateral } = this.touchState || {};
    const isTouchLayout = window.matchMedia("(max-width: 780px)").matches;
    if (!isTouchLayout || !map || !coreMaps?.length) {
      this.touchNavigation.hidden = true;
      return;
    }
    const index = coreMaps.findIndex((candidate) => candidate.id === map.id);
    const newer = coreMaps[index + 1] || null;
    const older = coreMaps[index - 1] || null;
    const laterButton = this.touchNavigation.querySelector('[data-touch-move="newer"]');
    const earlierButton = this.touchNavigation.querySelector('[data-touch-move="older"]');
    const strayButton = this.touchNavigation.querySelector('[data-touch-move="stray"]');
    laterButton.disabled = !newer;
    laterButton.setAttribute("aria-label", newer ? `Move to later map, ${newer.year}` : "No later map in this TimeWell");
    earlierButton.disabled = !older;
    earlierButton.setAttribute("aria-label", older ? `Move to earlier map, ${older.year}` : "No earlier map in this TimeWell");
    strayButton.hidden = !lateral;
    if (lateral) strayButton.setAttribute("aria-label", `Stray toward ${lateral.label}`);
    this.touchNavigation.hidden = false;
  }

  bindTraversal(element) {
    element.querySelectorAll("[data-node]").forEach((button) => button.addEventListener("click", () => this.actions.node(button.dataset.node)));
    element.querySelectorAll("[data-aperture]").forEach((button) => button.addEventListener("click", () => this.actions.aperture(button.dataset.aperture)));
    element.querySelectorAll("[data-drift]").forEach((button) => button.addEventListener("click", () => this.actions.drift(button.dataset.drift)));
    element.querySelectorAll("[data-take-map]").forEach((button) => button.addEventListener("click", () => this.actions.takeSelected()));
  }

  openAperture(aperture) {
    if (!aperture) return;
    const figure = aperture.figure ? `<p class="window-figure"><span>Figure</span>${escapeHtml(aperture.figure.title)}${aperture.figure.caption ? `<small>${escapeHtml(aperture.figure.caption)}</small>` : ""}</p>` : "";
    const bookPage = Boolean(aperture.pageImage);
    if (bookPage) {
      // An encounter is a citation into READ, never a separate modal mode.
      // Quote locators are only shown on the exact source page.
      this.openRead(aperture.page, aperture);
    } else {
      this.window.classList.remove("is-book-page");
      this.window.classList.remove("is-book-spread");
      this.bookReader = null;
      this.windowContent.innerHTML = `<p class="window-kind">${escapeHtml(aperture.kind)}</p><h1>${escapeHtml(aperture.title)}</h1>${aperture.quote ? `<blockquote>“${escapeHtml(aperture.quote)}”</blockquote>` : ""}<p class="window-source">${escapeHtml(aperture.source || "HyperCities")}</p>${figure}${sourceDetails(aperture.provenance, null, null)}`;
      if (!this.window.open) this.window.showModal();
    }
  }

  openRead(page = BOOK_READ_START_PAGE, aperture = null) {
    const startingPage = Math.max(1, Math.min(BOOK_PAGE_COUNT, Number(page) || BOOK_READ_START_PAGE));
    this.window.classList.add("is-book-page");
    this.bookReader = { aperture, page: startingPage };
    this.renderBookPage();
    if (!this.window.open) this.window.showModal();
  }

  shouldUseBookSpread() {
    return window.matchMedia("(min-width: 920px)").matches;
  }

  bookSpreadPages(page, isSpread) {
    if (!isSpread || page === 1) return [page];
    const first = page % 2 === 0 ? page : page - 1;
    return [first, first + 1].filter((item) => item <= BOOK_PAGE_COUNT);
  }

  bookPageFrame(page, aperture) {
    // A quotation only receives an overlay on its own source page. Its facing
    // page remains an uninterrupted facsimile.
    const rect = aperture && page === aperture.page ? aperture.pageLocation?.rect : null;
    const highlight = rect
      ? `<span class="book-page-highlight" aria-label="The selected quotation on this page" style="--highlight-left:${rect.left * 100}%;--highlight-top:${rect.top * 100}%;--highlight-width:${rect.width * 100}%;--highlight-height:${rect.height * 100}%"></span>`
      : "";
    const image = `./assets/book-pages/page-${String(page).padStart(3, "0")}.webp`;
    return `<div class="book-page-frame"><img src="${image}" alt="Scanned book page ${escapeHtml(page)} of ${BOOK_PAGE_COUNT} from HyperCities: Thick Mapping in the Digital Humanities">${highlight}</div>`;
  }

  renderBookPage() {
    const reader = this.bookReader;
    if (!reader) return;
    const { aperture, page } = reader;
    const isSpread = this.shouldUseBookSpread();
    const spreadPages = this.bookSpreadPages(page, isSpread);
    const [firstPage, lastPage] = [spreadPages[0], spreadPages.at(-1)];
    const pageLabel = firstPage === lastPage ? String(firstPage) : `${firstPage}–${lastPage}`;
    const previousDisabled = firstPage === 1 ? " disabled" : "";
    const nextDisabled = lastPage === BOOK_PAGE_COUNT ? " disabled" : "";
    reader.isSpread = isSpread;
    this.window.classList.toggle("is-book-spread", isSpread);
    this.windowContent.innerHTML = `<section class="book-page-viewer${isSpread ? " is-spread" : ""}" aria-label="HyperCities book ${isSpread ? "pages" : "page"} ${escapeHtml(pageLabel)} of ${BOOK_PAGE_COUNT}"><div class="book-page-spread">${spreadPages.map((item) => this.bookPageFrame(item, aperture)).join("")}</div><nav class="book-page-controls" aria-label="Turn book ${isSpread ? "spreads" : "pages"}"><button class="book-page-turn" type="button" data-book-page="-1" aria-label="Previous ${isSpread ? "spread" : "page"}"${previousDisabled}><span aria-hidden="true">←</span><small>PREV</small></button><p aria-live="polite">${escapeHtml(pageLabel)} <span>/</span> ${BOOK_PAGE_COUNT}</p><button class="book-page-turn book-page-turn--next" type="button" data-book-page="1" aria-label="Next ${isSpread ? "spread" : "page"}"${nextDisabled}><small>NEXT</small><span aria-hidden="true">→</span></button></nav></section>`;
    this.windowContent.querySelectorAll("[data-book-page]").forEach((button) => {
      button.addEventListener("click", () => this.turnBookPage(Number(button.dataset.bookPage)));
    });
  }

  turnBookPage(direction) {
    const reader = this.bookReader;
    if (!reader) return;
    const nextPage = Math.max(1, Math.min(BOOK_PAGE_COUNT, reader.page + direction * (reader.isSpread ? 2 : 1)));
    if (nextPage === reader.page) return;
    reader.page = nextPage;
    this.renderBookPage();
  }

  renderJourney(items) {
    this.journey.hidden = !items.length;
    // The trace is a residue to open when wanted, not a competing caption over
    // the map. New movements quietly update its count without reopening it.
    this.journeyContent.hidden = true;
    this.journeyToggle.setAttribute("aria-expanded", "false");
    this.journeyToggle.textContent = `TRACE · ${items.length}`;
    this.journeyToggle.setAttribute("aria-label", `Trace of ${items.length} encounters; newest first`);
    // Newest first: this is a residue of attention, not a numbered itinerary.
    // Earlier encounters recede without making the trace hard to read.
    const newestFirst = [...items].reverse();
    this.journeyContent.innerHTML = `<div class="journey-wander" aria-label="A dérive trace, newest encounter first">${newestFirst.map((item, index) => {
      const age = Math.min(index, 5);
      return `<span class="journey-item journey-item--age-${age}"><i aria-hidden="true"></i><span>${escapeHtml(item.label)}</span></span>`;
    }).join("")}</div>`;
  }
}
