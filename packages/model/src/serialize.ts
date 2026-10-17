// Canonical `.loopweft` text: the same project always gives the same bytes. Keys follow the schema's order
// ($schema, format, version, meta, …), object-valued maps (positions, bends, assets, fields, labelText,
// trends) are sorted by key, indentation is two spaces, lines end in LF and the file ends with a newline.
// Arrays keep their order: the order of variables, links, scenes and steps is the author's.
import { type MapState, type Project, ProjectSchema, SCHEMA_URL } from './schema.ts';
import { compareStrings } from './text/ids.ts';

const sorted = <T>(record: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => compareStrings(a, b)));

const withSorted = <T extends object, K extends keyof T>(object: T, key: K): T =>
  object[key] === undefined ? object : { ...object, [key]: sorted(object[key] as Record<string, unknown>) };

function canonicalMap(map: MapState): MapState {
  return withSorted(withSorted(map, 'labelText'), 'trends');
}

/** The project in canonical form: schema key order, sorted maps and the current `$schema`. */
export function canonicalize(project: Project): Project {
  // Parsing rebuilds every object in the schema's key order.
  const p = ProjectSchema.parse({ ...project, $schema: SCHEMA_URL });
  return {
    ...p,
    variables: p.variables.map((v) => withSorted(v, 'fields')),
    links: p.links.map((l) => withSorted(l, 'fields')),
    layout: { ...p.layout, positions: sorted(p.layout.positions), bends: sorted(p.layout.bends) },
    story: {
      ...p.story,
      scenes: p.story.scenes.map((scene) => ({
        ...scene,
        steps: scene.steps.map((step) => ({ ...step, map: canonicalMap(step.map) })),
      })),
    },
    assets: sorted(p.assets),
  };
}

/** The text of a `.loopweft` file. */
export function serializeProject(project: Project): string {
  return `${JSON.stringify(canonicalize(project), null, 2)}\n`;
}
