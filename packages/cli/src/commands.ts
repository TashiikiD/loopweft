// What each command does. A handler reads the project, runs the model's operations (the ones the Studio
// runs), saves unless it is a dry run, and returns a line for people and a JSON-ready result for agents.
// The pattern follows DataViz's packages/cli/src/commands.ts @ efcdbe2 (TashiikiD/DataViz, private).
import { existsSync } from 'node:fs';
import { applyAutoLayout, type LayoutKind } from '@loopweft/layout';
import {
  addLink,
  addLoop,
  addType,
  addVariable,
  applyShorthand,
  createProject,
  findLoops,
  flipSign,
  type Issue,
  issueLines,
  type LinkChanges,
  type LinkInput,
  type LoopChanges,
  listing,
  loopKey,
  loopPolarity,
  moveType,
  moveVariables,
  OpError,
  type OpOutput,
  type Project,
  plural,
  readProject,
  removeLink,
  removeLoop,
  removeType,
  removeVariable,
  SHAPES,
  ShorthandError,
  setBends,
  setHome,
  setLabelSide,
  setLink,
  setLoop,
  setPinned,
  setType,
  setVariable,
  signText,
  type TypeKind,
  type VariableChanges,
} from '@loopweft/model';
import {
  confidence,
  type Env,
  fieldValues,
  list,
  loadProject,
  number,
  numbers,
  oneOf,
  pair,
  readText,
  saveProject,
  sign,
} from './support.ts';

/** What a command hands back: a text for people, data for `--json`, and an exit code when it is not 0. */
export interface CommandResult {
  text: string;
  data: Record<string, unknown>;
  exitCode?: number;
}

interface EditOptions {
  dryRun?: boolean;
}

/** One or more operations on a project file, saved together unless it is a dry run or nothing changed. */
function edit(
  env: Env,
  file: string,
  options: EditOptions,
  steps: ((project: Project) => OpOutput<unknown>)[],
): CommandResult {
  const before = loadProject(file);
  let project = before;
  const summaries: string[] = [];
  const results: unknown[] = [];
  for (const step of steps) {
    const out = step(project);
    project = out.project;
    summaries.push(out.summary);
    results.push(out.result);
  }
  const changed = project !== before;
  const saved = changed && !options.dryRun;
  const backup = saved ? saveProject(file, project, env).backup : null;
  const note = options.dryRun ? (changed ? ' (dry run: nothing was saved)' : ' (dry run)') : '';
  return {
    text: `${summaries.join('\n')}${note}`,
    data: {
      summary: summaries.join(' '),
      result: results.length === 1 ? results[0] : results,
      changed,
      saved,
      ...(backup ? { backup } : {}),
      ...(options.dryRun ? { dryRun: true } : {}),
    },
  };
}

const ensureArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** `--clear a b` as { a: null, b: null }, refusing names the element does not have. */
function cleared(
  names: string[] | undefined,
  allowed: readonly string[],
  what: string,
): Record<string, null> {
  const out: Record<string, null> = {};
  for (const name of names ?? []) {
    if (!allowed.includes(name)) {
      throw new OpError(`--clear: ${what} have no field "${name}" (${allowed.join(', ')}).`, 'usage');
    }
    out[name] = null;
  }
  return out;
}

// ----- new, info, validate -----

export function newCommand(
  env: Env,
  file: string,
  options: { title: string; force?: boolean },
): CommandResult {
  if (existsSync(file) && !options.force) {
    throw new OpError(`${file} already exists; choose another name, or replace it with --force.`, 'usage');
  }
  const project = createProject({ title: options.title, created: env.today });
  const { backup } = saveProject(file, project, env);
  return {
    text: `Created ${file}: "${options.title}".`,
    data: { file, title: options.title, ...(backup ? { backup } : {}) },
  };
}

const countBy = (issues: readonly Issue[]) => {
  const counts: Record<string, number> = {};
  for (const i of issues) counts[i.code] = (counts[i.code] ?? 0) + 1;
  return counts;
};

