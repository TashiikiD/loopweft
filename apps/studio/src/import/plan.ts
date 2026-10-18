// The import wizard's model: what a file holds, where each column of a table can go, and the plans the
// importers (@loopweft/model, the ones `loopweft import` runs) take. Pure, so it is tested without a browser.
import { applyAutoLayout, type LayoutKind } from '@loopweft/layout';
import {
  type ColumnMapping,
  type ColumnTarget,
  createProject,
  type Field,
  ImportError,
  type ImportSource,
  importSource,
  type KumuData,
  LINK_KEYS,
  mappingProblems,
  type Project,
  plural,
  type Shape,
  slugify,
  suggestMapping,
  type TableData,
  type TablePlan,
  tableLabel,
  tablePlans,
  uniqueId,
  VARIABLE_KEYS,
} from '@loopweft/model';

/** Loopweft's own fields, as the wizard names them. */
export const FIELD_NAMES: Record<Shape, Record<string, string>> = {
  variables: {
    id: 'Id',
    label: 'Name',
    mapLabel: 'Name on the map',
    category: 'Category',
    role: 'Role',
    definition: 'Definition',
    size: 'Size',
  },
  links: {
    id: 'Id',
    from: 'From (the cause)',
    to: 'To (the effect)',
    sign: 'Sign',
    type: 'Link type',
    conditional: 'Conditional',
    delay: 'Delay',
    delayLabel: 'How long (delay)',
    confidence: 'Confidence',
    weight: 'Weight',
    rationale: 'Rationale',
  },
};

export const FIELD_KEYS: Record<Shape, readonly string[]> = { variables: VARIABLE_KEYS, links: LINK_KEYS };

export const KIND_NAMES: Record<Field['kind'], string> = {
  text: 'text',
  number: 'number',
  choice: 'one of a list',
  boolean: 'yes or no',
};

/** What a read file holds, in a line. */
export function describeSource(source: ImportSource): string {
  if (source.format === 'dataviz') return 'A DataViz project.';
  if (source.format === 'kumu') {
    const { elements, connections, from } = source.data;
    return `A Kumu map (${from === 'JSON' ? 'a JSON blueprint' : 'a spreadsheet'}): ${plural(elements.length, 'element')} and ${plural(connections.length, 'connection')}.`;
  }
  const { format, tables } = source.file;
  const kind = { csv: 'CSV', tsv: 'TSV', json: 'JSON', xlsx: 'Excel' }[format];
  const sheets = tables.flatMap((t) => (t.sheet === undefined ? [] : [`"${t.sheet}"`]));
  if (tables.length === 1) return `A table (${kind}${sheets.length ? `, the sheet ${sheets[0]}` : ''}).`;
  return `${tables.length} tables (${kind}${sheets.length ? `: the sheets ${sheets.join(', ')}` : ''}).`;
}

/** One table of a file: what it holds (or left out), its header row, and where each column goes. */
export interface TableChoice {
  table: TableData;
  shape: Shape | 'ignore';
  mapping: ColumnMapping;
}

const customIds = (choices: readonly TableChoice[], except?: number) =>
  choices.flatMap((c, i) =>
    i === except || c.shape === 'ignore'
      ? []
      : Object.values(c.mapping).flatMap((t) => (t.kind === 'custom' ? [t.id] : [])),
  );

/** A table's columns mapped afresh, sharing custom field ids with the other tables. */
function suggest(table: TableData, shape: Shape, taken: readonly string[]): ColumnMapping {
  return suggestMapping(table, shape, createProject({ title: 'mapping' }), taken);
}

/** The tables of a file, each with the kind of rows it most likely holds and the mapping its headers suggest. */
export function initialChoices(source: Extract<ImportSource, { format: 'tables' }>): TableChoice[] {
  const choices: TableChoice[] = [];
  for (const plan of tablePlans(source.file)) {
    choices.push({
      table: plan.table,
      shape: plan.shape,
      mapping: suggest(plan.table, plan.shape, customIds(choices)),
    });
  }
  return choices;
}

/** A table read again with another header row (0: none), its mapping suggested afresh. */
export function withHeaderRow(
  source: Extract<ImportSource, { format: 'tables' }>,
  choices: readonly TableChoice[],
  index: number,
  headerRow: number,
): TableChoice[] {
  const key = source.file.tables[index]?.sheet ?? '';
  const table = (tablePlans(source.file, { [key]: headerRow })[index] as TablePlan).table;
  return choices.map((c, i) => {
    if (i !== index) return c;
    const shape = c.shape;
    return {
      table,
      shape,
      mapping: shape === 'ignore' ? {} : suggest(table, shape, customIds(choices, index)),
    };
  });
}

