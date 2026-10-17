// Reading a `.loopweft` document: JSON, then the format and version (migrating older versions), then the
// schema, then the references. Each problem becomes an Issue with a stable code and a path.
import type { z } from 'zod';
import { hasErrors, type Issue } from './issues.ts';
import { migrate } from './migrate.ts';
import { checkReferences } from './refs.ts';
import { type Project, ProjectSchema } from './schema.ts';
import { didYouMean } from './text/similarity.ts';

export type ParseResult =
  | { ok: true; project: Project; issues: Issue[]; migrated: string[] }
  | { ok: false; issues: Issue[] };

type Path = (string | number)[];
type ZodIssue = z.core.$ZodIssue;

/** Every field name the format knows, for "did you mean" hints on unknown fields. */
const KNOWN_FIELDS: string[] = (() => {
  const names = new Set<string>();
  const seen = new Set<unknown>();
  const walk = (schema: unknown) => {
    if (!schema || typeof schema !== 'object' || seen.has(schema)) return;
    seen.add(schema);
    const def = (schema as { _zod?: { def?: Record<string, unknown> } })._zod?.def;
    if (!def) return;
    const shape = def.shape as Record<string, unknown> | undefined;
    if (shape) {
      for (const [key, value] of Object.entries(shape)) {
        names.add(key);
        walk(value);
      }
    }
    for (const key of ['innerType', 'element', 'valueType', 'in', 'out']) walk(def[key]);
    for (const key of ['options', 'items']) (def[key] as unknown[] | undefined)?.forEach(walk);
  };
  walk(ProjectSchema);
  return [...names];
})();

const kindOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'string') return `the text ${JSON.stringify(value)}`;
  if (typeof value === 'object') return 'an object';
  return `${typeof value === 'number' || typeof value === 'boolean' ? '' : 'a '}${String(value)}`;
};

const EXPECTED: Record<string, string> = {
  string: 'text',
  number: 'a number',
  int: 'a whole number',
  boolean: 'true or false',
  array: 'a list',
  tuple: 'a pair [min, max]',
  object: 'an object',
  record: 'an object',
};

const show = (value: unknown) => JSON.stringify(value);

function fromZod(issue: ZodIssue): Issue[] {
  const path = issue.path.filter((p): p is string | number => typeof p !== 'symbol');
  const one = (code: string, message: string, at: Path = path): Issue[] => [
    { severity: 'error', code, message, path: at },
  ];
  // A value that is not there at all, whatever kind it should have been.
  if (issue.input === undefined && ['invalid_type', 'invalid_value', 'invalid_union'].includes(issue.code)) {
    const name = path.at(-1);
    return one(
      'missingField',
      typeof name === 'string' ? `Missing required field "${name}".` : 'Missing value.',
    );
  }
  switch (issue.code) {
    case 'invalid_type':
      return one(
        'invalidType',
        `Expected ${EXPECTED[issue.expected] ?? issue.expected}, got ${kindOf(issue.input)}.`,
      );
    case 'unrecognized_keys':
      return issue.keys.flatMap((key) =>
        one('unknownField', `Unknown field "${key}"${didYouMean(key, KNOWN_FIELDS)}.`, [...path, key]),
      );
    case 'invalid_value': {
      const values = issue.values.map(show);
      const expected = values.length === 1 ? values[0] : `one of ${values.join(', ')}`;
      return one('invalidValue', `Expected ${expected}; got ${show(issue.input)}.`);
    }
    case 'invalid_union': {
      if (issue.discriminator !== undefined) {
        const key = issue.discriminator;
        const input = issue.input;
        const given = input && typeof input === 'object' ? (input as Record<string, unknown>)[key] : input;
        const options = 'options' in issue && issue.options ? issue.options.map(show).join(', ') : '';
        return one(
          'invalidValue',
          `Unknown ${key} ${show(given)}${options ? `; expected one of ${options}` : ''}.`,
          path.at(-1) === key ? path : [...path, key],
        );
      }
      return one('invalidValue', issue.message);
    }
    case 'too_small': {
      const n = Number(issue.minimum);
      if (issue.origin === 'string' && n === 1) return one('empty', 'Must not be empty.');
      if (issue.origin === 'array') return one('tooFew', `Needs at least ${n} item${n === 1 ? '' : 's'}.`);
      return one(
        'tooSmall',
        `Must be ${issue.inclusive === false ? 'more than' : 'at least'} ${n}; got ${show(issue.input)}.`,
      );
    }
    case 'too_big': {
      const n = Number(issue.maximum);
      if (issue.origin === 'string') return one('tooLong', `Must be at most ${n} characters.`);
      if (issue.origin === 'array') return one('tooMany', `Must have at most ${n} items.`);
      return one(
        'tooBig',
        `Must be ${issue.inclusive === false ? 'less than' : 'at most'} ${n}; got ${show(issue.input)}.`,
      );
    }
    case 'invalid_format':
      return one(
        'invalidFormat',
        `${issue.message}${issue.input !== undefined ? ` Got ${show(issue.input)}.` : ''}`,
      );
    case 'invalid_key':
      return one(
        'invalidId',
        `${show(issue.input)} is not a valid id: ${issue.issues[0]?.message ?? 'invalid'}`,
      );
    case 'custom':
      return one(String(issue.params?.code ?? 'invalidValue'), issue.message);
    default:
      return one('invalidValue', issue.message);
  }
}

/** A zod error as Issues; `base` is the path of the value that was parsed, within its project. */
export function zodIssues(error: z.ZodError, base: Path = []): Issue[] {
  return error.issues.flatMap(fromZod).map((issue) => ({ ...issue, path: [...base, ...issue.path] }));
}

/**
 * Validates a parsed JSON document as a Loopweft project. Older format versions are migrated first
 * (`migrated` lists what changed). The project is returned with every collection present; warnings come
 * with it in `issues`.
 */
export function parseProject(input: unknown): ParseResult {
  const migrated = migrate(input);
  if (!migrated.ok) return { ok: false, issues: migrated.issues };
  const parsed = ProjectSchema.safeParse(migrated.document, { reportInput: true });
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const issues = validateProject(parsed.data);
  return hasErrors(issues)
    ? { ok: false, issues }
    : { ok: true, project: parsed.data, issues, migrated: migrated.applied };
}

/** Parses the text of a `.loopweft` file (UTF-8 JSON; a byte-order mark is tolerated). */
export function readProject(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          severity: 'error',
          code: 'invalidJson',
          message: `Not valid JSON: ${(error as Error).message}`,
          path: [],
        },
      ],
    };
  }
  return parseProject(json);
}

/** The checks a structurally valid project must pass: references and ids. */
export function validateProject(project: Project): Issue[] {
  return checkReferences(project);
}
