// A project's own palettes: made, changed and removed by the operations the Studio runs, named by the
// theme like a preset, never a quiet fallback.
import { describe, expect, it } from 'vitest';
import {
  addPalette,
  errorsIn,
  OpError,
  type Project,
  paletteOf,
  removePalette,
  setPalette,
  setTheme,
  themePalettes,
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

const WARM = ['#B2182B', '#EF8A62', '#FDDBC7'];

/** The rich test project with a palette of its own, "Warm", that its theme uses. */
function withWarm(): Project {
  const added = addPalette(richProject(), { name: 'Warm', colours: WARM });
  return setTheme(added.project, { palette: added.result.id }).project;
}

describe("a project's own palettes", () => {
  it('adds one, its id made from its name and never a preset’s, and the theme can name it', () => {
    const before = richProject();
    const frozen = structuredClone(before);
    const { project, result, summary } = addPalette(before, {
      name: 'Loopweft',
      colours: WARM,
      description: 'Three warm colours.',
    });
    expect(before).toEqual(frozen);
    // "loopweft" is a preset's id, so the new palette takes the next free one.
    expect(result).toEqual({ id: 'loopweft_2' });
    expect(summary).toBe('Added the palette "Loopweft" (loopweft_2): 3 colours.');
    expect(project.theme.palettes).toEqual([
      { id: 'loopweft_2', name: 'Loopweft', colours: WARM, description: 'Three warm colours.' },
    ]);
    const used = setTheme(project, { palette: 'loopweft_2' }).project;
    expect(paletteOf(used.theme)).toEqual({
      id: 'loopweft_2',
      name: 'Loopweft',
      colours: WARM,
      about: 'Three warm colours.',
      own: true,
    });
    expect(themePalettes(used.theme).map((p) => `${p.id}${p.own ? ' (own)' : ''}`)).toEqual([
      'loopweft',
      'okabe-ito',
      'tol-bright',
      'tol-muted',
      'loopweft_2 (own)',
    ]);
    expect(errorsIn(validateProject(used))).toEqual([]);
  });

  it('makes an id of at most 80 characters from a long name, numbered when taken; a given id stays as given', () => {
    const name = `Colours ${'very '.repeat(30)}warm`;
    const first = addPalette(richProject(), { name, colours: WARM });
    const firstId = first.result.id;
    expect(firstId.length).toBeLessThanOrEqual(80);
    expect(firstId.startsWith('colours_very_very')).toBe(true);
    const second = addPalette(first.project, { name, colours: WARM });
    expect(second.result.id).toMatch(/_2$/);
    expect(second.result.id.length).toBeLessThanOrEqual(80);
    expect(second.result.id).not.toBe(firstId);
    expect(errorsIn(validateProject(second.project))).toEqual([]);
    // A name whose id is exactly 80 characters still leaves room for the number.
    const eighty = 'a'.repeat(80);
    const exact = addPalette(addPalette(richProject(), { name: eighty, colours: WARM }).project, {
      name: eighty,
      colours: WARM,
    });
    expect(exact.result.id).toBe(`${'a'.repeat(78)}_2`);
    expect(
      refused(() => addPalette(richProject(), { id: 'b'.repeat(81), name: 'Mine', colours: WARM })).kind,
    ).toBe('invalid');
  });

  it('refuses a taken id, fewer than two colours and a colour it cannot read', () => {
    expect(
      refused(() => addPalette(richProject(), { id: 'tol-muted', name: 'Mine', colours: WARM })).kind,
    ).toBe('conflict');
    const few = refused(() => addPalette(richProject(), { name: 'One', colours: ['#B2182B'] }));
    expect(few.kind).toBe('invalid');
    const unreadable = refused(() => addPalette(richProject(), { name: 'Red', colours: ['red', '#B2182B'] }));
    expect(unreadable.issues[0]).toMatchObject({ path: ['theme', 'palettes', 0, 'colours', 0] });
  });

  it('changes its name, colours and description, never its id; a preset stays as it is', () => {
    const { project, result, summary } = setPalette(withWarm(), 'warm', {
      name: 'Warmer',
      colours: [...WARM].reverse(),
      description: 'Reversed.',
    });
    expect(result).toEqual({ id: 'warm', changed: ['name', 'colours', 'description'] });
    expect(summary).toBe('Changed the palette warm: name, colours, description.');
    expect(project.theme.palettes?.[0]).toEqual({
      id: 'warm',
      name: 'Warmer',
      colours: ['#FDDBC7', '#EF8A62', '#B2182B'],
      description: 'Reversed.',
    });
    expect(setPalette(project, 'warm', { description: null }).project.theme.palettes?.[0]).not.toHaveProperty(
      'description',
    );
    expect(setPalette(project, 'warm', { name: 'Warmer' }).summary).toBe(
      'Nothing to change: the palette warm already has those values.',
    );
    expect(refused(() => setPalette(project, 'okabe-ito', { name: 'Mine' })).message).toBe(
      'okabe-ito is a preset, which stays as it is; make a palette of your own from it.',
    );
    expect(refused(() => setPalette(project, 'cool', { name: 'Cool' })).kind).toBe('notFound');
  });

  it('removes one only when the theme does not use it, leaving no empty list behind', () => {
    const project = withWarm();
    expect(refused(() => removePalette(project, 'warm')).message).toBe(
      '"Warm" is the palette the map uses; choose another palette first.',
    );
    const back = setTheme(project, { palette: null }).project;
    const { project: removed, summary } = removePalette(back, 'warm');
    expect(summary).toBe('Removed the palette "Warm" (warm).');
    expect(removed.theme).not.toHaveProperty('palettes');
    expect(paletteOf(removed.theme).id).toBe('loopweft');
  });

  it('lets the theme name only a palette that exists', () => {
    expect(refused(() => setTheme(withWarm(), { palette: 'cool' })).issues[0]).toMatchObject({
      code: 'unknownPalette',
      path: ['theme', 'palette'],
    });
  });
});
