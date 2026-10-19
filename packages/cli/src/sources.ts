// `loopweft source`, `cite` and `references`: the map's evidence from the command line. They run the same
// operations as the Studio's Sources workspace; `source lookup` and `source add --doi` make the app's only
// network call, the DOI lookup at Crossref, and say plainly when it fails.
import {
  addCitation,
  addSource,
  type Citation,
  type CitationChanges,
  evidenceCoverage,
  findCitation,
  type LookupResult,
  listing,
  lookupDoi,
  OpError,
  type Project,
  plural,
  type ReferenceDraft,
  readDoi,
  referenceList,
  removeCitation,
  removeSource,
  resolveCitable,
  resolveSource,
  type SourceChanges,
  type SourceInput,
  setCitation,
  setSource,
  sourceUses,
} from '@loopweft/model';
import { type CommandResult, cleared, edit } from './commands.ts';
import { type Env, list, loadProject, oneOf } from './support.ts';

const STRENGTHS = ['strong', 'moderate', 'weak'] as const;

/** A locator as people read it after a source's id: "L p. 4", "L pp. 4–5". */
const cited = (c: Pick<Citation, 'source' | 'pages'>) =>
  `${c.source}${c.pages === undefined ? '' : ` ${/[–—,-]/.test(c.pages) ? 'pp.' : 'p.'} ${c.pages}`}`;

export const citationText = (c: Citation) =>
  `${cited(c)}${c.strength ? ` · ${c.strength}` : ''}${c.note ? ` · ${c.note}` : ''}`;

/** A reference without its italics marks, for plain text. */
const plainReference = (apa: string) => apa.replace(/\*([^*]+)\*/g, '$1');

/** A bare DOI from an option, accepting the forms people paste (a doi.org address, "doi:"). */
function doiOption(text: string): string {
  const doi = readDoi(text);
  if (!doi) {
    throw new OpError(
      `--doi: “${text}” is not a DOI. A DOI starts with 10., a number and a slash, e.g. 10.1017/sus.2024.1.`,
      'usage',
    );
  }
  return doi;
}

/** A failed lookup: it exits 2, and `lookup.kind` names why (invalidDoi, offline, timeout, notFound, busy…). */
const lookupFailed = (result: Extract<LookupResult, { ok: false }>): CommandResult => ({
  text: result.failure.message,
  data: { ...(result.doi ? { doi: result.doi } : {}), lookup: result.failure },
  exitCode: 2,
});

const noteLines = (draft: ReferenceDraft) =>
  draft.notes.map(
    (n) =>
      `  ${n.level === 'warning' ? 'WARNING' : n.level === 'missing' ? 'missing' : 'check'}: ${n.message}`,
  );

// ----- source -----

export function sourceListCommand(file: string): CommandResult {
  const project = loadProject(file);
  const coverage = new Map(evidenceCoverage(project).sources.map((s) => [s.id, s]));
  const rows = project.sources.map((s) => ({
    id: s.id,
    ...(s.label ? { label: s.label } : {}),
    apa: s.apa,
    ...(s.doi ? { doi: s.doi } : {}),
    ...(s.url ? { url: s.url } : {}),
    ...(s.partOf ? { partOf: s.partOf } : {}),
    citations: coverage.get(s.id)?.citations ?? 0,
    elements: coverage.get(s.id)?.elements ?? 0,
    story: coverage.get(s.id)?.story ?? 0,
  }));
  const width = Math.max(4, ...rows.map((r) => r.id.length));
  const text = rows
    .map(
      (r) =>
        `${r.id.padEnd(width)}  ${r.label ?? plainReference(r.apa).slice(0, 60)}  (${plural(r.citations, 'citation')}${
          r.story ? `; in the story ${plural(r.story, 'time')}` : ''
        }${r.doi ? `; doi ${r.doi}` : ''}${r.partOf ? `; part of ${r.partOf}` : ''})`,
    )
    .join('\n');
  return { text: text || 'No sources.', data: { sources: rows } };
}

export function sourceShowCommand(file: string, ref: string): CommandResult {
  const project = loadProject(file);
  const { source } = resolveSource(project, ref);
  const uses = sourceUses(project, source.id).map((u) =>
    u.kind === 'scene'
      ? { kind: u.kind, id: u.id }
      : { kind: u.kind, id: u.id, ...(u.kind === 'overlay' ? { where: u.where } : {}), citation: u.citation },
  );
  const lines = [
    `${source.id}${source.label ? `: ${source.label}` : ''}`,
    `  ${plainReference(source.apa)}`,
    ...(['doi', 'url', 'licence', 'summary', 'partOf'] as const).flatMap((key) =>
      source[key] ? [`  ${key}: ${source[key]}`] : [],
    ),
    uses.length ? `  used ${plural(uses.length, 'time')}:` : '  not used anywhere',
    ...uses.map((u) =>
      'citation' in u && u.citation
        ? `    ${u.kind} ${'where' in u && u.where ? u.where : u.id}: ${citationText(u.citation)}`
        : `    listed by scene ${u.id}`,
    ),
  ];
  return { text: lines.join('\n'), data: { source, uses } };
}

