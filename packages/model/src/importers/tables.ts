// Importing tables (CSV, TSV, Excel sheets): one of variables and one of links, or links alone, whose ends
// name the variables. Each column goes where its mapping says (see mapping.ts); variables come first, so
// link ends find them by id or label.
import { createProject } from '../project.ts';
import { type ImportOutcome, type LinkRow, ProjectBuilder, type VariableRow } from './build.ts';
import {
  type ColumnMapping,
  type ColumnTarget,
  mappingProblems,
  type Shape,
  suggestMapping,
} from './mapping.ts';
import { type TableData, tableLabel } from './read/table.ts';

export interface TablePlan {
  table: TableData;
  shape: Shape;
  /** Absent: suggested from the headers (see suggestMapping). */
  mapping?: ColumnMapping;
}

/** The mapping each table gets, against the project the tables before it leave (so new fields are shared). */
export function planMappings(plans: readonly TablePlan[]): ColumnMapping[] {
  const empty = createProject({ title: 'mapping' });
  const taken: string[] = [];
  return plans.map((plan) => {
    const mapping = plan.mapping ?? suggestMapping(plan.table, plan.shape, empty, taken);
    for (const target of Object.values(mapping)) if (target.kind === 'custom') taken.push(target.id);
    return mapping;
  });
}

/** The row number a person sees in the file: its own row, counting the header and the rows above it. */
const rowNumber = (table: TableData, index: number): string =>
  table.headerRow === undefined ? `record ${index + 1}` : `row ${table.headerRow + 1 + index}`;

/**
 * A project from tables. Variables tables are read first. Every problem (a value that cannot be read, a
 * link without an end, a mapping that misses a column) is reported at once, as an ImportError.
 */
export function importTables(
  plans: readonly TablePlan[],
  options: { title: string; description?: string },
): ImportOutcome {
  const builder = new ProjectBuilder(options.title, options.description);
  const mappings = planMappings(plans);
  const ordered = plans
    .map((plan, i) => ({ plan, mapping: mappings[i] as ColumnMapping }))
    .sort((a, b) => (a.plan.shape === b.plan.shape ? 0 : a.plan.shape === 'variables' ? -1 : 1));

  for (const { plan, mapping } of ordered) {
    const label = tableLabel(plan.table);
    for (const problem of mappingProblems(mapping, plan.table, plan.shape)) builder.problem(label, problem);
    for (const [column, target] of Object.entries(mapping)) {
      if (target.kind === 'custom') {
        builder.field({ id: target.id, name: target.name, kind: target.type, appliesTo: plan.shape });
      }
      if (
        target.kind === 'ignore' &&
        plan.table.rows.some((r) => (r[plan.table.columns.indexOf(column)] ?? '').trim())
      ) {
        builder.notes.push(`Left out the column "${column}" of ${label}, as chosen.`);
      }
    }
  }
  if (builder.problems.length) return builder.finish();

  for (const { plan, mapping } of ordered) {
    const columns = plan.table.columns.map(
      (column) => mapping[column] ?? ({ kind: 'ignore' } as ColumnTarget),
    );
    plan.table.rows.forEach((cells, index) => {
      const row: Record<string, string> = {};
      const fields: Record<string, string> = {};
      columns.forEach((target, c) => {
        const value = cells[c] ?? '';
        if (target.kind === 'field') row[target.key] = value;
        else if (target.kind === 'custom') {
          const field = builder.project.types.fields.find(
            (f) => f.id === target.id || f.name === target.name,
          );
          if (field) fields[field.id] = value;
        }
      });
      const where = `${tableLabel(plan.table)}, ${rowNumber(plan.table, index)}`;
      if (plan.shape === 'variables') builder.variable({ ...(row as VariableRow), fields }, where);
      else builder.link({ ...(row as unknown as LinkRow), fields }, where);
    });
  }
  return builder.finish();
}
