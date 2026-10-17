// The constellation layout, the polycrisis map's look: each category a cluster around the centre, its
// variables gathered inside a soft halo, the best-connected nearest the cluster's heart. Clusters sit on an
// ellipse in category order, starting at the top; a seeded force pass then spaces the variables out and
// pulls linked ones together a little. Deterministic: the same map and seed give the same layout.
import { compareStrings } from '@loopweft/model';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { Pt } from './geometry.ts';

export interface ConstellationNode {
  id: string;
  /** The category, or null for a variable without one (placed at the centre). */
  category: string | null;
  /** A pinned position: kept as it is. */
  pinned?: Pt;
}

export interface ConstellationInput {
  nodes: ConstellationNode[];
  links: { from: string; to: string }[];
  /** Category ids in order; clusters follow this order round the ellipse. */
  categories: string[];
  width?: number;
  height?: number;
  seed?: number;
}

export interface ClusterHalo {
  /** The category id. */
  id: string;
  halo: { x: number; y: number; r: number };
  labelAt: Pt;
}

export interface ConstellationResult {
  positions: Map<string, Pt>;
  clusters: ClusterHalo[];
}

/** Numerical Recipes LCG (as in the force layout): the only randomness, fixed by the seed. */
const lcg = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPACING = 62;
const MARGIN = { x: 90, top: 150, bottom: 70 };

type SimNode = SimulationNodeDatum & { id: string };

export function constellationLayout(input: ConstellationInput): ConstellationResult {
  const width = input.width ?? 1920;
  const height = input.height ?? 1080;
  const rnd = lcg(input.seed ?? 1337);
  const degree = new Map<string, number>();
  for (const l of input.links) {
    degree.set(l.from, (degree.get(l.from) ?? 0) + 1);
    degree.set(l.to, (degree.get(l.to) ?? 0) + 1);
  }

  // Clusters on an ellipse in category order, from the top, clockwise; uncategorized variables at the centre.
  const members = new Map<string, ConstellationNode[]>();
  for (const n of input.nodes) {
    const key = n.category !== null && input.categories.includes(n.category) ? n.category : '';
    members.set(key, [...(members.get(key) ?? []), n]);
  }
  const used = input.categories.filter((c) => members.has(c));
  const cx = width / 2;
  const cy = (MARGIN.top + height - MARGIN.bottom) / 2;
  const rx = used.length > 1 ? width * 0.31 : 0;
  const ry = used.length > 1 ? (height - MARGIN.top - MARGIN.bottom) * 0.36 : 0;
  const centres = new Map<string, Pt>([['', { x: cx, y: cy }]]);
  used.forEach((c, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / used.length;
    centres.set(c, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  });

  // Inside a cluster, a sunflower spiral: the best-connected variables nearest its heart.
  const start = new Map<string, Pt>();
  for (const [key, group] of members) {
    const centre = centres.get(key) as Pt;
    const ordered = [...group].sort(
      (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || compareStrings(a.id, b.id),
    );
    ordered.forEach((n, i) => {
      const r = SPACING * Math.sqrt(i + 0.5) * 0.9;
      const a = i * GOLDEN_ANGLE;
      start.set(n.id, { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) });
    });
  }

  const target = (id: string) => {
    const n = input.nodes.find((x) => x.id === id) as ConstellationNode;
    const key = n.category !== null && centres.has(n.category) ? n.category : '';
    return centres.get(key) as Pt;
  };
  const sim: SimNode[] = input.nodes.map((n) => {
    const p = n.pinned ?? (start.get(n.id) as Pt);
    return { id: n.id, x: p.x, y: p.y, ...(n.pinned ? { fx: n.pinned.x, fy: n.pinned.y } : {}) };
  });
  const ids = new Set(input.nodes.map((n) => n.id));
  const links: SimulationLinkDatum<SimNode>[] = input.links
    .filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to)
    .map((l) => ({ source: l.from, target: l.to }));
  const simulation = forceSimulation(sim)
    .force('charge', forceManyBody().strength(-90))
    .force('collide', forceCollide(SPACING / 2 + 6).strength(0.9))
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(links)
        .id((d) => d.id)
        .distance(180)
        .strength(0.02),
    )
    .force('x', forceX<SimNode>((d) => target(d.id).x).strength(0.12))
    .force('y', forceY<SimNode>((d) => target(d.id).y).strength(0.12))
    .randomSource(rnd)
    .stop();
  for (let i = 0; i < 300; i++) simulation.tick();

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const positions = new Map<string, Pt>();
  for (const n of sim) {
    const pinned = input.nodes.find((x) => x.id === n.id)?.pinned;
    positions.set(
      n.id,
      pinned ?? {
        x: Math.round(clamp(n.x ?? cx, MARGIN.x, width - MARGIN.x)),
        y: Math.round(clamp(n.y ?? cy, MARGIN.top, height - MARGIN.bottom)),
      },
    );
  }

  const clusters: ClusterHalo[] = used.map((c) => {
    const pts = (members.get(c) ?? []).map((n) => positions.get(n.id) as Pt);
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const r = Math.max(90, ...pts.map((p) => Math.hypot(p.x - x, p.y - y) + 60));
    const above = y < cy;
    return {
      id: c,
      halo: { x: Math.round(x), y: Math.round(y), r: Math.round(r) },
      labelAt: { x: Math.round(x), y: Math.round(above ? y - r - 14 : y + r + 24) },
    };
  });
  return { positions, clusters };
}
