// Adding, changing and removing variables.
import type { z } from 'zod';
import { elementIds } from '../refs.ts';
import type { Project } from '../schema.ts';
import { type Variable, VariableSchema } from '../schema.ts';
import { slugify, uniqueId } from '../text/ids.ts';
import { pruneMentions, type Removed, stepsMentioning } from './story-refs.ts';
import {
  ensureValid,
  listing,
  OpError,
  type OpOutput,
  parseElement,
  plural,
  resolveVariable,
  sameJson,
} from './support.ts';

/** A new variable. Without an id, one is made from the label (`Food prices` → `food_prices`). */
export type VariableInput = Omit<z.input<typeof VariableSchema>, 'id'> & { id?: string };

/** Changes to a variable: a value sets the field, `null` clears an optional one. The id stays. */
export type VariableChanges = { [K in Exclude<keyof Variable, 'id'>]?: Variable[K] | null };

export function addVariable(project: Project, input: VariableInput): OpOutput<{ id: string }> {
  const taken = elementIds(project);
  if (input.id !== undefined && taken.has(input.id)) {
    throw new OpError(`The id "${input.id}" is already used; choose another.`, 'conflict');
  }
  const id = input.id ?? uniqueId(slugify(input.label ?? ''), taken, 'variable');
  const variable = parseElement(VariableSchema, { ...input, id }, ['variables', project.variables.length]);
  const next = structuredClone(project);
  next.variables.push(variable);
  ensureValid(project, next);
  return { project: next, result: { id }, summary: `Added variable ${id} ("${variable.label}").` };
}

export function setVariable(
  project: Project,
  ref: string,
  changes: VariableChanges,
): OpOutput<{ id: string; changed: string[] }> {
  if ('id' in changes) throw new OpError('A variable keeps its id; change its label instead.', 'usage');
  const { index, variable } = resolveVariable(project, ref);
  const candidate: Record<string, unknown> = { ...variable };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  const updated = parseElement(VariableSchema, candidate, ['variables', index]);
  const changed = Object.keys(changes).filter(
    (key) => !sameJson(variable[key as keyof Variable], updated[key as keyof Variable]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { id: variable.id, changed },
      summary: `Nothing to change: variable ${variable.id} already has those values.`,
    };
  }
  const next = structuredClone(project);
  next.variables[index] = updated;
  ensureValid(project, next);
  return {
    project: next,
    result: { id: variable.id, changed },
    summary: `Changed variable ${variable.id}: ${changed.join(', ')}.`,
  };
}

export interface RemoveOptions {
  /** Also remove what depends on it: links, loops through them, and mentions in the story. */
  cascade?: boolean;
}

export function removeVariable(
  project: Project,
  ref: string,
  options: RemoveOptions = {},
): OpOutput<{ id: string; removedLinks: string[]; removedLoops: string[]; changedSteps: string[] }> {
  const { variable } = resolveVariable(project, ref);
  const id = variable.id;
  const links = project.links.filter((l) => l.from === id || l.to === id).map((l) => l.id);
  const linkSet = new Set(links);
  const loops = project.loops.filter((lp) => lp.links.some((l) => linkSet.has(l))).map((lp) => lp.id);
  const removed: Removed = { variables: new Set([id]), links: linkSet, loops: new Set(loops) };
  const steps = stepsMentioning(project, removed);

  if (!options.cascade && (links.length || loops.length || steps.length)) {
    const uses = [
      links.length ? `${plural(links.length, 'link')} (${links.join(', ')})` : '',
      loops.length ? `${plural(loops.length, 'loop')} (${loops.join(', ')})` : '',
      steps.length ? `${plural(steps.length, 'story step')} (${steps.join(', ')})` : '',
    ].filter(Boolean);
    throw new OpError(
      `Variable ${id} is still used by ${listing(uses)}. Remove those first, or remove it with cascade to remove them too.`,
      'conflict',
    );
  }

  const next = structuredClone(project);
  next.variables = next.variables.filter((v) => v.id !== id);
  next.links = next.links.filter((l) => !linkSet.has(l.id));
  next.loops = next.loops.filter((lp) => !removed.loops.has(lp.id));
  const changedSteps = pruneMentions(next, removed);
  ensureValid(project, next);

  const also = [
    links.length ? `${plural(links.length, 'link')} (${links.join(', ')})` : '',
    loops.length ? `${plural(loops.length, 'loop')} (${loops.join(', ')})` : '',
  ].filter(Boolean);
  const steps2 = changedSteps.length ? `; updated ${plural(changedSteps.length, 'story step')}` : '';
  return {
    project: next,
    result: { id, removedLinks: links, removedLoops: loops, changedSteps },
    summary: `Removed variable ${id}${also.length ? ` with ${listing(also)}` : ''}${steps2}.`,
  };
}
