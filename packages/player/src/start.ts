// Source: PolycrisisPresentation src/launcher/launcher.ts (the shared copy's start page) @ 3e5da10 (private),
// adapted for Loopweft: everything on it comes from the project (its title, description, scenes and sources),
// and what the file offers depends on whether its speaker notes were included.
import { type Project, referenceList, referenceSpans } from '@loopweft/model';
import { h } from '@loopweft/render';
import { fmt } from './clock.ts';
import { type Deck, deckOf, sceneTag, totalSteps } from './deck.ts';
import { browserStorage, type KeyValue, PresentationStore, resetSession, savedSession } from './storage.ts';

export interface StartOptions {
  host: HTMLElement;
  project: Project;
  show: string;
  /** Whether the file holds the speaker notes (and so offers the console). */
  notes: boolean;
  win?: Window;
  storage?: KeyValue | null;
}

/** The keys, and whether a key needs the speaker notes (a copy for the audience has neither console nor notes). */
const KEYS: Array<[string, string, boolean?]> = [
  ['→ · Space · PgDn', 'Next step'],
  ['← · PgUp', 'The step before'],
  ['Shift+→ / Shift+←', 'Next scene / start of the scene'],
  ['A number, then Enter', 'Go to that scene'],
  ['Home / End', 'First / last step'],
  ['R / S', 'Replay a step’s animation / skip to its end'],
  ['C', 'Name each variable’s category in words'],
  ['F (slides)', 'Full screen'],
  ['N (slides)', 'Rehearsal notes over the slides', true],
  ['G / F (console)', 'Notes / script', true],
  ['L', 'Low-power mode, if the animation stutters'],
];

/** "Scenes 01, 02 and 05", with an unnumbered scene by its title. */
function citedIn(deck: Deck, sceneIds: string[]): string {
  const names = sceneIds
    .map((id) => deck.scenes.find((s) => s.id === id))
    .filter((s) => s !== undefined)
    .map((s) => (s.number === undefined ? `“${s.title}”` : sceneTag(s)));
  if (names.length === 0) return '';
  const list =
    names.length === 1 ? (names[0] as string) : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `Cited in ${names.length === 1 ? 'scene' : 'scenes'} ${list}.`;
}

/** What of the presenter's words the file holds, in a sentence: only what the story has. */
export function presenterWords(project: Project, included: boolean): string {
  if (!included) return 'This copy leaves out the speaker notes, the script and the cues.';
  const scenes = project.story.scenes;
  const parts = [
    scenes.some((s) => s.notes?.trim()) ? 'the speaker notes' : '',
    scenes.some((s) => s.script?.trim()) ? 'the script' : '',
    scenes.some((s) => s.steps.some((t) => t.cue?.trim())) ? 'each step’s cue' : '',
  ].filter(Boolean);
  if (parts.length === 0) return 'The story has no speaker notes, script or cues.';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `This copy includes ${list}.`;
}

