// What a picture export draws and what its files are called: no browser needed.
import { readFileSync } from 'node:fs';
import { OpError, type Project, readProject } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import { checkPictureJob, fileStem, pictureSize, picturesFor, stepFileName } from '../src/pictures.ts';

const read = readProject(
  readFileSync(new URL('../../../examples/polycrisis.loopweft', import.meta.url), 'utf8'),
);
if (!read.ok) throw new Error('The example does not open.');
const example: Project = read.project;

describe('picturesFor', () => {
  it('names one step by its key, found as the command line finds steps', () => {
    expect(picturesFor(example, { kind: 'step', step: 'S05.6b' }, 'png')).toEqual([
      { kind: 'step', sceneIndex: 5, stepIndex: 6, key: 'S05.6b', name: 'S05.6b.png' },
    ]);
  });

  it('lists every step in story order', () => {
    const all = picturesFor(example, { kind: 'steps' }, 'png');
    expect(all).toHaveLength(70);
    expect(all.slice(0, 3).map((p) => p.name)).toEqual(['S00.1.png', 'S01.1.png', 'S01.2.png']);
    expect(all.at(-1)?.name).toBe('S10.4.png');
  });

  it('draws the whole map with or without a story', () => {
    const bare = { ...example, story: { scenes: [] } };
    expect(picturesFor(bare, { kind: 'map' }, 'png')).toEqual([
      { kind: 'map', trim: false, name: 'map.png' },
    ]);
    expect(picturesFor(bare, { kind: 'map', trim: true }, 'png')).toEqual([
      { kind: 'map', trim: true, name: 'map.png' },
    ]);
  });

  it('refuses a step that is not there, and every step of a story with none', () => {
    expect(() => picturesFor(example, { kind: 'step', step: 'S99.1' }, 'png')).toThrow(/No scene "S99"/);
    expect(() => picturesFor(example, { kind: 'step', step: 'S05' }, 'png')).toThrow(OpError);
    const bare = { ...example, story: { scenes: [] } };
    expect(() => picturesFor(bare, { kind: 'steps' }, 'png')).toThrow(/no steps to draw/);
  });
});

describe('file names', () => {
  it("are the step's key, kept clear of the names Windows keeps for devices", () => {
    expect(stepFileName('S04.2a', 'png')).toBe('S04.2a.png');
    expect(stepFileName('CON.1', 'png')).toBe('_CON.1.png');
    expect(stepFileName('lpt1.2', 'svg')).toBe('_lpt1.2.svg');
    expect(stepFileName('Console.1', 'png')).toBe('Console.1.png');
  });

  it("start from the project's title", () => {
    expect(fileStem(example.meta.title)).toBe('global-polycrisis-the-connections-that-change-everything');
    expect(fileStem('')).toBe('map');
  });
});

describe('checkPictureJob', () => {
  it('takes scale 1 or 2, and trims only the whole map', () => {
    const job = {
      format: 'png',
      target: { kind: 'map', trim: true },
      scale: 2,
      categoryWords: false,
    } as const;
    expect(() => checkPictureJob(job)).not.toThrow();
    expect(() => checkPictureJob({ ...job, scale: 3 as 2 })).toThrow(/scale is 1/);
    expect(() =>
      checkPictureJob({ ...job, target: { kind: 'steps', trim: true } as unknown as { kind: 'steps' } }),
    ).toThrow(/Only the whole map/);
  });

  it('makes only an SVG drawing for PowerPoint and Word', () => {
    const job = {
      format: 'svg',
      target: { kind: 'step', step: 'S04.2a' },
      scale: 1,
      categoryWords: false,
    } as const;
    expect(() => checkPictureJob({ ...job, office: true })).not.toThrow();
    for (const format of ['png', 'jpeg'] as const) {
      expect(() => checkPictureJob({ ...job, format, office: true })).toThrow(
        'Only an SVG drawing is made for PowerPoint and Word.',
      );
    }
  });

  it('sizes pictures from the stage', () => {
    expect(pictureSize(1)).toEqual({ width: 1920, height: 1080 });
    expect(pictureSize(2)).toEqual({ width: 3840, height: 2160 });
    expect(pictureSize(2, { w: 1000, h: 500.4 })).toEqual({ width: 2000, height: 1001 });
  });
});