export function infoCommand(file: string): CommandResult {
  const result = readProject(readText(file));
  if (!result.ok) {
    throw new OpError(`${file} is not a valid Loopweft project.`, 'invalid', result.issues);
  }
  const { project, issues } = result;
  const steps = project.story.scenes.reduce((n, s) => n + s.steps.length, 0);
  const placed = project.variables.filter((v) => project.layout.positions[v.id]).length;
  const pinned = project.variables.filter((v) => project.layout.positions[v.id]?.pinned).length;
  const warnings = issues.filter((i) => i.severity === 'warning');
  const named = project.loops.map((l) => ({
    id: l.id,
    name: l.name,
    polarity: loopPolarity(project, l) ?? '?',
    links: l.links,
  }));
  const home = project.layout.home;
  const data = {
    file,
    title: project.meta.title,
    ...(project.meta.description ? { description: project.meta.description } : {}),
    counts: {
      variables: project.variables.length,
      links: project.links.length,
      namedLoops: project.loops.length,
      sources: project.sources.length,
      scenes: project.story.scenes.length,
      steps,
    },
    types: {
      categories: project.types.categories,
      roles: project.types.roles,
      linkTypes: project.types.linkTypes,
      fields: project.types.fields,
    },
    theme: project.theme,
    layout: { placed, pinned, bends: Object.keys(project.layout.bends).length, home: home ?? null },
    loops: named,
    issues: { errors: 0, warnings: warnings.length, byCode: countBy(warnings) },
  };
  const t = project.types;
  const lines = [
    project.meta.title,
    `  ${plural(project.variables.length, 'variable')}, ${plural(project.links.length, 'link')}, ${plural(project.loops.length, 'named loop')}, ${plural(project.sources.length, 'source')}`,
    `  types: ${plural(t.categories.length, 'category', 'categories')}, ${plural(t.roles.length, 'role')}, ${plural(t.linkTypes.length, 'link type')}, ${plural(t.fields.length, 'field')}`,
    `  story: ${plural(project.story.scenes.length, 'scene')}, ${plural(steps, 'step')}`,
    `  layout: ${placed} of ${project.variables.length} placed${pinned ? `, ${pinned} pinned` : ''}; home view ${home ? `centre (${home.x}, ${home.y}), zoom ${home.zoom}` : 'fitted to the map'}`,
    `  theme: ${project.theme.base}, palette ${project.theme.palette ?? 'loopweft'}`,
    `  ${
      warnings.length
        ? `${plural(warnings.length, 'warning')}: ${Object.entries(countBy(warnings))
            .map(([code, n]) => `${code} ${n}`)
            .join(', ')}`
        : 'no warnings'
    }`,
  ];
  return { text: lines.join('\n'), data };
}

export function validateCommand(file: string): CommandResult {
  const result = readProject(readText(file));
  const errors = result.issues.filter((i) => i.severity === 'error');
  const warnings = result.issues.filter((i) => i.severity === 'warning');
  const counts = `${plural(errors.length, 'error')}, ${plural(warnings.length, 'warning')}`;
  const text = [issueLines(result.issues), result.ok ? `valid: ${counts}` : `not valid: ${counts}`]
    .filter(Boolean)
    .join('\n');
  return {
    text,
    data: { file, valid: result.ok, errors: errors.length, warnings: warnings.length, issues: result.issues },
    ...(result.ok ? {} : { exitCode: 1 }),
  };
}

// ----- add (shorthand) -----

