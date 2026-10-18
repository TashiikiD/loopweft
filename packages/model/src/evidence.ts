// How well a map's evidence covers it: where each source is used, and which variables, links and loops
// cite nothing. Nothing here judges the evidence; it only counts what the project holds.
import type { Citation, Project } from './schema.ts';

/** The elements that carry citations of their own. Variables, links and loops share one set of ids. */
export type CitableKind = 'variable' | 'link' | 'loop';

/** One use of a source: a citation on an element or overlay, or a scene's listing of it. */
export type SourceUse =
  | { kind: CitableKind; id: string; index: number; citation: Citation }
  | { kind: 'overlay'; id: string; where: string; index: number; citation: Citation }
  | { kind: 'scene'; id: string };

/** Every use of a source, in project order: variables, links, loops, then the story. */
export function sourceUses(project: Project, sourceId: string): SourceUse[] {
  const uses: SourceUse[] = [];
  const cites = (kind: CitableKind, id: string, citations: Citation[]) => {
    citations.forEach((citation, index) => {
      if (citation.source === sourceId) uses.push({ kind, id, index, citation });
    });
  };
  for (const v of project.variables) cites('variable', v.id, v.citations);
  for (const l of project.links) cites('link', l.id, l.citations);
  for (const lp of project.loops) cites('loop', lp.id, lp.citations);
  for (const scene of project.story.scenes) {
    if (scene.sources.includes(sourceId)) uses.push({ kind: 'scene', id: scene.id });
    scene.steps.forEach((step) => {
      step.overlays.forEach((overlay, o) => {
        if (!('citations' in overlay)) return;
        (overlay.citations ?? []).forEach((citation, index) => {
          if (citation.source === sourceId) {
            uses.push({
              kind: 'overlay',
              id: `${scene.id}.${step.id}`,
              where: `${scene.id}.${step.id} overlay ${o + 1}`,
              index,
              citation,
            });
          }
        });
      });
    });
  }
  return uses;
}

export interface CoverageCount {
  total: number;
  cited: number;
  /** Ids of those that cite nothing, in project order. */
  uncited: string[];
}

export interface SourceCoverage {
  id: string;
  /** Citations of it on variables, links and loops. */
  citations: number;
  /** Distinct variables, links and loops that cite it. */
  elements: number;
  /** Citations of it on story overlays, and scenes that list it. */
  story: number;
}

export interface EvidenceCoverage {
  variables: CoverageCount;
  links: CoverageCount;
  loops: CoverageCount;
  /** Citations on variables, links and loops by the strength their author gave, or none. */
  strengths: { strong: number; moderate: number; weak: number; unrated: number };
  /** Citations on variables, links and loops without pages or another locator. */
  withoutPages: number;
  /** Each source, in the project's order. */
  sources: SourceCoverage[];
}

export function evidenceCoverage(project: Project): EvidenceCoverage {
  const count = (items: { id: string; citations: Citation[] }[]): CoverageCount => {
    const uncited = items.filter((x) => x.citations.length === 0).map((x) => x.id);
    return { total: items.length, cited: items.length - uncited.length, uncited };
  };
  const all = [...project.variables, ...project.links, ...project.loops].flatMap((x) => x.citations);
  const strengths = { strong: 0, moderate: 0, weak: 0, unrated: 0 };
  for (const c of all) strengths[c.strength ?? 'unrated']++;
  return {
    variables: count(project.variables),
    links: count(project.links),
    loops: count(project.loops),
    strengths,
    withoutPages: all.filter((c) => c.pages === undefined).length,
    sources: project.sources.map((s) => {
      const uses = sourceUses(project, s.id);
      const onMap = uses.filter((u) => u.kind === 'variable' || u.kind === 'link' || u.kind === 'loop');
      return {
        id: s.id,
        citations: onMap.length,
        elements: new Set(onMap.map((u) => u.id)).size,
        story: uses.length - onMap.length,
      };
    }),
  };
}
