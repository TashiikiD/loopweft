import { describe, expect, it } from 'vitest';
import {
  addLink,
  addVariable,
  errorsIn,
  flipSign,
  OpError,
  type Project,
  removeLink,
  removeVariable,
  setLink,
  setVariable,
  validateProject,
} from '../src/index.ts';
import { richProject } from './helpers.ts';

/** Runs `run`, expecting an OpError; returns it. */
function refused(run: () => unknown): OpError {
  try {
    run();
  } catch (error) {
    if (error instanceof OpError) return error;
    throw error;
  }
  throw new Error('expected the operation to refuse');
}

const ids = (project: Project, key: 'variables' | 'links' | 'loops') => project[key].map((x) => x.id);

describe('variables', () => {
  it('adds a variable, making its id from the label', () => {
    const before = richProject();
    const { project, result, summary } = addVariable(before, {
      label: 'Life expectancy',
      category: 'health',
    });
    expect(result).toEqual({ id: 'life_expectancy' });
    expect(summary).toBe('Added variable life_expectancy ("Life expectancy").');
    expect(project.variables.at(-1)).toEqual({
      id: 'life_expectancy',
      label: 'Life expectancy',
      category: 'health',
      citations: [],
    });
    expect(before).toEqual(richProject());
    expect(errorsIn(validateProject(project))).toEqual([]);
  });

  it('keeps ids unique across variables, links and loops', () => {
    expect(addVariable(richProject(), { label: 'R1' }).result.id).toBe('r1');
    expect(addVariable(richProject(), { label: 'births' }).result.id).toBe('births_2');
    expect(refused(() => addVariable(richProject(), { id: 'L1', label: 'L' })).kind).toBe('conflict');
  });

  it('refuses values the format would refuse, saying where', () => {
    const error = refused(() => addVariable(richProject(), { label: 'X', category: 'nobody' }));
    expect(error.kind).toBe('invalid');
    expect(error.exitCode).toBe(1);
    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'unknownCategory', path: ['variables', 3, 'category'] }),
    ]);
    const size = refused(() => addVariable(richProject(), { label: 'X', size: 'huge' as 'large' }));
    expect(size.issues).toEqual([
      expect.objectContaining({ code: 'invalidValue', path: ['variables', 3, 'size'] }),
    ]);
  });

  it('changes a variable named by id or label, and clears fields set to null', () => {
    const { project, result, summary } = setVariable(richProject(), 'POPULATION', {
      label: 'Residents',
      definition: null,
      size: null,
    });
    expect(result).toEqual({ id: 'population', changed: ['label', 'definition', 'size'] });
    expect(summary).toBe('Changed variable population: label, definition, size.');
    expect(project.variables[1]).toEqual({
      id: 'population',
      label: 'Residents',
      mapLabel: 'Popu-\nlation',
      category: 'people',
      role: 'stock',
      fields: { unit: 'people' },
      citations: [],
    });
  });

  it('says so when a change changes nothing, and returns the same project', () => {
    const before = richProject();
    const out = setVariable(before, 'births', { label: 'Births' });
    expect(out.project).toBe(before);
    expect(out.result.changed).toEqual([]);
    expect(out.summary).toBe('Nothing to change: variable births already has those values.');
  });

  it('refuses to clear a required field or change an id', () => {
    expect(refused(() => setVariable(richProject(), 'births', { label: null })).issues[0]).toMatchObject({
      code: 'missingField',
      path: ['variables', 0, 'label'],
    });
    expect(refused(() => setVariable(richProject(), 'births', { id: 'b' } as never)).kind).toBe('usage');
  });

  it('finds variables by label or id, and asks when a name is ambiguous or unknown', () => {
    const twins = addVariable(richProject(), { id: 'births_rate', label: 'BIRTHS' }).project;
    expect(refused(() => setVariable(twins, 'Births ', { definition: 'x' })).message).toBe(
      '"Births " matches 2 variables (births, births_rate); use the id of the one you mean.',
    );
    const missing = refused(() => setVariable(richProject(), 'birth', { definition: 'x' }));
    expect(missing.kind).toBe('notFound');
    expect(missing.message).toBe('No variable "birth" (did you mean "births"?).');
  });

  it('refuses to remove a variable that is still used, listing what uses it', () => {
    const error = refused(() => removeVariable(richProject(), 'births'));
    expect(error.kind).toBe('conflict');
    expect(error.message).toBe(
      'Variable births is still used by 3 links (L1, L2, L5), 1 loop (R1) and 2 story steps (S1.2, S1.3). ' +
        'Remove those first, or remove it with cascade to remove them too.',
    );
  });

  it('removes a variable with everything that depends on it, tidying the story', () => {
    const { project, result, summary } = removeVariable(richProject(), 'births', { cascade: true });
    expect(result).toEqual({
      id: 'births',
      removedLinks: ['L1', 'L2', 'L5'],
      removedLoops: ['R1'],
      changedSteps: ['S1.2', 'S1.3'],
    });
    expect(summary).toBe(
      'Removed variable births with 3 links (L1, L2, L5) and 1 loop (R1); updated 2 story steps.',
    );
    expect(ids(project, 'variables')).toEqual(['population', 'deaths']);
    expect(ids(project, 'links')).toEqual(['L3', 'L4']);
    expect(ids(project, 'loops')).toEqual(['B1']);
    expect(Object.keys(project.layout.positions).sort()).toEqual(['deaths', 'population']);
    const [, loop, hold] = project.story.scenes[0]?.steps ?? [];
    expect(loop?.map).toEqual({
      camera: { fit: ['population'], frame: 'right', maxZoom: 2 },
      variables: { base: 'dim', focus: ['population'] },
      links: { base: 'ghost' },
      labels: 'focus',
      trends: { population: 'up' },
      reveal: { mode: 'draw', stagger: 0.4, delay: 0.5 },
      clusters: 'dim',
      minimap: false,
    });
    expect(hold?.map).toEqual({ opacity: 0.6 });
    expect(errorsIn(validateProject(project))).toEqual([]);
  });
});

