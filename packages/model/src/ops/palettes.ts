// A project's own palettes (`theme.palettes`), beside Loopweft's presets: adding one, changing its name,
// colours or description, and removing it. As in DataViz (packages/render-kit/src/look-edit.ts @ efcdbe2,
// TashiikiD/DataViz, private), the project holds every palette it uses, so its file renders the same
// anywhere; a palette's id never changes; and a palette in use cannot be removed. Choosing a palette is a
// theme change (`setTheme`).
import { isPresetId, PALETTE_IDS } from '../palettes.ts';
import { type Palette, PaletteSchema, type Project } from '../schema.ts';
import { slugify, uniqueId } from '../text/ids.ts';
import { didYouMean } from '../text/similarity.ts';
import { ensureValid, OpError, type OpOutput, parseElement, plural, sameJson } from './support.ts';

/** A new palette: its id is made from its name unless given. */
export type PaletteInput = Omit<Palette, 'id'> & { id?: string };

/** Changes to a palette: a value sets the field, `null` clears its description. The id stays. */
export interface PaletteChanges {
  name?: string;
  colours?: string[];
  description?: string | null;
}

/** One of the project's own palettes, by id; a preset, or no palette, is refused. */
function ownPalette(project: Project, id: string): { index: number; palette: Palette } {
  const own = project.theme.palettes ?? [];
  const index = own.findIndex((p) => p.id === id);
  if (index >= 0) return { index, palette: own[index] as Palette };
  if (isPresetId(id)) {
    throw new OpError(
      `${id} is a preset, which stays as it is; make a palette of your own from it.`,
      'usage',
    );
  }
  throw new OpError(
    `The project has no palette "${id}"${didYouMean(
      id,
      own.map((p) => p.id),
    )}.`,
    'notFound',
  );
}

const withPalettes = (project: Project, palettes: Palette[]): Project => {
  const next = structuredClone(project);
  if (palettes.length) next.theme.palettes = palettes;
  else delete next.theme.palettes;
  return next;
};

export function addPalette(project: Project, input: PaletteInput): OpOutput<{ id: string }> {
  const own = project.theme.palettes ?? [];
  const taken = new Set<string>([...PALETTE_IDS, ...own.map((p) => p.id)]);
  if (input.id !== undefined && taken.has(input.id)) {
    throw new OpError(
      `The id "${input.id}" is already ${isPresetId(input.id) ? "a preset's" : "one of the project's palettes'"}; choose another.`,
      'conflict',
    );
  }
  const id = input.id ?? uniqueId(slugify(input.name), taken, 'palette');
  const palette = parseElement(PaletteSchema, { ...input, id }, ['theme', 'palettes', own.length]);
  const next = withPalettes(project, [...own, palette]);
  ensureValid(project, next);
  return {
    project: next,
    result: { id },
    summary: `Added the palette "${palette.name}" (${id}): ${plural(palette.colours.length, 'colour')}.`,
  };
}

export function setPalette(
  project: Project,
  id: string,
  changes: PaletteChanges,
): OpOutput<{ id: string; changed: string[] }> {
  if ('id' in changes) throw new OpError('A palette keeps its id.', 'usage');
  const { index, palette } = ownPalette(project, id);
  const candidate: Record<string, unknown> = { ...palette };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  const updated = parseElement(PaletteSchema, candidate, ['theme', 'palettes', index]);
  const changed = Object.keys(changes).filter(
    (key) => !sameJson(palette[key as keyof Palette], updated[key as keyof Palette]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { id, changed },
      summary: `Nothing to change: the palette ${id} already has those values.`,
    };
  }
  const own = [...(project.theme.palettes ?? [])];
  own[index] = updated;
  const next = withPalettes(project, own);
  ensureValid(project, next);
  return {
    project: next,
    result: { id, changed },
    summary: `Changed the palette ${id}: ${changed.join(', ')}.`,
  };
}

export function removePalette(project: Project, id: string): OpOutput<{ id: string }> {
  const { palette } = ownPalette(project, id);
  if (project.theme.palette === id) {
    throw new OpError(
      `"${palette.name}" is the palette the map uses; choose another palette first.`,
      'conflict',
    );
  }
  const next = withPalettes(
    project,
    (project.theme.palettes ?? []).filter((p) => p.id !== id),
  );
  return { project: next, result: { id }, summary: `Removed the palette "${palette.name}" (${id}).` };
}
