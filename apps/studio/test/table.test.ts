// The table view's model: what cells show, how typed and pasted text is read (strictly, all or nothing),
// and DataViz's clipboard helpers.
import { createProject, OpError, type Project } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import { parseClipboard, planPaste, toClipboard } from '../src/table/clipboard.ts';
import { applyCells, cellText, cellValue, tableColumns, visibleRows } from '../src/table/model.ts';

function small(): Project {
  const p = createProject({ title: 'Small map' });
  p.types.categories = [{ id: 'people', name: 'People' }];
  p.types.roles = [{ id: 'driver', name: 'Driver', shape: 'ring' }];
  p.types.fields = [
    {
      id: 'region',
      name: 'Region',
      kind: 'choice',
      options: [{ id: 'n', name: 'North' }],
      appliesTo: 'variables',
    },
    { id: 'strength', name: 'Strength', kind: 'number', appliesTo: 'links' },
  ];
  p.variables = [
    { id: 'births', label: 'Births', mapLabel: 'Births\nper year', category: 'people', citations: [] },
    { id: 'population', label: 'Population', definition: 'People alive.\nAll ages.', citations: [] },
  ];
  p.links = [
    { id: 'L1', from: 'births', to: 'population', sign: '+', weight: 2, citations: [] },
    { id: 'L2', from: 'population', to: 'births', sign: '-', citations: [] },
  ];
  return p;
}

const failure = (run: () => unknown): OpError => {
  try {
    run();
  } catch (error) {
    if (error instanceof OpError) return error;
    throw error;
  }
  throw new Error('It did not fail.');
};

describe('the table columns', () => {
  it("lists each kind's own fields, then the custom fields that apply to it", () => {
    const p = small();
    expect(tableColumns(p, 'variables').map((c) => c.name)).toEqual([
      'Id',
      'Name',
      'Name on the map',
      'Category',
      'Role',
      'Definition',
      'Size',
      'Region',
    ]);
    expect(tableColumns(p, 'links').map((c) => c.key)).toEqual([
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
      'field:strength',
    ]);
  });

  it('shows names, not ids, and keeps a line break in a name on the map as \\n', () => {
    const p = small();
    const [births, population] = p.variables as [Project['variables'][0], Project['variables'][0]];
    expect(cellValue(p, 'variables', births, 'mapLabel')).toBe('Births\\nper year');
    expect(cellValue(p, 'variables', births, 'category')).toBe('People');
    expect(cellValue(p, 'variables', population, 'definition')).toBe('People alive.\nAll ages.');
    expect(cellText(p, 'variables', population, 'definition')).toBe('People alive. All ages.');
    const l2 = p.links[1] as Project['links'][0];
    expect(cellText(p, 'links', l2, 'from')).toBe('Population');
    expect(cellText(p, 'links', l2, 'sign')).toBe('−');
  });
});

