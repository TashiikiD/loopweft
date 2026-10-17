// Upgrades older `.loopweft` documents to the current format version before they are validated.
//
// Version 1 is the first version, so there are no migrations yet. When version 2 arrives, add a migration
// { from: 1, to: 2, ... } to MIGRATIONS and bump FORMAT_VERSION in schema.ts; documents then upgrade one
// version at a time. A migration works on plain JSON and must not lose or invent data: if something cannot
// be carried across, it fails with an issue instead.
import type { Issue } from './issues.ts';
import { FORMAT, FORMAT_VERSION } from './schema.ts';

export type JsonObject = Record<string, unknown>;

export interface Migration {
  from: number;
  to: number;
  /** One line for the change log, e.g. "Links gain `weight`". */
  describe: string;
  up: (document: JsonObject) => JsonObject;
}

export const MIGRATIONS: readonly Migration[] = [];

export type MigrateResult =
  | { ok: true; document: JsonObject; from: number; applied: string[] }
  | { ok: false; issues: Issue[] };

const fail = (code: string, message: string, path: (string | number)[] = []): MigrateResult => ({
  ok: false,
  issues: [{ severity: 'error', code, message, path }],
});

/**
 * Checks that `input` is a Loopweft document and upgrades it to `target` (the current version). Never
 * changes `input`: migrations run on a copy.
 */
export function migrate(
  input: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  target: number = FORMAT_VERSION,
): MigrateResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail('notLoopweft', 'A Loopweft file holds one JSON object.');
  }
  const document = input as JsonObject;
  if (document.format !== FORMAT) {
    return fail(
      'notLoopweft',
      document.format === undefined
        ? 'This is not a Loopweft file: it has no "format": "loopweft".'
        : `This is not a Loopweft file: its format is ${JSON.stringify(document.format)}.`,
      ['format'],
    );
  }
  const version = document.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('unsupportedVersion', 'The file has no valid "version" (a whole number from 1).', [
      'version',
    ]);
  }
  if (version > target) {
    return fail(
      'newerVersion',
      `This file uses format version ${version}, made by a newer Loopweft; this one reads up to version ${target}.`,
      ['version'],
    );
  }
  let current: JsonObject = structuredClone(document);
  const applied: string[] = [];
  for (let v = version; v < target; v++) {
    const step = migrations.find((m) => m.from === v);
    if (!step || step.to !== v + 1) {
      return fail('unsupportedVersion', `No migration from format version ${v} to ${v + 1}.`, ['version']);
    }
    current = { ...step.up(current), version: step.to };
    applied.push(`${step.from} → ${step.to}: ${step.describe}`);
  }
  return { ok: true, document: current, from: version, applied };
}
