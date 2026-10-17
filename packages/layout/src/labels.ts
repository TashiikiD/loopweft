// Source: PolycrisisPresentation src/map/labels.ts @ 539bc8e (private), adapted for Loopweft: it reads a
// minimal graph (positions, radii, link curves) and the shared stage size.
//
// Label placement (pure). Labels are a constant size on screen, so placement
// happens in stage pixels for the build's final camera: each label tries
// eight spots around its node and keeps the one that collides least with
// lit links, nodes, earlier labels and reserved regions (captions, minimap).
import { type Camera, project, STAGE } from './camera.ts';
import { type Pt, quad } from './geometry.ts';

/** What placement needs to know about the map: variable positions and radii, and link curves. */
export interface LabelGraph {
  nodes: ReadonlyMap<string, { x: number; y: number; r: number }>;
  edges: ReadonlyMap<string, { geom: { p0: Pt; c: Pt; p1: Pt } }>;
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
  /** Nodes showing a ▲/▼ badge at their upper right. */
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
    const s = project(camera, n.x + n.r + 6, n.y - n.r - 6);
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