describe('typed and pasted cells', () => {
  it('changes a variable by name, and makes a category it names for the first time', () => {
    const p = small();
    const out = applyCells(p, 'variables', [
      { row: 0, column: 'label', text: '  Birth   rate ' },
      { row: 1, column: 'category', text: 'Economy' },
      { row: 1, column: 'mapLabel', text: 'All\\npeople' },
      { row: 0, column: 'field:region', text: 'north' },
    ]);
    expect(out.project.variables[0]).toMatchObject({ label: 'Birth rate', fields: { region: 'n' } });
    expect(out.project.variables[1]).toMatchObject({ category: 'economy', mapLabel: 'All\npeople' });
    expect(out.project.types.categories.map((c) => c.name)).toEqual(['People', 'Economy']);
    expect(out.summary).toBe('Changed 2 variables. Made category "Economy".');
    expect(out.result).toEqual({
      changed: ['births', 'population'],
      added: [],
      made: ['category "Economy"'],
    });
    // The input is untouched.
    expect(p.variables[0]?.label).toBe('Births');
  });

  it('changes nothing when any cell cannot be read, and names every problem', () => {
    const p = small();
    const error = failure(() =>
      applyCells(p, 'variables', [
        { row: 0, column: 'label', text: 'Fine' },
        { row: 0, column: 'role', text: 'Outcome' },
        { row: 1, column: 'size', text: 'huge' },
        { row: 1, column: 'label', text: '' },
      ]),
    );
    expect(error.kind).toBe('invalid');
    expect(error.issues.map((i) => i.message)).toEqual([
      'Row 1, Role: No role "Outcome". A role needs a shape, so new roles are added under Types.',
      'Row 2, Size: the size is normal or large, not "huge".',
      'Row 2, Name: a variable needs a name.',
    ]);
    expect(error.issues[0]?.path).toEqual(['variables', 0, 'role']);
    expect(error.message).toBe(`${error.issues[0]?.message} (And 2 more problems.)`);
  });

  it('adds links from rows past the end, making the variables they name; a sign not given is ?', () => {
    const p = small();
    const out = applyCells(p, 'links', [
      { row: 2, column: 'from', text: 'Deaths' },
      { row: 2, column: 'to', text: 'population' },
      { row: 2, column: 'sign', text: 'opposite' },
      { row: 3, column: 'from', text: 'Fertility' },
      { row: 3, column: 'to', text: 'Births' },
      { row: 3, column: 'sign', text: '' },
      // A row with nothing in it adds nothing.
      { row: 4, column: 'from', text: ' ' },
    ]);
    expect(out.project.links.slice(2)).toEqual([
      { id: 'L3', from: 'deaths', to: 'population', sign: '-', citations: [] },
      { id: 'L4', from: 'fertility', to: 'births', sign: '?', citations: [] },
    ]);
    expect(out.summary).toBe('Added 2 links. Made variable "Deaths" and variable "Fertility".');
  });

  it('refuses a new link without its two ends, or one that is already there', () => {
    const p = small();
    const error = failure(() =>
      applyCells(p, 'links', [
        { row: 2, column: 'from', text: 'Deaths' },
        { row: 3, column: 'from', text: 'Births' },
        { row: 3, column: 'to', text: 'Population' },
      ]),
    );
    expect(error.issues.map((i) => i.message)).toEqual([
      'Row 3: a new link needs its effect (To).',
      'Row 4: L1 already links births to population; change it instead.',
    ]);
  });

  it('reads link fields strictly: a duration gives a delay, an unclear number is refused', () => {
    const p = small();
    const out = applyCells(p, 'links', [
      { row: 0, column: 'delayLabel', text: '5 yrs' },
      { row: 0, column: 'confidence', text: 'H' },
      { row: 1, column: 'field:strength', text: '0.5' },
      { row: 1, column: 'conditional', text: 'yes' },
    ]);
    expect(out.project.links[0]).toMatchObject({ delay: true, delayLabel: '5 yrs', confidence: 'high' });
    expect(out.project.links[1]).toMatchObject({ conditional: true, fields: { strength: 0.5 } });

    const unclear = failure(() => applyCells(p, 'links', [{ row: 0, column: 'weight', text: '1,5' }]));
    expect(unclear.issues[0]?.message).toBe(
      'Row 1, Weight: "1,5" could be 1.5 (comma as decimal separator); write a plain number.',
    );
    const delayed = applyCells(p, 'links', [{ row: 0, column: 'delayLabel', text: '5 yrs' }]).project;
    const contradiction = failure(() =>
      applyCells(delayed, 'links', [{ row: 0, column: 'delay', text: 'no' }]),
    );
    expect(contradiction.issues[0]?.message).toBe(
      'Row 1: it says how long the delay is (How long), so it has one; clear How long too.',
    );
    const sign = failure(() => applyCells(p, 'links', [{ row: 0, column: 'sign', text: '' }]));
    expect(sign.issues[0]?.message).toBe(
      'Row 1, Sign: a link needs a sign: +, −, or ? when it is not known.',
    );
  });

  it('changes nothing for text that is already there', () => {
    const p = small();
    const out = applyCells(p, 'variables', [{ row: 0, column: 'category', text: 'people' }]);
    expect(out.project).toBe(p);
    expect(out.summary).toBe('Nothing to change.');
  });
});

describe('rows shown', () => {
  it('finds rows by any cell, and sorts with empty cells last', () => {
    const p = small();
    const columns = tableColumns(p, 'variables');
    expect(visibleRows(p, 'variables', columns, { search: 'ALIVE' })).toEqual([1]);
    expect(visibleRows(p, 'variables', columns, { sort: { key: 'label', direction: 'DESC' } })).toEqual([
      1, 0,
    ]);
    expect(visibleRows(p, 'variables', columns, { sort: { key: 'category', direction: 'DESC' } })).toEqual([
      0, 1,
    ]);
    const links = tableColumns(p, 'links');
    expect(visibleRows(p, 'links', links, { sort: { key: 'weight', direction: 'ASC' } })).toEqual([0, 1]);
  });
});

describe('the clipboard (DataViz)', () => {
  it('reads and writes spreadsheet text, with quoted cells', () => {
    const cells = [
      ['Births', 'a "quoted"\nline'],
      ['Tab\there', ''],
    ];
    const text = toClipboard(cells);
    expect(text).toBe('Births\t"a ""quoted""\nline"\n"Tab\there"\t');
    expect(parseClipboard(text)).toEqual(cells);
    expect(parseClipboard('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('plans a paste from the active cell: a header is skipped, the id is not written, rows past the end are added', () => {
    const p = small();
    const columns = tableColumns(p, 'links');
    const plan = planPaste(
      [
        ['Id', 'From', 'To'],
        ['L9', 'Deaths', 'Population'],
        ['', 'Births', 'Deaths', 'extra'],
      ],
      { row: 1, column: 0 },
      { rows: [1, 0], columns: columns.slice(0, 3), totalRows: 2 },
    );
    expect(plan).toEqual({
      edits: [
        { row: 0, column: 'from', text: 'Deaths' },
        { row: 0, column: 'to', text: 'Population' },
        { row: 2, column: 'from', text: 'Births' },
        { row: 2, column: 'to', text: 'Deaths' },
      ],
      skippedHeader: true,
      ignoredColumns: 1,
      addedRows: 1,
      skippedCells: 2,
    });
  });
});
