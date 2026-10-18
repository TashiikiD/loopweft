// Adding, changing, reordering and removing the map's vocabulary: categories, roles, link types and custom
// fields. Each list has its own ids. Removing one that variables, links or groups still use is refused
// unless `cascade` clears those uses.
import type { z } from 'zod';
import {
  type Category,
  CategorySchema,
  type Field,
  FieldSchema,
  type LinkType,
  LinkTypeSchema,
  type Project,
  type Role,
  RoleSchema,
} from '../schema.ts';
import { slugify, uniqueId } from '../text/ids.ts';
import { didYouMean } from '../text/similarity.ts';
import { normalizeToken } from '../text/vocabulary.ts';
import { ensureValid, listing, OpError, type OpOutput, parseElement, plural, sameJson } from './support.ts';

export type TypeKind = 'category' | 'role' | 'linkType' | 'field';

interface TypeItems {
  category: Category;
  role: Role;
  linkType: LinkType;
  field: Field;
}

/** A new category, role, link type or field. Without an id, one is made from the name. */
export type TypeInput<K extends TypeKind> = Omit<
  z.input<
    K extends 'category'
      ? typeof CategorySchema
      : K extends 'role'
        ? typeof RoleSchema
        : K extends 'linkType'
          ? typeof LinkTypeSchema
          : typeof FieldSchema
  >,
  'id'
> & { id?: string };

/** Changes to one: a value sets the field, `null` clears an optional one. The id stays. */
export type TypeChanges<K extends TypeKind> = {
  [F in Exclude<keyof TypeItems[K], 'id'>]?: TypeItems[K][F] | null;
};

const LIST = { category: 'categories', role: 'roles', linkType: 'linkTypes', field: 'fields' } as const;
const SCHEMA = { category: CategorySchema, role: RoleSchema, linkType: LinkTypeSchema, field: FieldSchema };
const NAME = { category: 'category', role: 'role', linkType: 'link type', field: 'field' } as const;

const itemsOf = <K extends TypeKind>(project: Project, kind: K): TypeItems[K][] =>
  project.types[LIST[kind]] as TypeItems[K][];

/** One of a list, named by its id, or by its name or id ignoring case and spacing when only one matches. */
export function resolveType<K extends TypeKind>(
  project: Project,
  kind: K,
  ref: string,
): { index: number; item: TypeItems[K] } {
  const items = itemsOf(project, kind);
  const exact = items.findIndex((t) => t.id === ref);
  if (exact >= 0) return { index: exact, item: items[exact] as TypeItems[K] };
  const token = normalizeToken(ref);
  const matches = items.flatMap((item, index) =>
    normalizeToken(item.name) === token || normalizeToken(item.id) === token ? [{ index, item }] : [],
  );
  if (matches.length === 1) return matches[0] as { index: number; item: TypeItems[K] };
  if (matches.length > 1) {
    throw new OpError(
      `"${ref}" matches ${matches.length} ${NAME[kind]}s (${matches.map((m) => m.item.id).join(', ')}); use the id of the one you mean.`,
      'usage',
    );
  }
  const names = items.flatMap((t) => [t.id, t.name]);
  throw new OpError(`No ${NAME[kind]} "${ref}"${didYouMean(ref, names)}.`, 'notFound');
}

export function addType<K extends TypeKind>(
  project: Project,
  kind: K,
  input: TypeInput<K>,
): OpOutput<{ id: string }> {
  const items = itemsOf(project, kind);
  const taken = new Set(items.map((t) => t.id));
  if (input.id !== undefined && taken.has(input.id)) {
    throw new OpError(`The ${NAME[kind]} id "${input.id}" is already used; choose another.`, 'conflict');
  }
  const id =
    input.id ?? uniqueId(slugify(String(input.name ?? '')), taken, kind === 'linkType' ? 'type' : kind);
  const item = parseElement(SCHEMA[kind], { ...input, id }, [
    'types',
    LIST[kind],
    items.length,
  ]) as TypeItems[K];
  const next = structuredClone(project);
  (itemsOf(next, kind) as unknown[]).push(item);
  ensureValid(project, next);
  return { project: next, result: { id }, summary: `Added ${NAME[kind]} ${id} ("${item.name}").` };
}

export function setType<K extends TypeKind>(
  project: Project,
  kind: K,
  ref: string,
  changes: TypeChanges<K>,
): OpOutput<{ id: string; changed: string[] }> {
  if ('id' in changes) throw new OpError(`A ${NAME[kind]} keeps its id; change its name instead.`, 'usage');
  const { index, item } = resolveType(project, kind, ref);
  const candidate: Record<string, unknown> = { ...item };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  const updated = parseElement(SCHEMA[kind], candidate, ['types', LIST[kind], index]) as TypeItems[K];
  const changed = Object.keys(changes).filter(
    (key) => !sameJson(item[key as keyof TypeItems[K]], updated[key as keyof TypeItems[K]]),
  );
  if (changed.length === 0) {
    return {
      project,
      result: { id: item.id, changed },
      summary: `Nothing to change: ${NAME[kind]} ${item.id} already has those values.`,
    };
  }
  const next = structuredClone(project);
  (itemsOf(next, kind) as unknown[])[index] = updated;
  // A field whose kind, options or reach changes must still fit every value it holds.
  ensureValid(project, next);
  return {
    project: next,
    result: { id: item.id, changed },
    summary: `Changed ${NAME[kind]} ${item.id}: ${changed.join(', ')}.`,
  };
}

