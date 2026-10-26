// `var show` and `link show`: one element of the map in full, as `story show` gives one step: every field it
// has, where it sits, the sources it cites with their pages, the links into and out of it (or its two ends),
// the named loops it is part of, and the project's warnings about it. Nothing is changed.
import {
  type Citation,
  checkProject,
  type FieldValue,
  findLink,
  type Issue,
  type Link,
  loopPolarity,
  type Project,
  resolveVariable,
  signText,
} from '@loopweft/model';
import type { CommandResult } from './commands.ts';
import { citationText } from './sources.ts';
import { loadProject } from './support.ts';

const SIGN_WORDS = { '+': 'same direction', '-': 'opposite direction', '?': 'not known' } as const;

const within = (path: readonly (string | number)[], prefix: readonly (string | number)[]) =>
  prefix.every((part, k) => path[k] === part);

/** A custom field's value as people read it: under the field's name, a choice by its option's name too. */
function fieldLines(project: Project, values: Record<string, FieldValue> | undefined): string[] {
  return Object.entries(values ?? {}).map(([id, value]) => {
    const field = project.types.fields.find((f) => f.id === id);
    const option = field?.options?.find((o) => o.id === value);
    return `  ${field?.name ?? id}: ${option ? `${option.name} (${option.id})` : String(value)}`;
  });
}

/** Citations, one a line, with the source's short form after its locator. */
function citationLines(project: Project, citations: readonly Citation[]): string[] {
  if (!citations.length) return ['Cites: nothing'];
  return [
    `Cites (${citations.length}):`,
    ...citations.map((c) => {
      const label = project.sources.find((s) => s.id === c.source)?.label;
      return `  ${citationText(c)}${label ? `  (${label})` : ''}`;
    }),
  ];
}

/** The named loops with a link among `links`. */
function loopsThrough(project: Project, links: ReadonlySet<string>) {
  return project.loops
    .filter((l) => l.links.some((id) => links.has(id)))
    .map((l) => ({ id: l.id, name: l.name, polarity: loopPolarity(project, l) ?? '?', links: l.links }));
}

function loopLines(loops: ReturnType<typeof loopsThrough>): string[] {
  if (!loops.length) return ['Named loops: none'];
  return ['Named loops:', ...loops.map((l) => `  ${l.id} "${l.name}" (${l.polarity}): ${l.links.join(' ')}`)];
}

const warningLines = (issues: readonly Issue[]) =>
  issues.length ? ['Warnings:', ...issues.map((i) => `  ${i.message}`)] : [];

/** A link in a line: its id, its ends by label, its sign. */
function linkLine(project: Project, l: Link): string {
  const label = (id: string) => project.variables.find((v) => v.id === id)?.label ?? id;
  return `  ${l.id.padEnd(6)} ${label(l.from)} → ${label(l.to)} (${signText(l.sign)})`;
}

export function varShowCommand(file: string, ref: string): CommandResult {
  const project = loadProject(file);
  const { index, variable: v } = resolveVariable(project, ref);
  const at = project.layout.positions[v.id];
  const category = project.types.categories.find((c) => c.id === v.category);
  const role = project.types.roles.find((r) => r.id === v.role);
  const into = project.links.filter((l) => l.to === v.id);
  const outOf = project.links.filter((l) => l.from === v.id);
  const loops = loopsThrough(project, new Set([...into, ...outOf].map((l) => l.id)));
  const issues = checkProject(project).filter((i) => within(i.path, ['variables', index]));
  const lines = [
    `${v.id} "${v.label}": variable ${index + 1} of ${project.variables.length}`,
    ...(v.mapLabel !== undefined ? [`  map label: ${JSON.stringify(v.mapLabel)}`] : []),
    ...(v.category !== undefined
      ? [`  category: ${v.category}${category ? ` (${category.name})` : ''}`]
      : []),
    ...(v.role !== undefined ? [`  role: ${v.role}${role ? ` (${role.name})` : ''}`] : []),
    ...(v.definition !== undefined ? [`  definition: ${v.definition}`] : []),
    ...(v.size !== undefined ? [`  size: ${v.size}`] : []),
    ...fieldLines(project, v.fields),
    at
      ? `  at ${at.x}, ${at.y}${at.labelSide ? `, label ${at.labelSide}` : ''}${at.pinned ? ', pinned' : ''}`
      : '  not placed on the map',
    ...citationLines(project, v.citations),
    into.length ? `Links in (${into.length}):` : 'Links in: none',
    ...into.map((l) => linkLine(project, l)),
    outOf.length ? `Links out (${outOf.length}):` : 'Links out: none',
    ...outOf.map((l) => linkLine(project, l)),
    ...loopLines(loops),
    ...warningLines(issues),
  ];
  return {
    text: lines.join('\n'),
    data: {
      variable: v,
      ...(at ? { at } : {}),
      links: { in: into.map((l) => l.id), out: outOf.map((l) => l.id) },
      loops,
      warnings: issues,
    },
  };
}

export function linkShowCommand(file: string, id: string): CommandResult {
  const project = loadProject(file);
  const { index, link: l } = findLink(project, id);
  const label = (ref: string) => project.variables.find((v) => v.id === ref)?.label ?? ref;
  const type = project.types.linkTypes.find((t) => t.id === l.type);
  const loops = loopsThrough(project, new Set([l.id]));
  const issues = checkProject(project).filter((i) => within(i.path, ['links', index]));
  const lines = [
    `${l.id}: ${label(l.from)} → ${label(l.to)} (${signText(l.sign)}, ${SIGN_WORDS[l.sign]}): link ${index + 1} of ${project.links.length}`,
    `  from ${l.from}, to ${l.to}`,
    ...(l.type !== undefined ? [`  type: ${l.type}${type ? ` (${type.name})` : ''}`] : []),
    ...(l.conditional ? ['  conditional: the effect holds only under some conditions'] : []),
    ...(l.delay ? [`  delay${l.delayLabel !== undefined ? `: ${l.delayLabel}` : ''}`] : []),
    ...(l.confidence !== undefined ? [`  confidence: ${l.confidence}`] : []),
    ...(l.weight !== undefined ? [`  weight: ${l.weight}`] : []),
    ...(l.rationale !== undefined ? [`  rationale: ${l.rationale}`] : []),
    ...fieldLines(project, l.fields),
    ...citationLines(project, l.citations),
    ...loopLines(loops),
    ...warningLines(issues),
  ];
  return { text: lines.join('\n'), data: { link: l, loops, warnings: issues } };
}
