// Source: PolycrisisPresentation src/map/loops.ts @ 539bc8e (private), adapted for Loopweft: the named loops
// are the project's, each R or B worked out from its links' signs.
import { loopPolarity, type Polarity, type Project } from '@loopweft/model';
import type { Graph } from './graph.ts';

export interface NamedLoop {
  id: string;
  name: string;
  /** R reinforcing, B balancing, ? when a link's sign is unknown. */
  type: Polarity;
  /** Its links, in order. */
  links: string[];
  /** Each link's cause, in loop order. */
  nodes: string[];
  archetype?: string;
  /** What shows beside the badge: the archetype's short name (before any bracket), else the loop's name. */
  shortName: string;
  /** Where the badge sits: the middle of its variables (null when none of them is drawn). */
  at: { x: number; y: number } | null;
}

/** The project's named loops, by id. */
export function namedLoops(project: Project, graph: Graph): Map<string, NamedLoop> {
  const linkById = new Map(project.links.map((l) => [l.id, l]));
  const loops = new Map<string, NamedLoop>();
  for (const loop of project.loops) {
    const nodes = loop.links.flatMap((id) => {
      const link = linkById.get(id);
      return link ? [link.from] : [];
    });
    const drawn = nodes.flatMap((id) => {
      const n = graph.nodes.get(id);
      return n ? [n] : [];
    });
    const at = drawn.length
      ? {
          x: drawn.reduce((sum, n) => sum + n.x, 0) / drawn.length,
          y: drawn.reduce((sum, n) => sum + n.y, 0) / drawn.length,
        }
      : null;
    loops.set(loop.id, {
      id: loop.id,
      name: loop.name,
      type: loopPolarity(project, loop) ?? '?',
      links: [...loop.links],
      nodes,
      ...(loop.archetype ? { archetype: loop.archetype } : {}),
      shortName: (loop.archetype ?? loop.name).replace(/\s*\(.*\)\s*$/, ''),
      at,
    });
  }
  return loops;
}
