// The importers, on made-up files (fixtures/import): tables, Kumu and DataViz. Each import must carry
// across what its file holds, record nothing it does not, and say what it could not carry.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  errorsIn,
  ImportError,
  type ImportSource,
  importSource,
  readImportFile,
  serializeProject,
  suggestMapping,
  type TablePlan,
  tablePlans,
  validateProject,
} from '../src/index.ts';
import { buildXlsx } from './xlsx.ts';

const fixture = (name: string) => ({
  name,
  bytes: new Uint8Array(readFileSync(new URL(`./fixtures/import/${name}`, import.meta.url))),
});
const text = (name: string, content: string) => ({ name, bytes: new TextEncoder().encode(content) });

/** Runs `run`, expecting an ImportError; returns its problems as "where: message" lines. */
async function problems(run: () => unknown): Promise<string[]> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ImportError) return error.problems.map((p) => `${p.where}: ${p.message}`);
    throw error;
  }
  throw new Error('expected the import to stop');
}

const tables = async (file: { name: string; bytes: Uint8Array }) => {
  const source = await readImportFile(file);
  expect(source.format).toBe('tables');
  return source as Extract<ImportSource, { format: 'tables' }>;
};

describe('tables', () => {
  it('reads a links table, mapping its headers to link fields and keeping every other column', async () => {
    const source = await tables(fixture('links.csv'));
    const [plan] = tablePlans(source.file);
    expect(plan?.shape).toBe('links');
    const mapping = suggestMapping(plan?.table as never, 'links', { types: { fields: [] } } as never);
    expect(mapping).toEqual({
      Cause: { kind: 'field', key: 'from' },
      Effect: { kind: 'field', key: 'to' },
      Polarity: { kind: 'field', key: 'sign' },
      Delay: { kind: 'field', key: 'delay' },
      'Delay time': { kind: 'field', key: 'delayLabel' },
      Confidence: { kind: 'field', key: 'confidence' },
      Strength: { kind: 'field', key: 'weight' },
      Mechanism: { kind: 'field', key: 'rationale' },
      Evidence: { kind: 'custom', id: 'evidence', name: 'Evidence', type: 'choice' },
      Notes: { kind: 'custom', id: 'notes', name: 'Notes', type: 'text' },
    });
  });

  it('imports a links table, making variables from the link ends, and says what it did', async () => {
    const { project, notes } = importSource(await tables(fixture('links.csv')));
    expect(project.meta.title).toBe('links');
    expect(project.variables.map((v) => `${v.id} ${v.label}`)).toEqual([
      'workload Workload',
      'stress Stress',
      'sleep_quality Sleep quality',
      'performance Performance',
    ]);
    expect(project.links).toEqual([
      {
        id: 'L1',
        from: 'workload',
        to: 'stress',
        sign: '+',
        weight: 0.8,
        rationale: 'More work leaves less time to recover.',
        fields: { evidence: 'explicit' },
        citations: [],
      },
      {
        id: 'L2',
        from: 'stress',
        to: 'sleep_quality',
        sign: '-',
        confidence: 'medium',
        rationale: 'Stress keeps people awake.',
        fields: { evidence: 'synthesis', notes: 'test row' },
        citations: [],
      },
      {
        id: 'L3',
        from: 'sleep_quality',
        to: 'performance',
        sign: '+',
        delay: true,
        delayLabel: 'weeks',
        confidence: 'high',
        fields: { evidence: 'explicit' },
        citations: [],
      },
      {
        id: 'L4',
        from: 'performance',
        to: 'workload',
        sign: '-',
        rationale: 'Doing well clears the backlog, so less is left.',
        citations: [],
      },
      {
        id: 'L5',
        from: 'workload',
        to: 'performance',
        sign: '?',
        fields: { notes: 'no sign given' },
        citations: [],
      },
    ]);
    expect(project.types.fields).toEqual([
      {
        id: 'evidence',
        name: 'Evidence',
        kind: 'choice',
        appliesTo: 'links',
        options: [
          { id: 'explicit', name: 'explicit' },
          { id: 'synthesis', name: 'synthesis' },
        ],
      },
      { id: 'notes', name: 'Notes', kind: 'text', appliesTo: 'links' },
    ]);
    expect(notes).toEqual([
      'Imported 4 variables, 5 links, 2 custom fields.',
      '4 variables were made from link ends that named no variable: workload, stress, sleep_quality, performance.',
      '1 link had no sign: recorded as unknown (?) and flagged; set it to + or -.',
      'No link cites a source yet: Loopweft flags every uncited link.',
      'Read links.csv as links.',
    ]);
    expect(errorsIn(validateProject(project))).toEqual([]);
  });

  it('stops at values it cannot read, reporting every one with its row', async () => {
    const source = await tables(
      text('bad.csv', 'From,To,Sign,Weight,Delay\nA,B,maybe,1\nB,C,+,heavy\nC,,+\nC,A,-,,sometimes\n'),
    );
    expect(await problems(() => importSource(source))).toEqual([
      'bad.csv, row 2, sign: The sign must be +, - or ? (or a word such as positive), not "maybe".',
      'bad.csv, row 3, weight: weight must be a plain number, 0 or more, not "heavy".',
      'bad.csv, row 4: The link has no effect (to).',
      'bad.csv, row 5, delay: delay must be true or false (yes or no), not "sometimes".',
    ]);
  });

  it('reads a workbook of variables and links, variables first, link ends by label', async () => {
    const book = buildXlsx([
      {
        name: 'Variables',
        rows: [
          ['Name', 'Group', 'Definition', 'Size'],
          ['Rainfall', 'Weather', 'Rain in a month.', null],
          ['River level', 'Water', null, 'large'],
          ['Floods', 'Water', null, null],
        ],
      },
      {
        name: 'Links',
        rows: [
          ['From', 'To', 'Sign'],
          ['rainfall', 'River level', 'positive'],
          ['River level', 'Floods', '+'],
        ],
      },
    ]);
    const source = await tables({ name: 'river.xlsx', bytes: book });
    expect(tablePlans(source.file).map((p) => p.shape)).toEqual(['variables', 'links']);
    const { project, notes } = importSource(source, { title: 'River' });
    expect(project.types.categories).toEqual([
      { id: 'weather', name: 'Weather' },
      { id: 'water', name: 'Water' },
    ]);
    expect(project.variables).toEqual([
      {
        id: 'rainfall',
        label: 'Rainfall',
        category: 'weather',
        definition: 'Rain in a month.',
        citations: [],
      },
      { id: 'river_level', label: 'River level', category: 'water', size: 'large', citations: [] },
      { id: 'floods', label: 'Floods', category: 'water', citations: [] },
    ]);
    expect(project.links.map((l) => `${l.from} ${l.sign} ${l.to}`)).toEqual([
      'rainfall + river_level',
      'river_level + floods',
    ]);
    expect(notes.at(-1)).toBe('Read river.xlsx (Variables) as variables and river.xlsx (Links) as links.');
  });

  it('leaves out a column when told to, and says so', async () => {
    const source = await tables(fixture('links.csv'));
    const [plan] = tablePlans(source.file);
    const mapping = { ...suggestMapping(plan?.table as never, 'links', { types: { fields: [] } } as never) };
    mapping.Notes = { kind: 'ignore' };
    const { project, notes } = importSource(source, { plans: [{ ...(plan as TablePlan), mapping }] });
    expect(project.types.fields.map((f) => f.id)).toEqual(['evidence']);
    expect(notes).toContain('Left out the column "Notes" of links.csv, as chosen.');
  });

  it('refuses a mapping that has no cause or effect', async () => {
    const source = await tables(text('names.csv', 'A,B\nx,y\n'));
    const [plan] = tablePlans(source.file);
    expect(
      await problems(() =>
        importSource(source, {
          plans: [{ ...(plan as TablePlan), shape: 'links', mapping: { A: { kind: 'field', key: 'from' } } }],
        }),
      ),
    ).toEqual(["names.csv: Choose the column that holds each link's effect (to)."]);
  });
});