/** The page a one-file export opens on: what it holds, how to step through it, and every source. */
export function startPage(o: StartOptions): { dispose(): void } {
  const win = o.win ?? window;
  const deck = deckOf(o.project);
  const store = new PresentationStore(o.show, o.storage === undefined ? browserStorage() : o.storage);

  /** A way in: its heading and what it holds, and a link that opens it (the whole card takes the click). */
  const card = (title: string, body: string, action: string, search: string, primary = false) =>
    h(
      'article',
      { class: `lp-start-card${primary ? ' primary' : ''}` },
      h('h2', null, title),
      h('p', null, body),
      h('a', { class: 'lp-start-go', href: search }, action),
    );

  // A rehearsal (or a viewer who stopped part-way) leaves its place in this browser: say so, and offer the start.
  const status = h('div', { class: 'lp-start-status', role: 'status' });
  const renderStatus = () => {
    status.replaceChildren();
    const saved = savedSession(deck, store, Date.now());
    status.hidden = saved.fresh || deck.scenes.length === 0;
    if (status.hidden) return;
    const restart = h(
      'button',
      { type: 'button', class: 'lp-start-reset' },
      'Start again from the first step',
    );
    restart.addEventListener('click', () => {
      resetSession(store);
      renderStatus();
    });
    const clock =
      saved.clockMs >= 1000
        ? ` · clock ${fmt(saved.clockMs / 1000)}${saved.clockRunning ? ' (running)' : ''}`
        : '';
    status.append(
      h('span', { class: 'lp-start-dot' }),
      `This browser saved a place: ${saved.key}${clock}. `,
      restart,
    );
  };
  renderStatus();
  win.addEventListener('storage', renderStatus);
  win.addEventListener('focus', renderStatus);

  const meta = o.project.meta;
  const kicker = [meta.author, meta.course].filter(Boolean).join(' · ');
  const steps = totalSteps(deck);
  const counts = [
    `${deck.scenes.length} ${deck.scenes.length === 1 ? 'scene' : 'scenes'}`,
    `${steps} ${steps === 1 ? 'step' : 'steps'}`,
    deck.targetSeconds > 0 ? `${fmt(deck.targetSeconds)} in all` : '',
  ].filter(Boolean);

  const cards = o.notes
    ? [
        card(
          'Presenter console',
          'Each step beside its speaker notes, script, cues, clocks and sources. It opens the slides in a second window for a projector.',
          'Open the console →',
          '?view=presenter',
          true,
        ),
        card(
          'Full-screen slides',
          'The slides alone, as the room sees them. F for full screen, → and ← to step through, N for rehearsal notes.',
          'Open the slides →',
          '?view=audience&rehearse',
        ),
      ]
    : [
        card(
          'Slides',
          'The slides, as the room sees them. F for full screen, → and ← to step through.',
          'Open the slides →',
          '?view=audience',
          true,
        ),
      ];

  const reference = (ref: ReturnType<typeof referenceList>[number]): HTMLElement => {
    const s = ref.source;
    const about = [s.summary, citedIn(deck, ref.scenes), s.licence ? `Licence: ${s.licence}.` : '']
      .filter(Boolean)
      .join(' ');
    const doi = s.doi && !s.apa.includes(s.doi) ? `https://doi.org/${s.doi}` : null;
    return h(
      'li',
      null,
      h(
        'p',
        { class: 'lp-ref-apa' },
        ...referenceSpans(s.apa).map((span) =>
          span.href
            ? h('a', { href: span.href, target: '_blank', rel: 'noopener noreferrer' }, span.text)
            : span.italic
              ? h('i', null, span.text)
              : span.text,
        ),
        doi ? ' ' : null,
        doi ? h('a', { href: doi, target: '_blank', rel: 'noopener noreferrer' }, doi) : null,
      ),
      about ? h('p', { class: 'lp-ref-about' }, about) : null,
      ref.parts.length > 0 ? h('ul', { class: 'lp-ref-parts' }, ...ref.parts.map(reference)) : null,
    );
  };
  const references = referenceList(o.project);

  // A division, not a second main: the page around it is the main landmark.
  const page = h(
    'div',
    { class: 'lp-start' },
    h(
      'header',
      null,
      kicker ? h('div', { class: 'lp-start-kicker' }, kicker) : null,
      h('h1', null, meta.title),
      h('p', { class: 'lp-start-meta' }, counts.join(' · ')),
    ),
    meta.description ? h('p', { class: 'lp-start-intro' }, meta.description) : null,
    h(
      'p',
      { class: 'lp-start-intro' },
      `The presentation in one file: it runs offline, from any folder. Chrome or Edge works best. ${presenterWords(o.project, o.notes)}`,
    ),
    status,
    h('div', { class: 'lp-start-cards' }, ...cards),
    o.notes
      ? h(
          'section',
          { class: 'lp-start-steps' },
          h('h2', null, 'Presenting on a projector'),
          h(
            'ol',
            null,
            h('li', null, 'If the line above shows a saved place from a rehearsal, start again first.'),
            h(
              'li',
              null,
              'Connect the projector and extend the desktop onto it (Windows: the Windows key + P, then Extend; Mac: System Settings, Displays).',
            ),
            h('li', null, 'Open the Presenter console on your laptop screen.'),
            h(
              'li',
              null,
              'Click Send to projector (Chrome or Edge), or Open audience window and drag the window onto the projector.',
            ),
            h('li', null, 'Click the audience window once and press F for full screen.'),
            h('li', null, 'Press T in the console when you start speaking. → or a clicker moves on.'),
          ),
        )
      : null,
    h(
      'section',
      { class: 'lp-start-steps' },
      h('h2', null, 'Keys'),
      h(
        'dl',
        { class: 'lp-start-keys' },
        ...KEYS.filter(([, , needsNotes]) => o.notes || !needsNotes).flatMap(([k, what]) => [
          h('dt', null, k),
          h('dd', null, what),
        ]),
      ),
    ),
    references.length > 0
      ? h(
          'section',
          { class: 'lp-start-refs' },
          h('h2', null, 'Sources'),
          h('ul', { class: 'lp-ref-list' }, ...references.map(reference)),
        )
      : null,
  );
  o.host.appendChild(page);
  return {
    dispose: () => {
      win.removeEventListener('storage', renderStatus);
      win.removeEventListener('focus', renderStatus);
      page.remove();
    },
  };
}
