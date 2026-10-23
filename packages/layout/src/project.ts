// Layout for a .loopweft project: automatic layouts that keep pinned variables where they are, and the
// drawable geometry (positions, radii, bends, curves) that the renderer and label placement share.
import {
  applyLayout,
  type Group,
  type OpOutput,
  type Position,
  type Project,
  type Variable,
} from '@loopweft/model';
import { type BendReport, chooseBends } from './bends.ts';
import { constellationLayout } from './constellation.ts';
import { flowLayout } from './flow.ts';
import { computeForceLayout } from './force.ts';
import { type EdgeGeometry, edgeGeometry, type Pt } from './geometry.ts';

export type LayoutKind = 'constellation' | 'force' | 'flow';

export interface AutoLayoutOptions {
  kind: LayoutKind;
  /** Default 1337. The same project and seed always give the same layout. */
  seed?: number;
  width?: number;
  height?: number;
}

export interface AutoLayout {
  positions: Record<string, Position>;
  /** Category halos (constellation only). */
  groups: Group[];
}

const pinnedOf = (project: Project): Map<string, Pt> =>
  new Map(
    Object.entries(project.layout.positions)
      .filter(([, p]) => p.pinned)
      .map(([id, p]) => [id, { x: p.x, y: p.y }]),
  );

/** Places every variable; pinned ones stay put (and keep their label side). */
export function autoLayout(project: Project, options: AutoLayoutOptions): AutoLayout {
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const seed = options.seed ?? 1337;
  const pinned = pinnedOf(project);
  const links = project.links.map((l) => ({ id: l.id, from: l.from, to: l.to }));
  let placed: Map<string, Pt>;
  let groups: Group[] = [];
  if (options.kind === 'flow') {
    placed = flowLayout({
      nodes: project.variables.map((v) => ({
        id: v.id,
        ...(pinned.has(v.id) ? { pinned: pinned.get(v.id) } : {}),
      })),
      links,
      width,
      height,
    });
  } else if (options.kind === 'constellation') {
    const result = constellationLayout({
      nodes: project.variables.map((v) => ({
        id: v.id,
        category: v.category ?? null,
        ...(pinned.has(v.id) ? { pinned: pinned.get(v.id) } : {}),
      })),
      links,
      categories: project.types.categories.map((c) => c.id),
      width,
      height,
      seed,
    });
    placed = result.positions;
    const names = new Map(project.types.categories.map((c) => [c.id, c.name]));
    groups = result.clusters.map((c) => ({
      id: c.id,
      category: c.id,
      label: (names.get(c.id) ?? c.id).toUpperCase(),
      halo: c.halo,
      labelAt: c.labelAt,
    }));
  } else {
    const byCategory = new Map<string, string[]>();
    for (const v of project.variables) {
      if (v.category) byCategory.set(v.category, [...(byCategory.get(v.category) ?? []), v.id]);
    }
    const result = computeForceLayout({
      nodes: project.variables.map((v) => {
        const p = pinned.get(v.id);
        return { id: v.id, ...(p ? { placement: { x: p.x, y: p.y, pinned: true as const } } : {}) };
      }),
      links: links.map((l) => ({ id: l.id, fromId: l.from, toId: l.to })),
      groups: [...byCategory].map(([id, nodeIds]) => ({ id, nodeIds })),
      layout: { width, height, seed, nodeWidth: 150, nodeHeight: 70, padding: 40 },
    });
    placed = new Map(result.nodes.map((n) => [n.id, { x: Math.round(n.x), y: Math.round(n.y) }]));
  }
  const positions: Record<string, Position> = {};
  for (const v of project.variables) {
    const p = placed.get(v.id);
    if (!p) continue;
    const old = project.layout.positions[v.id];
    positions[v.id] = old?.pinned ? old : { x: p.x, y: p.y };
  }
  return { positions, groups };
}

const DESCRIPTIONS: Record<LayoutKind, string> = {
  constellation: 'as a constellation by category',
  force: 'with the force layout',
  flow: 'as a flow from causes to effects',
};

/**
 * The edit behind "lay out automatically", in the Studio and in `loopweft layout --auto`: computes the
 * layout and records it with the model's `applyLayout`. Pinned variables stay where they are.
 */
export function applyAutoLayout(
  project: Project,
  options: AutoLayoutOptions,
): OpOutput<ReturnType<typeof applyLayout>['result'] & { kind: LayoutKind; seed: number }> {
  const seed = options.seed ?? 1337;
  const out = applyLayout(
    project,
    autoLayout(project, { ...options, seed }),
    `${DESCRIPTIONS[options.kind]}${options.kind === 'flow' ? '' : ` (seed ${seed})`}`,
  );
  return { ...out, result: { ...out.result, kind: options.kind, seed } };
}

/** Glyph radius in map units: hubs are larger, and ring glyphs a little larger to read as rings. */
export function variableRadius(variable: Variable, shape: string | undefined): number {
  if (variable.size === 'large') return 15;
  return shape === 'ring' ? 13 : 11;
}

export interface MapNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  bend: number;
  geom: EdgeGeometry;
}

