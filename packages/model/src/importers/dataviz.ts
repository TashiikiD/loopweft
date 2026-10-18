// Importing a DataViz project (`.dataviz.json`, format "dataviz.project" version 1, as DataViz writes it at
// TashiikiD/DataViz efcdbe2): its entities become variables and its relations links, with their groups,
// signs, delays, confidence, strength and mechanism. DataViz keeps more than a map: what Loopweft has no
// place for is listed in the notes, and the citations it holds are kept as text, not turned into sources.
import { ID_PATTERN } from '../text/ids.ts';
import { cleanText } from '../text/values.ts';
import { type ImportOutcome, ProjectBuilder } from './build.ts';

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** True when a JSON document is a DataViz project. */
export const isDataVizJson = (data: unknown): boolean => isRecord(data) && data.format === 'dataviz.project';

/** A cell as text: lists and records as they read, nothing as "". */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.map(cell).filter(Boolean).join('; ');
  if (isRecord(value)) {
    const citation = cell(value.citation);
    const locator = cell(value.locator);
    if (citation || locator) return [citation, locator].filter(Boolean).join(', ');
    return JSON.stringify(value);
  }
  return cleanText(String(value));
}

interface CustomColumn {
  key: string;
  label: string;
  type: { kind: string };
}

/** Loopweft's kind for a DataViz custom column: dates are kept as text, scales as choices. */
function kindOf(type: { kind: string }): 'text' | 'number' | 'choice' | 'boolean' {
  switch (type.kind) {
    case 'quantitative':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'categorical':
    case 'ordinal':
      return 'choice';
    default:
      return 'text';
  }
}

const rowsOf = (data: Json, shape: 'entities' | 'relations'): Json[] => {
  const table = isRecord(data.data) ? (data.data as Json)[shape] : undefined;
  return isRecord(table) && Array.isArray(table.rows) ? (table.rows as unknown[]).filter(isRecord) : [];
};

const columnsOf = (data: Json, shape: 'entities' | 'relations'): CustomColumn[] => {
  const table = isRecord(data.data) ? (data.data as Json)[shape] : undefined;
  return isRecord(table) && Array.isArray(table.customColumns)
    ? (table.customColumns as unknown[]).filter(isRecord).map((c) => ({
        key: String(c.key),
        label: String(c.label ?? c.key),
        type: isRecord(c.type) ? (c.type as { kind: string }) : { kind: 'text' },
      }))
    : [];
};

