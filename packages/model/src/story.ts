// Source: PolycrisisPresentation src/map/resolve.ts (resolveMap's levels) @ 539bc8e (private), adapted for
// Loopweft: the levels only (the camera and labels belong to the renderer), with optional link types in place
// of the deck's side-effects flag.
import {
  type Citation,
  LEVELS,
  type Level,
  type MapState,
  type Project,
  type Scene,
  type Step,
} from './schema.ts';

const rank = (level: Level): number => LEVELS.indexOf(level);
const higher = (a: Level, b: Level): Level => (rank(a) >= rank(b) ? a : b);
const lower = (a: Level, b: Level): Level => (rank(a) <= rank(b) ? a : b);

/** Whether `level` is at least `floor`. */
export const atLeast = (level: Level | undefined, floor: Level): boolean =>
  level !== undefined && rank(level) >= rank(floor);

export interface ResolvedLevels {
  variables: Map<string, Level>;
  links: Map<string, Level>;
  /** Links at focus or active level, in project order. */
  litLinks: string[];
  /** Variables at focus or active level, in project order. */
  litVariables: string[];
}

/**
 * The level of every variable and link in one step. Unlisted elements take the base level (normal unless
 * set); links of an optional type stay hidden unless listed; an id listed at two levels takes the higher;
 * both ends of a visible link are shown at up to normal strength.
 */
export function resolveLevels(project: Project, map: MapState): ResolvedLevels {
  const optional = new Set(project.types.linkTypes.filter((t) => t.optional).map((t) => t.id));
  const variables = new Map<string, Level>();
  const links = new Map<string, Level>();
  const listed = (lists: MapState['variables']) => {
    const levels = new Map<string, Level>();
    for (const level of LEVELS)
      for (const id of lists?.[level] ?? []) levels.set(id, higher(levels.get(id) ?? level, level));
    return levels;
  };
  const variableLevels = listed(map.variables);
  const linkLevels = listed(map.links);
  for (const v of project.variables)
    variables.set(v.id, variableLevels.get(v.id) ?? map.variables?.base ?? 'normal');
  for (const l of project.links) {
    const base = l.type !== undefined && optional.has(l.type) ? 'hidden' : (map.links?.base ?? 'normal');
    links.set(l.id, linkLevels.get(l.id) ?? base);
  }
  for (const l of project.links) {
    const level = links.get(l.id) as Level;
    if (level === 'hidden') continue;
    const floor = lower(level, 'normal');
    for (const end of [l.from, l.to]) variables.set(end, higher(variables.get(end) ?? 'hidden', floor));
  }
  return {
    variables,
    links,
    litLinks: project.links.filter((l) => atLeast(links.get(l.id), 'focus')).map((l) => l.id),
    litVariables: project.variables.filter((v) => atLeast(variables.get(v.id), 'focus')).map((v) => v.id),
  };
}

/**
 * The sources a step draws on: those its overlays cite, and those cited by the variables and links it
 * lights (focus or active) and the loops it badges.
 */
export function stepSources(project: Project, step: Step): string[] {
  const { litLinks, litVariables } = resolveLevels(project, step.map);
  const lit = new Set([...litLinks, ...litVariables, ...(step.map.loops ?? [])]);
  const cited: Citation[] = [
    ...project.variables.filter((v) => lit.has(v.id)).flatMap((v) => v.citations),
    ...project.links.filter((l) => lit.has(l.id)).flatMap((l) => l.citations),
    ...project.loops.filter((l) => lit.has(l.id)).flatMap((l) => l.citations),
    ...step.overlays.flatMap((o) => ('citations' in o ? (o.citations ?? []) : [])),
  ];
  return [...new Set(cited.map((c) => c.source))];
}

/** The sources a scene draws on: those it lists, and those its steps draw on. */
export function sceneSources(project: Project, scene: Scene): string[] {
  return [...new Set([...scene.sources, ...scene.steps.flatMap((step) => stepSources(project, step))])];
}
