// Scenes and steps: adding, changing, removing, moving and copying them. A step is named by its scene and its
// own id, "S05.3"; scene and step ids are kept when anything else changes, so a reference stays good.
import type { z } from 'zod';
import { type Project, type Scene, SceneSchema, type Step, StepSchema } from '../schema.ts';
import { didYouMean } from '../text/similarity.ts';
import { normalizeToken } from '../text/vocabulary.ts';
import { stepKey } from './story-refs.ts';
import { ensureValid, listing, OpError, type OpOutput, parseElement, plural, sameJson } from './support.ts';

/** A new scene: its id is the next free S<n> when not given. Steps are added one by one (`addStep`). */
export type SceneInput = Omit<z.input<typeof SceneSchema>, 'id' | 'steps'> & { id?: string };

/** Changes to a scene: a value sets the field, `null` clears an optional one. The id and steps stay. */
export type SceneChanges = { [K in Exclude<keyof Scene, 'id' | 'steps'>]?: Scene[K] | null };

/** A new step: its id is the next free number in its scene when not given. `map` is required: a step states its whole map. */
export type StepInput = Omit<z.input<typeof StepSchema>, 'id'> & { id?: string };

/** Changes to a step: a value sets the field, `null` clears an optional one. The id stays. */
export type StepChanges = { [K in Exclude<keyof Step, 'id'>]?: Step[K] | null };

/**
 * Where a scene or step goes: before or after another (by id), or at an index (0 = first). Left out: at the
 * end. A step's place may also name another scene to go to.
 */
export interface Where {
  before?: string;
  after?: string;
  index?: number;
}

export interface FoundScene {
  index: number;
  scene: Scene;
}

export interface FoundStep {
  sceneIndex: number;
  stepIndex: number;
  scene: Scene;
  step: Step;
  /** "<scene id>.<step id>". */
  key: string;
}

/** A scene named by its id, or by its title (ignoring case and spacing) when only one has it. */
export function resolveScene(project: Project, ref: string): FoundScene {
  const scenes = project.story.scenes;
  const exact = scenes.findIndex((s) => s.id === ref);
  if (exact >= 0) return { index: exact, scene: scenes[exact] as Scene };
  const token = normalizeToken(ref);
  const matches = scenes.flatMap((scene, index) =>
    normalizeToken(scene.title) === token ? [{ index, scene }] : [],
  );
  if (matches.length === 1) return matches[0] as FoundScene;
  if (matches.length > 1) {
    throw new OpError(
      `"${ref}" is the title of ${matches.length} scenes (${matches.map((m) => m.scene.id).join(', ')}); use the id of the one you mean.`,
      'usage',
    );
  }
  throw new OpError(
    `No scene "${ref}"${didYouMean(
      ref,
      scenes.flatMap((s) => [s.id, s.title]),
    )}.`,
    'notFound',
  );
}

/** The step `stepRef` (by id, or by label when only one has it) in a scene named by `sceneRef`. */
function stepIn(project: Project, sceneRef: string, stepRef: string): FoundStep {
  const { index: sceneIndex, scene } = resolveScene(project, sceneRef);
  let stepIndex = scene.steps.findIndex((s) => s.id === stepRef);
  if (stepIndex < 0) {
    const token = normalizeToken(stepRef);
    const matches = scene.steps.flatMap((s, i) => (normalizeToken(s.label) === token ? [i] : []));
    if (matches.length > 1) {
      throw new OpError(
        `"${stepRef}" is the label of ${matches.length} steps of scene ${scene.id}; use the step's id.`,
        'usage',
      );
    }
    stepIndex = matches[0] ?? -1;
  }
  const step = scene.steps[stepIndex];
  if (!step) {
    const keys = scene.steps.map((s) => stepKey(scene.id, s.id));
    throw new OpError(
      scene.steps.length === 0
        ? `Scene ${scene.id} has no steps yet.`
        : `No step "${stepRef}" in scene ${scene.id} (it has ${listing(keys)}).`,
      'notFound',
    );
  }
  return { sceneIndex, stepIndex, scene, step, key: stepKey(scene.id, step.id) };
}

/**
 * A step named "<scene>.<step>", e.g. "S05.3": the scene by id or title, the step by id or label. Ids have no
 * dots, but a scene's title may ("Part 1. Growth.2"), so every dot is tried as the separator; a reference
 * that names two different steps that way is refused as ambiguous.
 */
