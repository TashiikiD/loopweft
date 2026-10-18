// Importing a Kumu map, from the two layouts Kumu documents (docs.kumu.io, "Import" and "JSON /
// Blueprints"): a JSON blueprint, `{ "elements": [...], "connections": [...] }`, and a spreadsheet with an
// elements sheet (Label, Type, Description, Tags, …) and a connections sheet (From, To, Type, Direction,
// Label, Strength, …). Kumu's own project backup (Export to JSON) is not publicly documented; elements and
// connections in it are read as far as they follow these fields, and every field that is not one of them
// becomes a custom field.
//
// Kumu has no link signs. A connection field named sign or polarity gives the sign; else a connection type
// that reads as a sign (+, -, positive…) does; else every link is recorded as unknown (?), and the notes
// say so. Kumu links can be undirected, which a causal link cannot be: those are left out and counted.

import { cleanText } from '../text/values.ts';
import { normalizeToken, resolveVocabularyValue, SIGN_VOCABULARY } from '../text/vocabulary.ts';
import { type ImportOutcome, ProjectBuilder } from './build.ts';
import { inferFieldKind } from './mapping.ts';
import type { SourceFile } from './read/readers.ts';
import { tableWithHeader } from './read/table.ts';

export type KumuRecord = Record<string, unknown>;

export interface KumuData {
  elements: KumuRecord[];
  connections: KumuRecord[];
  /** Kumu's named loops, which are not read (their format is not documented): counted in the notes. */
  loops: number;
  /** Where the data came from, for the notes: "JSON" or "the spreadsheet". */
  from: string;
}

export interface KumuOptions {
  title: string;
  /** The connection field that holds the signs; absent: found as described above. */
  signField?: string;
}

const isRecord = (value: unknown): value is KumuRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A record's fields, with any nested under "attributes" (as some Kumu exports have them) brought up. */
function flatten(record: KumuRecord): KumuRecord {
  const { attributes, ...rest } = record;
  return isRecord(attributes) ? { ...attributes, ...rest } : rest;
}

/** Text of a value: lists (tags) joined with commas, objects as JSON, nothing as "". */
function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return cleanText(String(value));
}

/** True when a JSON document looks like a Kumu blueprint or export. */
export function isKumuJson(data: unknown): boolean {
  return isRecord(data) && (Array.isArray(data.elements) || Array.isArray(data.connections));
}

export function kumuFromJson(data: unknown): KumuData {
  if (!isKumuJson(data))
    throw new Error('This is not a Kumu blueprint: it has no "elements" or "connections".');
  const doc = data as KumuRecord;
  const list = (key: string) =>
    Array.isArray(doc[key]) ? (doc[key] as unknown[]).filter(isRecord).map(flatten) : [];
  return {
    elements: list('elements'),
    connections: list('connections'),
    loops: Array.isArray(doc.loops) ? doc.loops.length : 0,
    from: 'JSON',
  };
}

/** True when a spreadsheet has Kumu's two sheets (elements and connections). */
export function isKumuSheets(file: SourceFile): boolean {
  const names = file.tables.map((t) => normalizeToken(t.sheet ?? ''));
  return names.includes('elements') && names.includes('connections');
}

export function kumuFromSheets(file: SourceFile): KumuData {
  const sheet = (name: string): KumuRecord[] => {
    const source = file.tables.find((t) => normalizeToken(t.sheet ?? '') === name);
    if (!source) return [];
    const table = tableWithHeader(source);
    return table.rows.map((row) => Object.fromEntries(table.columns.map((c, i) => [c, row[i] ?? ''])));
  };
  const loops = file.tables.find((t) => normalizeToken(t.sheet ?? '') === 'loops');
  return {
    elements: sheet('elements'),
    connections: sheet('connections'),
    loops: loops ? Math.max(0, tableWithHeader(loops).rows.length) : 0,
    from: 'the spreadsheet',
  };
}

/** The fields a record set uses, in first-seen order, by their normalized name. */
function fieldNames(records: readonly KumuRecord[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const r of records)
    for (const key of Object.keys(r))
      if (!names.has(normalizeToken(key))) names.set(normalizeToken(key), key);
  return names;
}

const ELEMENT_FIELDS: Record<string, string[]> = {
  label: ['label', 'name'],
  id: ['id', '_id'],
  category: ['type', 'element type'],
  definition: ['description'],
};
const CONNECTION_FIELDS: Record<string, string[]> = {
  from: ['from'],
  to: ['to'],
  id: ['id', '_id'],
  type: ['type', 'connection type'],
  direction: ['direction'],
  rationale: ['description'],
  weight: ['strength', 'weight'],
};
const SIGN_FIELDS = ['sign', 'polarity', 'connection sign', 'connection polarity', 'link sign'];

/** Which of the records' fields each role takes, and the rest. */
function assign(
  names: Map<string, string>,
  roles: Record<string, string[]>,
): { roles: Map<string, string>; rest: string[] } {
  const taken = new Map<string, string>();
  const used = new Set<string>();
  for (const [role, spellings] of Object.entries(roles)) {
    const key = spellings.find((s) => names.has(s) && !used.has(s));
    if (key) {
      taken.set(role, names.get(key) as string);
      used.add(key);
    }
  }
  return { roles: taken, rest: [...names].filter(([token]) => !used.has(token)).map(([, key]) => key) };
}

