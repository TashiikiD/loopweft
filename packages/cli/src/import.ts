// `loopweft import`: a CSV, TSV or Excel file, a Kumu blueprint or spreadsheet, or a DataViz project, read
// into a new .loopweft file. The importers (in @loopweft/model) say what they could not carry across; this
// prints that, lays out what the file did not place, and writes the project.
import { existsSync, readFileSync } from 'node:fs';
import { applyAutoLayout, type LayoutKind } from '@loopweft/layout';
import {
  type ColumnMapping,
  type ColumnTarget,
  createProject,
  IMPORT_FORMATS,
  ImportError,
  type ImportFormat,
  importSource,
  LINK_KEYS,
  OpError,
  type Project,
  readImportFile,
  type Shape,
  slugify,
  suggestMapping,
  type TablePlan,
  TEXT_ENCODINGS,
  type TextEncodingName,
  tableLabel,
  tablePlans,
  VARIABLE_KEYS,
} from '@loopweft/model';
import type { CommandResult } from './commands.ts';
import { type Env, number, oneOf, pair, saveProject } from './support.ts';

export interface ImportOptions {
  out: string;
  format?: string;
  title?: string;
  sheet?: string[];
  headerRow?: string[];
  map?: string[];
  signField?: string;
  layout?: string;
  seed?: string;
  encoding?: string;
  force?: boolean;
  dryRun?: boolean;
}

const KINDS = ['text', 'number', 'choice', 'boolean'] as const;

/** `--map` target text: a field key, `ignore`, or `field:<name>[:<kind>]` for a custom field. */
function target(
  text: string,
  shape: Shape,
  column: string,
  suggested: ColumnTarget | undefined,
): ColumnTarget {
  if (text === 'ignore') return { kind: 'ignore' };
  if (text.startsWith('field:')) {
    const [, name, kind] = text.split(':');
    if (!name) throw new OpError(`--map ${column}=${text}: name the field, e.g. field:Notes:text.`, 'usage');
    const type = kind ? oneOf(kind, KINDS, 'map') : suggested?.kind === 'custom' ? suggested.type : 'text';
    return { kind: 'custom', id: slugify(name) || 'field', name, type };
  }
  const keys: readonly string[] = shape === 'links' ? LINK_KEYS : VARIABLE_KEYS;
  if (!keys.includes(text)) {
    throw new OpError(
      `--map ${column}=${text}: ${shape} have no field "${text}" (${keys.join(', ')}, ignore, or field:<name>[:<kind>]).`,
      'usage',
    );
  }
  return { kind: 'field', key: text as never };
}