export function resolveStep(project: Project, ref: string): FoundStep {
  const dots = [...ref].flatMap((ch, i) => (ch === '.' && i > 0 && i < ref.length - 1 ? [i] : []));
  if (dots.length === 0) {
    throw new OpError(`Name a step by its scene and its id, e.g. "S05.3" (not "${ref}").`, 'usage');
  }
  const found = new Map<string, FoundStep>();
  // The error to report when nothing matches: one about a step in a scene that was found, else the first.
  let failure: { error: OpError; sceneFound: boolean } | null = null;
  for (const dot of dots) {
    const sceneRef = ref.slice(0, dot);
    try {
      const step = stepIn(project, sceneRef, ref.slice(dot + 1));
      found.set(step.key, step);
    } catch (error) {
      if (!(error instanceof OpError)) throw error;
      const sceneFound = (() => {
        try {
          resolveScene(project, sceneRef);
          return true;
        } catch {
          return false;
        }
      })();
      if (!failure || (sceneFound && !failure.sceneFound)) failure = { error, sceneFound };
    }
  }
  const steps = [...found.values()];
  if (steps.length === 1) return steps[0] as FoundStep;
  if (steps.length > 1) {
    throw new OpError(
      `"${ref}" names ${steps.length} steps (${listing(steps.map((s) => s.key))}); use the scene's id, e.g. ${steps[0]?.key}.`,
      'usage',
    );
  }
  throw (failure as { error: OpError }).error;
}

/**
 * The next free scene id: S followed by one more than the highest number of an `S<n>` id, padded to as many
 * digits as the existing ones use (S00 … S10 gives S11); S1 for a story with none.
 */
export function nextSceneId(project: Project): string {
  const taken = new Set(project.story.scenes.map((s) => s.id));
  const numbered = [...taken].flatMap((id) => {
    const m = /^S(\d+)$/.exec(id);
    return m ? [m[1] as string] : [];
  });
  const width = Math.max(1, ...numbered.map((n) => n.length));
  let n = Math.max(0, ...numbered.map(Number)) + 1;
  while (taken.has(`S${String(n).padStart(width, '0')}`)) n++;
  return `S${String(n).padStart(width, '0')}`;
}

/** The next free step id in a scene: one more than its highest whole-number id (1 for a scene with none). */
export function nextStepId(scene: Pick<Scene, 'steps'>): string {
  const taken = new Set(scene.steps.map((s) => s.id));
  let n = Math.max(0, ...scene.steps.flatMap((s) => (/^\d+$/.test(s.id) ? [Number(s.id)] : []))) + 1;
  while (taken.has(String(n))) n++;
  return String(n);
}

/** Where `where` puts an item in a list of `ids` (without the item itself). */
function slot(ids: readonly string[], where: Where | undefined, what: string): number {
  const given = [where?.before, where?.after, where?.index].filter((v) => v !== undefined);
  if (given.length > 1)
    throw new OpError(`Give one place for the ${what}: before, after or an index.`, 'usage');
  if (where?.before !== undefined || where?.after !== undefined) {
    const ref = (where.before ?? where.after) as string;
    const at = ids.indexOf(ref);
    if (at < 0)
      throw new OpError(`No ${what} "${ref}" to place it beside${didYouMean(ref, [...ids])}.`, 'notFound');
    return where.before !== undefined ? at : at + 1;
  }
  if (where?.index !== undefined) {
    if (!Number.isInteger(where.index) || where.index < 0 || where.index > ids.length) {
      throw new OpError(
        `The place must be a whole number from 0 to ${ids.length}, not ${where.index}.`,
        'usage',
      );
    }
    return where.index;
  }
  return ids.length;
}

const ordinal = (index: number) => `${index + 1}`;

// ----- scenes -----

export function addScene(
  project: Project,
  input: SceneInput,
  where?: Where,
): OpOutput<{ id: string; index: number }> {
  const scenes = project.story.scenes;
  if (input.id !== undefined && scenes.some((s) => s.id === input.id)) {
    throw new OpError(`There is already a scene ${input.id}; choose another id.`, 'conflict');
  }
  const id = input.id ?? nextSceneId(project);
  const index = slot(
    scenes.map((s) => s.id),
    where,
    'scene',
  );
  const scene = parseElement(SceneSchema, { ...input, id, steps: [] }, ['story', 'scenes', index]);
  const next = structuredClone(project);
  next.story.scenes.splice(index, 0, scene);
  ensureValid(project, next);
  return {
    project: next,
    result: { id, index },
    summary: `Added scene ${id} ("${scene.title}"), scene ${ordinal(index)} of ${next.story.scenes.length}.`,
  };
}