export function addCommand(
  env: Env,
  file: string,
  options: EditOptions & { shorthand?: string; shorthandFile?: string },
): CommandResult {
  if ((options.shorthand === undefined) === (options.shorthandFile === undefined)) {
    throw new OpError(
      'Give the links as --shorthand "<text>" or --shorthand-file <file>, one of the two.',
      'usage',
    );
  }
  const text = options.shorthand?.replace(/\\n/g, '\n') ?? readText(options.shorthandFile as string);
  try {
    const out = edit(env, file, options, [(p) => applyShorthand(p, text)]);
    const result = out.data.result as { warnings: { line: number; column: number; message: string }[] };
    const warnings = result.warnings.map((w) => `warning line ${w.line}, column ${w.column}: ${w.message}`);
    return { ...out, text: [out.text, ...warnings].join('\n') };
  } catch (error) {
    if (error instanceof ShorthandError) {
      throw new OpError(
        `The shorthand has ${plural(error.issues.length, 'error')}; nothing was added.\n${error.message}`,
        'invalid',
        error.issues as never,
      );
    }
    throw error;
  }
}

// ----- var -----

interface VariableOptions extends EditOptions {
  label?: string;
  id?: string;
  mapLabel?: string;
  category?: string;
  role?: string;
  definition?: string;
  size?: string;
  field?: string[];
  clear?: string[];
  clearField?: string[];
  at?: string;
}

const VARIABLE_FIELDS = ['mapLabel', 'category', 'role', 'definition', 'size', 'label'] as const;

function variableFields(o: VariableOptions): VariableChanges {
  return {
    ...(o.label !== undefined ? { label: o.label } : {}),
    ...(o.mapLabel !== undefined ? { mapLabel: o.mapLabel.replace(/\\n/g, '\n') } : {}),
    ...(o.category !== undefined ? { category: o.category } : {}),
    ...(o.role !== undefined ? { role: o.role } : {}),
    ...(o.definition !== undefined ? { definition: o.definition } : {}),
    ...(o.size !== undefined ? { size: oneOf(o.size, ['normal', 'large'] as const, 'size') } : {}),
  };
}

export function varListCommand(file: string): CommandResult {
  const project = loadProject(file);
  const rows = project.variables.map((v) => ({
    id: v.id,
    label: v.label,
    ...(v.category ? { category: v.category } : {}),
    ...(v.role ? { role: v.role } : {}),
    ...(project.layout.positions[v.id] ? { at: project.layout.positions[v.id] } : {}),
  }));
  const text = rows
    .map(
      (r) =>
        `${r.id.padEnd(24)} ${r.label}${r.category ? `  [${r.category}]` : ''}${r.role ? `  (${r.role})` : ''}`,
    )
    .join('\n');
  return { text: text || 'No variables.', data: { variables: rows } };
}

export function varAddCommand(env: Env, file: string, o: VariableOptions & { label: string }): CommandResult {
  const project = loadProject(file);
  const fields = fieldValues(project, o.field, 'variables');
  let id = '';
  const at = o.at === undefined ? undefined : numbers(o.at, 2, 'at');
  return edit(env, file, o, [
    (p) => {
      const out = addVariable(p, {
        ...variableFields(o),
        label: o.label,
        ...(o.id ? { id: o.id } : {}),
        ...(fields ? { fields } : {}),
      } as never);
      id = out.result.id;
      return out;
    },
    ...(at ? [(p: Project) => moveVariables(p, { [id]: { x: at[0] as number, y: at[1] as number } })] : []),
  ]);
}

export function varSetCommand(env: Env, file: string, ref: string, o: VariableOptions): CommandResult {
  const project = loadProject(file);
  const current = project.variables.find((v) => v.id === ref);
  let fields = fieldValues(project, o.field, 'variables', current?.fields);
  for (const id of o.clearField ?? []) {
    fields = { ...(fields ?? current?.fields ?? {}) };
    delete fields[id];
  }
  const changes: VariableChanges = {
    ...variableFields(o),
    ...cleared(o.clear, VARIABLE_FIELDS, 'variables'),
    ...(fields ? { fields: Object.keys(fields).length ? fields : null } : {}),
  };
  if (Object.keys(changes).length === 0 && o.at === undefined) {
    throw new OpError('Nothing to change: give a field to set (e.g. --label) or --clear.', 'usage');
  }
  const at = o.at === undefined ? undefined : numbers(o.at, 2, 'at');
  return edit(env, file, o, [
    ...(Object.keys(changes).length ? [(p: Project) => setVariable(p, ref, changes)] : []),
    ...(at ? [(p: Project) => moveVariables(p, { [ref]: { x: at[0] as number, y: at[1] as number } })] : []),
  ]);
}

