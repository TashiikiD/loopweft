// Source: PolycrisisPresentation src/presenter/presenter.ts, notes.ts and map-sources.ts @ 3e5da10
// (private), adapted for Loopweft: every part is read from the project (scenes, steps, cues, speaker notes,
// the script and its key marks, sources and citations), the live preview is a second stage in the page
// rather than a frame, and C names categories in words on every window.
import { KEY_MARK, type Project, referenceSpans, sceneSources, scriptSegments } from '@loopweft/model';
import { type Clock, FrameClock, Motion } from '@loopweft/motion';
import { buildGraph, h, namedLoops, resolveMap, StoryView, typeset } from '@loopweft/render';
import { fmt } from './clock.ts';
import { type Deck, type DeckScene, deckOf, nextPos, type Pos, sceneAt, sceneTag, stepAt } from './deck.ts';
import { isControlTarget, isTypingTarget, JumpBuffer, jumpDigits, type LocalAction, mapKey } from './keys.ts';
import { browserHost, joinToken, Link, withJoin } from './link.ts';
import { markdownToDom, parseMarkdown } from './markdown.ts';
import { type AudienceTarget, openAudienceWindow, PROJECTOR_MESSAGES, sendToProjector } from './projector.ts';
import { nextLine } from './rehearsal.ts';
import { browserAddress, ShowSession } from './session.ts';
import type { Command, ShowState } from './show.ts';
import { stageDriver } from './stage.ts';
import { browserStorage, type KeyValue, PresentationStore } from './storage.ts';
import { PresenterClock, paceText } from './timing.ts';

export type NotesMode = 'notes' | 'script';

interface Prefs {
  notes: NotesMode;
  preview: boolean;
}

export interface ConsoleOptions {
  host: HTMLElement;
  project: Project;
  /** The presentation's id (`presentationId` of the project's text). */
  show: string;
  /** Where the audience window is, and its window name. */
  audience: AudienceTarget;
  /** The project's text, for an audience window that has no copy of its own (the Studio's). */
  projectText?: string;
  /** Writes the step on show into the page address (default: yes). */
  address?: boolean;
  win?: Window;
  storage?: KeyValue | null;
  /** The preview's animation clock (tests step one by hand); by default the display's frames. */
  clock?: Clock;
  /** Leaves the console (the Studio's way back); a button shows only when given. */
  onClose?: { label: string; run: () => void };
}

export interface PresenterConsole {
  readonly session: ShowSession;
  readonly deck: Deck;
  dispose(): void;
}

const HELP: Array<[string, string]> = [
  ['→ · Space · PgDn', 'Next step'],
  ['← · PgUp', 'The step before'],
  ['Shift+→ / Shift+←', 'Next scene / start of the scene, then the scene before'],
  ['A number, then Enter', 'Go to the scene with that number'],
  ['Home / End', 'First / last step'],
  ['R', 'Replay this step'],
  ['S', 'Skip: finish the animation now'],
  ['P', 'Pause or resume the animation'],
  ['B or .', 'Black out the audience window'],
  ['L', 'Low-power mode'],
  ['C', 'Name the categories in words'],
  ['G / F', 'Notes / script'],
  ['↑ / ↓', 'Scroll the notes'],
  ['T / Shift+T', 'Start or pause / reset the clock'],
  ['? or H', 'This help'],
];

const SIGN_WORDS = { '+': '+ increases', '-': '− decreases', '?': '? sign unknown' } as const;
const SIGN_ARROWS = { '+': '→', '-': '⊣', '?': '→?' } as const;

/** A small arrow icon: one chevron for the next step, two for the next scene. */
function keyIcon(doc: Document, exit: boolean): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const el = doc.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 16 16');
  el.setAttribute('class', 'lp-key-icon');
  el.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(ns, 'path');
  path.setAttribute('d', exit ? 'M2.5 3.5 7 8l-4.5 4.5M8.5 3.5 13 8l-4.5 4.5' : 'M3 8h9M8.5 4 12.5 8l-4 4');
  el.appendChild(path);
  return el;
}

