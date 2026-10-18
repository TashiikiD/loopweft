// The table view's model: its columns, what each cell holds, and how typed or pasted text becomes edits.
// Text is read strictly, as the shorthand and the importers read it: anything that cannot be read stops the
// whole edit, and every problem is named. Every change is made by @loopweft/model's operations.
import {
  addLink,
  addType,
  addVariable,
  CONFIDENCE_VOCABULARY,
  cleanText,
  compareStrings,
  type Field,
  type FieldValue,
  type Issue,
  type Link,
  type LinkChanges,
  listing,
  normalizeToken,
  OpError,
  type OpOutput,
  type Project,
  plural,
  readBoolean,
  readFieldValue,
  readNumber,
  resolveType,
  resolveVariable,
  resolveVocabularyValue,
  SIGN_VOCABULARY,
  setLink,
  setVariable,
  signText,
  type Variable,
  type VariableChanges,
} from '@loopweft/model';

export type Shape = 'variables' | 'links';
export type Element = Variable | Link;

export interface TableColumn {
  key: string;
  name: string;
  /**
   * How a cell is edited: a line of text, text that may have line breaks, one of a list (`choices`; other
   * text is read too, such as the name of a new category), or not at all.
   */
  editor: 'text' | 'lines' | 'choice' | 'none';
  choices?: string[];
  /** Sorted as numbers. */
  numeric?: boolean;
  width: number;
}

/** One cell's new text. `row` is the element's place in its list; one past the end adds an element. */
export interface CellEdit {
  row: number;
  column: string;
  text: string;
}

export const elementsOf = (project: Project, shape: Shape): readonly Element[] =>
  shape === 'variables' ? project.variables : project.links;

const fieldsFor = (project: Project, shape: Shape) =>
  project.types.fields.filter((f) => (f.appliesTo ?? 'both') !== (shape === 'links' ? 'variables' : 'links'));

const fieldColumn = (field: Field): TableColumn => ({
  key: `field:${field.id}`,
  name: field.name,
  editor: field.kind === 'choice' || field.kind === 'boolean' ? 'choice' : 'text',
  ...(field.kind === 'choice' ? { choices: (field.options ?? []).map((o) => o.name) } : {}),
  ...(field.kind === 'boolean' ? { choices: ['yes', 'no'] } : {}),
  ...(field.kind === 'number' ? { numeric: true } : {}),
  width: 140,
});

/** The table's columns for variables or links: their own fields, then the map's custom fields. */
export function tableColumns(project: Project, shape: Shape): TableColumn[] {
  const names = (items: readonly { name: string }[]) => items.map((t) => t.name);
  if (shape === 'variables') {
    return [
      { key: 'id', name: 'Id', editor: 'none', width: 150 },
      { key: 'label', name: 'Name', editor: 'text', width: 220 },
      { key: 'mapLabel', name: 'Name on the map', editor: 'text', width: 170 },
      {
        key: 'category',
        name: 'Category',
        editor: 'choice',
        choices: names(project.types.categories),
        width: 160,
      },
      { key: 'role', name: 'Role', editor: 'choice', choices: names(project.types.roles), width: 130 },
      { key: 'definition', name: 'Definition', editor: 'lines', width: 320 },
      { key: 'size', name: 'Size', editor: 'choice', choices: ['normal', 'large'], width: 90 },
      ...fieldsFor(project, shape).map(fieldColumn),
    ];
  }
  const variables = project.variables.map((v) => v.label);
  return [
    { key: 'id', name: 'Id', editor: 'none', width: 80 },
    { key: 'from', name: 'From', editor: 'choice', choices: variables, width: 190 },
    { key: 'to', name: 'To', editor: 'choice', choices: variables, width: 190 },
    { key: 'sign', name: 'Sign', editor: 'choice', choices: ['+', '−', '?'], width: 70 },
    { key: 'type', name: 'Type', editor: 'choice', choices: names(project.types.linkTypes), width: 130 },
    { key: 'conditional', name: 'Conditional', editor: 'choice', choices: ['yes', 'no'], width: 105 },
    { key: 'delay', name: 'Delay', editor: 'choice', choices: ['yes', 'no'], width: 80 },
    { key: 'delayLabel', name: 'How long', editor: 'text', width: 110 },
    {
      key: 'confidence',
      name: 'Confidence',
      editor: 'choice',
      choices: ['low', 'medium', 'high'],
      width: 110,
    },
    { key: 'weight', name: 'Weight', editor: 'text', numeric: true, width: 80 },
    { key: 'rationale', name: 'Rationale', editor: 'lines', width: 320 },
    ...fieldsFor(project, shape).map(fieldColumn),
  ];
}