describe('links', () => {
  it('adds a link between variables named by id or label, with the next free id', () => {
    const { project, result, summary } = addLink(richProject(), {
      from: 'Deaths',
      to: 'population',
      sign: '-',
      type: 'side',
      rationale: 'A second, optional route.',
    });
    expect(result).toEqual({ id: 'L6' });
    expect(summary).toBe('Added link L6 (deaths → population, −).');
    expect(project.links.at(-1)).toEqual({
      id: 'L6',
      from: 'deaths',
      to: 'population',
      sign: '-',
      type: 'side',
      rationale: 'A second, optional route.',
      citations: [],
    });
  });

  it('refuses a second link with the same ends and type', () => {
    const error = refused(() =>
      addLink(richProject(), { from: 'births', to: 'population', sign: '+', type: 'main' }),
    );
    expect(error.kind).toBe('conflict');
    expect(error.message).toBe('L1 already links births to population as main; change it instead.');
  });

  it('needs a sign: unknown is "?", never a silent default', () => {
    const error = refused(() => addLink(richProject(), { from: 'births', to: 'deaths' } as never));
    expect(error.issues[0]).toMatchObject({ code: 'missingField', path: ['links', 5, 'sign'] });
    expect(
      addLink(richProject(), { from: 'births', to: 'deaths', sign: '?' }).project.links.at(-1)?.sign,
    ).toBe('?');
  });

  it('names unknown variables', () => {
    const error = refused(() => addLink(richProject(), { from: 'brths', to: 'deaths', sign: '+' }));
    expect(error.kind).toBe('notFound');
    expect(error.message).toBe('No variable "brths" (did you mean "births"?).');
  });

  it('changes a link', () => {
    const { project, result } = setLink(richProject(), 'L2', {
      sign: '-',
      weight: null,
      rationale: 'Parents.',
    });
    expect(result).toEqual({ id: 'L2', changed: ['sign', 'weight', 'rationale'] });
    expect(project.links[1]).toMatchObject({ sign: '-', rationale: 'Parents.' });
    expect(project.links[1]).not.toHaveProperty('weight');
  });

  it('refuses changes that would break the project', () => {
    expect(refused(() => setLink(richProject(), 'L2', { delay: null })).issues[0]).toMatchObject({
      code: 'delayLabelWithoutDelay',
    });
    const broken = refused(() => setLink(richProject(), 'L4', { to: 'births' }));
    expect(broken.kind).toBe('invalid');
    expect(broken.issues[0]).toMatchObject({ code: 'brokenLoop' });
    expect(refused(() => setLink(richProject(), 'L3', { from: 'births', to: 'population' })).kind).toBe(
      'conflict',
    );
  });

  it('refuses to remove a link a loop or the story still uses', () => {
    expect(refused(() => removeLink(richProject(), 'L1')).message).toBe(
      'Link L1 is still used by 1 loop (R1) and 1 story step (S1.2). ' +
        'Remove those first, or remove it with cascade to remove them too.',
    );
  });

  it('removes a link, with cascade also its loops and its mentions', () => {
    const plain = removeLink(richProject(), 'L5');
    expect(plain.summary).toBe('Removed link L5 (deaths → births, ?).');
    expect(ids(plain.project, 'links')).toEqual(['L1', 'L2', 'L3', 'L4']);

    const { project, result } = removeLink(richProject(), 'L4', { cascade: true });
    expect(result).toEqual({ id: 'L4', removedLoops: ['B1'], changedSteps: [] });
    expect(project.layout.bends).toEqual({});
    expect(errorsIn(validateProject(project))).toEqual([]);
  });

  it('flips a sign, and refuses to flip an unknown one', () => {
    const { project, result, summary } = flipSign(richProject(), 'L4');
    expect(result).toEqual({ id: 'L4', from: '-', to: '+' });
    expect(summary).toBe('Flipped L4 (deaths → population) from − to +.');
    expect(project.links[3]?.sign).toBe('+');
    expect(flipSign(project, 'L4').project.links[3]?.sign).toBe('-');
    const unknown = refused(() => flipSign(richProject(), 'L5'));
    expect(unknown.kind).toBe('invalid');
    expect(unknown.message).toBe('The sign of L5 is unknown (?); set it to + or - instead of flipping it.');
    expect(refused(() => flipSign(richProject(), 'L9')).kind).toBe('notFound');
  });
});

describe('every operation', () => {
  it('leaves its input untouched', () => {
    const before = richProject();
    const frozen = structuredClone(before);
    addVariable(before, { label: 'New' });
    setVariable(before, 'births', { label: 'Born' });
    removeVariable(before, 'deaths', { cascade: true });
    addLink(before, { from: 'deaths', to: 'births', sign: '+', type: 'main' });
    setLink(before, 'L1', { sign: '-' });
    removeLink(before, 'L1', { cascade: true });
    flipSign(before, 'L1');
    expect(before).toEqual(frozen);
  });
});
