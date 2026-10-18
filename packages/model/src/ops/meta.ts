// Changing what a project says about itself (its title, description, author and course) and how it looks
// (its base theme, palette and fonts). The project's own palettes are edited in palettes.ts.
import { type Meta, MetaSchema, type Project, type Theme, ThemeSchema } from '../schema.ts';
import { ensureValid, OpError, type OpOutput, parseElement, sameJson } from './support.ts';

/** Changes to the meta: a value sets the field, `null` clears an optional one. */
export type MetaChanges = { [K in keyof Meta]?: Meta[K] | null };

/** Changes to the theme: a value sets the field, `null` clears it (the base theme goes back to its default). */
export type ThemeChanges = { [K in keyof Theme]?: Theme[K] | null };

/** Applies changes to an object: values set, `null` removes. */
function changed<T extends object>(
  base: T,
  changes: { [K in keyof T]?: T[K] | null },
): Record<string, unknown> {
  const candidate: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  return candidate;
}

const keysChanged = (before: object, after: object, keys: string[]) =>
  keys.filter(
    (key) => !sameJson((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key]),
  );

export function setMeta(project: Project, changes: MetaChanges): OpOutput<{ changed: string[] }> {
  const meta = parseElement(MetaSchema, changed(project.meta, changes), ['meta']);
  const which = keysChanged(project.meta, meta, Object.keys(changes));
  if (which.length === 0) {
    return {
      project,
      result: { changed: which },
      summary: 'Nothing to change: the project already says that.',
    };
  }
  return {
    project: { ...structuredClone(project), meta },
    result: { changed: which },
    summary: `Changed the project's ${which.join(', ')}.`,
  };
}

export function setTheme(project: Project, changes: ThemeChanges): OpOutput<{ changed: string[] }> {
  if (changes.fonts && Object.keys(changes.fonts).length === 0) {
    throw new OpError('Give a heading or body font, or clear the fonts with null.', 'usage');
  }
  const theme = parseElement(ThemeSchema, changed(project.theme, changes), ['theme']);
  const which = keysChanged(project.theme, theme, Object.keys(changes));
  if (which.length === 0) {
    return {
      project,
      result: { changed: which },
      summary: 'Nothing to change: the theme is already like that.',
    };
  }
  const next = { ...structuredClone(project), theme };
  // A palette the theme names must exist: a preset, or one of the project's own.
  ensureValid(project, next);
  return {
    project: next,
    result: { changed: which },
    summary: `Changed the theme: ${which.join(', ')}.`,
  };
}