function fieldText(field: Field, value: FieldValue | undefined): string {
  if (value === undefined) return '';
  if (field.kind === 'boolean') return value ? 'yes' : 'no';
  if (field.kind === 'choice') return field.options?.find((o) => o.id === value)?.name ?? String(value);
  return String(value);
}

const nameOf = (items: readonly { id: string; name: string }[], id: string | undefined) =>
  id === undefined ? '' : (items.find((t) => t.id === id)?.name ?? id);

/**
 * What a cell holds, as text: what its editor starts with and what is copied. A line break in a name on
 * the map is written \n, as on the command line.
 */
export function cellValue(project: Project, shape: Shape, element: Element, key: string): string {
  if (key.startsWith('field:')) {
    const field = project.types.fields.find((f) => `field:${f.id}` === key);
    return field ? fieldText(field, element.fields?.[field.id]) : '';
  }
  if (shape === 'variables') {
    const v = element as Variable;
    switch (key) {
      case 'id':
        return v.id;
      case 'label':
        return v.label;
      case 'mapLabel':
        return (v.mapLabel ?? '').replace(/\n/g, '\\n');
      case 'category':
        return nameOf(project.types.categories, v.category);
      case 'role':
        return nameOf(project.types.roles, v.role);
      case 'definition':
        return v.definition ?? '';
      case 'size':
        return v.size ?? '';
      default:
        return '';
    }
  }
  const l = element as Link;
  const label = (id: string) => project.variables.find((v) => v.id === id)?.label ?? id;
  switch (key) {
    case 'id':
      return l.id;
    case 'from':
      return label(l.from);
    case 'to':
      return label(l.to);
    case 'sign':
      return signText(l.sign);
    case 'type':
      return nameOf(project.types.linkTypes, l.type);
    case 'conditional':
      return l.conditional ? 'yes' : '';
    case 'delay':
      return l.delay ? 'yes' : '';
    case 'delayLabel':
      return l.delayLabel ?? '';
    case 'confidence':
      return l.confidence ?? '';
    case 'weight':
      return l.weight === undefined ? '' : String(l.weight);
    case 'rationale':
      return l.rationale ?? '';
    default:
      return '';
  }
}

/** What a cell shows: its text on one line. */
export const cellText = (project: Project, shape: Shape, element: Element, key: string): string =>
  cellValue(project, shape, element, key).replace(/\s*\n\s*/g, ' ');

export interface RowOrder {
  key: string;
  direction: 'ASC' | 'DESC';
}

