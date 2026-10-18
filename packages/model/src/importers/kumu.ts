// Importing a Kumu map, from three layouts:
// - a JSON blueprint, `{ "elements": [...], "connections": [...] }`, as Kumu documents it (docs.kumu.io,
//   "Import" and "JSON / Blueprints"): connections name their elements by label or id;
// - a spreadsheet with an elements sheet (Label, Type, Description, Tags, …) and a connections sheet (From,
//   To, Type, Direction, Label, Strength, …), as Kumu documents it and exports it;
// - Kumu's own JSON export (Export to JSON), which Kumu does not document. It is read as Kumu writes it:
//   elements and connections keep their fields under `attributes` and name each other by Kumu id;
//   connections say whether they are `delayed` or `reversed`; `loops` list their connections; `maps` list
//   what each map shows and where it draws each element; `attributes` defines the fields, with the names Kumu
//   shows and which of them are metrics Kumu computed.
//
// Kumu keeps in a project what was removed from a map, so an export brings only what its maps show, as Kumu's
// own spreadsheet export does; what it leaves out is named in the notes.
//
// Kumu has no link signs. A connection field named sign or polarity gives the sign; else a connection type
// that reads as a sign (+, -, positive…) does; else every link is recorded as unknown (?), and the notes
// say so. Kumu links can be undirected, which a causal link cannot be: those are left out and counted.

import { addLoop } from '../ops/loops.ts';
import { OpError } from '../ops/support.ts';
import type { Link, Project } from '../schema.ts';
import { compareStrings } from '../text/ids.ts';
import { cleanText, readBoolean } from '../text/values.ts';
import { normalizeToken, resolveVocabularyValue, SIGN_VOCABULARY } from '../text/vocabulary.ts';
import { type ImportOutcome, ProjectBuilder } from './build.ts';
import { inferFieldKind } from './mapping.ts';
import type { SourceFile } from './read/readers.ts';
import { tableWithHeader } from './read/table.ts';

export type KumuRecord = Record<string, unknown>;

/** A loop of a Kumu JSON file: its label and description, and its connections by Kumu id. */
export interface KumuLoop {
  id: string;
  label: string;
  description: string;
  connections: string[];
}

/** Where a Kumu map draws an element, and whether it is fixed there. */
export interface KumuPosition {
  x: number;
  y: number;
  pinned: boolean;
}

export interface KumuData {
  /** The layout the file has: Kumu's JSON export, a JSON blueprint or a spreadsheet. */
  layout: 'export' | 'blueprint' | 'spreadsheet';
  elements: KumuRecord[];
  connections: KumuRecord[];
  /** Loops that list their connections (JSON). */
  loops: KumuLoop[];
  /** Loops in a form Loopweft cannot read (a spreadsheet's loops sheet): counted in the notes. */
  unreadLoops: number;
  /** An export's project name and description ("" when it has none). */
  name: string;
  description: string;
  /** An export's maps: how many, and the one whose positions are used (its default map). */
  maps: number;
  map?: { name: string; positions: Record<string, KumuPosition> };
  /** Field names as an export's attribute definitions spell them ("Element Type"), by normalized key. */
  fieldNames: Record<string, string>;
  /** The fields an export marks as metrics Kumu computed (degree, betweenness…), by normalized key. */
  metrics: string[];
  /** What an export holds but none of its maps shows, left out: connections as "A → B". */
  offMap: { elements: number; connections: string[]; loops: number };
  /** What of the maps' own look an export holds, which Loopweft does not carry, in words. */
  styling: string[];
}

export interface KumuOptions {
  title: string;
  /** The connection field that holds the signs; absent: found as described above. */
  signField?: string;
}

const isRecord = (value: unknown): value is KumuRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const records = (value: unknown): KumuRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A record's fields, with any nested under "attributes" (as Kumu's exports have them) brought up. */
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

/** Kumu's id for a record: `_id` in an export, `id` in a blueprint. */
const kumuId = (record: KumuRecord): string => valueText(record._id) || valueText(record.id);

