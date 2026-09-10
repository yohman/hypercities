function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function pages(provenance) { if (!provenance?.printedPages) return ""; const [start, end] = provenance.printedPages; return start === end ? `book p. ${start}` : `book pp. ${start}–${end}`; }
function evidenceBlock(edge) { return edge ? `<p class="evidence"><strong>${escapeHtml(edge.relationType)}</strong> · ${escapeHtml(edge.assertion)} · strength ${edge.strength.toFixed(2)} · confidence ${edge.confidence.toFixed(2)}<br>${escapeHtml(pages(edge.evidence))} · ${escapeHtml(edge.evidence.note)}</p>` : ""; }

export class Interface {
  constructor(actions) {
    this.actions = actions;
    this.depth = document.querySelector("#depth-indicator"); this.fieldPrompt = document.querySelector("#field-prompt"); this.encounter = document.querySelector("#encounter"); this.journey = document.querySelector("#journey"); this.journeyContent = document.querySelector("#journey-content"); this.journeyToggle = document.querySelector("#journey-toggle"); this.help = document.querySelector("#help-dialog"); this.surface = document.querySelector("#surface");
    document.querySelector("#help-toggle").addEventListener("click", () => this.help.showModal());
    document.querySelector("#help-close").addEventListener("click", () => this.help.close());
    this.surface.addEventListener("click", () => this.actions.surface());
    this.journeyToggle.addEventListener("click", () => { const open = this.journeyContent.hidden; this.journeyContent.hidden = !open; this.journeyToggle.setAttribute("aria-expanded", String(open)); });
  }

  showDepth() {
    this.depth.hidden = true;
  }

  field() {
    this.depth.hidden = true; this.surface.hidden = true; this.fieldPrompt.hidden = true; this.encounter.hidden = true; this.journey.hidden = true;
  }

  lockedCore() {
    this.depth.hidden = true;
    this.surface.hidden = false;
    this.fieldPrompt.hidden = true;
    this.encounter.hidden = true;
    this.journey.hidden = true;
  }

  renderCore({ map, coreMaps, context, tile, stray, drift, activeEncounter }) {
    this.depth.hidden = true; this.fieldPrompt.hidden = true; this.encounter.hidden = false;
    const index = coreMaps.findIndex((candidate) => candidate.id === map.id);
    const older = coreMaps[index - 1]; const newer = coreMaps[index + 1];
    const encounter = activeEncounter || { title: map.title, kind: "historical map", summary: context.passages[0]?.summary || null, provenance: context.passages[0]?.provenance || null, links: context.relations, quote: context.quote };
    const links = encounter.links.slice(0, 1);
    const primaryLink = links[0];
    const temporal = `${newer ? `<button type="button" data-time="newer">↑ ${newer.year}</button>` : ""}${older ? `<button type="button" data-time="older">↓ ${older.year}</button>` : ""}`;
    const quote = encounter.quote?.text ? `<p class="quotation">“${escapeHtml(encounter.quote.text)}”</p>` : "";
    const detailSource = activeEncounter ? activeEncounter.provenance : context.passages[0]?.provenance;
    const tileDetail = tile ? `<p><strong>Tiles:</strong> ${escapeHtml(tile.message)}<br><code>${escapeHtml(tile.url || tile.originalUrl || "No endpoint")}</code></p>` : "";
    const sidewaysAllowed = [older, newer].filter(Boolean).length < 2;
    const thread = primaryLink ? `<p class="network-thread"><span>${escapeHtml(context.title || map.city)}</span><span aria-hidden="true"> → </span><button type="button" data-node="${escapeHtml(primaryLink.id)}">${escapeHtml(primaryLink.label)}</button></p>` : "";
    const strayHtml = sidewaysAllowed && stray ? `<button class="stray-offer" type="button" data-stray="${escapeHtml(stray.id)}">take a side street toward ${escapeHtml(stray.label)} →</button>` : "";
    const driftHtml = sidewaysAllowed && !stray && drift ? `<button class="drift-offer" type="button" data-drift="${escapeHtml(drift.map.id)}">drift to ${escapeHtml(drift.map.city)}, ${drift.map.year} →</button>` : "";
    this.surface.hidden = false;
    this.encounter.innerHTML = `<p class="eyebrow">${escapeHtml(context.title || map.city)} · ${map.year}</p><h1>${escapeHtml(encounter.title)}</h1>${encounter.summary ? `<p class="summary">${escapeHtml(encounter.summary)}</p>` : `<p class="no-context">This layer has no extracted Hyperbook encounter yet.</p>`}${quote}${thread}${temporal ? `<nav class="temporal-nav" aria-label="Move through this place's historical maps">${temporal}</nav>` : ""}${(strayHtml || driftHtml) ? `<div class="sideways">${strayHtml}${driftHtml}</div>` : ""}<details class="data-details"><summary>source</summary>${detailSource ? `<p>${escapeHtml(pages(detailSource))} · ${escapeHtml(detailSource.locator || "")}</p>` : ""}${primaryLink?.edge ? evidenceBlock(primaryLink.edge) : ""}${tileDetail}</details>`;
    this.encounter.querySelectorAll("[data-node]").forEach((button) => button.addEventListener("click", () => this.actions.node(button.dataset.node)));
    this.encounter.querySelectorAll("[data-time]").forEach((button) => button.addEventListener("click", () => this.actions.time(button.dataset.time)));
    this.encounter.querySelectorAll("[data-stray]").forEach((button) => button.addEventListener("click", () => this.actions.stray(button.dataset.stray)));
    this.encounter.querySelectorAll("[data-drift]").forEach((button) => button.addEventListener("click", () => this.actions.drift(button.dataset.drift)));
  }

  renderJourney(items) {
    this.journey.hidden = !items.length;
    this.journeyContent.hidden = false;
    this.journeyToggle.setAttribute("aria-expanded", "true");
    this.journeyContent.innerHTML = items.map((item) => `<span class="journey-item">${escapeHtml(item.label)}</span>`).join("");
  }
}
