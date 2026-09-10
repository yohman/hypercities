function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function pages(provenance) { if (!provenance?.printedPages) return ""; const [start, end] = provenance.printedPages; return start === end ? `book p. ${start}` : `book pp. ${start}–${end}`; }
function sourceDetails(provenance, tile, relation, movementNote = null) {
  const edge = relation?.edge;
  return `<details class="data-details"><summary>source</summary>${provenance ? `<p>${escapeHtml(pages(provenance))} · ${escapeHtml(provenance.locator || "")}</p>` : ""}${edge ? `<p class="evidence">${escapeHtml(edge.relationType)} · ${escapeHtml(edge.assertion)} · ${escapeHtml(edge.evidence?.note || "")}</p>` : ""}${movementNote ? `<p class="evidence">${escapeHtml(movementNote)}</p>` : ""}${tile ? `<p><strong>Tiles:</strong> ${escapeHtml(tile.message)}<br><code>${escapeHtml(tile.url || tile.originalUrl || "No endpoint")}</code></p>` : ""}</details>`;
}
function pathButtons(links = []) {
  return links.map((item) => `<button type="button" data-node="${escapeHtml(item.id)}">${escapeHtml(item.label)} <span aria-hidden="true">→</span></button>`).join("");
}

const BOOK_PAGE_COUNT = 212;

