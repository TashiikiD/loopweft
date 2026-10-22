// Adding, changing and removing links, and flipping a link's sign.
import type { z } from 'zod';
import { elementIds } from '../refs.ts';
import { type Link, LinkSchema, type Project } from '../schema.ts';
import { nextSequentialId } from '../text/ids.ts';
import { pruneMentions, type Removed, stepsMentioning } from './story-refs.ts';
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
  signText,
} from './support.ts';
import type { RemoveOptions } from './variables.ts';

/**
 * A new link. `from` and `to` name variables by id or label. Without an id it gets the next free `L<n>`.
 * The sign is required: write "?" when it is not known.
 */
export type LinkInput = Omit<z.input<typeof LinkSchema>, 'id'> & { id?: string };

/** Changes to a link: a value sets the field, `null` clears an optional one. The id stays. */
export type LinkChanges = { [K in Exclude<keyof Link, 'id'>]?: Link[K] | null };

const describeLink = (l: Link) => `${l.id} (${l.from} → ${l.to}, ${signText(l.sign)})`;

/** Another link with the same ends and type, which would only duplicate this one. */
function duplicateOf(project: Project, link: Link): Link | undefined {
  return project.links.find(
    (l) =>
      l.id !== link.id && l.from === link.from && l.to === link.to && (l.type ?? '') === (link.type ?? ''),
  );
}

export function addLink(project: Project, input: LinkInput): OpOutput<{ id: string }> {
  const taken = elementIds(project);
  if (input.id !== undefined && taken.has(input.id)) {
    throw new OpError(`The id "${input.id}" is already used; choose another.`, 'conflict');
  }
  const from = resolveVariable(project, input.from).variable.id;
  const to = resolveVariable(project, input.to).variable.id;
  const id = input.id ?? nextSequentialId('L', taken);
  const link = parseElement(LinkSchema, { ...input, id, from, to }, ['links', project.links.length]);
  const twin = duplicateOf(project, link);
  if (twin) {
    throw new OpError(
      `${twin.id} already links ${from} to ${to}${link.type ? ` as ${link.type}` : ''}; change it instead.`,
      'conflict',
    );
  }
  const next = structuredClone(project);
  next.links.push(link);
  ensureValid(project, next);
  return { project: next, result: { id }, summary: `Added link ${describeLink(link)}.` };
}

/** The named loops through link `id` whose links no longer close into a chain once it is `changed`. */
function loopsBrokenBy(project: Project, id: string, changed: Link): string[] {
  const ends = new Map(project.links.map((l) => [l.id, l.id === id ? changed : l]));
  return project.loops
    .filter((loop) => loop.links.includes(id))
    .filter((loop) =>
      loop.links.some((linkId, i) => {
        const here = ends.get(linkId);
        const next = ends.get(loop.links[(i + 1) % loop.links.length] as string);
        return !here || !next || here.to !== next.from;
      }),
    )
    .map((loop) => loop.id);
}

/**
 * Changes a link. A change of its ends that breaks a named loop through it (the loop's links would no longer
 * close) is refused, unless `cascade`: then those loops lose their names (and their mentions in the story), to
 * be named again with their new links (`addLoop`), as when a variable is put into the middle of a loop.
 */
