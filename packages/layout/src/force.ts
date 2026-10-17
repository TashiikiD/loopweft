// Source: DataViz packages/module-cld/src/engine/layout.ts @ efcdbe2 (TashiikiD/DataViz, private), itself ported
// from cld-generator engine/cldLayout.ts @ 6e477a3 (DataViz's changes: d3-force only, typed simulation nodes,
// code-unit string ordering, links always carry ids). Copied for Loopweft with minimal local types in place of
// DataViz's CLD definition; the algorithm is unchanged, and computeForceLayout is its Loopweft name.
import { compareStrings } from '@loopweft/model';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
/** A variable to place; `placement` pins it. */
export interface CldNode {
  id: string;
  placement?: { x: number; y: number; pinned: true };
}

export interface CldLink {
  id: string;
  fromId: string;
  toId: string;
}

export interface CldGroup {
  id: string;
  nodeIds: string[];
}

export interface CldLayoutParams {
  /** The diagram area's size when it is fixed (an arranged view); otherwise the layout chooses it. */
  width?: number;
  height?: number;
  padding?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  nodeMargin?: number;
  collidePadding?: number;
  seed?: number;
  iterations?: number;
  linkDistance?: number;
  chargeStrength?: number;
  clusterByGroups?: boolean;
  clusterStrength?: number;
  clusterRadius?: number;
  minimizeCrossings?: boolean;
  crossingIterations?: number;
  crossingJitter?: number;
}

export interface CldDefinition {
  nodes: CldNode[];
  links: CldLink[];
  groups: CldGroup[];
  layout: CldLayoutParams;
}

export interface CldPositionedNode extends CldNode {
  x: number;
  y: number;
}

export type CldPositionedLink = CldLink;

export interface CldLayoutResult {
  width: number;
  height: number;
  nodes: CldPositionedNode[];
  links: CldPositionedLink[];
}

/** Numerical Recipes LCG: the only randomness in the engine, fully determined by the seed. */
const lcg = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Pt = { x: number; y: number };
type Seg = { a: Pt; b: Pt };
type SimNode = SimulationNodeDatum & { id: string };

const cross = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const segmentsIntersect = (s1: Seg, s2: Seg) => {
  const { a, b } = s1;
  const { a: c, b: d } = s2;
  // Ignore intersections at shared endpoints.
  if (
    (a.x === c.x && a.y === c.y) ||
    (a.x === d.x && a.y === d.y) ||
    (b.x === c.x && b.y === c.y) ||
    (b.x === d.x && b.y === d.y)
  ) {
    return false;
  }
  // Strict intersection (exclude colinear/touching) for stability.
  return cross(a, b, c) > 0 !== cross(a, b, d) > 0 && cross(c, d, a) > 0 !== cross(c, d, b) > 0;
};

const countCrossings = (segs: Seg[]) => {
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) if (segmentsIntersect(segs[i] as Seg, segs[j] as Seg)) n++;
  }
  return n;
};

const totalEdgeLength = (segs: Seg[]) =>
  segs.reduce((sum, s) => sum + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 0);

interface Bounds {
  width: number;
  height: number;
  padX: number;
  padY: number;
  nodeW: number;
  nodeH: number;
}

const resolveRectOverlaps = (nodes: CldPositionedNode[], opts: Bounds & { iterations: number }) => {
  const { width, height, padX, padY, nodeW, nodeH, iterations } = opts;
  const hasPinned = nodes.some((n) => n.placement?.pinned === true);
  const movable = nodes.filter((n) => n.placement?.pinned !== true);
  if (movable.length < 2) return;

  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i] as CldPositionedNode;
        const b = nodes[j] as CldPositionedNode;
        const aPinned = a.placement?.pinned === true;
        const bPinned = b.placement?.pinned === true;
        if (aPinned && bPinned) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const ox = nodeW - Math.abs(dx);
        const oy = nodeH - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;

        // Separate along the axis of least penetration.
        const sep = Math.min(ox, oy) + 0.5;
        const pushX = ox < oy;
        const sx = pushX ? (dx >= 0 ? 1 : -1) : 0;
        const sy = pushX ? 0 : dy >= 0 ? 1 : -1;

        if (aPinned) {
          b.x -= sx * sep;
          b.y -= sy * sep;
        } else if (bPinned) {
          a.x += sx * sep;
          a.y += sy * sep;
        } else {
          a.x += sx * (sep / 2);
          a.y += sy * (sep / 2);
          b.x -= sx * (sep / 2);
          b.y -= sy * (sep / 2);
        }
        moved = true;
      }
    }

    // Fit into bounds by translating the whole layout (preferred), then clamping.
    if (!hasPinned) {
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const n of nodes) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
      let tx = 0;
      let ty = 0;
      if (minX < padX) tx += padX - minX;
      if (maxX + tx > width - padX) tx -= maxX + tx - (width - padX);
      if (minY < padY) ty += padY - minY;
      if (maxY + ty > height - padY) ty -= maxY + ty - (height - padY);
      if (tx !== 0 || ty !== 0) {
        for (const n of nodes) {
          n.x += tx;
          n.y += ty;
        }
      }
    }

    for (const n of movable) {
      n.x = clamp(n.x, padX, width - padX);
      n.y = clamp(n.y, padY, height - padY);
    }
    if (!moved) break;
  }
};

