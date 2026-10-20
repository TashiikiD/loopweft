// Source: PolycrisisPresentation src/audience/notes-overlay.ts @ 3e5da10 (private), adapted for Loopweft:
// the step's cue and the scene's speaker notes (Markdown) come from the project, and the presenter's clock and
// pace show at the top, since a rehearsal is where the timing is practised.
import { h, typeset } from '@loopweft/render';
import { fmt } from './clock.ts';
import { type Deck, nextPos, type Pos, sceneAt, sceneTag, stepAt } from './deck.ts';
import { markdownToDom, parseMarkdown } from './markdown.ts';
import { type PresenterClock, paceText } from './timing.ts';

/** "Scene 04", or an unnumbered scene's title. */
export const sceneName = (scene: { number: number | undefined; title: string }): string =>
  scene.number === undefined ? scene.title : `Scene ${sceneTag(scene)}`;

/** What comes after the step at `pos`, in a line. */
export function nextLine(deck: Deck, pos: Pos): string {
  const next = nextPos(deck, pos);
  if (!next) return 'End of the presentation: hold the last step.';
  if (next.s !== pos.s) {
    const scene = sceneAt(deck, next);
    return `Next scene: ${scene.number === undefined ? '' : `${sceneTag(scene)} · `}${scene.title}`;
  }
  const step = stepAt(deck, next);
  return `${step.key} · ${step.step.label}`;
}

/**
 * Rehearsal notes over the slides (N), for rehearsing in one window. They stay in this window and are never
 * sent to another: they refuse to open, and close themselves, while a presenter console is connected, so they
 * cannot end up on the projector during the real talk.
 */
export class RehearsalNotes {
  readonly el: HTMLElement;
  readonly #deck: Deck;
  readonly #clock: PresenterClock;
  readonly #clockLine: HTMLElement;
  #open = false;
  #pos: Pos = { s: 0, b: 0 };
  /** Where the keyboard's focus was before the notes opened, to go back to. */
  #returnTo: HTMLElement | null = null;

  constructor(host: HTMLElement, deck: Deck, clock: PresenterClock) {
    this.#deck = deck;
    this.#clock = clock;
    this.#clockLine = h('p', { class: 'lp-ro-clock' });
    // Focusable, so that ↑ and ↓ scroll long notes (the show keeps → ← Space and PgUp/PgDn).
    this.el = h('aside', {
      class: 'lp-rehearsal',
      hidden: true,
      tabindex: '0',
      'aria-label': 'Rehearsal notes',
    });
    host.appendChild(this.el);
  }

  get isOpen(): boolean {
    return this.#open;
  }

  toggle(): void {
    this.setOpen(!this.#open);
  }

  /** Opens the notes, taking the keyboard's focus, or closes them, giving it back. */
  setOpen(open: boolean): void {
    const was = this.#open;
    this.#open = open;
    this.el.hidden = !open;
    const doc = this.el.ownerDocument;
    if (open) {
      this.#render();
      if (!was) {
        const active = doc.activeElement;
        this.#returnTo = active instanceof HTMLElement && !this.el.contains(active) ? active : null;
        this.el.focus({ preventScroll: true });
      }
      return;
    }
    const back = this.#returnTo;
    this.#returnTo = null;
    if (was && this.el.contains(doc.activeElement)) {
      if (back?.isConnected) back.focus({ preventScroll: true });
      else this.el.blur();
    }
  }

  update(pos: Pos): void {
    this.#pos = pos;
    if (this.#open) this.#render();
  }

  /** Brings the clock line up to date (called a few times a second while open). */
  tick(): void {
    if (!this.#open || this.#deck.scenes.length === 0) return;
    const t = this.#clock.read(this.#pos);
    this.#clockLine.dataset.status = t.pace.status;
    const scene =
      t.scene.targetSeconds > 0
        ? `this scene ${fmt(t.sceneElapsed)} / ${fmt(t.scene.targetSeconds)}`
        : 'untimed scene';
    this.#clockLine.textContent = t.started
      ? `${fmt(t.elapsed)}${t.running ? '' : ' (paused)'} · ${scene} · ${paceText(t)}`
      : `Clock not started: T starts it · ${scene}`;
  }

  #render(): void {
    if (this.#deck.scenes.length === 0) return;
    const scene = sceneAt(this.#deck, this.#pos);
    const step = stepAt(this.#deck, this.#pos).step;
    const notes = scene.scene.notes?.trim();
    this.el.replaceChildren(
      h('h2', null, `${sceneName(scene)} · step ${this.#pos.b + 1} of ${scene.steps.length}`),
      this.#clockLine,
      h(
        'div',
        { class: 'lp-ro-cue' },
        step.at !== undefined ? h('b', null, `@${fmt(step.at)} `) : null,
        typeset(step.cue ?? step.label),
      ),
      h('div', null, h('b', null, 'Next: '), typeset(nextLine(this.#deck, this.#pos))),
      notes
        ? h('div', { class: 'lp-ro-notes lp-markdown' }, markdownToDom(parseMarkdown(notes), typeset))
        : h('p', { class: 'lp-ro-empty' }, 'No speaker notes for this scene.'),
      h(
        'p',
        { class: 'lp-ro-foot' },
        'N hides these notes; T starts or pauses the clock. They close by themselves when a presenter console connects.',
      ),
    );
    this.tick();
  }
}
