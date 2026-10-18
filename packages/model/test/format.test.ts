import { describe, expect, it } from 'vitest';
import {
  createProject,
  type Issue,
  type Project,
  parseProject,
  projectJsonSchemaText,
  readProject,
  SCHEMA_URL,
  serializeProject,
} from '../src/index.ts';
import { parseChanged, repoFile, richInput, richProject } from './helpers.ts';

/** The issues of an invalid document, as `code path` lines (paths dotted). */
const problems = (result: ReturnType<typeof parseProject>): string[] =>
  result.issues.map((i: Issue) => `${i.code} ${i.path.join('.')}`);

const firstIssue = (result: ReturnType<typeof parseProject>): Issue => {
  expect(result.ok).toBe(false);
  return result.issues[0] as Issue;
};

describe('reading a project', () => {
  it('accepts a minimal file and fills in the empty collections', () => {
    const result = parseProject({ format: 'loopweft', version: 1, meta: { title: 'Empty' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project).toEqual({
      format: 'loopweft',
      version: 1,
      meta: { title: 'Empty' },
      theme: { base: 'cinematic-dark' },
      types: { categories: [], roles: [], linkTypes: [], fields: [] },
      variables: [],
      links: [],
      layout: { positions: {}, groups: [], bends: {} },
      loops: [],
      sources: [],
      story: { scenes: [] },
      assets: {},
    });
    expect(result.issues).toEqual([]);
    expect(createProject({ title: 'Empty' })).toEqual(result.project);
  });

  it('accepts a project that uses every part of the format', () => {
    const result = parseProject(richInput());
    expect(result.ok).toBe(true);
    // Valid, with the two warnings the test project carries on purpose (see integrity.test.ts).
    expect(result.issues.map((i) => `${i.severity} ${i.code}`)).toEqual([
      'warning uncitedLink',
      'warning unknownSign',
    ]);
  });

  it('reads file text, tolerating a byte-order mark', () => {
    const text = serializeProject(richProject());
    expect(readProject(text).ok).toBe(true);
    expect(readProject(`\uFEFF${text}`).ok).toBe(true);
    expect(problems(readProject('{ "format": '))).toEqual(['invalidJson ']);
  });

  it('never changes the document it is given', () => {
    const input = richInput();
    const copy = structuredClone(input);
    parseProject(input);
    expect(input).toEqual(copy);
  });
});

describe('writing a project', () => {
  it('round-trips: reading the written text gives the same project, and writing it again the same bytes', () => {
    const project = richProject();
    const text = serializeProject(project);
    const again = readProject(text);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.project).toEqual({ ...project, $schema: SCHEMA_URL });
    expect(serializeProject(again.project)).toBe(text);
  });

  it('writes keys in the schema order, whatever order they came in', () => {
    const shuffled = <T>(value: T): T => {
      if (Array.isArray(value)) return value.map(shuffled) as T;
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([k, v]) => [k, shuffled(v)]),
        ) as T;
      }
      return value;
    };
    const result = parseProject(shuffled(richInput()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(serializeProject(result.project)).toBe(serializeProject(richProject()));
    const text = serializeProject(result.project);
    const keys = Object.keys(JSON.parse(text) as object);
    expect(keys).toEqual([
      '$schema',
      'format',
      'version',
      'meta',
      'theme',
      'types',
      'variables',
      'links',
      'layout',
      'loops',
      'sources',
      'story',
      'assets',
    ]);
    const link = (JSON.parse(text) as Project).links[1] as object;
    expect(Object.keys(link)).toEqual([
      'id',
      'from',
      'to',
      'sign',
      'type',
      'delay',
      'delayLabel',
      'confidence',
      'weight',
      'citations',
    ]);
  });

  it('sorts maps by key: positions, bends, assets, fields, label text and trends', () => {
    const json = JSON.parse(serializeProject(richProject())) as Project;
    expect(Object.keys(json.layout.positions)).toEqual(['births', 'deaths', 'population']);
    const step = json.story.scenes[0]?.steps[1];
    expect(Object.keys(step?.map.trends ?? {})).toEqual(['births', 'population']);
  });

  it('writes UTF-8 JSON with two-space indentation, LF line ends and a final newline', () => {
    const text = serializeProject(richProject());
    expect(
      text.startsWith(`{\n  "$schema": "${SCHEMA_URL}",\n  "format": "loopweft",\n  "version": 1,\n`),
    ).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).not.toContain('\r');
    expect(text).toContain('"mapLabel": "Popu-\\nlation"');
    expect(text).toContain('"pages": "4–5"');
  });
});