export function setScene(
  project: Project,
  ref: string,
  changes: SceneChanges,
): OpOutput<{ id: string; changed: string[] }> {
  if ('id' in changes) throw new OpError('A scene keeps its id.', 'usage');
  if ('steps' in changes) throw new OpError('Change steps one by one (add, set, remove, move).', 'usage');
  const { index, scene } = resolveScene(project, ref);
  const candidate: Record<string, unknown> = { ...scene };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  const updated = parseElement(SceneSchema, candidate, ['story', 'scenes', index]);
  const changed = Object.keys(changes).filter(
    (key) => !sameJson(scene[key as keyof Scene], updated[key as keyof Scene]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { id: scene.id, changed },
      summary: `Nothing to change: scene ${scene.id} already has those values.`,
    };
  }
  const next = structuredClone(project);
  next.story.scenes[index] = updated;
  ensureValid(project, next);
  return {
    project: next,
    result: { id: scene.id, changed },
    summary: `Changed scene ${scene.id}: ${changed.join(', ')}.`,
  };
}

export function removeScene(
  project: Project,
  ref: string,
  options: { cascade?: boolean } = {},
): OpOutput<{ id: string; steps: string[] }> {
  const { index, scene } = resolveScene(project, ref);
  const steps = scene.steps.map((s) => stepKey(scene.id, s.id));
  if (steps.length && !options.cascade) {
    throw new OpError(
      `Scene ${scene.id} has ${plural(steps.length, 'step')}. Move them to another scene first, or remove the scene with cascade to remove them too.`,
      'conflict',
    );
  }
  const next = structuredClone(project);
  next.story.scenes.splice(index, 1);
  return {
    project: next,
    result: { id: scene.id, steps },
    summary: `Removed scene ${scene.id} ("${scene.title}")${steps.length ? ` and its ${plural(steps.length, 'step')}` : ''}.`,
  };
}

export function moveScene(
  project: Project,
  ref: string,
  where: Where,
): OpOutput<{ id: string; index: number }> {
  const { index, scene } = resolveScene(project, ref);
  const others = project.story.scenes.filter((_, i) => i !== index);
  if (where.before === scene.id || where.after === scene.id) {
    throw new OpError(`A scene cannot be placed beside itself.`, 'usage');
  }
  const to = slot(
    others.map((s) => s.id),
    where,
    'scene',
  );
  if (to === index) {
    return { project, result: { id: scene.id, index }, summary: `Scene ${scene.id} is already there.` };
  }
  const next = structuredClone(project);
  const [moved] = next.story.scenes.splice(index, 1);
  next.story.scenes.splice(to, 0, moved as Scene);
  return {
    project: next,
    result: { id: scene.id, index: to },
    summary: `Moved scene ${scene.id} to place ${ordinal(to)} of ${next.story.scenes.length}.`,
  };
}

// ----- steps -----

export function addStep(
  project: Project,
  sceneRef: string,
  input: StepInput,
  where?: Where,
): OpOutput<{ key: string; id: string; index: number }> {
  const { index: s, scene } = resolveScene(project, sceneRef);
  if (input.id !== undefined && scene.steps.some((t) => t.id === input.id)) {
    throw new OpError(`Scene ${scene.id} already has a step ${input.id}; choose another id.`, 'conflict');
  }
  if ((input as { map?: unknown }).map === undefined) {
    throw new OpError(
      'A step needs its map: what the map shows (an empty map state shows the whole map).',
      'usage',
    );
  }
  const id = input.id ?? nextStepId(scene);
  const index = slot(
    scene.steps.map((t) => t.id),
    where,
    'step',
  );
  const step = parseElement(StepSchema, { ...input, id }, ['story', 'scenes', s, 'steps', index]);
  const next = structuredClone(project);
  (next.story.scenes[s] as Scene).steps.splice(index, 0, step);
  ensureValid(project, next);
  const key = stepKey(scene.id, id);
  return {
    project: next,
    result: { key, id, index },
    summary: `Added step ${key} ("${step.label}"), step ${ordinal(index)} of ${scene.steps.length + 1} in scene ${scene.id}.`,
  };
}

