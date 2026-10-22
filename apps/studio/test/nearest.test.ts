// Which link a click means, where links run close: the nearest curve, and arrowheads that only flip their own
// link's sign when the pointer is nearer them than any other line.
import { describe, expect, it } from 'vitest';
import { distanceToCurve, headIsNearer, nearestLink } from '../src/map/nearest.ts';

const straight = { p0: { x: 0, y: 0 }, c: { x: 50, y: 0 }, p1: { x: 100, y: 0 } };
const arc = { p0: { x: 0, y: 0 }, c: { x: 50, y: 100 }, p1: { x: 100, y: 0 } };

describe('the distance from a point to a link', () => {
  it('is the distance to the nearest point of its curve', () => {
    expect(distanceToCurve({ x: 30, y: 7 }, straight)).toBeCloseTo(7, 6);
    expect(distanceToCurve({ x: -3, y: -4 }, straight)).toBeCloseTo(5, 3);
    // The arc's middle is at (50, 50): half way to its control point.
    expect(distanceToCurve({ x: 50, y: 60 }, arc)).toBeCloseTo(10, 6);
  });
});

describe('the link a click means', () => {
  it('is the nearest of the links under the pointer, else the one clicked', () => {
    const under = (ids: string[]) =>
      ({
        elementsFromPoint: () =>
          ids.map((id) => {
            const el = document.createElement('div');
            el.className = 'hit';
            el.setAttribute('data-edge', id);
            return el;
          }),
      }) as unknown as Document;
    const curves = (id: string) => ({ A: straight, B: arc })[id];
    expect(nearestLink(under(['A', 'B']), 0, 0, '.hit', { x: 50, y: 45 }, curves, 'A')).toBe('B');
    expect(nearestLink(under(['B', 'A']), 0, 0, '.hit', { x: 50, y: 4 }, curves, 'B')).toBe('A');
    expect(nearestLink({} as Document, 0, 0, '.hit', { x: 50, y: 4 }, curves, 'B')).toBe('B');
  });

  it('flips a sign at an arrowhead only when no other line passes nearer', () => {
    const below = { p0: { x: 0, y: 40 }, c: { x: 50, y: 40 }, p1: { x: 100, y: 40 } };
    expect(headIsNearer({ x: 98, y: 1 }, straight, below)).toBe(true);
    expect(headIsNearer({ x: 60, y: 38 }, straight, below)).toBe(false);
  });
});
