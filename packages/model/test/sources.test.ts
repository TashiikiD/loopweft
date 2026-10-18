import { describe, expect, it } from 'vitest';
import {
  addCitation,
  addSource,
  errorsIn,
  evidenceCoverage,
  findCitation,
  OpError,
  readProject,
  removeCitation,
  removeSource,
  resolveCitable,
  setCitation,
  setSource,
  sourceUses,
  suggestSourceId,
  validateProject,
} from '../src/index.ts';
import { repoFile, richProject } from './helpers.ts';

function repoProject(path: string) {
  const read = readProject(repoFile(path));
  if (!read.ok) throw new Error(`${path} does not read`);
  return read.project;
}

function refused(run: () => unknown): OpError {
  try {
    run();
  } catch (error) {
    if (error instanceof OpError) return error;
    throw error;
  }
  throw new Error('expected the operation to refuse');
}

const NEW_APA =
  'Other, B., & Writer, C. (2021). A second fictitious source. *Journal of Tests*, *3*(2), 10–20.';

describe('source ids', () => {
  it('suggests the first family name and the year', () => {
    const none = new Set<string>();
    expect(suggestSourceId(NEW_APA, none)).toBe('other2021');
    expect(suggestSourceId('Søgaard Jørgensen, P., & Crépin, A.-S. (2023). Title.', none)).toBe(
      'søgaardjørgensen2023',
    );
    expect(suggestSourceId('World Economic Forum. (2026). *Global risks report 2026*.', none)).toBe(
      'worldeconomicforum2026',
    );
    expect(suggestSourceId('European Commission, Joint Research Centre. (n.d.). *A workshop*.', none)).toBe(
      'europeancommissionnd',
    );
    expect(suggestSourceId('Brosig, M. (2025a). Title.', none)).toBe('brosig2025');
  });

  it('tells same-year works apart as APA does, and falls back to a number', () => {
    expect(suggestSourceId(NEW_APA, new Set(['other2021']))).toBe('other2021b');
    expect(suggestSourceId(NEW_APA, new Set(['other2021', 'other2021b']))).toBe('other2021c');
    expect(suggestSourceId('*A title in the author place*. (2020).', new Set())).toBe(
      'atitleintheauthorplace2020',
    );
    expect(suggestSourceId('A reference without a year.', new Set())).toBe('source1');
    expect(suggestSourceId('Untitled notes', new Set(['source1']))).toBe('source2');
  });
});