describe('format and version', () => {
  it('refuses documents that are not Loopweft projects', () => {
    expect(problems(parseProject([]))).toEqual(['notLoopweft ']);
    expect(problems(parseProject({ version: 1 }))).toEqual(['notLoopweft format']);
    expect(problems(parseProject({ format: 'dataviz.project', formatVersion: 1 }))).toEqual([
      'notLoopweft format',
    ]);
  });

  it('asks for a newer Loopweft for a newer format version', () => {
    const issue = firstIssue(parseProject({ format: 'loopweft', version: 2, meta: { title: 'x' } }));
    expect(issue.code).toBe('newerVersion');
    expect(issue.message).toMatch(/newer Loopweft/);
    expect(problems(parseProject({ format: 'loopweft', version: 0 }))).toEqual([
      'unsupportedVersion version',
    ]);
    expect(problems(parseProject({ format: 'loopweft', version: '1' }))).toEqual([
      'unsupportedVersion version',
    ]);
  });
});

describe('schema errors', () => {
  it('names a missing required field', () => {
    const issue = firstIssue(parseChanged({ 'meta.title': undefined }));
    expect(issue).toEqual({
      severity: 'error',
      code: 'missingField',
      path: ['meta', 'title'],
      message: 'Missing required field "title".',
    });
  });

  it('refuses unknown fields and suggests the field meant', () => {
    const issue = firstIssue(parseChanged({ 'variables.0.lable': 'Typo' }));
    expect(issue.code).toBe('unknownField');
    expect(issue.path).toEqual(['variables', 0, 'lable']);
    expect(issue.message).toBe('Unknown field "lable" (did you mean "label"?).');
  });

  it('explains wrong values', () => {
    const sign = firstIssue(parseChanged({ 'links.0.sign': 'plus' }));
    expect(sign).toMatchObject({ code: 'invalidValue', path: ['links', 0, 'sign'] });
    expect(sign.message).toBe('Expected one of "+", "-", "?"; got "plus".');

    const type = firstIssue(parseChanged({ 'layout.positions.births.x': '300' }));
    expect(type).toMatchObject({ code: 'invalidType', path: ['layout', 'positions', 'births', 'x'] });
    expect(type.message).toBe('Expected a number, got the text "300".');

    // Card icons come from a fixed set, which the message lists.
    const icon = firstIssue(parseChanged({ 'story.scenes.0.steps.1.overlays.2.items.1.icon': 'loop' }));
    expect(icon).toMatchObject({
      code: 'invalidValue',
      path: ['story', 'scenes', 0, 'steps', 1, 'overlays', 2, 'items', 1, 'icon'],
    });
    expect(icon.message).toMatch(/^Expected one of "circle", .*"balancing", .*"root"; got "loop"\.$/);

    // A palette is one of the presets: an unknown name is an error, never a quiet fallback.
    const palette = firstIssue(parseChanged({ 'theme.palette': 'rainbow' }));
    expect(palette).toMatchObject({ code: 'invalidValue', path: ['theme', 'palette'] });
    expect(palette.message).toBe(
      'Expected one of "loopweft", "okabe-ito", "tol-bright", "tol-muted"; got "rainbow".',
    );
  });

  it('reads a home view: a centre and a zoom above 0', () => {
    const home = { x: 960, y: 478, zoom: 0.9 };
    const ok = parseChanged({ 'layout.home': home });
    expect(ok.ok && ok.project.layout.home).toEqual(home);
    expect(problems(parseChanged({ 'layout.home': { ...home, zoom: 0 } }))).toEqual([
      'tooSmall layout.home.zoom',
    ]);
    expect(problems(parseChanged({ 'layout.home': { x: 960, zoom: 1 } }))).toEqual([
      'missingField layout.home.y',
    ]);
  });

  it('checks ids, colours, dates, DOIs and empty text', () => {
    const result = parseChanged({
      'variables.0.id': 'two words',
      'types.categories.0.colour': 'teal',
      'meta.created': '17/10/2026',
      'sources.0.doi': 'https://doi.org/10.1234/test.1',
      'variables.1.label': '',
    });
    expect(problems(result)).toEqual([
      'invalidFormat meta.created',
      'invalidFormat types.categories.0.colour',
      'invalidFormat variables.0.id',
      'empty variables.1.label',
      'invalidFormat sources.0.doi',
    ]);
    expect(result.issues[2]?.message).toBe(
      'Use letters, digits, "_" and "-" only (no spaces or dots). Got "two words".',
    );
  });

  it('checks fields that depend on each other', () => {
    const result = parseChanged({ 'types.fields.1.kind': 'choice', 'links.0.delayLabel': 'soon' });
    expect(problems(result)).toEqual([
      'choiceWithoutOptions types.fields.1.options',
      'delayLabelWithoutDelay links.0.delayLabel',
    ]);
  });

  it('names unknown overlay types', () => {
    const issue = firstIssue(parseChanged({ 'story.scenes.0.steps.0.overlays.+': { type: 'video' } }));
    expect(issue).toEqual({
      severity: 'error',
      code: 'invalidValue',
      path: ['story', 'scenes', 0, 'steps', 0, 'overlays', 1, 'type'],
      message:
        'Unknown type "video"; expected one of "caption", "title", "statement", "cards", "legend", "image".',
    });
  });
});

