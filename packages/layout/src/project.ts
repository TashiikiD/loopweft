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

/**
 * Places for the variables that have none of their own. With none placed, the whole map is laid out as a
 * constellation. With some placed, the force layout places the others around them, the placed ones held where
 * they are, so a variable added to a laid-out map lands beside what it links to, not on top of the others (a
 * layout of the whole map would know nothing of where they are).
 */
export function unplacedPositions(project: Project): Record<string, Position> {
  const own = project.layout.positions;
  const missing = project.variables.filter((v) => !own[v.id]);
  if (missing.length === 0) return {};
  const held = Object.fromEntries(Object.entries(own).map(([id, p]) => [id, { ...p, pinned: true }]));
  const laid =
    missing.length === project.variables.length
      ? autoLayout(project, { kind: 'constellation' }).positions
      : autoLayout({ ...project, layout: { ...project.layout, positions: held } }, { kind: 'force' })
          .positions;
  const out: Record<string, Position> = {};
  for (const v of missing) {
    const p = laid[v.id];
    if (p) out[v.id] = p;
  }
  return out;
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