const countRectOverlaps = (nodes: CldPositionedNode[], nodeW: number, nodeH: number) => {
  let count = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i] as CldPositionedNode;
      const b = nodes[j] as CldPositionedNode;
      if (Math.abs(a.x - b.x) < nodeW && Math.abs(a.y - b.y) < nodeH) count++;
    }
  }
  return count;
};

/**
 * Deterministic last-resort packing for dense, fully automatic canvases. The force layout remains the
 * primary source of structure; this only runs when collision relaxation cannot satisfy the rectangles.
 */
const packAutomaticNodes = (nodes: CldPositionedNode[], opts: Bounds) => {
  if (nodes.some((n) => n.placement?.pinned === true)) return;
  const { width, height, padX, padY, nodeW, nodeH } = opts;
  if (countRectOverlaps(nodes, nodeW, nodeH) === 0) return;
  const columns = Math.max(1, Math.floor((width - 2 * padX) / nodeW));
  const ordered = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x || compareStrings(a.id, b.id));
  const xStep = columns > 1 ? (width - 2 * padX) / (columns - 1) : 0;
  const rows = Math.ceil(ordered.length / columns);
  const yStep = rows > 1 ? (height - 2 * padY) / (rows - 1) : 0;
  ordered.forEach((node, index) => {
    node.x = padX + (index % columns) * xStep;
    node.y = padY + Math.floor(index / columns) * yStep;
  });
};

/** The room kept between a node's box and the layout padding when the definition sets none. */
export const DEFAULT_NODE_MARGIN = 18;

