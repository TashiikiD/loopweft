// Building a project from imported rows, for every importer (tables, Kumu, DataViz). Values are read as the
// shorthand reads them, strictly: one that cannot be read is a problem, reported with where it is, and the
// import stops with every problem at once. Nothing is filled in: an empty sign is recorded as unknown (?)
// and counted, as in the shorthand.
import { readFieldValue } from '../fields.ts';
import { createProject } from '../project.ts';
import {
  type Field,
  type FieldValue,
  type Link,
  LinkSchema,
  type Project,
  SHAPES,
  type Variable,
  VariableSchema,
} from '../schema.ts';
import { ID_PATTERN, nextSequentialId, slugify, uniqueId } from '../text/ids.ts';
import { cleanText, readBoolean, readNumber } from '../text/values.ts';
import {
  CONFIDENCE_VOCABULARY,
  normalizeToken,
  resolveVocabularyValue,
  SIGN_VOCABULARY,
} from '../text/vocabulary.ts';
import { validateProject } from '../validate.ts';

/** One thing that stops an import, and where it is ("links.csv, row 4, Sign"). */
export interface ImportProblem {
  where: string;
  message: string;
}

export class ImportError extends Error {
  override name = 'ImportError';
  readonly problems: ImportProblem[];

  constructor(problems: ImportProblem[]) {
    super(
      `The import stopped: ${problems.length} problem${problems.length === 1 ? '' : 's'}.\n${problems
        .slice(0, 50)
        .map((p) => `${p.where}: ${p.message}`)
        .join('\n')}${problems.length > 50 ? `\n… and ${problems.length - 50} more.` : ''}`,
    );
    this.problems = problems;
  }
}

/** What an import gives: the project, and what it did that a person should know, one sentence each. */
export interface ImportOutcome {
  project: Project;
  notes: string[];
}

export interface VariableRow {
  id?: string;
  label?: string;
  mapLabel?: string;
  category?: string;
  role?: string;
  definition?: string;
  size?: string;
  fields?: Record<string, string>;
}

export interface LinkRow {
  id?: string;
  from: string;
  to: string;
  sign?: string;
  type?: string;
  conditional?: string;
  delay?: string;
  delayLabel?: string;
  confidence?: string;
  weight?: string;
  rationale?: string;
  fields?: Record<string, string>;
}

const text = (value: string | undefined): string => cleanText(value ?? '');

export class ProjectBuilder {
  readonly project: Project;
  readonly notes: string[] = [];
  readonly problems: ImportProblem[] = [];
  #taken = new Set<string>();
  #byName = new Map<string, string[]>();
  #unsigned = 0;
  #madeFromEnds: string[] = [];
  #shapes: string[] = [];

  constructor(title: string, description?: string) {
    this.project = createProject({
      title: text(title) || 'Imported map',
      ...(description ? { description } : {}),
    });
    if (!text(title)) this.notes.push('The file gave no title; the map is called "Imported map".');
  }

  problem(where: string, message: string): void {
    this.problems.push({ where, message });
  }

  /** A category by name, made the first time it is named. */
  category(name: string): string {
    return this.#type('categories', name, (id) => ({ id, name: text(name) }));
  }

