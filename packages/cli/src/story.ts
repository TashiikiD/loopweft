// `loopweft story`: the story from the command line. Scenes, steps, what each step's map shows, its overlays
// and the images they show, through the same operations as the Studio's Story workspace.
import { readFileSync } from 'node:fs';
import {
  addAsset,
  addOverlay,
  addPulseHop,
  addScene,
  addStep,
  CARD_ICONS,
  checkProject,
  copyStep,
  countKeyMarks,
  type FoundScene,
  type FoundStep,
  FRAMES,
  imageDataUri,
  KEY_MARK,
  keyMarksNeeded,
  LEVELS,
  type Level,
  listing,
  type MapState,
  moveOverlay,
  moveScene,
  moveStep,
  normalizeToken,
  OpError,
  type OpOutput,
  type Overlay,
  PLACES,
  type Project,
  plural,
  pulseRoundLoop,
  removeAsset,
  removeOverlay,
  removeScene,
  removeStep,
  resolveScene,
  resolveStep,
  resolveVariable,
  type Scene,
  type SceneChanges,
  type StepChanges,
  scriptSegments,
  setAsset,
  setOverlay,
  setScene,
  setStep,
  setStepBase,
  setStepLevel,
  setStepLoops,
  setStepMap,
  setStepTrend,
  spreadTrend,
  stepSources,
  stepsNamed,
  type Where,
} from '@loopweft/model';
import { type CommandResult, cleared, edit, MARK, WAY } from './commands.ts';
import { citationText } from './sources.ts';
import { type Env, list, loadProject, number, numbers, oneOf, pair, readText } from './support.ts';

type Run = (project: Project) => OpOutput<unknown>;

/** A count of seconds as people read it: "45 s", "1 min 35 s". */
const seconds = (s: number) =>
  s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;

/** --before / --after / --first / --last as a place. */
interface PlaceOptions {
  before?: string;
  after?: string;
  first?: boolean;
  last?: boolean;
}

/** The place the options give; `beside` turns the reference --before or --after names into its id. */
function where(o: PlaceOptions, count: () => number, beside: (ref: string) => string): Where | undefined {
  const given = [o.before, o.after, o.first, o.last].filter((v) => v !== undefined && v !== false);
  if (given.length > 1) throw new OpError('Give one place: --before, --after, --first or --last.', 'usage');
  if (o.before !== undefined) return { before: beside(o.before) };
  if (o.after !== undefined) return { after: beside(o.after) };
  if (o.first) return { index: 0 };
  if (o.last) return { index: count() };
  return undefined;
}

/** "a", "a or b", "a, b or c". */
const orList = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

/** A dot with something on each side, which may part a scene from its step. */
const DOTTED = /.\../s;

/** A scene named by its id or title, as its id. */
const sceneId = (project: Project) => (ref: string) => resolveScene(project, ref).scene.id;

/**
 * A step to place another beside, as its id in `scene`, where the other goes: named by its key there (S1.2),
 * or by its id or label there, which may have dots in it. A step of another scene (S2.1) is refused, and so
 * is a reference that names two steps ("One.1": a step's label, and step 1 of scene "One"), never guessed.
 */
const stepId = (project: Project, scene: Scene) => (ref: string) => {
  const keyed = scene.steps.find((t) => `${scene.id}.${t.id}` === ref);
  if (keyed) return keyed.id;
  const token = normalizeToken(ref);
  const labelled = scene.steps.filter((t) => normalizeToken(t.label) === token);
  const local = scene.steps.find((t) => t.id === ref) ?? (labelled.length === 1 ? labelled[0] : undefined);
  if (!local && labelled.length > 1) {
    throw new OpError(
      `"${ref}" is the label of ${labelled.length} steps of scene ${scene.id}; use the key of the one you mean.`,
      'usage',
    );
  }
  // Every step the reference could name: here by id or label, or as "<scene>.<step>" anywhere.
  const candidates = [
    ...(local ? [{ key: `${scene.id}.${local.id}`, sceneId: scene.id, id: local.id, own: false }] : []),
    ...(DOTTED.test(ref) ? stepsNamed(project, ref) : []).map((n) => ({
      key: n.key,
      sceneId: n.scene.id,
      id: n.step.id,
      own: n.key === ref,
    })),
  ].filter((c, i, all) => all.findIndex((d) => d.key === c.key) === i);
  // Those here all count, and one elsewhere named by its own key; one elsewhere named through titles and labels
  // cannot be placed beside, so it counts only when nothing here does.
  const here = candidates.filter((c) => c.sceneId === scene.id);
  const counted = here.length
    ? [...here, ...candidates.filter((c) => c.sceneId !== scene.id && c.own)]
    : candidates;
  if (counted.length > 1) {
    const keys = counted.map((c) => c.key);
    throw new OpError(
      local
        ? `"${ref}" is the label of step ${keys[0]} and also names ${keys.length === 2 ? 'step' : 'steps'} ${listing(keys.slice(1))}; use ${orList(keys)}.`
        : `"${ref}" names steps ${listing(keys)}; use ${orList(keys)}.`,
      'usage',
    );
  }
  const only = counted[0];
  if (only && only.sceneId === scene.id) return only.id;
  if (only) {
    throw new OpError(
      `Step ${only.key} is in scene ${only.sceneId}; name a step of scene ${scene.id}, where it goes.`,
      'usage',
    );
  }
  throw new OpError(
    scene.steps.length === 0
      ? `Scene ${scene.id} has no steps yet.`
      : `No step "${ref}" in scene ${scene.id} (it has ${listing(scene.steps.map((t) => `${scene.id}.${t.id}`))}).`,
    'notFound',
  );
};

