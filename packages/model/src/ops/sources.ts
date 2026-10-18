// Adding, changing and removing the works a map cites. Sources have their own ids (short tags such as `L`
// work well); a source keeps its id once added, as types do. Removing one that is still cited is refused
// unless `cascade` removes the citations too; a work that still has supplements is never removed.
import type { z } from 'zod';
import { sourceUses } from '../evidence.ts';
import { type Project, type Source, SourceSchema } from '../schema.ts';
import { slugify, uniqueId } from '../text/ids.ts';
import { didYouMean } from '../text/similarity.ts';
import { normalizeToken } from '../text/vocabulary.ts';
import { ensureValid, listing, OpError, type OpOutput, parseElement, plural, sameJson } from './support.ts';

/** A new source. Without an id, one is suggested from its reference (`suggestSourceId`). */
export type SourceInput = Omit<z.input<typeof SourceSchema>, 'id'> & { id?: string };

/** Changes to a source: a value sets the field, `null` clears an optional one. The id stays. */
export type SourceChanges = { [K in Exclude<keyof Source, 'id'>]?: Source[K] | null };

/** The author part and year at the start of an APA reference: "Lawrence, M., … (2024)." */
const LEAD = /^(.+?)\s*\((\d{4})([a-z]?)[^)]*\)|^(.+?)\s*\((n\.\s?d\.)[^)]*\)/u;

/**
 * An id for a source, from its reference: the first author's family name and the year, as in
 * `lawrence2024` (`b`, `c`… when taken, as APA tells same-year works apart). A reference that does not
 * start "Author (year)" gets `source<n>`. Only a key: it is never shown as part of the reference.
 */
export function suggestSourceId(apa: string, taken: ReadonlySet<string>): string {
  const match = LEAD.exec(apa.replace(/\*/g, '').trim());
  if (!match) return nextFree('source', taken);
  const authors = (match[1] ?? match[4] ?? '').trim();
  const year = match[2] ? `${match[2]}` : 'nd';
  const first = authors.split(',')[0]?.trim() ?? '';
  const name = slugify(first).replace(/_/g, '').slice(0, 40);
  if (!name) return nextFree('source', taken);
  const base = `${name}${year}`;
  if (!taken.has(base)) return base;
  for (const letter of 'bcdefghijklmnopqrstuvwxyz') {
    if (!taken.has(`${base}${letter}`)) return `${base}${letter}`;
  }
  return uniqueId(base, taken);
}

const nextFree = (prefix: string, taken: ReadonlySet<string>) => {
  for (let n = 1; ; n++) if (!taken.has(`${prefix}${n}`)) return `${prefix}${n}`;
};

/** A source named by its id, or by its in-text label or id ignoring case and spacing when only one matches. */
export function resolveSource(project: Project, ref: string): { index: number; source: Source } {
  const exact = project.sources.findIndex((s) => s.id === ref);
  if (exact >= 0) return { index: exact, source: project.sources[exact] as Source };
  const token = normalizeToken(ref);
  const matches = project.sources.flatMap((source, index) =>
    normalizeToken(source.id) === token || (source.label && normalizeToken(source.label) === token)
      ? [{ index, source }]
      : [],
  );
  if (matches.length === 1) return matches[0] as { index: number; source: Source };
  if (matches.length > 1) {
    throw new OpError(
      `"${ref}" matches ${matches.length} sources (${matches.map((m) => m.source.id).join(', ')}); use the id of the one you mean.`,
      'usage',
    );
  }
  const names = project.sources.flatMap((s) => [s.id, ...(s.label ? [s.label] : [])]);
  throw new OpError(`No source "${ref}"${didYouMean(ref, names)}.`, 'notFound');
}

/** DOIs are case-insensitive. */
const sameDoi = (a: string | undefined, b: string | undefined) =>
  a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();

/**
 * Refuses a source that repeats another's DOI or reference. A supplement may share its work's DOI (one
 * published with the work often has none of its own), so a work and its supplements are not compared by DOI.
 */
function ensureDistinct(project: Project, source: Source, except?: string): void {
  const related = (other: Source) => other.partOf === source.id || source.partOf === other.id;
  for (const other of project.sources) {
    if (other.id === except) continue;
    if (sameDoi(other.doi, source.doi) && !related(other)) {
      throw new OpError(`Source ${other.id} already has the DOI ${other.doi}.`, 'conflict');
    }
    if (other.apa.trim() === source.apa.trim()) {
      throw new OpError(`Source ${other.id} already has that reference.`, 'conflict');
    }
  }
}

