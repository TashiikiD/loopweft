// A step's overlays (captions, title pages, statements, cards, legends and images) and the embedded images
// they show. Overlays are counted from 0 in a step's list, which is also the order they draw in (later ones
// on top).
import { base64, imageProblem, imageType } from '../images.ts';
import { AssetSchema, IdSchema, type Overlay, OverlaySchema, type Project, type Scene } from '../schema.ts';
import { slugify, uniqueId } from '../text/ids.ts';
import { didYouMean } from '../text/similarity.ts';
import { resolveStep } from './story.ts';
import { stepKey } from './story-refs.ts';
import { ensureValid, listing, OpError, type OpOutput, parseElement, plural, sameJson } from './support.ts';

/** Changes to an overlay: a value sets the field, `null` clears an optional one. Its type stays. */
export type OverlayChanges = Record<string, unknown>;

/** What people call each overlay type. */
export const OVERLAY_NAMES: Record<Overlay['type'], string> = {
  caption: 'caption',
  title: 'title page',
  statement: 'statement',
  cards: 'cards',
  legend: 'legend',
  image: 'image',
};

function overlayAt(project: Project, ref: string, index: number) {
  const found = resolveStep(project, ref);
  const overlay = found.step.overlays[index];
  if (!Number.isInteger(index) || !overlay) {
    const n = found.step.overlays.length;
    throw new OpError(
      n === 0
        ? `Step ${found.key} has no overlays.`
        : `Step ${found.key} has no overlay ${index} (it has ${plural(n, 'overlay')}, counted from 0).`,
      'notFound',
    );
  }
  return { ...found, overlay };
}

const path = (sceneIndex: number, stepIndex: number, index: number) => [
  'story',
  'scenes',
  sceneIndex,
  'steps',
  stepIndex,
  'overlays',
  index,
];

export function addOverlay(
  project: Project,
  ref: string,
  overlay: unknown,
  options: { index?: number } = {},
): OpOutput<{ key: string; index: number; type: Overlay['type'] }> {
  const { sceneIndex, stepIndex, step, key } = resolveStep(project, ref);
  const index = options.index ?? step.overlays.length;
  if (!Number.isInteger(index) || index < 0 || index > step.overlays.length) {
    throw new OpError(
      `The place must be a whole number from 0 to ${step.overlays.length}, not ${index}.`,
      'usage',
    );
  }
  const parsed = parseElement(OverlaySchema, overlay, path(sceneIndex, stepIndex, index));
  if (parsed.type === 'caption' && step.overlays.some((o) => o.type === 'caption')) {
    throw new OpError(`Step ${key} already shows the scene's caption.`, 'conflict');
  }
  const next = structuredClone(project);
  ((next.story.scenes[sceneIndex] as Scene).steps[stepIndex] as { overlays: Overlay[] }).overlays.splice(
    index,
    0,
    parsed,
  );
  ensureValid(project, next);
  return {
    project: next,
    result: { key, index, type: parsed.type },
    summary: `Step ${key}: added ${parsed.type === 'image' ? 'an' : 'a'} ${OVERLAY_NAMES[parsed.type]} (overlay ${index}).`,
  };
}

export function setOverlay(
  project: Project,
  ref: string,
  index: number,
  changes: OverlayChanges,
): OpOutput<{ key: string; index: number; changed: string[] }> {
  const { sceneIndex, stepIndex, key, overlay } = overlayAt(project, ref, index);
  if ('type' in changes && changes.type !== overlay.type) {
    throw new OpError(
      `An overlay keeps its type; remove this ${OVERLAY_NAMES[overlay.type]} and add another instead.`,
      'usage',
    );
  }
  const candidate: Record<string, unknown> = { ...overlay };
  for (const [field, value] of Object.entries(changes)) {
    if (value === null) delete candidate[field];
    else if (value !== undefined) candidate[field] = value;
  }
  const updated = parseElement(OverlaySchema, candidate, path(sceneIndex, stepIndex, index));
  const changed = Object.keys(changes).filter(
    (field) =>
      !sameJson((overlay as Record<string, unknown>)[field], (updated as Record<string, unknown>)[field]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { key, index, changed },
      summary: `Nothing to change: overlay ${index} of step ${key} already has those values.`,
    };
  }
  const next = structuredClone(project);
  ((next.story.scenes[sceneIndex] as Scene).steps[stepIndex] as { overlays: Overlay[] }).overlays[index] =
    updated;
  ensureValid(project, next);
  return {
    project: next,
    result: { key, index, changed },
    summary: `Step ${key}: changed the ${OVERLAY_NAMES[overlay.type]} (overlay ${index}): ${changed.join(', ')}.`,
  };
}

export function removeOverlay(
  project: Project,
  ref: string,
  index: number,
): OpOutput<{ key: string; index: number }> {
  const { sceneIndex, stepIndex, key, overlay } = overlayAt(project, ref, index);
  const next = structuredClone(project);
  ((next.story.scenes[sceneIndex] as Scene).steps[stepIndex] as { overlays: Overlay[] }).overlays.splice(
    index,
    1,
  );
  return {
    project: next,
    result: { key, index },
    summary: `Step ${key}: removed the ${OVERLAY_NAMES[overlay.type]} (overlay ${index}).`,
  };
}