export function varRemoveCommand(
  env: Env,
  file: string,
  refs: string[],
  o: EditOptions & { cascade?: boolean },
): CommandResult {
  return edit(
    env,
    file,
    o,
    refs.map((ref) => (p: Project) => removeVariable(p, ref, { cascade: o.cascade === true })),
  );
}

// ----- link -----

interface LinkOptions extends EditOptions {
  from?: string;
  to?: string;
  sign?: string;
  id?: string;
  type?: string;
  conditional?: boolean;
  delay?: string | boolean;
  confidence?: string;
  weight?: string;
  rationale?: string;
  field?: string[];
  clear?: string[];
  clearField?: string[];
}

const LINK_FIELDS = [
  'type',
  'conditional',
  'delay',
  'delayLabel',
  'confidence',
  'weight',
  'rationale',
] as const;

function linkFields(o: LinkOptions): LinkChanges {
  return {
    ...(o.from !== undefined ? { from: o.from } : {}),
    ...(o.to !== undefined ? { to: o.to } : {}),
    ...(o.sign !== undefined ? { sign: sign(o.sign) } : {}),
    ...(o.type !== undefined ? { type: o.type } : {}),
    ...(o.conditional ? { conditional: true } : {}),
    ...(o.delay !== undefined
      ? { delay: true, ...(typeof o.delay === 'string' ? { delayLabel: o.delay } : {}) }
      : {}),
    ...(o.confidence !== undefined ? { confidence: confidence(o.confidence) } : {}),
    ...(o.weight !== undefined ? { weight: number(o.weight, 'weight') } : {}),
    ...(o.rationale !== undefined ? { rationale: o.rationale } : {}),
  };
}

export function linkListCommand(file: string): CommandResult {
  const project = loadProject(file);
  const rows = project.links.map((l) => ({
    id: l.id,
    from: l.from,
    to: l.to,
    sign: l.sign,
    ...(l.type ? { type: l.type } : {}),
  }));
  const text = rows
    .map((r) => `${r.id.padEnd(8)} ${r.from} → ${r.to} (${signText(r.sign)})${r.type ? `  [${r.type}]` : ''}`)
    .join('\n');
  return { text: text || 'No links.', data: { links: rows } };
}

export function linkAddCommand(
  env: Env,
  file: string,
  o: LinkOptions & { from: string; to: string; sign: string },
): CommandResult {
  const project = loadProject(file);
  const fields = fieldValues(project, o.field, 'links');
  const input = {
    ...linkFields(o),
    ...(o.id ? { id: o.id } : {}),
    ...(fields ? { fields } : {}),
  } as LinkInput;
  return edit(env, file, o, [(p) => addLink(p, input)]);
}

export function linkSetCommand(env: Env, file: string, id: string, o: LinkOptions): CommandResult {
  const project = loadProject(file);
  const current = project.links.find((l) => l.id === id);
  let fields = fieldValues(project, o.field, 'links', current?.fields);
  for (const key of o.clearField ?? []) {
    fields = { ...(fields ?? current?.fields ?? {}) };
    delete fields[key];
  }
  const changes: LinkChanges = {
    ...linkFields(o),
    ...cleared(o.clear, LINK_FIELDS, 'links'),
    ...(fields ? { fields: Object.keys(fields).length ? fields : null } : {}),
  };
  if (Object.keys(changes).length === 0) {
    throw new OpError('Nothing to change: give a field to set (e.g. --sign) or --clear.', 'usage');
  }
  return edit(env, file, o, [(p) => setLink(p, id, changes)]);
}

export function linkRemoveCommand(
  env: Env,
  file: string,
  ids: string[],
  o: EditOptions & { cascade?: boolean },
): CommandResult {
  return edit(
    env,
    file,
    o,
    ids.map((id) => (p: Project) => removeLink(p, id, { cascade: o.cascade === true })),
  );
}

