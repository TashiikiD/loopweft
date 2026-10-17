// Source: DataViz packages/normalize/src/shorthand.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted for
// Loopweft. parseShorthand is DataViz's parser with Loopweft's field names (`strength=` sets `weight`;
// there is no `label=`, since links have no label). applyShorthand is rewritten for the .loopweft model:
// it adds variables and links, and `@group` sets categories.

import { ensureValid, type OpOutput, parseElement, plural } from './ops/support.ts';
import { elementIds } from './refs.ts';
import {
  type Category,
  type Field,
  type FieldValue,
  type Link,
  LinkSchema,
  type Project,
  type Variable,
  VariableSchema,
} from './schema.ts';
import { nextSequentialId, slugify, uniqueId } from './text/ids.ts';
import { editDistanceRatio } from './text/similarity.ts';
import { cleanText, readBoolean, readNumber } from './text/values.ts';
import {
  CONFIDENCE_VOCABULARY,
  normalizeToken,
  resolveVocabularyValue,
  SIGN_VOCABULARY,
} from './text/vocabulary.ts';

export type ShorthandSign = '+' | '-' | '?';

export interface ShorthandRelation {
  line: number;
  from: string;
  to: string;
  sign: ShorthandSign;
  /** False when the line gave no sign (recorded as `?`). */
  signGiven: boolean;
  delay?: boolean;
  delayLabel?: string;
  /** As written (e.g. M); read against the confidence vocabulary when applied. */
  confidence?: string;
  weight?: number;
  /** `column=value` items naming other link fields, by key or name; resolved when applied. */
  cells?: ShorthandCell[];
}

export interface ShorthandCell {
  /** The field as written: a key (`type`, `evidence`) or a name (`Evidence`). */
  name: string;
  /** The value as text; it is read for its field when applied. */
  value: string;
  /** 1-based position of the item in its line. */
  column: number;
}

/** A short form used on a line (`conf=`, `weight=`, ...), with the field it sets. */
export interface ShorthandForm {
  line: number;
  column: number;
  /** As written, e.g. `weight`. */
  name: string;
  /** The field it sets, e.g. `weight`. */
  key: string;
}

export interface ShorthandGroup {
  line: number;
  name: string;
  members: string[];
}

export interface ShorthandIssue {
  severity: 'error' | 'warning';
  /** 1-based. */
  line: number;
  /** 1-based character position in the line. */
  column: number;
  message: string;
}

export interface ShorthandParse {
  relations: ShorthandRelation[];
  groups: ShorthandGroup[];
  issues: ShorthandIssue[];
  /** Short forms used, so a project whose custom fields share their names can ask which is meant. */
  forms: ShorthandForm[];
}

const SIGNS = SIGN_VOCABULARY;