/** The scene's script, with a key mark wherever a key is due: the n-th brings up step n + 1, the last the next scene. */
export function scriptView(doc: Document, deck: Deck, pos: Pos): HTMLElement[] {
  const scene = sceneAt(deck, pos);
  const script = scene.scene.script?.trim();
  if (!script)
    return [
      h(
        'p',
        { class: 'lp-n-empty' },
        'This scene has no script. A script can be written in the Studio (Story, Notes panel), with a key mark [>] wherever a key is pressed.',
      ),
    ];
  const segments = scriptSegments(script);
  const words = script.split(KEY_MARK).join(' ').split(/\s+/).filter(Boolean).length;
  const pace =
    scene.targetSeconds > 0
      ? ` · ${Math.round((words / scene.targetSeconds) * 60)} words a minute`
      : ' · untimed';
  const next = deck.scenes[pos.s + 1];
  const body = h('p', { class: 'lp-n-full' });
  segments.forEach((text, i) => {
    if (text) body.append(`${typeset(text)} `);
    if (i === segments.length - 1) return;
    const step = scene.steps[i + 1];
    const exit = !step;
    const title = step
      ? `Press → for ${step.key}: ${step.step.label}`
      : next
        ? `Press → for the next scene: ${next.title}`
        : 'Press →';
    body.append(
      h(
        'kbd',
        { class: `lp-key${exit ? ' exit' : ''}`, 'data-mark': i, title },
        keyIcon(doc, exit),
        h('span', null, step ? step.step.id : next ? next.id : 'next'),
      ),
      ' ',
    );
  });
  return [
    h(
      'p',
      { class: 'lp-n-meta' },
      `Script · ${words} words${scene.targetSeconds > 0 ? ` · target ${fmt(scene.targetSeconds)}` : ''}${pace} · `,
      h('kbd', { class: 'lp-key legend' }, keyIcon(doc, false)),
      ' press for the next step',
    ),
    body,
  ];
}

/** Lights where the talk is in the script: marks already pressed recede, the next one lights up and stays in view. */
export function markScriptProgress(container: HTMLElement, stepIndex: number): void {
  let next: HTMLElement | null = null;
  for (const chip of container.querySelectorAll<HTMLElement>('.lp-key[data-mark]')) {
    const mark = Number(chip.dataset.mark);
    chip.classList.toggle('done', mark < stepIndex);
    chip.classList.toggle('next', mark === stepIndex);
    if (mark === stepIndex) next = chip;
  }
  if (!next) return;
  const box = container.getBoundingClientRect();
  const at = next.getBoundingClientRect();
  if (box.height > 0 && (at.top < box.top + 40 || at.bottom > box.bottom - 40))
    container.scrollBy?.({ top: at.top - box.top - box.height * 0.4, behavior: 'smooth' });
}

/** The scene's speaker notes, under its headline. */
function notesView(scene: DeckScene): HTMLElement[] {
  const notes = scene.scene.notes?.trim();
  const out: HTMLElement[] = [];
  if (scene.headline) out.push(h('p', { class: 'lp-n-takeaway' }, typeset(scene.headline)));
  out.push(
    notes
      ? h('div', { class: 'lp-markdown' }, markdownToDom(parseMarkdown(notes), typeset))
      : h('p', { class: 'lp-n-empty' }, 'No speaker notes for this scene.'),
  );
  return out;
}

/**
 * What is on the audience's screen, with its evidence: the lit links (sign, type, conditions, the mechanism
 * and every citation with its pages), the lit variables' citations, the loops badged and what the overlays
 * cite. Anything on screen can be traced to its source from here.
 */
