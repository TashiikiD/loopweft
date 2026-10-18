// Colour checks for a project's categories and for palettes (the presets and a project's own): which colours
// become hard to tell apart for the three common colour-vision deficiencies and in greyscale (DataViz's
// check, cvd.ts), and which stand out too little from the theme's stage. Pure, so the Studio and the command
// line agree.
import type { Project } from '@loopweft/model';
import { categoryColours, THEMES, type ThemeBase } from '../theme.ts';
import { contrastRatio } from './color.ts';
import { checkColors, type VisionCheck } from './cvd.ts';

/**
 * The contrast a mark needs against what is behind it: 3 to 1, as WCAG 2.1 asks of the graphical objects
 * that carry meaning (success criterion 1.4.11, non-text contrast).
 */
export const MIN_CONTRAST = 3;

export interface ColourItem {
  /** What the colour stands for: a category id, or a palette slot (1 = first). */
  key: string;
  label: string;
  colour: string;
}

export interface ColourCheck {
  /** Under each vision: how each colour looks, and the pairs that become hard to tell apart. */
  visions: VisionCheck[];
  /** Colours that stand out too little from the stage, with their contrast ratio (cut to one decimal). */
  lowContrast: { key: string; ratio: number }[];
  /** No pair is hard to tell apart for typical vision or for protanopia, deuteranopia and tritanopia. */
  colourblindSafe: boolean;
  /** No pair is hard to tell apart in greyscale. */
  greyscaleSafe: boolean;
}

/** Checks a set of colours drawn on `background` (#rrggbb). */
export function checkColourSet(items: readonly ColourItem[], background: string): ColourCheck {
  const visions = checkColors(items.map((i) => ({ key: i.key, label: i.label, color: i.colour })));
  return {
    visions,
    lowContrast: items.flatMap((i) => {
      const ratio = contrastRatio(i.colour, background);
      return ratio < MIN_CONTRAST ? [{ key: i.key, ratio: Math.floor(ratio * 10) / 10 }] : [];
    }),
    colourblindSafe: visions.filter((v) => v.vision !== 'greyscale').every((v) => v.collisions.length === 0),
    greyscaleSafe: visions.filter((v) => v.vision === 'greyscale').every((v) => v.collisions.length === 0),
  };
}

/** The colours of a project's categories, as drawn, checked against its theme's stage. */
export function checkCategories(project: Project): ColourCheck {
  const colours = categoryColours(project);
  return checkColourSet(
    project.types.categories.map((c) => ({ key: c.id, label: c.name, colour: colours.get(c.id) as string })),
    THEMES[project.theme.base].bg,
  );
}

/** A palette's colours (a preset's, or one of a project's own), slot by slot, checked against a theme's stage. */
export function checkPalette(colours: readonly string[], base: ThemeBase): ColourCheck {
  return checkColourSet(
    colours.map((colour, i) => ({ key: String(i + 1), label: String(i + 1), colour })),
    THEMES[base].bg,
  );
}
