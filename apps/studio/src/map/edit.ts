// The canvas's edits, as compositions of @loopweft/model's operations (the ones the command line runs):
// placing a new variable, dragging variables, pinning what an automatic layout placed, aligning, removing a
// selection. Plus a quick preview of a drag, which redraws only what moves.
import { edgeGeometry } from '@loopweft/layout';
import {
  addVariable,
  listing,
  moveVariables,
  type OpOutput,
  type Project,
  plural,
  removeLink,
  removeVariable,
  setPinned,
  stepsMentioning,
} from '@loopweft/model';
import { type Graph, type GraphEdge, type GraphNode, glyphExtent } from '@loopweft/render';

export type Moves = Record<string, { x: number; y: number }>;

/** The graph with some variables somewhere else and their links reshaped, keeping their curves. */
export function previewMove(graph: Graph, moves: Moves): Graph {
  const nodes = new Map(graph.nodes);
  for (const [id, to] of Object.entries(moves)) {
    const node = nodes.get(id);
    if (node) nodes.set(id, { ...node, x: to.x, y: to.y });
  }
  const edges = new Map(graph.edges);
  for (const edge of graph.edges.values()) {
    if (!(edge.source.id in moves) && !(edge.target.id in moves)) continue;
    const source = nodes.get(edge.source.id) as GraphNode;
    const target = nodes.get(edge.target.id) as GraphNode;
    edges.set(edge.id, {
      ...edge,
      source,
      target,
      geom: edgeGeometry(source, source.r, target, target.r, edge.bend, edge.sign),
    } as GraphEdge);
  }
  return { ...graph, nodes, edges };
}

/** Positions in whole map units. */
export const rounded = (moves: Moves): Moves =>
  Object.fromEntries(
    Object.entries(moves).map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y) }]),
  );

/** A new variable, placed where it was asked for. */
export function placeVariable(
  project: Project,
  label: string,
  at: { x: number; y: number },
): OpOutput<{ id: string }> {
  const added = addVariable(project, { label });
  const moved = moveVariables(added.project, {
    [added.result.id]: { x: Math.round(at.x), y: Math.round(at.y) },
  });
  return { project: moved.project, result: added.result, summary: added.summary };
}

/**
 * Pins variables where the canvas draws them: those an automatic layout placed get that place first.
 */
export function pinWhereDrawn(
  project: Project,
  graph: Graph,
  ids: readonly string[],
  pinned: boolean,
): OpOutput<{ changed: string[] }> {
  const unplaced = ids.filter((id) => !project.layout.positions[id] && graph.nodes.has(id));
  const placed =
    pinned && unplaced.length
      ? moveVariables(
          project,
          Object.fromEntries(
            unplaced.map((id) => {
              const n = graph.nodes.get(id) as GraphNode;
              return [id, { x: Math.round(n.x), y: Math.round(n.y) }];
            }),
          ),
        ).project
      : project;
  return setPinned(placed, ids, pinned);
}

export type Alignment = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom' | 'across' | 'down';

/** Where variables go when lined up (`across` and `down` spread them out evenly). */
export function alignment(graph: Graph, ids: readonly string[], how: Alignment): Moves {
  const nodes = ids.map((id) => graph.nodes.get(id)).filter((n): n is GraphNode => n !== undefined);
  if (nodes.length < 2) return {};
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const moves: Moves = {};
  const spread = (axis: 'x' | 'y') => {
    const sorted = [...nodes].sort((a, b) => a[axis] - b[axis] || (a.id < b.id ? -1 : 1));
    const [lo, hi] = axis === 'x' ? [x0, x1] : [y0, y1];
    sorted.forEach((n, i) => {
      const at = lo + ((hi - lo) * i) / (sorted.length - 1);
      moves[n.id] = axis === 'x' ? { x: at, y: n.y } : { x: n.x, y: at };
    });
  };
  for (const n of nodes) {
    if (how === 'left') moves[n.id] = { x: x0, y: n.y };
    if (how === 'centre') moves[n.id] = { x: (x0 + x1) / 2, y: n.y };
    if (how === 'right') moves[n.id] = { x: x1, y: n.y };
    if (how === 'top') moves[n.id] = { x: n.x, y: y0 };
    if (how === 'middle') moves[n.id] = { x: n.x, y: (y0 + y1) / 2 };
    if (how === 'bottom') moves[n.id] = { x: n.x, y: y1 };
  }
  if (how === 'across') spread('x');
  if (how === 'down') spread('y');
  return rounded(moves);
}

/** What each Line up button lines the variables up to, in the words its tooltip and its messages use. */
export const LINE_UP: Record<Alignment, string> = {
  left: 'on the left-most one',
  centre: 'half way between the left-most and the right-most one',
  right: 'on the right-most one',
  top: 'on the top one',
  middle: 'half way between the top and the bottom one',
  bottom: 'on the bottom one',
  across: 'spaced evenly from the left-most to the right-most one',
  down: 'spaced evenly from the top to the bottom one',
};

