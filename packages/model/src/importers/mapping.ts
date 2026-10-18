// Where each column of an imported table goes: a variable's or a link's own field, a custom field, or
// nowhere. In part from DataViz packages/normalize/src/mapping.ts @ efcdbe2 (TashiikiD/DataViz, private):
// the header synonyms, the reading of a column's kind from its values, and the rule that every column with
// a value is kept, as a custom field when it is nothing else, so no data is lost. Rewritten for Loopweft's
// variables and links.
import type { Field, Project } from '../schema.ts';
import { slugify, uniqueId } from '../text/ids.ts';
import { readBoolean, readNumber } from '../text/values.ts';
import { normalizeToken } from '../text/vocabulary.ts';
import type { TableData } from './read/table.ts';

export type Shape = 'variables' | 'links';

export const VARIABLE_KEYS = ['id', 'label', 'mapLabel', 'category', 'role', 'definition', 'size'] as const;
export const LINK_KEYS = [
  'id',
  'from',
  'to',
  'sign',
  'type',
  'conditional',
  'delay',
  'delayLabel',
  'confidence',
  'weight',
  'rationale',
] as const;
export type VariableKey = (typeof VARIABLE_KEYS)[number];
export type LinkKey = (typeof LINK_KEYS)[number];

/** Where one column goes. A custom field is an existing one (by id) or a new one, made with its kind. */
export type ColumnTarget =
  | { kind: 'field'; key: VariableKey | LinkKey }
  | { kind: 'custom'; id: string; name: string; type: Field['kind'] }
  | { kind: 'ignore' };

/** Column name → target. */
export type ColumnMapping = Record<string, ColumnTarget>;

/** Header spellings for each field (compared ignoring case and spacing). */
const SYNONYMS: Record<Shape, Record<string, string[]>> = {
  variables: {
    id: ['id', 'key', 'code', 'identifier'],
    label: ['label', 'name', 'variable', 'title', 'entity', 'node', 'element', 'factor'],
    mapLabel: ['map label', 'short label', 'short name'],
    category: ['category', 'group', 'domain', 'cluster', 'subsystem', 'sector'],
    role: ['role'],
    definition: ['definition', 'description', 'meaning', 'notes', 'details'],
    size: ['size'],
  },
  links: {
    id: ['id', 'link id', 'edge id', 'relation id', 'connection id'],
    from: ['from', 'source', 'cause', 'origin', 'driver', 'tail', 'from variable', 'start'],
    to: ['to', 'target', 'effect', 'destination', 'outcome', 'head', 'to variable', 'end'],
    sign: ['sign', 'polarity', 'effect sign', 'link sign', '+/-', 'direction of effect'],
    type: ['type', 'link type', 'connection type', 'kind'],
    conditional: ['conditional'],
    delay: ['delay', 'delayed', 'lag', 'has delay'],
    delayLabel: ['delay label', 'delay time', 'lag time', 'delay length'],
    confidence: ['confidence', 'certainty', 'confidence level'],
    weight: ['weight', 'strength', 'magnitude'],
    rationale: ['rationale', 'mechanism', 'explanation', 'how', 'why'],
  },
};

const KEYS: Record<Shape, readonly string[]> = { variables: VARIABLE_KEYS, links: LINK_KEYS };

/**
 * The kind a new custom field takes from its values: numbers, true or false, a few short values that repeat
 * (a choice), else text.
 */
export function inferFieldKind(values: readonly string[]): Field['kind'] {
  const filled = values.map((v) => v.trim()).filter(Boolean);
  if (filled.length === 0) return 'text';
  if (filled.every((v) => readNumber(v).kind === 'ok')) return 'number';
  if (filled.every((v) => readBoolean(v).kind === 'ok') && filled.some((v) => !/^[01]$/.test(v)))
    return 'boolean';
  const distinct = new Set(filled.map((v) => normalizeToken(v))).size;
  // A few short values, some of them repeated: a choice. Notes and sentences stay text.
  if (distinct < filled.length && distinct <= 12 && filled.every((v) => v.length <= 40)) return 'choice';
  return 'text';
}