export interface MapGeometry {
  nodes: Map<string, MapNode>;
  edges: Map<string, MapEdge>;
  report: BendReport;
}

/** Room around the placed variables for a few placed beside them, in map units. */
const ROOM = 360;
/** A variable's box as the force layout keeps them apart (its glyph and label), and the gap between two rows. */
const BOX = { w: 150, h: 70, gap: 18 };

const overlap = (a: Position, b: Position) => Math.abs(a.x - b.x) < BOX.w && Math.abs(a.y - b.y) < BOX.h;

/**
 * Places for the variables that have none of their own. With none placed, the whole map is laid out as a
 * constellation. With some placed, the force layout places the others around them, the placed ones held where
 * they are, so a variable added to a laid-out map lands beside what it links to, not on top of the others (a
 * layout of the whole map would know nothing of where they are). The force layout works in a frame of its own,
 * so it is given one around the placed variables, with room on every side for as many as are new, wherever on
 * the map they are (their places may be negative or beyond the stage), and only the new places are carried
 * back. Should any new box still overlap another, the frame grows and the layout runs again; after four tries,
 * the new variables go in rows under the placed ones, where nothing is.
 */
export function unplacedPositions(project: Project): Record<string, Position> {
  const own = project.layout.positions;
  const missing = project.variables.filter((v) => !own[v.id]);
  if (missing.length === 0) return {};
  if (missing.length === project.variables.length) {
    const out: Record<string, Position> = {};
    const laid = autoLayout(project, { kind: 'constellation' }).positions;
    for (const v of missing) if (laid[v.id]) out[v.id] = laid[v.id] as Position;
    return out;
  }
  const placed = Object.values(own);
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  const maxY = Math.max(...placed.map((p) => p.y));
  const clear = (out: Record<string, Position>) => {
    const fresh = Object.values(out);
    return fresh.every(
      (p, i) => !placed.some((q) => overlap(p, q)) && !fresh.slice(i + 1).some((q) => overlap(p, q)),
    );
  };
  // Room for three times the new boxes' area, and at the least ROOM on every side.
  const area = missing.length * (BOX.w + BOX.gap) * (BOX.h + BOX.gap);
  let room = Math.max(ROOM, Math.ceil(Math.sqrt(3 * area) / 2 + BOX.w));
  for (let attempt = 0; attempt < 4; attempt++, room = Math.round(room * 1.5)) {
    const width = Math.max(...placed.map((p) => p.x)) - minX + 2 * room;
    const height = maxY - minY + 2 * room;
    const held = Object.fromEntries(
      Object.entries(own).map(([id, p]) => [
        id,
        { x: p.x - minX + room, y: p.y - minY + room, pinned: true },
      ]),
    );
    const laid = autoLayout(
      { ...project, layout: { ...project.layout, positions: held } },
      { kind: 'force', width, height },
    ).positions;
    const out: Record<string, Position> = {};
    for (const v of missing) {
      const p = laid[v.id];
      if (p) out[v.id] = { x: Math.round(p.x + minX - room), y: Math.round(p.y + minY - room) };
    }
    if (clear(out)) return out;
  }
  // Rows under the lowest placed variable, a box and a gap apart.
  const columns = Math.ceil(Math.sqrt(missing.length));
  return Object.fromEntries(
    missing.map((v, i) => [
      v.id,
      {
        x: minX + (i % columns) * (BOX.w + BOX.gap),
        y: maxY + (Math.floor(i / columns) + 1) * (BOX.h + BOX.gap),
      },
    ]),
  );
}

/**
 * Where everything is drawn: each variable's position (its own, else from `unplacedPositions` for those
 * without one) and radius, and each link's bend (set by hand, else chosen) and curve. A link from a
 * variable to itself has no curve and is left out.
 */
export function mapGeometry(project: Project, options: { refineBends?: boolean } = {}): MapGeometry {
  const shapes = new Map(project.types.roles.map((r) => [r.id, r.shape]));
  const auto = unplacedPositions(project);
  const nodes = new Map<string, MapNode>();
  for (const v of project.variables) {
    const p = project.layout.positions[v.id] ?? auto[v.id];
    if (!p) continue;
    nodes.set(v.id, {
      id: v.id,
      x: p.x,
      y: p.y,
      r: variableRadius(v, v.role ? shapes.get(v.role) : undefined),
    });
  }
  const { bends, report } = chooseBends(
    [...nodes.values()],
    project.links.map((l) => ({ id: l.id, from: l.from, to: l.to })),
    { overrides: project.layout.bends, refine: options.refineBends ?? true },
  );
  const edges = new Map<string, MapEdge>();
  for (const l of project.links) {
    const a = nodes.get(l.from);
    const b = nodes.get(l.to);
    const bend = bends.get(l.id);
    if (!a || !b || bend === undefined) continue;
    edges.set(l.id, {
      id: l.id,
      from: l.from,
      to: l.to,
      bend,
      geom: edgeGeometry(a, a.r, b, b.r, bend, l.sign),
    });
  }
  return { nodes, edges, report };
}