/** Moves one to another place in its list (`to` counts from 0): the order of colours and of clusters. */
export function moveType(
  project: Project,
  kind: TypeKind,
  ref: string,
  to: number,
): OpOutput<{ id: string; from: number; to: number }> {
  const { index, item } = resolveType(project, kind, ref);
  const count = itemsOf(project, kind).length;
  if (!Number.isInteger(to) || to < 0 || to >= count) {
    throw new OpError(`Place ${to + 1} does not exist: there are ${count} ${NAME[kind]}s.`, 'usage');
  }
  if (to === index) {
    return {
      project,
      result: { id: item.id, from: index, to },
      summary: `Nothing to change: ${NAME[kind]} ${item.id} is already in place ${to + 1}.`,
    };
  }
  const next = structuredClone(project);
  const items = itemsOf(next, kind) as unknown[];
  const [moved] = items.splice(index, 1);
  items.splice(to, 0, moved);
  return {
    project: next,
    result: { id: item.id, from: index, to },
    summary: `Moved ${NAME[kind]} ${item.id} from place ${index + 1} to place ${to + 1}.`,
  };
}

/** What uses one: variables, links and groups by id. */
function usesOf(project: Project, kind: TypeKind, id: string): { what: string; ids: string[] }[] {
  switch (kind) {
    case 'category':
      return [
        { what: 'variable', ids: project.variables.filter((v) => v.category === id).map((v) => v.id) },
        { what: 'group', ids: project.layout.groups.filter((g) => g.category === id).map((g) => g.id) },
      ];
    case 'role':
      return [{ what: 'variable', ids: project.variables.filter((v) => v.role === id).map((v) => v.id) }];
    case 'linkType':
      return [{ what: 'link', ids: project.links.filter((l) => l.type === id).map((l) => l.id) }];
    case 'field':
      return [
        {
          what: 'variable',
          ids: project.variables.filter((v) => v.fields?.[id] !== undefined).map((v) => v.id),
        },
        { what: 'link', ids: project.links.filter((l) => l.fields?.[id] !== undefined).map((l) => l.id) },
      ];
  }
}

const described = (uses: { what: string; ids: string[] }[]) =>
  uses.filter((u) => u.ids.length).map((u) => `${plural(u.ids.length, u.what)} (${u.ids.join(', ')})`);

/**
 * Removes one. With `cascade`, its uses go too: variables lose the category or role, links the type, and
 * values of the field are removed; groups drawn in a removed category are removed.
 */
export function removeType(
  project: Project,
  kind: TypeKind,
  ref: string,
  options: { cascade?: boolean } = {},
): OpOutput<{ id: string; cleared: Record<string, string[]> }> {
  const { item } = resolveType(project, kind, ref);
  const id = item.id;
  const uses = usesOf(project, kind, id);
  const used = described(uses);
  if (!options.cascade && used.length) {
    const action = kind === 'field' ? 'hold a value of it' : 'use it';
    throw new OpError(
      `${NAME[kind].charAt(0).toUpperCase()}${NAME[kind].slice(1)} ${id} is still used: ${listing(used)} ${action}. Change those first, or remove it with cascade to clear them.`,
      'conflict',
    );
  }
  const next = structuredClone(project);
  next.types[LIST[kind]] = (itemsOf(next, kind) as { id: string }[]).filter((t) => t.id !== id) as never;
  for (const v of next.variables) {
    if (kind === 'category' && v.category === id) delete v.category;
    if (kind === 'role' && v.role === id) delete v.role;
    if (kind === 'field' && v.fields?.[id] !== undefined) {
      delete v.fields[id];
      if (Object.keys(v.fields).length === 0) delete v.fields;
    }
  }
  for (const l of next.links) {
    if (kind === 'linkType' && l.type === id) delete l.type;
    if (kind === 'field' && l.fields?.[id] !== undefined) {
      delete l.fields[id];
      if (Object.keys(l.fields).length === 0) delete l.fields;
    }
  }
  if (kind === 'category') next.layout.groups = next.layout.groups.filter((g) => g.category !== id);
  ensureValid(project, next);
  const cleared = Object.fromEntries(uses.filter((u) => u.ids.length).map((u) => [`${u.what}s`, u.ids]));
  const what =
    kind === 'category'
      ? described(uses).map((u) => (u.includes('group') ? `removed ${u}` : `cleared it from ${u}`))
      : used.map((u) => `cleared it from ${u}`);
  return {
    project: next,
    result: { id, cleared },
    summary: `Removed ${NAME[kind]} ${id}${what.length ? `; ${listing(what)}` : ''}.`,
  };
}
