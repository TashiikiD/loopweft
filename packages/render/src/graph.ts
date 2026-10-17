// Source: PolycrisisPresentation src/map/graph.ts @ 539bc8e (private), adapted for Loopweft: the drawable map
// is built from any project (its layout, types and categories) instead of the deck's content files; hubs are
// the variables sized large, responses come from their role, and link curvature comes from @loopweft/layout
// (the deck's bend choice, then route scoring).
//
// The drawable map: every placed variable and link with its position, size, colour, glyph and curve. Pure
// and deterministic (Node-safe).
import { type EdgeGeometry, edgeGeometry, mapGeometry } from '@loopweft/layout';
import type { Link, Project, SHAPES, Sign, Variable } from '@loopweft/model';
import { categoryColours, THEMES } from './theme.ts';

export type Shape = (typeof SHAPES)[number];
export type LabelSide = 'above' | 'below' | 'left' | 'right';
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface GraphNode {
  id: string;
  variable: Variable;
  x: number;
  y: number;
  r: number;
  /** The text drawn on the map: the short map label, else the full one ("\n" breaks the line). */
  label: string;
  /** The side its label prefers; placement may choose another. */
  labelSide: LabelSide;
  colour: string;
  shape: Shape;
  /** A response (its role says so): pulses into it read as relief. */
  response: boolean;
}

export interface GraphEdge {
  id: string;
  link: Link;
  source: GraphNode;
  target: GraphNode;
  sign: Sign;
  bend: number;
  geom: EdgeGeometry;
  /** Links are drawn in their cause's colour. */
  colour: string;
  style: LineStyle;
  /** A small flag at the middle of the link (its type's marker). */
  flag: boolean;
  /** Of an optional link type: hidden unless a step lists it. */
  optional: boolean;
  /** Drawn dashed where it is lit. */
  conditional: boolean;
}

export interface GraphGroup {
  id: string;
  /** The category's colour; null for a group without a category (drawn in the theme's glow colour). */
  colour: string | null;
  label?: string;
  halo?: { x: number; y: number; r: number };
  labelAt?: { x: number; y: number };
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  /** Links by variable, for tracing upstream and downstream. */
  incoming: Map<string, GraphEdge[]>;
  outgoing: Map<string, GraphEdge[]>;
  groups: GraphGroup[];
}

export interface GraphOptions {
  /** Re-bend the links that cross or crowd most, when that helps (default true). */
  refineBends?: boolean;
  /** The colour of variables without a category (default: the cinematic theme's). */
  neutral?: string;
}

/** The drawable map of a project. Variables without a position are placed by the constellation layout. */
export function buildGraph(project: Project, options: GraphOptions = {}): Graph {
  const geometry = mapGeometry(project, { refineBends: options.refineBends ?? true });
  const colours = categoryColours(project);
  const neutral = options.neutral ?? THEMES['cinematic-dark'].neutral;
  const roles = new Map(project.types.roles.map((r) => [r.id, r]));
  const types = new Map(project.types.linkTypes.map((t) => [t.id, t]));

  const nodes = new Map<string, GraphNode>();
  for (const variable of project.variables) {
    const at = geometry.nodes.get(variable.id);
    if (!at) continue;
    const role = variable.role ? roles.get(variable.role) : undefined;
    nodes.set(variable.id, {
      id: variable.id,
      variable,
      x: at.x,
      y: at.y,
      r: at.r,
      label: variable.mapLabel ?? variable.label,
      labelSide: project.layout.positions[variable.id]?.labelSide ?? 'below',
      colour: (variable.category ? colours.get(variable.category) : undefined) ?? neutral,
      shape: role?.shape ?? 'circle',
      response: role?.response === true,
    });
  }

  const edges = new Map<string, GraphEdge>();
  const incoming = new Map<string, GraphEdge[]>();
  const outgoing = new Map<string, GraphEdge[]>();
  for (const link of project.links) {
    const curve = geometry.edges.get(link.id);
    const source = nodes.get(link.from);
    const target = nodes.get(link.to);
    if (!curve || !source || !target) continue;
    const type = link.type ? types.get(link.type) : undefined;
    const edge: GraphEdge = {
      id: link.id,
      link,
      source,
      target,
      sign: link.sign,
      bend: curve.bend,
      geom: curve.geom,
      colour: source.colour,
      style: type?.style ?? 'solid',
      flag: type?.marker === 'flag',
      optional: type?.optional === true,
      conditional: link.conditional === true,
    };
    edges.set(link.id, edge);
    incoming.set(link.to, [...(incoming.get(link.to) ?? []), edge]);
    outgoing.set(link.from, [...(outgoing.get(link.from) ?? []), edge]);
  }

  const groups = project.layout.groups.map((g) => ({
    id: g.id,
    colour: g.category ? (colours.get(g.category) ?? null) : null,
    ...(g.label ? { label: g.label } : {}),
    ...(g.halo ? { halo: g.halo } : {}),
    ...(g.labelAt ? { labelAt: g.labelAt } : {}),
  }));
  return { nodes, edges, incoming, outgoing, groups };
}

/** Moves one variable and reshapes its links, keeping their bends (fast, for dragging). */
export function moveNode(graph: Graph, id: string, x: number, y: number): void {
  const node = graph.nodes.get(id);
  if (!node) return;
  node.x = x;
  node.y = y;
  for (const e of [...(graph.incoming.get(id) ?? []), ...(graph.outgoing.get(id) ?? [])]) {
    e.geom = edgeGeometry(e.source, e.source.r, e.target, e.target.r, e.bend, e.sign);
  }
}

/** Each variable's position, for the camera. */
export function positionsOf(graph: Graph): Map<string, { x: number; y: number }> {
  return new Map([...graph.nodes].map(([id, n]) => [id, { x: n.x, y: n.y }]));
}
