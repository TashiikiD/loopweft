// Which link a click means, where links run close: the nearest curve, and arrowheads that only flip their own
// link's sign when the pointer is nearer them than any other line.
import { describe, expect, it } from 'vitest';
import { arrowheadTakesClick, distanceToCurve, nearestLink, nearestOtherLink } from '../src/map/nearest.ts';

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

/** A document whose pointer is over the click targets of these links, top first. */
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

describe('the link a click means', () => {
  it('is the nearest of the links under the pointer, else the one clicked', () => {
    const curves = (id: string) => ({ A: straight, B: arc })[id];
    expect(nearestLink(under(['A', 'B']), 0, 0, '.hit', { x: 50, y: 45 }, curves, 'A')).toBe('B');
    expect(nearestLink(under(['B', 'A']), 0, 0, '.hit', { x: 50, y: 4 }, curves, 'B')).toBe('A');
    expect(nearestLink({} as Document, 0, 0, '.hit', { x: 50, y: 4 }, curves, 'B')).toBe('B');
    // Where lines meet, the link clicked keeps the click unless another is nearer by more than the margin.
    expect(nearestLink(under(['A', 'B']), 0, 0, '.hit', { x: 1, y: 0.5 }, curves, 'B', 2)).toBe('B');
    expect(nearestLink(under(['A', 'B']), 0, 0, '.hit', { x: 50, y: 4 }, curves, 'B', 2)).toBe('A');
  });

  it('flips a sign at an arrowhead only when no other line passes nearer, with no preference for its own', () => {
    // B ends at (100, 2); A runs alongside at y = 1. A click at (94, 0) is on B's arrowhead target, 1 unit from A's
    // line and 2 from B's: B's own line must not win it by the selection margin, and its arrowhead (6.3 away) is
    // farther than A's line, so the click selects A and flips nothing.
    const a = { p0: { x: 0, y: 1 }, c: { x: 50, y: 1 }, p1: { x: 100, y: 1 } };
    const b = { p0: { x: 0, y: 2 }, c: { x: 50, y: 2 }, p1: { x: 100, y: 2 } };
    const curves = (id: string) => ({ A: a, B: b })[id];
    const at = { x: 94, y: 0 };
    const rival = nearestOtherLink(under(['B', 'A']), 0, 0, '.hit', at, curves, 'B');
    expect(rival?.id).toBe('A');
    expect(rival?.distance).toBeCloseTo(1, 6);
    expect(arrowheadTakesClick(at, b, rival)).toBe(false);
    // Right at B's end, its arrowhead is nearer than A's line: the click flips B.
    const end = { x: 100, y: 2.2 };
    expect(
      arrowheadTakesClick(end, b, nearestOtherLink(under(['B', 'A']), 0, 0, '.hit', end, curves, 'B')),
    ).toBe(true);
    // With no other link under the pointer, or where the browser cannot say, the arrowhead has it.
    expect(nearestOtherLink(under(['B']), 0, 0, '.hit', at, curves, 'B')).toBeNull();
    expect(nearestOtherLink({} as Document, 0, 0, '.hit', at, curves, 'B')).toBeNull();
    expect(arrowheadTakesClick(at, b, null)).toBe(true);
  });
});
