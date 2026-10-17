// Source: DataViz packages/normalize/test/shorthand.test.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted
// for Loopweft: entities are variables, relations are links, groups are categories, columns are link fields.
import { describe, expect, it } from 'vitest';
import {
  applyShorthand,
  createProject,
  type Project,
  type ProjectInput,
  parseProject,
  parseShorthand,
  ShorthandError,
  validateProject,
} from '../src/index.ts';

const PLAN_EXAMPLE = `
Births -> Population (+)
Population -> Deaths (+, delay "5 yrs")
Deaths -> Population (-)
Fertility -> Births (?, conf=M)
@group social: Births, Population
`;

const empty = (): Project => createProject({ title: 'Test' });

/** A parsed project with the given variables and types (test data). */
function projectWith(input: Partial<ProjectInput>): Project {
  const result = parseProject({ format: 'loopweft', version: 1, meta: { title: 'Test' }, ...input });
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.project;
}

describe('parseShorthand', () => {
  it('parses every documented form', () => {
    const parsed = parseShorthand(PLAN_EXAMPLE);
    expect(parsed.issues).toEqual([]);
    expect(parsed.relations.map(({ line, ...r }) => r)).toEqual([
      { from: 'Births', to: 'Population', sign: '+', signGiven: true },
      { from: 'Population', to: 'Deaths', sign: '+', signGiven: true, delay: true, delayLabel: '5 yrs' },
      { from: 'Deaths', to: 'Population', sign: '-', signGiven: true },
      { from: 'Fertility', to: 'Births', sign: '?', signGiven: true, confidence: 'M' },
    ]);
    expect(parsed.groups).toEqual([{ line: 6, name: 'social', members: ['Births', 'Population'] }]);
  });

  it('accepts other arrows, sign words, keys and quoted labels', () => {
    const parsed = parseShorthand(
      [
        'A → B (positive, strength=0.4, rationale="slow")',
        '"Cost (USD)" --> "Demand, total" (opposite, delay: 2 years, confidence = high)',
        'Temperature (Celsius) -> Ice (-)',
        '# a comment',
        '// another comment',
      ].join('\n'),
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.relations.map(({ line, ...r }) => r)).toEqual([
      {
        from: 'A',
        to: 'B',
        sign: '+',
        signGiven: true,
        weight: 0.4,
        cells: [{ name: 'rationale', value: 'slow', column: 32 }],
      },
      {
        from: 'Cost (USD)',
        to: 'Demand, total',
        sign: '-',
        signGiven: true,
        delay: true,
        delayLabel: '2 years',
        confidence: 'high',
      },
      { from: 'Temperature (Celsius)', to: 'Ice', sign: '-', signGiven: true },
    ]);
  });

  it('records a missing sign as unknown and warns', () => {
    const parsed = parseShorthand('A -> B\nC -> D (Celsius)');
    expect(parsed.relations.map((r) => [r.to, r.sign, r.signGiven])).toEqual([
      ['B', '?', false],
      ['D (Celsius)', '?', false],
    ]);
    expect(parsed.issues.map((i) => `${i.severity} ${i.line}:${i.column}`)).toEqual([
      'warning 1:3',
      'warning 2:3',
    ]);
  });

  it('reports errors with line and column', () => {
    const parsed = parseShorthand(
      [
        'A -> B -> C (+)',
        'just words',
        'A -> (+)',
        'X -> Y (+, fast)',
        '@group : A',
        '@team x: A',
        'P -> "Q (+)',
      ].join('\n'),
    );
    expect(parsed.issues.map((i) => `${i.line}:${i.column} ${i.message}`)).toEqual([
      '1:8 Only one arrow per line; split chains into separate lines.',
      '2:1 Expected a relation such as "A -> B (+)".',
      '3:5 The relation has no effect after the arrow.',
      '4:12 Unknown item "fast" (use a sign, delay, conf=, weight= or field=value).',
      '5:1 Write groups as "@group <name>: A, B".',
      '6:1 Unknown directive "@team"; only @group is supported.',
      '7:6 Unterminated quote.',
    ]);
  });
});