/** Moves an overlay to another place in its step's list: later ones draw on top. */
export function moveOverlay(
  project: Project,
  ref: string,
  index: number,
  to: number,
): OpOutput<{ key: string; index: number }> {
  const { sceneIndex, stepIndex, step, key, overlay } = overlayAt(project, ref, index);
  if (!Number.isInteger(to) || to < 0 || to >= step.overlays.length) {
    throw new OpError(
      `The new place must be a whole number from 0 to ${step.overlays.length - 1}, not ${to}.`,
      'usage',
    );
  }
  if (to === index)
    return { project, result: { key, index }, summary: `Overlay ${index} of step ${key} is already there.` };
  const next = structuredClone(project);
  const list = ((next.story.scenes[sceneIndex] as Scene).steps[stepIndex] as { overlays: Overlay[] })
    .overlays;
  const [moved] = list.splice(index, 1);
  list.splice(to, 0, moved as Overlay);
  return {
    project: next,
    result: { key, index: to },
    summary: `Step ${key}: moved the ${OVERLAY_NAMES[overlay.type]} from overlay ${index} to ${to}.`,
  };
}

// ----- embedded images -----

/** The steps whose image overlays show an asset. */
export function assetUses(project: Project, id: string): string[] {
  return project.story.scenes.flatMap((scene) =>
    scene.steps
      .filter((step) => step.overlays.some((o) => o.type === 'image' && o.asset === id))
      .map((step) => stepKey(scene.id, step.id)),
  );
}

function knownAsset(project: Project, id: string): string {
  const data = project.assets[id];
  if (data === undefined) {
    throw new OpError(`No image "${id}"${didYouMean(id, Object.keys(project.assets))}.`, 'notFound');
  }
  return data;
}

/** Embeds an image (a base64 data URI, e.g. from `imageDataUri`). Its id comes from `name` when not given. */
export function addAsset(
  project: Project,
  input: { data: string; id?: string; name?: string },
): OpOutput<{ id: string }> {
  const taken = new Set(Object.keys(project.assets));
  if (input.id !== undefined && taken.has(input.id)) {
    throw new OpError(`There is already an image "${input.id}"; choose another id.`, 'conflict');
  }
  const id = input.id ?? uniqueId(slugify((input.name ?? '').replace(/\.[a-z0-9]+$/i, '')), taken, 'image');
  parseElement(IdSchema, id, ['assets', id]);
  checkImage(input.data, ['assets', id]);
  const next = structuredClone(project);
  next.assets[id] = input.data;
  return { project: next, result: { id }, summary: `Embedded image ${id} (${kib(input.data)}).` };
}

/** Replaces an embedded image's data; every overlay that shows it shows the new one. */
export function setAsset(
  project: Project,
  id: string,
  data: string,
): OpOutput<{ id: string; uses: string[] }> {
  const old = knownAsset(project, id);
  checkImage(data, ['assets', id]);
  const uses = assetUses(project, id);
  if (old === data)
    return {
      project,
      result: { id, uses },
      summary: `Nothing to change: image ${id} is already that image.`,
    };
  const next = structuredClone(project);
  next.assets[id] = data;
  return {
    project: next,
    result: { id, uses },
    summary: `Replaced image ${id} (${kib(data)})${uses.length ? `, shown on ${listing(uses)}` : ''}.`,
  };
}

/** Removes an embedded image; one that overlays still show only with `cascade`, which removes those overlays too. */
export function removeAsset(
  project: Project,
  id: string,
  options: { cascade?: boolean } = {},
): OpOutput<{ id: string; steps: string[] }> {
  knownAsset(project, id);
  const steps = assetUses(project, id);
  if (steps.length && !options.cascade) {
    throw new OpError(
      `Image ${id} is shown on ${plural(steps.length, 'step')} (${listing(steps)}). Remove those overlays first, or remove it with cascade to remove them too.`,
      'conflict',
    );
  }
  const next = structuredClone(project);
  delete next.assets[id];
  for (const scene of next.story.scenes) {
    for (const step of scene.steps)
      step.overlays = step.overlays.filter((o) => !(o.type === 'image' && o.asset === id));
  }
  return {
    project: next,
    result: { id, steps },
    summary: `Removed image ${id}${steps.length ? ` and its overlays on ${listing(steps)}` : ''}.`,
  };
}

/**
 * Refuses image data an image overlay could not show (`imageProblem`): not a base64 data URI, base64 that
 * does not decode, bytes that are not the image type the URI declares, or an image cut off or with no picture.
 */
function checkImage(data: string, path: (string | number)[]): void {
  parseElement(AssetSchema, data, path);
  const problem = imageProblem(data);
  if (problem)
    throw new OpError(problem, 'invalid', [
      { severity: 'error', code: 'invalidImage', message: problem, path },
    ]);
}

const kib = (data: string) => {
  const encoded = data.slice(data.indexOf(',') + 1).replace(/=+$/, '');
  const bytes = Math.floor((encoded.length * 3) / 4);
  return bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 1024)} KB`;
};

/** A file's bytes as a data URI an asset can hold; refuses what is not a PNG, JPEG, GIF, WebP or SVG image. */
export function imageDataUri(bytes: Uint8Array, name = 'The file'): string {
  const type = imageType(bytes);
  if (!type) throw new OpError(`${name} is not a PNG, JPEG, GIF, WebP or SVG image.`, 'usage');
  return `data:image/${type};base64,${base64(bytes)}`;
}
