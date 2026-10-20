// Source: PolycrisisPresentation src/core/keys.ts @ 3e5da10 (private), adapted for Loopweft: C names each
// shown variable's category in words, in either window; the console's G and F choose its Notes and Script.
import type { Deck } from './deck.ts';
import type { Command } from './show.ts';

export type Role = 'presenter' | 'audience';

export type LocalAction =
  | 'fullscreen'
  | 'notes'
  | 'script'
  | 'clockToggle'
  | 'clockReset'
  | 'notesOverlay'
  | 'scrollUp'
  | 'scrollDown'
  | 'help'
  | 'chrome'
  | 'cancel';

export type KeyAction =
  | { kind: 'show'; cmd: Command }
  | { kind: 'local'; action: LocalAction }
  | { kind: 'digit'; digit: number }
  | { kind: 'enter' }
  /** Known, and ignored on purpose (F5 from a clicker, a held key). */
  | { kind: 'swallow' };

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat?: boolean;
}

const show = (cmd: Command): KeyAction => ({ kind: 'show', cmd });
const local = (action: LocalAction): KeyAction => ({ kind: 'local', action });

const NAVIGATION = new Set(['ArrowRight', 'ArrowLeft', ' ', 'PageDown', 'PageUp', 'Enter']);

/**
 * What a key does. Clickers send PageDown and PageUp, "b" or "." to blank the screen and F5 or Escape to start
 * and stop: all are handled or made harmless. Ctrl, Alt and Meta shortcuts are left to the browser.
 */
export function mapKey(e: KeyInput, role: Role): KeyAction | null {
  if (e.key === 'F5') return { kind: 'swallow' };
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  // Holding a key must not race through the steps.
  if (e.repeat && NAVIGATION.has(e.key)) return { kind: 'swallow' };

  switch (e.key) {
    case 'ArrowRight':
      return show(e.shiftKey ? { type: 'nextScene' } : { type: 'next' });
    case 'ArrowLeft':
      return show(e.shiftKey ? { type: 'prevScene' } : { type: 'prev' });
    case ' ':
    case 'PageDown':
      return show({ type: 'next' });
    case 'PageUp':
      return show({ type: 'prev' });
    case 'Home':
      return show({ type: 'first' });
    case 'End':
      return show({ type: 'last' });
    case 'Enter':
      return { kind: 'enter' };
    case 'Escape':
      return local('cancel');
  }

  if (/^[0-9]$/.test(e.key)) return { kind: 'digit', digit: Number(e.key) };

  switch (e.key.toLowerCase()) {
    case 'r':
      return show({ type: 'repeat' });
    case 's':
      return show({ type: 'skip' });
    case 'p':
      return show({ type: 'togglePause' });
    case 'b':
    case '.':
      return show({ type: 'toggleBlackout' });
    case 'l':
      return show({ type: 'toggleLowPower' });
    case 'c':
      return show({ type: 'toggleCategoryWords' });
  }

  if (role === 'presenter') {
    switch (e.key.toLowerCase()) {
      case 'g':
        return local('notes');
      case 'f':
        return local('script');
      case 't':
        return local(e.shiftKey ? 'clockReset' : 'clockToggle');
      case 'arrowup':
        return local('scrollUp');
      case 'arrowdown':
        return local('scrollDown');
      case '?':
      case 'h':
        return local('help');
    }
    return null;
  }
  switch (e.key.toLowerCase()) {
    case 'f':
      return local('fullscreen');
    case 'n':
      return local('notesOverlay');
    case 'h':
      return local('chrome');
    // The presenter's clock, in a window rehearsing alone (only while its notes are open).
    case 't':
      return local(e.shiftKey ? 'clockReset' : 'clockToggle');
  }
  return null;
}

/** How many digits a scene jump keeps: enough for the deck's highest scene number, and at least two ("04"). */
export const jumpDigits = (deck: Deck): number =>
  Math.max(2, ...deck.scenes.map((s) => (s.number === undefined ? 0 : String(s.number).length)));

/**
 * Collects typed digits for "a number, then Enter" scene jumps. Digits expire after a pause, so a stray key
 * cannot take over a later Enter. It keeps the last `maxDigits` typed (see `jumpDigits`).
 */
export class JumpBuffer {
  #digits = '';
  #lastAt = Number.NEGATIVE_INFINITY;
  readonly #ttlMs: number;
  readonly #maxDigits: number;

  constructor(ttlMs = 2500, maxDigits = 2) {
    this.#ttlMs = ttlMs;
    this.#maxDigits = maxDigits;
  }

  push(digit: number, now: number): string {
    if (now - this.#lastAt > this.#ttlMs) this.#digits = '';
    this.#digits = (this.#digits + String(digit)).slice(-this.#maxDigits);
    this.#lastAt = now;
    return this.#digits;
  }

  /** The number typed (and clears it), or null if none or it expired. */
  take(now: number): number | null {
    const live = this.#digits !== '' && now - this.#lastAt <= this.#ttlMs;
    const value = live ? Number(this.#digits) : null;
    this.#digits = '';
    return value;
  }

  peek(now: number): string {
    return now - this.#lastAt <= this.#ttlMs ? this.#digits : '';
  }

  clear(): void {
    this.#digits = '';
  }
}

/**
 * True when Enter or Space on this element works it (a link in the notes, a button) rather than the show. A
 * panel focused only to scroll it (the rehearsal notes) is not one: the show keeps those keys there.
 */
export function isControlTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  return !!(target as Element).closest('a[href], button, [role="button"], summary');
}

/** True when a key belongs to a text field, not to the show. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return !!el.closest('input, textarea, select, [contenteditable="true"]');
}
