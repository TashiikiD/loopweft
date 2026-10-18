// How a project looks: the colour and type tokens of each base theme, and the colour of each category. Pure
// data, so an export without a browser uses the same colours as the screen. The cinematic theme's tokens
// are the polycrisis deck's (PolycrisisPresentation src/styles/tokens.css @ 539bc8e, private).
import { PALETTES, type Project, paletteOf, type Theme } from '@loopweft/model';

export type ThemeBase = Theme['base'];

export interface ThemeTokens {
  /** The stage. */
  bg: string;
  /** Around the stage, where its shape does not fill the window. */
  bgDeep: string;
  /** Cards and panels. */
  surface: string;
  text: string;
  muted: string;
  faint: string;
  /** Accents: kickers, rules and the minimap's view. */
  glow: string;
  line: string;
  lineStrong: string;
  /** Pulses: a pressure rising (harm), easing (relief), or opposing influences meeting (mixed). */
  harm: string;
  relief: string;
  mixed: string;
  /** Behind badges and flags, round glyph edges and under text drawn over the map. */
  ink: string;
  /** Inside ring glyphs. */
  ringFill: string;
  /** The bright core of a pulse. */
  pulseCore: string;
  /** Legend glyphs, drawn without a category colour. */
  legendInk: string;
  /** Variables without a category. */
  neutral: string;
  /** Font stacks, used when the project names no fonts. */
  fontSans: string;
  fontSerif: string;
}

const SANS_FALLBACK = "'Segoe UI', system-ui, sans-serif";
const SERIF_FALLBACK = "Georgia, 'Times New Roman', serif";

export const THEMES: Record<ThemeBase, ThemeTokens> = {
  'cinematic-dark': {
    bg: '#071b16',
    bgDeep: '#04110d',
    surface: '#0e2a22',
    text: '#f1f5ef',
    muted: '#a8bdb2',
    faint: '#6f8a7e',
    glow: '#70e2c5',
    line: 'rgba(168, 189, 178, 0.16)',
    lineStrong: 'rgba(168, 189, 178, 0.32)',
    harm: '#ff8a5b',
    relief: '#70e2c5',
    mixed: '#e9dcae',
    ink: '#071b16',
    ringFill: '#0b231c',
    pulseCore: '#fffaf2',
    legendInk: '#dfe9e3',
    neutral: '#a8bdb2',
    fontSans: `'Inter Variable', 'Inter', ${SANS_FALLBACK}`,
    fontSerif: `'Fraunces Variable', 'Fraunces', ${SERIF_FALLBACK}`,
  },
  // A light stage: the colour checks flag category colours that stand out too little from it.
  light: {
    bg: '#f6f4ee',
    bgDeep: '#e6e2d6',
    surface: '#ffffff',
    text: '#16231e',
    muted: '#4f6158',
    faint: '#7d8c84',
    glow: '#0f7f6a',
    line: 'rgba(22, 35, 30, 0.14)',
    lineStrong: 'rgba(22, 35, 30, 0.3)',
    harm: '#d2522a',
    relief: '#0f8f78',
    mixed: '#9a7d22',
    ink: '#f6f4ee',
    ringFill: '#ffffff',
    pulseCore: '#ffffff',
    legendInk: '#33443d',
    neutral: '#6b7b73',
    fontSans: `'Inter Variable', 'Inter', ${SANS_FALLBACK}`,
    fontSerif: `'Fraunces Variable', 'Fraunces', ${SERIF_FALLBACK}`,
  },
  'high-contrast': {
    bg: '#000000',
    bgDeep: '#000000',
    surface: '#111111',
    text: '#ffffff',
    muted: '#e6e6e6',
    faint: '#bdbdbd',
    glow: '#7dffe0',
    line: 'rgba(255, 255, 255, 0.3)',
    lineStrong: 'rgba(255, 255, 255, 0.6)',
    harm: '#ff7a45',
    relief: '#3cf0c8',
    mixed: '#ffe27a',
    ink: '#000000',
    ringFill: '#000000',
    pulseCore: '#ffffff',
    legendInk: '#ffffff',
    neutral: '#e6e6e6',
    fontSans: `'Inter Variable', 'Inter', ${SANS_FALLBACK}`,
    fontSerif: `'Fraunces Variable', 'Fraunces', ${SERIF_FALLBACK}`,
  },
};

/**
 * Colours for categories that name none, when a project names no palette (the `loopweft` preset): the
 * deck's seven domain colours, then five more.
 */
export const DEFAULT_PALETTE: readonly string[] = PALETTES.loopweft.colours;

/**
 * Each category's colour: its own, else the colour of its place in the list, from the theme's palette. A
 * colour a category names never shifts the others.
 */
export function categoryColours(project: Project): Map<string, string> {
  const colours = paletteOf(project.theme).colours;
  return new Map(
    project.types.categories.map((c, i) => [c.id, c.colour ?? (colours[i % colours.length] as string)]),
  );
}

/** A font stack for a family the project names, trying its variable cut first. */
export function fontStack(family: string, fallback: string): string {
  const quoted = (name: string) => `'${name.replace(/'/g, '')}'`;
  return `${quoted(`${family} Variable`)}, ${quoted(family)}, ${fallback}`;
}

/** The theme's tokens for a project: its base theme, with the fonts it names. */
export function themeTokens(project: Project): ThemeTokens {
  const base = THEMES[project.theme.base];
  const { body, heading } = project.theme.fonts ?? {};
  return {
    ...base,
    fontSans: body ? fontStack(body, SANS_FALLBACK) : base.fontSans,
    fontSerif: heading ? fontStack(heading, SERIF_FALLBACK) : base.fontSerif,
  };
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The tokens as CSS custom properties (`--lw-bg`, `--lw-text`…), for the stage's root element. */
export function themeVariables(tokens: ThemeTokens): Record<string, string> {
  return Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--lw-${kebab(k)}`, v]));
}