describe('Kumu', () => {
  it('reads a JSON blueprint: element types as categories, signs from a polarity field', async () => {
    const source = await readImportFile(fixture('kumu-blueprint.json'));
    expect(source.format).toBe('kumu');
    const { project, notes } = importSource(source, { title: 'Workload' });
    expect(project.types.categories).toEqual([
      { id: 'work', name: 'Work' },
      { id: 'health', name: 'Health' },
    ]);
    expect(project.variables[0]).toEqual({
      id: 'workload',
      label: 'Workload',
      category: 'work',
      definition: 'Hours of work in a week.',
      fields: { tags: 'test, made up' },
      citations: [],
    });
    expect(project.variables[2]?.fields).toEqual({ owner: 'Team' });
    expect(project.links.map((l) => `${l.id} ${l.from} ${l.sign} ${l.to}`)).toEqual([
      'L1 workload + stress',
      'L2 stress - sleep_quality',
      'L3 sleep_quality + performance',
      'L4 performance - workload',
      'L5 workload - performance',
    ]);
    expect(project.links[1]?.fields).toEqual({ label: 'keeps people awake' });
    expect(notes).toEqual([
      'Imported 4 variables, 5 links, 2 categories, 3 custom fields.',
      'No link cites a source yet: Loopweft flags every uncited link.',
      "Read Kumu's JSON: 4 elements and 5 connections.",
      "Kumu's element types became categories.",
      'Signs came from the connection field "Polarity".',
      '1 mutual connection became two links, one each way.',
      'Left out 1 undirected connection: a causal link needs a direction.',
      '1 connection gives no direction: read as directed, from → to.',
      'Kept as custom fields: "tags", "Owner", "label" (Loopweft has no tags or link labels of its own).',
      'Kumu blueprints hold no positions: the map is laid out automatically.',
    ]);
    expect(errorsIn(validateProject(project))).toEqual([]);
  });

  it('reads the spreadsheet layout: sheets of elements and connections, signs from types that read as signs', async () => {
    const book = buildXlsx([
      {
        name: 'Elements',
        rows: [
          ['Label', 'Type', 'Description', 'Tags'],
          ['Rain', 'Weather', null, 'test|made up'],
          ['River', 'Water', 'How high the river runs.', null],
          ['Fields', 'Land', null, null],
        ],
      },
      {
        name: 'Connections',
        rows: [
          ['From', 'To', 'Type', 'Direction'],
          ['Rain', 'River|Fields', '+', 'directed'],
          ['River', 'Fields', 'negative', 'directed'],
        ],
      },
    ]);
    const source = await readImportFile({ name: 'kumu-export.xlsx', bytes: book });
    expect(source.format).toBe('kumu');
    const { project, notes } = importSource(source);
    expect(project.meta.title).toBe('kumu export');
    expect(project.types.linkTypes).toEqual([]);
    expect(project.links.map((l) => `${l.from} ${l.sign} ${l.to}`)).toEqual([
      'rain + river',
      'rain + fields',
      'river - fields',
    ]);
    expect(project.variables[0]?.fields).toEqual({ tags: 'test|made up' });
    expect(notes).toContain('Signs came from the connection types, which all read as signs.');
  });

  it('records every link as unknown when nothing holds a sign, and says so', async () => {
    const source = await readImportFile(
      text(
        'plain.json',
        JSON.stringify({
          elements: [{ label: 'A' }, { label: 'B' }],
          connections: [{ from: 'A', to: 'B', type: 'drives' }],
        }),
      ),
    );
    const { project, notes } = importSource(source, { title: 'Plain' });
    expect(project.links).toEqual([
      { id: 'L1', from: 'a', to: 'b', sign: '?', type: 'drives', citations: [] },
    ]);
    expect(notes).toContain(
      'Kumu connections carry no sign here: every link is recorded as unknown (?) and flagged. Set the signs, or name the field that holds them.',
    );
    // Named as holding the signs, a type that is not a sign stops the import.
    expect(await problems(() => importSource(source, { title: 'Plain', signField: 'type' }))).toEqual([
      'connection 1, sign: The sign must be +, - or ? (or a word such as positive), not "drives".',
    ]);
    expect(await problems(() => importSource(source, { title: 'Plain', signField: 'Polarity' }))).toEqual([
      'connections: No connection field "Polarity" holds signs: there is no such field.',
    ]);
  });
});