describe('applyShorthand', () => {
  it('adds variables, links and categories', () => {
    const { project, result, summary } = applyShorthand(empty(), PLAN_EXAMPLE);
    expect(result.addedVariables).toEqual(['births', 'population', 'deaths', 'fertility']);
    expect(result.addedLinks).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(result.addedCategories).toEqual(['social']);
    expect(result.warnings).toEqual([]);
    expect(summary).toBe('Added 4 links, 4 variables and 1 category from shorthand.');
    expect(project.variables).toEqual([
      { id: 'births', label: 'Births', category: 'social', citations: [] },
      { id: 'population', label: 'Population', category: 'social', citations: [] },
      { id: 'deaths', label: 'Deaths', citations: [] },
      { id: 'fertility', label: 'Fertility', citations: [] },
    ]);
    expect(project.links[1]).toEqual({
      id: 'L2',
      from: 'population',
      to: 'deaths',
      sign: '+',
      delay: true,
      delayLabel: '5 yrs',
      citations: [],
    });
    expect(project.links[3]).toEqual({
      id: 'L4',
      from: 'fertility',
      to: 'births',
      sign: '?',
      confidence: 'medium',
      citations: [],
    });
    expect(project.types.categories).toEqual([{ id: 'social', name: 'social' }]);
    expect(validateProject(project)).toEqual([]);
  });

  it('matches existing variables by label, ignoring case', () => {
    const first = applyShorthand(empty(), 'Births -> Population (+)');
    const second = applyShorthand(first.project, 'population -> BIRTHS (+)');
    expect(second.result.addedVariables).toEqual([]);
    expect(second.project.links[1]).toMatchObject({ from: 'population', to: 'births' });
  });

  it('asks for an id when a name matches several variables', () => {
    const twins = projectWith({
      variables: [
        { id: 'g1', label: 'Growth' },
        { id: 'g2', label: 'growth' },
        { id: 'x', label: 'X' },
      ],
    });
    expect(() => applyShorthand(twins, 'X -> Y (+)\nGrowth -> X (+)')).toThrow(
      'line 2, column 1: "Growth" matches 2 variables (g1, g2); write the id of the one you mean.',
    );
    expect(() => applyShorthand(twins, '@group economy: x, GROWTH')).toThrow(/matches 2 variables/);
    expect(applyShorthand(twins, 'g2 -> X (+)').project.links[0]).toMatchObject({ from: 'g2', to: 'x' });
  });

  it('changes nothing when the text has errors', () => {
    const before = empty();
    expect(() => applyShorthand(before, 'A -> B (+)\nnonsense')).toThrow(ShorthandError);
    expect(before).toEqual(empty());
  });

  it('reports every error at once, in order', () => {
    const twins = projectWith({
      variables: [
        { id: 'g1', label: 'Growth' },
        { id: 'g2', label: 'growth' },
      ],
    });
    expect(() => applyShorthand(twins, 'Growth -> X (+)\nnonsense\n@group a: growth')).toThrow(
      [
        'line 1, column 1: "Growth" matches 2 variables (g1, g2); write the id of the one you mean.',
        'line 2, column 1: Expected a relation such as "A -> B (+)".',
        'line 3, column 1: "growth" matches 2 variables (g1, g2); write the id of the one you mean.',
      ].join('\n'),
    );
  });

  it('lists the existing variables the text named', () => {
    const first = applyShorthand(empty(), 'Births -> Population (+)');
    const second = applyShorthand(first.project, 'Births -> Deaths (-)\nDeaths -> Births (+)');
    expect(second.result.matchedVariables).toEqual(['births']);
    expect(second.result.addedVariables).toEqual(['deaths']);
  });

  it('warns about a link written without a sign, and records it as unknown', () => {
    const { project, result } = applyShorthand(empty(), 'A -> B');
    expect(project.links[0]?.sign).toBe('?');
    expect(result.warnings.map((w) => w.message)).toEqual([
      'No sign given for A -> B; recorded as unknown (?).',
    ]);
  });

  it('refuses a link that already exists, unless it is of another type', () => {
    const typed = projectWith({ types: { linkTypes: [{ id: 'side_effect', name: 'Side-effect' }] } });
    expect(() => applyShorthand(typed, 'A -> B (+)\nA -> B (-)')).toThrow(
      'line 2, column 1: a -> b already exists as L1; change that link instead.',
    );
    expect(applyShorthand(typed, 'A -> B (+)\nA -> B (-, type=Side-effect)').project.links[1]).toMatchObject({
      sign: '-',
      type: 'side_effect',
    });
  });

  it('puts variables in an existing category by its name', () => {
    const people = projectWith({ types: { categories: [{ id: 'people', name: 'People' }] } });
    const { project, result } = applyShorthand(people, '@group PEOPLE: Births');
    expect(result.addedCategories).toEqual([]);
    expect(project.variables).toEqual([{ id: 'births', label: 'Births', category: 'people', citations: [] }]);
  });
});

