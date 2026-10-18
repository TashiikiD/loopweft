// The colour-vision tests are DataViz's (packages/render-kit/test/cvd.test.ts @ efcdbe2, TashiikiD/DataViz,
// private), copied for Loopweft with its import paths; the palette and category checks are Loopweft's.

import { PALETTE_IDS, PALETTES } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import { checkColors, colorDifference, deltaE2000, simulateVision, VISIONS } from '../src/colour/cvd.ts';
import { categoryColours, checkCategories, checkPalette, MIN_CONTRAST } from '../src/index.ts';
import { example } from './helpers.ts';

describe('CIEDE2000', () => {
  // Sharma, Wu & Dalal (2005), test data pairs 1, 3, 7, 17, 19 and 25.
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [56, -27, -3], 31.903],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ])('matches the published difference of %j and %j', (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
    expect(deltaE2000(b, a)).toBeCloseTo(expected, 4);
  });

  it('is zero for one colour', () => {
    expect(colorDifference('#0072B2', '#0072b2')).toBe(0);
  });
});

describe('colour-vision simulation', () => {
  it('keeps white and black under every condition', () => {
    for (const vision of VISIONS) {
      expect(simulateVision('#FFFFFF', vision)).toBe('#FFFFFF');
      expect(simulateVision('#000000', vision)).toBe('#000000');
    }
  });

  it('turns colours into greys of their luminance', () => {
    expect(simulateVision('#D62728', 'greyscale')).toBe('#6F6F6F');
    expect(simulateVision('#808080', 'greyscale')).toBe('#808080');
  });

  it('names a red and a green that a deuteranope cannot tell apart, and only them', () => {
    const checks = checkColors([
      { key: 'r', label: 'Red', color: '#D62728' },
      { key: 'g', label: 'Green', color: '#2CA02C' },
    ]);
    expect(checks.map((c) => [c.vision, c.collisions])).toEqual([
      ['normal', []],
      ['protanopia', []],
      ['deuteranopia', [{ a: 'r', b: 'g', deltaE: 4.8 }]],
      ['tritanopia', []],
      ['greyscale', []],
    ]);
    expect(checks[2]?.colors).toEqual([
      { key: 'r', color: '#8B7C1F', drawn: ['#8B7C1F'] },
      { key: 'g', color: '#968838', drawn: ['#968838'] },
    ]);
  });

  it('compares every colour the marks are drawn in: one that differs keeps two categories apart', () => {
    // Two nearly equal fills; borders that differ, then borders that are the same.
    const fills = (borders: [string, string]) =>
      checkColors([
        { key: 'a', label: 'A', color: '#000000', drawn: ['#D1D1D1', borders[0]] },
        { key: 'b', label: 'B', color: '#555555', drawn: ['#E0E0E0', borders[1]] },
      ]).find((c) => c.vision === 'normal');
    expect(fills(['#000000', '#555555'])?.collisions).toEqual([]);
    expect(fills(['#333333', '#333333'])?.collisions).toEqual([{ a: 'a', b: 'b', deltaE: 3.4 }]);
    expect(fills(['#333333', '#333333'])?.colors[0]).toEqual({
      key: 'a',
      color: '#000000',
      drawn: ['#D1D1D1', '#333333'],
    });
  });

  it('never shows a listed difference at or above the threshold', () => {
    // Tol muted's green and wine are 9.96 apart in greyscale: listed, and shown as 9.9, not 10.
    const greyscale = checkColors([
      { key: 'a', label: 'A', color: '#117733' },
      { key: 'b', label: 'B', color: '#882255' },
    ]).find((c) => c.vision === 'greyscale');
    expect(greyscale?.collisions).toEqual([{ a: 'a', b: 'b', deltaE: 9.9 }]);
  });

  it('counts a different line pattern as telling two categories apart', () => {
    const checks = checkColors([
      { key: 'a', label: 'A', color: '#555555', dash: '' },
      { key: 'b', label: 'B', color: '#565656', dash: '6 3' },
      { key: 'c', label: 'C', color: '#575757', dash: '' },
    ]);
    expect(checks.find((c) => c.vision === 'normal')?.collisions.map((c) => `${c.a}-${c.b}`)).toEqual([
      'a-c',
    ]);
  });

  it('counts a glyph drawn with each colour (a link sign) as telling them apart', () => {
    const signs = checkColors([
      { key: '+', label: '+', color: '#0072B2', glyph: '+' },
      { key: '-', label: '-', color: '#C0392B', glyph: '-' },
    ]);
    expect(signs.flatMap((c) => c.collisions)).toEqual([]);
    const plain = checkColors([
      { key: '+', label: '+', color: '#0072B2' },
      { key: '-', label: '-', color: '#C0392B' },
    ]);
    expect(plain.find((c) => c.vision === 'greyscale')?.collisions).toEqual([
      { a: '+', b: '-', deltaE: 1.1 },
    ]);
  });
});