/** Seeded force layout with group clustering, overlap removal and crossing reduction. */
export const computeCldLayout = (cld: CldDefinition): CldLayoutResult => {
  const width = cld.layout.width ?? 860;
  const height = cld.layout.height ?? 560;
  const padding = cld.layout.padding ?? 44;
  const nodeWidth = cld.layout.nodeWidth ?? 170;
  const nodeHeight = cld.layout.nodeHeight ?? 96;
  const nodeMargin = cld.layout.nodeMargin ?? DEFAULT_NODE_MARGIN;
  const collidePadding = cld.layout.collidePadding ?? 18;
  const iterations = cld.layout.iterations ?? 400;
  const linkDistance = cld.layout.linkDistance ?? 140;
  const chargeStrength = cld.layout.chargeStrength ?? -900;
  const groups = cld.groups.filter((g) => g.nodeIds.length > 0);
  const clusterByGroups = cld.layout.clusterByGroups ?? groups.length > 0;
  const clusterStrength = cld.layout.clusterStrength ?? 0.07;
  const clusterRadius = cld.layout.clusterRadius;
  const seed = cld.layout.seed ?? 1337;
  const minimizeCrossings = cld.layout.minimizeCrossings ?? true;
  const crossingIterations = cld.layout.crossingIterations ?? 900;
  const crossingJitter = cld.layout.crossingJitter ?? 70;

  const rnd = lcg(seed);
  const padX = padding + nodeWidth / 2 + nodeMargin;
  const padY = padding + nodeHeight / 2 + nodeMargin;
  const usableW = Math.max(1, width - 2 * padX);
  const usableH = Math.max(1, height - 2 * padY);
  const pinnedIds = new Set(cld.nodes.filter((n) => n.placement?.pinned === true).map((n) => n.id));

  const nodeToGroupIds = new Map<string, string[]>();
  if (clusterByGroups && groups.length > 0 && clusterStrength > 0) {
    for (const g of groups) {
      for (const nodeId of g.nodeIds) {
        const list = nodeToGroupIds.get(nodeId);
        if (list) list.push(g.id);
        else nodeToGroupIds.set(nodeId, [g.id]);
      }
    }
  }

  const groupCenters = new Map<string, Pt>();
  if (nodeToGroupIds.size > 0) {
    const maxR = Math.max(0, Math.min(width / 2 - padX, height / 2 - padY));
    const autoR = Math.min(Math.max(64, Math.min(usableW, usableH) * 0.28), maxR);
    const r = clamp(clusterRadius ?? autoR, 0, maxR);
    const start = rnd() * Math.PI * 2;
    groups.forEach((g, i) => {
      const angle = start + (i * 2 * Math.PI) / Math.max(1, groups.length);
      groupCenters.set(g.id, { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r });
    });
  }

  const nodeTargets = new Map<string, Pt>();
  if (groupCenters.size > 0) {
    for (const n of cld.nodes) {
      const ids = nodeToGroupIds.get(n.id);
      if (!ids || ids.length === 0) continue;
      let sx = 0;
      let sy = 0;
      let k = 0;
      for (const gid of ids) {
        const c = groupCenters.get(gid);
        if (!c) continue;
        sx += c.x;
        sy += c.y;
        k++;
      }
      nodeTargets.set(n.id, k > 0 ? { x: sx / k, y: sy / k } : { x: width / 2, y: height / 2 });
    }
  }

  const simNodes: SimNode[] = cld.nodes.map((n) => {
    const px = n.placement?.x;
    const py = n.placement?.y;
    const x0 =
      px !== undefined && Number.isFinite(px)
        ? clamp(px, padX, width - padX)
        : padX + rnd() * Math.max(10, width - 2 * padX);
    const y0 =
      py !== undefined && Number.isFinite(py)
        ? clamp(py, padY, height - padY)
        : padY + rnd() * Math.max(10, height - 2 * padY);
    const out: SimNode = { id: n.id, x: x0, y: y0 };
    if (n.placement?.pinned) {
      out.fx = x0;
      out.fy = y0;
    }
    return out;
  });

  const simLinks: SimulationLinkDatum<SimNode>[] = cld.links.map((l) => ({
    source: l.fromId,
    target: l.toId,
  }));

  const sim = forceSimulation(simNodes)
    .force('center', forceCenter(width / 2, height / 2))
    .force('charge', forceManyBody().strength(chargeStrength))
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
        .id((d) => d.id)
        .distance(linkDistance)
        .strength(0.6),
    )
    .force('collide', forceCollide(Math.hypot(nodeWidth, nodeHeight) / 2 + collidePadding).strength(0.9))
    .randomSource(rnd)
    .stop();

  if (nodeTargets.size > 0) {
    sim
      .force(
        'clusterX',
        forceX<SimNode>((d) => nodeTargets.get(d.id)?.x ?? width / 2).strength((d) =>
          nodeTargets.has(d.id) ? clusterStrength : 0,
        ),
      )
      .force(
        'clusterY',
        forceY<SimNode>((d) => nodeTargets.get(d.id)?.y ?? height / 2).strength((d) =>
          nodeTargets.has(d.id) ? clusterStrength : 0,
        ),
      );
  }

  for (let i = 0; i < iterations; i++) sim.tick();

  // Fit to bounds. With pinned nodes, normalize only the movable ones so pins remain true anchors.
  const movableSim = pinnedIds.size > 0 ? simNodes.filter((n) => !pinnedIds.has(n.id)) : simNodes;
  const boundsNodes = movableSim.length > 0 ? movableSim : simNodes;
  const xs = boundsNodes.map((n) => n.x ?? 0);
  const ys = boundsNodes.map((n) => n.y ?? 0);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(1, Math.max(...xs) - minX);
  const spanY = Math.max(1, Math.max(...ys) - minY);
  // Fit to the usable box; allow moderate upscaling to reduce "center clumping" on larger canvases.
  const scale = clamp(Math.min(usableW / spanX, usableH / spanY), 0.2, 1.6);
  const offsetX = padX + (usableW - spanX * scale) / 2;
  const offsetY = padY + (usableH - spanY * scale) / 2;
  const simById = new Map(simNodes.map((n) => [n.id, n]));

  const positionedNodes: CldPositionedNode[] = cld.nodes.map((n) => {
    const sim = simById.get(n.id);
    const rawX = sim?.x ?? width / 2;
    const rawY = sim?.y ?? height / 2;
    // Keep pinned nodes in absolute canvas coordinates; normalize the rest to the usable box.
    const pinned = n.placement?.pinned === true;
    const x = pinned ? rawX : offsetX + (rawX - minX) * scale;
    const y = pinned ? rawY : offsetY + (rawY - minY) * scale;
    return { ...n, x: clamp(x, padX, width - padX), y: clamp(y, padY, height - padY) };
  });

  // If the simulation collapsed into a tight cluster, expand X/Y independently around the centre.
  {
    const movable = positionedNodes.filter((n) => n.placement?.pinned !== true);
    const forBounds = movable.length > 0 ? movable : positionedNodes;
    const usedW = Math.max(
      1,
      Math.max(...forBounds.map((n) => n.x)) - Math.min(...forBounds.map((n) => n.x)),
    );
    const usedH = Math.max(
      1,
      Math.max(...forBounds.map((n) => n.y)) - Math.min(...forBounds.map((n) => n.y)),
    );
    const expandX = clamp((usableW * 0.94) / usedW, 1, 1.55);
    const expandY = clamp((usableH * 0.94) / usedH, 1, 1.55);
    if (expandX > 1.001 || expandY > 1.001) {
      for (const n of movable) {
        n.x = clamp(width / 2 + (n.x - width / 2) * expandX, padX, width - padX);
        n.y = clamp(height / 2 + (n.y - height / 2) * expandY, padY, height - padY);
      }
    }
  }

  const bounds: Bounds = { width, height, padX, padY, nodeW: nodeWidth, nodeH: nodeHeight };
  resolveRectOverlaps(positionedNodes, { ...bounds, iterations: 750 });
  const links = cld.links.map((l) => ({ ...l }));

  if (minimizeCrossings && positionedNodes.length >= 3 && links.length >= 2) {
    const byId = new Map(positionedNodes.map((n) => [n.id, n]));
    const movableNodes = positionedNodes.filter((n) => n.placement?.pinned !== true);
    if (movableNodes.length < 1) return { width, height, nodes: positionedNodes, links };

    const buildSegs = () => {
      const segs: Seg[] = [];
      for (const l of links) {
        const a = byId.get(l.fromId);
        const b = byId.get(l.toId);
        if (a && b) segs.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
      }
      return segs;
    };
    const clampNode = (n: CldPositionedNode) => {
      n.x = clamp(n.x, padX, width - padX);
      n.y = clamp(n.y, padY, height - padY);
    };

    let segs = buildSegs();
    let bestCross = countCrossings(segs);
    let bestLen = totalEdgeLength(segs);
    const accept = () => {
      segs = buildSegs();
      const c = countCrossings(segs);
      if (c < bestCross) {
        bestCross = c;
        bestLen = totalEdgeLength(segs);
        return true;
      }
      if (c === bestCross) {
        const len = totalEdgeLength(segs);
        if (len <= bestLen) {
          bestLen = len;
          return true;
        }
      }
      return false;
    };

    // Deterministic local search: swap + jitter proposals, accept only improvements (ties by length).
    for (let i = 0; i < crossingIterations; i++) {
      const t = i / Math.max(1, crossingIterations - 1);
      const step = Math.max(6, crossingJitter * (1 - t));
      if (rnd() < 0.33) {
        if (movableNodes.length < 2) continue;
        const a = movableNodes[Math.floor(rnd() * movableNodes.length)] as CldPositionedNode;
        const b = movableNodes[Math.floor(rnd() * movableNodes.length)] as CldPositionedNode;
        if (a === b) continue;
        const [a0x, a0y, b0x, b0y] = [a.x, a.y, b.x, b.y];
        a.x = b0x;
        a.y = b0y;
        b.x = a0x;
        b.y = a0y;
        clampNode(a);
        clampNode(b);
        if (accept()) continue;
        a.x = a0x;
        a.y = a0y;
        b.x = b0x;
        b.y = b0y;
      } else {
        const n = movableNodes[Math.floor(rnd() * movableNodes.length)] as CldPositionedNode;
        const [ox, oy] = [n.x, n.y];
        n.x = clamp(ox + (rnd() - 0.5) * step, padX, width - padX);
        n.y = clamp(oy + (rnd() - 0.5) * step, padY, height - padY);
        if (accept()) continue;
        n.x = ox;
        n.y = oy;
      }
      // As in the original, the early exit is only checked after a rejected proposal.
      if (bestCross === 0) break;
    }
  }

  // Crossing minimization can reintroduce overlaps; clean them up.
  resolveRectOverlaps(positionedNodes, { ...bounds, iterations: 1200 });
  packAutomaticNodes(positionedNodes, bounds);
  return { width, height, nodes: positionedNodes, links };
};

/** The seeded force layout (DataViz's computeCldLayout) under its Loopweft name. */
export const computeForceLayout = computeCldLayout;
