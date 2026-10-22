// What changed between two versions of a project, in a few words: for the note the Studio shows when the file
// it has open changes on disk (an agent's edit through `loopweft`), e.g. "2 variables and 3 links added".
import { type Project, readProject, sameJson, serializeProject } from '@loopweft/model';

/**
 * A project as its file would give it back: written in the canonical form and read again, so a project made
 * in memory (from a template, say) compares equal to the same project read from disk, defaults and all.
 */
function canonical(project: Project): Project {
  const read = readProject(serializeProject(project));
  return read.ok ? read.project : project;
}

interface Kind {
  one: string;
  many: string;
  items: (project: Project) => readonly { id: string }[];
}

const KINDS: Kind[] = [
  { one: 'variable', many: 'variables', items: (p) => p.variables },
  { one: 'link', many: 'links', items: (p) => p.links },
  { one: 'named loop', many: 'named loops', items: (p) => p.loops },
  { one: 'source', many: 'sources', items: (p) => p.sources },
  { one: 'scene', many: 'scenes', items: (p) => p.story.scenes },
  {
    one: 'step',
    many: 'steps',
    items: (p) =>
      p.story.scenes.flatMap((s) => s.steps.map((step) => ({ ...step, id: `${s.id}.${step.id}` }))),
  },
];

/** The parts of a project other than its lists, named as the note names them. */
const PARTS: [string, (project: Project) => unknown][] = [
  // Every save stamps `modified`, so the dates are not a change worth a note.
  ['title and description', (p) => ({ ...p.meta, created: undefined, modified: undefined })],
  ['look', (p) => p.theme],
  ['types', (p) => p.types],
  ['layout', (p) => p.layout],
  ['images', (p) => p.assets],
];

/** Equal as JSON, whatever the order of keys (`undefined` fields count as absent). */
const same = (a: unknown, b: unknown) => sameJson(a, b);

const count = (n: number, kind: Kind) => `${n} ${n === 1 ? kind.one : kind.many}`;

/** "a, b and c". */
const join = (words: string[]) =>
  words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;

/**
 * What changed from `before` to `after`, e.g. "2 variables and 3 links added; 1 link changed; the layout
 * changed". Steps count apart from their scenes; a scene's own fields (title, notes) count as the scene.
 */
export function describeChange(given: Project, next: Project): string {
  const before = canonical(given);
  const after = canonical(next);
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const kind of KINDS) {
    const old = new Map(kind.items(before).map((item) => [item.id, item]));
    const now = new Map(kind.items(after).map((item) => [item.id, item]));
    const plain = (item: unknown) =>
      kind.one === 'scene' ? { ...(item as Record<string, unknown>), steps: undefined } : item;
    let a = 0;
    let r = 0;
    let c = 0;
    for (const [id, item] of now) {
      const was = old.get(id);
      if (!was) a += 1;
      else if (!same(plain(was), plain(item))) c += 1;
    }
    for (const id of old.keys()) if (!now.has(id)) r += 1;
    if (a) added.push(count(a, kind));
    if (r) removed.push(count(r, kind));
    if (c) changed.push(count(c, kind));
  }
  const parts = PARTS.filter(([, of]) => !same(of(before), of(after))).map(([name]) => `the ${name}`);
  const clauses = [
    added.length ? `${join(added)} added` : '',
    removed.length ? `${join(removed)} removed` : '',
    changed.length ? `${join(changed)} changed` : '',
    parts.length ? `${join(parts)} changed` : '',
  ].filter(Boolean);
  // Nothing above: only the order of things changed, or only the date it was saved.
  if (!clauses.length) return 'the order of things, or only the date';
  return clauses.join('; ');
}

/** True when two versions of a project differ at most in the dates they were made and saved. */
export function sameMap(a: Project, b: Project): boolean {
  const undated = (p: Project): Project => {
    const { created: _created, modified: _modified, ...meta } = p.meta;
    return { ...p, meta };
  };
  return serializeProject(undated(a)) === serializeProject(undated(b));
}
