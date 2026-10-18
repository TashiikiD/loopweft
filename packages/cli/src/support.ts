// Source: DataViz packages/cli/src/support.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted for Loopweft:
// project files are .loopweft text, an invalid one stops with its issues, and a write keeps the previous
// version as <file>.bak.
//
// Reading and writing project files, and reading option values, for the command line.
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import {
  CONFIDENCE_VOCABULARY,
  type FieldValue,
  OpError,
  type Project,
  readFieldValue,
  readNumber,
  readProject,
  resolveField,
  resolveVocabularyValue,
  SIGN_VOCABULARY,
  serializeProject,
} from '@loopweft/model';

/** What a command needs from outside: today's date, read once by the caller (see main.ts), and the network. */
export interface Env {
  /** YYYY-MM-DD: stamped as `meta.modified` on every write, and as `meta.created` by `new`. */
  today: string;
  /** The fetch the DOI lookup uses (tests answer from recorded replies). Default: the global fetch. */
  fetch?: typeof fetch;
}

export function readText(file: string): string {
  if (!existsSync(file)) throw new OpError(`No file ${file}.`, 'usage');
  return readFileSync(file, 'utf8');
}

/** Reads a project file; one that is not a valid project stops with its issues (exit 1). */
export function loadProject(file: string): Project {
  const result = readProject(readText(file));
  if (!result.ok) {
    const errors = result.issues.filter((i) => i.severity === 'error');
    throw new OpError(
      `${file} is not a valid Loopweft project (${errors.length} errors).`,
      'invalid',
      errors,
    );
  }
  return result.project;
}

/**
 * Writes a project file atomically, stamping `meta.modified`: the text goes to a temporary file, the old
 * file (if any) is copied to <file>.bak, and the temporary file then takes the old one's place.
 */
export function saveProject(file: string, project: Project, env: Env): { backup: string | null } {
  const text = serializeProject({ ...project, meta: { ...project.meta, modified: env.today } });
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, text);
  let backup: string | null = null;
  try {
    if (existsSync(file)) {
      backup = `${file}.bak`;
      copyFileSync(file, backup);
    }
    renameSync(temporary, file);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
  return { backup };
}

/** `a,b , c` as ["a", "b", "c"]. */
export const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

/** `key=value` (the first `=` splits). */
export function pair(spec: string, option: string): [string, string] {
  const at = spec.indexOf('=');
  if (at <= 0) throw new OpError(`--${option} takes key=value, not "${spec}".`, 'usage');
  return [spec.slice(0, at).trim(), spec.slice(at + 1).trim()];
}

/** A number, read strictly: one that could be read two ways is refused. */
export function number(text: string, option: string): number {
  const reading = readNumber(text);
  if (reading.kind !== 'ok') throw new OpError(`--${option} must be a plain number, not "${text}".`, 'usage');
  return reading.value;
}

/** `x,y` or `x,y,z`, as numbers. */
export function numbers(text: string, count: number, option: string): number[] {
  const parts = text.split(',').map((p) => p.trim());
  if (parts.length !== count) {
    throw new OpError(`--${option} takes ${count} numbers separated by commas, not "${text}".`, 'usage');
  }
  return parts.map((p) => number(p, option));
}

export function sign(text: string): '+' | '-' | '?' {
  const found = resolveVocabularyValue(SIGN_VOCABULARY, text);
  if (!found)
    throw new OpError(`--sign must be +, - or ? (or a word such as positive), not "${text}".`, 'usage');
  return found.value as '+' | '-' | '?';
}

export function confidence(text: string): 'low' | 'medium' | 'high' {
  const found = resolveVocabularyValue(CONFIDENCE_VOCABULARY, text);
  if (!found)
    throw new OpError(`--confidence must be low, medium or high (L, M, H), not "${text}".`, 'usage');
  return found.value as 'low' | 'medium' | 'high';
}

export function oneOf<T extends string>(text: string, values: readonly T[], option: string): T {
  if (!values.includes(text as T)) {
    throw new OpError(`--${option} must be one of ${values.join(', ')}, not "${text}".`, 'usage');
  }
  return text as T;
}

/** `--field key=value` items read for their fields' kinds, merged into existing values. */
export function fieldValues(
  project: Project,
  specs: readonly string[] | undefined,
  carrier: 'variables' | 'links',
  existing: Record<string, FieldValue> = {},
): Record<string, FieldValue> | undefined {
  if (!specs?.length) return undefined;
  const values = { ...existing };
  for (const spec of specs) {
    const [name, raw] = pair(spec, 'field');
    const field = resolveField(project, name, carrier);
    const read = readFieldValue(field, raw);
    if ('error' in read) throw new OpError(read.error, 'usage');
    values[field.id] = read.value;
  }
  return values;
}
