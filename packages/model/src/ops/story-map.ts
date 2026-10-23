// What a step's map shows: the edits behind the Studio's record view and `loopweft story step set`. Each one
// changes one step's map state and nothing else; the pure helpers (withLevel, withTrend…) are what they
// share, so both front ends make the same state from the same request.
import { type RippleDirection, type RippleResult, ripple } from '../ripple.ts';
import {
  LEVELS,
  type Level,
  type LevelLists,
  type MapState,
  MapStateSchema,
  type Project,
  type Scene,
  type Step,
  type Trend,
} from '../schema.ts';
import { resolveLevels } from '../story.ts';
import { findLoop } from './loops.ts';
import { addStep, resolveStep, type StepInput, setStep, type Where } from './story.ts';
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

/** Why a ripple from `start` over `project`'s links reached no other variable, in a few words. */
function whyNoFurther(project: Project, start: string, spread: RippleResult, links: string): string {
  const out = project.links.filter((l) => l.from === start && l.to !== start);
  if (out.length === 0) return `no ${links} leaves ${start} for another variable`;
  const unknown = out.filter((l) => spread.unknownLinks.includes(l.id)).map((l) => l.id);
  const optional = out.filter((l) => spread.optionalLinks.includes(l.id)).map((l) => l.id);
  const kinds = [
    unknown.length ? `of unknown sign (${listing(unknown)}), which it does not cross` : '',
    optional.length ? `of optional types (${listing(optional)}), left out` : '',
  ].filter(Boolean);
  return `the ${links}s that leave ${start} are ${kinds.join(', or ')}`;
}

/**
 * A what-if ▲/▼ on one step: the chosen variable rises (or falls), and the change spreads by sign, as the
 * ripple spreads it (docs/analysis.md): a + link carries it the same way, a − link the other way; where
 * opposing pushes meet at once the variable is ± and the spread stops there. On a step that lights links
 * (Focus or Active), it follows those; on a step that lights none, it follows the whole map's links (leaving
 * out optional types, as the ripple does) and lights the start, what it reaches and the links it crosses, so
 * the marks show. Every variable it reaches is marked; other trends stay. The summary says which links it
 * followed, and why when it reaches nothing. Pushes that arrive later the other way (round a balancing loop,
 * including back into the start) are named, since the story check will flag them.
 */
export function spreadTrend(
  project: Project,
  ref: string,
  variableRef: string,
  direction: 'up' | 'down',
): OpOutput<{ key: string; trends: Record<string, Trend>; against: string[]; along: 'lit' | 'map' }> {
  const { step, key } = resolveStep(project, ref);
  const start = resolveVariable(project, variableRef).variable.id;
  const litLinks = resolveLevels(project, step.map).litLinks;
  const along: 'lit' | 'map' = litLinks.length ? 'lit' : 'map';
  const lit = new Set(litLinks);
  const over: Project =
    along === 'lit' ? { ...project, links: project.links.filter((l) => lit.has(l.id)) } : project;
  const spread = ripple(over, start, direction, { includeOptional: along === 'lit' });
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
  const changes: MapChanges = { trends: { ...(step.map.trends ?? {}), ...trends } };
  const crossed = [...new Set(spread.hops.flat())];
  if (along === 'map') {
    changes.variables = withLevel(step.map.variables, Object.keys(trends), 'focus') ?? null;
    if (crossed.length) changes.links = withLevel(step.map.links, crossed, 'focus') ?? null;
  }
  const reached = spread.reached.length;
  const mark = `${start} ${direction === 'up' ? '▲' : '▼'}`;
  const note = against.length
    ? ` ${listing(against)} would push the other way later, so the story check will flag ${against.length === 1 ? 'it' : 'them'}.`
    : '';
  let said: string;
  if (along === 'lit')
    said = reached
      ? `${mark}, spread by sign along the lit links to ${plural(reached, 'variable')}.`
      : `${mark}, but the spread along the lit links reaches no other variable: ${whyNoFurther(over, start, spread, 'lit link')}. Light the links it should follow with Show (Focus or Active), or spread on a step that lights none to follow the whole map.`;
  else
    said = reached
      ? `${mark}; the step lit no links, so the spread followed the whole map by sign to ${plural(reached, 'variable')}, and lit them, ${start} and the ${plural(crossed.length, 'link')} it crossed.`
      : `${mark}, lit; the step lit no links, so the spread followed the whole map, but reaches no other variable: ${whyNoFurther(over, start, spread, 'link')}.`;
  const out = setStepMap(project, ref, changes, `Step ${key}: ${said}${note}`);
  return { project: out.project, result: { key, trends, against, along }, summary: out.summary };
}

/**
 * What a ripple step can be asked for. A step shows the whole ripple: no step cap (a ripple stopped by
 * `maxSteps` would be told as if the change went no further).
 */