/** True when a JSON document looks like a Kumu blueprint or export. */
export function isKumuJson(data: unknown): boolean {
  return isRecord(data) && (Array.isArray(data.elements) || Array.isArray(data.connections));
}

export function kumuFromJson(data: unknown): KumuData {
  if (!isKumuJson(data))
    throw new Error('This is not a Kumu blueprint: it has no "elements" or "connections".');
  const doc = data as KumuRecord;
  const maps = records(doc.maps);
  // What the maps show, by Kumu id; with no maps (a blueprint), everything is shown.
  const shown = (list: string, key: string): Set<string> | null =>
    maps.length
      ? new Set(maps.flatMap((m) => records(m[list]).map((r) => valueText(r[key]))).filter(Boolean))
      : null;
  const shownElements = shown('elements', 'element');
  const shownConnections = shown('connections', 'connection');
  const shownLoops = shown('loops', 'loop');

  const allElements = records(doc.elements);
  const elements = allElements.filter((e) => !shownElements || shownElements.has(kumuId(e)));
  const hidden = new Set(allElements.filter((e) => !elements.includes(e)).map(kumuId));
  const labels = new Map(allElements.map((e) => [kumuId(e), valueText(flatten(e).label)]));
  const name = (end: unknown) => labels.get(valueText(end)) || valueText(end);
  const allConnections = records(doc.connections);
  // A connection to an element no map shows is left out with it.
  const connections = allConnections.filter(
    (c) =>
      (!shownConnections || shownConnections.has(kumuId(c))) &&
      !hidden.has(valueText(c.from)) &&
      !hidden.has(valueText(c.to)),
  );
  const allLoops = records(doc.loops);
  const loops = allLoops
    .filter((l) => !shownLoops || shownLoops.has(kumuId(l)))
    .map((l) => {
      const fields = flatten(l);
      return {
        id: kumuId(l),
        label: valueText(fields.label),
        description: valueText(fields.description),
        connections: Array.isArray(l.connections) ? l.connections.map(valueText).filter(Boolean) : [],
      };
    });

  // Positions come from the default map (else the first).
  const main = maps.find((m) => m._id === doc.defaultMap) ?? maps[0];
  const positions: Record<string, KumuPosition> = {};
  for (const placed of records(main?.elements)) {
    const at = placed.position;
    const id = valueText(placed.element);
    if (id && isRecord(at) && finite(at.x) && finite(at.y))
      positions[id] = { x: at.x, y: at.y, pinned: placed.pinned === true };
  }

  const fieldNames: Record<string, string> = {};
  const metrics: string[] = [];
  for (const definition of records(doc.attributes)) {
    const field = valueText(definition.name);
    if (!field) continue;
    fieldNames[normalizeToken(field)] = field;
    if (definition.category === 'Metrics') metrics.push(normalizeToken(field));
  }

  const styled = (list: string, has: (r: KumuRecord) => boolean) =>
    maps.some((m) => records(m[list]).some(has));
  const ownStyle = (r: KumuRecord) => isRecord(r.style) && Object.keys(r.style).length > 0;
  const styling = [
    records(doc.perspectives).some((p) => valueText(p.style))
      ? "Kumu's perspectives (colours, sizes, filters)"
      : '',
    styled('elements', ownStyle) ? 'the look given to single elements' : '',
    styled('connections', ownStyle) ? 'the look given to single connections' : '',
    styled('connections', (c) => finite(c.curvature) && c.curvature !== 0) ? 'connection curves' : '',
    styled('loops', (l) => isRecord(l.position)) ? 'where loop labels sit' : '',
  ].filter(Boolean);

  return {
    layout: maps.length ? 'export' : 'blueprint',
    elements: elements.map(flatten),
    connections: connections.map(flatten),
    loops,
    unreadLoops: 0,
    name: valueText(doc.name),
    description: valueText(doc.description),
    maps: maps.length,
    ...(main ? { map: { name: valueText(main.name), positions } } : {}),
    fieldNames,
    metrics,
    offMap: {
      elements: allElements.length - elements.length,
      connections: allConnections
        .filter((c) => !connections.includes(c))
        .map((c) => `${name(c.from)} → ${name(c.to)}`),
      loops: allLoops.length - loops.length,
    },
    styling,
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
    layout: 'spreadsheet',
    elements: sheet('elements'),
    connections: sheet('connections'),
    loops: [],
    unreadLoops: loops ? Math.max(0, tableWithHeader(loops).rows.length) : 0,
    name: '',
    description: '',
    maps: 0,
    fieldNames: {},
    metrics: [],
    offMap: { elements: 0, connections: [], loops: 0 },
    styling: [],
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
  delay: ['delayed'],
  reversed: ['reversed'],
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

/** Fields in Kumu's own order, as its spreadsheets have them: label, type, tags, description, then by name. */
const FIRST = ['label', 'type', 'element type', 'connection type', 'tags', 'description'];

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Kumu draws a map around (0, 0) at its own scale; a Loopweft map fills a view of about 1920 × 1080 (see
 * `layout.positions`), where the automatic layouts work too. Kumu's places are moved and scaled, the same
 * across as down, to fill that view: the map keeps its shape, and a layout can work around its pins.
 */
const VIEW = { left: 160, top: 120, width: 1600, height: 840 };

function intoView(points: readonly KumuPosition[]): (p: KumuPosition) => { x: number; y: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const scale =
    spanX === 0 && spanY === 0
      ? 1
      : Math.min(spanX ? VIEW.width / spanX : Infinity, spanY ? VIEW.height / spanY : Infinity);
  const offsetX = VIEW.left + (VIEW.width - spanX * scale) / 2 - minX * scale;
  const offsetY = VIEW.top + (VIEW.height - spanY * scale) / 2 - minY * scale;
  return (p) => ({ x: Math.round(p.x * scale + offsetX), y: Math.round(p.y * scale + offsetY) });
}

/** The links of a loop in order round it, or null unless they close one loop, each link once. */
function closedLoop(project: Project, ids: readonly string[]): string[] | null {
  const byId = new Map(project.links.map((l) => [l.id, l]));
  const links = ids.map((id) => byId.get(id));
  if (links.length === 0 || new Set(ids).size !== ids.length) return null;
  const leaving = new Map<string, Link>();
  for (const link of links) {
    if (!link || leaving.has(link.from)) return null;
    leaving.set(link.from, link);
  }
  const first = links[0] as Link;
  const ordered: string[] = [];
  let at = first;
  for (let i = 0; i < links.length; i++) {
    ordered.push(at.id);
    const next = leaving.get(at.to);
    if (!next) return null;
    at = next;
  }
  return at === first && new Set(ordered).size === links.length ? ordered : null;
}

export function importKumu(data: KumuData, options: KumuOptions): ImportOutcome {
  const builder = new ProjectBuilder(options.title, data.description || undefined);
  const display = (key: string) => data.fieldNames[normalizeToken(key)] ?? key;
  const order = (keys: readonly string[]) => {
    const rank = (key: string) => {
      const at = FIRST.indexOf(normalizeToken(key));
      return at < 0 ? FIRST.length : at;
    };
    return [...keys].sort((a, b) => rank(a) - rank(b) || compareStrings(display(a), display(b)));
  };
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

  // A field becomes a custom field when it holds a value: Kumu's spreadsheets give both sheets every column.
  const custom = (
    records: readonly KumuRecord[],
    keys: readonly string[],
    appliesTo: 'variables' | 'links',
  ) =>
    order(keys.filter((key) => records.some((r) => valueText(r[key])))).map((key) => ({
      key,
      field: builder.field({
        name: display(key),
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
    const where = `element ${index + 1}`;
    if (!get('label')) {
      builder.problem(
        where,
        `The element has no label${get('id') ? ` (Kumu id ${get('id')})` : ''}: give it one in Kumu.`,
      );
      return;
    }
    const fields = Object.fromEntries(
      elementCustom.map(({ key, field }) => [field.id, valueText(element[key])]),
    );
    const id = builder.variable(
      { label: get('label'), category: get('category'), definition: get('definition'), fields },
      `${where} (${get('label')})`,
    );
    if (id && get('id')) ids.set(get('id'), id);
  });

  let placed = 0;
  let pinned = 0;
  if (data.map) {
    const places = [...ids].flatMap(([kumu, id]) => {
      const at = data.map?.positions[kumu];
      return at ? [{ id, at }] : [];
    });
    const view = intoView(places.map((p) => p.at));
    for (const { id, at } of places) {
      builder.project.layout.positions[id] = { ...view(at), ...(at.pinned ? { pinned: true } : {}) };
      placed++;
      if (at.pinned) pinned++;
    }
  }

  let undirected = 0;
  let mutual = 0;
  let noDirection = 0;
  let reversed = 0;
  let delayed = 0;
  let rationales = 0;
  const linksOf = new Map<string, string[]>();
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
    // Kumu's direction menu can reverse a connection: its arrow then runs from To to From.
    const turned = readBoolean(get('reversed') || 'false');
    if (turned.kind !== 'ok') {
      builder.problem(`${where}, reversed`, `reversed must be true or false, not "${get('reversed')}".`);
      return;
    }
    const reverse = turned.value && direction !== 'mutual';
    if (reverse) reversed++;
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
    const made: string[] = [];
    for (const to of targets.length ? targets : ['']) {
      const pairs =
        direction === 'mutual'
          ? [
              [get('from'), to],
              [to, get('from')],
            ]
          : reverse
            ? [[to, get('from')]]
            : [[get('from'), to]];
      for (const [from, target] of pairs) {
        const id = builder.link(
          {
            from: end(from as string),
            to: end(target as string),
            sign,
            ...(typesAreSigns ? {} : { type: get('type') }),
            delay: get('delay'),
            rationale: get('rationale'),
            weight: get('weight'),
            fields,
          },
          where,
        );
        if (id) made.push(id);
      }
    }
    if (direction === 'mutual') mutual++;
    if (made.some((id) => builder.project.links.find((l) => l.id === id)?.delay)) delayed++;
    if (made.length && get('rationale')) rationales++;
    if (get('id')) linksOf.set(get('id'), made);
  });

  const outcome = builder.finish();
  let project = outcome.project;
  const notes = [...outcome.notes];
  const read = { export: 'JSON export', blueprint: 'JSON blueprint', spreadsheet: 'spreadsheet' }[
    data.layout
  ];
  const shownBy =
    data.layout !== 'export'
      ? ''
      : data.maps === 1 && data.map
        ? ` that its map "${data.map.name}" shows`
        : ` that its ${data.maps} maps show`;
  notes.push(
    `Read Kumu's ${read}: the ${count(data.elements.length, 'element')} and ${count(data.connections.length, 'connection')}${shownBy}.`,
  );
  const off = data.offMap;
  if (off.elements || off.connections.length || off.loops) {
    const what = [
      off.elements ? count(off.elements, 'element') : '',
      off.connections.length
        ? `${count(off.connections.length, 'connection')} (${off.connections.slice(0, 5).join('; ')}${off.connections.length > 5 ? `; and ${off.connections.length - 5} more` : ''})`
        : '',
      off.loops ? count(off.loops, 'loop') : '',
    ].filter(Boolean);
    notes.push(
      `Left out what the export keeps but no map shows (Kumu keeps what is removed from a map): ${what.join(', ')}.`,
    );
  }
  if (project.types.categories.length) notes.push("Kumu's element types became categories.");
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
    notes.push(`Left out ${count(undirected, 'undirected connection')}: a causal link needs a direction.`);
  if (noDirection)
    notes.push(
      `${noDirection} connection${noDirection === 1 ? ' gives' : 's give'} no direction: read as directed, from → to.`,
    );
  if (reversed)
    notes.push(
      `${count(reversed, 'connection is', 'connections are')} reversed in Kumu: ${reversed === 1 ? 'its link runs' : 'their links run'} from its To to its From, the way Kumu draws ${reversed === 1 ? 'it' : 'them'}.`,
    );
  if (delayed)
    notes.push(
      `${count(delayed, 'delayed connection')} became ${delayed === 1 ? 'a delayed link' : 'delayed links'}.`,
    );
  if (rationales) notes.push("Kumu's connection descriptions became the links' rationales.");
  const kept = [...elementCustom, ...connectionCustom];
  if (kept.length)
    notes.push(`Kept as custom fields: ${[...new Set(kept.map((c) => `"${c.field.name}"`))].join(', ')}.`);
  const metrics = [
    ...new Set(kept.filter((c) => data.metrics.includes(normalizeToken(c.key))).map((c) => c.field.name)),
  ];
  if (metrics.length)
    notes.push(
      `Of these, Kumu computed ${metrics.map((m) => `"${m}"`).join(', ')}: they describe the map as it was in Kumu, and do not change when it changes.`,
    );

  // Kumu's loops become named loops when their connections close one loop.
  const named: string[] = [];
  const mismatched: string[] = [];
  for (const loop of data.loops) {
    const called = loop.label ? `"${loop.label}"` : `${loop.id || 'without a label'}`;
    const leaveOut = (why: string) => notes.push(`Left out Kumu's loop ${called}: ${why}.`);
    if (!loop.label) {
      leaveOut('it has no label to name it by');
      continue;
    }
    const links = loop.connections.map((c) => linksOf.get(c));
    if (links.some((l) => l === undefined || l.length !== 1)) {
      leaveOut('a connection of it is not one link here');
      continue;
    }
    const ordered = closedLoop(
      project,
      links.map((l) => (l as string[])[0] as string),
    );
    if (!ordered) {
      leaveOut('its connections do not make one closed loop');
      continue;
    }
    try {
      const out = addLoop(project, {
        name: loop.label,
        links: ordered,
        ...(loop.description ? { description: loop.description } : {}),
      });
      project = out.project;
      named.push(out.result.id);
      const said = /^\s*([RB])\s*\d*\s*$/i.exec(loop.label)?.[1]?.toUpperCase();
      if (said && out.result.polarity !== '?' && said !== out.result.polarity)
        mismatched.push(
          `${out.result.id} ("${loop.label}") is ${out.result.polarity === 'R' ? 'reinforcing' : 'balancing'}`,
        );
    } catch (error) {
      if (!(error instanceof OpError)) throw error;
      leaveOut(error.message.replace(/\.$/, ''));
    }
  }
  if (named.length)
    notes.push(
      `Named ${count(named.length, 'loop')} from Kumu's loops, by their labels: ${named.join(', ')}.`,
    );
  if (mismatched.length)
    notes.push(
      `By their links' signs, ${mismatched.join('; ')}, whatever the label says: check the label or the signs.`,
    );
  if (data.unreadLoops)
    notes.push(
      `Left out ${count(data.unreadLoops, 'Kumu loop')}: Loopweft finds the loops from the links, and they can be named again.`,
    );

  if (data.map) {
    const others = data.elements.length > placed ? '; the others are laid out automatically' : '';
    notes.push(
      placed
        ? `Placed ${count(placed, 'variable')} where the map "${data.map.name}" draws ${placed === 1 ? 'it' : 'them'}, scaled to fill Loopweft's view${pinned ? ` (${pinned} pinned)` : ''}${others}.`
        : `The map "${data.map.name}" fixes no element's place: the map is laid out automatically.`,
    );
    if (data.maps > 1) notes.push(`The export has ${data.maps} maps: the places come from its default map.`);
  } else {
    notes.push(
      `Kumu's ${data.layout === 'spreadsheet' ? 'spreadsheets' : 'blueprints'} hold no positions: the map is laid out automatically.`,
    );
  }
  if (data.styling.length)
    notes.push(
      `Not carried across: ${data.styling.join(', ')}. Loopweft draws the map in its own look (the Look panel).`,
    );
  return { project, notes };
}
