import { tileTemplate } from "./data.js";
import { hostedNetworkKmlUrlFor, mapLibreSnippetFor } from "./take-map.js";
import { openingQuotes, openingQuoteGroups } from "./opening-quotes.js";
import { Origins } from "./origins.js?v=origins-2";
import { Windows } from "./windows.js";

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

function annotationCopy(annotations = [], visible, placing, simulated = false) {
  const count = annotations.length;
  const toggle = count
    ? `<button class="annotation-summary" type="button" role="switch" data-annotations-toggle aria-checked="${visible ? "true" : "false"}" aria-label="Show map notes"><i aria-hidden="true"></i><span>NOTES <small>${count}</small></span><em>${visible ? "ON" : "OFF"}</em></button>`
    : "";
  const open = count ? `<button class="annotation-open" type="button" data-annotations-open>READ NOTES ↗</button>` : "";
  const place = `<button class="annotation-switch${placing ? " is-active" : ""}" type="button" role="switch" data-annotation-place aria-checked="${placing ? "true" : "false"}"${simulated ? ' disabled title="Leave the simulation to add a real note"' : ""}><i class="note-glyph" aria-hidden="true"><b></b><b></b><b></b></i><span>${placing ? "PLACING A NOTE" : "ADD A NOTE"}</span><em aria-hidden="true">${simulated ? "SIMULATION" : placing ? "ON" : "OFF"}</em></button>`;
  const instruction = placing ? `<p class="annotation-mode-prompt">Choose a point on this map to leave a note.</p>` : "";
  return { place, body: `${count ? `<div class="annotation-note-controls">${toggle}${open}</div>` : ""}${instruction}` };
}

