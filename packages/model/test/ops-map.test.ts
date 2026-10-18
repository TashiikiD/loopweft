// The operations on the map's vocabulary, layout, named loops, meta and theme (ops.test.ts covers variables
// and links).
import { describe, expect, it } from 'vitest';
import {
  addLoop,
  addType,
  applyLayout,
  errorsIn,
  loopKey,
  moveType,
  moveVariables,
  OpError,
  readFieldValue,
  removeLoop,
  removeType,
  resolveField,
  setBends,
  setHome,
  setLabelSide,
  setLoop,
  setMeta,
  setPinned,
  setTheme,
  setType,
  validateProject,
} from '../src/index.ts';
import { richProject } from './helpers.ts';

function refused(run: () => unknown): OpError {
  try {
    run();
  } catch (error) {
    if (error instanceof OpError) return error;
    throw error;
  }
  throw new Error('expected the operation to refuse');
}

describe('categories, roles, link types and fields', () => {
  it('adds one, making its id from the name, unique in its own list', () => {
    const { project, result, summary } = addType(richProject(), 'category', {
      name: 'Land use',
      colour: '#87C9F4',
    });
    expect(result).toEqual({ id: 'land_use' });
    expect(summary).toBe('Added category land_use ("Land use").');
    expect(project.types.categories.at(-1)).toEqual({ id: 'land_use', name: 'Land use', colour: '#87C9F4' });
    // A category may share an id with a variable or a role: each list has its own ids.
    expect(addType(richProject(), 'category', { name: 'Births' }).result.id).toBe('births');
    expect(addType(richProject(), 'category', { name: 'People' }).result.id).toBe('people_2');
    expect(
      refused(() => addType(richProject(), 'role', { id: 'stock', name: 'S', shape: 'circle' })).kind,
    ).toBe('conflict');
  });

  it('refuses what the format refuses: a role needs a shape, a choice field its options', () => {
    expect(
      refused(() => addType(richProject(), 'role', { name: 'Driver' } as never)).issues[0],
    ).toMatchObject({
      code: 'missingField',
      path: ['types', 'roles', 3, 'shape'],
    });
    expect(
      refused(() => addType(richProject(), 'field', { name: 'Scale', kind: 'choice' })).issues[0],
    ).toMatchObject({ code: 'choiceWithoutOptions', path: ['types', 'fields', 2, 'options'] });
  });

  it('changes one named by id or name, and refuses a change its uses cannot follow', () => {
    const { project, result } = setType(richProject(), 'linkType', 'Side-effect', {
      style: 'dashed',
      marker: null,
    });
    expect(result).toEqual({ id: 'side', changed: ['style', 'marker'] });
    expect(project.types.linkTypes[1]).toEqual({
      id: 'side',
      name: 'Side-effect',
      style: 'dashed',
      optional: true,
    });
    // L1 holds "explicit": the option cannot go while a value uses it.
    const options = refused(() =>
      setType(richProject(), 'field', 'evidence', { options: [{ id: 'synthesis', name: 'Synthesis' }] }),
    );
    expect(options.kind).toBe('invalid');
    expect(options.issues[0]).toMatchObject({
      code: 'invalidFieldValue',
      path: ['links', 0, 'fields', 'evidence'],
    });
    // population holds a unit: the field cannot become one for links only.
    expect(
      refused(() => setType(richProject(), 'field', 'unit', { appliesTo: 'links' })).issues[0],
    ).toMatchObject({
      code: 'fieldNotApplicable',
    });
  });

  it('moves one to another place in its list, which sets the order of palette colours', () => {
    const { project, summary } = moveType(richProject(), 'category', 'health', 0);
    expect(project.types.categories.map((c) => c.id)).toEqual(['health', 'people']);
    expect(summary).toBe('Moved category health from place 2 to place 1.');
    expect(refused(() => moveType(richProject(), 'category', 'health', 5)).kind).toBe('usage');
  });

  it('refuses to remove one still in use, naming the uses', () => {
    const error = refused(() => removeType(richProject(), 'category', 'people'));
    expect(error.kind).toBe('conflict');
    expect(error.message).toBe(
      'Category people is still used: 2 variables (births, population) and 1 group (people) use it. ' +
        'Change those first, or remove it with cascade to clear them.',
    );
    expect(refused(() => removeType(richProject(), 'field', 'evidence')).message).toBe(
      'Field evidence is still used: 1 link (L1) hold a value of it. Change those first, or remove it with cascade to clear them.',
    );
  });

  it('removes one with cascade, clearing its uses', () => {
    const category = removeType(richProject(), 'category', 'people', { cascade: true });
    expect(category.summary).toBe(
      'Removed category people; cleared it from 2 variables (births, population) and removed 1 group (people).',
    );
    expect(category.project.variables.map((v) => v.category)).toEqual([undefined, undefined, 'health']);
    expect(category.project.layout.groups).toEqual([]);
    const field = removeType(richProject(), 'field', 'evidence', { cascade: true });
    expect(field.project.links[0]?.fields).toBeUndefined();
    const role = removeType(richProject(), 'role', 'policy');
    expect(role.summary).toBe('Removed role policy.');
    for (const out of [category, field, role]) expect(errorsIn(validateProject(out.project))).toEqual([]);
  });
});