export function onScreenView(
  project: Project,
  deck: Deck,
  pos: Pos,
  graph = buildGraph(project),
): HTMLElement[] {
  const step = stepAt(deck, pos).step;
  const r = resolveMap(project, graph, step.map);
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  const variables = new Map(project.variables.map((v) => [v.id, v]));
  const linkTypes = new Map(project.types.linkTypes.map((t) => [t.id, t]));
  const loops = namedLoops(project, graph);
  const loopData = new Map(project.loops.map((l) => [l.id, l]));
  const name = (id: string) => (variables.get(id)?.label ?? id).replace(/\s*\n\s*/g, ' ');
  const cite = (c: { source: string; pages?: string; strength?: string; note?: string }) =>
    [`${sources.get(c.source)?.label ?? c.source}${c.pages ? `, p. ${c.pages}` : ''}`, c.strength, c.note]
      .filter(Boolean)
      .join(' · ');
  /** Each citation with its pages, strength and note; or says that nothing is cited. */
  const sourcesLine = (citations: ReadonlyArray<Parameters<typeof cite>[0]>) =>
    citations.length > 0
      ? h('div', { class: 'lp-ms-src' }, citations.map(cite).join('; '))
      : h('div', { class: 'lp-ms-src none' }, 'No source cited');
  const rows: HTMLElement[] = [];
  if (r.show) {
    for (const id of r.loops) {
      const loop = loops.get(id);
      if (!loop) continue;
      const kind = loop.type === 'R' ? 'reinforcing' : loop.type === 'B' ? 'balancing' : 'polarity unknown';
      const data = loopData.get(id);
      rows.push(
        h(
          'div',
          { class: 'lp-ms-loop' },
          h('span', { class: 'lp-ms-tag strong' }, `${id} · ${kind}`),
          h('span', { class: 'lp-ms-path' }, `${loop.name}${loop.archetype ? ` (${loop.archetype})` : ''}`),
          data?.caution ? h('div', { class: 'lp-ms-why' }, typeset(data.caution)) : null,
          sourcesLine(data?.citations ?? []),
        ),
      );
    }
    for (const id of r.litEdges) {
      const link = project.links.find((l) => l.id === id);
      if (!link) continue;
      const type = link.type ? linkTypes.get(link.type)?.name : undefined;
      rows.push(
        h(
          'div',
          { class: 'lp-ms-edge' },
          h(
            'div',
            { class: 'lp-ms-head' },
            h('span', { class: 'lp-ms-id' }, id),
            h(
              'span',
              { class: 'lp-ms-path' },
              `${name(link.from)} ${SIGN_ARROWS[link.sign]} ${name(link.to)}`,
            ),
          ),
          h(
            'div',
            { class: 'lp-ms-tags' },
            h(
              'span',
              {
                class: `lp-ms-tag sign-${link.sign === '+' ? 'plus' : link.sign === '-' ? 'minus' : 'unknown'}`,
              },
              SIGN_WORDS[link.sign],
            ),
            type ? h('span', { class: 'lp-ms-tag' }, type) : null,
            link.conditional ? h('span', { class: 'lp-ms-tag' }, 'conditional') : null,
            link.delay
              ? h('span', { class: 'lp-ms-tag' }, link.delayLabel ? `delay ${link.delayLabel}` : 'delay')
              : null,
            link.confidence ? h('span', { class: 'lp-ms-tag' }, `${link.confidence} confidence`) : null,
          ),
          link.rationale ? h('div', { class: 'lp-ms-why' }, typeset(link.rationale)) : null,
          sourcesLine(link.citations),
        ),
      );
    }
    for (const [id, level] of r.nodeLevel) {
      const v = variables.get(id);
      if (!v || (level !== 'focus' && level !== 'active') || v.citations.length === 0) continue;
      rows.push(
        h(
          'div',
          { class: 'lp-ms-loop' },
          h('span', { class: 'lp-ms-path' }, name(id)),
          h('div', { class: 'lp-ms-src' }, v.citations.map(cite).join('; ')),
        ),
      );
    }
  }
  for (const overlay of step.overlays) {
    if (!('citations' in overlay) || !overlay.citations?.length) continue;
    rows.push(
      h(
        'div',
        { class: 'lp-ms-loop' },
        h('span', { class: 'lp-ms-tag' }, overlay.type),
        sourcesLine(overlay.citations),
      ),
    );
  }
  if (rows.length === 0) rows.push(h('p', { class: 'lp-ms-empty' }, 'Nothing cited on screen in this step.'));
  return rows;
}