export async function importCommand(env: Env, input: string, o: ImportOptions): Promise<CommandResult> {
  if (!existsSync(input)) throw new OpError(`No file ${input}.`, 'usage');
  if (existsSync(o.out) && !o.force && !o.dryRun) {
    throw new OpError(`${o.out} already exists; choose another name, or replace it with --force.`, 'usage');
  }
  const format =
    o.format === undefined ? undefined : (oneOf(o.format, IMPORT_FORMATS, 'format') as ImportFormat);
  const encoding =
    o.encoding === undefined
      ? undefined
      : (oneOf(o.encoding, TEXT_ENCODINGS, 'encoding') as TextEncodingName);
  const layout = oneOf(o.layout ?? 'force', ['force', 'constellation', 'flow', 'none'] as const, 'layout');
  if (o.seed !== undefined && layout === 'none') throw new OpError('--seed goes with a layout.', 'usage');
  const seed = o.seed === undefined ? undefined : number(o.seed, 'seed');

  const bytes = new Uint8Array(readFileSync(input));
  let source: Awaited<ReturnType<typeof readImportFile>>;
  try {
    source = await readImportFile(
      { name: input, bytes },
      { ...(format ? { format } : {}), ...(encoding ? { encoding } : {}) },
    );
  } catch (error) {
    throw new OpError((error as Error).message, 'invalid');
  }

  let plans: TablePlan[] | undefined;
  if (source.format === 'tables') {
    const headerRows: Record<string, number> = {};
    for (const spec of o.headerRow ?? []) {
      const [sheet, row] = spec.includes('=') ? pair(spec, 'header-row') : ['', spec];
      headerRows[sheet] = row === 'none' ? 0 : number(row, 'header-row');
    }
    // A header row given without a sheet applies to every table.
    const all = headerRows[''];
    const rows =
      all === undefined
        ? headerRows
        : Object.fromEntries(
            source.file.tables.map((t) => [t.sheet ?? '', headerRows[t.sheet ?? ''] ?? all]),
          );
    plans = tablePlans(source.file, rows);
    const shapes = new Map<string, Shape | 'ignore'>();
    for (const spec of o.sheet ?? []) {
      const [sheet, shape] = pair(spec, 'sheet');
      shapes.set(sheet, oneOf(shape, ['variables', 'links', 'ignore'] as const, 'sheet'));
    }
    for (const sheet of shapes.keys()) {
      if (!plans.some((p) => p.table.sheet === sheet))
        throw new OpError(`--sheet: ${input} has no sheet "${sheet}".`, 'usage');
    }
    plans = plans.flatMap((plan) => {
      const shape = shapes.get(plan.table.sheet ?? '') ?? plan.shape;
      return shape === 'ignore' ? [] : [{ ...plan, shape }];
    });
    const empty = createProject({ title: 'mapping' });
    const taken: string[] = [];
    plans = plans.map((plan) => {
      const mapping: ColumnMapping = suggestMapping(plan.table, plan.shape, empty, taken);
      for (const spec of o.map ?? []) {
        const [left, value] = pair(spec, 'map');
        const colon = left.indexOf(':');
        const sheet = colon >= 0 ? left.slice(0, colon) : undefined;
        const column = colon >= 0 ? left.slice(colon + 1) : left;
        if (sheet !== undefined && sheet !== plan.table.sheet) continue;
        if (!plan.table.columns.includes(column)) {
          if (sheet !== undefined || plans?.length === 1) {
            throw new OpError(`--map: ${tableLabel(plan.table)} has no column "${column}".`, 'usage');
          }
          continue;
        }
        mapping[column] = target(value, plan.shape, column, mapping[column]);
      }
      for (const t of Object.values(mapping)) if (t.kind === 'custom') taken.push(t.id);
      return { ...plan, mapping };
    });
  } else if (o.sheet?.length || o.headerRow?.length || o.map?.length) {
    throw new OpError(
      '--sheet, --header-row and --map are for tables (CSV, TSV, Excel); this file is not one.',
      'usage',
    );
  }
  if (o.signField !== undefined && source.format !== 'kumu') {
    throw new OpError('--sign-field is for Kumu maps; this file is not one.', 'usage');
  }

  let outcome: ReturnType<typeof importSource>;
  try {
    outcome = importSource(source, {
      ...(o.title ? { title: o.title } : {}),
      ...(plans ? { plans } : {}),
      ...(o.signField ? { signField: o.signField } : {}),
    });
  } catch (error) {
    if (error instanceof ImportError) {
      throw new OpError(
        error.message,
        'invalid',
        error.problems.map((p) => ({
          severity: 'error',
          code: 'importProblem',
          message: p.message,
          path: [p.where],
        })),
      );
    }
    throw new OpError((error as Error).message, 'invalid');
  }

  let project: Project = { ...outcome.project, meta: { ...outcome.project.meta, created: env.today } };
  const notes = [...outcome.notes];
  const unplaced = project.variables.filter((v) => !project.layout.positions[v.id]).length;
  if (unplaced && layout !== 'none') {
    const out = applyAutoLayout(project, {
      kind: layout as LayoutKind,
      ...(seed !== undefined ? { seed } : {}),
    });
    project = out.project;
    notes.push(out.summary);
  }
  const saved = !o.dryRun;
  const backup = saved ? saveProject(o.out, project, env).backup : null;
  const counts = { variables: project.variables.length, links: project.links.length };
  return {
    text: [...notes, saved ? `Wrote ${o.out}.` : `Dry run: ${o.out} was not written.`].join('\n'),
    data: {
      file: o.out,
      format: source.format,
      counts,
      notes,
      saved,
      ...(backup ? { backup } : {}),
      ...(o.dryRun ? { dryRun: true } : {}),
    },
  };
}
