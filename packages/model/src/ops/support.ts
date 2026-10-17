// What every operation shares: its result shape, its error, and the lookups and checks around an edit.
// The pattern follows DataViz's @dataviz/ops (packages/ops/src/support.ts @ efcdbe2): a project goes in;
// the changed project, a JSON-ready result and a one-line summary come out. Nothing is changed in place.
import type { z } from 'zod';
import type { Issue } from '../issues.ts';
import { checkReferences } from '../refs.ts';
import type { Link, Project, Variable } from '../schema.ts';
import { didYouMean } from '../text/similarity.ts';
import { normalizeToken } from '../text/vocabulary.ts';
import { zodIssues } from '../validate.ts';

/** What an operation returns. `project` is the input itself when nothing changed. */
export interface OpOutput<R> {
  project: Project;
  result: R;
  /** One plain sentence for people: what changed. */
  summary: string;
}

/**
 * Why an operation refused to run. `invalid`: the change would make the project invalid (CLI exit 1).
 * `usage`: the request was wrong (exit 2). `notFound`: something it names does not exist (exit 2).
 * `conflict`: it clashes with the project, e.g. removing a variable that links still use (exit 2).
 */
export type OpErrorKind = 'invalid' | 'usage' | 'notFound' | 'conflict';

/** An expected failure, reported to the user rather than treated as a crash. */
export class OpError extends Error {
  override name = 'OpError';
  readonly kind: OpErrorKind;
  readonly issues: Issue[];

  constructor(message: string, kind: OpErrorKind, issues: Issue[] = []) {
    super(message);
    this.kind = kind;
    this.issues = issues;
  }

  /** The CLI exit code for this failure. */
  get exitCode(): 1 | 2 {
    return this.kind === 'invalid' ? 1 : 2;
  }
}

export const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n === 1 ? word : many}`;

/** "a", "a and b", "a, b and c". */
export const listing = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** A sign as people read it: + − ?. */
export const signText = (sign: Link['sign']): string => (sign === '-' ? '−' : sign);

/** JSON equality that ignores key order. */
export function sameJson(a: unknown, b: unknown): boolean {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
      );
    }
    return value;
  };
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

/** Parses one element with its schema, so a bad value fails like it would in a file. */
export function parseElement<S extends z.ZodType>(
  schema: S,
  candidate: unknown,
  path: (string | number)[],
): z.infer<S> {
  const parsed = schema.safeParse(candidate, { reportInput: true });
  if (parsed.success) return parsed.data;
  const issues = zodIssues(parsed.error, path);
  throw new OpError(issues[0]?.message ?? 'Invalid value.', 'invalid', issues);
}

const issueKey = (i: Issue) => `${i.code} ${JSON.stringify(i.path)} ${i.message}`;

/** Refuses an edit that adds reference errors (errors the project already had are not blamed on it). */
export function ensureValid(before: Project, after: Project): void {
  const known = new Set(checkReferences(before).map(issueKey));
  const fresh = checkReferences(after).filter((i) => i.severity === 'error' && !known.has(issueKey(i)));
  if (fresh.length)
    throw new OpError(fresh[0]?.message ?? 'The change would make the project invalid.', 'invalid', fresh);
}

/** A variable named by its id, or by its label or id ignoring case and spacing when only one matches. */
export function resolveVariable(project: Project, ref: string): { index: number; variable: Variable } {
  const exact = project.variables.findIndex((v) => v.id === ref);
  if (exact >= 0) return { index: exact, variable: project.variables[exact] as Variable };
  const token = normalizeToken(ref);
  const matches = project.variables.flatMap((variable, index) =>
    normalizeToken(variable.label) === token || normalizeToken(variable.id) === token
      ? [{ index, variable }]
      : [],
  );
  if (matches.length === 1) return matches[0] as { index: number; variable: Variable };
  if (matches.length > 1) {
    const ids = matches.map((m) => m.variable.id).join(', ');
    throw new OpError(
      `"${ref}" matches ${matches.length} variables (${ids}); use the id of the one you mean.`,
      'usage',
    );
  }
  const names = project.variables.flatMap((v) => [v.id, v.label]);
  throw new OpError(`No variable "${ref}"${didYouMean(ref, names)}.`, 'notFound');
}

/** A link named by its id. */
export function findLink(project: Project, id: string): { index: number; link: Link } {
  const index = project.links.findIndex((l) => l.id === id);
  if (index < 0) {
    throw new OpError(
      `No link "${id}"${didYouMean(
        id,
        project.links.map((l) => l.id),
      )}.`,
      'notFound',
    );
  }
  return { index, link: project.links[index] as Link };
}
