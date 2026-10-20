// Source: PolycrisisPresentation src/audience/audience.ts @ 3e5da10 (private), adapted for Loopweft: the
// stage is @loopweft/render's StoryView playing the project's story, the windows talk over the player's Link,
// and the window also names categories in words (C), steps on a tap or swipe, and can take stills (capture).
import type { Project } from '@loopweft/model';
import { type Clock, FrameClock, IntervalClock, Motion } from '@loopweft/motion';
import { h, StoryView, themeTokens } from '@loopweft/render';
import { keepAwake, ProgressBar } from './chrome.ts';
import { type Deck, deckOf, parseKey, sceneAt } from './deck.ts';
import { isTypingTarget, JumpBuffer, jumpDigits, mapKey } from './keys.ts';
import { browserHost, joinToken, Link } from './link.ts';
import { RehearsalNotes } from './rehearsal.ts';
import { browserAddress, type ChangeReason, ShowSession } from './session.ts';
import type { ShowState } from './show.ts';
import { stageDriver } from './stage.ts';
import { browserStorage, type KeyValue, PresentationStore } from './storage.ts';
import { PresenterClock } from './timing.ts';

export interface AudienceOptions {
  /** Where the stage goes: the page's body, or an element covering the window. */
  host: HTMLElement;
  project: Project;
  /** The presentation's id (`presentationId` of the project's text). */
  show: string;
  /** Opened to rehearse alone: rehearsal notes on N, and the presenter's clock on T while they show. */
  rehearse: boolean;
  /** For stills: the step the address names, at once, on a timer clock; no link, keys or chrome. */
  capture?: boolean;
  /** Writes the step on show into the page address (default: yes). */
  address?: boolean;
  /** Paints the page behind the stage in the theme's colour (default: yes; not over the Studio). */
  paintPage?: boolean;
  win?: Window;
  storage?: KeyValue | null;
  /** The animation clock (tests step one by hand); by default the display's frames. */
  clock?: Clock;
}

export interface Audience {
  readonly story: StoryView;
  readonly session: ShowSession | null;
  readonly deck: Deck;
  dispose(): void;
}

interface AudiencePrefs {
  chrome: boolean;
}