/** The places of the elements shown, in the order shown: those matching a search, perhaps sorted. */
export function visibleRows(
  project: Project,
  shape: Shape,
  columns: readonly TableColumn[],
  options: { search?: string; sort?: RowOrder | undefined },
): number[] {
  const elements = elementsOf(project, shape);
  const token = normalizeToken(options.search ?? '');
  let rows = elements.map((_, i) => i);
  if (token) {
    rows = rows.filter((i) =>
      columns.some((c) =>
        normalizeToken(cellText(project, shape, elements[i] as Element, c.key)).includes(token),
      ),
    );
  }
  const sort = options.sort;
  const column = sort && columns.find((c) => c.key === sort.key);
  if (sort && column) {
    const keyed = rows.map((i) => ({
      i,
      text: cellText(project, shape, elements[i] as Element, column.key),
    }));
    const order = sort.direction === 'ASC' ? 1 : -1;
    keyed.sort((a, b) => {
      // Empty cells go last whichever way the column is sorted.
      if (!a.text || !b.text) return a.text === b.text ? a.i - b.i : a.text ? -1 : 1;
      const byValue = column.numeric
        ? Number(a.text) - Number(b.text)
        : compareStrings(normalizeToken(a.text), normalizeToken(b.text));
      return byValue * order || a.i - b.i;
    });
    rows = keyed.map((k) => k.i);
  }
  return rows;
}

// ----- reading cells -----

interface Reader {
  project: Project;
  problems: Issue[];
  /** What the edit made because a cell named it: new categories, link types and variables. */
  made: string[];
}

interface Where {
  /** For people: "Row 4, Sign". */
  text: string;
  path: (string | number)[];
}

const note = (reader: Reader, path: (string | number)[], message: string) => {
  reader.problems.push({ severity: 'error', code: 'unreadableCell', message, path });
};

/** A category or link type named by its name or id; one not there yet is made. */
function typeNamed(reader: Reader, kind: 'category' | 'linkType', text: string, at: Where): string | null {
  try {
    return resolveType(reader.project, kind, text).item.id;
  } catch (error) {
    if (!(error instanceof OpError)) throw error;
    if (error.kind !== 'notFound') {
      note(reader, at.path, `${at.text}: ${error.message}`);
      return null;
    }
  }
  const out = addType(reader.project, kind, { name: text });
  reader.project = out.project;
  reader.made.push(`${kind === 'category' ? 'category' : 'link type'} "${text}"`);
  return out.result.id;
}

/** The variable a link end names; a name not on the map yet becomes a new variable, as in the shorthand. */
function variableNamed(reader: Reader, text: string, at: Where): string | null {
  try {
    return resolveVariable(reader.project, text).variable.id;
  } catch (error) {
    if (!(error instanceof OpError)) throw error;
    if (error.kind !== 'notFound') {
      note(reader, at.path, `${at.text}: ${error.message}`);
      return null;
    }
  }
  const out = addVariable(reader.project, { label: text });
  reader.project = out.project;
  reader.made.push(`variable "${text}"`);
  return out.result.id;
}

/** A cell that could not be read (its problem is noted). */
const UNREAD = Symbol('unread');

