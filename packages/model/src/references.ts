// Source: PolycrisisPresentation src/core/references.ts (working copy of 2026-10-17, not yet committed in
// the deck; after 539bc8e), private, adapted for Loopweft: sources come from the project, and the scenes
// that draw on a source include those whose steps light something citing it.
//
// A project's sources as an APA reference list, for the references page, the speaker notes and exports.
import type { Project, Source } from './schema.ts';
import { sceneSources } from './story.ts';
import { compareStrings } from './text/ids.ts';

export interface Reference {
  source: Source;
  /** Supplements published with this source, listed beneath it. */
  parts: Reference[];
  /** Ids of the scenes that draw on it. */
  scenes: string[];
}

/** The text APA alphabetizes by: the reference without its *italics* marks. */
const sortKey = (source: Source) => source.apa.replace(/\*/g, '');

/** Alphabetical by first author, as APA orders a list; each supplement sits under its work. */
export function referenceList(project: Project): Reference[] {
  const scenesBySource = new Map<string, string[]>();
  for (const scene of project.story.scenes) {
    for (const id of sceneSources(project, scene))
      scenesBySource.set(id, [...(scenesBySource.get(id) ?? []), scene.id]);
  }
  const refs = new Map<string, Reference>();
  for (const source of project.sources) {
    refs.set(source.id, { source, parts: [], scenes: scenesBySource.get(source.id) ?? [] });
  }
  const top: Reference[] = [];
  for (const ref of refs.values()) {
    const parent = ref.source.partOf ? refs.get(ref.source.partOf) : undefined;
    (parent ? parent.parts : top).push(ref);
  }
  // English collation puts "Søgaard" with the S names; code units settle exact ties, so the order is the
  // same everywhere.
  return top.sort(
    (a, b) =>
      sortKey(a.source).localeCompare(sortKey(b.source), 'en') || compareStrings(a.source.apa, b.source.apa),
  );
}

/** Ids of the scenes that draw on a source. */
export function citedIn(project: Project, sourceId: string): string[] {
  return project.story.scenes
    .filter((scene) => sceneSources(project, scene).includes(sourceId))
    .map((s) => s.id);
}

export interface Span {
  text: string;
  italic?: boolean;
  href?: string;
}

/** A reference as runs of text: *asterisks* become italics and web addresses become links. */
export function referenceSpans(apa: string): Span[] {
  const spans: Span[] = [];
  for (const part of apa.split(/(\*[^*]+\*)/)) {
    if (!part) continue;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      spans.push({ text: part.slice(1, -1), italic: true });
      continue;
    }
    for (const bit of part.split(/(https?:\/\/\S+)/)) {
      if (bit) spans.push(/^https?:\/\//.test(bit) ? { text: bit, href: bit } : { text: bit });
    }
  }
  return spans;
}

/** "Scene 4" or "Scenes 1, 2 and 8". */
export function sceneList(numbers: number[]): string {
  if (numbers.length === 0) return '';
  if (numbers.length === 1) return `Scene ${numbers[0]}`;
  return `Scenes ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
}