describe('DataViz', () => {
  const dataviz = async () => importSource(await readImportFile(fixture('garden.dataviz.json')));

  it('turns entities into variables and relations into links, with their groups, colours and fields', async () => {
    const { project } = await dataviz();
    expect(project.meta).toEqual({
      title: 'Garden (test data)',
      description: "Made up for Loopweft's importer tests.",
    });
    expect(project.types.categories).toEqual([
      { id: 'soil', name: 'Soil life', colour: '#8C6D46' },
      { id: 'plants', name: 'Plants' },
    ]);
    expect(project.variables.map((v) => [v.id, v.category ?? null])).toEqual([
      ['compost', 'soil'],
      ['soil_life', 'soil'],
      ['growth', 'plants'],
      ['weeds', 'plants'],
      ['time_spent_weeding', null],
    ]);
    expect(project.variables[0]?.fields).toEqual({ area_m2: 2 });
    expect(project.variables[2]?.fields).toEqual({ season: 'spring' });
    expect(project.links[0]).toEqual({
      id: 'r1',
      from: 'compost',
      to: 'soil_life',
      sign: '+',
      confidence: 'high',
      weight: 0.7,
      rationale: 'Compost feeds the soil life.',
      fields: { empirical_support: '3', dataviz_sources: 'Test 2020, p. 4' },
      citations: [],
    });
    expect(project.links[1]).toMatchObject({
      id: 'r2',
      delay: true,
      delayLabel: 'a season',
      confidence: 'medium',
    });
    expect(project.links[2]?.fields).toEqual({ note: 'test note', dataviz_label: 'clippings' });
    expect(project.links[4]).toMatchObject({ id: 'r5', from: 'time_spent_weeding', to: 'weeds', sign: '-' });
    expect(project.links[5]?.sign).toBe('?');
    expect(project.layout.positions).toEqual({
      compost: { x: 200, y: 300, pinned: true },
      soil_life: { x: 420, y: 311, pinned: true },
    });
    expect(errorsIn(validateProject(project))).toEqual([]);
  });

  it('says what it could not carry across, and keeps citations as text rather than invent sources', async () => {
    const { project, notes } = await dataviz();
    expect(project.sources).toEqual([]);
    expect(project.links.every((l) => l.citations.length === 0)).toBe(true);
    expect(notes).toEqual([
      'Imported 5 variables, 6 links, 2 categories, 6 custom fields.',
      'No link cites a source yet: Loopweft flags every uncited link.',
      "Kept DataViz's own colours for Soil life.",
      'Gave new ids to entities whose ids Loopweft cannot use: weeding.time.',
      'Placed and pinned 2 variables where the view "Whole garden" pins them; the others are laid out automatically.',
      '1 relation cites sources in DataViz: the citations are kept, as DataViz wrote them, in the custom field "DataViz sources". They are not Loopweft sources yet: DataViz holds no full references to make them from.',
      'Relation labels are kept in the custom field "DataViz label": Loopweft links have no labels.',
      "The rubric's dimension became a choice field.",
      'Left out what Loopweft has no place for: the imported raw tables; the normalization log and pending suggestions; its view (filters, outputs, look, link bends and curvature).',
    ]);
  });
});

describe('every importer', () => {
  it('gives the same project, byte for byte, every time', async () => {
    for (const name of ['links.csv', 'kumu-blueprint.json', 'garden.dataviz.json']) {
      const once = serializeProject(
        importSource(await readImportFile(fixture(name)), { title: 'T' }).project,
      );
      const twice = serializeProject(
        importSource(await readImportFile(fixture(name)), { title: 'T' }).project,
      );
      expect(twice, name).toBe(once);
    }
  });

  it('refuses JSON that is neither Kumu nor DataViz', async () => {
    await expect(readImportFile(text('other.json', '{"nodes": []}'))).rejects.toThrow(
      'other.json is neither a Kumu blueprint (elements and connections) nor a DataViz project (format "dataviz.project").',
    );
  });
});