export async function sourceLookupCommand(env: Env, doi: string): Promise<CommandResult> {
  const result = await lookupDoi(doi, env.fetch ? { fetch: env.fetch } : {});
  if (!result.ok) return lookupFailed(result);
  const { draft } = result;
  const lines = [
    draft.apa,
    `  label: ${draft.label ?? `(none: ${draft.agency} lists no author)`}`,
    `  licence: ${draft.licence ?? '(none recorded)'}`,
    `  from ${draft.agency}, type: ${draft.type}`,
    ...noteLines(draft),
  ];
  return { text: lines.join('\n'), data: { draft } };
}

interface SourceOptions {
  id?: string;
  apa?: string;
  label?: string;
  doi?: string;
  url?: string;
  licence?: string;
  summary?: string;
  partOf?: string;
  dryRun?: boolean;
}

const sourceFields = (o: SourceOptions): SourceChanges => ({
  ...(o.apa !== undefined ? { apa: o.apa } : {}),
  ...(o.label !== undefined ? { label: o.label } : {}),
  ...(o.doi !== undefined ? { doi: doiOption(o.doi) } : {}),
  ...(o.url !== undefined ? { url: o.url } : {}),
  ...(o.licence !== undefined ? { licence: o.licence } : {}),
  ...(o.summary !== undefined ? { summary: o.summary } : {}),
  ...(o.partOf !== undefined ? { partOf: o.partOf } : {}),
});

/**
 * `source add`: by hand with --apa (no network), or from a DOI's record at Crossref or DataCite. Options
 * given beside --doi replace what the lookup drafted.
 */
export async function sourceAddCommand(env: Env, file: string, o: SourceOptions): Promise<CommandResult> {
  loadProject(file);
  if (o.apa === undefined && o.doi === undefined) {
    throw new OpError('Give the reference with --apa, or a DOI to look up with --doi.', 'usage');
  }
  let draft: ReferenceDraft | undefined;
  if (o.apa === undefined && o.doi !== undefined) {
    const result = await lookupDoi(doiOption(o.doi), env.fetch ? { fetch: env.fetch } : {});
    if (!result.ok) return lookupFailed(result);
    draft = result.draft;
  }
  const input = {
    ...(draft
      ? {
          apa: draft.apa,
          doi: draft.doi,
          ...(draft.label ? { label: draft.label } : {}),
          ...(draft.licence ? { licence: draft.licence } : {}),
        }
      : {}),
    ...sourceFields({ ...o, ...(draft ? { doi: undefined } : {}) }),
    ...(o.id ? { id: o.id } : {}),
  } as SourceInput;
  const out = edit(env, file, o, [(p) => addSource(p, input)]);
  if (!draft) return out;
  const lines = [
    out.text,
    `  ${draft.apa}`,
    `  from ${draft.agency}, type: ${draft.type}`,
    ...(draft.notes.length ? ['  check before citing:', ...noteLines(draft).map((l) => `  ${l}`)] : []),
  ];
  return {
    text: lines.join('\n'),
    data: { ...out.data, lookup: { agency: draft.agency, type: draft.type, notes: draft.notes } },
  };
}

export function sourceSetCommand(
  env: Env,
  file: string,
  ref: string,
  o: SourceOptions & { clear?: string[] },
): CommandResult {
  const changes: SourceChanges = {
    ...sourceFields(o),
    ...cleared(o.clear, ['label', 'doi', 'url', 'licence', 'summary', 'partOf'], 'sources'),
  };
  if (Object.keys(changes).length === 0)
    throw new OpError('Nothing to change: give a field to set or --clear.', 'usage');
  return edit(env, file, o, [(p) => setSource(p, ref, changes)]);
}

export function sourceRemoveCommand(
  env: Env,
  file: string,
  refs: string[],
  o: { cascade?: boolean; dryRun?: boolean },
): CommandResult {
  return edit(
    env,
    file,
    o,
    refs.map((ref) => (p: Project) => removeSource(p, ref, { cascade: o.cascade === true })),
  );
}

// ----- cite -----

interface CiteOptions {
  pages?: string;
  strength?: string;
  note?: string;
  dryRun?: boolean;
}

const citationFields = (o: CiteOptions) => ({
  ...(o.pages !== undefined ? { pages: o.pages } : {}),
  ...(o.strength !== undefined ? { strength: oneOf(o.strength, STRENGTHS, 'strength') } : {}),
  ...(o.note !== undefined ? { note: o.note } : {}),
});

export function citeAddCommand(
  env: Env,
  file: string,
  elements: string,
  source: string,
  o: CiteOptions,
): CommandResult {
  const refs = list(elements);
  return edit(env, file, o, [(p) => addCitation(p, refs, { source, ...citationFields(o) })]);
}

export function citeSetCommand(
  env: Env,
  file: string,
  element: string,
  source: string,
  o: CiteOptions & { citedPages?: string; source?: string; clear?: string[] },
): CommandResult {
  const changes: CitationChanges = {
    ...citationFields(o),
    ...(o.source !== undefined ? { source: o.source } : {}),
    ...cleared(o.clear, ['pages', 'strength', 'note'], 'citations'),
  };
  if (Object.keys(changes).length === 0)
    throw new OpError('Nothing to change: give a field to set or --clear.', 'usage');
  return edit(env, file, o, [
    (p) => setCitation(p, element, findCitation(p, element, source, o.citedPages), changes),
  ]);
}