export function setStep(
  project: Project,
  ref: string,
  changes: StepChanges,
): OpOutput<{ key: string; changed: string[] }> {
  if ('id' in changes) throw new OpError('A step keeps its id.', 'usage');
  const { sceneIndex, stepIndex, step, key } = resolveStep(project, ref);
  const candidate: Record<string, unknown> = { ...step };
  for (const [field, value] of Object.entries(changes)) {
    if (value === null) delete candidate[field];
    else if (value !== undefined) candidate[field] = value;
  }
  const updated = parseElement(StepSchema, candidate, ['story', 'scenes', sceneIndex, 'steps', stepIndex]);
  const changed = Object.keys(changes).filter(
    (field) => !sameJson(step[field as keyof Step], updated[field as keyof Step]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { key, changed },
      summary: `Nothing to change: step ${key} already has those values.`,
    };
  }
  const next = structuredClone(project);
  (next.story.scenes[sceneIndex] as Scene).steps[stepIndex] = updated;
  ensureValid(project, next);
  return { project: next, result: { key, changed }, summary: `Changed step ${key}: ${changed.join(', ')}.` };
}

export function removeStep(project: Project, ref: string): OpOutput<{ key: string }> {
  const { sceneIndex, stepIndex, step, key } = resolveStep(project, ref);
  const next = structuredClone(project);
  (next.story.scenes[sceneIndex] as Scene).steps.splice(stepIndex, 1);
  return { project: next, result: { key }, summary: `Removed step ${key} ("${step.label}").` };
}

/**
 * Moves a step within its scene or to another (`scene`). A step that moves to a scene where its id is taken
 * gets that scene's next free id, and the result says so.
 */
export function moveStep(
  project: Project,
  ref: string,
  where: Where & { scene?: string },
): OpOutput<{ from: string; key: string; index: number }> {
  const found = resolveStep(project, ref);
  const target = where.scene !== undefined ? resolveScene(project, where.scene) : null;
  const toScene = target ?? { index: found.sceneIndex, scene: found.scene };
  const same = toScene.index === found.sceneIndex;
  const others = toScene.scene.steps.filter((_, i) => !same || i !== found.stepIndex);
  if (same && (where.before === found.step.id || where.after === found.step.id)) {
    throw new OpError('A step cannot be placed beside itself.', 'usage');
  }
  const to = slot(
    others.map((t) => t.id),
    where,
    'step',
  );
  if (same && to === found.stepIndex) {
    return {
      project,
      result: { from: found.key, key: found.key, index: to },
      summary: `Step ${found.key} is already there.`,
    };
  }
  const clash = !same && toScene.scene.steps.some((t) => t.id === found.step.id);
  const id = clash ? nextStepId(toScene.scene) : found.step.id;
  const next = structuredClone(project);
  (next.story.scenes[found.sceneIndex] as Scene).steps.splice(found.stepIndex, 1);
  (next.story.scenes[toScene.index] as Scene).steps.splice(to, 0, { ...structuredClone(found.step), id });
  const key = stepKey(toScene.scene.id, id);
  const renamed = clash ? ` (its id ${found.step.id} was taken there, so it is now ${id})` : '';
  return {
    project: next,
    result: { from: found.key, key, index: to },
    summary: same
      ? `Moved step ${found.key} to place ${ordinal(to)} of ${found.scene.steps.length}.`
      : `Moved step ${found.key} to scene ${toScene.scene.id}, place ${ordinal(to)}, as ${key}${renamed}.`,
  };
}

/**
 * A copy of a step, with everything it shows, under a new label (required: the copy is a step of its own).
 * It goes just after the original unless placed elsewhere, in the same scene unless `scene` says another.
 */
export function copyStep(
  project: Project,
  ref: string,
  options: { label: string; scene?: string } & Where,
): OpOutput<{ from: string; key: string; id: string; index: number }> {
  const found = resolveStep(project, ref);
  const { label, scene, ...where } = options;
  const sceneRef = scene ?? found.scene.id;
  const placed = where.before !== undefined || where.after !== undefined || where.index !== undefined;
  const sameScene = resolveScene(project, sceneRef).index === found.sceneIndex;
  const { id: _id, ...rest } = structuredClone(found.step);
  const out = addStep(
    project,
    sceneRef,
    { ...rest, label },
    placed || !sameScene ? where : { after: found.step.id },
  );
  return {
    project: out.project,
    result: { from: found.key, ...out.result },
    summary: `Copied step ${found.key} as ${out.result.key} ("${label}").`,
  };
}
