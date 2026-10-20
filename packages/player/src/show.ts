// Source: PolycrisisPresentation src/core/show.ts @ 3e5da10 (private), adapted for Loopweft: the deck comes
// from the project, and the show also carries the category-in-words mode, which every window shows alike.
import {
  type Deck,
  firstPos,
  isValidPos,
  lastPos,
  nextPos,
  nextScenePos,
  type Pos,
  prevPos,
  prevScenePos,
  samePos,
  sceneStartPos,
} from './deck.ts';

/**
 * How the current place was reached. The audience uses it to choose how to move there:
 *  - forward: one step ahead: the step's full motion;
 *  - backward: one step back: a quick fade, no flourishes;
 *  - jump: anywhere else: a quick fade, no flourishes;
 *  - replay: the same step again: back to the step before at once, then forward again;
 *  - sync: a window (re)joining the show: at once.
 */
export type NavKind = 'forward' | 'backward' | 'jump' | 'replay' | 'sync';

/** Everything an audience window needs to draw. Snapshots: applying one twice changes nothing. */
export interface ShowState {
  pos: Pos;
  nav: { kind: NavKind; seq: number };
  /** Raised to ask the audience to finish its running animations now. */
  skipToken: number;
  paused: boolean;
  blackout: boolean;
  lowPower: boolean;
  /** Each shown variable's category, in words (decision 22 of the format). */
  categoryWords: boolean;
  /** When this changed, by the presenter's computer clock (ms): the newest state wins on reconnecting. */
  updatedAt: number;
}

export type Command =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'nextScene' }
  | { type: 'prevScene' }
  | { type: 'first' }
  | { type: 'last' }
  | { type: 'gotoScene'; number: number }
  | { type: 'goto'; pos: Pos }
  | { type: 'repeat' }
  | { type: 'skip' }
  | { type: 'togglePause' }
  | { type: 'toggleBlackout' }
  | { type: 'toggleLowPower' }
  | { type: 'toggleCategoryWords' };

export function initialShowState(now: number, pos: Pos = firstPos()): ShowState {
  return {
    pos,
    nav: { kind: 'sync', seq: 0 },
    skipToken: 0,
    paused: false,
    blackout: false,
    lowPower: false,
    categoryWords: false,
    updatedAt: now,
  };
}

function moveTo(state: ShowState, pos: Pos | null, kind: NavKind, now: number): ShowState {
  if (!pos || samePos(pos, state.pos)) return state;
  // Moving always resumes the animation, so the next step never appears frozen.
  return { ...state, pos, nav: { kind, seq: state.nav.seq + 1 }, paused: false, updatedAt: now };
}

/** The show after a command. Returns the same object when the command changes nothing. */
export function reduce(deck: Deck, state: ShowState, cmd: Command, now: number): ShowState {
  if (deck.scenes.length === 0) return state;
  switch (cmd.type) {
    case 'next':
      return moveTo(state, nextPos(deck, state.pos), 'forward', now);
    case 'prev':
      return moveTo(state, prevPos(deck, state.pos), 'backward', now);
    case 'nextScene':
      return moveTo(state, nextScenePos(deck, state.pos), 'jump', now);
    case 'prevScene':
      return moveTo(state, prevScenePos(state.pos), 'jump', now);
    case 'first':
      return moveTo(state, firstPos(), 'jump', now);
    case 'last':
      return moveTo(state, lastPos(deck), 'jump', now);
    case 'gotoScene':
      return moveTo(state, sceneStartPos(deck, cmd.number), 'jump', now);
    case 'goto': {
      if (!isValidPos(deck, cmd.pos)) return state;
      const next = nextPos(deck, state.pos);
      return moveTo(state, cmd.pos, next && samePos(next, cmd.pos) ? 'forward' : 'jump', now);
    }
    case 'repeat':
      return { ...state, nav: { kind: 'replay', seq: state.nav.seq + 1 }, paused: false, updatedAt: now };
    case 'skip':
      return { ...state, skipToken: state.skipToken + 1, updatedAt: now };
    case 'togglePause':
      return { ...state, paused: !state.paused, updatedAt: now };
    case 'toggleBlackout':
      return { ...state, blackout: !state.blackout, updatedAt: now };
    case 'toggleLowPower':
      return { ...state, lowPower: !state.lowPower, updatedAt: now };
    case 'toggleCategoryWords':
      return { ...state, categoryWords: !state.categoryWords, updatedAt: now };
  }
}

/** A stored or received state, if it still fits the deck; it then shows at once (`sync`). */
export function sanitizeShowState(deck: Deck, value: unknown, now: number): ShowState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ShowState>;
  const pos = v.pos as Partial<Pos> | undefined;
  if (!pos || typeof pos.s !== 'number' || typeof pos.b !== 'number') return null;
  if (!isValidPos(deck, { s: pos.s, b: pos.b })) return null;
  return {
    ...initialShowState(now, { s: pos.s, b: pos.b }),
    skipToken: typeof v.skipToken === 'number' ? v.skipToken : 0,
    paused: v.paused === true,
    blackout: v.blackout === true,
    lowPower: v.lowPower === true,
    categoryWords: v.categoryWords === true,
    updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : now,
    nav: { kind: 'sync', seq: typeof v.nav?.seq === 'number' ? v.nav.seq : 0 },
  };
}
