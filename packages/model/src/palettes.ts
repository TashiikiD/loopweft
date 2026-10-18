// The colour presets a project's theme can name (`theme.palette`). A category without a colour of its own
// takes the colour of its place in the category list, cycling through the preset; a colour a category
// names never shifts the others. How well a preset's colours stay apart for colour-vision deficiencies and
// in greyscale, and against each theme's stage, is measured by @loopweft/render's checks, never claimed here.

export interface PalettePreset {
  id: string;
  name: string;
  /** Colours in the order categories take them. */
  colours: readonly string[];
  /** Where the colours come from. */
  source: string;
}

export const PALETTE_IDS = ['loopweft', 'okabe-ito', 'tol-bright', 'tol-muted'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

/** The palette used when a project names none. */
export const DEFAULT_PALETTE_ID: PaletteId = 'loopweft';

export const PALETTES: Readonly<Record<PaletteId, PalettePreset>> = {
  loopweft: {
    id: 'loopweft',
    name: 'Loopweft',
    // The polycrisis deck's seven domain colours (PolycrisisPresentation content/map.json @ 539bc8e,
    // private), then five more in the same light tones, for a dark stage.
    colours: [
      '#5ECBA9',
      '#F2B36B',
      '#F6D36C',
      '#C5A6FF',
      '#F0919C',
      '#87C9F4',
      '#A5E88A',
      '#E7A3E0',
      '#9FB4FF',
      '#D8C29A',
      '#7FD4D9',
      '#FFB3A1',
    ],
    source: "The polycrisis deck's domain colours, and five more like them.",
  },
  'okabe-ito': {
    id: 'okabe-ito',
    name: 'Okabe–Ito',
    // DataViz packages/render-kit/src/palettes.ts @ efcdbe2 (TashiikiD/DataViz, private), without its last
    // colour, black, which would vanish on a dark stage.
    colours: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'],
    source: 'Okabe and Ito (2008), Color Universal Design: the seven colours, without black.',
  },
  'tol-bright': {
    id: 'tol-bright',
    name: 'Tol bright',
    // DataViz packages/render-kit/src/palettes.ts @ efcdbe2 (TashiikiD/DataViz, private).
    colours: ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB'],
    source: "Paul Tol's bright qualitative scheme (SRON technical note SRON/EPS/TN/09-002).",
  },
  'tol-muted': {
    id: 'tol-muted',
    name: 'Tol muted',
    // DataViz packages/render-kit/src/palettes.ts @ efcdbe2 (TashiikiD/DataViz, private).
    colours: [
      '#332288',
      '#88CCEE',
      '#44AA99',
      '#117733',
      '#999933',
      '#DDCC77',
      '#CC6677',
      '#882255',
      '#AA4499',
    ],
    source: "Paul Tol's muted qualitative scheme (SRON technical note SRON/EPS/TN/09-002).",
  },
};

/** The preset a theme names, else the default. */
export const paletteOf = (theme: { palette?: PaletteId | undefined }): PalettePreset =>
  PALETTES[theme.palette ?? DEFAULT_PALETTE_ID];