describe('applyShorthand with field=value items', () => {
  const field = (id: string, name: string, kind: 'text' | 'number') => ({
    id,
    name,
    kind,
    appliesTo: 'links' as const,
  });
  const project = projectWith({
    variables: [{ id: 'a', label: 'A' }],
    types: {
      linkTypes: [{ id: 'cascade', name: 'Cascade' }],
      fields: [
        field('effect_weight', 'Effect weight', 'number'),
        field('note_1', 'Remark', 'text'),
        field('note_2', 'remark', 'text'),
        {
          id: 'evidence',
          name: 'Evidence',
          kind: 'choice',
          options: [
            { id: 'explicit', name: 'Explicit' },
            { id: 'synthesis', name: 'Synthesis' },
          ],
        },
      ],
    },
  });

  it('parses them with where they stand', () => {
    expect(parseShorthand('A -> B (+, custom.weight=3, Effect weight: "2")').relations[0]?.cells).toEqual([
      { name: 'custom.weight', value: '3', column: 12 },
      { name: 'Effect weight', value: '2', column: 29 },
    ]);
  });

  it('sets fields by key or by name, reading values for their kind', () => {
    const { project: next } = applyShorthand(
      project,
      'A -> B (+, effect_weight=0.5, rationale="crowding, slowly", type=Cascade)\n' +
        'B -> A (Effect weight=2, sign=-, Evidence: Explicit, conditional=yes, delayLabel=decades, delay)',
    );
    expect(next.links).toEqual([
      {
        id: 'L1',
        from: 'a',
        to: 'b',
        sign: '+',
        type: 'cascade',
        rationale: 'crowding, slowly',
        fields: { effect_weight: 0.5 },
        citations: [],
      },
      {
        id: 'L2',
        from: 'b',
        to: 'a',
        sign: '-',
        conditional: true,
        delay: true,
        delayLabel: 'decades',
        fields: { effect_weight: 2, evidence: 'explicit' },
        citations: [],
      },
    ]);
  });

  it('refuses a value that does not fit its field, rather than keeping it as text', () => {
    expect(() => applyShorthand(project, 'A -> B (+, effect_weight=heavy)')).toThrow(
      'line 1, column 12: effect_weight must be a number, got "heavy".',
    );
    expect(() => applyShorthand(project, 'A -> B (+, evidence=strong)')).toThrow(
      'line 1, column 12: evidence must be one of "explicit", "synthesis", got "strong".',
    );
    expect(() => applyShorthand(project, 'A -> B (+, conditional=maybe)')).toThrow(
      'line 1, column 12: conditional must be true or false (yes or no), got "maybe".',
    );
    expect(() => applyShorthand(project, 'A -> B (+, effect_weight=1,5)')).toThrow(ShorthandError);
    expect(() => applyShorthand(project, 'A -> B (+, conf=sure)')).toThrow(
      'line 1, column 12: confidence must be low, medium or high, got "sure".',
    );
    expect(() => applyShorthand(project, 'A -> B (+, weight=-2)')).toThrow(
      'line 1, column 12: weight must be 0 or more, got -2.',
    );
    expect(() => applyShorthand(project, 'A -> B (+, delayLabel=soon)')).toThrow(
      'line 1, column 1: delayLabel needs a delay; write delay "soon".',
    );
  });

  it('takes a sign given by its field', () => {
    const { project: next, result } = applyShorthand(project, 'A -> B (Sign=-)');
    expect(next.links[0]?.sign).toBe('-');
    expect(result.warnings).toEqual([]);
  });

  it('refuses unknown, ambiguous, structural and repeated fields, all at once', () => {
    const text = [
      'A -> B (+, effect_wieght=3)',
      'A -> B (+, remark=x)',
      'A -> B (+, from=C)',
      'A -> B (+, effect_weight=1, Effect weight=2)',
      'A -> B (strength=1, Strength=2)',
      'A -> B (+, colour=red)',
    ].join('\n');
    expect(() => applyShorthand(project, text)).toThrow(
      [
        'line 1, column 12: Links have no field "effect_wieght"; did you mean effect_weight?',
        'line 2, column 12: "remark" names 2 fields (note_1, note_2); write the key of the one you mean.',
        'line 3, column 12: from comes from the arrow; write "A -> B".',
        'line 4, column 29: effect_weight is set twice.',
        'line 5, column 21: weight is set twice.',
        'line 6, column 12: Links have no field "colour".',
      ].join('\n'),
    );
  });

  it('asks which is meant when a short form shares its name with a custom field', () => {
    const weighted = projectWith({
      types: { fields: [{ id: 'custom_weight', name: 'Weight', kind: 'number', appliesTo: 'links' }] },
    });
    expect(() => applyShorthand(weighted, 'A -> B (+, weight=3)')).toThrow(
      'line 1, column 12: "weight" is short for weight, but the custom field "Weight" (custom_weight) has that ' +
        'name too; write custom_weight= for the custom field, or rename it.',
    );
    expect(
      applyShorthand(weighted, 'A -> B (+, strength=0.2, custom_weight=3)').project.links[0],
    ).toMatchObject({
      weight: 0.2,
      fields: { custom_weight: 3 },
    });
  });
});
