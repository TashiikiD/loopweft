// Source: PolycrisisPresentation src/map/labels.ts @ 539bc8e (private), adapted for Loopweft: it reads a
// minimal graph (positions, radii, link curves) and the shared stage size.
//
// Label placement (pure). Labels are a constant size on screen, so placement
// happens in stage pixels for the build's final camera: each label tries
// eight spots around its node and keeps the one that collides least with
// lit links, nodes, earlier labels and reserved regions (captions, minimap).
import { type Camera, project, STAGE } from './camera.ts';
import { HEAD_LEN, type Pt, quad } from './geometry.ts';

/** What placement needs to know about the map: variable positions and radii, and link curves. */
export interface LabelGraph {
  nodes: ReadonlyMap<string, { x: number; y: number; r: number }>;
  /** Link curves, with their ends' ids where known (a ▲/▼ badge keeps clear of its variable's own links). */
  edges: ReadonlyMap<
    string,
    { source?: { id: string }; target?: { id: string }; geom: { p0: Pt; c: Pt; p1: Pt } }
  >;
}

export type LabelSide =
  | 'above'
  | 'below'
  | 'left'
  | 'right'
  | 'above-right'
  | 'above-left'
  | 'below-right'
  | 'below-left';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelRequest {
  id: string;
  w: number;
  h: number;
  preferred: LabelSide;
  /** Higher priority labels are placed first and get the best spots. */
  priority: number;
}

export interface PlacementContext {
  graph: LabelGraph;
  camera: Camera;
  /** Edges drawn prominently enough that labels must not cover them, with a weight. */
  edges: Array<{ id: string; weight: number }>;
  /** Visible nodes (centres and radii come from the graph). */
  nodes: string[];
  /** Nodes showing a ▲/▼ badge (where `badgeOffset` puts it). */
  badges: string[];
  reserved: Box[];
}

const SIDES: LabelSide[] = [
  'right',
  'left',
  'above',
  'below',
  'above-right',
  'below-right',
  'above-left',
  'below-left',
];
const MARGIN = 24;

export function boxFor(side: LabelSide, cx: number, cy: number, gap: number, w: number, h: number): Box {
  const d = gap * 0.72;
  switch (side) {
    case 'right':
      return { x: cx + gap, y: cy - h / 2, w, h };
    case 'left':
      return { x: cx - gap - w, y: cy - h / 2, w, h };
    case 'above':
      return { x: cx - w / 2, y: cy - gap - h, w, h };
    case 'below':
      return { x: cx - w / 2, y: cy + gap, w, h };
    case 'above-right':
      return { x: cx + d, y: cy - d - h, w, h };
    case 'above-left':
      return { x: cx - d - w, y: cy - d - h, w, h };
    case 'below-right':
      return { x: cx + d, y: cy + d, w, h };
    case 'below-left':
      return { x: cx - d - w, y: cy + d, w, h };
  }
}

function overlapArea(a: Box, b: Box, pad = 0): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + pad;
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + pad;
  return w > 0 && h > 0 ? w * h : 0;
}

const inside = (b: Box, x: number, y: number, pad = 0) =>
  x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