/** The audience window: the story on the stage, nothing else, kept in step with the console. */
export function startAudience(o: AudienceOptions): Audience {
  const win = o.win ?? window;
  const doc = win.document;
  const deck = deckOf(o.project);
  const motion = new Motion(o.clock ?? (o.capture ? new IntervalClock(60) : new FrameClock()));
  const story = new StoryView(o.host, { project: o.project, motion });
  const stops: Array<() => void> = [() => story.dispose(), () => motion.dispose()];
  // Label sizes depend on the web fonts; place them again once the fonts are in.
  void doc.fonts?.ready.then(() => story.relayout());
  if (o.paintPage !== false) doc.body.style.background = themeTokens(o.project).bgDeep;

  if (o.capture) {
    const show = () => {
      const pos = parseKey(deck, win.location.hash);
      if (pos) story.show(sceneAt(deck, pos).index, pos.b, 'instant');
    };
    show();
    win.addEventListener('hashchange', show);
    stops.push(() => win.removeEventListener('hashchange', show));
    return {
      story,
      session: null,
      deck,
      dispose: () => {
        for (const stop of stops.reverse()) stop();
      },
    };
  }

  const store = new PresentationStore(o.show, o.storage === undefined ? browserStorage() : o.storage);
  const prefs: AudiencePrefs = {
    chrome: true,
    ...((store.load('audience') as Partial<AudiencePrefs>) ?? {}),
  };
  const progress = new ProgressBar(story.stage.layers.chrome, deck);
  progress.setVisible(prefs.chrome);
  const blackout = h('div', { class: 'lp-blackout', 'aria-hidden': 'true' });
  o.host.appendChild(blackout);
  stops.push(() => blackout.remove());
  const clock = new PresenterClock(store, deck, () => Date.now());
  const notes = o.rehearse ? new RehearsalNotes(o.host, deck, clock) : null;
  if (notes) stops.push(() => notes.el.remove());

  let shown: ShowState | null = null;
  const drive = stageDriver({ story, motion, deck, blackout });
  const render = (next: ShowState, prev: ShowState | null, reason: ChangeReason) => {
    if (deck.scenes.length === 0) return;
    drive(next, prev, reason);
    progress.update(next.pos);
    // The console keeps the clock; a window rehearsing alone keeps it instead.
    if (!link.alive('presenter')) clock.noteScene(next.pos);
    notes?.update(next.pos);
    shown = next;
  };

  const link = new Link('audience', o.show, browserHost(win), { token: joinToken(win, o.show) });
  const session: ShowSession = new ShowSession({
    deck,
    link,
    store,
    address: o.address === false ? null : browserAddress(win),
    now: () => Date.now(),
    onChange: (next, prev, reason) => render(next, shown ?? prev, reason),
  });
  stops.push(
    link.onPeers(() => {
      // Never leave rehearsal notes open once a real console is connected.
      if (notes?.isOpen && link.alive('presenter')) notes.setOpen(false);
    }),
  );
  render(session.state, null, 'sync');
  session.start();
  stops.push(() => {
    session.stop();
    link.stop();
  });
  stops.push(keepAwake(doc));
  const ticker = win.setInterval(() => notes?.tick(), 500);
  stops.push(() => win.clearInterval(ticker));

  // ----- Keys -----
  const jump = new JumpBuffer(2500, jumpDigits(deck));
  const onKey = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    const action = mapKey(e, 'audience');
    if (!action) return;
    e.preventDefault();
    hideHint();
    switch (action.kind) {
      case 'swallow':
        return;
      case 'show':
        session.dispatch(action.cmd);
        return;
      case 'digit':
        jump.push(action.digit, Date.now());
        return;
      case 'enter': {
        const n = jump.take(Date.now());
        session.dispatch(n !== null ? { type: 'gotoScene', number: n } : { type: 'next' });
        return;
      }
      case 'local':
        switch (action.action) {
          case 'fullscreen':
            toggleFullscreen(doc);
            return;
          case 'notesOverlay':
            if (notes && !link.alive('presenter')) notes.toggle();
            return;
          case 'chrome':
            prefs.chrome = !prefs.chrome;
            progress.setVisible(prefs.chrome);
            store.save('audience', prefs);
            return;
          case 'clockToggle':
            if (!notes?.isOpen) return;
            clock.reload();
            clock.toggle(session.state.pos);
            notes.tick();
            return;
          case 'clockReset':
            if (!notes?.isOpen || !win.confirm('Reset the presenter clock to 0:00?')) return;
            clock.reset(session.state.pos);
            notes.tick();
            return;
          case 'cancel':
            jump.clear();
            return;
          default:
            return;
        }
    }
  };
  doc.addEventListener('keydown', onKey);
  stops.push(() => doc.removeEventListener('keydown', onKey));
  const onDouble = (e: MouseEvent) => {
    if (!notes?.el.contains(e.target as Node)) toggleFullscreen(doc);
  };
  doc.addEventListener('dblclick', onDouble);
  stops.push(() => doc.removeEventListener('dblclick', onDouble));

  // ----- Touch: a tap on the right two thirds or a swipe left goes on; a tap on the left third or a swipe right goes back -----
  let touch: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    touch =
      e.pointerType === 'touch' && !notes?.el.contains(e.target as Node)
        ? { x: e.clientX, y: e.clientY }
        : null;
  };
  const onUp = (e: PointerEvent) => {
    if (!touch || e.pointerType !== 'touch') return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    touch = null;
    hideHint();
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy))
      session.dispatch({ type: dx < 0 ? 'next' : 'prev' });
    else if (Math.abs(dx) < 12 && Math.abs(dy) < 12)
      session.dispatch({ type: e.clientX > win.innerWidth / 3 ? 'next' : 'prev' });
  };
  o.host.addEventListener('pointerdown', onDown);
  o.host.addEventListener('pointerup', onUp);
  stops.push(() => {
    o.host.removeEventListener('pointerdown', onDown);
    o.host.removeEventListener('pointerup', onUp);
  });

  // ----- The hint at the start, and the pointer hiding while still -----
  const hint = h(
    'div',
    { class: 'lp-hint' },
    o.rehearse
      ? 'F full screen · ← → move · N rehearsal notes · C categories in words'
      : 'F (or double-click) for full screen · ← → move',
  );
  o.host.appendChild(hint);
  const hintTimer = win.setTimeout(hideHint, 7000);
  function hideHint() {
    win.clearTimeout(hintTimer);
    hint.classList.add('gone');
  }
  const onFull = () => {
    if (doc.fullscreenElement) hideHint();
  };
  doc.addEventListener('fullscreenchange', onFull);
  let cursorTimer = 0;
  const onMove = () => {
    doc.body.classList.remove('lp-hide-cursor');
    win.clearTimeout(cursorTimer);
    cursorTimer = win.setTimeout(() => doc.body.classList.add('lp-hide-cursor'), 2500);
  };
  doc.addEventListener('mousemove', onMove);
  stops.push(() => {
    hint.remove();
    win.clearTimeout(hintTimer);
    win.clearTimeout(cursorTimer);
    doc.removeEventListener('fullscreenchange', onFull);
    doc.removeEventListener('mousemove', onMove);
    doc.body.classList.remove('lp-hide-cursor');
  });

  return {
    story,
    session,
    deck,
    dispose: () => {
      for (const stop of stops.reverse()) stop();
    },
  };
}

export function toggleFullscreen(doc: Document = document): void {
  if (doc.fullscreenElement) {
    void doc.exitFullscreen();
    return;
  }
  // Full screen needs a click or key in this window; the hint says how.
  doc.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
}