export function addSource(project: Project, input: SourceInput): OpOutput<{ id: string }> {
  const taken = new Set(project.sources.map((s) => s.id));
  if (input.id !== undefined && taken.has(input.id)) {
    throw new OpError(`There is already a source "${input.id}"; choose another id.`, 'conflict');
  }
  const id = input.id ?? suggestSourceId(typeof input.apa === 'string' ? input.apa : '', taken);
  const source = parseElement(SourceSchema, { ...input, id }, ['sources', project.sources.length]);
  ensureDistinct(project, source);
  const next = structuredClone(project);
  next.sources.push(source);
  ensureValid(project, next);
  return {
    project: next,
    result: { id },
    summary: `Added source ${id}${source.label ? ` (${source.label})` : ''}.`,
  };
}

export function setSource(
  project: Project,
  ref: string,
  changes: SourceChanges,
): OpOutput<{ id: string; changed: string[] }> {
  if ('id' in changes) throw new OpError('A source keeps its id.', 'usage');
  const { index, source } = resolveSource(project, ref);
  const candidate: Record<string, unknown> = { ...source };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  const updated = parseElement(SourceSchema, candidate, ['sources', index]);
  const changed = Object.keys(changes).filter(
    (key) => !sameJson(source[key as keyof Source], updated[key as keyof Source]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { id: source.id, changed },
      summary: `Nothing to change: source ${source.id} already has those values.`,
    };
  }
  if (changed.some((key) => key === 'doi' || key === 'apa' || key === 'partOf')) {
    ensureDistinct(project, updated, source.id);
  }
  const next = structuredClone(project);
  next.sources[index] = updated;
  ensureValid(project, next);
  return {
    project: next,
    result: { id: source.id, changed },
    summary: `Changed source ${source.id}: ${changed.join(', ')}.`,
  };
}

/** What a removal can take with it. */
export interface SourceRemoveOptions {
  /** Also remove its citations and the scenes' listings of it. */
  cascade?: boolean;
}

export function removeSource(
  project: Project,
  ref: string,
  options: SourceRemoveOptions = {},
): OpOutput<{ id: string; removedCitations: number; changedScenes: string[] }> {
  const { source } = resolveSource(project, ref);
  const id = source.id;
  const parts = project.sources.filter((s) => s.partOf === id).map((s) => s.id);
  if (parts.length) {
    throw new OpError(
      `Source ${id} has ${plural(parts.length, 'supplement')} (${listing(parts)}). Remove ${
        parts.length === 1 ? 'it' : 'them'
      } first, or make ${parts.length === 1 ? 'it' : 'them'} part of no work.`,
      'conflict',
    );
  }
  const uses = sourceUses(project, id);
  const cited = uses.filter((u) => u.kind !== 'scene');
  const scenes = uses.filter((u) => u.kind === 'scene').map((u) => u.id);
  if (uses.length && !options.cascade) {
    throw new OpError(
      `Source ${id} is still ${listing(describeUses(uses))}. Remove those first, or remove it with cascade to remove them too.`,
      'conflict',
    );
  }
  const next = structuredClone(project);
  next.sources = next.sources.filter((s) => s.id !== id);
  const keep = <T extends { source: string }>(list: T[]) => list.filter((c) => c.source !== id);
  for (const v of next.variables) v.citations = keep(v.citations);
  for (const l of next.links) l.citations = keep(l.citations);
  for (const lp of next.loops) lp.citations = keep(lp.citations);
  for (const scene of next.story.scenes) {
    scene.sources = scene.sources.filter((s) => s !== id);
    for (const step of scene.steps) {
      for (const overlay of step.overlays) {
        if ('citations' in overlay && overlay.citations) {
          const kept = keep(overlay.citations);
          if (kept.length) overlay.citations = kept;
          else delete overlay.citations;
        }
      }
    }
  }
  ensureValid(project, next);
  const also = [
    cited.length ? plural(cited.length, 'citation') : '',
    scenes.length ? `its listing in ${plural(scenes.length, 'scene')}` : '',
  ].filter(Boolean);
  return {
    project: next,
    result: { id, removedCitations: cited.length, changedScenes: scenes },
    summary: `Removed source ${id}${also.length ? ` with ${listing(also)}` : ''}.`,
  };
}

/** "cited by 2 links (E1, E2)", "listed by 1 scene (S1)". */
function describeUses(uses: ReturnType<typeof sourceUses>): string[] {
  const groups: [string, string, string[]][] = [
    ['cited by', 'variable', []],
    ['cited by', 'link', []],
    ['cited by', 'loop', []],
    ['cited by', 'overlay', []],
    ['listed by', 'scene', []],
  ];
  for (const use of uses) {
    const group = groups.find((g) => g[1] === use.kind);
    const name = use.kind === 'overlay' ? use.where : use.id;
    if (group && !group[2].includes(name)) group[2].push(name);
  }
  return groups
    .filter((g) => g[2].length)
    .map(([verb, word, ids]) => `${verb} ${plural(ids.length, word)} (${ids.join(', ')})`);
}