describe('sources', () => {
  it('adds a source with a suggested id', () => {
    const before = richProject();
    const { project, result, summary } = addSource(before, {
      apa: NEW_APA,
      label: 'Other and Writer (2021)',
    });
    expect(result).toEqual({ id: 'other2021' });
    expect(summary).toBe('Added source other2021 (Other and Writer (2021)).');
    expect(project.sources.at(-1)).toEqual({
      id: 'other2021',
      label: 'Other and Writer (2021)',
      apa: NEW_APA,
    });
    expect(before).toEqual(richProject());
    expect(errorsIn(validateProject(project))).toEqual([]);
  });

  it('refuses a repeated id, DOI or reference, and a reference left out', () => {
    expect(refused(() => addSource(richProject(), { id: 'T', apa: NEW_APA })).kind).toBe('conflict');
    expect(refused(() => addSource(richProject(), { apa: NEW_APA, doi: '10.1234/TEST.1' })).message).toBe(
      'Source T already has the DOI 10.1234/test.1.',
    );
    const apa = richProject().sources[0]?.apa as string;
    expect(refused(() => addSource(richProject(), { apa })).message).toBe(
      'Source T already has that reference.',
    );
    const missing = refused(() => addSource(richProject(), { label: 'No reference' } as never));
    expect(missing.kind).toBe('invalid');
    expect(missing.issues[0]).toEqual(expect.objectContaining({ code: 'missingField' }));
  });

  it('refuses a DOI written as an address, and a part of no known work', () => {
    const error = refused(() => addSource(richProject(), { apa: NEW_APA, doi: 'https://doi.org/10.1/x' }));
    expect(error.message).toBe('Write the bare DOI, e.g. 10.1017/sus.2024.1. Got "https://doi.org/10.1/x".');
    expect(refused(() => addSource(richProject(), { apa: NEW_APA, partOf: 'nobody' })).issues[0]).toEqual(
      expect.objectContaining({ code: 'unknownSource' }),
    );
  });

  it("lets a supplement share its work's DOI, as the example's does", () => {
    const shared = addSource(richProject(), { apa: NEW_APA, doi: '10.1234/test.1', partOf: 'T' });
    expect(shared.result.id).toBe('other2021');
    const example = repoProject('examples/polycrisis.loopweft');
    expect(setSource(example, 'RIS', { summary: 'The diagrams behind Fig. 5.' }).result.changed).toEqual([
      'summary',
    ]);
    expect(refused(() => setSource(example, 'RIS', { partOf: null })).message).toBe(
      'Source RI already has the DOI 10.1007/s10584-021-02957-w.',
    );
  });

  it('changes and clears fields, keeping the id', () => {
    const { project, result } = setSource(richProject(), 'T', {
      summary: 'What the map draws on.',
      doi: null,
    });
    expect(result).toEqual({ id: 'T', changed: ['summary', 'doi'] });
    expect(project.sources[0]).toEqual({
      id: 'T',
      label: 'Test (2020)',
      apa: 'Test, A. (2020). *A fictitious source for tests*. Test Press.',
      summary: 'What the map draws on.',
    });
    expect(refused(() => setSource(richProject(), 'T', { id: 'U' } as never)).message).toBe(
      'A source keeps its id.',
    );
    expect(setSource(richProject(), 'T', { label: 'Test (2020)' }).summary).toBe(
      'Nothing to change: source T already has those values.',
    );
  });

  it('finds a source by its label, and suggests one when nothing matches', () => {
    expect(setSource(richProject(), 'test (2020)', { licence: 'CC0 1.0' }).result.id).toBe('T');
    expect(refused(() => setSource(richProject(), 'Test (2021)', { licence: 'x' })).message).toBe(
      'No source "Test (2021)" (did you mean "Test (2020)"?).',
    );
  });

  it('lists where a source is used', () => {
    expect(sourceUses(richProject(), 'T').map((u) => `${u.kind} ${u.id}`)).toEqual([
      'variable births',
      'link L1',
      'link L2',
      'link L4',
      'loop R1',
      'scene S1',
      'overlay S1.2',
    ]);
  });

  it('refuses to remove a cited source unless cascading, and never a work with supplements', () => {
    expect(refused(() => removeSource(richProject(), 'TS')).message).toBe(
      'Source TS is still cited by 1 link (L3). Remove those first, or remove it with cascade to remove them too.',
    );
    expect(refused(() => removeSource(richProject(), 'T')).message).toBe(
      'Source T has 1 supplement (TS). Remove it first, or make it part of no work.',
    );
    expect(
      refused(() => removeSource(setSource(richProject(), 'TS', { partOf: null }).project, 'T')).message,
    ).toBe(
      'Source T is still cited by 1 variable (births), cited by 3 links (L1, L2, L4), cited by 1 loop (R1), cited by 1 overlay (S1.2 overlay 3) and listed by 1 scene (S1). Remove those first, or remove it with cascade to remove them too.',
    );
  });

  it('removes a source with its citations and listings', () => {
    const detached = setSource(richProject(), 'TS', { partOf: null }).project;
    const { project, result, summary } = removeSource(detached, 'T', { cascade: true });
    expect(result).toEqual({ id: 'T', removedCitations: 6, changedScenes: ['S1'] });
    expect(summary).toBe('Removed source T with 6 citations and its listing in 1 scene.');
    expect(project.links.map((l) => l.citations.length)).toEqual([0, 0, 1, 0, 0]);
    expect(project.story.scenes[0]?.sources).toEqual([]);
    const cards = project.story.scenes[0]?.steps[1]?.overlays[2];
    expect(cards).toMatchObject({ type: 'cards' });
    expect(cards).not.toHaveProperty('citations');
    expect(errorsIn(validateProject(project))).toEqual([]);
  });
});