export function importKumu(data: KumuData, options: KumuOptions): ImportOutcome {
  const builder = new ProjectBuilder(options.title);
  const elements = assign(fieldNames(data.elements), ELEMENT_FIELDS);
  const connectionNames = fieldNames(data.connections);
  const chosen = options.signField === undefined ? undefined : normalizeToken(options.signField);
  if (chosen !== undefined && !connectionNames.has(chosen)) {
    builder.problem(
      'connections',
      `No connection field "${options.signField}" holds signs: there is no such field.`,
    );
  }
  const signKey = chosen ?? SIGN_FIELDS.find((s) => connectionNames.has(s));
  const signField = signKey === undefined ? undefined : connectionNames.get(signKey);
  const roles = { ...CONNECTION_FIELDS };
  if (signKey !== undefined) delete (roles as Record<string, string[]>)[signKey];
  const connections = assign(
    signKey === undefined ? connectionNames : new Map([...connectionNames].filter(([t]) => t !== signKey)),
    roles,
  );
  const typeField = connections.roles.get('type');
  // Without a sign field, a type that reads as a sign everywhere it is given is the sign.
  const typesAreSigns =
    signField === undefined &&
    typeField !== undefined &&
    data.connections.some((c) => valueText(c[typeField])) &&
    data.connections.every(
      (c) => !valueText(c[typeField]) || resolveVocabularyValue(SIGN_VOCABULARY, valueText(c[typeField])),
    );

  const custom = (
    records: readonly KumuRecord[],
    keys: readonly string[],
    appliesTo: 'variables' | 'links',
  ) =>
    keys.map((key) => ({
      key,
      field: builder.field({
        name: key,
        kind: inferFieldKind(records.map((r) => valueText(r[key]))),
        appliesTo,
      }),
    }));
  const elementCustom = custom(data.elements, elements.rest, 'variables');
  const connectionCustom = custom(data.connections, connections.rest, 'links');

  const ids = new Map<string, string>();
  data.elements.forEach((element, index) => {
    const get = (role: string) => {
      const key = elements.roles.get(role);
      return key === undefined ? '' : valueText(element[key]);
    };
    const fields = Object.fromEntries(
      elementCustom.map(({ key, field }) => [field.id, valueText(element[key])]),
    );
    const id = builder.variable(
      { label: get('label'), category: get('category'), definition: get('definition'), fields },
      `element ${index + 1}${get('label') ? ` (${get('label')})` : ''}`,
    );
    const kumuId = get('id');
    if (id && kumuId) ids.set(kumuId, id);
  });

  let undirected = 0;
  let mutual = 0;
  let noDirection = 0;
  data.connections.forEach((connection, index) => {
    const get = (role: string) => {
      const key = connections.roles.get(role);
      return key === undefined ? '' : valueText(connection[key]);
    };
    const where = `connection ${index + 1}`;
    const direction = normalizeToken(get('direction'));
    if (direction === 'undirected') {
      undirected++;
      return;
    }
    if (direction && direction !== 'directed' && direction !== 'mutual') {
      builder.problem(
        `${where}, direction`,
        `Kumu directions are directed, mutual or undirected, not "${get('direction')}".`,
      );
      return;
    }
    if (!direction) noDirection++;
    const end = (name: string) => ids.get(name) ?? name;
    const sign =
      signField !== undefined ? valueText(connection[signField]) : typesAreSigns ? get('type') : '';
    const fields = Object.fromEntries(
      connectionCustom.map(({ key, field }) => [field.id, valueText(connection[key])]),
    );
    // Kumu draws one connection to each element named in a "To" cell, separated by "|".
    const targets = get('to')
      .split('|')
      .map((t) => t.trim())
      .filter(Boolean);
    for (const to of targets.length ? targets : ['']) {
      const pairs =
        direction === 'mutual'
          ? [
              [get('from'), to],
              [to, get('from')],
            ]
          : [[get('from'), to]];
      for (const [from, target] of pairs) {
        builder.link(
          {
            from: end(from as string),
            to: end(target as string),
            sign,
            ...(typesAreSigns ? {} : { type: get('type') }),
            rationale: get('rationale'),
            weight: get('weight'),
            fields,
          },
          where,
        );
      }
    }
    if (direction === 'mutual') mutual++;
  });

  const outcome = builder.finish();
  const notes = [...outcome.notes];
  notes.push(
    `Read Kumu's ${data.from}: ${data.elements.length} elements and ${data.connections.length} connections.`,
  );
  if (elements.roles.has('category')) notes.push("Kumu's element types became categories.");
  if (signField !== undefined) notes.push(`Signs came from the connection field "${signField}".`);
  else if (typesAreSigns) notes.push('Signs came from the connection types, which all read as signs.');
  else
    notes.push(
      'Kumu connections carry no sign here: every link is recorded as unknown (?) and flagged. Set the signs, or name the field that holds them.',
    );
  if (mutual)
    notes.push(
      `${mutual} mutual connection${mutual === 1 ? ' became two links' : 's became two links each'}, one each way.`,
    );
  if (undirected)
    notes.push(
      `Left out ${undirected} undirected connection${undirected === 1 ? '' : 's'}: a causal link needs a direction.`,
    );
  if (noDirection)
    notes.push(
      `${noDirection} connection${noDirection === 1 ? ' gives' : 's give'} no direction: read as directed, from → to.`,
    );
  if (connections.roles.has('rationale'))
    notes.push("Kumu's connection descriptions became the links' rationales.");
  const rest = [...elementCustom, ...connectionCustom].map((c) => `"${c.key}"`);
  if (rest.length)
    notes.push(
      `Kept as custom fields: ${[...new Set(rest)].join(', ')} (Loopweft has no tags or link labels of its own).`,
    );
  if (data.loops)
    notes.push(
      `Left out ${data.loops} Kumu loop${data.loops === 1 ? '' : 's'}: Loopweft finds the loops from the links, and they can be named again.`,
    );
  notes.push('Kumu blueprints hold no positions: the map is laid out automatically.');
  return { project: outcome.project, notes };
}