/** Splits on `separator` outside double quotes; reports each part with its start offset. */
function splitOutsideQuotes(text: string, separator: string): { part: string; offset: number }[] {
  const parts: { part: string; offset: number }[] = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (!quoted && text[i] === separator) {
      parts.push({ part: text.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  parts.push({ part: text.slice(start), offset: start });
  return parts;
}

/** Text with surrounding quotes removed and whitespace cleaned. */
const unquote = (text: string): string => {
  const t = text.trim();
  return cleanText(t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t);
};

/** Positions of arrows (`->`, `-->`, `→`) outside quotes. */
function findArrows(line: string): { at: number; length: number }[] {
  const arrows: { at: number; length: number }[] = [];
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === '→') arrows.push({ at: i, length: 1 });
    else if (line.startsWith('-->', i)) {
      arrows.push({ at: i, length: 3 });
      i += 2;
    } else if (line.startsWith('->', i)) {
      arrows.push({ at: i, length: 2 });
      i += 1;
    }
  }
  return arrows;
}

/** Index of the `(` matching a final `)`, outside quotes, or -1. */
function trailingGroupStart(text: string): number {
  if (!text.endsWith(')')) return -1;
  let depth = 0;
  let quoted = false;
  for (let i = text.length - 1; i >= 0; i--) {
    const char = text[i];
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === ')') depth++;
    if (char === '(') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

type Attributes = Omit<ShorthandRelation, 'line' | 'from' | 'to' | 'signGiven' | 'sign' | 'cells'> & {
  sign?: ShorthandSign;
  cells?: { name: string; value: string; offset: number }[];
};

/** The field each short form sets. (DataViz's `label=` is not one: Loopweft links have no label.) */
const FORMS: Record<string, string> = {
  sign: 'sign',
  delay: 'delay',
  conf: 'confidence',
  confidence: 'confidence',
  strength: 'weight',
  weight: 'weight',
};

/**
 * Parses `+, delay "5 yrs", conf=M, evidence=explicit`. Unrecognized items are returned so the caller can
 * decide.
 */
function parseAttributes(text: string): {
  attributes: Attributes;
  unknown: { item: string; offset: number }[];
  errors: { message: string; offset: number }[];
  forms: { name: string; key: string; offset: number }[];
  recognized: number;
} {
  const attributes: Attributes = {};
  const unknown: { item: string; offset: number }[] = [];
  const errors: { message: string; offset: number }[] = [];
  const forms: { name: string; key: string; offset: number }[] = [];
  let recognized = 0;
  for (const { part, offset } of splitOutsideQuotes(text, ',')) {
    const item = part.trim();
    const at = offset + (part.length - part.trimStart().length);
    if (!item) continue;
    const sign = resolveVocabularyValue(SIGNS, item);
    if (sign) {
      recognized++;
      if (attributes.sign !== undefined) errors.push({ message: 'More than one sign given.', offset: at });
      attributes.sign = sign.value as ShorthandSign;
      continue;
    }
    const delay = /^delay(?:\s*[=:]\s*|\s+|$)(.*)$/is.exec(item);
    if (delay) {
      recognized++;
      if (forms.some((f) => f.key === 'delay')) errors.push({ message: 'delay is set twice.', offset: at });
      forms.push({ name: 'delay', key: 'delay', offset: at });
      attributes.delay = true;
      const label = unquote(delay[1] ?? '');
      if (label) attributes.delayLabel = label;
      continue;
    }
    const pair = /^(sign|conf|confidence|strength|weight)\s*[=:]\s*(.+)$/is.exec(item);
    if (pair) {
      recognized++;
      const key = (pair[1] as string).toLowerCase();
      const value = unquote(pair[2] as string);
      const target = FORMS[key] as string;
      // Two signs get their own message below.
      if (target !== 'sign' && forms.some((f) => f.key === target)) {
        errors.push({ message: `${target} is set twice.`, offset: at });
      }
      forms.push({ name: key, key: target, offset: at });
      if (key === 'conf' || key === 'confidence') attributes.confidence = value;
      else if (key === 'sign') {
        const given = resolveVocabularyValue(SIGNS, value);
        if (!given) errors.push({ message: `sign must be +, - or ?, got "${value}".`, offset: at });
        else if (attributes.sign !== undefined)
          errors.push({ message: 'More than one sign given.', offset: at });
        else attributes.sign = given.value as ShorthandSign;
      } else {
        const reading = readNumber(value);
        if (reading.kind === 'ok') attributes.weight = reading.value;
        else errors.push({ message: `${key} must be a number, got "${value}".`, offset: at });
      }
      continue;
    }
    // Any other field, by key or name: `type=cascade`, `Evidence: explicit`.
    const cell = /^([\p{L}\p{N}_][\p{L}\p{N}_. -]*?)\s*[=:]\s*(.*)$/su.exec(item);
    if (cell) {
      recognized++;
      const name = (cell[1] as string).trim();
      const value = unquote(cell[2] as string);
      if (!value) errors.push({ message: `${name} has no value; write ${name}=<value>.`, offset: at });
      else attributes.cells = [...(attributes.cells ?? []), { name, value, offset: at }];
      continue;
    }
    unknown.push({ item, offset: at });
  }
  return { attributes, unknown, errors, forms, recognized };
}

/**
 * Parses the text shorthand:
 *
 *     Births -> Population (+)
 *     Population -> Deaths (+, delay "5 yrs")
 *     Fertility -> Births (?, conf=M)
 *     @group social: Births, Population
 *     # comment
 *
 * Arrows: `->`, `-->`, `→`. Labels may be quoted to contain arrows, commas or brackets. A trailing
 * bracket that holds no recognized item is part of the label (e.g. `Temperature (Celsius)`).
 */
export function parseShorthand(text: string): ShorthandParse {
  const result: ShorthandParse = { relations: [], groups: [], issues: [], forms: [] };
  const issue = (severity: ShorthandIssue['severity'], line: number, column: number, message: string) =>
    result.issues.push({ severity, line, column, message });

  text.split(/\r\n?|\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    const indent = raw.length - raw.trimStart().length;
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    if ((raw.match(/"/g) ?? []).length % 2 === 1) {
      issue('error', line, raw.lastIndexOf('"') + 1, 'Unterminated quote.');
      return;
    }

    const group = /^@group\s+(.+?)\s*:\s*(.*)$/i.exec(trimmed);
    if (group) {
      const name = unquote(group[1] as string);
      const members = splitOutsideQuotes(group[2] as string, ',')
        .map(({ part }) => unquote(part))
        .filter(Boolean);
      if (!name) issue('error', line, indent + 1, 'A group needs a name: @group <name>: A, B.');
      else if (members.length === 0) issue('error', line, indent + 1, `Group "${name}" lists no members.`);
      else result.groups.push({ line, name, members });
      return;
    }
    if (/^@group\b/i.test(trimmed)) {
      issue('error', line, indent + 1, 'Write groups as "@group <name>: A, B".');
      return;
    }
    if (trimmed.startsWith('@')) {
      issue(
        'error',
        line,
        indent + 1,
        `Unknown directive "${trimmed.split(/\s/)[0]}"; only @group is supported.`,
      );
      return;
    }

    const arrows = findArrows(raw);
    if (arrows.length === 0) {
      issue('error', line, indent + 1, 'Expected a relation such as "A -> B (+)".');
      return;
    }
    if (arrows.length > 1) {
      issue(
        'error',
        line,
        (arrows[1] as { at: number }).at + 1,
        'Only one arrow per line; split chains into separate lines.',
      );
      return;
    }
    const arrow = arrows[0] as { at: number; length: number };
    const from = unquote(raw.slice(0, arrow.at));
    let rest = raw.slice(arrow.at + arrow.length);
    const restStart = arrow.at + arrow.length;
    let attributes: Omit<Attributes, 'cells'> = {};
    let cells: ShorthandCell[] = [];
    const open = trailingGroupStart(rest.trimEnd());
    if (open >= 0) {
      const inside = rest.trimEnd().slice(open + 1, -1);
      const parsed = parseAttributes(inside);
      const at = (offset: number) => restStart + open + 2 + offset;
      if (parsed.recognized > 0) {
        for (const unknown of parsed.unknown) {
          issue(
            'error',
            line,
            at(unknown.offset),
            `Unknown item "${unknown.item}" (use a sign, delay, conf=, weight= or field=value).`,
          );
        }
        for (const error of parsed.errors) issue('error', line, at(error.offset), error.message);
        for (const form of parsed.forms) {
          result.forms.push({ line, column: at(form.offset), name: form.name, key: form.key });
        }
        const { cells: written = [], ...others } = parsed.attributes;
        attributes = others;
        cells = written.map(({ offset, ...cell }) => ({ ...cell, column: at(offset) }));
        rest = rest.trimEnd().slice(0, open);
      }
    }
    const to = unquote(rest);
    if (!from) issue('error', line, indent + 1, 'The relation has no cause before the arrow.');
    if (!to) issue('error', line, arrow.at + arrow.length + 1, 'The relation has no effect after the arrow.');
    if (!from || !to) return;
    const { sign, ...others } = attributes;
    if (sign === undefined)
      issue('warning', line, arrow.at + 1, `No sign given for ${from} -> ${to}; recorded as unknown (?).`);
    result.relations.push({
      line,
      from,
      to,
      sign: sign ?? '?',
      signGiven: sign !== undefined,
      ...others,
      ...(cells.length ? { cells } : {}),
    });
  });
  return result;
}

export class ShorthandError extends Error {
  override name = 'ShorthandError';
  readonly issues: ShorthandIssue[];

  constructor(issues: ShorthandIssue[]) {
    super(issues.map((i) => `line ${i.line}, column ${i.column}: ${i.message}`).join('\n'));
    this.issues = issues;
  }
}

export interface ShorthandResult {
  parse: ShorthandParse;
  addedVariables: string[];
  addedLinks: string[];
  /** Existing variables the text named. */
  matchedVariables: string[];
  addedCategories: string[];
  /** The parse's warnings, e.g. a link written without a sign (recorded as ?). */
  warnings: ShorthandIssue[];
}

/** Link fields an item may set, besides custom fields. */
const LINK_FIELDS = [
  'sign',
  'type',
  'conditional',
  'delay',
  'delayLabel',
  'confidence',
  'weight',
  'rationale',
];

/** Items that cannot set a link field, and what to write instead. */
const STRUCTURAL: Record<string, string> = {
  id: 'A link id is assigned automatically.',
  from: 'from comes from the arrow; write "A -> B".',
  to: 'to comes from the arrow; write "A -> B".',
  citations: 'Citations cannot be written in shorthand; cite sources separately.',
  fields: 'Write custom fields by their own key, e.g. evidence=explicit.',
  // DataViz's label= has no Loopweft counterpart.
  label: 'Loopweft links have no label; write rationale="..." to say why the link holds.',
};

interface Column {
  key: string;
  /** Set for a custom field. */
  field?: Field;
}

/** The keys spelt closest to `name` (at most a third of it differs), for "did you mean". */
function closestKeys(name: string, candidates: readonly { key: string; label: string }[]): string[] {
  const token = normalizeToken(name);
  const near = candidates
    .map((d) => ({
      key: d.key,
      distance: Math.min(
        editDistanceRatio(token, normalizeToken(d.key)),
        editDistanceRatio(token, normalizeToken(d.label)),
      ),
    }))
    .filter((d) => d.distance <= 1 / 3)
    .sort((a, b) => a.distance - b.distance || (a.key < b.key ? -1 : 1));
  const best = near[0]?.distance ?? 0;
  return [...new Set(near.filter((d) => d.distance <= best + 0.1).map((d) => d.key))].slice(0, 3);
}

/** Custom fields a link may carry. */
const linkFields = (project: Project): Field[] =>
  project.types.fields.filter((f) => (f.appliesTo ?? 'both') !== 'variables');

/** The link field an item names: a built-in by key, else a custom field by id, else by a name only one has. */
function resolveColumn(name: string, project: Project): Column | { error: string } {
  const token = normalizeToken(name);
  const structural = Object.keys(STRUCTURAL).find((k) => normalizeToken(k) === token);
  if (structural) return { error: STRUCTURAL[structural] as string };
  const fields = linkFields(project);
  const builtIn = LINK_FIELDS.find((k) => normalizeToken(k) === token);
  const byKey = fields.find((f) => f.id === name) ?? fields.find((f) => normalizeToken(f.id) === token);
  const byName = fields.filter((f) => normalizeToken(f.name) === token);
  const custom = byKey ? [byKey] : byName;
  if (builtIn && custom.length) {
    return {
      error: `"${name}" names the built-in ${builtIn} and the custom field ${custom.map((f) => f.id).join(', ')}; write the custom field's key, or rename it.`,
    };
  }
  if (builtIn) return { key: builtIn };
  if (custom.length > 1) {
    return {
      error: `"${name}" names ${custom.length} fields (${custom.map((f) => f.id).join(', ')}); write the key of the one you mean.`,
    };
  }
  const [field] = custom;
  if (field) return { key: field.id, field };
  const near = closestKeys(name, [
    ...LINK_FIELDS.map((k) => ({ key: k, label: k })),
    ...fields.map((f) => ({ key: f.id, label: f.name })),
  ]);
  return {
    error: `Links have no field "${name}"${near.length ? `; did you mean ${near.join(', ')}?` : '.'}`,
  };
}

const choiceText = (names: string[]) => names.map((n) => `"${n}"`).join(', ');

/** Reads an item's text as a value of its field; an unreadable value is an error, never a guess. */
function readValue(column: Column, raw: string, project: Project): { value: FieldValue } | { error: string } {
  const text = cleanText(raw);
  const kind = column.field?.kind ?? column.key;
  const asNumber = (): { value: FieldValue } | { error: string } => {
    const reading = readNumber(text);
    if (reading.kind === 'ok') {
      if (column.key === 'weight' && reading.value < 0)
        return { error: `weight must be 0 or more, got "${text}".` };
      return { value: reading.value };
    }
    if (reading.kind === 'ambiguous') {
      return { error: `${column.key} must be a plain number; "${text}" could be read more than one way.` };
    }
    return { error: `${column.key} must be a number, got "${text}".` };
  };
  const asBoolean = (): { value: FieldValue } | { error: string } => {
    const reading = readBoolean(text);
    return reading.kind === 'ok'
      ? { value: reading.value }
      : { error: `${column.key} must be true or false (yes or no), got "${text}".` };
  };
  const fromList = (options: { id: string; name: string }[]): { value: FieldValue } | { error: string } => {
    const token = normalizeToken(text);
    const found =
      options.find((o) => o.id === text) ??
      options.find((o) => normalizeToken(o.id) === token || normalizeToken(o.name) === token);
    return found
      ? { value: found.id }
      : { error: `${column.key} must be one of ${choiceText(options.map((o) => o.id))}, got "${text}".` };
  };
  switch (kind) {
    case 'sign': {
      const sign = resolveVocabularyValue(SIGN_VOCABULARY, text);
      return sign ? { value: sign.value } : { error: `sign must be +, - or ?, got "${text}".` };
    }
    case 'confidence': {
      const confidence = resolveVocabularyValue(CONFIDENCE_VOCABULARY, text);
      return confidence
        ? { value: confidence.value }
        : { error: `confidence must be low, medium or high, got "${text}".` };
    }
    case 'type':
      return fromList(project.types.linkTypes);
    case 'conditional':
    case 'delay':
    case 'boolean':
      return asBoolean();
    case 'weight':
    case 'number':
      return asNumber();
    case 'choice':
      return fromList(column.field?.options ?? []);
    default:
      return text ? { value: text } : { error: `${column.key} has no value.` };
  }
}

/**
 * Adds the links (and categories) written in shorthand. Endpoints match existing variables by id or label
 * (ignoring case and spacing); new names become variables. `field=value` items set other link fields
 * (`type`, `conditional`, `rationale`, `delayLabel`, or a custom field by key or by a name only one field
 * has), read strictly for their kind. `@group name: A, B` puts variables in a category, made if it does not
 * exist. A name matching several variables or fields, an unknown field, an unreadable value, a field set
 * twice and a link that already exists are errors. Nothing changes if the text has errors; every error is
 * reported at once, as a ShorthandError.
 */
export function applyShorthand(project: Project, text: string): OpOutput<ShorthandResult> {
  const parse = parseShorthand(text);
  const errors = parse.issues.filter((i) => i.severity === 'error');
  const error = (line: number, column: number, message: string) =>
    errors.push({ severity: 'error', line, column, message });

  const next: Project = structuredClone(project);
  const taken = elementIds(project);
  const addedVariables: string[] = [];
  const addedLinks: string[] = [];
  const addedCategories: string[] = [];
  const matched = new Set<string>();

  // A short form whose name a custom field also has would silently pick one of the two.
  for (const form of parse.forms) {
    const token = normalizeToken(form.name);
    const shared = linkFields(project).filter(
      (f) => normalizeToken(f.name) === token || normalizeToken(f.id) === token,
    );
    if (shared.length) {
      const names = shared.map((f) => `"${f.name}" (${f.id})`).join(', ');
      error(
        form.line,
        form.column,
        `"${form.name}" is short for ${form.key}, but the custom field ${names} has that name too; write ${shared.map((f) => `${f.id}=`).join(' or ')} for the custom field, or rename it.`,
      );
    }
  }

  const resolve = (name: string, line: number): Variable | null => {
    const exact = next.variables.find((v) => v.id === name);
    const token = normalizeToken(name);
    const matches = exact
      ? [exact]
      : next.variables.filter((v) => normalizeToken(v.label) === token || normalizeToken(v.id) === token);
    if (matches.length > 1) {
      const ids = matches.map((v) => v.id).join(', ');
      error(
        line,
        1,
        `"${name}" matches ${matches.length} variables (${ids}); write the id of the one you mean.`,
      );
      return null;
    }
    const [found] = matches;
    if (found) {
      if (!addedVariables.includes(found.id)) matched.add(found.id);
      return found;
    }
    const id = uniqueId(slugify(name), taken, 'variable');
    taken.add(id);
    const variable = parseElement(VariableSchema, { id, label: name }, ['variables', next.variables.length]);
    next.variables.push(variable);
    addedVariables.push(id);
    return variable;
  };

  const signed = new Set<number>();
  for (const relation of parse.relations) {
    const from = resolve(relation.from, relation.line);
    const to = resolve(relation.to, relation.line);
    const set = new Set<string>(relation.signGiven ? ['sign'] : []);
    for (const key of ['delay', 'delayLabel', 'confidence', 'weight'] as const) {
      if (relation[key] !== undefined) set.add(key);
    }
    const values: Record<string, FieldValue> = {};
    const custom: Record<string, FieldValue> = {};
    const formColumn = (key: string) =>
      parse.forms.find((f) => f.line === relation.line && f.key === key)?.column ?? 1;
    if (relation.confidence !== undefined) {
      const read = readValue({ key: 'confidence' }, relation.confidence, project);
      if ('error' in read) error(relation.line, formColumn('confidence'), read.error);
      else values.confidence = read.value;
    }
    if (relation.weight !== undefined && relation.weight < 0) {
      error(relation.line, formColumn('weight'), `weight must be 0 or more, got ${relation.weight}.`);
    }
    for (const cell of relation.cells ?? []) {
      const column = resolveColumn(cell.name, project);
      if ('error' in column) {
        error(relation.line, cell.column, column.error);
        continue;
      }
      if (set.has(column.key)) {
        error(relation.line, cell.column, `${column.key} is set twice.`);
        continue;
      }
      set.add(column.key);
      const read = readValue(column, cell.value, project);
      if ('error' in read) error(relation.line, cell.column, read.error);
      else if (column.field) custom[column.key] = read.value;
      else values[column.key] = read.value;
    }
    if (values.sign !== undefined) signed.add(relation.line);
    if (values.delayLabel !== undefined && !relation.delay && values.delay !== true) {
      error(relation.line, 1, `delayLabel needs a delay; write delay "${values.delayLabel}".`);
    }
    // A line with errors adds no link (so later lines are not blamed for repeating it).
    if (!from || !to || errors.some((e) => e.line === relation.line)) continue;
    const type = values.type as string | undefined;
    const twin = next.links.find(
      (l) => l.from === from.id && l.to === to.id && (l.type ?? '') === (type ?? ''),
    );
    if (twin) {
      error(
        relation.line,
        1,
        `${from.id} -> ${to.id} already exists as ${twin.id}; change that link instead.`,
      );
      continue;
    }
    const id = nextSequentialId('L', taken);
    taken.add(id);
    const candidate: Record<string, unknown> = {
      id,
      from: from.id,
      to: to.id,
      sign: values.sign ?? relation.sign,
      type,
      conditional: values.conditional,
      delay: relation.delay ?? values.delay,
      delayLabel: relation.delayLabel ?? values.delayLabel,
      confidence: values.confidence,
      weight: relation.weight ?? values.weight,
      rationale: values.rationale,
      fields: Object.keys(custom).length ? custom : undefined,
    };
    for (const key of Object.keys(candidate)) if (candidate[key] === undefined) delete candidate[key];
    const link: Link = parseElement(LinkSchema, candidate, ['links', next.links.length]);
    next.links.push(link);
    addedLinks.push(id);
  }

  for (const group of parse.groups) {
    const token = normalizeToken(group.name);
    let category: Category | undefined = next.types.categories.find(
      (c) => c.id === group.name || normalizeToken(c.id) === token || normalizeToken(c.name) === token,
    );
    if (!category) {
      const id = uniqueId(slugify(group.name), new Set(next.types.categories.map((c) => c.id)), 'category');
      category = { id, name: group.name };
      next.types.categories.push(category);
      addedCategories.push(id);
    }
    for (const member of group.members) {
      const variable = resolve(member, group.line);
      if (variable) variable.category = category.id;
    }
  }

  if (errors.length) {
    throw new ShorthandError(errors.sort((a, b) => a.line - b.line || a.column - b.column));
  }
  ensureValid(project, next);

  const warnings = parse.issues.filter((i) => i.severity === 'warning' && !signed.has(i.line));
  const parts = [
    plural(addedLinks.length, 'link'),
    plural(addedVariables.length, 'variable'),
    ...(addedCategories.length ? [plural(addedCategories.length, 'category', 'categories')] : []),
  ];
  return {
    project: next,
    result: {
      parse,
      addedVariables,
      addedLinks,
      matchedVariables: [...matched],
      addedCategories,
      warnings,
    },
    summary: `Added ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)} from shorthand.`,
  };
}