/**
 * What a Line up press does: the moves, or why it does nothing. A press that would put two variables on one
 * spot (one drawn over the other, as Left then Top does to two variables) is refused, with the two named; a
 * press that would move nothing says they are lined up already.
 */
export function lineUp(
  graph: Graph,
  ids: readonly string[],
  how: Alignment,
): { moves: Moves } | { refused: string } {
  const moves = alignment(graph, ids, how);
  const at = (id: string) => moves[id] ?? (graph.nodes.get(id) as GraphNode);
  const moved = Object.keys(moves).filter((id) => {
    const n = graph.nodes.get(id) as GraphNode;
    const to = moves[id] as { x: number; y: number };
    return Math.round(n.x) !== to.x || Math.round(n.y) !== to.y;
  });
  if (moved.length === 0) return { refused: `They are lined up ${LINE_UP[how]} already.` };
  const nodes = ids.map((id) => graph.nodes.get(id)).filter((n): n is GraphNode => n !== undefined);
  // Whether two glyphs, drawn as the canvas draws them (each shape's own reach), overlap with their centres here.
  const overlap = (
    a: GraphNode,
    pa: { x: number; y: number },
    b: GraphNode,
    pb: { x: number; y: number },
  ) => {
    const ea = glyphExtent(a.shape, a.r);
    const eb = glyphExtent(b.shape, b.r);
    return (
      pa.x - ea.left < pb.x + eb.right &&
      pb.x - eb.left < pa.x + ea.right &&
      pa.y - ea.up < pb.y + eb.down &&
      pb.y - eb.up < pa.y + ea.down
    );
  };
  for (const [i, a] of nodes.entries()) {
    for (const b of nodes.slice(i + 1)) {
      if (overlap(a, at(a.id), b, at(b.id)) && !overlap(a, a, b, b)) {
        const name = (n: GraphNode) => `“${n.label.replace(/\n/g, ' ')}”`;
        const line = how === 'left' || how === 'centre' || how === 'right' ? 'a row' : 'a column';
        return {
          refused: `Lining them up ${LINE_UP[how]} would put ${name(a)} and ${name(b)} on one spot, one hidden under the other: they are in ${line} already. Move one of them first.`,
        };
      }
    }
  }
  return { moves };
}

/** What removing a selection would also take with it: named loops, and story steps that mention it. */
export function removalImpact(project: Project, variables: readonly string[], links: readonly string[]) {
  const variableSet = new Set(variables);
  const linkSet = new Set([
    ...links,
    ...project.links.filter((l) => variableSet.has(l.from) || variableSet.has(l.to)).map((l) => l.id),
  ]);
  const loops = project.loops.filter((lp) => lp.links.some((id) => linkSet.has(id))).map((lp) => lp.id);
  const steps = stepsMentioning(project, { variables: variableSet, links: linkSet, loops: new Set(loops) });
  return { links: [...linkSet], loops, steps };
}

/** One sentence on what a removal also takes, for the question asked before it. */
export function removalQuestion(impact: ReturnType<typeof removalImpact>, variables: number): string {
  const also = [
    impact.loops.length ? `${plural(impact.loops.length, 'named loop')} (${listing(impact.loops)})` : '',
    impact.steps.length
      ? `the ${plural(impact.steps.length, 'story step')} that mention${impact.steps.length === 1 ? 's' : ''} ${variables ? 'them' : 'it'} (${listing(impact.steps.slice(0, 6))}${impact.steps.length > 6 ? '…' : ''})`
      : '',
  ].filter(Boolean);
  return `Removing this also removes ${listing(also)}. Remove?`;
}

/** Removes links, then variables with whatever still depends on them, as one edit. */
export function removeSelection(
  project: Project,
  variables: readonly string[],
  links: readonly string[],
): OpOutput<{ variables: string[]; links: string[] }> {
  let next = project;
  for (const id of links)
    if (next.links.some((l) => l.id === id)) next = removeLink(next, id, { cascade: true }).project;
  for (const id of variables)
    if (next.variables.some((v) => v.id === id)) next = removeVariable(next, id, { cascade: true }).project;
  const goneLinks = project.links.filter((l) => !next.links.some((n) => n.id === l.id)).map((l) => l.id);
  const parts = [
    variables.length ? plural(variables.length, 'variable') : '',
    goneLinks.length ? plural(goneLinks.length, 'link') : '',
  ].filter(Boolean);
  return {
    project: next,
    result: { variables: [...variables], links: goneLinks },
    summary: `Removed ${listing(parts)}.`,
  };
}