/** One cell read as the value it sets (null clears it), or UNREAD. */
function readCell(
  reader: Reader,
  shape: Shape,
  key: string,
  raw: string,
  at: Where,
  isNew: boolean,
): unknown {
  const fail = (message: string) => {
    note(reader, at.path, `${at.text}: ${message}`);
    return UNREAD;
  };
  const text = cleanText(raw);
  if (key.startsWith('field:')) {
    const field = reader.project.types.fields.find((f) => `field:${f.id}` === key);
    if (!field) return fail('there is no such field.');
    if (!text) return null;
    const read = readFieldValue(field, text);
    return 'error' in read ? fail(read.error) : read.value;
  }
  if (shape === 'variables') {
    switch (key) {
      case 'label':
        return text || fail('a variable needs a name.');
      case 'mapLabel': {
        const lines = raw.split('\\n').map((line) => cleanText(line));
        return lines.some(Boolean) ? lines.join('\n') : null;
      }
      case 'category':
        return text ? (typeNamed(reader, 'category', text, at) ?? UNREAD) : null;
      case 'role': {
        if (!text) return null;
        try {
          return resolveType(reader.project, 'role', text).item.id;
        } catch (error) {
          if (!(error instanceof OpError)) throw error;
          return fail(`${error.message} A role needs a shape, so new roles are added under Types.`);
        }
      }
      case 'definition':
        return cleanText(raw, true) || null;
      case 'size':
        if (!text || text === 'normal') return null;
        return text === 'large' ? 'large' : fail(`the size is normal or large, not "${text}".`);
      default:
        return fail('this column cannot be changed.');
    }
  }
  switch (key) {
    case 'from':
    case 'to':
      return text || fail(`a link needs its ${key === 'from' ? 'cause (From)' : 'effect (To)'}.`);
    case 'sign': {
      // A new link whose sign is not given gets the unknown sign, ?, which the checks flag.
      if (!text) return isNew ? '?' : fail('a link needs a sign: +, −, or ? when it is not known.');
      const read = resolveVocabularyValue(SIGN_VOCABULARY, text);
      return read ? read.value : fail(`the sign is +, − or ?, not "${text}".`);
    }
    case 'type':
      return text ? (typeNamed(reader, 'linkType', text, at) ?? UNREAD) : null;
    case 'conditional':
    case 'delay': {
      if (!text) return null;
      const read = readBoolean(text);
      if (read.kind !== 'ok') return fail(`write yes or no, not "${text}".`);
      return read.value ? true : null;
    }
    case 'delayLabel':
      return text || null;
    case 'confidence': {
      if (!text) return null;
      const read = resolveVocabularyValue(CONFIDENCE_VOCABULARY, text);
      return read ? read.value : fail(`the confidence is low, medium or high, not "${text}".`);
    }
    case 'weight': {
      if (!text) return null;
      const read = readNumber(text);
      if (read.kind === 'ok' && read.value >= 0) return read.value;
      if (read.kind === 'ambiguous') {
        const ways = read.options.map((o) => `${o.value} (${o.note})`).join(' or ');
        return fail(`"${text}" could be ${ways}; write a plain number.`);
      }
      return fail(`the weight is a plain number, 0 or more, not "${text}".`);
    }
    case 'rationale':
      return cleanText(raw, true) || null;
    default:
      return fail('this column cannot be changed.');
  }
}

/** The changes a row's cells make, custom fields gathered into `fields`; null when a cell was unreadable. */
function rowChanges(
  reader: Reader,
  shape: Shape,
  columns: readonly TableColumn[],
  cells: readonly CellEdit[],
  current: Element | undefined,
  rowText: string,
): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  let fields: Record<string, FieldValue> | undefined;
  let readable = true;
  for (const cell of cells) {
    const name = columns.find((c) => c.key === cell.column)?.name ?? cell.column;
    const field = cell.column.startsWith('field:') ? cell.column.slice(6) : null;
    const at: Where = {
      text: `${rowText}, ${name}`,
      path: [shape, cell.row, ...(field ? ['fields', field] : [cell.column])],
    };
    const value = readCell(reader, shape, cell.column, cell.text, at, current === undefined);
    if (value === UNREAD) {
      readable = false;
      continue;
    }
    if (field) {
      fields ??= { ...(current?.fields ?? {}) };
      if (value === null) delete fields[field];
      else fields[field] = value as FieldValue;
    } else changes[cell.column] = value;
  }
  if (fields) changes.fields = Object.keys(fields).length ? fields : null;
  if (!readable) return null;
  if (shape === 'links') {
    const link = current as Link | undefined;
    const delayLabel = 'delayLabel' in changes ? changes.delayLabel : link?.delayLabel;
    const delay = 'delay' in changes ? changes.delay : link?.delay;
    if (delayLabel && !delay) {
      // Saying how long the delay is says there is one; taking the delay away while it says so contradicts.
      if ('delay' in changes) {
        note(
          reader,
          [shape, cells[0]?.row ?? 0, 'delay'],
          `${rowText}: it says how long the delay is (How long), so it has one; clear How long too.`,
        );
        return null;
      }
      changes.delay = true;
    }
  }
  return changes;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Typed or pasted cells as one edit. Rows already there change; rows past the end become new variables or
 * links (a new link needs its two ends, named by variable; a name not on the map yet becomes a new
 * variable; its sign is ? when not given). A category or link type named for the first time is made. If
 * any cell cannot be read, nothing changes and every problem is named.
 */