/** Text from an option, or from the file a sibling option names. */
function textOption(text: string | undefined, file: string | undefined, name: string): string | undefined {
  if (text !== undefined && file !== undefined)
    throw new OpError(`Give --${name} or --${name}-file, not both.`, 'usage');
  return file !== undefined ? readText(file) : text;
}

const levelOf = (text: string, option: string): Level => oneOf(text, LEVELS, option);

// ----- list and show -----

export function storyListCommand(file: string): CommandResult {
  const project = loadProject(file);
  const scenes = project.story.scenes;
  const issues = checkProject(project).filter((i) => i.path[0] === 'story');
  const steps = scenes.reduce((n, s) => n + s.steps.length, 0);
  const lines = [`Story: ${plural(scenes.length, 'scene')}, ${plural(steps, 'step')}`];
  for (const scene of scenes) {
    const timed = scene.targetSeconds !== undefined ? seconds(scene.targetSeconds) : 'untimed';
    lines.push(`${scene.id}  ${scene.title} (${timed}) · ${plural(scene.steps.length, 'step')}`);
    for (const step of scene.steps) {
      lines.push(
        `  ${`${scene.id}.${step.id}`.padEnd(10)} ${step.label}${step.at !== undefined ? ` · at ${step.at} s` : ''}`,
      );
    }
  }
  if (issues.length)
    lines.push('', `${plural(issues.length, 'story warning')}: run loopweft validate to see them.`);
  return {
    text: lines.join('\n'),
    data: {
      scenes: scenes.map((s) => ({
        id: s.id,
        title: s.title,
        ...(s.targetSeconds !== undefined ? { targetSeconds: s.targetSeconds } : {}),
        steps: s.steps.map((t) => ({
          id: t.id,
          key: `${s.id}.${t.id}`,
          label: t.label,
          ...(t.at !== undefined ? { at: t.at } : {}),
        })),
      })),
      warnings: issues.length,
    },
  };
}

/** A step's map state in lines, as people read it. */
function mapLines(map: MapState): string[] {
  const lines: string[] = [];
  if (map.show === false) lines.push('map hidden');
  if (map.opacity !== undefined) lines.push(`opacity ${map.opacity}`);
  for (const kind of ['variables', 'links'] as const) {
    const lists = map[kind];
    const parts = [
      `base ${lists?.base ?? 'normal'}`,
      ...LEVELS.flatMap((l) => (lists?.[l]?.length ? [`${l} ${lists[l]?.join(', ')}`] : [])),
    ];
    lines.push(`${kind}: ${parts.join(' · ')}`);
  }
  const cam = map.camera;
  lines.push(
    `camera: ${cam?.fit ? `frames ${cam.fit.join(', ')}` : 'the whole map'}${cam?.frame ? ` (${cam.frame})` : ''}${cam?.maxZoom !== undefined ? `, zoom at most ${cam.maxZoom}` : ''}`,
  );
  lines.push(`labels: ${map.labels ?? 'view'}${map.categoryLabels ? ', group labels' : ''}`);
  if (map.labelText)
    lines.push(
      `label text: ${Object.entries(map.labelText)
        .map(([id, t]) => `${id} "${t}"`)
        .join(', ')}`,
    );
  if (map.trends)
    lines.push(
      `trends: ${Object.entries(map.trends)
        .map(([id, t]) => `${id} ${MARK[t]} ${WAY[t]}`)
        .join(', ')}`,
    );
  if (map.loops?.length) {
    const named = new Set(map.loopNames ?? []);
    lines.push(`loop badges: ${map.loops.map((id) => (named.has(id) ? `${id} (named)` : id)).join(', ')}`);
  }
  if (map.reveal) {
    const r = map.reveal;
    lines.push(
      `reveal: ${r.mode ?? 'draw'}${r.from ? ` from ${r.from.join(', ')}` : ''}${r.sequence ? `, in order ${r.sequence.join(', ')}` : ''}${r.stagger !== undefined ? `, ${r.stagger} s apart` : ''}${r.delay !== undefined ? `, after ${r.delay} s` : ''}`,
    );
  }
  if (map.pulses) {
    const p = map.pulses;
    const extra = [
      p.repeat ? `${p.repeat} more ${p.repeat === 1 ? 'pass' : 'passes'}` : '',
      p.tone ?? '',
      p.delay !== undefined ? `after ${p.delay} s` : '',
    ].filter(Boolean);
    lines.push(
      `pulses: ${p.hops.map((h) => h.join(' + ')).join(' → ')}${extra.length ? ` (${extra.join(', ')})` : ''}`,
    );
  }
  if (map.ambient) {
    const a = map.ambient;
    lines.push(
      `ambient: ${a.tone} from ${a.from.join(', ')}${a.every ? `, every ${a.every[0]}–${a.every[1]} s` : ''}${a.hops ? `, ${a.hops[0]}–${a.hops[1]} links a walk` : ''}${a.delay !== undefined ? `, after ${a.delay} s` : ''}`,
    );
  }
  if (map.clusters) lines.push(`group halos: ${map.clusters}`);
  if (map.minimap !== undefined) lines.push(`minimap: ${map.minimap ? 'on' : 'off'}`);
  return lines;
}

