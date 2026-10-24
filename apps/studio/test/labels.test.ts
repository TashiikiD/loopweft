// The canvas's labels beside the ripple's ▲/▼ badges: a label keeps its preferred side unless the badge sits
// there, and never crosses it, nor, moved, an arrowhead.
import { arrivingMarks, BADGE_R, badgeOffset, distanceToPolygon } from '@loopweft/layout';
import { addLink, createProject, type Project } from '@loopweft/model';
import { buildGraph } from '@loopweft/render';
import { describe, expect, it } from 'vitest';
import { clearLabelPlace, labelBox, labelPlace } from '../src/map/labels.ts';

/** A variable with a wide label below it, and links arriving at both its upper corners. */
function crowded(): Project {
  let p = createProject({ title: 'Crowded' });
  p.variables = [
    { id: 'a', label: 'A variable with a wide label', citations: [] },
    { id: 'b', label: 'B', citations: [] },
    { id: 'c', label: 'C', citations: [] },
  ];
  p.layout.positions = {
    a: { x: 500, y: 500, labelSide: 'below' },
    b: { x: 800, y: 200 },
    c: { x: 200, y: 200 },
  };
  p = addLink(p, { from: 'b', to: 'a', sign: '+' }).project;
  p = addLink(p, { from: 'c', to: 'a', sign: '+' }).project;
  return p;
}

const meets = (b: { x: number; y: number; w: number; h: number }, c: { x: number; y: number }, r: number) => {
  const dx = c.x - Math.max(b.x, Math.min(c.x, b.x + b.w));
  const dy = c.y - Math.max(b.y, Math.min(c.y, b.y + b.h));
  return dx * dx + dy * dy < r * r;
};

const inBox = (b: { x: number; y: number; w: number; h: number }, p: { x: number; y: number }) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

describe('labels on the canvas', () => {
  it('move off the ripple’s badge when it takes a lower corner, and keep their side otherwise', () => {
    const graph = buildGraph(crowded());
    const a = graph.nodes.get('a');
    if (!a) throw new Error('no a');
    // Arrowheads at both upper corners: the badge goes to a lower one, where the label below would be.
    const badge = badgeOffset(graph, 'a');
    expect(badge.y).toBeGreaterThan(0);
    const at = { x: a.x + badge.x, y: a.y + badge.y };
    const k = 1;
    expect(meets(labelBox(labelPlace(a, k)), at, BADGE_R)).toBe(true);
    // Placed clear of it: on another side, its box apart from the badge.
    const place = clearLabelPlace(a, k, badge);
    expect(place).not.toEqual(labelPlace(a, k));
    expect(meets(labelBox(place), at, BADGE_R)).toBe(false);
    // Without a ripple there, the label keeps its side.
    expect(clearLabelPlace(a, k)).toEqual(labelPlace(a, k));
  });

  it('moved off the badge, do not cover an arrowhead arriving at the variable instead', () => {
    const graph = buildGraph(crowded());
    const a = graph.nodes.get('a');
    if (!a) throw new Error('no a');
    const k = 1;
    const badge = badgeOffset(graph, 'a');
    const marks = arrivingMarks(graph, 'a');
    expect(marks).toHaveLength(2);
    // Above, the first side clear of the badge, crosses B→A's arrowhead.
    const above = labelBox(labelPlace(a, k, 'above'));
    expect(marks.some((m) => m.some((p) => inBox(above, p)))).toBe(true);
    const box = labelBox(clearLabelPlace(a, k, badge, marks));
    expect(meets(box, { x: a.x + badge.x, y: a.y + badge.y }, BADGE_R)).toBe(false);
    for (const m of marks) {
      expect(m.some((p) => inBox(box, p))).toBe(false);
      expect(distanceToPolygon(m, { x: box.x + box.w / 2, y: box.y + box.h / 2 })).toBeGreaterThan(0);
    }
  });
});