export interface RippleStepOptions {
  /** Follow links of optional types too. Default: left out. */
  includeOptional?: boolean;
  /** Show the scene's caption, when the step shows none and another step of its scene does. */
  caption?: boolean;
}

/**
 * Makes a step show a ripple (docs/analysis.md): the start lit most (active), the variables the change reaches
 * and the links it crosses lit (focus), the rest faded (variables dim, links ghost, as the example's steps
 * fade them), ▲/▼/± on each, and pulses along it hop by hop, in order. It replaces what the step's map
 * lights, its trends and its pulses; its camera, labels and the rest stay. It stops where the ripple stops: at
 * a link of unknown sign, and where opposing pushes meet. Directions only, never amounts or timing.
 */
export function setStepRipple(
  project: Project,
  ref: string,
  startRef: string,
  direction: RippleDirection,
  options: RippleStepOptions = {},
): OpOutput<{ key: string; reached: string[]; links: string[]; hops: number }> {
  const { scene, step, key } = resolveStep(project, ref);
  // Only what a step may ask for reaches the ripple: never a step cap, whatever else the options carry.
  const spread = ripple(project, startRef, direction, { includeOptional: options.includeOptional === true });
  const { start } = spread;
  const reached = spread.reached.map((r) => r.variable);
  const crossed = [...new Set(spread.hops.flat())];
  const trends: Record<string, Trend> = { [start]: direction };
  for (const r of spread.reached) trends[r.variable] = r.trend;
  const count = (t: Trend) => spread.reached.filter((r) => r.trend === t).length;
  const marks = (['up', 'down', 'mixed'] as const)
    .filter((t) => count(t))
    .map((t) => `${count(t)} ${t === 'up' ? '▲' : t === 'down' ? '▼' : '±'}`)
    .join(', ');
  const stops = [
    spread.unknownLinks.length
      ? `not crossed: ${plural(spread.unknownLinks.length, 'link')} of unknown sign (${listing(spread.unknownLinks)})`
      : '',
    spread.optionalLinks.length
      ? `left out: ${plural(spread.optionalLinks.length, 'link')} of optional types (${listing(spread.optionalLinks)})`
      : '',
  ].filter(Boolean);
  const arrow = direction === 'up' ? '▲' : '▼';
  const said = reached.length
    ? `the ripple of ${start} ${arrow}: ${plural(reached.length, 'variable')} lit and marked (${marks}), pulses along ${plural(crossed.length, 'link')} in ${plural(spread.hops.length, 'hop')}, the rest faded`
    : `${start} ${arrow} lit, the rest faded; the change reaches no other variable`;
  let out = setStepMap(
    project,
    ref,
    {
      variables: { base: 'dim', ...(reached.length ? { focus: reached } : {}), active: [start] },
      links: { base: 'ghost', ...(crossed.length ? { focus: crossed } : {}) },
      trends,
      pulses: spread.hops.length ? { hops: spread.hops } : null,
    },
    `Step ${key}: ${said}${stops.length ? `; ${stops.join('; ')}` : ''}.`,
  );
  const captioned = (s: Step) => s.overlays.some((o) => o.type === 'caption');
  if (options.caption && !captioned(step) && scene.steps.some((s) => s.id !== step.id && captioned(s))) {
    const shown = setStep(out.project, key, { overlays: [{ type: 'caption' }, ...step.overlays] });
    out = { ...out, project: shown.project, summary: `${out.summary} It shows the scene's caption.` };
  }
  return {
    project: out.project,
    result: { key, reached, links: crossed, hops: spread.hops.length },
    summary: out.summary,
  };
}

/**
 * A new step that shows a ripple (`setStepRipple`), with the scene's caption if its other steps show one: at
 * the end of the scene unless `where` says otherwise, labelled by the change unless a label is given.
 */
export function addRippleStep(
  project: Project,
  sceneRef: string,
  startRef: string,
  direction: RippleDirection,
  input: Omit<StepInput, 'label' | 'map' | 'overlays'> & { label?: string } = {},
  where?: Where,
  options: Pick<RippleStepOptions, 'includeOptional'> = {},
): OpOutput<{ key: string; reached: string[]; links: string[]; hops: number }> {
  const variable = resolveVariable(project, startRef).variable;
  const label =
    input.label ?? `${variable.label.replace(/\n/g, ' ')} ${direction === 'up' ? 'rises' : 'falls'}`;
  const added = addStep(project, sceneRef, { ...input, label, map: {} }, where);
  const shown = setStepRipple(added.project, added.result.key, variable.id, direction, {
    includeOptional: options.includeOptional,
    caption: true,
  });
  return { project: shown.project, result: shown.result, summary: `${added.summary} ${shown.summary}` };
}