describe('custom field values', () => {
  it('names a field by id or name, for the elements it applies to', () => {
    const project = richProject();
    expect(resolveField(project, 'Evidence', 'links').id).toBe('evidence');
    expect(() => resolveField(project, 'evidence', 'variables')).toThrow('Field evidence is for links only.');
    expect(() => resolveField(project, 'evidnce', 'links')).toThrow(
      'Links have no field "evidnce" (did you mean "evidence"?).',
    );
  });

  it('reads text strictly for the kind of field', () => {
    const field = (kind: 'number' | 'boolean' | 'text') => ({ id: 'f', name: 'F', kind });
    expect(readFieldValue(field('number'), ' 2.5 ')).toEqual({ value: 2.5 });
    expect(readFieldValue(field('number'), '1,5')).toEqual({
      error: 'f must be a plain number; "1,5" could be 1.5 (comma as decimal separator).',
    });
    expect(readFieldValue(field('boolean'), 'Yes')).toEqual({ value: true });
    expect(readFieldValue(field('text'), '  two   words ')).toEqual({ value: 'two words' });
    const evidence = richProject().types.fields[0] as never;
    expect(readFieldValue(evidence, 'Synthesis')).toEqual({ value: 'synthesis' });
    expect(readFieldValue(evidence, 'guess')).toEqual({
      error: 'evidence must be one of "explicit", "synthesis", got "guess".',
    });
  });
});

describe('the layout', () => {
  it('moves variables named by id or label, keeping their label sides and pins', () => {
    const { project, result, summary } = moveVariables(richProject(), {
      Population: { x: 520, y: 310 },
      deaths: { x: 700, y: 300 },
    });
    expect(result).toEqual({ moved: ['population'] });
    expect(summary).toBe('Moved variable population.');
    expect(project.layout.positions.population).toEqual({ x: 520, y: 310, labelSide: 'below', pinned: true });
    expect(refused(() => moveVariables(richProject(), { births: { x: Number.NaN, y: 1 } })).kind).toBe(
      'invalid',
    );
  });

  it('pins and unpins, and will not pin a variable that has no place yet', () => {
    const pinned = setPinned(richProject(), ['births', 'population'], true);
    expect(pinned.result).toEqual({ changed: ['births'] });
    expect(pinned.project.layout.positions.births?.pinned).toBe(true);
    const unpinned = setPinned(richProject(), ['population'], false);
    expect(unpinned.project.layout.positions.population).toEqual({ x: 500, y: 300, labelSide: 'below' });
    const placeless = { ...richProject() };
    placeless.layout = { ...placeless.layout, positions: {} };
    expect(refused(() => setPinned(placeless, ['births'], true)).message).toBe(
      'births has no position yet, so there is nowhere to pin it; place it first.',
    );
  });

  it('sets and clears label sides and curves', () => {
    expect(setLabelSide(richProject(), 'births', 'above').project.layout.positions.births).toEqual({
      x: 300,
      y: 300,
      labelSide: 'above',
    });
    expect(setLabelSide(richProject(), 'deaths', null).project.layout.positions.deaths).toEqual({
      x: 700,
      y: 300,
    });
    const bends = setBends(richProject(), { L1: 0.3, L4: null });
    expect(bends.project.layout.bends).toEqual({ L1: 0.3 });
    expect(bends.summary).toBe('Set the curve of L1; curve L4 automatically again.');
    expect(refused(() => setBends(richProject(), { L1: 2 })).kind).toBe('invalid');
    expect(refused(() => setBends(richProject(), { L9: 0.1 })).kind).toBe('notFound');
  });

  it('sets and clears the home view', () => {
    const home = setHome(richProject(), { x: 500, y: 300, zoom: 1.5 });
    expect(home.project.layout.home).toEqual({ x: 500, y: 300, zoom: 1.5 });
    expect(home.summary).toBe('Set the home view: centre (500, 300), zoom 1.5.');
    expect(setHome(home.project, null).project.layout.home).toBeUndefined();
    expect(refused(() => setHome(richProject(), { x: 0, y: 0, zoom: 0 })).issues[0]).toMatchObject({
      code: 'tooSmall',
      path: ['layout', 'home', 'zoom'],
    });
  });

  it('takes in an automatic layout: pinned variables stay, its groups replace the old ones', () => {
    const { project, result, summary } = applyLayout(
      richProject(),
      {
        positions: {
          births: { x: 100, y: 200 },
          population: { x: 1, y: 1 },
          deaths: { x: 900, y: 200 },
        },
        groups: [],
      },
      'as a flow',
    );
    expect(result).toEqual({
      moved: ['births', 'deaths'],
      pinned: ['population'],
      groups: { removed: ['people'], added: [] },
    });
    expect(summary).toBe(
      'Laid out the map as a flow: moved 2 variables; 1 pinned variable stayed and removed 1 group halo.',
    );
    expect(project.layout.positions).toEqual({
      births: { x: 100, y: 200 },
      population: { x: 500, y: 300, labelSide: 'below', pinned: true },
      deaths: { x: 900, y: 200, labelSide: 'right' },
    });
    // Curves set by hand stay.
    expect(project.layout.bends).toEqual({ L4: -0.2 });
  });
});