/** The sources a scene draws on, each with its reference and address. */
function sourcesView(project: Project, scene: DeckScene): HTMLElement[] {
  const byId = new Map(project.sources.map((s) => [s.id, s]));
  const rows = sceneSources(project, scene.scene).map((id) => {
    const s = byId.get(id);
    const href = s?.doi ? `https://doi.org/${s.doi}` : s?.url;
    return h(
      'div',
      { class: 'lp-src' },
      h('span', { class: 'lp-src-tag' }, id),
      h(
        'div',
        null,
        s?.label ? h('div', { class: 'lp-src-cite' }, s.label) : null,
        h(
          'div',
          { class: 'lp-src-apa' },
          ...(s
            ? referenceSpans(s.apa).map((span) => (span.italic ? h('i', null, span.text) : span.text))
            : [id]),
        ),
        href
          ? h(
              'a',
              { href, target: '_blank', rel: 'noopener noreferrer', class: 'lp-src-link' },
              href.replace(/^https?:\/\//, ''),
            )
          : null,
      ),
    );
  });
  return rows.length > 0 ? rows : [h('p', { class: 'lp-ms-empty' }, 'This scene cites no source.')];
}

/** The presenter console: the presenter's private view, with the notes, clocks and controls. */
export function startConsole(o: ConsoleOptions): PresenterConsole {
  const win = o.win ?? window;
  const doc = win.document;
  const deck = deckOf(o.project);
  const graph = buildGraph(o.project);
  const store = new PresentationStore(o.show, o.storage === undefined ? browserStorage() : o.storage);
  const saved = (store.load('presenter') as Partial<Prefs> | null) ?? {};
  const prefs: Prefs = {
    notes: saved.notes === 'script' ? 'script' : 'notes',
    preview: saved.preview !== false,
  };
  const clock = new PresenterClock(store, deck, () => Date.now());
  const jump = new JumpBuffer(2500, jumpDigits(deck));
  const stops: Array<() => void> = [];

  /**
   * After a click with the mouse, focus leaves the button, so Space keeps moving the show instead of pressing
   * the button again. A button worked from the keyboard (Tab, then Space or Enter) keeps the focus, so the
   * next Tab goes on from it.
   */
  const settle = (e: MouseEvent, el: HTMLElement) => {
    if (e.detail > 0) el.blur();
  };
  const button = (label: string, title: string, onClick: () => void, extra = ''): HTMLButtonElement => {
    const b = h('button', { type: 'button', class: `lp-btn ${extra}`.trim(), title }, label);
    b.addEventListener('click', (e) => {
      onClick();
      settle(e, b);
    });
    return b;
  };

  const ui = {
    sceneNum: h('div', { class: 'lp-scene-num' }),
    sceneTitle: h('div', { class: 'lp-scene-title' }),
    sceneSub: h('div', { class: 'lp-scene-sub' }),
    conn: h('span', { class: 'lp-chip' }),
    chipBlackout: h('span', { class: 'lp-chip bad', hidden: true }, 'Blackout on'),
    chipPaused: h('span', { class: 'lp-chip warn', hidden: true }, 'Animation paused'),
    chipLow: h('span', { class: 'lp-chip', hidden: true }, 'Low-power mode'),
    chipWords: h('span', { class: 'lp-chip', hidden: true }, 'Categories in words'),
    total: h('span', { class: 'lp-t-big' }),
    clockBtn: button(
      '',
      'Start or pause the presenter clock (T)',
      () => local('clockToggle'),
      'lp-btn-clock',
    ),
    resetBtn: button('Reset', 'Reset the clock (Shift+T)', () => local('clockReset'), 'quiet'),
    sceneTime: h('span', { class: 'lp-t-mid' }),
    sceneBar: h('div', { class: 'lp-t-bar-fill' }),
    paceText: h('span', { class: 'lp-t-mid' }),
    paceSub: h('small'),
    leftText: h('span', { class: 'lp-t-mid' }),
    leftSub: h('small'),
    now: h('div', { class: 'lp-cue now' }),
    next: h('div', { class: 'lp-cue next' }),
    tabNotes: button('Notes', 'Speaker notes (G)', () => setNotes('notes'), 'lp-tab'),
    tabScript: button(
      'Script',
      'The full script, with its key marks (F)',
      () => setNotes('script'),
      'lp-tab',
    ),
    notes: h('div', { class: 'lp-notes-body', tabindex: '-1' }),
    preview: h('div', { class: 'lp-preview' }),
    previewBtn: button('', 'Show or hide the live audience view', () => togglePreview(), 'quiet small'),
    steps: h('ol', { class: 'lp-step-list' }),
    onScreen: h('div', { class: 'lp-map-sources' }),
    sources: h('div', { class: 'lp-sources' }),
    strip: h('nav', { class: 'lp-scene-strip', 'aria-label': 'Scenes' }),
    jump: h('div', { class: 'lp-jump', hidden: true, role: 'status' }),
    toast: h('div', { class: 'lp-toast', role: 'status', hidden: true }),
    help: h('dialog', { class: 'lp-help', 'aria-label': 'Keyboard shortcuts' }) as HTMLDialogElement,
  };
  const helpClose = h('button', { type: 'button', class: 'lp-btn quiet' }, 'Close');
  helpClose.addEventListener('click', () => setHelp(false));
  ui.help.append(
    h(
      'div',
      { class: 'lp-help-card' },
      h('div', { class: 'lp-help-head' }, h('h2', null, 'Keyboard shortcuts'), helpClose),
      h(
        'table',
        null,
        h('tbody', null, ...HELP.map(([k, v]) => h('tr', null, h('td', null, k), h('td', null, v)))),
      ),
      h(
        'p',
        null,
        'The keys work in the audience window too, and so does a clicker. In the audience window, F or a double-click is full screen and H hides the progress bar.',
      ),
      h('p', { class: 'lp-help-close' }, 'Esc or ? closes this'),
    ),
  );
  // A click beside the card closes it, as do Esc and ?; the focus goes back where it was.
  ui.help.addEventListener('click', (e) => {
    if (e.target === ui.help) setHelp(false);
  });
  let helpReturn: HTMLElement | null = null;
  const giveFocusBack = () => {
    const back = helpReturn;
    helpReturn = null;
    if (back?.isConnected) back.focus();
  };
  // Closed by the browser itself (Esc in a modal dialog): the focus goes back all the same.
  ui.help.addEventListener('close', giveFocusBack);
  function setHelp(open: boolean) {
    if (open === ui.help.hasAttribute('open')) return;
    if (open) {
      const active = doc.activeElement;
      helpReturn = active instanceof HTMLElement ? active : null;
      if (typeof ui.help.showModal === 'function') ui.help.showModal();
      else ui.help.setAttribute('open', '');
      helpClose.focus();
      return;
    }
    if (typeof ui.help.close === 'function') ui.help.close();
    else ui.help.removeAttribute('open');
    giveFocusBack();
  }

  const controls = h(
    'div',
    { class: 'lp-controls' },
    button('◀ Back', 'The step before (← or PgUp)', () => dispatch({ type: 'prev' })),
    button('Next ▶', 'Next step (→, Space or PgDn)', () => dispatch({ type: 'next' }), 'primary'),
    button('⟲ Replay', 'Replay this step (R)', () => dispatch({ type: 'repeat' })),
    button('⏭ Skip', 'Finish the animation now (S)', () => dispatch({ type: 'skip' })),
    button('⏸ Pause', 'Pause or resume the animation (P)', () => dispatch({ type: 'togglePause' })),
    button('⬛ Blackout', 'Black out the audience window (B or .)', () =>
      dispatch({ type: 'toggleBlackout' }),
    ),
    button('Low power', 'Turn the heavy glows off (L)', () => dispatch({ type: 'toggleLowPower' }), 'quiet'),
    button(
      'Categories',
      'Name the categories in words (C)',
      () => dispatch({ type: 'toggleCategoryWords' }),
      'quiet',
    ),
    h('span', { class: 'lp-controls-gap' }),
    button('Open audience window', 'Open the audience view in a new window', () => openAudience()),
    button(
      'Send to projector',
      'Open the audience view on the second screen (Chrome and Edge)',
      () => void projector(),
    ),
    button('?', 'Keyboard shortcuts (?)', () => local('help'), 'quiet'),
    o.onClose ? button(o.onClose.label, o.onClose.label, () => o.onClose?.run(), 'quiet') : null,
  );

  const root = h(
    'div',
    { class: 'lp-console' },
    h(
      'header',
      { class: 'lp-top' },
      h(
        'div',
        { class: 'lp-scene' },
        ui.sceneNum,
        h('div', { class: 'lp-scene-text' }, ui.sceneTitle, ui.sceneSub),
      ),
      h('div', { class: 'lp-status' }, ui.chipBlackout, ui.chipPaused, ui.chipLow, ui.chipWords, ui.conn),
    ),
    h(
      'section',
      { class: 'lp-timing', 'aria-label': 'Timing' },
      h(
        'div',
        { class: 'lp-t-cell' },
        h('label', null, 'Total'),
        h('div', { class: 'lp-t-row' }, ui.total, ui.clockBtn, ui.resetBtn),
      ),
      h(
        'div',
        { class: 'lp-t-cell' },
        h('label', null, 'This scene'),
        ui.sceneTime,
        h('div', { class: 'lp-t-bar' }, ui.sceneBar),
      ),
      h('div', { class: 'lp-t-cell' }, h('label', null, 'Pace'), ui.paceText, ui.paceSub),
      h('div', { class: 'lp-t-cell' }, h('label', null, 'Remaining'), ui.leftText, ui.leftSub),
    ),
    h(
      'main',
      { class: 'lp-main' },
      h(
        'section',
        { class: 'lp-left' },
        h('div', { class: 'lp-cues' }, ui.now, ui.next),
        h(
          'div',
          { class: 'lp-notes' },
          h(
            'div',
            { class: 'lp-tabs', role: 'group', 'aria-label': 'Notes or script' },
            ui.tabNotes,
            ui.tabScript,
            h('span', { class: 'lp-tabs-hint' }, 'G / F · ↑ ↓ scroll'),
          ),
          ui.notes,
        ),
      ),
      h(
        'aside',
        { class: 'lp-right' },
        h(
          'div',
          { class: 'lp-panel' },
          h('div', { class: 'lp-panel-head' }, h('h2', null, 'Audience view'), ui.previewBtn),
          ui.preview,
        ),
        h(
          'div',
          { class: 'lp-panel' },
          h('div', { class: 'lp-panel-head' }, h('h2', null, 'Steps in this scene')),
          ui.steps,
        ),
        h(
          'div',
          { class: 'lp-panel' },
          h('div', { class: 'lp-panel-head' }, h('h2', null, 'On screen now: its evidence')),
          ui.onScreen,
        ),
        h(
          'div',
          { class: 'lp-panel' },
          h('div', { class: 'lp-panel-head' }, h('h2', null, 'Scene sources')),
          ui.sources,
        ),
      ),
    ),
    h('footer', { class: 'lp-bottom' }, controls, ui.strip),
    ui.jump,
    ui.toast,
    ui.help,
  );
  o.host.appendChild(root);
  stops.push(() => root.remove());

  const chips = deck.scenes.map((scene, s) => {
    const chip = h(
      'button',
      {
        type: 'button',
        class: 'lp-scene-chip',
        title: `${scene.title}${scene.targetSeconds > 0 ? ` · ends at ${fmt(scene.clockEnd)}` : ' · untimed'}`,
      },
      h('span', { class: 'lp-sc-num' }, sceneTag(scene) || '·'),
      h('span', { class: 'lp-sc-time' }, scene.targetSeconds > 0 ? fmt(scene.clockEnd) : ''),
    );
    chip.addEventListener('click', (e) => {
      dispatch({ type: 'goto', pos: { s, b: 0 } });
      settle(e, chip);
    });
    ui.strip.appendChild(chip);
    return chip;
  });

  // ----- The live preview: a second stage in this page, moved as the audience's is -----
  let preview: { story: StoryView; motion: Motion; drive: ReturnType<typeof stageDriver> } | null = null;
  let shown: ShowState | null = null;
  const applyPreview = () => {
    preview?.story.dispose();
    preview?.motion.dispose();
    preview = null;
    ui.preview.replaceChildren();
    ui.previewBtn.textContent = prefs.preview ? 'Hide' : 'Show';
    if (!prefs.preview) {
      ui.preview.append(h('div', { class: 'lp-preview-off' }, 'Preview hidden'));
      return;
    }
    const motion = new Motion(o.clock ?? new FrameClock());
    const story = new StoryView(ui.preview, { project: o.project, motion });
    const blackout = h('div', { class: 'lp-preview-blackout', 'aria-hidden': 'true' });
    ui.preview.append(blackout);
    preview = { story, motion, drive: stageDriver({ story, motion, deck, blackout }) };
    if (shown) preview.drive(shown, null, 'sync');
    void doc.fonts?.ready.then(() => preview?.story.relayout());
  };
  stops.push(() => {
    preview?.story.dispose();
    preview?.motion.dispose();
  });

  // ----- The show -----
  const token = joinToken(win, o.show);
  const link = new Link('presenter', o.show, browserHost(win), { token });
  // The audience window gets the join token in its address, so that it and this window let each other in.
  const audience = { ...o.audience, url: withJoin(o.audience.url, token) };
  let renderedScene = -1;
  const session = new ShowSession({
    deck,
    link,
    store,
    address: o.address === false ? null : browserAddress(win),
    now: () => Date.now(),
    onChange: (next, prev, reason) => {
      if (clock.noteScene(next.pos)) sendTiming();
      preview?.drive(next, shown ?? prev, reason);
      render(next);
    },
  });
  const dispatch = (cmd: Command) => session.dispatch(cmd);
  /**
   * Hands the clock and the scene's start to the audience windows, which take them up if this console goes:
   * where storage cannot carry them (none, or blocked), this is the only way they get there.
   */
  function sendTiming() {
    link.send({ t: 'timing', ...clock.snapshot() });
  }
  stops.push(
    link.on((msg) => {
      if (msg.t === 'needProject' && o.projectText !== undefined)
        link.send({ t: 'project', text: o.projectText });
    }),
  );
  stops.push(
    link.onPeers(() => {
      renderConnection();
      // A window that joins gets the clock as it stands.
      sendTiming();
    }),
  );

  function render(state: ShowState) {
    shown = state;
    if (deck.scenes.length === 0) {
      ui.sceneTitle.textContent = 'This story has no steps yet.';
      return;
    }
    const scene = sceneAt(deck, state.pos);
    const step = stepAt(deck, state.pos);
    ui.sceneNum.textContent = sceneTag(scene) || '·';
    ui.sceneTitle.textContent = scene.title;
    ui.sceneSub.textContent = `Step ${state.pos.b + 1} of ${scene.steps.length} · ${step.key} · ${step.step.label}`;
    renderCues(state.pos);
    renderSteps(state.pos, scene);
    ui.onScreen.replaceChildren(...onScreenView(o.project, deck, state.pos, graph));
    if (state.pos.s !== renderedScene) {
      renderedScene = state.pos.s;
      renderNotes();
      ui.sources.replaceChildren(...sourcesView(o.project, scene));
    }
    markScriptProgress(ui.notes, state.pos.b);
    chips.forEach((chip, i) => {
      chip.classList.toggle('current', i === state.pos.s);
      chip.classList.toggle('done', i < state.pos.s);
    });
    ui.chipBlackout.hidden = !state.blackout;
    ui.chipPaused.hidden = !state.paused;
    ui.chipLow.hidden = !state.lowPower;
    ui.chipWords.hidden = !state.categoryWords;
    root.classList.toggle('is-blackout', state.blackout);
    renderTiming();
  }

  function cueLine(at: number | undefined, text: string) {
    return h(
      'div',
      { class: 'lp-cue-line' },
      at !== undefined ? h('span', { class: 'lp-cue-at' }, `@${fmt(at)}`) : null,
      h('span', null, typeset(text)),
    );
  }

  function renderCues(pos: Pos) {
    const step = stepAt(deck, pos);
    ui.now.replaceChildren(
      h(
        'div',
        { class: 'lp-cue-head' },
        h('span', { class: 'lp-cue-tag' }, 'Now'),
        h('span', { class: 'lp-cue-id' }, `${step.key} · ${step.step.label}`),
      ),
      cueLine(step.step.at, step.step.cue ?? 'No cue written for this step.'),
    );
    const np = nextPos(deck, pos);
    if (!np) {
      ui.next.replaceChildren(
        h('div', { class: 'lp-cue-head' }, h('span', { class: 'lp-cue-tag' }, 'Next')),
        h('div', { class: 'lp-cue-line' }, 'End of the presentation. Hold the last step.'),
      );
      return;
    }
    if (np.s !== pos.s) {
      const ns = sceneAt(deck, np);
      ui.next.replaceChildren(
        h(
          'div',
          { class: 'lp-cue-head' },
          h('span', { class: 'lp-cue-tag' }, 'Next scene'),
          h('span', { class: 'lp-cue-id' }, nextLine(deck, pos).replace(/^Next scene: /, '')),
        ),
        ...(ns.headline ? [h('div', { class: 'lp-cue-line bridge' }, typeset(ns.headline))] : []),
      );
      return;
    }
    const nb = stepAt(deck, np);
    ui.next.replaceChildren(
      h(
        'div',
        { class: 'lp-cue-head' },
        h('span', { class: 'lp-cue-tag' }, 'Next'),
        h('span', { class: 'lp-cue-id' }, `${nb.key} · ${nb.step.label}`),
      ),
      cueLine(nb.step.at, nb.step.cue ?? 'No cue written for this step.'),
    );
  }

  /**
   * The scene's steps. The list is made again only when the scene changes, so a step button keeps the
   * keyboard's focus through every other change; when the scene changes under a focused button, the focus
   * goes to the current step's button in the new list.
   */
  let stepsScene = -1;
  let stepItems: HTMLElement[] = [];
  function renderSteps(pos: Pos, scene: DeckScene) {
    if (pos.s !== stepsScene) {
      const hadFocus = ui.steps.contains(doc.activeElement);
      stepsScene = pos.s;
      stepItems = scene.steps.map((step, b) => {
        const go = h(
          'button',
          { type: 'button', title: step.step.cue ? typeset(step.step.cue) : step.step.label },
          h('span', { class: 'lp-sl-id' }, step.step.id),
          h('span', { class: 'lp-sl-label' }, step.step.label),
          h('span', { class: 'lp-sl-at' }, step.step.at !== undefined ? fmt(step.step.at) : ''),
        );
        go.addEventListener('click', (e) => {
          dispatch({ type: 'goto', pos: { s: pos.s, b } });
          settle(e, go);
        });
        return h('li', null, go);
      });
      ui.steps.replaceChildren(...stepItems);
      if (hadFocus) stepItems[pos.b]?.querySelector('button')?.focus();
    }
    stepItems.forEach((li, b) => {
      li.className = b === pos.b ? 'current' : b < pos.b ? 'done' : '';
      li.querySelector('button')?.setAttribute('aria-current', String(b === pos.b));
    });
  }

  function renderNotes() {
    if (deck.scenes.length === 0) return;
    const pos = session.state.pos;
    ui.tabNotes.classList.toggle('active', prefs.notes === 'notes');
    ui.tabScript.classList.toggle('active', prefs.notes === 'script');
    ui.tabNotes.setAttribute('aria-pressed', String(prefs.notes === 'notes'));
    ui.tabScript.setAttribute('aria-pressed', String(prefs.notes === 'script'));
    ui.notes.replaceChildren(
      ...(prefs.notes === 'script' ? scriptView(doc, deck, pos) : notesView(sceneAt(deck, pos))),
    );
    ui.notes.scrollTop = 0;
    markScriptProgress(ui.notes, pos.b);
  }

  function renderTiming() {
    if (deck.scenes.length === 0) return;
    const t = clock.read(session.state.pos);
    const scene = t.scene;
    ui.total.textContent = fmt(t.elapsed);
    ui.clockBtn.textContent = t.running ? '⏸ Pause clock' : t.started ? '▶ Resume clock' : '▶ Start clock';
    ui.clockBtn.classList.toggle('running', t.running);
    if (scene.targetSeconds > 0) {
      ui.sceneTime.textContent = `${fmt(t.sceneElapsed)} / ${fmt(scene.targetSeconds)}`;
      const frac = t.sceneElapsed / scene.targetSeconds;
      ui.sceneBar.style.width = `${Math.min(1, frac) * 100}%`;
      ui.sceneBar.classList.toggle('over', frac > 1);
    } else {
      ui.sceneTime.textContent = `${fmt(t.sceneElapsed)} · untimed`;
      ui.sceneBar.style.width = '0%';
    }
    ui.paceText.textContent = paceText(t);
    ui.paceText.dataset.status = t.pace.status;
    ui.paceSub.textContent = !t.started
      ? 'Press T when you start speaking'
      : scene.targetSeconds > 0
        ? `Finish this scene by ${fmt(scene.clockEnd)}`
        : 'An untimed scene';
    if (deck.targetSeconds > 0) {
      ui.leftText.textContent = `${fmt(deck.targetSeconds - t.elapsed)} to ${fmt(deck.targetSeconds)}`;
      ui.leftSub.textContent = 'The scenes’ target times added up';
    } else {
      ui.leftText.textContent = '—';
      ui.leftSub.textContent = 'No scene has a target time';
    }
  }

  function renderConnection() {
    const n = link.count('audience');
    ui.conn.className = `lp-chip ${n > 0 ? 'ok' : 'warn'}`;
    ui.conn.textContent = n > 0 ? `Audience connected${n > 1 ? ` (${n})` : ''}` : 'No audience window';
  }

  function setNotes(mode: NotesMode) {
    prefs.notes = mode;
    store.save('presenter', prefs);
    renderNotes();
  }

  function togglePreview() {
    prefs.preview = !prefs.preview;
    store.save('presenter', prefs);
    applyPreview();
  }

  function adopt(w: Window | null) {
    if (w) link.addWindow(w);
  }

  function openAudience() {
    const w = openAudienceWindow(win, audience);
    adopt(w);
    toast(
      w
        ? 'Audience window opened. Drag it to the projector, click it, then press F.'
        : PROJECTOR_MESSAGES.blocked,
    );
  }

  async function projector() {
    const { result, window: w } = await sendToProjector(win, audience);
    adopt(w);
    toast(PROJECTOR_MESSAGES[result]);
  }

  let toastTimer = 0;
  function toast(message: string) {
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(() => {
      ui.toast.hidden = true;
    }, 6000);
  }

  function local(action: LocalAction) {
    const pos = session.state.pos;
    switch (action) {
      case 'notes':
        setNotes('notes');
        return;
      case 'script':
        setNotes('script');
        return;
      case 'clockToggle':
        clock.toggle(pos);
        renderTiming();
        sendTiming();
        return;
      case 'clockReset':
        if (win.confirm('Reset the presenter clock to 0:00?')) {
          clock.reset(pos);
          renderTiming();
          sendTiming();
        }
        return;
      case 'scrollUp':
        ui.notes.scrollBy?.({ top: -120, behavior: 'smooth' });
        return;
      case 'scrollDown':
        ui.notes.scrollBy?.({ top: 120, behavior: 'smooth' });
        return;
      case 'help':
        setHelp(!ui.help.hasAttribute('open'));
        return;
      case 'cancel':
        jump.clear();
        ui.jump.hidden = true;
        setHelp(false);
        return;
      default:
        return;
    }
  }

  // ----- Keys -----
  const onKey = (e: KeyboardEvent) => {
    // While the shortcuts are open, the keys are theirs (the arrows, PgUp and PgDn scroll them; Tab reaches
    // Close): nothing moves the show behind them. Esc, ? and H close them.
    if (ui.help.hasAttribute('open')) {
      const action = mapKey(e, 'presenter');
      if (action?.kind === 'local' && (action.action === 'help' || action.action === 'cancel')) {
        e.preventDefault();
        setHelp(false);
      } else if (action?.kind === 'swallow' && e.key === 'F5') {
        // A clicker's "start", never a reload.
        e.preventDefault();
      }
      return;
    }
    if (isTypingTarget(e.target)) return;
    if (isControlTarget(e.target, e.key)) return;
    const action = mapKey(e, 'presenter');
    if (!action) return;
    e.preventDefault();
    const now = Date.now();
    switch (action.kind) {
      case 'swallow':
        return;
      case 'show':
        dispatch(action.cmd);
        return;
      case 'digit': {
        const digits = jump.push(action.digit, now);
        const target = deck.scenes.find((s) => s.number === Number(digits));
        const numbered = deck.scenes.filter((s) => s.number !== undefined).length;
        ui.jump.textContent = target
          ? `Go to scene ${sceneTag(target)} · ${target.title}: press Enter`
          : `Scene ${digits}? (1 to ${numbered})`;
        ui.jump.hidden = false;
        win.setTimeout(() => {
          if (!jump.peek(Date.now())) ui.jump.hidden = true;
        }, 2600);
        return;
      }
      case 'enter': {
        const n = jump.take(now);
        ui.jump.hidden = true;
        dispatch(n !== null ? { type: 'gotoScene', number: n } : { type: 'next' });
        return;
      }
      case 'local':
        local(action.action);
    }
  };
  doc.addEventListener('keydown', onKey);
  stops.push(() => doc.removeEventListener('keydown', onKey));

  // ----- Start -----
  clock.noteScene(session.state.pos);
  render(session.state);
  applyPreview();
  renderNotes();
  renderConnection();
  session.start();
  stops.push(() => {
    session.stop();
    link.stop();
  });
  const ticker = win.setInterval(renderTiming, 250);
  stops.push(() => win.clearInterval(ticker));
  stops.push(() => win.clearTimeout(toastTimer));

  return {
    session,
    deck,
    dispose: () => {
      for (const stop of stops.reverse()) stop();
    },
  };
}