/** Fields a variable or link may carry. */
const fieldsFor = (project: Project, shape: Shape): Field[] =>
  project.types.fields.filter((f) => (f.appliesTo ?? 'both') !== (shape === 'links' ? 'variables' : 'links'));

/**
 * A mapping for a table: a header that names a field (its key or a common spelling) maps to it, each field
 * at most once; a header that names one of the project's custom fields maps to that; a column without any
 * value is ignored; every other column becomes a new custom field, its kind read from its values.
 * `taken` holds custom field ids already used, e.g. by another table of the same import.
 */
export function suggestMapping(
  table: TableData,
  shape: Shape,
  project: Project,
  taken: Iterable<string> = [],
): ColumnMapping {
  const used = new Set<string>();
  const ids = new Set([...project.types.fields.map((f) => f.id), ...taken]);
  const mapping: ColumnMapping = {};
  table.columns.forEach((column, index) => {
    const values = table.rows.map((row) => row[index] ?? '');
    if (values.every((v) => v.trim() === '')) {
      mapping[column] = { kind: 'ignore' };
      return;
    }
    const token = normalizeToken(column);
    const key = KEYS[shape].find(
      (k) =>
        !used.has(k) &&
        (normalizeToken(k) === token || (SYNONYMS[shape][k] ?? []).some((s) => normalizeToken(s) === token)),
    );
    if (key) {
      used.add(key);
      mapping[column] = { kind: 'field', key: key as VariableKey & LinkKey };
      return;
    }
    const existing = fieldsFor(project, shape).find(
      (f) => normalizeToken(f.id) === token || normalizeToken(f.name) === token,
    );
    if (existing) {
      mapping[column] = { kind: 'custom', id: existing.id, name: existing.name, type: existing.kind };
      return;
    }
    const id = uniqueId(slugify(column), ids, 'field');
    ids.add(id);
    mapping[column] = { kind: 'custom', id, name: column.trim(), type: inferFieldKind(values) };
  });
  return mapping;
}

/** The table holds links when a column is a cause and another an effect; else variables. */
export function guessShape(table: TableData, project: Project): Shape {
  const name = normalizeToken(table.sheet ?? table.name.replace(/\.[^.]*$/, ''));
  if (['links', 'link', 'edges', 'edge', 'connections', 'relations', 'arrows'].includes(name)) return 'links';
  if (['variables', 'variable', 'nodes', 'node', 'elements', 'entities', 'factors'].includes(name))
    return 'variables';
  const targets = Object.values(suggestMapping(table, 'links', project)).flatMap((t) =>
    t.kind === 'field' ? [t.key] : [],
  );
  return targets.includes('from') && targets.includes('to') ? 'links' : 'variables';
}

/** What makes a mapping unusable: a column mapped twice, or a column every row needs left unmapped. */
export function mappingProblems(mapping: ColumnMapping, table: TableData, shape: Shape): string[] {
  const problems: string[] = [];
  const targets = new Map<string, string>();
  for (const [column, target] of Object.entries(mapping)) {
    if (!table.columns.includes(column)) problems.push(`"${column}" is not a column of this table.`);
    if (target.kind === 'ignore') continue;
    const key = target.kind === 'field' ? target.key : `custom ${target.id}`;
    if (target.kind === 'field' && !KEYS[shape].includes(target.key)) {
      problems.push(`"${column}": ${shape} have no field "${target.key}".`);
    }
    const previous = targets.get(key);
    if (previous)
      problems.push(`"${column}" and "${previous}" both go to ${key.replace('custom ', 'field ')}.`);
    targets.set(key, column);
  }
  if (shape === 'links') {
    for (const key of ['from', 'to'] as const) {
      if (!targets.has(key))
        problems.push(
          `Choose the column that holds each link's ${key === 'from' ? 'cause (from)' : 'effect (to)'}.`,
        );
    }
  } else if (!targets.has('label') && !targets.has('id')) {
    problems.push("Choose the column that holds each variable's name (label).");
  }
  return problems;
}
