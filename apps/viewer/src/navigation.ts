// What a key does in the viewer, and where a page address points. Pure, so it is tested without a browser.
// The keys follow the deck's audience view (PolycrisisPresentation src/core/keys.ts @ 539bc8e, private).
import type { StoryPosition } from '@loopweft/render';

export type Action =
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'replay' }
  | { kind: 'pause' }
  | { kind: 'skip' }
  | { kind: 'lowPower' }
  | { kind: 'categoryWords' }
  | { kind: 'fullscreen' }
  | { kind: 'help' };

/** The action for a key, or null. Keys with Ctrl, Alt or Meta are left to the browser. */
export function keyAction(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey'>): Action | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Enter':
      return { kind: 'next' };
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
    case 'Backspace':
      return { kind: 'previous' };
    case 'Home':
      return { kind: 'first' };
    case 'End':
      return { kind: 'last' };
    case 'r':
    case 'R':
      return { kind: 'replay' };
    case 'p':
    case 'P':
      return { kind: 'pause' };
    case 's':
    case 'S':
      return { kind: 'skip' };
    case 'l':
    case 'L':
      return { kind: 'lowPower' };
    case 'c':
    case 'C':
      return { kind: 'categoryWords' };
    case 'f':
    case 'F':
      return { kind: 'fullscreen' };
    case '?':
    case 'h':
    case 'H':
      return { kind: 'help' };
    default:
      return null;
  }
}

/** The step a page address names ("#S04.2a": scene id, a dot, step id), or 0. */
export function indexFromHash(hash: string, positions: readonly StoryPosition[]): number {
  const key = decodeURIComponent(hash.replace(/^#/, ''));
  const i = positions.findIndex((p) => p.key === key);
  return i < 0 ? 0 : i;
}