export function linkFlipCommand(env: Env, file: string, id: string, o: EditOptions): CommandResult {
  return edit(env, file, o, [(p) => flipSign(p, id)]);
}

// ----- type -----

export const TYPE_KINDS: Record<string, TypeKind> = {
  category: 'category',
  role: 'role',
  link: 'linkType',
  field: 'field',
};

interface TypeOptions extends EditOptions {
  name?: string;
  id?: string;
  description?: string;
  colour?: string;
  shape?: string;
  response?: boolean;
  style?: string;
  marker?: string;
  optional?: boolean;
  kind?: string;
  appliesTo?: string;
  option?: string[];
  clear?: string[];
}

/** The fields each kind of type may set or clear. */
const TYPE_FIELDS: Record<TypeKind, readonly string[]> = {
  category: ['name', 'colour', 'description'],
  role: ['name', 'shape', 'description', 'response'],
  linkType: ['name', 'description', 'style', 'marker', 'optional'],
  field: ['name', 'kind', 'appliesTo', 'options', 'description'],
};

function typeFields(kind: TypeKind, o: TypeOptions): Record<string, unknown> {
  const given: Record<string, unknown> = {
    ...(o.name !== undefined ? { name: o.name } : {}),
    ...(o.description !== undefined ? { description: o.description } : {}),
    ...(o.colour !== undefined ? { colour: o.colour } : {}),
    ...(o.shape !== undefined ? { shape: oneOf(o.shape, SHAPES, 'shape') } : {}),
    ...(o.response ? { response: true } : {}),
    ...(o.style !== undefined
      ? { style: oneOf(o.style, ['solid', 'dashed', 'dotted'] as const, 'style') }
      : {}),
    ...(o.marker !== undefined ? { marker: oneOf(o.marker, ['none', 'flag'] as const, 'marker') } : {}),
    ...(o.optional ? { optional: true } : {}),
    ...(o.kind !== undefined
      ? { kind: oneOf(o.kind, ['text', 'number', 'choice', 'boolean'] as const, 'kind') }
      : {}),
    ...(o.appliesTo !== undefined
      ? { appliesTo: oneOf(o.appliesTo, ['variables', 'links', 'both'] as const, 'applies-to') }
      : {}),
    ...(o.option?.length
      ? {
          options: o.option.map((spec) => {
            const [id, name] = spec.includes('=') ? pair(spec, 'option') : [spec, spec];
            return { id, name };
          }),
        }
      : {}),
  };
  const allowed = TYPE_FIELDS[kind];
  const wrong = Object.keys(given).filter((key) => !allowed.includes(key));
  if (wrong.length) {
    throw new OpError(
      `A ${kind === 'linkType' ? 'link type' : kind} has no ${listing(wrong.map((w) => `--${w.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`))}.`,
      'usage',
    );
  }
  return given;
}

export function typeAddCommand(
  env: Env,
  file: string,
  kind: TypeKind,
  o: TypeOptions & { name: string },
): CommandResult {
  const input = { ...typeFields(kind, o), ...(o.id ? { id: o.id } : {}) };
  return edit(env, file, o, [(p) => addType(p, kind, input as never)]);
}

export function typeSetCommand(
  env: Env,
  file: string,
  kind: TypeKind,
  ref: string,
  o: TypeOptions,
): CommandResult {
  const changes = { ...typeFields(kind, o), ...cleared(o.clear, TYPE_FIELDS[kind], 'these') };
  if (Object.keys(changes).length === 0)
    throw new OpError('Nothing to change: give a field to set or --clear.', 'usage');
  return edit(env, file, o, [(p) => setType(p, kind, ref, changes as never)]);
}

export function typeRemoveCommand(
  env: Env,
  file: string,
  kind: TypeKind,
  ref: string,
  o: EditOptions & { cascade?: boolean },
): CommandResult {
  return edit(env, file, o, [(p) => removeType(p, kind, ref, { cascade: o.cascade === true })]);
}

export function typeMoveCommand(
  env: Env,
  file: string,
  kind: TypeKind,
  ref: string,
  o: EditOptions & { to: string },
): CommandResult {
  return edit(env, file, o, [(p) => moveType(p, kind, ref, number(o.to, 'to') - 1)]);
}

// ----- loops -----

export function loopsListCommand(
  file: string,
  o: { maxLength?: string; limit?: string; includeOptional?: boolean },
): CommandResult {
  const project = loadProject(file);
  const limit = o.limit === undefined ? 1000 : number(o.limit, 'limit');
  const maxLength = o.maxLength === undefined ? undefined : number(o.maxLength, 'max-length');
  const { loops, stats } = findLoops(project, {
    limit,
    ...(maxLength !== undefined ? { maxLength } : {}),
    includeOptional: o.includeOptional === true,
  });
  const links = new Map(project.links.map((l) => [l.id, l]));
  const named = new Map(project.loops.map((l) => [loopKey(l.links), l]));
  const found = loops.map((loop) => {
    const name = named.get(loopKey(loop.links));
    return {
      polarity: loop.polarity,
      links: loop.links,
      variables: loop.links.map((id) => links.get(id)?.from as string),
      ...(name ? { named: { id: name.id, name: name.name } } : {}),
    };
  });
  const totals = `${stats.capped ? 'at least ' : ''}${plural(stats.count, 'loop')} (${stats.reinforcing} reinforcing, ${stats.balancing} balancing${stats.unknown ? `, ${stats.unknown} of unknown polarity` : ''})`;
  const lines = [
    `${totals}${maxLength !== undefined ? ` of up to ${plural(maxLength, 'link')}` : ''}${stats.capped ? `; stopped at ${limit}` : ''}`,
    ...found.map(
      (f) =>
        `${f.polarity}  ${[...f.variables, f.variables[0]].join(' → ')}  (${f.links.join(' ')})${f.named ? `  named ${f.named.id} "${f.named.name}"` : ''}`,
    ),
  ];
  const namedLoops = project.loops.map((l) => ({
    id: l.id,
    name: l.name,
    polarity: loopPolarity(project, l) ?? '?',
    links: l.links,
  }));
  return {
    text: lines.join('\n'),
    data: { stats, loops: found, named: namedLoops },
  };
}

interface LoopOptions extends EditOptions {
  name?: string;
  links?: string;
  id?: string;
  archetype?: string;
  description?: string;
  caution?: string;
  clear?: string[];
}

function loopFields(o: LoopOptions): LoopChanges {
  return {
    ...(o.name !== undefined ? { name: o.name } : {}),
    ...(o.links !== undefined ? { links: list(o.links) } : {}),
    ...(o.archetype !== undefined ? { archetype: o.archetype } : {}),
    ...(o.description !== undefined ? { description: o.description } : {}),
    ...(o.caution !== undefined ? { caution: o.caution } : {}),
  };
}

export function loopAddCommand(
  env: Env,
  file: string,
  o: LoopOptions & { name: string; links: string },
): CommandResult {
  return edit(env, file, o, [
    (p) => addLoop(p, { ...loopFields(o), ...(o.id ? { id: o.id } : {}) } as never),
  ]);
}

export function loopSetCommand(env: Env, file: string, id: string, o: LoopOptions): CommandResult {
  const changes = { ...loopFields(o), ...cleared(o.clear, ['archetype', 'description', 'caution'], 'loops') };
  if (Object.keys(changes).length === 0)
    throw new OpError('Nothing to change: give a field to set or --clear.', 'usage');
  return edit(env, file, o, [(p) => setLoop(p, id, changes)]);
}

export function loopRemoveCommand(
  env: Env,
  file: string,
  id: string,
  o: EditOptions & { cascade?: boolean },
): CommandResult {
  return edit(env, file, o, [(p) => removeLoop(p, id, { cascade: o.cascade === true })]);
}

// ----- layout -----

interface LayoutOptions extends EditOptions {
  auto?: string;
  seed?: string;
  move?: string[];
  pin?: string[];
  unpin?: string[];
  labelSide?: string[];
  bend?: string[];
  clearBends?: string[] | boolean;
  home?: string;
  clearHome?: boolean;
}

export function layoutCommand(env: Env, file: string, o: LayoutOptions): CommandResult {
  const steps: ((p: Project) => OpOutput<unknown>)[] = [];
  if (o.seed !== undefined && o.auto === undefined) throw new OpError('--seed goes with --auto.', 'usage');
  if (o.auto !== undefined) {
    const kind = oneOf(o.auto, ['constellation', 'force', 'flow'] as const, 'auto') as LayoutKind;
    const seed = o.seed === undefined ? undefined : number(o.seed, 'seed');
    steps.push((p) => applyAutoLayout(p, { kind, ...(seed !== undefined ? { seed } : {}) }));
  }
  if (o.move?.length) {
    const moves: Record<string, { x: number; y: number }> = {};
    for (const spec of o.move) {
      const [ref, at] = pair(spec, 'move');
      const [x, y] = numbers(at, 2, 'move') as [number, number];
      moves[ref] = { x, y };
    }
    steps.push((p) => moveVariables(p, moves));
  }
  if (o.pin?.length) steps.push((p) => setPinned(p, o.pin as string[], true));
  if (o.unpin?.length) steps.push((p) => setPinned(p, o.unpin as string[], false));
  for (const spec of o.labelSide ?? []) {
    const [ref, side] = pair(spec, 'label-side');
    const value =
      side === 'auto' ? null : oneOf(side, ['above', 'below', 'left', 'right'] as const, 'label-side');
    steps.push((p) => setLabelSide(p, ref, value));
  }
  if (o.bend?.length || o.clearBends) {
    steps.push((p) => {
      const bends: Record<string, number | null> = {};
      const clearing =
        o.clearBends === true ? Object.keys(p.layout.bends) : ensureArray(o.clearBends || undefined);
      for (const id of clearing) bends[id] = null;
      for (const spec of o.bend ?? []) {
        const [id, value] = pair(spec, 'bend');
        bends[id] = number(value, 'bend');
      }
      return setBends(p, bends);
    });
  }
  if (o.home !== undefined && o.clearHome)
    throw new OpError('Give --home or --clear-home, not both.', 'usage');
  if (o.home !== undefined) {
    const [x, y, zoom] = numbers(o.home, 3, 'home') as [number, number, number];
    steps.push((p) => setHome(p, { x, y, zoom }));
  }
  if (o.clearHome) steps.push((p) => setHome(p, null));
  if (steps.length === 0) return layoutShowCommand(file);
  return edit(env, file, o, steps);
}

function layoutShowCommand(file: string): CommandResult {
  const project = loadProject(file);
  const positions = project.layout.positions;
  const unplaced = project.variables.filter((v) => !positions[v.id]).map((v) => v.id);
  const home = project.layout.home;
  const lines = [
    ...project.variables
      .filter((v) => positions[v.id])
      .map((v) => {
        const p = positions[v.id] as { x: number; y: number; pinned?: boolean; labelSide?: string };
        return `${v.id.padEnd(24)} ${p.x}, ${p.y}${p.pinned ? '  pinned' : ''}${p.labelSide ? `  label ${p.labelSide}` : ''}`;
      }),
    ...(unplaced.length ? [`not placed (drawn by an automatic layout): ${unplaced.join(', ')}`] : []),
    `curves set by hand: ${Object.keys(project.layout.bends).length}; groups: ${project.layout.groups.length}`,
    `home view: ${home ? `centre (${home.x}, ${home.y}), zoom ${home.zoom}` : 'fitted to the map'}`,
  ];
  return {
    text: lines.join('\n'),
    data: {
      positions,
      unplaced,
      bends: project.layout.bends,
      groups: project.layout.groups.map((g) => g.id),
      home: home ?? null,
    },
  };
}