describe('named loops', () => {
  it('names a loop, its id following its polarity', () => {
    const base = richProject();
    base.loops = [];
    const r = addLoop(base, { name: 'More births', links: ['L2', 'L1'] });
    expect(r.result).toEqual({ id: 'R1', polarity: 'R' });
    expect(r.summary).toBe('Named loop R1 ("More births"): 2 links, reinforcing.');
    const b = addLoop(r.project, { name: 'Deaths', links: ['L3', 'L4'], archetype: 'Limits to growth' });
    expect(b.result).toEqual({ id: 'B1', polarity: 'B' });
    expect(b.project.loops.at(-1)).toEqual({
      id: 'B1',
      name: 'Deaths',
      links: ['L3', 'L4'],
      archetype: 'Limits to growth',
      citations: [],
    });
  });

  it('refuses links that do not close a loop, and a loop already named', () => {
    const broken = refused(() => addLoop(richProject(), { name: 'X', links: ['L1', 'L3'] }));
    expect(broken.kind).toBe('invalid');
    expect(broken.issues[0]).toMatchObject({ code: 'brokenLoop' });
    expect(refused(() => addLoop(richProject(), { name: 'Again', links: ['L2', 'L1'] })).message).toBe(
      'Loop R1 ("Births grow the population") already goes round those links.',
    );
    expect(loopKey(['L2', 'L3', 'L1'])).toBe(loopKey(['L1', 'L2', 'L3']));
  });

  it('changes a named loop, and removes it only with cascade while the story shows it', () => {
    expect(
      setLoop(richProject(), 'B1', { caution: null, name: 'Deaths shrink the population' }).result,
    ).toEqual({
      id: 'B1',
      changed: ['caution', 'name'],
    });
    expect(refused(() => removeLoop(richProject(), 'R1')).message).toBe(
      'Loop R1 is still shown by 1 story step (S1.2). Remove it from those first, or remove it with cascade to remove it from them too.',
    );
    const removed = removeLoop(richProject(), 'R1', { cascade: true });
    expect(removed.summary).toBe(
      'Removed loop R1 ("Births grow the population"); updated 1 story step. Its links stay.',
    );
    expect(removed.project.links).toHaveLength(5);
    expect(errorsIn(validateProject(removed.project))).toEqual([]);
  });
});

describe('meta and theme', () => {
  it("changes the project's title and description, refusing an empty title", () => {
    const { project, result } = setMeta(richProject(), {
      title: 'Population',
      description: null,
      author: 'A. Author',
    });
    expect(result).toEqual({ changed: ['title', 'description', 'author'] });
    expect(project.meta).toEqual({ title: 'Population', author: 'A. Author' });
    expect(refused(() => setMeta(richProject(), { title: null })).issues[0]).toMatchObject({
      code: 'missingField',
    });
  });

  it('changes the theme: base, palette and fonts', () => {
    const { project, result } = setTheme(richProject(), {
      base: 'cinematic-dark',
      palette: 'okabe-ito',
      fonts: null,
    });
    expect(result).toEqual({ changed: ['base', 'palette', 'fonts'] });
    expect(project.theme).toEqual({ base: 'cinematic-dark', palette: 'okabe-ito' });
    expect(refused(() => setTheme(richProject(), { palette: 'neon' as never })).issues[0]).toMatchObject({
      code: 'invalidValue',
      path: ['theme', 'palette'],
    });
  });
});

describe('every map operation', () => {
  it('leaves its input untouched', () => {
    const before = richProject();
    const frozen = structuredClone(before);
    addType(before, 'category', { name: 'New' });
    setType(before, 'role', 'stock', { shape: 'hexagon' });
    moveType(before, 'role', 'policy', 0);
    removeType(before, 'category', 'people', { cascade: true });
    moveVariables(before, { births: { x: 1, y: 2 } });
    setPinned(before, ['births'], true);
    setLabelSide(before, 'births', 'left');
    setBends(before, { L1: 0.5, L4: null });
    setHome(before, { x: 1, y: 2, zoom: 3 });
    applyLayout(before, { positions: { births: { x: 0, y: 0 } }, groups: [] }, 'by hand');
    setLoop(before, 'R1', { name: 'Renamed' });
    removeLoop(before, 'R1', { cascade: true });
    setMeta(before, { title: 'T' });
    setTheme(before, { base: 'high-contrast' });
    expect(before).toEqual(frozen);
  });
});