export function applyCells(
  project: Project,
  shape: Shape,
  edits: readonly CellEdit[],
): OpOutput<{ changed: string[]; added: string[]; made: string[] }> {
  const reader: Reader = { project, problems: [], made: [] };
  const columns = tableColumns(project, shape);
  const before = elementsOf(project, shape);
  const byRow = new Map<number, CellEdit[]>();
  for (const e of edits) if (e.column !== 'id') byRow.set(e.row, [...(byRow.get(e.row) ?? []), e]);
  const changed: string[] = [];
  const added: string[] = [];

  /** Runs one operation on the edit so far; a refusal is noted as a problem of the row. */
  const attempt = (rowText: string, path: (string | number)[], op: () => OpOutput<{ id: string }>) => {
    try {
      const out = op();
      const isChange = out.project !== reader.project;
      reader.project = out.project;
      return isChange ? out.result.id : null;
    } catch (error) {
      if (!(error instanceof OpError)) throw error;
      note(reader, path, `${rowText}: ${error.message}`);
      return null;
    }
  };

  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const cells = byRow.get(row) as CellEdit[];
    const current = before[row];
    // A row past the end with nothing in it adds nothing.
    if (!current && cells.every((c) => !c.text.trim())) continue;
    const rowText = `Row ${row + 1}`;
    const changes = rowChanges(reader, shape, columns, cells, current, rowText);
    if (!changes) continue;
    if (shape === 'links') {
      let ends = true;
      for (const end of ['from', 'to'] as const) {
        if (typeof changes[end] !== 'string') continue;
        const id = variableNamed(reader, changes[end] as string, { text: rowText, path: [shape, row, end] });
        if (id === null) ends = false;
        else changes[end] = id;
      }
      if (!ends) continue;
    }
    const given = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== null));
    if (current) {
      const id = current.id;
      const done =
        shape === 'variables'
          ? attempt(rowText, [shape, row], () => setVariable(reader.project, id, changes as VariableChanges))
          : attempt(rowText, [shape, row], () => setLink(reader.project, id, changes as LinkChanges));
      if (done) changed.push(done);
    } else if (shape === 'variables') {
      if (typeof given.label !== 'string') {
        note(reader, [shape, row, 'label'], `${rowText}: a new variable needs a name.`);
        continue;
      }
      const done = attempt(rowText, [shape, row], () => addVariable(reader.project, given as never));
      if (done) added.push(done);
    } else {
      const missing = (['from', 'to'] as const).filter((end) => typeof given[end] !== 'string');
      if (missing.length) {
        const ends = missing.map((m) => (m === 'from' ? 'cause (From)' : 'effect (To)'));
        note(reader, [shape, row], `${rowText}: a new link needs its ${listing(ends)}.`);
        continue;
      }
      const done = attempt(rowText, [shape, row], () =>
        addLink(reader.project, { sign: '?', ...given } as never),
      );
      if (done) added.push(done);
    }
  }

  if (reader.problems.length) {
    const more = reader.problems.length - 1;
    throw new OpError(
      `${reader.problems[0]?.message}${more ? ` (And ${plural(more, 'more problem')}.)` : ''}`,
      'invalid',
      reader.problems,
    );
  }
  const noun = shape === 'variables' ? 'variable' : 'link';
  const parts = [
    changed.length ? `changed ${plural(changed.length, noun)}` : '',
    added.length ? `added ${plural(added.length, noun)}` : '',
  ].filter(Boolean);
  const made = reader.made.length ? ` Made ${listing(reader.made)}.` : '';
  const summary = parts.length ? `${capital(listing(parts))}.${made}` : 'Nothing to change.';
  return { project: reader.project, result: { changed, added, made: reader.made }, summary };
}
