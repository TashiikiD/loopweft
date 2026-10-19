// What a step's map shows: the edits behind the Studio's record view and `loopweft story step set`. Each one
// changes one step's map state and nothing else; the pure helpers (withLevel, withTrend…) are what they
// share, so both front ends make the same state from the same request.
import { ripple } from '../ripple.ts';
import {
  LEVELS,
  type Level,
  type LevelLists,
  type MapState,
  MapStateSchema,
  type Project,
  type Scene,
  type Trend,
} from '../schema.ts';
import { resolveLevels } from '../story.ts';
import { findLoop } from './loops.ts';
import { resolveStep } from './story.ts';
import {
  ensureValid,
  findLink,
  listing,
  OpError,
  type OpOutput,
  parseElement,
  plural,
  resolveVariable,
  sameJson,
} from './support.ts';

/** Changes to a step's map: a value sets the field, `null` clears it (back to its default). */
export type MapChanges = { [K in keyof MapState]?: MapState[K] | null };

export type ElementKind = 'variables' | 'links';

/** `lists` with `ids` taken out of every level and, unless `level` is null, put at `level` (in the order given). */
export function withLevel(
  lists: LevelLists | undefined,
  ids: readonly string[],
  level: Level | null,
): LevelLists | undefined {
  const gone = new Set(ids);
  const out: LevelLists = {};
  if (lists?.base !== undefined) out.base = lists.base;
  for (const l of LEVELS) {
    const kept = (lists?.[l] ?? []).filter((id) => !gone.has(id));
    const added = l === level ? [...new Set(ids)] : [];
    if (kept.length + added.length) out[l] = [...kept, ...added];
  }
  return Object.keys(out).length ? out : undefined;
}

/** `lists` with another base level (null: back to normal); what is listed stays listed. */
export function withBase(lists: LevelLists | undefined, base: Level | null): LevelLists | undefined {
  const out: LevelLists = { ...(lists ?? {}) };
  if (base === null) delete out.base;
  else out.base = base;
  // Keep the base first, as the canonical form writes it.
  const ordered: LevelLists = out.base !== undefined ? { base: out.base } : {};
  for (const l of LEVELS) if (out[l]) ordered[l] = out[l];
  return Object.keys(ordered).length ? ordered : undefined;
}

