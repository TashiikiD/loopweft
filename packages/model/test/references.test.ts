// Partly from PolycrisisPresentation tests/references.test.ts (working copy of 2026-10-17), private.
// The deck's own list is checked on the converted example in polycrisis.test.ts.
import { describe, expect, it } from 'vitest';
import {
  citedIn,
  type Project,
  parseProject,
  referenceList,
  referenceSpans,
  sceneList,
} from '../src/index.ts';
import { edit, richInput } from './helpers.ts';

function withSources(sources: object[]): Project {
  const result = parseProject(
    edit(richInput(), {
      sources: [
        { id: 'T', apa: 'Test, A. (2020). *A fictitious source for tests*. Test Press.' },
        { id: 'TS', apa: 'Test, A. (2020). *Supplement* [Supplementary material].', partOf: 'T' },
        ...sources,
      ],
    }),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.project;
}

describe('the reference list', () => {
  it('is alphabetical by first author, ignoring italics marks, with supplements under their work', () => {
    const project = withSources([
      { id: 'W', apa: 'World Economic Forum. (2026). *Global risks report 2026*.' },
      { id: 'S', apa: 'Søgaard Jørgensen, P. (2023). Evolution of the polycrisis.' },
      { id: 'G', apa: '*Glossary of tests*. (2019). Test Press.' },
      { id: 'B', apa: 'Brosig, M. (2025). How do crises spread?' },
    ]);
    const refs = referenceList(project);
    expect(refs.map((r) => r.source.id)).toEqual(['B', 'G', 'S', 'T', 'W']);
    expect(refs.find((r) => r.source.id === 'T')?.parts.map((p) => p.source.id)).toEqual(['TS']);
    expect(refs.flatMap((r) => [r, ...r.parts])).toHaveLength(6);
  });

  it('records the scenes that draw on each source', () => {
    const project = withSources([{ id: 'X', apa: 'Xu, Y. (2001). Unused.' }]);
    const refs = referenceList(project);
    expect(refs.find((r) => r.source.id === 'T')?.scenes).toEqual(['S1']);
    expect(refs.find((r) => r.source.id === 'X')?.scenes).toEqual([]);
    expect(citedIn(project, 'T')).toEqual(['S1']);
    expect(citedIn(project, 'TS')).toEqual([]);
  });
});

describe('references as text', () => {
  it('renders italics and links', () => {
    const spans = referenceSpans(
      'Brosig, M. (2025). Title. *Global Sustainability*, *8*, Article e11. https://doi.org/10.1017/sus.2025.14',
    );
    expect(spans.filter((s) => s.italic).map((s) => s.text)).toEqual(['Global Sustainability', '8']);
    expect(spans.at(-1)).toEqual({
      text: 'https://doi.org/10.1017/sus.2025.14',
      href: 'https://doi.org/10.1017/sus.2025.14',
    });
    expect(spans.map((s) => s.text).join('')).toBe(
      'Brosig, M. (2025). Title. Global Sustainability, 8, Article e11. https://doi.org/10.1017/sus.2025.14',
    );
  });

  it('lists scene numbers in words', () => {
    expect(sceneList([])).toBe('');
    expect(sceneList([4])).toBe('Scene 4');
    expect(sceneList([1, 2, 8])).toBe('Scenes 1, 2 and 8');
  });
});
