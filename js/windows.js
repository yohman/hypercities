// Page ranges verified against the book's four W1–W4 sections.
// Introductions are editorial summaries, not quotations from the book.
export const STORIES = [
  { id: 'ghost-maps', title: 'Los Angeles Ghost Maps', place: 'Los Angeles', voice: 'Phil Ethington', start: 66, end: 73, image: 67,
    cue: 'What remains beneath a city?',
    intro: 'Ghost maps bring vanished neighborhoods, displaced lives, and successive landscapes into the same field of vision. Los Angeles becomes a place to look through, as well as at.' },
  { id: 'pdub', title: 'PDub Productions: Mapping HiFi', place: 'Historic Filipinotown · Los Angeles', voice: 'Mike Blockstein and Reanne Estrada · Public Matters', start: 74, end: 83, image: 75,
    cue: 'Who makes a neighborhood visible?',
    intro: 'Young people, community histories, digital media, and a traveling jeepney make Historic Filipinotown visible on its own terms. Mapping becomes a shared practice of telling and inhabiting a place.' },
  { id: 'rome', title: 'Rome: Jumping Over the Line', place: 'Rome', voice: 'Diane Favro and Chris Johanson', start: 128, end: 133, image: 129,
    cue: 'What changes when we enter the past?',
    intro: 'A reconstructed Roman Forum becomes a space for moving, questioning, and collaborating. This Window crosses the boundaries between disciplines and between looking at history and moving through it.' },
  { id: 'tehran', title: 'Mapping the 2009 Election Protests in Tehran', place: 'Tehran · Iran', voice: 'Xárene Eskandar', start: 134, end: 139, image: 135,
    cue: 'How can a map bear witness?',
    intro: 'Videos, photographs, and social media traces assemble a record of the election protests. Mapping becomes a response to official claims and a way of preserving voices and events at risk of disappearing.' }
];
const image = page => `./assets/book-pages/page-${String(page).padStart(3, '0')}.webp`;

export class Windows {
  constructor({ read }) {
    this.read = read;
    this.dialog = document.querySelector('#stories-window');
    this.content = this.dialog.querySelector('[data-stories-content]');
    this.media = window.matchMedia('(min-width: 920px)');
    this.media.addEventListener('change', () => { if (this.dialog.open && this.story) this.renderStory(); });
    this.dialog.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.hasAttribute('data-stories-close')) this.dialog.close();
      else if (button?.dataset.story) this.select(button.dataset.story);
      else if (button?.hasAttribute('data-stories-back')) this.catalogue();
      else if (button?.dataset.storyStep) this.turn(Number(button.dataset.storyStep));
      else if (button?.hasAttribute('data-story-read')) {
        const page = this.page;
        this.dialog.close();
        this.read(page);
      } else if (event.target === this.dialog) {
        const r = this.dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.dialog.close();
      }
    });
    this.dialog.addEventListener('keydown', event => {
      // Keep book navigation from also moving the underlying map/dérive.
      event.stopPropagation();
      if (this.story && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        this.turn(event.key === 'ArrowRight' ? 1 : -1);
      }
    });
    this.dialog.addEventListener('close', () => this.returnTo?.focus());
  }

  open(returnTo) {
    this.returnTo = returnTo;
    this.catalogue();
    if (!this.dialog.open) this.dialog.showModal();
  }

  catalogue() {
    this.story = null;
    this.dialog.classList.remove('is-story');
    this.content.innerHTML = `<div class="windows-invitation"><p>FOUR WINDOWS INTO HYPERCITIES</p><h1 id="windows-title">A city opens.<br>A story enters.</h1><p class="windows-deck">Four independent stories from the book.<br>Choose a place to begin.</p></div><nav class="windows-entrances" aria-label="Choose a Window">${STORIES.map((s, i) => `<button class="windows-entrance" data-story="${s.id}"><span class="windows-number">W${i + 1}</span><span class="windows-story-name"><small>${s.place}</small><strong>${s.title}</strong><em>${s.cue}</em></span><span class="windows-aperture"><img src="${image(s.image)}" alt="" loading="lazy"></span><span class="windows-enter" aria-hidden="true">↗</span></button>`).join('')}</nav>`;
    this.dialog.scrollTop = 0;
    if (this.dialog.open) this.content.querySelector('[data-story]')?.focus();
  }

  select(id) {
    this.story = STORIES.find(story => story.id === id);
    if (!this.story) return;
    this.page = this.story.start;
    this.dialog.classList.add('is-story');
    this.renderStory();
    this.dialog.scrollTop = 0;
    this.content.querySelector('[data-stories-back]').focus();
  }

  renderStory() {
    const s = this.story;
    // These sections all start on an even page; keep original facing pages.
    if (this.media.matches && (this.page - s.start) % 2) this.page--;
    const pages = [this.page];
    if (this.media.matches && this.page < s.end) pages.push(this.page + 1);
    const last = pages.at(-1);
    this.content.innerHTML = `<header class="window-story-heading"><button data-stories-back>← FOUR WINDOWS</button><p>${s.place} · pp. ${s.start}–${s.end}</p><h1 id="windows-title">${s.title}</h1><p class="window-voice">${s.voice}</p><p class="window-intro">${s.intro}</p></header><section class="window-facsimile" aria-label="${s.title}, book pages ${pages.join('–')}">${pages.map(p => `<img src="${image(p)}" alt="${s.title} — original book page ${p}">`).join('')}</section><nav class="window-reading-controls" aria-label="Read this Window"><button data-story-step="-1" ${this.page === s.start ? 'disabled' : ''} aria-label="Previous story page">← PREV</button><span aria-live="polite">${pages.join('–')} <small>OF ${s.start}–${s.end}</small></span><button data-story-step="1" ${last === s.end ? 'disabled' : ''} aria-label="Next story page">NEXT →</button></nav><footer class="window-reading-footer"><button data-story-read>CONTINUE IN THE FULL BOOK ↗</button>${last === s.end ? '<button data-stories-back>ANOTHER WINDOW ↗</button>' : ''}</footer>`;
  }

  turn(direction) {
    const step = this.media.matches ? 2 : 1;
    const end = this.story.end - (this.media.matches ? 1 : 0);
    const next = Math.max(this.story.start, Math.min(end, this.page + direction * step));
    if (next === this.page) return;
    this.page = next;
    this.renderStory();
    // Retain keyboard focus after replacing the controls.
    const nextFocus = this.content.querySelector(`[data-story-step="${direction}"]:not(:disabled)`)
      || this.content.querySelector('[data-story-step]:not(:disabled)');
    nextFocus?.focus({ preventScroll: true });
  }
}