export function citeRemoveCommand(
  env: Env,
  file: string,
  elements: string,
  source: string,
  o: { citedPages?: string; all?: boolean; dryRun?: boolean },
): CommandResult {
  const steps = list(elements).map((element) => (p: Project) => {
    if (!o.all) return removeCitation(p, element, findCitation(p, element, source, o.citedPages));
    // Every citation of the source on the element, last first so the places stay right.
    const sourceId = resolveSource(p, source).source.id;
    const at = resolveCitable(p, element);
    const places = at.citations.flatMap((c, i) => (c.source === sourceId ? [i] : [])).reverse();
    if (places.length === 0) findCitation(p, element, source);
    let project = p;
    const summaries: string[] = [];
    for (const i of places) {
      const out = removeCitation(project, element, i);
      project = out.project;
      summaries.push(out.summary);
    }
    return {
      project,
      result: { element: at.id, removed: places.length },
      summary: summaries.reverse().join(' '),
    };
  });
  return edit(env, file, o, steps);
}

export function citeListCommand(
  file: string,
  elements: string[],
  o: { source?: string; uncited?: boolean },
): CommandResult {
  const project = loadProject(file);
  if (o.uncited) {
    const coverage = evidenceCoverage(project);
    const label = new Map(project.variables.map((v) => [v.id, v.label]));
    const linkName = new Map(
      project.links.map((l) => [l.id, `${label.get(l.from) ?? l.from} → ${label.get(l.to) ?? l.to}`]),
    );
    const part = (what: string, count: typeof coverage.links, name: (id: string) => string) => [
      `${count.cited} of ${plural(count.total, what)} cite a source${count.uncited.length ? '; citing nothing:' : '.'}`,
      ...count.uncited.map((id) => `  ${id}  ${name(id)}`),
    ];
    const lines = [
      ...part('link', coverage.links, (id) => linkName.get(id) ?? id),
      ...part('variable', coverage.variables, (id) => label.get(id) ?? id),
      ...part('named loop', coverage.loops, (id) => project.loops.find((l) => l.id === id)?.name ?? id),
    ];
    return {
      text: lines.join('\n'),
      data: { links: coverage.links, variables: coverage.variables, loops: coverage.loops },
    };
  }
  const sourceId = o.source === undefined ? undefined : resolveSource(project, o.source).source.id;
  const targets = elements.length
    ? elements.flatMap((e) => list(e)).map((ref) => resolveCitable(project, ref))
    : [
        ...project.variables.map((v, index) => ({
          kind: 'variable' as const,
          id: v.id,
          index,
          citations: v.citations,
        })),
        ...project.links.map((l, index) => ({
          kind: 'link' as const,
          id: l.id,
          index,
          citations: l.citations,
        })),
        ...project.loops.map((l, index) => ({
          kind: 'loop' as const,
          id: l.id,
          index,
          citations: l.citations,
        })),
      ];
  const rows = targets
    .map((t) => ({
      kind: t.kind,
      id: t.id,
      citations: t.citations.filter((c) => sourceId === undefined || c.source === sourceId),
    }))
    .filter((r) => elements.length || r.citations.length);
  const width = Math.max(4, ...rows.map((r) => r.id.length));
  const text = rows
    .map(
      (r) =>
        `${r.id.padEnd(width)}  ${r.citations.length ? r.citations.map(citationText).join('; ') : 'cites nothing'}`,
    )
    .join('\n');
  return {
    text: text || (sourceId ? `Nothing cites ${sourceId}.` : 'Nothing cites a source yet.'),
    data: { citations: rows },
  };
}

// ----- references -----

export function referencesCommand(file: string, o: { markdown?: boolean }): CommandResult {
  const project = loadProject(file);
  const refs = referenceList(project);
  const sceneNumber = new Map(project.story.scenes.map((s, i) => [s.id, i + 1]));
  const scenes = (ids: string[]) =>
    ids.length
      ? ` (${ids.length === 1 ? 'Scene' : 'Scenes'} ${listing(ids.map((id) => String(sceneNumber.get(id))))})`
      : '';
  const write = (apa: string) => (o.markdown ? apa : plainReference(apa));
  const lines: string[] = [];
  for (const ref of refs) {
    lines.push(`${o.markdown ? '- ' : ''}${write(ref.source.apa)}${scenes(ref.scenes)}`);
    for (const part of ref.parts)
      lines.push(`${o.markdown ? '  - ' : '    '}${write(part.source.apa)}${scenes(part.scenes)}`);
  }
  const data = refs.map((r) => ({
    id: r.source.id,
    apa: r.source.apa,
    scenes: r.scenes,
    parts: r.parts.map((p) => ({ id: p.source.id, apa: p.source.apa, scenes: p.scenes })),
  }));
  return { text: lines.join('\n') || 'No sources.', data: { references: data } };
}