/** `trends` with `ids` marked `trend`, or unmarked when it is null. */
export function withTrend(
  trends: MapState['trends'],
  ids: readonly string[],
  trend: Trend | null,
): MapState['trends'] {
  const out = { ...(trends ?? {}) };
  for (const id of ids) {
    if (trend === null) delete out[id];
    else out[id] = trend;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A map whose loop badges and names show (or not) for `ids`. A name needs its badge, so naming shows it too. */
export function withLoops(
  map: MapState,
  ids: readonly string[],
  show: { badge?: boolean; name?: boolean },
): Pick<MapState, 'loops' | 'loopNames'> {
  let loops = [...(map.loops ?? [])];
  let names = [...(map.loopNames ?? [])];
  const add = (list: string[]) => [...list, ...ids.filter((id) => !list.includes(id))];
  const drop = (list: string[]) => list.filter((id) => !ids.includes(id));
  if (show.badge === true || show.name === true) loops = add(loops);
  if (show.badge === false) {
    loops = drop(loops);
    names = drop(names);
  }
  if (show.name === true) {
    // A name needs its badge, whatever else was asked.
    loops = add(loops);
    names = add(names);
  }
  if (show.name === false) names = drop(names);
  return { loops: loops.length ? loops : undefined, loopNames: names.length ? names : undefined } as Pick<
    MapState,
    'loops' | 'loopNames'
  >;
}

/** Pulses with one more hop: a new hop after the others, or (`join`) these links added to the last hop. */
export function withHop(
  pulses: MapState['pulses'],
  links: readonly string[],
  join = false,
): NonNullable<MapState['pulses']> {
  const hops = (pulses?.hops ?? []).map((hop) => [...hop]);
  const last = hops.at(-1);
  if (join && last) last.push(...links.filter((id) => !last.includes(id)));
  else hops.push([...links]);
  return { ...(pulses ?? {}), hops };
}

/** Drops every field whose value is undefined, so the map is written as the canonical form would. */
const tidy = (map: Record<string, unknown>): MapState => {
  for (const key of Object.keys(map)) if (map[key] === undefined) delete map[key];
  return map as MapState;
};

const levelName = (level: Level | null, base: Level | undefined) =>
  level === null ? `the base level (${base ?? 'normal'})` : level;

/**
 * Changes fields of a step's map. `summary` replaces the usual "Changed …" sentence (the named edits below
 * say what they did in their own words).
 */
export function setStepMap(
  project: Project,
  ref: string,
  changes: MapChanges,
  summary?: string,
): OpOutput<{ key: string; changed: string[] }> {
  const { sceneIndex, stepIndex, step, key } = resolveStep(project, ref);
  const candidate: Record<string, unknown> = { ...step.map };
  for (const [field, value] of Object.entries(changes)) {
    if (value === null) delete candidate[field];
    else if (value !== undefined) candidate[field] = value;
  }
  const map = parseElement(MapStateSchema, tidy(candidate), [
    'story',
    'scenes',
    sceneIndex,
    'steps',
    stepIndex,
    'map',
  ]);
  const changed = Object.keys(changes).filter(
    (field) => !sameJson(step.map[field as keyof MapState], map[field as keyof MapState]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { key, changed },
      summary: `Nothing to change: step ${key} already shows that.`,
    };
  }
  const next = structuredClone(project);
  ((next.story.scenes[sceneIndex] as Scene).steps[stepIndex] as { map: MapState }).map = map;
  ensureValid(project, next);
  return {
    project: next,
    result: { key, changed },
    summary: summary ?? `Changed what step ${key} shows: ${changed.join(', ')}.`,
  };
}

/** Ids of variables (by id or label) or links (by id). */
function elementIdsOf(project: Project, kind: ElementKind, refs: readonly string[]): string[] {
  if (refs.length === 0)
    throw new OpError(`Name at least one ${kind === 'variables' ? 'variable' : 'link'}.`, 'usage');
  return refs.map((r) =>
    kind === 'variables' ? resolveVariable(project, r).variable.id : findLink(project, r).link.id,
  );
}

/** Puts variables or links at an emphasis level in one step (null: back to the step's base level). */
export function setStepLevel(
  project: Project,
  ref: string,
  kind: ElementKind,
  refs: readonly string[],
  level: Level | null,
): OpOutput<{ key: string; changed: string[] }> {
  const { step, key } = resolveStep(project, ref);
  const ids = elementIdsOf(project, kind, refs);
  const lists = withLevel(step.map[kind], ids, level);
  return setStepMap(
    project,
    ref,
    { [kind]: lists ?? null },
    `Step ${key}: ${listing(ids)} at ${levelName(level, step.map[kind]?.base)}.`,
  );
}

/** Sets the level of every variable or link a step does not list (null: back to normal). */
export function setStepBase(
  project: Project,
  ref: string,
  kind: ElementKind,
  base: Level | null,
): OpOutput<{ key: string; changed: string[] }> {
  const { step, key } = resolveStep(project, ref);
  const lists = withBase(step.map[kind], base);
  return setStepMap(
    project,
    ref,
    { [kind]: lists ?? null },
    `Step ${key}: ${kind} not listed are ${base ?? 'normal'}.`,
  );
}

/** Marks variables ▲ up, ▼ down or ± mixed in one step (null: no trend). */
export function setStepTrend(
  project: Project,
  ref: string,
  refs: readonly string[],
  trend: Trend | null,
): OpOutput<{ key: string; changed: string[] }> {
  const { step, key } = resolveStep(project, ref);
  const ids = elementIdsOf(project, 'variables', refs);
  return setStepMap(
    project,
    ref,
    { trends: withTrend(step.map.trends, ids, trend) ?? null },
    `Step ${key}: ${listing(ids)} ${trend === null ? 'without a trend' : `marked ${trend}`}.`,
  );
}

/** Shows or hides loop badges and names in one step. A name needs its badge: naming shows it, hiding it hides the name. */
export function setStepLoops(
  project: Project,
  ref: string,
  refs: readonly string[],
  show: { badge?: boolean; name?: boolean },
): OpOutput<{ key: string; changed: string[] }> {
  const { step, key } = resolveStep(project, ref);
  if (refs.length === 0) throw new OpError('Name at least one loop.', 'usage');
  if (show.badge === false && show.name === true) {
    throw new OpError('A loop name needs its badge: it cannot show without it.', 'usage');
  }
  const ids = refs.map((r) => findLoop(project, r).loop.id);
  const { loops, loopNames } = withLoops(step.map, ids, show);
  const said = [
    show.badge === true ? 'badge shown' : show.badge === false ? 'badge hidden' : '',
    show.name === true ? 'name shown' : show.name === false ? 'name hidden' : '',
  ].filter(Boolean);
  return setStepMap(
    project,
    ref,
    { loops: loops ?? null, loopNames: loopNames ?? null },
    `Step ${key}: loop ${listing(ids)}, ${said.join(', ') || 'unchanged'}.`,
  );
}

/** Adds a pulse hop: these links pulse together after the hops before (or, with `join`, with the last hop). */
export function addPulseHop(
  project: Project,
  ref: string,
  refs: readonly string[],
  options: { join?: boolean } = {},
): OpOutput<{ key: string; changed: string[] }> {
  const { step, key } = resolveStep(project, ref);
  const ids = elementIdsOf(project, 'links', refs);
  const pulses = withHop(step.map.pulses, ids, options.join);
  return setStepMap(
    project,
    ref,
    { pulses },
    `Step ${key}: pulse along ${listing(ids)} (hop ${pulses.hops.length}).`,
  );
}

/** Sends the pulse round a named loop, one link after another; its repeat, tone and delay stay. */
export function pulseRoundLoop(
  project: Project,
  ref: string,
  loopRef: string,
): OpOutput<{ key: string; changed: string[] }> {
  const { step, key } = resolveStep(project, ref);
  const { loop } = findLoop(project, loopRef);
  const pulses = { ...(step.map.pulses ?? {}), hops: loop.links.map((id) => [id]) };
  return setStepMap(
    project,
    ref,
    { pulses },
    `Step ${key}: pulse round loop ${loop.id} (${plural(loop.links.length, 'hop')}).`,
  );
}

/**
 * A what-if ▲/▼ on one step: the chosen variable rises (or falls), and the change spreads by sign along the
 * links the step lights, as the ripple spreads it (docs/analysis.md): a + link carries it the same way, a −
 * link the other way; where opposing pushes meet at once the variable is ± and the spread stops there. Every
 * variable it reaches is marked; other trends stay. Pushes that arrive later the other way (round a
 * balancing loop, including back into the start) are named, since the story check will flag them.
 */
export function spreadTrend(
  project: Project,
  ref: string,
  variableRef: string,
  direction: 'up' | 'down',
): OpOutput<{ key: string; trends: Record<string, Trend>; against: string[] }> {
  const { step, key } = resolveStep(project, ref);
  const start = resolveVariable(project, variableRef).variable.id;
  const lit = new Set(resolveLevels(project, step.map).litLinks);
  const along: Project = { ...project, links: project.links.filter((l) => lit.has(l.id)) };
  const spread = ripple(along, start, direction, { includeOptional: true });
  const trends: Record<string, Trend> = { [start]: direction };
  for (const r of spread.reached) trends[r.variable] = r.trend;
  // Pushes the other way: later ones into variables reached, and feedback that brings the change back to the
  // start the other way (round a balancing loop). Feedback the same way (reinforcing) is not against it.
  const against = [
    ...new Set([
      ...spread.reached.flatMap((r) => r.against),
      ...spread.feedback.filter((f) => f.trend !== direction).map((f) => f.link),
    ]),
  ];
  const merged = { ...(step.map.trends ?? {}), ...trends };
  const reached = Object.keys(trends).length - 1;
  const note = against.length
    ? ` ${listing(against)} would push the other way later, so the story check will flag ${against.length === 1 ? 'it' : 'them'}.`
    : '';
  const out = setStepMap(
    project,
    ref,
    { trends: merged },
    `Step ${key}: ${start} ${direction === 'up' ? '▲' : '▼'}, spread by sign along the lit links to ${plural(reached, 'variable')}.${note}`,
  );
  return { project: out.project, result: { key, trends, against }, summary: out.summary };
}