describe('citations', () => {
  it('finds what to cite by id, or a variable by its label', () => {
    expect(resolveCitable(richProject(), 'L2')).toMatchObject({ kind: 'link', id: 'L2', index: 1 });
    expect(resolveCitable(richProject(), 'R1')).toMatchObject({ kind: 'loop', id: 'R1' });
    expect(resolveCitable(richProject(), 'Population')).toMatchObject({ kind: 'variable', id: 'population' });
    expect(refused(() => resolveCitable(richProject(), 'nothing')).message).toBe(
      'Nothing on the map is called "nothing": name a variable, link or loop.',
    );
  });

  it('cites a source on several elements, leaving those that already cite it there', () => {
    const before = richProject();
    const { project, result, summary } = addCitation(before, ['L3', 'L5', 'population', 'L1'], {
      source: 'T',
      pages: '4–5',
      strength: 'moderate',
    });
    expect(result).toEqual({ source: 'T', added: ['L3', 'L5', 'population'], skipped: ['L1'] });
    expect(summary).toBe('Cited T pp. 4–5 on L3, L5 and population. L1 already cited it.');
    expect(project.links[4]?.citations).toEqual([{ source: 'T', pages: '4–5', strength: 'moderate' }]);
    expect(before).toEqual(richProject());
    expect(errorsIn(validateProject(project))).toEqual([]);
  });

  it('says when nothing changes, and refuses an unknown source or a bad strength', () => {
    const same = addCitation(richProject(), ['L1'], { source: 'T', pages: '4–5' });
    expect(same.summary).toBe('Nothing to change: L1 already cites T pp. 4–5.');
    expect(refused(() => addCitation(richProject(), ['L1'], { source: 'X' })).kind).toBe('notFound');
    const bad = refused(() => addCitation(richProject(), ['L5'], { source: 'T', strength: 'huge' as never }));
    expect(bad.kind).toBe('invalid');
    expect(bad.issues[0]?.path).toEqual(['links', 4, 'citations', 0, 'strength']);
    expect(refused(() => addCitation(richProject(), [], { source: 'T' })).kind).toBe('usage');
  });

  it('finds one citation by its source, and by its pages when there are several', () => {
    const twice = addCitation(richProject(), ['L1'], { source: 'T', pages: '9' }).project;
    expect(findCitation(richProject(), 'L1', 'T')).toBe(0);
    expect(findCitation(twice, 'L1', 'T', '9')).toBe(1);
    expect(refused(() => findCitation(twice, 'L1', 'T')).message).toBe(
      'L1 cites T 2 times (pages 4–5 and 9); say which by its pages.',
    );
    expect(refused(() => findCitation(richProject(), 'L3', 'T')).message).toBe(
      'L3 does not cite T (it cites TS).',
    );
  });

  it('changes a citation, and refuses one that would repeat another', () => {
    const { project, result } = setCitation(richProject(), 'L1', 0, {
      strength: 'weak',
      note: 'Table 2',
      pages: null,
    });
    expect(result).toEqual({ element: 'L1', index: 0, changed: ['pages', 'strength', 'note'] });
    expect(project.links[0]?.citations).toEqual([{ source: 'T', strength: 'weak', note: 'Table 2' }]);
    const twice = addCitation(richProject(), ['L1'], { source: 'T', pages: '9' }).project;
    expect(refused(() => setCitation(twice, 'L1', 1, { pages: '4–5' })).message).toBe(
      'L1 already cites T pp. 4–5 (citation 1).',
    );
    expect(refused(() => setCitation(richProject(), 'L1', 3, { pages: '1' })).kind).toBe('notFound');
    expect(refused(() => setCitation(richProject(), 'L1', 0, { source: null })).kind).toBe('usage');
  });

  it('removes a citation', () => {
    const { project, summary } = removeCitation(richProject(), 'births', 0);
    expect(summary).toBe("Removed births's citation of T p. 3.");
    expect(project.variables[0]?.citations).toEqual([]);
  });
});

describe('evidence coverage', () => {
  it('counts cited and uncited elements, strengths and pages', () => {
    expect(evidenceCoverage(richProject())).toEqual({
      variables: { total: 3, cited: 1, uncited: ['population', 'deaths'] },
      links: { total: 5, cited: 4, uncited: ['L5'] },
      loops: { total: 2, cited: 1, uncited: ['B1'] },
      strengths: { strong: 1, moderate: 0, weak: 0, unrated: 5 },
      withoutPages: 3,
      sources: [
        { id: 'T', citations: 5, elements: 5, story: 2 },
        { id: 'TS', citations: 1, elements: 1, story: 0 },
      ],
    });
  });
});