export function setLink(
  project: Project,
  id: string,
  changes: LinkChanges,
  options: RemoveOptions = {},
): OpOutput<{ id: string; changed: string[]; removedLoops: string[]; changedSteps: string[] }> {
  if ('id' in changes) throw new OpError('A link keeps its id.', 'usage');
  const { index, link } = findLink(project, id);
  const candidate: Record<string, unknown> = { ...link };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  if (typeof changes.from === 'string') candidate.from = resolveVariable(project, changes.from).variable.id;
  if (typeof changes.to === 'string') candidate.to = resolveVariable(project, changes.to).variable.id;
  const updated = parseElement(LinkSchema, candidate, ['links', index]);
  const changed = Object.keys(changes).filter(
    (key) => !sameJson(link[key as keyof Link], updated[key as keyof Link]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { id, changed, removedLoops: [], changedSteps: [] },
      summary: `Nothing to change: link ${id} already has those values.`,
    };
  }
  const twin = duplicateOf(project, updated);
  if (twin) {
    throw new OpError(
      `${twin.id} already links ${updated.from} to ${updated.to}; the two would be the same link.`,
      'conflict',
    );
  }
  const broken = loopsBrokenBy(project, id, updated);
  if (broken.length && !options.cascade) {
    throw new OpError(
      `Changing ${id} breaks ${plural(broken.length, 'named loop')} through it (${listing(broken)}): its links would no longer close. Change it with cascade to take ${broken.length === 1 ? 'that name' : 'those names'} off (then name the new loop with its links), or change the loop first.`,
      'conflict',
    );
  }
  const next = structuredClone(project);
  next.links[index] = updated;
  const removed: Removed = { variables: new Set(), links: new Set(), loops: new Set(broken) };
  next.loops = next.loops.filter((loop) => !removed.loops.has(loop.id));
  const changedSteps = broken.length ? pruneMentions(next, removed) : [];
  ensureValid(project, next);
  const unnamed = broken.length
    ? `; took the name off ${plural(broken.length, 'loop')} it broke (${listing(broken)}): name the new loop with its links`
    : '';
  const steps = changedSteps.length ? `; updated ${plural(changedSteps.length, 'story step')}` : '';
  return {
    project: next,
    result: { id, changed, removedLoops: broken, changedSteps },
    summary: `Changed link ${id}: ${changed.join(', ')}${unnamed}${steps}.`,
  };
}

export function removeLink(
  project: Project,
  id: string,
  options: RemoveOptions = {},
): OpOutput<{ id: string; removedLoops: string[]; changedSteps: string[] }> {
  const { link } = findLink(project, id);
  const loops = project.loops.filter((lp) => lp.links.includes(id)).map((lp) => lp.id);
  const removed: Removed = { variables: new Set(), links: new Set([id]), loops: new Set(loops) };
  const steps = stepsMentioning(project, removed);

  if (!options.cascade && (loops.length || steps.length)) {
    const uses = [
      loops.length ? `${plural(loops.length, 'loop')} (${loops.join(', ')})` : '',
      steps.length ? `${plural(steps.length, 'story step')} (${steps.join(', ')})` : '',
    ].filter(Boolean);
    throw new OpError(
      `Link ${id} is still used by ${listing(uses)}. Remove those first, or remove it with cascade to remove them too.`,
      'conflict',
    );
  }

  const next = structuredClone(project);
  next.links = next.links.filter((l) => l.id !== id);
  next.loops = next.loops.filter((lp) => !removed.loops.has(lp.id));
  const changedSteps = pruneMentions(next, removed);
  ensureValid(project, next);
  const also = loops.length ? ` with ${plural(loops.length, 'loop')} (${loops.join(', ')})` : '';
  const steps2 = changedSteps.length ? `; updated ${plural(changedSteps.length, 'story step')}` : '';
  return {
    project: next,
    result: { id, removedLoops: loops, changedSteps },
    summary: `Removed link ${describeLink(link)}${also}${steps2}.`,
  };
}

/** Turns + into − and − into +. A link whose sign is unknown (?) has nothing to flip. */
export function flipSign(
  project: Project,
  id: string,
): OpOutput<{ id: string; from: '+' | '-'; to: '+' | '-' }> {
  const { index, link } = findLink(project, id);
  if (link.sign === '?') {
    throw new OpError(
      `The sign of ${id} is unknown (?); set it to + or - instead of flipping it.`,
      'invalid',
    );
  }
  const to = link.sign === '+' ? '-' : '+';
  const next = structuredClone(project);
  (next.links[index] as Link).sign = to;
  return {
    project: next,
    result: { id, from: link.sign, to },
    summary: `Flipped ${id} (${link.from} → ${link.to}) from ${signText(link.sign)} to ${signText(to)}.`,
  };
}