describe('reference errors', () => {
  it('finds ids that point nowhere, with a suggestion', () => {
    const result = parseChanged({ 'links.0.to': 'populaton' });
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'unknownVariable',
        path: ['links', 0, 'to'],
        message: 'Link L1: no variable "populaton" (did you mean "population"?).',
      },
      expect.objectContaining({ code: 'brokenLoop', path: ['loops', 0, 'links', 1] }),
    ]);
  });

  it('checks every kind of reference', () => {
    const result = parseChanged({
      'variables.0.category': 'nobody',
      'variables.0.role': 'nothing',
      'variables.0.fields': { evidence: 'explicit', colour: 'red' },
      'links.1.type': 'other',
      'links.1.fields': { evidence: 'rumour' },
      'links.2.citations': [{ source: 'X' }],
      'sources.0.partOf': 'TS',
      'layout.positions.ghost': { x: 0, y: 0 },
      'layout.bends.L9': 0.1,
      'story.scenes.0.steps.1.map.loops': ['R9'],
      'story.scenes.0.steps.1.map.pulses.hops.+': ['L7'],
      'story.scenes.0.steps.1.overlays.+': { type: 'cards', items: [{ title: 'one' }], active: [3] },
    });
    const more = parseChanged({
      'story.scenes.0.steps.1.overlays.+': { type: 'image', asset: 'photo', alt: 'A photo' },
    });
    expect(problems(result)).toEqual([
      'unknownCategory variables.0.category',
      'unknownRole variables.0.role',
      'fieldNotApplicable variables.0.fields.evidence',
      'unknownField variables.0.fields.colour',
      'unknownLinkType links.1.type',
      'invalidFieldValue links.1.fields.evidence',
      'unknownSource links.2.citations.0.source',
      'partOfCycle sources.0.partOf',
      'partOfCycle sources.1.partOf',
      'unknownVariable layout.positions.ghost',
      'unknownLink layout.bends.L9',
      'unknownLoop story.scenes.0.steps.1.map.loops.0',
      'unknownLink story.scenes.0.steps.1.map.pulses.hops.2.0',
      'cardOutOfRange story.scenes.0.steps.1.overlays.5.active.0',
    ]);
    expect(result.issues[5]?.message).toBe(
      'Link L2: field "evidence" is one of "explicit", "synthesis", not "rumour".',
    );
    expect(problems(more)).toEqual(['unknownAsset story.scenes.0.steps.1.overlays.5.asset']);
  });

  it('keeps variable, link and loop ids in one namespace', () => {
    const result = parseChanged({ 'loops.1.id': 'births' });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'duplicateId',
        path: ['loops', 1, 'id'],
        message: 'Element id "births" is already used at variables[0].',
      }),
    ]);
  });

  it("requires a loop's links to form a closed chain", () => {
    const result = parseChanged({ 'loops.1.links': ['L3', 'L1'] });
    expect(result.issues.map((i) => i.message)).toEqual([
      "Loop B1: L3 ends at deaths but L1 starts at births; a loop's links must form a closed chain.",
    ]);
  });
});

describe('the JSON Schema', () => {
  it('is current (run `npm run schema` after changing the format)', () => {
    expect(repoFile('packages/model/schema/loopweft.v1.schema.json')).toBe(projectJsonSchemaText());
  });

  it('describes the format for editors', () => {
    const schema = JSON.parse(projectJsonSchemaText()) as Record<string, unknown>;
    expect(schema.$id).toBe(SCHEMA_URL);
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.required).toEqual(['format', 'version', 'meta']);
    expect(Object.keys(schema.$defs as object)).toEqual(
      expect.arrayContaining([
        'Variable',
        'Link',
        'Loop',
        'Source',
        'Citation',
        'MapState',
        'Overlay',
        'Step',
      ]),
    );
  });
});