/** Lines of text as written: "a" / "b". */
const quoted = (lines: readonly string[]) => lines.map((l) => `"${l}"`).join(' / ');

/**
 * One overlay as lines, with everything it shows: its first line has the overlay's own fields, where it goes
 * and the sources it cites, with their pages; a set of cards has a line for each card. The caption shows its
 * scene's number (its place in the story), title and headline.
 */
function overlayLines(
  o: Overlay,
  i: number,
  scene: { index: number; title: string; headline?: string | undefined },
): string[] {
  const fields = (parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ');
  const place = 'place' in o && o.place ? `place ${o.place}` : undefined;
  const cites =
    'citations' in o && o.citations?.length ? `cites ${o.citations.map(citationText).join('; ')}` : undefined;
  switch (o.type) {
    case 'caption':
      return [
        fields([
          `${i} caption: ${String(scene.index).padStart(2, '0')} · "${scene.title}"`,
          scene.headline !== undefined && `headline "${scene.headline}"`,
        ]),
      ];
    case 'title':
      return [
        fields([
          `${i} title page "${o.title}"`,
          o.subtitle !== undefined && `subtitle "${o.subtitle}"`,
          !!o.lines?.length && `lines ${quoted(o.lines)}`,
        ]),
      ];
    case 'statement':
      return [
        fields([
          `${i} statement${o.style ? ` (${o.style})` : ''}`,
          o.kicker !== undefined && `kicker "${o.kicker}"`,
          `lines ${quoted(o.lines)}`,
          place,
          cites,
        ]),
      ];
    case 'cards':
      return [
        fields([`${i} cards${o.title !== undefined ? ` "${o.title}"` : ''}`, place, cites]),
        ...o.items.map(
          (c, k) =>
            `  ${fields([
              `card ${k} "${c.title}"${o.active?.includes(k) ? ' (highlighted)' : ''}`,
              c.sub !== undefined && `sub "${c.sub}"`,
              c.icon && `icon ${c.icon}`,
            ])}`,
        ),
      ];
    case 'legend':
      return [fields([`${i} legend`, place, cites])];
    case 'image':
      return [
        fields([
          `${i} image ${o.asset}`,
          `alt "${o.alt}"`,
          o.caption !== undefined && `caption "${o.caption}"`,
          o.credit !== undefined && `credit "${o.credit}"`,
          place,
          cites,
        ]),
      ];
  }
}

/** Whether an issue's path lies within the one given. */
const within = (path: readonly (string | number)[], prefix: readonly (string | number)[]) =>
  prefix.every((part, k) => path[k] === part);

/**
 * What `story show` names: a scene, by its id or title, or a step, "<scene>.<step>". A scene's title may have
 * a dot in it ("Version 1.0"), so a reference with a dot that is a whole title is that scene, unless it is
 * also a step's own key (S1.2), which is the step; one that names any step another way too, or several, is
 * refused.
 */
function sceneOrStep(project: Project, ref: string): FoundScene | FoundStep {
  const attempt = <T>(find: () => T): T | OpError => {
    try {
      return find();
    } catch (error) {
      if (error instanceof OpError) return error;
      throw error;
    }
  };
  const scene = attempt(() => resolveScene(project, ref));
  if (!DOTTED.test(ref)) {
    if (scene instanceof OpError) throw scene;
    return scene;
  }
  if (!(scene instanceof OpError)) {
    const steps = stepsNamed(project, ref);
    const [first] = steps;
    if (!first) return scene;
    if (steps.length === 1 && first.key === ref) return first;
    const keys = steps.map((s) => s.key);
    throw new OpError(
      `"${ref}" is the title of scene ${scene.scene.id} and also names ${keys.length === 1 ? 'step' : 'steps'} ${listing(keys)}; use ${orList([scene.scene.id, ...keys])}.`,
      'usage',
    );
  }
  const step = attempt(() => resolveStep(project, ref));
  if (!(step instanceof OpError)) {
    // A title several scenes share names them all: the step is meant only when named by its own key.
    if (scene.kind === 'usage' && step.key !== ref)
      throw new OpError(`${scene.message} It also names step ${step.key}.`, 'usage');
    return step;
  }
  // Neither: about the step when a scene is named before one of the dots, else about the scene.
  const sceneBeforeDot = [...ref.matchAll(/\./g)].some(
    (dot) => !(attempt(() => resolveScene(project, ref.slice(0, dot.index))) instanceof OpError),
  );
  throw scene.kind === 'notFound' && sceneBeforeDot ? step : scene;
}

export function storyShowCommand(file: string, ref: string): CommandResult {
  const project = loadProject(file);
  const found = sceneOrStep(project, ref);
  if (!('step' in found)) return sceneShow(project, found);
  const { scene, step, sceneIndex, stepIndex, key } = found;
  const issues = checkProject(project).filter((i) =>
    within(i.path, ['story', 'scenes', sceneIndex, 'steps', stepIndex]),
  );
  const sources = stepSources(project, step);
  const lines = [
    `${key} "${step.label}": step ${stepIndex + 1} of ${scene.steps.length} in scene ${scene.id} ("${scene.title}")`,
    ...(step.at !== undefined ? [`due at ${step.at} s`] : []),
    ...(step.cue ? [`cue: ${step.cue}`] : []),
    'Map:',
    ...mapLines(step.map).map((l) => `  ${l}`),
    step.overlays.length ? 'Overlays (counted from 0, later ones on top):' : 'Overlays: none',
    ...step.overlays.flatMap((o, i) =>
      overlayLines(o, i, { index: sceneIndex, title: scene.title, headline: scene.headline }).map(
        (l) => `  ${l}`,
      ),
    ),
    `Sources it draws on: ${sources.length ? sources.join(', ') : 'none'}`,
    ...(issues.length ? ['Warnings:', ...issues.map((i) => `  ${i.message}`)] : []),
  ];
  return { text: lines.join('\n'), data: { key, scene: scene.id, step, sources, warnings: issues } };
}

function sceneShow(project: Project, { index, scene }: FoundScene): CommandResult {
  const last = index === project.story.scenes.length - 1;
  const lines = [
    `${scene.id} "${scene.title}": scene ${index + 1} of ${project.story.scenes.length}`,
    ...(scene.headline ? [`headline: ${scene.headline}`] : []),
    `target: ${scene.targetSeconds !== undefined ? seconds(scene.targetSeconds) : 'untimed'}`,
    ...(scene.sources.length ? [`also draws on: ${scene.sources.join(', ')}`] : []),
    `Steps (${scene.steps.length}):`,
    ...scene.steps.map((t) => `  ${scene.id}.${t.id}  ${t.label}`),
  ];
  if (scene.notes) lines.push('Notes:', ...scene.notes.split('\n').map((l) => `  ${l}`));
  if (scene.script !== undefined) {
    const marks = countKeyMarks(scene.script);
    const needed = keyMarksNeeded(scene.steps.length, last);
    lines.push(`Script (${marks} ${KEY_MARK} key ${marks === 1 ? 'mark' : 'marks'}; ${needed} needed):`);
    scriptSegments(scene.script).forEach((segment, i) => {
      const step = scene.steps[i];
      const label = step
        ? `${scene.id}.${step.id}`
        : i === scene.steps.length && !last
          ? 'leaving'
          : 'no step';
      if (segment) lines.push(`  [${label}] ${segment}`);
    });
  }
  return { text: lines.join('\n'), data: { scene, index } };
}

// ----- scenes -----

interface SceneOptions extends PlaceOptions {
  dryRun?: boolean;
  id?: string;
  title?: string;
  headline?: string;
  target?: string;
  notes?: string;
  notesFile?: string;
  script?: string;
  scriptFile?: string;
  sources?: string;
  clear?: string[];
}

function sceneFields(o: SceneOptions): SceneChanges {
  const notes = textOption(o.notes, o.notesFile, 'notes');
  const script = textOption(o.script, o.scriptFile, 'script');
  return {
    ...(o.title !== undefined ? { title: o.title } : {}),
    ...(o.headline !== undefined ? { headline: o.headline } : {}),
    ...(o.target !== undefined ? { targetSeconds: number(o.target, 'target') } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(script !== undefined ? { script } : {}),
    ...(o.sources !== undefined ? { sources: list(o.sources) } : {}),
  };
}

const SCENE_CLEARABLE = ['headline', 'target', 'notes', 'script', 'sources'];

export function sceneAddCommand(env: Env, file: string, o: SceneOptions & { title: string }): CommandResult {
  return edit(env, file, o, [
    (p) =>
      addScene(
        p,
        { ...sceneFields(o), ...(o.id ? { id: o.id } : {}) } as never,
        where(o, () => p.story.scenes.length, sceneId(p)),
      ),
  ]);
}

export function sceneSetCommand(env: Env, file: string, ref: string, o: SceneOptions): CommandResult {
  const clear = cleared(o.clear, SCENE_CLEARABLE, 'scenes');
  if ('target' in clear) {
    delete clear.target;
    (clear as Record<string, null>).targetSeconds = null;
  }
  if ('sources' in clear) {
    delete clear.sources;
    (clear as Record<string, unknown>).sources = [];
  }
  const changes = { ...sceneFields(o), ...clear } as SceneChanges;
  if (Object.keys(changes).length === 0)
    throw new OpError('Nothing to change: give a field to set or --clear.', 'usage');
  return edit(env, file, o, [(p) => setScene(p, ref, changes)]);
}

export function sceneRemoveCommand(
  env: Env,
  file: string,
  ref: string,
  o: { dryRun?: boolean; cascade?: boolean },
): CommandResult {
  return edit(env, file, o, [(p) => removeScene(p, ref, { cascade: o.cascade === true })]);
}

export function sceneMoveCommand(
  env: Env,
  file: string,
  ref: string,
  o: PlaceOptions & { dryRun?: boolean },
): CommandResult {
  return edit(env, file, o, [
    (p) => {
      const to = where(o, () => p.story.scenes.length - 1, sceneId(p));
      if (!to) throw new OpError('Say where: --before, --after, --first or --last.', 'usage');
      return moveScene(p, ref, to);
    },
  ]);
}

// ----- steps -----

/** The options that set what a step's map shows. They apply in the order listed in the help. */
export interface MapOptions {
  map?: string;
  mapFile?: string;
  hideMap?: boolean;
  showMap?: boolean;
  opacity?: string;
  base?: string;
  linkBase?: string;
  hidden?: string;
  ghost?: string;
  dim?: string;
  normal?: string;
  focus?: string;
  active?: string;
  unlist?: string;
  up?: string;
  down?: string;
  mixed?: string;
  clearTrend?: string;
  spread?: string;
  badge?: string;
  name?: string;
  hideBadge?: string;
  hideName?: string;
  pulse?: string[];
  pulseWith?: string;
  pulseLoop?: string;
  pulseRepeat?: string;
  pulseTone?: string;
  pulseDelay?: string;
  clearPulses?: boolean;
  frame?: string;
  wholeMap?: boolean;
  frameAt?: string;
  maxZoom?: string;
  labels?: string;
  categoryLabels?: string;
  labelText?: string[];
  reveal?: string;
  revealFrom?: string;
  revealSequence?: string;
  revealStagger?: string;
  revealDelay?: string;
  clearReveal?: boolean;
  ambient?: string;
  ambientTone?: string;
  ambientEvery?: string;
  ambientHops?: string;
  ambientDelay?: string;
  clearAmbient?: boolean;
  clusters?: string;
  minimap?: string;
}

const onOff = (text: string, option: string) => oneOf(text, ['on', 'off'], option) === 'on';

/** Ids that are links' ids are links; the rest are variables, by id or label. */
function splitElements(project: Project, refs: string[]): { variables: string[]; links: string[] } {
  const links = new Set(project.links.map((l) => l.id));
  return {
    links: refs.filter((r) => links.has(r)),
    variables: refs.filter((r) => !links.has(r)),
  };
}

/** The edits a step's map options ask for, on the step `key` names, in a fixed order. */
export function mapRuns(key: () => string, o: MapOptions): Run[] {
  const runs: Run[] = [];
  const whole = textOption(o.map, o.mapFile, 'map');
  if (whole !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(whole);
    } catch {
      throw new OpError('--map must be a JSON object: a map state, e.g. {"labels":"focus"}.', 'usage');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new OpError('--map must be a JSON object.', 'usage');
    runs.push((p) => {
      const current = resolveStep(p, key()).step.map;
      const clearing = Object.fromEntries(Object.keys(current).map((k) => [k, null]));
      return setStepMap(
        p,
        key(),
        { ...clearing, ...(parsed as MapState) },
        `Step ${key()}: map set from JSON.`,
      );
    });
  }
  const set = (changes: Parameters<typeof setStepMap>[2]) => runs.push((p) => setStepMap(p, key(), changes));
  if (o.hideMap && o.showMap) throw new OpError('Give --hide-map or --show-map, not both.', 'usage');
  if (o.hideMap) set({ show: false });
  if (o.showMap) set({ show: null });
  if (o.opacity !== undefined) set({ opacity: number(o.opacity, 'opacity') });
  if (o.base !== undefined)
    runs.push((p) => setStepBase(p, key(), 'variables', levelOf(o.base as string, 'base')));
  if (o.linkBase !== undefined)
    runs.push((p) => setStepBase(p, key(), 'links', levelOf(o.linkBase as string, 'link-base')));
  for (const level of LEVELS) {
    const given = o[level];
    if (given === undefined) continue;
    runs.push(...levelRuns(key, list(given), level, level));
  }
  if (o.unlist !== undefined) runs.push(...levelRuns(key, list(o.unlist), null, 'unlist'));
  for (const trend of ['up', 'down', 'mixed'] as const) {
    if (o[trend] !== undefined) runs.push((p) => setStepTrend(p, key(), list(o[trend]), trend));
  }
  if (o.clearTrend !== undefined) runs.push((p) => setStepTrend(p, key(), list(o.clearTrend), null));
  if (o.spread !== undefined) {
    const [variable, way] = pair(o.spread, 'spread');
    const direction = oneOf(way, ['up', 'down'] as const, 'spread');
    runs.push((p) => spreadTrend(p, key(), variable, direction));
  }
  if (o.badge !== undefined) runs.push((p) => setStepLoops(p, key(), list(o.badge), { badge: true }));
  if (o.name !== undefined) runs.push((p) => setStepLoops(p, key(), list(o.name), { name: true }));
  if (o.hideName !== undefined) runs.push((p) => setStepLoops(p, key(), list(o.hideName), { name: false }));
  if (o.hideBadge !== undefined)
    runs.push((p) => setStepLoops(p, key(), list(o.hideBadge), { badge: false }));
  if (o.clearPulses) set({ pulses: null });
  if (o.pulseLoop !== undefined) runs.push((p) => pulseRoundLoop(p, key(), o.pulseLoop as string));
  for (const hop of o.pulse ?? []) runs.push((p) => addPulseHop(p, key(), list(hop)));
  if (o.pulseWith !== undefined) runs.push((p) => addPulseHop(p, key(), list(o.pulseWith), { join: true }));
  if (o.pulseRepeat !== undefined || o.pulseTone !== undefined || o.pulseDelay !== undefined) {
    runs.push((p) => {
      const pulses = resolveStep(p, key()).step.map.pulses;
      if (!pulses)
        throw new OpError(
          `Step ${key()} has no pulses to time: add some with --pulse or --pulse-loop.`,
          'usage',
        );
      return setStepMap(p, key(), {
        pulses: {
          ...pulses,
          ...(o.pulseRepeat !== undefined ? { repeat: number(o.pulseRepeat, 'pulse-repeat') } : {}),
          ...(o.pulseTone !== undefined
            ? { tone: oneOf(o.pulseTone, ['harm', 'relief', 'mixed'] as const, 'pulse-tone') }
            : {}),
          ...(o.pulseDelay !== undefined ? { delay: number(o.pulseDelay, 'pulse-delay') } : {}),
        },
      });
    });
  }
  if (o.frame !== undefined && o.wholeMap)
    throw new OpError('Give --frame or --whole-map, not both.', 'usage');
  if (o.frame !== undefined || o.wholeMap || o.frameAt !== undefined || o.maxZoom !== undefined) {
    runs.push((p) => {
      const camera = { ...(resolveStep(p, key()).step.map.camera ?? {}) };
      if (o.wholeMap) delete camera.fit;
      if (o.frame !== undefined) camera.fit = list(o.frame).map((v) => resolveVariable(p, v).variable.id);
      if (o.frameAt !== undefined) camera.frame = oneOf(o.frameAt, FRAMES, 'frame-at');
      if (o.maxZoom !== undefined) camera.maxZoom = number(o.maxZoom, 'max-zoom');
      return setStepMap(p, key(), { camera: Object.keys(camera).length ? camera : null });
    });
  }
  if (o.labels !== undefined)
    set({ labels: oneOf(o.labels, ['none', 'focus', 'view', 'all'] as const, 'labels') });
  if (o.categoryLabels !== undefined)
    set({ categoryLabels: onOff(o.categoryLabels, 'category-labels') ? true : null });
  if (o.labelText?.length) {
    runs.push((p) => {
      const text = { ...(resolveStep(p, key()).step.map.labelText ?? {}) };
      for (const spec of o.labelText ?? []) {
        const [ref, value] = pair(spec, 'label-text');
        const id = resolveVariable(p, ref).variable.id;
        if (value === '') delete text[id];
        else text[id] = value;
      }
      return setStepMap(p, key(), { labelText: Object.keys(text).length ? text : null });
    });
  }
  if (o.clearReveal) set({ reveal: null });
  if (
    [o.reveal, o.revealFrom, o.revealSequence, o.revealStagger, o.revealDelay].some((v) => v !== undefined)
  ) {
    runs.push((p) => {
      const reveal = { ...(resolveStep(p, key()).step.map.reveal ?? {}) };
      if (o.reveal !== undefined) reveal.mode = oneOf(o.reveal, ['draw', 'bloom'] as const, 'reveal');
      if (o.revealFrom !== undefined)
        reveal.from = list(o.revealFrom).map((v) => resolveVariable(p, v).variable.id);
      if (o.revealSequence !== undefined) {
        const links = new Set(p.links.map((l) => l.id));
        reveal.sequence = list(o.revealSequence).map((r) =>
          links.has(r) ? r : resolveVariable(p, r).variable.id,
        );
      }
      if (o.revealStagger !== undefined) reveal.stagger = number(o.revealStagger, 'reveal-stagger');
      if (o.revealDelay !== undefined) reveal.delay = number(o.revealDelay, 'reveal-delay');
      return setStepMap(p, key(), { reveal });
    });
  }
  if (o.clearAmbient) set({ ambient: null });
  if (
    [o.ambient, o.ambientTone, o.ambientEvery, o.ambientHops, o.ambientDelay].some((v) => v !== undefined)
  ) {
    runs.push((p) => {
      const current = resolveStep(p, key()).step.map.ambient;
      const from =
        o.ambient !== undefined
          ? list(o.ambient).map((v) => resolveVariable(p, v).variable.id)
          : current?.from;
      const tone =
        o.ambientTone !== undefined
          ? oneOf(o.ambientTone, ['harm', 'relief'] as const, 'ambient-tone')
          : current?.tone;
      if (!from || !tone)
        throw new OpError(
          'Ambient pulses need --ambient <variables> and --ambient-tone harm|relief.',
          'usage',
        );
      const range = (text: string, option: string) => numbers(text, 2, option) as [number, number];
      return setStepMap(p, key(), {
        ambient: {
          ...(current ?? {}),
          from,
          tone,
          ...(o.ambientEvery !== undefined ? { every: range(o.ambientEvery, 'ambient-every') } : {}),
          ...(o.ambientHops !== undefined ? { hops: range(o.ambientHops, 'ambient-hops') } : {}),
          ...(o.ambientDelay !== undefined ? { delay: number(o.ambientDelay, 'ambient-delay') } : {}),
        },
      });
    });
  }
  if (o.clusters !== undefined)
    set({ clusters: oneOf(o.clusters, ['show', 'dim', 'hide'] as const, 'clusters') });
  if (o.minimap !== undefined) {
    const value = oneOf(o.minimap, ['on', 'off', 'auto'] as const, 'minimap');
    set({ minimap: value === 'auto' ? null : value === 'on' });
  }
  return runs;
}

function levelRuns(key: () => string, refs: string[], level: Level | null, option: string): Run[] {
  // An empty list ("" or ",") asks for an edit it does not name: refused, never reported as done.
  if (refs.length === 0) throw new OpError(`Name at least one variable or link for --${option}.`, 'usage');
  return [
    (p) => {
      const { variables, links } = splitElements(p, refs);
      let out: OpOutput<unknown> = { project: p, result: null, summary: '' };
      const summaries: string[] = [];
      if (variables.length) {
        out = setStepLevel(out.project, key(), 'variables', variables, level);
        summaries.push(out.summary);
      }
      if (links.length) {
        out = setStepLevel(out.project, key(), 'links', links, level);
        summaries.push(out.summary);
      }
      return { ...out, summary: summaries.join(' ') };
    },
  ];
}

interface StepOptions extends MapOptions, PlaceOptions {
  dryRun?: boolean;
  id?: string;
  label?: string;
  at?: string;
  cue?: string;
  clear?: string[];
}

function stepFields(o: StepOptions): StepChanges {
  return {
    ...(o.label !== undefined ? { label: o.label } : {}),
    ...(o.at !== undefined ? { at: number(o.at, 'at') } : {}),
    ...(o.cue !== undefined ? { cue: o.cue } : {}),
  };
}

export function stepAddCommand(
  env: Env,
  file: string,
  sceneRef: string,
  o: StepOptions & { label: string },
): CommandResult {
  let key = '';
  return edit(env, file, o, [
    (p) => {
      const { scene } = resolveScene(p, sceneRef);
      const out = addStep(
        p,
        sceneRef,
        { ...stepFields(o), ...(o.id ? { id: o.id } : {}), map: {} } as never,
        where(o, () => scene.steps.length, stepId(p, scene)),
      );
      key = out.result.key;
      return out;
    },
    ...mapRuns(() => key, o),
  ]);
}

export function stepSetCommand(env: Env, file: string, ref: string, o: StepOptions): CommandResult {
  const changes = { ...stepFields(o), ...cleared(o.clear, ['at', 'cue'], 'steps') } as StepChanges;
  let key = '';
  const runs: Run[] = [
    (p) => {
      key = resolveStep(p, ref).key;
      return Object.keys(changes).length
        ? setStep(p, key, changes)
        : { project: p, result: null, summary: '' };
    },
    ...mapRuns(() => key, o),
  ];
  if (runs.length === 1 && Object.keys(changes).length === 0) {
    throw new OpError('Nothing to change: give a field or a map option to set, or --clear.', 'usage');
  }
  const out = edit(env, file, o, runs);
  return { ...out, text: out.text.replace(/^\n+/, '') };
}

export function stepRemoveCommand(
  env: Env,
  file: string,
  ref: string,
  o: { dryRun?: boolean },
): CommandResult {
  return edit(env, file, o, [(p) => removeStep(p, ref)]);
}

export function stepMoveCommand(
  env: Env,
  file: string,
  ref: string,
  o: PlaceOptions & { scene?: string; dryRun?: boolean },
): CommandResult {
  return edit(env, file, o, [
    (p) => {
      const from = resolveStep(p, ref);
      const target = o.scene !== undefined ? resolveScene(p, o.scene).scene : from.scene;
      const count = target.steps.length - (target.id === from.scene.id ? 1 : 0);
      const to = where(o, () => count, stepId(p, target));
      if (!to && o.scene === undefined)
        throw new OpError('Say where: --scene, --before, --after, --first or --last.', 'usage');
      return moveStep(p, ref, { ...(to ?? {}), ...(o.scene !== undefined ? { scene: o.scene } : {}) });
    },
  ]);
}

export function stepCopyCommand(
  env: Env,
  file: string,
  ref: string,
  o: PlaceOptions & { label: string; scene?: string; dryRun?: boolean },
): CommandResult {
  return edit(env, file, o, [
    (p) => {
      const target = resolveScene(p, o.scene ?? resolveStep(p, ref).scene.id).scene;
      const to = where(o, () => target.steps.length, stepId(p, target));
      return copyStep(p, ref, {
        label: o.label,
        ...(o.scene !== undefined ? { scene: o.scene } : {}),
        ...(to ?? {}),
      });
    },
  ]);
}

// ----- overlays -----

export const OVERLAY_TYPES = ['caption', 'title', 'statement', 'cards', 'legend', 'image'] as const;

interface OverlayOptions {
  dryRun?: boolean;
  overlay?: string;
  title?: string;
  subtitle?: string;
  line?: string[];
  kicker?: string;
  style?: string;
  place?: string;
  card?: string[];
  active?: string;
  image?: string;
  alt?: string;
  caption?: string;
  credit?: string;
  cite?: string[];
  index?: string;
  clear?: string[];
}

/** "title | sub | icon" as a card. */
function card(spec: string) {
  const [title, sub, icon] = spec.split('|').map((part) => part.trim());
  if (!title) throw new OpError(`--card needs a title: "title | sub | icon", not "${spec}".`, 'usage');
  return {
    title,
    ...(sub ? { sub } : {}),
    ...(icon ? { icon: oneOf(icon, CARD_ICONS, 'card icon') } : {}),
  };
}

/** "source" or "source:pages" as a citation. */
function citation(spec: string) {
  const at = spec.indexOf(':');
  return at < 0
    ? { source: spec.trim() }
    : { source: spec.slice(0, at).trim(), pages: spec.slice(at + 1).trim() };
}

function overlayFields(o: OverlayOptions): Record<string, unknown> {
  let given: Record<string, unknown> = {};
  if (o.overlay !== undefined) {
    try {
      given = JSON.parse(o.overlay) as Record<string, unknown>;
    } catch {
      throw new OpError(
        '--overlay must be a JSON object of the overlay\'s fields, e.g. {"lines":["Why now?"]}.',
        'usage',
      );
    }
    if (!given || typeof given !== 'object' || Array.isArray(given)) {
      throw new OpError('--overlay must be a JSON object.', 'usage');
    }
  }
  return {
    ...given,
    ...(o.title !== undefined ? { title: o.title } : {}),
    ...(o.subtitle !== undefined ? { subtitle: o.subtitle } : {}),
    ...(o.line?.length ? { lines: o.line } : {}),
    ...(o.kicker !== undefined ? { kicker: o.kicker } : {}),
    ...(o.style !== undefined ? { style: o.style } : {}),
    ...(o.place !== undefined ? { place: oneOf(o.place, PLACES, 'place') } : {}),
    ...(o.card?.length ? { items: o.card.map(card) } : {}),
    ...(o.active !== undefined ? { active: list(o.active).map((n) => number(n, 'active')) } : {}),
    ...(o.image !== undefined ? { asset: o.image } : {}),
    ...(o.alt !== undefined ? { alt: o.alt } : {}),
    ...(o.caption !== undefined ? { caption: o.caption } : {}),
    ...(o.credit !== undefined ? { credit: o.credit } : {}),
    ...(o.cite?.length ? { citations: o.cite.map(citation) } : {}),
  };
}

export function overlayAddCommand(
  env: Env,
  file: string,
  ref: string,
  type: string,
  o: OverlayOptions,
): CommandResult {
  const kind = oneOf(type, OVERLAY_TYPES, 'type');
  const fields = overlayFields(o);
  // The type argument says what is added; --overlay may repeat it (as `story show --json` gives it), not change it.
  if ('type' in fields && fields.type !== kind) {
    throw new OpError(
      `--overlay gives type ${JSON.stringify(fields.type)}, but the type argument is ${kind}; leave type out of --overlay.`,
      'usage',
    );
  }
  return edit(env, file, o, [
    (p) =>
      addOverlay(
        p,
        ref,
        { ...fields, type: kind },
        o.index !== undefined ? { index: number(o.index, 'index') } : {},
      ),
  ]);
}

const OVERLAY_CLEARABLE = [
  'subtitle',
  'lines',
  'kicker',
  'style',
  'place',
  'title',
  'active',
  'caption',
  'credit',
  'citations',
];

export function overlaySetCommand(
  env: Env,
  file: string,
  ref: string,
  index: string,
  o: OverlayOptions,
): CommandResult {
  const changes = { ...overlayFields(o), ...cleared(o.clear, OVERLAY_CLEARABLE, 'overlays') };
  if (Object.keys(changes).length === 0)
    throw new OpError('Nothing to change: give a field to set or --clear.', 'usage');
  return edit(env, file, o, [(p) => setOverlay(p, ref, number(index, 'overlay'), changes)]);
}

export function overlayRemoveCommand(
  env: Env,
  file: string,
  ref: string,
  index: string,
  o: { dryRun?: boolean },
): CommandResult {
  return edit(env, file, o, [(p) => removeOverlay(p, ref, number(index, 'overlay'))]);
}

export function overlayMoveCommand(
  env: Env,
  file: string,
  ref: string,
  index: string,
  o: { to: string; dryRun?: boolean },
): CommandResult {
  return edit(env, file, o, [(p) => moveOverlay(p, ref, number(index, 'overlay'), number(o.to, 'to'))]);
}

// ----- images -----

function imageFile(path: string): string {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(path));
  } catch {
    throw new OpError(`No file ${path}.`, 'usage');
  }
  return imageDataUri(bytes, path);
}

export function imageAddCommand(
  env: Env,
  file: string,
  image: string,
  o: { id?: string; dryRun?: boolean },
): CommandResult {
  const data = imageFile(image);
  const name = image.split(/[\\/]/).at(-1) ?? image;
  return edit(env, file, o, [(p) => addAsset(p, { data, name, ...(o.id ? { id: o.id } : {}) })]);
}

export function imageSetCommand(
  env: Env,
  file: string,
  id: string,
  image: string,
  o: { dryRun?: boolean },
): CommandResult {
  const data = imageFile(image);
  return edit(env, file, o, [(p) => setAsset(p, id, data)]);
}

export function imageRemoveCommand(
  env: Env,
  file: string,
  id: string,
  o: { cascade?: boolean; dryRun?: boolean },
): CommandResult {
  return edit(env, file, o, [(p) => removeAsset(p, id, { cascade: o.cascade === true })]);
}
