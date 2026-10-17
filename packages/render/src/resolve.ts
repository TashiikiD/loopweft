// Source: PolycrisisPresentation src/map/resolve.ts @ 539bc8e (private), adapted for Loopweft: the levels come
// from @loopweft/model (resolveLevels), labels gain an "all" mode and default to those in view, and unknown ids
// are left to the project checks instead of throwing.
//
// Turns a step's map state into concrete levels, labels and a camera. Pure, so the presenter and the tests
// can use it too.
import { type Camera, fitCamera, inView } from '@loopweft/layout';
import { LEVELS, type Level, type MapState, type Project, resolveLevels, type Trend } from '@loopweft/model';
import { type Graph, positionsOf } from './graph.ts';

export interface ResolvedMap {
  show: boolean;
  opacity: number;
  camera: Camera;
  nodeLevel: Map<string, Level>;
  edgeLevel: Map<string, Level>;
  /** Variables whose labels show. */
  labels: Set<string>;
  labelText: Record<string, string>;
  categoryLabels: boolean;
  trends: Record<string, Trend>;
  /** Named loops whose R/B badges show. */
  loops: string[];
  loopNames: string[];
  clusters: 'show' | 'dim' | 'hide';
  minimap: boolean;
  /** Links at focus or active level, in project order. */
  litEdges: string[];
}

export const rank = (level: Level | undefined): number => (level ? LEVELS.indexOf(level) : -1);

/** The map state of a step that shows no map. */
export const HIDDEN_MAP: MapState = { show: false };

export function resolveMap(project: Project, graph: Graph, state: MapState | undefined): ResolvedMap {
  const s = state ?? HIDDEN_MAP;
  const levels = resolveLevels(project, s);
  const nodeLevel = new Map<string, Level>();
  const edgeLevel = new Map<string, Level>();
  for (const id of graph.nodes.keys()) nodeLevel.set(id, levels.variables.get(id) ?? 'hidden');
  for (const id of graph.edges.keys()) edgeLevel.set(id, levels.links.get(id) ?? 'hidden');

  const camera = fitCamera(positionsOf(graph), s.camera);
  // "focus" labels name only the variables the step lists at focus or active, not those a base level lifts.
  const listed = new Set([...(s.variables?.focus ?? []), ...(s.variables?.active ?? [])]);
  const mode = s.labels ?? 'view';
  const labels = new Set<string>();
  for (const [id, level] of nodeLevel) {
    const n = graph.nodes.get(id);
    if (!n || level === 'hidden') continue;
    if (mode === 'focus' && listed.has(id)) labels.add(id);
    if (mode === 'view' && rank(level) >= rank('normal') && inView(camera, n.x, n.y)) labels.add(id);
    if (mode === 'all' && rank(level) >= rank('normal')) labels.add(id);
  }
  // Label text set for the step always shows (the deck's single words).
  for (const id of Object.keys(s.labelText ?? {})) if (rank(nodeLevel.get(id)) > 0) labels.add(id);

  return {
    show: s.show !== false,
    opacity: s.opacity ?? 1,
    camera,
    nodeLevel,
    edgeLevel,
    labels,
    labelText: s.labelText ?? {},
    categoryLabels: s.categoryLabels ?? false,
    trends: s.trends ?? {},
    loops: s.loops ?? [],
    loopNames: s.loopNames ?? [],
    clusters: s.clusters ?? 'show',
    minimap: s.minimap ?? camera.zoom > 1.15,
    litEdges: levels.litLinks.filter((id) => graph.edges.has(id)),
  };
}