/** What a table holds changed: its mapping is suggested afresh for that. */
export function withShape(
  choices: readonly TableChoice[],
  index: number,
  shape: Shape | 'ignore',
): TableChoice[] {
  return choices.map((c, i) =>
    i !== index
      ? c
      : {
          ...c,
          shape,
          mapping: shape === 'ignore' ? {} : suggest(c.table, shape, customIds(choices, index)),
        },
  );
}

/** Where one column goes changed. A new custom field gets an id no other column has. */
export function withTarget(
  choices: readonly TableChoice[],
  index: number,
  column: string,
  target: { kind: 'field'; key: string } | { kind: 'custom'; type?: Field['kind'] } | { kind: 'ignore' },
): TableChoice[] {
  return choices.map((c, i) => {
    if (i !== index) return c;
    let next: ColumnTarget;
    if (target.kind === 'field') next = { kind: 'field', key: target.key as never };
    else if (target.kind === 'ignore') next = { kind: 'ignore' };
    else {
      const current = c.mapping[column];
      if (current?.kind === 'custom') next = { ...current, ...(target.type ? { type: target.type } : {}) };
      else {
        const taken = new Set([
          ...customIds(choices, index),
          ...Object.entries(c.mapping).flatMap(([col, t]) =>
            col !== column && t.kind === 'custom' ? [t.id] : [],
          ),
        ]);
        next = {
          kind: 'custom',
          id: uniqueId(slugify(column), taken, 'field'),
          name: column.trim(),
          type: target.type ?? 'text',
        };
      }
    }
    return { ...c, mapping: { ...c.mapping, [column]: next } };
  });
}

/** The plans the importer takes: tables left out are dropped. */
export const plansOf = (choices: readonly TableChoice[]): TablePlan[] =>
  choices.flatMap((c) =>
    c.shape === 'ignore' ? [] : [{ table: c.table, shape: c.shape, mapping: c.mapping }],
  );

/** What keeps the tables from being imported: each table's mapping problems, and no table chosen at all. */
export function choiceProblems(choices: readonly TableChoice[]): string[] {
  const problems = choices.flatMap((c) =>
    c.shape === 'ignore'
      ? []
      : mappingProblems(c.mapping, c.table, c.shape).map((p) => `${tableLabel(c.table)}: ${p}`),
  );
  if (!choices.some((c) => c.shape !== 'ignore')) problems.push('Choose at least one table to import.');
  return problems;
}

/** A column's first few values that are not empty, as examples. */
export function samples(table: TableData, column: string, count = 3): string[] {
  const index = table.columns.indexOf(column);
  const out: string[] = [];
  for (const row of table.rows) {
    const value = (row[index] ?? '').trim();
    if (value && !out.includes(value)) out.push(value);
    if (out.length === count) break;
  }
  return out;
}

/** The fields Kumu connections have, in the order they first appear: where signs might be. */
export function kumuConnectionFields(data: KumuData): string[] {
  const seen = new Set<string>();
  for (const connection of data.connections) for (const key of Object.keys(connection)) seen.add(key);
  return [...seen];
}

export type Placement = LayoutKind | 'none';

export type Checked = { ok: true; project: Project; notes: string[] } | { ok: false; problems: string[] };

/**
 * The map the import gives, as `loopweft import` makes it: the importer's project and notes, and variables
 * the file did not place laid out (the force layout by default, as on the command line).
 */
export function runImport(
  source: ImportSource,
  options: {
    choices?: readonly TableChoice[];
    signField?: string | null;
    title?: string;
    placement: Placement;
    seed?: number;
  },
): Checked {
  try {
    const title = options.title?.trim();
    const outcome = importSource(source, {
      ...(title ? { title } : {}),
      ...(source.format === 'tables' && options.choices ? { plans: plansOf(options.choices) } : {}),
      ...(source.format === 'kumu' && options.signField ? { signField: options.signField } : {}),
    });
    let project = outcome.project;
    const notes = [...outcome.notes];
    const unplaced = project.variables.filter((v) => !project.layout.positions[v.id]).length;
    if (unplaced && options.placement !== 'none') {
      const out = applyAutoLayout(project, {
        kind: options.placement,
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
      });
      project = out.project;
      notes.push(out.summary);
    }
    return { ok: true, project, notes };
  } catch (error) {
    if (error instanceof ImportError) {
      return { ok: false, problems: error.problems.map((p) => `${p.where}: ${p.message}`) };
    }
    return { ok: false, problems: [(error as Error).message] };
  }
}