/** Choose a side for every requested label. */
export function placeLabels(requests: LabelRequest[], ctx: PlacementContext): Map<string, LabelSide> {
  const { graph, camera } = ctx;
  const edgePoints: Array<{ x: number; y: number; w: number }> = [];
  for (const { id, weight } of ctx.edges) {
    const g = graph.edges.get(id)?.geom;
    if (!g) continue;
    for (let i = 0; i <= 16; i++) {
      const p = quad(g.p0, g.c, g.p1, i / 16);
      const s = project(camera, p.x, p.y);
      edgePoints.push({ x: s.x, y: s.y, w: weight });
    }
  }
  const circles = ctx.nodes.map((id) => {
    const n = graph.nodes.get(id) as { x: number; y: number; r: number };
    const s = project(camera, n.x, n.y);
    return { id, x: s.x, y: s.y, r: n.r * camera.zoom + 4 };
  });
  const badges = ctx.badges.map((id) => {
    const n = graph.nodes.get(id) as { x: number; y: number; r: number };
    const o = badgeOffset(graph, id);
    const s = project(camera, n.x + o.x, n.y + o.y);
    return { id, x: s.x, y: s.y, r: 9 * camera.zoom + 3 };
  });

  /** The cheapest side for one label, given the labels already placed. */
  const choose = (req: LabelRequest, placed: Box[]): { side: LabelSide; box: Box } | null => {
    const n = graph.nodes.get(req.id);
    if (!n) return null;
    const c = project(camera, n.x, n.y);
    const gap = n.r * camera.zoom + 10;
    let best: LabelSide = req.preferred;
    let bestCost = Infinity;
    for (const side of SIDES) {
      const b = boxFor(side, c.x, c.y, gap, req.w, req.h);
      let cost = side === req.preferred ? 0 : side.includes('-') ? 1.5 : 0.8;
      for (const p of edgePoints) if (inside(b, p.x, p.y, 3)) cost += p.w;
      for (const k of circles) if (k.id !== req.id && inside(b, k.x, k.y, k.r)) cost += 10;
      for (const k of badges) if (inside(b, k.x, k.y, k.r)) cost += 8;
      // Labels keep a little air between them, not just avoid overlapping.
      for (const o of placed) cost += overlapArea(b, o, 12) / 60;
      for (const r of ctx.reserved) cost += overlapArea(b, r, 8) / 40;
      if (b.x < MARGIN || b.y < MARGIN || b.x + b.w > STAGE.w - MARGIN || b.y + b.h > STAGE.h - MARGIN)
        cost += 40;
      if (cost < bestCost) {
        best = side;
        bestCost = cost;
      }
    }
    return { side: best, box: boxFor(best, c.x, c.y, gap, req.w, req.h) };
  };

  const result = new Map<string, LabelSide>();
  const boxes = new Map<string, Box>();
  const ordered = [...requests].sort((a, b) => b.priority - a.priority);
  for (const req of ordered) {
    const pick = choose(req, [...boxes.values()]);
    if (!pick) continue;
    result.set(req.id, pick.side);
    boxes.set(req.id, pick.box);
  }
  // A label placed early could not see the ones placed after it, so a tie
  // could leave two labels touching. Let each reconsider against all the rest.
  for (let pass = 0; pass < 2; pass++) {
    for (const req of ordered) {
      if (!boxes.has(req.id)) continue;
      const pick = choose(
        req,
        [...boxes].filter(([id]) => id !== req.id).map(([, b]) => b),
      ) as { side: LabelSide; box: Box };
      result.set(req.id, pick.side);
      boxes.set(req.id, pick.box);
    }
  }
  return result;
}

/** A ▲/▼/± badge's radius, and its gap from its variable's glyph, in map units. */
export const BADGE_R = 9;
const BADGE_GAP = 6;
/** The corners a badge may take, upper right first (where the deck drew it). */
const CORNERS = [
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
] as const;

/**
 * Where a variable's ▲/▼/± badge goes, from its centre, in map units: its upper right, unless a link arrives
 * there (its arrowhead, which the badge would hide) or another variable sits there; then the first corner clear
 * of both (upper left, lower right, lower left), or, with none clear, the clearest.
 */
export function badgeOffset(graph: LabelGraph, id: string): Pt {
  const n = graph.nodes.get(id);
  if (!n) return { x: 0, y: 0 };
  const points: Pt[] = [];
  // The arrowheads arriving at the variable, and the last stretch of line into each: a badge over them would
  // hide which way the link runs. (A line merely passing under a badge stays readable either side of it.)
  for (const e of graph.edges.values()) {
    if (e.target?.id !== id) continue;
    const { p0, c, p1 } = e.geom;
    for (let i = 0; i <= 24; i++) {
      const p = quad(p0, c, p1, 0.75 + i / 96);
      if (Math.hypot(p.x - p1.x, p.y - p1.y) <= 2 * HEAD_LEN) points.push(p);
    }
    // The arrowhead runs on from the line's end to the glyph's rim.
    const len = Math.hypot(p1.x - c.x, p1.y - c.y) || 1;
    for (const k of [0.5, 1])
      points.push({
        x: p1.x + ((p1.x - c.x) / len) * HEAD_LEN * k,
        y: p1.y + ((p1.y - c.y) / len) * HEAD_LEN * k,
      });
  }
  const others = [...graph.nodes].filter(([other]) => other !== id).map(([, o]) => o);
  const d = n.r + BADGE_GAP;
  let best: Pt = { x: CORNERS[0][0] * d, y: CORNERS[0][1] * d };
  let bestMargin = Number.NEGATIVE_INFINITY;
  for (const [sx, sy] of CORNERS) {
    const at = { x: sx * d, y: sy * d };
    const cx = n.x + at.x;
    const cy = n.y + at.y;
    // How far the badge keeps (with a little air) from the arrowheads, and from every other variable's glyph:
    // a corner on another variable would hide it instead.
    const margin = Math.min(
      ...points.map((p) => Math.hypot(p.x - cx, p.y - cy) - (BADGE_R + 3)),
      ...others.map((o) => Math.hypot(o.x - cx, o.y - cy) - (o.r + BADGE_R + 3)),
      Number.POSITIVE_INFINITY,
    );
    if (margin >= 0) return at;
    if (margin > bestMargin) {
      best = at;
      bestMargin = margin;
    }
  }
  return best;
}