describe('palette presets', () => {
  it("measures each preset on each theme's stage: colour-blind safety, and colours with too little contrast", () => {
    const measured = Object.fromEntries(
      PALETTE_IDS.flatMap((id) =>
        (['cinematic-dark', 'light', 'high-contrast'] as const).map((base) => {
          const check = checkPalette(PALETTES[id].colours, base);
          const low = check.lowContrast.map((l) => l.key).join(',') || 'none';
          return [`${id} on ${base}`, `${check.colourblindSafe ? 'safe' : 'not safe'}; low contrast: ${low}`];
        }),
      ),
    );
    // Slots are counted from 1. No preset stays apart in greyscale: colour alone cannot carry many
    // categories into a black-and-white print.
    expect(measured).toEqual({
      'loopweft on cinematic-dark': 'not safe; low contrast: none',
      'loopweft on light': 'not safe; low contrast: 1,2,3,4,5,6,7,8,9,10,11,12',
      'loopweft on high-contrast': 'not safe; low contrast: none',
      'okabe-ito on cinematic-dark': 'safe; low contrast: none',
      'okabe-ito on light': 'safe; low contrast: 1,2,4,7',
      'okabe-ito on high-contrast': 'safe; low contrast: none',
      'tol-bright on cinematic-dark': 'not safe; low contrast: 6',
      'tol-bright on light': 'not safe; low contrast: 2,4,5,7',
      'tol-bright on high-contrast': 'not safe; low contrast: none',
      'tol-muted on cinematic-dark': 'safe; low contrast: 1,8',
      'tol-muted on light': 'safe; low contrast: 2,3,5,6',
      'tol-muted on high-contrast': 'safe; low contrast: 1,8',
    });
    for (const id of PALETTE_IDS)
      expect(checkPalette(PALETTES[id].colours, 'cinematic-dark').greyscaleSafe).toBe(false);
  });

  it('gives a contrast ratio cut to one decimal, so one just under the limit never reads as the limit', () => {
    expect(MIN_CONTRAST).toBe(3);
    expect(checkPalette(PALETTES['tol-bright'].colours, 'cinematic-dark').lowContrast).toEqual([
      { key: '6', ratio: 2.9 },
    ]);
  });
});

describe("a project's categories", () => {
  it('colours categories that name no colour from the palette the theme names, by their place in the list', () => {
    const p = example();
    p.theme.palette = 'okabe-ito';
    p.types.categories = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', colour: '#123456' },
      { id: 'c', name: 'C' },
    ];
    expect([...categoryColours(p)]).toEqual([
      ['a', '#E69F00'],
      ['b', '#123456'],
      ['c', '#009E73'],
    ]);
    // A palette the project holds itself works the same way, cycling when it runs out.
    p.theme.palettes = [{ id: 'pair', name: 'Pair', colours: ['#B2182B', '#2166AC'] }];
    p.theme.palette = 'pair';
    expect([...categoryColours(p)]).toEqual([
      ['a', '#B2182B'],
      ['b', '#123456'],
      ['c', '#B2182B'],
    ]);
  });

  it("flags the example's category pairs that colour-blind viewers would find hard to tell apart", () => {
    const check = checkCategories(example());
    const pairs = (vision: string) =>
      check.visions
        .find((v) => v.vision === vision)
        ?.collisions.map((c) => `${c.a}/${c.b}`)
        .join(' ');
    expect(check.lowContrast).toEqual([]);
    expect(check.colourblindSafe).toBe(false);
    expect(pairs('normal')).toBe('');
    expect(pairs('protanopia')).toBe('energy/economy energy/response economy/response governance/technology');
    expect(pairs('deuteranopia')).toBe(
      'earth/society energy/economy energy/response economy/response governance/technology',
    );
    expect(pairs('tritanopia')).toBe('earth/technology energy/economy energy/society');
  });

  it("checks against the stage of the project's theme", () => {
    const p = example();
    p.theme.base = 'light';
    expect(checkCategories(p).lowContrast.map((l) => l.key)).toEqual(p.types.categories.map((c) => c.id));
  });
});
