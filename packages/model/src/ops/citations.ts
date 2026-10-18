// Citing sources on variables, links and loops: each citation names a source, and may give pages (or another
// locator), a strength (the author's judgement of how strongly the source supports the element) and a note.
// Overlays cite sources too; they are edited with the story.
import type { z } from 'zod';
import type { CitableKind } from '../evidence.ts';
import { type Citation, CitationSchema, type Project } from '../schema.ts';
import { resolveSource } from './sources.ts';
import {
  ensureValid,
  listing,
  OpError,
  type OpOutput,
  parseElement,
  plural,
  resolveVariable,
} from './support.ts';

export type CitationInput = z.input<typeof CitationSchema>;

/** Changes to a citation: a value sets the field, `null` clears an optional one. */
export type CitationChanges = { [K in keyof Citation]?: Citation[K] | null };

const LIST = { variable: 'variables', link: 'links', loop: 'loops' } as const;

/** An element that carries citations, by its place in the project. */
export interface Citable {
  kind: CitableKind;
  id: string;
  index: number;
  citations: Citation[];
}

/** A variable, link or loop named by its id; a variable may also be named by its label. */
export function resolveCitable(project: Project, ref: string): Citable {
  for (const kind of ['variable', 'link', 'loop'] as const) {
    const index = project[LIST[kind]].findIndex((x) => x.id === ref);
    if (index >= 0) {
      const item = project[LIST[kind]][index] as { id: string; citations: Citation[] };
      return { kind, id: item.id, index, citations: item.citations };
    }
  }
  try {
    const { index, variable } = resolveVariable(project, ref);
    return { kind: 'variable', id: variable.id, index, citations: variable.citations };
  } catch (error) {
    if (error instanceof OpError && error.kind === 'notFound') {
      throw new OpError(`Nothing on the map is called "${ref}": name a variable, link or loop.`, 'notFound');
    }
    throw error;
  }
}

/** Where an element's citations are in a (cloned) project. */
const citationsIn = (project: Project, at: Citable): Citation[] =>
  (project[LIST[at.kind]][at.index] as { citations: Citation[] }).citations;

/** " p. 4", " pp. 4–5": a locator after a source's id in a message. */
const pagesText = (pages: string | undefined) =>
  pages === undefined ? '' : ` ${/[–—,-]/.test(pages) ? 'pp.' : 'p.'} ${pages}`;

/** The citation of a source on an element, by its pages when the element cites the source more than once. */
export function findCitation(project: Project, ref: string, source: string, pages?: string): number {
  const at = resolveCitable(project, ref);
  const sourceId = resolveSource(project, source).source.id;
  const matches = at.citations.flatMap((c, i) =>
    c.source === sourceId && (pages === undefined || c.pages === pages) ? [i] : [],
  );
  if (matches.length === 1) return matches[0] as number;
  if (matches.length === 0) {
    throw new OpError(
      `${at.id} does not cite ${sourceId}${pagesText(pages)}${
        at.citations.length
          ? ` (it cites ${listing(at.citations.map((c) => `${c.source}${pagesText(c.pages)}`))})`
          : ''
      }.`,
      'notFound',
    );
  }
  const which = matches.map((i) => at.citations[i]?.pages ?? '(no pages)');
  throw new OpError(
    `${at.id} cites ${sourceId} ${matches.length} times (pages ${listing(which)}); say which by its pages.`,
    'usage',
  );
}

/**
 * Cites a source on one or more elements. An element that already cites the source at the same pages is
 * left as it was (and named in the result), so citing a selection twice adds nothing twice.
 */
export function addCitation(
  project: Project,
  refs: readonly string[],
  input: CitationInput,
): OpOutput<{ source: string; added: string[]; skipped: string[] }> {
  if (refs.length === 0)
    throw new OpError('Name at least one variable, link or loop to cite it on.', 'usage');
  const sourceId = resolveSource(project, String(input.source ?? '')).source.id;
  const targets: Citable[] = [];
  for (const ref of refs) {
    const at = resolveCitable(project, ref);
    if (!targets.some((t) => t.kind === at.kind && t.id === at.id)) targets.push(at);
  }
  const next = structuredClone(project);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const at of targets) {
    const citation = parseElement(CitationSchema, { ...input, source: sourceId }, [
      LIST[at.kind],
      at.index,
      'citations',
      at.citations.length,
    ]);
    if (at.citations.some((c) => c.source === sourceId && c.pages === citation.pages)) {
      skipped.push(at.id);
      continue;
    }
    citationsIn(next, at).push(citation);
    added.push(at.id);
  }
  const what = `${sourceId}${pagesText(input.pages)}`;
  const leftAlone = skipped.length ? ` ${listing(skipped)} already cited it.` : '';
  if (added.length === 0) {
    return {
      project,
      result: { source: sourceId, added, skipped },
      summary: `Nothing to change: ${listing(skipped)} already ${skipped.length === 1 ? 'cites' : 'cite'} ${what}.`,
    };
  }
  ensureValid(project, next);
  return {
    project: next,
    result: { source: sourceId, added, skipped },
    summary: `Cited ${what} on ${added.length > 3 ? plural(added.length, 'element') : listing(added)}.${leftAlone}`,
  };
}

export function setCitation(
  project: Project,
  ref: string,
  index: number,
  changes: CitationChanges,
): OpOutput<{ element: string; index: number; changed: string[] }> {
  const at = resolveCitable(project, ref);
  const current = at.citations[index];
  if (!current) {
    throw new OpError(`${at.id} has no citation ${index + 1} (it has ${at.citations.length}).`, 'notFound');
  }
  const candidate: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'source' && value === null) throw new OpError('A citation needs its source.', 'usage');
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  if (typeof candidate.source === 'string' && candidate.source !== current.source) {
    candidate.source = resolveSource(project, candidate.source).source.id;
  }
  const updated = parseElement(CitationSchema, candidate, [LIST[at.kind], at.index, 'citations', index]);
  const changed = (['source', 'pages', 'strength', 'note'] as const).filter((k) => current[k] !== updated[k]);
  if (changed.length === 0) {
    return {
      project,
      result: { element: at.id, index, changed },
      summary: `Nothing to change: that citation on ${at.id} already has those values.`,
    };
  }
  const twin = at.citations.findIndex(
    (c, i) => i !== index && c.source === updated.source && c.pages === updated.pages,
  );
  if (twin >= 0) {
    throw new OpError(
      `${at.id} already cites ${updated.source}${pagesText(updated.pages)} (citation ${twin + 1}).`,
      'conflict',
    );
  }
  const next = structuredClone(project);
  citationsIn(next, at)[index] = updated;
  ensureValid(project, next);
  return {
    project: next,
    result: { element: at.id, index, changed },
    summary: `Changed ${at.id}'s citation of ${updated.source}: ${changed.join(', ')}.`,
  };
}

export function removeCitation(
  project: Project,
  ref: string,
  index: number,
): OpOutput<{ element: string; index: number; source: string }> {
  const at = resolveCitable(project, ref);
  const current = at.citations[index];
  if (!current) {
    throw new OpError(`${at.id} has no citation ${index + 1} (it has ${at.citations.length}).`, 'notFound');
  }
  const next = structuredClone(project);
  citationsIn(next, at).splice(index, 1);
  return {
    project: next,
    result: { element: at.id, index, source: current.source },
    summary: `Removed ${at.id}'s citation of ${current.source}${pagesText(current.pages)}.`,
  };
}