/** Where a loop's name goes beside its badge. */
export type LoopNameSide = 'below' | 'above' | 'right' | 'left';
const NAME_SIDES: LoopNameSide[] = ['below', 'above', 'right', 'left'];

/** The box of a loop's name, in stage pixels, beside a badge of radius `badgeR` centred at (cx, cy). */
export function loopNameBox(
  side: LoopNameSide,
  cx: number,
  cy: number,
  badgeR: number,
  w: number,
  h: number,
): Box {
  const gap = badgeR + 8;
  switch (side) {
    case 'below':
      return { x: cx - w / 2, y: cy + gap, w, h };
    case 'above':
      return { x: cx - w / 2, y: cy - gap - h, w, h };
    case 'right':
      return { x: cx + gap, y: cy - h / 2, w, h };
    case 'left':
      return { x: cx - gap - w, y: cy - h / 2, w, h };
  }
}

export interface LoopNameRequest {
  id: string;
  /** The loop badge's centre, in map units. */
  at: Pt;
  w: number;
  h: number;
}

export interface LoopNamePlacement {
  graph: LabelGraph;
  camera: Camera;
  /** Visible variables, and those showing a ▲/▼ badge. */
  nodes: string[];
  badges: string[];
  /** The variables' labels as placed, and other boxes to keep clear of (captions, minimap, group labels). */
  labels: Box[];
  reserved: Box[];
  /** Every loop badge on show (a name keeps clear of the others' discs), in map units. */
  loops?: Array<{ id: string; at: Pt }>;
}

/** The loop badge's radius in map units (render's loop disc). */
export const LOOP_BADGE_R = 21;

/**
 * A side for each loop's name: below its badge, unless that would cover a variable, a ▲/▼ badge, another loop's
 * badge, a label, another name or a reserved box; then the first clear side (above, right, left), or the least
 * covered.
 */
export function placeLoopNames(
  requests: LoopNameRequest[],
  ctx: LoopNamePlacement,
): Map<string, LoopNameSide> {
  const { graph, camera } = ctx;
  const circles = ctx.nodes.flatMap((id) => {
    const n = graph.nodes.get(id);
    if (!n) return [];
    const s = project(camera, n.x, n.y);
    return [{ x: s.x, y: s.y, r: n.r * camera.zoom + 4 }];
  });
  const badges = ctx.badges.flatMap((id) => {
    const n = graph.nodes.get(id);
    if (!n) return [];
    const o = badgeOffset(graph, id);
    const s = project(camera, n.x + o.x, n.y + o.y);
    return [{ x: s.x, y: s.y, r: BADGE_R * camera.zoom + 3 }];
  });
  const discs = (ctx.loops ?? []).map((l) => {
    const s = project(camera, l.at.x, l.at.y);
    return { id: l.id, x: s.x, y: s.y, r: LOOP_BADGE_R * camera.zoom + 3 };
  });
  const result = new Map<string, LoopNameSide>();
  const placed: Box[] = [];
  for (const req of requests) {
    const c = project(camera, req.at.x, req.at.y);
    let best: LoopNameSide = 'below';
    let bestCost = Infinity;
    for (const side of NAME_SIDES) {
      const b = loopNameBox(side, c.x, c.y, LOOP_BADGE_R * camera.zoom, req.w, req.h);
      let cost = 0;
      for (const k of circles) if (inside(b, k.x, k.y, k.r)) cost += 10;
      for (const k of badges) if (inside(b, k.x, k.y, k.r)) cost += 8;
      // Another loop's badge (its own is beside it by construction).
      for (const k of discs) if (k.id !== req.id && inside(b, k.x, k.y, k.r)) cost += 8;
      for (const o of [...ctx.labels, ...placed]) cost += overlapArea(b, o, 4) / 60;
      for (const r of ctx.reserved) cost += overlapArea(b, r, 4) / 40;
      if (b.x < MARGIN || b.y < MARGIN || b.x + b.w > STAGE.w - MARGIN || b.y + b.h > STAGE.h - MARGIN)
        cost += 40;
      if (cost === 0) {
        best = side;
        break;
      }
      if (cost < bestCost) {
        best = side;
        bestCost = cost;
      }
    }
    result.set(req.id, best);
    placed.push(loopNameBox(best, c.x, c.y, LOOP_BADGE_R * camera.zoom, req.w, req.h));
  }
  return result;
}