export function importDataViz(data: unknown, options: { title?: string } = {}): ImportOutcome {
  if (!isDataVizJson(data))
    throw new Error('This is not a DataViz project: its format is not "dataviz.project".');
  const doc = data as Json;
  if (doc.formatVersion !== 1) {
    throw new Error(
      `This DataViz project is format version ${String(doc.formatVersion)}; Loopweft reads version 1.`,
    );
  }
  const title = options.title ?? cell(doc.title);
  const builder = new ProjectBuilder(title, cell(doc.description) || undefined);
  const settings = isRecord(doc.settings) ? doc.settings : {};
  const vocabularies = isRecord(settings.vocabularies) ? settings.vocabularies : {};
  const notes: string[] = [];

  // Groups, in the order of DataViz's group vocabulary (which also fixed their colours), with their colours.
  const groupVocabulary = isRecord(vocabularies.group) ? vocabularies.group : {};
  const coloured: string[] = [];
  // A group value as entities hold it, and the category it became.
  const groups = new Map<string, string>();
  for (const value of Array.isArray(groupVocabulary.values) ? groupVocabulary.values.filter(isRecord) : []) {
    const name = cell(value.label) || cell(value.value);
    if (!name) continue;
    const id = builder.category(cell(value.value) || name);
    groups.set(cell(value.value) || name, id);
    const category = builder.project.types.categories.find((c) => c.id === id);
    if (category && cell(value.label)) category.name = cell(value.label);
    if (category && typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)) {
      category.colour = value.color;
      coloured.push(category.name);
    }
  }
  if (coloured.length) notes.push(`Kept DataViz's own colours for ${coloured.join(', ')}.`);

  const fieldsFor = (columns: CustomColumn[], appliesTo: 'variables' | 'links') =>
    columns.map((c) => ({
      key: c.key,
      field: builder.field({ name: c.label, kind: kindOf(c.type), appliesTo }),
    }));
  const entityColumns = fieldsFor(columnsOf(doc, 'entities'), 'variables');
  const relationColumns = fieldsFor(columnsOf(doc, 'relations'), 'links');

  // The rubric's scores: one choice field each, by the dimension's name.
  const rubric = isRecord(settings.rubric) ? settings.rubric : {};
  const dimensions = (Array.isArray(rubric.dimensions) ? rubric.dimensions.filter(isRecord) : []).map(
    (d) => ({
      key: `rubric.${cell(d.id)}`,
      field: builder.field({ name: cell(d.label) || cell(d.id), kind: 'choice', appliesTo: 'links' }),
    }),
  );
  const relations = rowsOf(doc, 'relations');
  const hasSources = relations.some((r) => cell(r.sources));
  const hasLabels = relations.some((r) => cell(r.label));
  const sources = hasSources
    ? builder.field({ name: 'DataViz sources', kind: 'text', appliesTo: 'links' })
    : undefined;
  const labels = hasLabels
    ? builder.field({ name: 'DataViz label', kind: 'text', appliesTo: 'links' })
    : undefined;

  const ids = new Map<string, string>();
  const renamed: string[] = [];
  rowsOf(doc, 'entities').forEach((row, index) => {
    const given = cell(row.id);
    const valid = ID_PATTERN.test(given) && given.length <= 80;
    if (given && !valid) renamed.push(given);
    const fields = Object.fromEntries(entityColumns.map(({ key, field }) => [field.id, cell(row[key])]));
    const id = builder.variable(
      {
        ...(valid ? { id: given } : {}),
        label: cell(row.label) || given,
        category: groups.get(cell(row.group)) ?? cell(row.group),
        definition: cell(row.description),
        fields,
      },
      `entity ${index + 1}${given ? ` (${given})` : ''}`,
    );
    if (id && given) ids.set(given, id);
  });
  if (renamed.length)
    notes.push(`Gave new ids to entities whose ids Loopweft cannot use: ${renamed.join(', ')}.`);

  let cited = 0;
  relations.forEach((row, index) => {
    const end = (value: unknown) => ids.get(cell(value)) ?? cell(value);
    const given = cell(row.id);
    const fields: Record<string, string> = Object.fromEntries([
      ...relationColumns.map(({ key, field }) => [field.id, cell(row[key])]),
      ...dimensions.map(({ key, field }) => [field.id, cell(row[key])]),
    ]);
    if (sources && cell(row.sources)) {
      fields[sources.id] = cell(row.sources);
      cited++;
    }
    if (labels && cell(row.label)) fields[labels.id] = cell(row.label);
    builder.link(
      {
        ...(ID_PATTERN.test(given) ? { id: given } : {}),
        from: end(row.from),
        to: end(row.to),
        sign: cell(row.sign),
        delay: cell(row.delay),
        delayLabel: cell(row.delayLabel),
        confidence: cell(row.confidence),
        weight: cell(row.strength),
        rationale: cell(row.mechanism),
        fields,
      },
      `relation ${index + 1}${given ? ` (${given})` : ''}`,
    );
  });

  // Positions: a CLD view's pinned variables, from the first view that pins any.
  const views = Array.isArray(doc.views) ? doc.views.filter(isRecord) : [];
  const pinned = views.find((v) => v.module === 'cld' && isRecord(v.pins) && Object.keys(v.pins).length);
  const outcome = builder.finish();
  const project = outcome.project;
  if (pinned) {
    let placed = 0;
    for (const [entity, point] of Object.entries(pinned.pins as Json)) {
      const id = ids.get(entity);
      if (!id || !isRecord(point) || typeof point.x !== 'number' || typeof point.y !== 'number') continue;
      project.layout.positions[id] = { x: Math.round(point.x), y: Math.round(point.y), pinned: true };
      placed++;
    }
    notes.push(
      `Placed and pinned ${placed} variable${placed === 1 ? '' : 's'} where the view "${cell(pinned.title) || cell(pinned.id)}" pins them${views.length > 1 ? ` (the first of ${views.length} views to pin any)` : ''}; the others are laid out automatically.`,
    );
  }

  if (cited) {
    notes.push(
      `${cited} relation${cited === 1 ? ' cites' : 's cite'} sources in DataViz: the citations are kept, as DataViz wrote them, in the custom field "DataViz sources". They are not Loopweft sources yet: DataViz holds no full references to make them from.`,
    );
  }
  if (labels)
    notes.push(
      'Relation labels are kept in the custom field "DataViz label": Loopweft links have no labels.',
    );
  if (dimensions.length)
    notes.push(
      `The rubric's ${dimensions.length === 1 ? 'dimension became a choice field' : `${dimensions.length} dimensions became choice fields`}.`,
    );
  const left = [
    Array.isArray(doc.raw) && doc.raw.length ? 'the imported raw tables' : '',
    isRecord(doc.normalization) &&
    ((Array.isArray(doc.normalization.log) && doc.normalization.log.length) ||
      (Array.isArray(doc.normalization.pending) && doc.normalization.pending.length))
      ? 'the normalization log and pending suggestions'
      : '',
    views.length
      ? `${views.length === 1 ? 'its view' : `its ${views.length} views`} (filters, outputs, look, link bends and curvature)`
      : '',
  ].filter(Boolean);
  if (left.length) notes.push(`Left out what Loopweft has no place for: ${left.join('; ')}.`);
  return { project, notes: [...outcome.notes, ...notes] };
}