const BOOK_PAGE_COUNT = 212;
// The source PDF begins with a few blank publication leaves. READ begins at
// the printed table of contents, while the previous controls still expose the
// complete scanned sequence.
const BOOK_READ_START_PAGE = 5;
const SVG_NS = "http://www.w3.org/2000/svg";

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
    this.origins = new Origins();
    this.windows = new Windows({ read: page => this.openRead(page) });
    this.depth = document.querySelector("#depth-indicator");
    this.bookEntry = document.querySelector("#book-entry");
    this.bookEntryDismiss = document.querySelector("#book-entry-dismiss");
    this.bookEntryCopy = document.querySelector(".book-entry-copy");
    this.bookEntryQuote = document.querySelector("#book-entry-quote");
    this.bookEntryRead = document.querySelector("#book-entry-read");
    this.bookEntryNext = document.querySelector("#book-entry-next");
    this.bookEntryEnter = document.querySelector("#book-entry-enter");
    this.fieldPrompt = document.querySelector("#field-prompt");
    this.fieldEncounter = document.querySelector("#field-encounter");
    this.encounter = document.querySelector("#encounter");
    this.encounterContent = document.querySelector("#encounter-content");
    this.annotationFloat = document.querySelector("#annotation-float");
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
    this.groundToggle = document.querySelector("#ground-toggle");
    this.groundControl = document.querySelector("#ground-control");
    this.groundButtons = [...this.groundControl.querySelectorAll("[data-basemap]")];
    this.historicalOpacity = document.querySelector("#historical-opacity");
    this.historicalOpacityValue = document.querySelector("#historical-opacity-value");
    this.satelliteCredit = document.querySelector("#satellite-credit");
    this.googleCredit = document.querySelector("#google-credit");
    this.groundState = { mode: "dark", opacity: 1, hasHistorical: false };
    this.window = document.querySelector("#hyperbook-window");
    this.windowContent = document.querySelector("#hyperbook-window-content");
    this.bookReader = null;
    this.bookEntryQuotes = openingQuotes;
    this.currentBookEntryQuote = null;
    this.renderBookEntryQuote();
    this.bookEntryDismiss.addEventListener("click", () => this.dismissBookEntry());
    this.bookEntryRead.addEventListener("click", () => this.openBookEntryQuote());
    this.bookEntryNext.addEventListener("click", () => this.renderBookEntryQuote(this.currentBookEntryQuote?.id));
    this.bookEntryEnter.addEventListener("click", () => this.dismissBookEntry());
    this.annotationFloat.addEventListener("click", (event) => {
      const button = event.target.closest("[data-note-action]");
      if (!button) return;
      const action = button.dataset.noteAction;
      if (action === "close") this.actions.closeAnnotation();
      if (action === "change") this.actions.changeAnnotationPoint();
      if (action === "previous") this.actions.annotationStep(-1);
      if (action === "next") this.actions.annotationStep(1);
    });
    this.annotationFloat.addEventListener("submit", async (event) => {
      if (!event.target.matches(".annotation-compose")) return;
      event.preventDefault();
      const form = event.target;
      const fields = new FormData(form);
      const values = {
        text: String(fields.get(form.querySelector("textarea").name) || ""),
        name: String(fields.get(form.querySelector('input[required]').name) || ""),
        tag: String(fields.get(form.querySelector('input[placeholder]').name) || "")
      };
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = "SENDING…";
      try {
        // A simple cross-origin form POST can be sent from a static site.
        // The opaque response cannot confirm publication; the Sheet poll does.
        await fetch(form.action, {
          method: "POST", mode: "no-cors", credentials: "omit",
          body: new URLSearchParams(fields)
        });
        this.actions.confirmAnnotation(values);
      } catch (error) {
        submit.disabled = false;
        submit.textContent = "PUBLISH NOTE";
        let status = form.querySelector(".annotation-submit-error");
        if (!status) {
          status = document.createElement("p");
          status.className = "annotation-compose-help annotation-submit-error";
          status.setAttribute("role", "alert");
          form.append(status);
        }
        status.textContent = "The note could not be sent. Please try again.";
        console.warn("Annotation submission failed.", error);
      }
    });
    this.groundToggle.addEventListener("click", () => this.toggleGround());
    this.groundButtons.forEach((button) => button.addEventListener("click", () => this.actions.basemap(button.dataset.basemap)));
    this.historicalOpacity.addEventListener("input", () => this.actions.rasterOpacity(Number(this.historicalOpacity.value) / 100));
    document.addEventListener("pointerdown", (event) => {
      if (this.groundControl.hidden || this.groundControl.contains(event.target) || this.groundToggle.contains(event.target)) return;
      this.closeGround();
    });
    document.querySelector("#help-toggle").addEventListener("click", () => this.help.showModal());
    document.querySelector("#help-close").addEventListener("click", () => this.help.close());
    this.indexToggle.addEventListener("click", () => {
      this.dismissBookEntry();
      this.hideShortcuts();
      this.toggleIndex();
    });
    this.exploreAccess = document.querySelector(".explore-access");
    this.shortcuts = document.querySelector(".explore-shortcuts");
    this.exploreAccess.addEventListener("pointerenter", event => {
      if (event.pointerType !== "mouse") return;
      clearTimeout(this.shortcutTimer);
      if (!this.index.hidden) return;
      this.shortcuts.inert = false;
      this.exploreAccess.classList.add("is-revealed");
    });
    this.exploreAccess.addEventListener("pointerleave", () => {
      this.shortcutTimer = setTimeout(() => {
        if (!this.shortcuts.contains(document.activeElement)) this.hideShortcuts();
      }, 240);
    });
    this.exploreAccess.addEventListener("focusout", event => {
      if (!this.exploreAccess.contains(event.relatedTarget)) this.hideShortcuts();
    });
    this.indexToggle.addEventListener("keydown", event => {
      if (event.key !== "ArrowRight") return;
      event.preventDefault();
      this.shortcuts.inert = false;
      this.exploreAccess.classList.add("is-revealed");
      this.shortcuts.querySelector("button").focus();
    });
    document.querySelector(".masthead").addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Escape") { this.hideShortcuts(); this.closeIndex(); this.closeGround(); }
    });
    this.shortcuts.addEventListener("click", event => {
      const route = event.target.closest("[data-shortcut]")?.dataset.shortcut;
      if (!route) return;
      this.dismissBookEntry();
      this.hideShortcuts();
      this.closeIndex();
      this.closeGround();
      if (route === "read") this.actions.read();
      if (route === "origins") this.origins.open(this.indexToggle);
      if (route === "windows") this.windows.open(this.indexToggle);
    });
    document.querySelector("#index-close").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeIndexAfterPointer();
    });
    this.index.querySelector("[data-index-read]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeIndexAfterPointer(() => this.actions.read());
    });
    document.querySelector("#hyperbook-window-close").addEventListener("click", () => this.window.close());
    this.index.querySelector("[data-index-windows]").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.closeIndexAfterPointer(() => {
        this.closeGround();
        this.windows.open(this.indexToggle);
      });
    });
    this.index.querySelector("[data-index-origins]").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeIndexAfterPointer(() => {
        this.closeGround();
        this.origins.open(this.indexToggle);
      });
    });
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
      if (this.origins.dialog.open || this.windows.dialog.open) return;
      if (!this.bookEntry.hidden && !this.window.open && !this.takeMap.open && !this.help.open && this.groundControl.hidden) {
        if (this.bookEntryCopy.contains(document.activeElement) && ["Enter", " "].includes(event.key)) return;
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
      if (!this.groundControl.hidden && event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.closeGround();
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

  toggleGround() {
    if (this.groundState.hasHistorical) {
      this.showGroundForMap();
      return;
    }
    if (this.groundControl.hidden) {
      this.groundControl.hidden = false;
      this.groundToggle.setAttribute("aria-expanded", "true");
      return;
    }
    this.closeGround();
  }

  closeGround(force = false) {
    if (this.groundState.hasHistorical && !force) return;
    this.groundControl.hidden = true;
    this.groundToggle.setAttribute("aria-expanded", "false");
  }

  showGroundForMap() {
    if (!this.groundState.hasHistorical) return;
    this.groundControl.hidden = false;
    this.groundToggle.setAttribute("aria-expanded", "true");
  }

  setGroundState(next = {}) {
    this.groundState = { ...this.groundState, ...next };
    const { mode, opacity, hasHistorical } = this.groundState;
    this.groundButtons.forEach((button) => {
      const selected = button.dataset.basemap === mode;
      button.setAttribute("aria-pressed", String(selected));
    });
    this.groundControl.dataset.mode = mode;
    this.historicalOpacity.value = String(Math.round(opacity * 100));
    this.historicalOpacity.disabled = !hasHistorical;
    this.historicalOpacityValue.textContent = hasHistorical ? `${Math.round(opacity * 100)}%` : "—";
    this.satelliteCredit.hidden = mode !== "satellite";
    this.googleCredit.hidden = mode !== "google";
  }

  setBookEntryQuotes(data) {
    const quoteByNumber = new Map([...data.objects.values()]
      .filter((object) => object.kind === "quotation")
      .map((quote) => [Number(quote.id.slice(6, 9)), quote]));
    const quotes = openingQuoteGroups
      .flatMap((group) => group.numbers.map((number) => quoteByNumber.get(number)))
      .filter((quote) => quote?.kind === "quotation" && quote.provenance?.printedPages?.[0])
      .map((quote) => ({
        id: quote.id,
        page: quote.provenance.printedPages[0],
        text: sourceQuoteText(quote.text),
        section: quote.provenance.sectionId,
        pageLocation: data.bookPageLocations?.[quote.id] || null
      }));
    if (!quotes.length) return;
    this.bookEntryQuotes = quotes;
    this.renderBookEntryQuote(this.currentBookEntryQuote?.id);
  }

  renderBookEntryQuote(avoidId = null) {
    let recent = [];
    try { recent = JSON.parse(sessionStorage.getItem("hypercities-book-entry-recent") || "[]"); } catch { /* file origins may deny storage */ }
    if (!Array.isArray(recent)) recent = [];
    const currentSection = this.currentBookEntryQuote?.section;
    const fresh = this.bookEntryQuotes.filter((quote) => !recent.includes(quote.id) && quote.id !== avoidId);
    const differentSection = fresh.filter((quote) => quote.section !== currentSection);
    const choices = differentSection.length ? differentSection : fresh.length ? fresh : this.bookEntryQuotes.filter((quote) => quote.id !== avoidId);
    // Give each part of the book an equal opening, even when one chapter has
    // many more quotable passages than a Window or the Tohoku gallery.
    const sections = [...new Set(choices.map((candidate) => candidate.section))];
    const section = sections[Math.floor(Math.random() * sections.length)];
    const inSection = choices.filter((candidate) => candidate.section === section);
    const quote = inSection[Math.floor(Math.random() * inSection.length)] || this.bookEntryQuotes[0];
    try { sessionStorage.setItem("hypercities-book-entry-recent", JSON.stringify([...recent, quote.id].slice(-12))); } catch { /* the current quotation is still usable */ }
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

  hideShortcuts() {
    clearTimeout(this.shortcutTimer);
    if (!this.shortcuts) return;
    this.exploreAccess.classList.remove("is-revealed");
    this.shortcuts.inert = true;
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
    const field = this.index.querySelector("[data-index-read]");
    const destinations = [...this.index.querySelectorAll(".index-route:not(.index-route--read)")];
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

  positionAnnotationFloat(point) {
    if (!point || this.annotationFloat.hidden) return;
    if (window.matchMedia("(max-width: 780px)").matches) {
      Object.assign(this.annotationFloat.style, { left: "16px", top: "auto", bottom: "74px" });
      return;
    }
    const width = Math.min(340, window.innerWidth - 36);
    const left = Math.max(18, Math.min(point.x + 24, window.innerWidth - width - 18));
    const besidePoint = point.y > window.innerHeight * .42 ? point.y - 210 : point.y + 22;
    const composing = this.annotationFloat.classList.contains("is-composing");
    const availableHeight = Math.min(composing ? 560 : 430, window.innerHeight - 100);
    const top = Math.max(70, Math.min(besidePoint, window.innerHeight - availableHeight - 20));
    Object.assign(this.annotationFloat.style, { left: `${left}px`, top: `${top}px`, bottom: "auto" });
  }

  showAnnotationNote({ annotation, index, count, point, map }) {
    this.annotationFloat.classList.remove("is-composing");
    const tags = (annotation.tags || (annotation.tag ? annotation.tag.split(",") : [])).map((tag) => tag.trim().replace(/^#+/, "")).filter(Boolean);
    const tagCopy = tags.map((tag) => `<span class="annotation-float-tag">#${escapeHtml(tag)}</span>`).join(" ");
    const byline = annotation.name ? `<span class="annotation-float-byline">${escapeHtml(annotation.name)}</span>` : "";
    const status = annotation.unconfirmed ? "NOT YET PUBLIC · " : annotation.pending ? "PUBLISHING · " : annotation.simulated ? "SIMULATION · " : "";
    const pendingHint = annotation.unconfirmed ? `<p class="annotation-compose-help">This note has not appeared in the public feed. Please check again later before resubmitting.</p>` : "";
    this.annotationFloat.innerHTML = `<div class="annotation-float-head"><span class="note-glyph" aria-hidden="true"><b></b><b></b><b></b></span><span>${status}NOTE ${index + 1} OF ${count}</span><button type="button" data-note-action="close" aria-label="Close annotation">×</button></div><p class="annotation-float-map">${escapeHtml(map.city)} · ${map.year}</p><blockquote>${escapeHtml(annotation.text)}</blockquote>${byline}${pendingHint}<div class="annotation-float-foot"><span>${tagCopy}</span><nav aria-label="Move through annotations"><button type="button" data-note-action="previous" aria-label="Previous annotation"${count < 2 ? " disabled" : ""}>←</button><button type="button" data-note-action="next" aria-label="Next annotation"${count < 2 ? " disabled" : ""}>→</button></nav></div>`;
    this.annotationFloat.hidden = false;
    this.positionAnnotationFloat(point);
  }

  showAnnotationDraft({ point, screenPoint, map, submission }) {
    this.annotationFloat.classList.add("is-composing");
    const { entries } = submission;
    this.annotationFloat.innerHTML = `<div class="annotation-float-head"><span class="note-glyph" aria-hidden="true"><b></b><b></b><b></b></span><span>LEAVE A NOTE</span><button type="button" data-note-action="close" aria-label="Cancel annotation">×</button></div><p class="annotation-float-map">${escapeHtml(map.city)} · ${map.year}</p><p class="annotation-float-title">${escapeHtml(map.title)}</p><p class="annotation-float-coordinate">${Math.abs(point.lat).toFixed(4)}° ${point.lat < 0 ? "S" : "N"} · ${Math.abs(point.lng).toFixed(4)}° ${point.lng < 0 ? "W" : "E"}</p><form class="annotation-compose" action="${escapeHtml(submission.action)}" method="POST"><input type="hidden" name="${escapeHtml(entries.context)}" value="${escapeHtml(submission.context)}"><label>Your note<textarea name="${escapeHtml(entries.annotation)}" maxlength="1200" required></textarea></label><label>Name or alias<input name="${escapeHtml(entries.name)}" maxlength="80" required></label><p class="annotation-compose-help">Displayed publicly with your note; not a verified identity.</p><label>Tags <span>(optional)</span><input name="${escapeHtml(entries.tag)}" maxlength="80" placeholder="memory, railway, neighborhood"></label><p class="annotation-compose-help">Separate multiple tags with commas.</p><div class="annotation-float-foot"><button type="button" data-note-action="change">CHOOSE AGAIN</button><button type="submit">PUBLISH NOTE</button></div></form>`;
    this.annotationFloat.hidden = false;
    this.positionAnnotationFloat(screenPoint);
  }

  hideAnnotationFloat() {
    this.annotationFloat.classList.remove("is-composing");
    this.annotationFloat.hidden = true;
    this.annotationFloat.replaceChildren();
  }

  annotationPlacementHint(message) {
    const prompt = this.encounterContent.querySelector(".annotation-mode-prompt");
    if (prompt) prompt.textContent = message;
  }

  renderCore({ map, coreMaps, encounter, tile, lateral, drift, annotations = [], annotationsVisible = true, annotationMode = false, annotationCompact = false, annotationOpen = false, annotationSimulation = false }) {
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
    const notes = annotationCopy(annotations, annotationsVisible, annotationMode, annotationSimulation);
    this.surface.hidden = false;
    this.encounter.classList.toggle("is-note-mode", annotationCompact || (annotationsVisible && annotations.length > 0));
    this.encounter.classList.toggle("is-note-open", annotationOpen);
    const arrival = fragment?.arrival?.label || "a thread in the book";
    this.encounterContent.innerHTML = `<div class="encounter-flow"><section class="encounter-stage map-stage"><p class="stage-kicker">selected map</p><p class="map-marker">${escapeHtml(map.city)} · ${map.year}</p><div class="map-title-row"><h2>${escapeHtml(map.title)}</h2><span class="map-quiet-actions">${takeOffer}</span></div><div class="map-annotations">${notes.place}${notes.body}</div>${mapRecord(map)}</section><section class="encounter-stage book-stage"><p class="stage-kicker">the book enters <span>${escapeHtml(arrival)}</span></p>${title || quote}</section>${driftOffer || offer ? `<section class="encounter-stage stray-stage">${driftOffer || offer}</section>` : ""}</div>`;
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
    element.querySelectorAll("[data-annotations-toggle]").forEach((button) => button.addEventListener("click", () => this.actions.annotations()));
    element.querySelectorAll("[data-annotations-open]").forEach((button) => button.addEventListener("click", () => this.actions.openAnnotations()));
    element.querySelectorAll("[data-annotation-place]").forEach((button) => button.addEventListener("click", () => this.actions.annotate()));
    element.querySelectorAll("[data-annotation-step]").forEach((button) => button.addEventListener("click", () => this.actions.annotationStep(Number(button.dataset.annotationStep))));
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