  /** A role by name, made the first time it is named, with the next shape in the list. */
  role(name: string): string {
    return this.#type('roles', name, (id) => {
      const shape = SHAPES[this.project.types.roles.length % SHAPES.length] as (typeof SHAPES)[number];
      this.#shapes.push(`${text(name)} ${shape}`);
      return { id, name: text(name), shape };
    });
  }

  /** A link type by name, made the first time it is named. */
  linkType(name: string): string {
    return this.#type('linkTypes', name, (id) => ({ id, name: text(name) }));
  }

  #type<T extends { id: string; name: string }>(
    list: 'categories' | 'roles' | 'linkTypes',
    name: string,
    make: (id: string) => T,
  ): string {
    const items = this.project.types[list] as unknown as T[];
    const token = normalizeToken(name);
    const found = items.find((t) => normalizeToken(t.name) === token || t.id === name);
    if (found) return found.id;
    const id = uniqueId(
      slugify(name),
      new Set(items.map((t) => t.id)),
      list === 'linkTypes' ? 'type' : 'item',
    );
    items.push(make(id));
    return id;
  }

  /** A custom field, made the first time it is named; a choice field gains the options its values need. */
  field(spec: { id?: string; name: string; kind: Field['kind']; appliesTo: 'variables' | 'links' }): Field {
    const fields = this.project.types.fields;
    const existing = fields.find(
      (f) =>
        (spec.id !== undefined && f.id === spec.id) || normalizeToken(f.name) === normalizeToken(spec.name),
    );
    if (existing) {
      if ((existing.appliesTo ?? 'both') !== spec.appliesTo && existing.appliesTo !== 'both')
        existing.appliesTo = 'both';
      return existing;
    }
    const id = uniqueId(
      spec.id && ID_PATTERN.test(spec.id) ? spec.id : slugify(spec.name),
      new Set(fields.map((f) => f.id)),
      'field',
    );
    const field: Field = {
      id,
      name: text(spec.name) || id,
      kind: spec.kind,
      appliesTo: spec.appliesTo,
      ...(spec.kind === 'choice' ? { options: [] } : {}),
    };
    fields.push(field);
    return field;
  }

  /** The value of a custom field read from text; a choice field made by the import takes any new value. */
  #fieldValue(field: Field, raw: string, where: string): FieldValue | undefined {
    if (!text(raw)) return undefined;
    if (field.kind === 'choice') {
      field.options ??= [];
      const options = field.options;
      const token = normalizeToken(raw);
      const known = options.find(
        (o) => o.id === raw || normalizeToken(o.id) === token || normalizeToken(o.name) === token,
      );
      if (known) return known.id;
      const id = uniqueId(slugify(raw), new Set(options.map((o) => o.id)), 'option');
      options.push({ id, name: text(raw) });
      return id;
    }
    const read = readFieldValue(field, raw);
    if ('error' in read) {
      this.problem(where, read.error);
      return undefined;
    }
    return read.value;
  }

  #fields(values: Record<string, string> | undefined, where: string): Record<string, FieldValue> | undefined {
    const out: Record<string, FieldValue> = {};
    for (const [id, raw] of Object.entries(values ?? {})) {
      const field = this.project.types.fields.find((f) => f.id === id);
      if (!field) throw new Error(`No field ${id} was made for ${where}.`);
      const value = this.#fieldValue(field, raw, `${where}, ${field.name}`);
      if (value !== undefined) out[id] = value;
    }
    return Object.keys(out).length ? out : undefined;
  }

  /** The variable a name means: an id, or a label, ignoring case and spacing. */
  findVariable(name: string): string | undefined {
    if (this.project.variables.some((v) => v.id === name)) return name;
    const ids = this.#byName.get(normalizeToken(name)) ?? [];
    return ids.length === 1 ? ids[0] : undefined;
  }

  variable(row: VariableRow, where: string): string | undefined {
    let label = text(row.label);
    const given = text(row.id);
    if (!label && !given) {
      this.problem(where, 'The row has no name (label) and no id.');
      return undefined;
    }
    if (given && (!ID_PATTERN.test(given) || given.length > 80)) {
      this.problem(where, `"${given}" cannot be an id: use letters, digits, "_" and "-" only.`);
      return undefined;
    }
    if (given && this.#taken.has(given)) {
      this.problem(where, `The id "${given}" is used twice.`);
      return undefined;
    }
    if (!label) label = given;
    const id = given || uniqueId(slugify(label), this.#taken, 'variable');
    const size = text(row.size).toLowerCase();
    if (size && size !== 'normal' && size !== 'large')
      this.problem(`${where}, size`, `size is normal or large, not "${row.size}".`);
    const candidate: Record<string, unknown> = {
      id,
      label,
      ...(text(row.mapLabel) ? { mapLabel: text(row.mapLabel) } : {}),
      ...(text(row.category) ? { category: this.category(row.category as string) } : {}),
      ...(text(row.role) ? { role: this.role(row.role as string) } : {}),
      ...(text(row.definition) ? { definition: cleanText(row.definition as string, true) } : {}),
      ...(size === 'large' ? { size: 'large' } : {}),
    };
    const fields = this.#fields(row.fields, where);
    if (fields) candidate.fields = fields;
    const parsed = VariableSchema.safeParse(candidate);
    if (!parsed.success) {
      this.problem(where, parsed.error.issues[0]?.message ?? 'The variable is not valid.');
      return undefined;
    }
    this.#add(parsed.data);
    return id;
  }

  #add(variable: Variable): void {
    this.project.variables.push(variable);
    this.#taken.add(variable.id);
    const token = normalizeToken(variable.label);
    this.#byName.set(token, [...(this.#byName.get(token) ?? []), variable.id]);
  }

  /** The variable a link end names, made from the name when there is none. */
  #end(name: string, where: string): string | undefined {
    const found = this.findVariable(name);
    if (found) return found;
    if ((this.#byName.get(normalizeToken(name)) ?? []).length > 1) {
      this.problem(where, `"${name}" names more than one variable; use its id.`);
      return undefined;
    }
    const id = uniqueId(slugify(name), this.#taken, 'variable');
    this.#add({ id, label: name, citations: [] });
    this.#madeFromEnds.push(id);
    return id;
  }

  link(row: LinkRow, where: string): string | undefined {
    const fromName = text(row.from);
    const toName = text(row.to);
    if (!fromName || !toName) {
      this.problem(where, `The link has no ${fromName ? 'effect (to)' : 'cause (from)'}.`);
      return undefined;
    }
    const from = this.#end(fromName, where);
    const to = this.#end(toName, where);
    let sign: Link['sign'] = '?';
    if (text(row.sign)) {
      const read = resolveVocabularyValue(SIGN_VOCABULARY, text(row.sign));
      if (read) sign = read.value as Link['sign'];
      else
        this.problem(
          `${where}, sign`,
          `The sign must be +, - or ? (or a word such as positive), not "${row.sign}".`,
        );
    } else this.#unsigned++;
    const bool = (raw: string | undefined, name: string): boolean | undefined => {
      if (!text(raw)) return undefined;
      const read = readBoolean(text(raw));
      if (read.kind === 'ok') return read.value;
      this.problem(`${where}, ${name}`, `${name} must be true or false (yes or no), not "${raw}".`);
      return undefined;
    };
    const conditional = bool(row.conditional, 'conditional');
    let delay = bool(row.delay, 'delay');
    const delayLabel = text(row.delayLabel);
    if (delayLabel && delay === false)
      this.problem(`${where}, delay`, `The link has a delay label ("${delayLabel}") but no delay.`);
    if (delayLabel && delay === undefined) delay = true;
    let confidence: string | undefined;
    if (text(row.confidence)) {
      const read = resolveVocabularyValue(CONFIDENCE_VOCABULARY, text(row.confidence));
      if (read) confidence = read.value;
      else
        this.problem(
          `${where}, confidence`,
          `confidence must be low, medium or high (L, M, H), not "${row.confidence}".`,
        );
    }
    let weight: number | undefined;
    if (text(row.weight)) {
      const read = readNumber(text(row.weight));
      if (read.kind === 'ok' && read.value >= 0) weight = read.value;
      else this.problem(`${where}, weight`, `weight must be a plain number, 0 or more, not "${row.weight}".`);
    }
    const id = text(row.id);
    if (id && (!ID_PATTERN.test(id) || this.#taken.has(id))) {
      this.problem(
        where,
        this.#taken.has(id)
          ? `The id "${id}" is used twice.`
          : `"${id}" cannot be an id: use letters, digits, "_" and "-" only.`,
      );
      return undefined;
    }
    if (!from || !to) return undefined;
    const type = text(row.type) ? this.linkType(row.type as string) : undefined;
    const twin = this.project.links.find(
      (l) => l.from === from && l.to === to && (l.type ?? '') === (type ?? ''),
    );
    if (twin) {
      this.problem(where, `${fromName} → ${toName} is already link ${twin.id}.`);
      return undefined;
    }
    const linkId = id || nextSequentialId('L', this.#taken);
    const candidate: Record<string, unknown> = {
      id: linkId,
      from,
      to,
      sign,
      ...(type ? { type } : {}),
      ...(conditional ? { conditional: true } : {}),
      ...(delay ? { delay: true } : {}),
      ...(delayLabel && delay ? { delayLabel } : {}),
      ...(confidence ? { confidence } : {}),
      ...(weight !== undefined ? { weight } : {}),
      ...(text(row.rationale) ? { rationale: cleanText(row.rationale as string, true) } : {}),
    };
    const fields = this.#fields(row.fields, where);
    if (fields) candidate.fields = fields;
    const parsed = LinkSchema.safeParse(candidate);
    if (!parsed.success) {
      this.problem(where, parsed.error.issues[0]?.message ?? 'The link is not valid.');
      return undefined;
    }
    this.project.links.push(parsed.data);
    this.#taken.add(linkId);
    return linkId;
  }

  /** The project, checked; or an ImportError with every problem. */
  finish(): ImportOutcome {
    if (this.problems.length) throw new ImportError(this.problems);
    const p = this.project;
    // A choice field whose values were all empty has no options: make it text, which the format allows.
    for (const f of p.types.fields) {
      if (f.kind === 'choice' && !f.options?.length) {
        f.kind = 'text';
        delete f.options;
      }
    }
    const errors = validateProject(p).filter((i) => i.severity === 'error');
    if (errors.length)
      throw new ImportError(errors.map((e) => ({ where: e.path.join('.'), message: e.message })));
    const counts = [
      `${p.variables.length} variable${p.variables.length === 1 ? '' : 's'}`,
      `${p.links.length} link${p.links.length === 1 ? '' : 's'}`,
    ];
    const extra = [
      p.types.categories.length
        ? `${p.types.categories.length} categor${p.types.categories.length === 1 ? 'y' : 'ies'}`
        : '',
      p.types.roles.length ? `${p.types.roles.length} role${p.types.roles.length === 1 ? '' : 's'}` : '',
      p.types.linkTypes.length
        ? `${p.types.linkTypes.length} link type${p.types.linkTypes.length === 1 ? '' : 's'}`
        : '',
      p.types.fields.length
        ? `${p.types.fields.length} custom field${p.types.fields.length === 1 ? '' : 's'}`
        : '',
    ].filter(Boolean);
    const notes = [`Imported ${[...counts, ...extra].join(', ')}.`, ...this.notes];
    if (this.#madeFromEnds.length) {
      notes.push(
        `${this.#madeFromEnds.length} variable${this.#madeFromEnds.length === 1 ? ' was' : 's were'} made from link ends that named no variable: ${this.#madeFromEnds.join(', ')}.`,
      );
    }
    if (this.#unsigned) {
      notes.push(
        `${this.#unsigned} link${this.#unsigned === 1 ? ' had' : 's had'} no sign: recorded as unknown (?) and flagged; set ${this.#unsigned === 1 ? 'it' : 'them'} to + or -.`,
      );
    }
    if (this.#shapes.length)
      notes.push(`Roles take shapes in order (change them under Types): ${this.#shapes.join(', ')}.`);
    if (p.links.length) notes.push('No link cites a source yet: Loopweft flags every uncited link.');
    return { project: p, notes };
  }
}
