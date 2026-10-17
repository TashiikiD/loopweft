// Source: DataViz packages/core/src/issues.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted for Loopweft.

/** A problem found while reading or checking a project. */
export interface Issue {
  /** Errors make a project invalid; warnings flag something to look at (an uncited link, a ▲ against a sign). */
  severity: 'error' | 'warning';
  /** Stable machine-readable code, e.g. `unknownVariable`, `uncitedLink` (listed in docs/format.md). */
  code: string;
  message: string;
  /** Location inside the project document, e.g. `['links', 3, 'from']`. */
  path: (string | number)[];
}

export const hasErrors = (issues: readonly Issue[]): boolean => issues.some((i) => i.severity === 'error');

export const errorsIn = (issues: readonly Issue[]): Issue[] => issues.filter((i) => i.severity === 'error');

/** Formats a path as `links[3].from` for messages and CLI output. */
export function formatPath(path: readonly (string | number)[]): string {
  return path.reduce<string>(
    (out, part) => (typeof part === 'number' ? `${out}[${part}]` : out ? `${out}.${part}` : part),
    '',
  );
}

/** One line per issue: `error   links[3].from: …`. */
export function issueLines(issues: readonly Issue[]): string {
  return issues
    .map(
      (i) =>
        `${i.severity === 'error' ? 'error  ' : 'warning'} ${formatPath(i.path) || '(project)'}: ${i.message}`,
    )
    .join('\n');
}
