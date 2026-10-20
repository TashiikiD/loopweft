import type { StoryPosition } from '@loopweft/render';
import { describe, expect, it } from 'vitest';
import { indexFromHash, keyAction } from '../src/navigation.ts';

const key = (k: string, mods: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey'>> = {}) =>
  keyAction({ key: k, ctrlKey: false, altKey: false, metaKey: false, ...mods });

describe('viewer keys', () => {
  it('moves forward and back like a presentation remote', () => {
    for (const k of ['ArrowRight', ' ', 'PageDown', 'Enter']) expect(key(k)).toEqual({ kind: 'next' });
    for (const k of ['ArrowLeft', 'PageUp', 'Backspace']) expect(key(k)).toEqual({ kind: 'previous' });
    expect(key('Home')).toEqual({ kind: 'first' });
    expect(key('p')).toEqual({ kind: 'pause' });
    expect(key('C')).toEqual({ kind: 'categoryWords' });
    expect(key('x')).toBeNull();
  });

  it('leaves browser shortcuts alone', () => {
    expect(key('r', { ctrlKey: true })).toBeNull();
    expect(key('f', { metaKey: true })).toBeNull();
  });
});

describe('viewer addresses', () => {
  const positions: StoryPosition[] = [
    { scene: 0, step: 0, key: 'S00.1' },
    { scene: 1, step: 0, key: 'S04.1' },
    { scene: 1, step: 1, key: 'S04.2a' },
  ];

  it('finds the step an address names, by scene and step id', () => {
    expect(indexFromHash('#S04.2a', positions)).toBe(2);
    expect(indexFromHash('#S04.2%61', positions)).toBe(2);
  });

  it('starts at the beginning when the address names no step', () => {
    expect(indexFromHash('', positions)).toBe(0);
    expect(indexFromHash('#S09.9', positions)).toBe(0);
  });
});