export class Interface {
  constructor(actions) {
    this.actions = actions;
    this.depth = document.querySelector("#depth-indicator");
    this.fieldPrompt = document.querySelector("#field-prompt");
    this.fieldEncounter = document.querySelector("#field-encounter");
    this.encounter = document.querySelector("#encounter");
    this.journey = document.querySelector("#journey");
    this.journeyContent = document.querySelector("#journey-content");
    this.journeyToggle = document.querySelector("#journey-toggle");
    this.help = document.querySelector("#help-dialog");
    this.surface = document.querySelector("#surface");
    this.window = document.querySelector("#hyperbook-window");
    this.windowContent = document.querySelector("#hyperbook-window-content");
    this.bookReader = null;
    document.querySelector("#help-toggle").addEventListener("click", () => this.help.showModal());
    document.querySelector("#help-close").addEventListener("click", () => this.help.close());
    document.querySelector("#hyperbook-window-close").addEventListener("click", () => this.window.close());
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
      this.bookReader = null;
    });
    document.addEventListener("keydown", (event) => {
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
  }

  showDepth() { this.depth.hidden = true; }

  field() {
    this.depth.hidden = true;
    this.surface.hidden = true;
    this.fieldPrompt.hidden = true;
    this.encounter.hidden = true;
    this.journey.hidden = true;
    this.clearFieldEncounter();
  }

  lockedCore() {
    this.depth.hidden = true;
    this.surface.hidden = false;
    this.fieldPrompt.hidden = true;
    this.encounter.hidden = true;
    this.journey.hidden = true;
    this.clearFieldEncounter();
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
    this.encounter.hidden = !encounter;
    if (!encounter) return;
    const index = coreMaps.findIndex((candidate) => candidate.id === map.id);
    const older = coreMaps[index - 1];
    const newer = coreMaps[index + 1];
    const fragment = encounter.fragment || encounter.quote || null;
    const temporal = `${newer ? `<button type="button" data-time="newer">↑ ${newer.year}</button>` : ""}${older ? `<button type="button" data-time="older">↓ ${older.year}</button>` : ""}`;
    const arrival = fragment?.arrival?.label ? `<p class="encounter-route">${escapeHtml(fragment.arrival.label)}</p>` : "";
    const title = fragment && fragment.kind !== "quotation"
      ? `<button class="fragment-name" type="button" data-aperture="${escapeHtml(fragment.apertureId)}">${escapeHtml(fragment.text)}</button><p class="fragment-source">${escapeHtml(fragment.source)}</p>`
      : encounter.title && !fragment ? `<button class="fragment-name" type="button" data-aperture="${escapeHtml(encounter.id)}">${escapeHtml(encounter.title)}</button>` : "";
    const quote = fragment?.kind === "quotation" ? `<button class="fragment-quote" type="button" data-aperture="${escapeHtml(fragment.apertureId)}" aria-label="Open the cited book page for this quotation"><span class="quote-text">“${escapeHtml(fragment.text)}”</span><span class="quote-aperture" aria-hidden="true">view book page ↗</span></button><p class="fragment-source">${escapeHtml(fragment.source)}</p>` : "";
    // A temporal juxtaposition is a single offered side street, not another
    // control cluster beside the linked ideas.
    const links = !drift && encounter.links?.length ? `<nav class="fragment-paths" aria-label="Related Hyperbook paths">${pathButtons(encounter.links)}</nav>` : "";
    const offer = !encounter.links?.length && lateral ? `<button class="lateral-offer" type="button" data-node="${escapeHtml(lateral.id)}">toward ${escapeHtml(lateral.label)} <span aria-hidden="true">→</span></button>` : "";
    const driftOffer = drift ? `<button class="lateral-offer" type="button" data-drift="${escapeHtml(drift.map.id)}">elsewhere, ${escapeHtml(drift.map.year)} <span aria-hidden="true">→</span></button>` : "";
    this.surface.hidden = false;
    this.encounter.innerHTML = `<p class="map-marker">${escapeHtml(map.city)} · ${map.year}</p>${arrival}${title || quote}${links}${temporal ? `<nav class="temporal-nav" aria-label="Move through this place's historical maps">${temporal}</nav>` : ""}${driftOffer || offer}${sourceDetails(fragment?.provenance || encounter.provenance, tile, encounter.links?.[0], drift?.explanation || fragment?.arrival?.detail)}`;
    this.bindTraversal(this.encounter);
    this.encounter.querySelectorAll("[data-time]").forEach((button) => button.addEventListener("click", () => this.actions.time(button.dataset.time)));
  }

  bindTraversal(element) {
    element.querySelectorAll("[data-node]").forEach((button) => button.addEventListener("click", () => this.actions.node(button.dataset.node)));
    element.querySelectorAll("[data-aperture]").forEach((button) => button.addEventListener("click", () => this.actions.aperture(button.dataset.aperture)));
    element.querySelectorAll("[data-drift]").forEach((button) => button.addEventListener("click", () => this.actions.drift(button.dataset.drift)));
  }

  openAperture(aperture) {
    if (!aperture) return;
    const figure = aperture.figure ? `<p class="window-figure"><span>Figure</span>${escapeHtml(aperture.figure.title)}${aperture.figure.caption ? `<small>${escapeHtml(aperture.figure.caption)}</small>` : ""}</p>` : "";
    const bookPage = Boolean(aperture.pageImage);
    this.window.classList.toggle("is-book-page", Boolean(bookPage));
    // The reader is a single, complete source page. The visible highlight
    // provides orientation; longer graph evidence stays in the encounter's
    // expandable source detail rather than surrounding the facsimile.
    if (bookPage) {
      this.bookReader = { aperture, page: aperture.page };
      this.renderBookPage();
    } else {
      this.bookReader = null;
      this.windowContent.innerHTML = `<p class="window-kind">${escapeHtml(aperture.kind)}</p><h1>${escapeHtml(aperture.title)}</h1>${aperture.quote ? `<blockquote>“${escapeHtml(aperture.quote)}”</blockquote>` : ""}<p class="window-source">${escapeHtml(aperture.source || "HyperCities")}</p>${figure}${sourceDetails(aperture.provenance, null, null)}`;
    }
    if (!this.window.open) this.window.showModal();
  }

  renderBookPage() {
    const reader = this.bookReader;
    if (!reader) return;
    const { aperture, page } = reader;
    // A quotation only receives an overlay on its own source page. Adjacent
    // pages are deliberately left as uninterrupted facsimiles.
    const rect = page === aperture.page ? aperture.pageLocation?.rect : null;
    const highlight = rect
      ? `<span class="book-page-highlight" aria-label="The selected quotation on this page" style="--highlight-left:${rect.left * 100}%;--highlight-top:${rect.top * 100}%;--highlight-width:${rect.width * 100}%;--highlight-height:${rect.height * 100}%"></span>`
      : "";
    const image = `./assets/book-pages/page-${String(page).padStart(3, "0")}.webp`;
    this.windowContent.innerHTML = `<section class="book-page-viewer" aria-label="Source book page ${escapeHtml(page)}"><div class="book-page-frame"><img src="${image}" alt="Scanned source page ${escapeHtml(page)} from HyperCities: Thick Mapping in the Digital Humanities">${highlight}</div></section>`;
  }

  turnBookPage(direction) {
    const reader = this.bookReader;
    if (!reader) return;
    const nextPage = Math.max(1, Math.min(BOOK_PAGE_COUNT, reader.page + direction));
    if (nextPage === reader.page) return;
    reader.page = nextPage;
    this.renderBookPage();
  }

  renderJourney(items) {
    this.journey.hidden = !items.length;
    this.journeyContent.hidden = false;
    this.journeyToggle.setAttribute("aria-expanded", "true");
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
