// Naming, changing and removing feedback loops. A named loop lists its links in order round the loop; it
// is reinforcing or balancing by its signs, which are never stored (see loopPolarity).
import type { z } from 'zod';
import { loopPolarity } from '../loops.ts';
import { elementIds } from '../refs.ts';
import { type Loop, LoopSchema, type Project } from '../schema.ts';
import { compareStrings, nextSequentialId, uniqueId } from '../text/ids.ts';
import { didYouMean } from '../text/similarity.ts';
import { pruneMentions, type Removed, stepsMentioning } from './story-refs.ts';
import { ensureValid, listing, OpError, type OpOutput, parseElement, plural, sameJson } from './support.ts';

/**
 * A new named loop. Without an id it gets the next free `R<n>` when reinforcing, `B<n>` when balancing, or
 * `loop<n>` when a link's sign is unknown. The id is chosen once: it does not follow later sign changes.
 */
export type LoopInput = Omit<z.input<typeof LoopSchema>, 'id'> & { id?: string };

/** Changes to a named loop: a value sets the field, `null` clears an optional one. The id stays. */
export type LoopChanges = { [K in Exclude<keyof Loop, 'id'>]?: Loop[K] | null };

/** The same cycle whichever link it starts from: its links rotated to start at the smallest id. */
export function loopKey(links: readonly string[]): string {
  if (links.length === 0) return '';
  let start = 0;
  links.forEach((id, i) => {
    if (compareStrings(id, links[start] as string) < 0) start = i;
  });
  return [...links.slice(start), ...links.slice(0, start)].join(' ');
}

/** A named loop by its id. */
export function findLoop(project: Project, id: string): { index: number; loop: Loop } {
  const index = project.loops.findIndex((l) => l.id === id);
  if (index < 0) {
    throw new OpError(
      `No loop "${id}"${didYouMean(
        id,
        project.loops.map((l) => l.id),
      )}.`,
      'notFound',
    );
  }
  return { index, loop: project.loops[index] as Loop };
}

/** A named loop that goes round the same links, whichever link either starts from. */
function twinOf(project: Project, links: readonly string[], except?: string): Loop | undefined {
  const key = loopKey(links);
  return project.loops.find((l) => l.id !== except && loopKey(l.links) === key);
}

export function addLoop(project: Project, input: LoopInput): OpOutput<{ id: string; polarity: string }> {
  const taken = elementIds(project);
  if (input.id !== undefined && taken.has(input.id)) {
    throw new OpError(`The id "${input.id}" is already used; choose another.`, 'conflict');
  }
  const links = [...(input.links ?? [])];
  const twin = twinOf(project, links);
  if (twin) {
    throw new OpError(`Loop ${twin.id} ("${twin.name}") already goes round those links.`, 'conflict');
  }
  // A stand-in id while the links are checked, so the check cannot clash with an element of the map.
  const draft = parseElement(LoopSchema, { ...input, id: input.id ?? uniqueId('new_loop', taken) }, [
    'loops',
    project.loops.length,
  ]);
  const next = structuredClone(project);
  next.loops.push(draft);
  // The links must exist and close a chain before the loop has a polarity.
  ensureValid(project, next);
  const polarity = loopPolarity(next, draft) ?? '?';
  const id = input.id ?? nextSequentialId(polarity === '?' ? 'loop' : polarity, taken);
  (next.loops.at(-1) as Loop).id = id;
  return {
    project: next,
    result: { id, polarity },
    summary: `Named loop ${id} ("${draft.name}"): ${plural(links.length, 'link')}, ${
      polarity === 'R' ? 'reinforcing' : polarity === 'B' ? 'balancing' : 'of unknown polarity'
    }.`,
  };
}

export function setLoop(
  project: Project,
  id: string,
  changes: LoopChanges,
): OpOutput<{ id: string; changed: string[] }> {
  if ('id' in changes) throw new OpError('A loop keeps its id.', 'usage');
  const { index, loop } = findLoop(project, id);
  const candidate: Record<string, unknown> = { ...loop };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  const updated = parseElement(LoopSchema, candidate, ['loops', index]);
  const changed = Object.keys(changes).filter(
    (key) => !sameJson(loop[key as keyof Loop], updated[key as keyof Loop]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { id, changed },
      summary: `Nothing to change: loop ${id} already has those values.`,
    };
  }
  if (changed.includes('links')) {
    const twin = twinOf(project, updated.links, id);
    if (twin)
      throw new OpError(`Loop ${twin.id} ("${twin.name}") already goes round those links.`, 'conflict');
  }
  const next = structuredClone(project);
  next.loops[index] = updated;
  ensureValid(project, next);
  return { project: next, result: { id, changed }, summary: `Changed loop ${id}: ${changed.join(', ')}.` };
}

export function removeLoop(
  project: Project,
  id: string,
  options: { cascade?: boolean } = {},
): OpOutput<{ id: string; changedSteps: string[] }> {
  const { loop } = findLoop(project, id);
  const removed: Removed = { variables: new Set(), links: new Set(), loops: new Set([id]) };
  const steps = stepsMentioning(project, removed);
  if (!options.cascade && steps.length) {
    throw new OpError(
      `Loop ${id} is still shown by ${plural(steps.length, 'story step')} (${listing(steps)}). Remove it from those first, or remove it with cascade to remove it from them too.`,
      'conflict',
    );
  }
  const next = structuredClone(project);
  next.loops = next.loops.filter((l) => l.id !== id);
  const changedSteps = pruneMentions(next, removed);
  ensureValid(project, next);
  const also = changedSteps.length ? `; updated ${plural(changedSteps.length, 'story step')}` : '';
  return {
    project: next,
    result: { id, changedSteps },
    summary: `Removed loop ${id} ("${loop.name}")${also}. Its links stay.`,
  };
}
