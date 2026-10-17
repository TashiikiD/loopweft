// The flow layout: causes on the left, effects on the right. Feedback links are set aside (reversed) so the
// rest form layers; each variable goes one layer after its furthest cause, and barycentre sweeps order the
// variables in each layer so links cross less. Deterministic: no randomness, ties broken by id.
import { compareStrings } from '@loopweft/model';
import type { Pt } from './geometry.ts';

export interface FlowInput {
  nodes: { id: string; pinned?: Pt }[];
  links: { from: string; to: string }[];
  width?: number;
  height?: number;
}

const MARGIN = { x: 140, top: 230, bottom: 90 };

/** Links that close a cycle, found by depth-first search in id order: reversing them leaves no cycle. */
function feedbackLinks(ids: string[], out: Map<string, string[]>): Set<string> {
  const state = new Map<string, 'open' | 'done'>();
  const back = new Set<string>();
  const visit = (start: string) => {
    // Iterative, so a long chain cannot overflow the stack.
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }];
    state.set(start, 'open');
    while (stack.length) {
      const top = stack[stack.length - 1] as { id: string; next: number };
      const targets = out.get(top.id) ?? [];
      if (top.next >= targets.length) {
        state.set(top.id, 'done');
        stack.pop();
        continue;
      }
      const to = targets[top.next++] as string;
      const s = state.get(to);
      if (s === 'open') back.add(`${top.id}>${to}`);
      else if (s === undefined) {
        state.set(to, 'open');
        stack.push({ id: to, next: 0 });
      }
    }
  };
  for (const id of ids) if (!state.has(id)) visit(id);
  return back;
}

export function flowLayout(input: FlowInput): Map<string, Pt> {
  const width = input.width ?? 1920;
  const height = input.height ?? 1080;
  const ids = [...new Set(input.nodes.map((n) => n.id))].sort(compareStrings);
  const known = new Set(ids);
  const edges = input.links.filter((l) => known.has(l.from) && known.has(l.to) && l.from !== l.to);
  const out = new Map<string, string[]>();
  for (const e of edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  for (const list of out.values()) list.sort(compareStrings);
  const back = feedbackLinks(ids, out);
  const dag = edges.map((e) => (back.has(`${e.from}>${e.to}`) ? { from: e.to, to: e.from } : e));

  // Longest-path layers.
  const preds = new Map<string, string[]>();
  for (const e of dag) preds.set(e.to, [...(preds.get(e.to) ?? []), e.from]);
  const layer = new Map<string, number>();
  const layerOf = (id: string, seen = new Set<string>()): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    seen.add(id);
    const value =
      Math.max(-1, ...(preds.get(id) ?? []).filter((p) => !seen.has(p)).map((p) => layerOf(p, seen))) + 1;
    layer.set(id, value);
    return value;
  };
  for (const id of ids) layerOf(id);
  const layers: string[][] = [];
  for (const id of ids) {
    const l = layer.get(id) as number;
    layers[l] = [...(layers[l] ?? []), id];
  }

  // Barycentre sweeps: down using causes, up using effects.
  const index = new Map<string, number>();
  const reindex = (row: string[]) => {
    for (const [i, id] of row.entries()) index.set(id, i);
  };
  for (const row of layers) reindex(row);
  const neighbours = (id: string, dir: 'in' | 'out') =>
    dag
      .filter((e) => (dir === 'in' ? e.to === id : e.from === id))
      .map((e) => (dir === 'in' ? e.from : e.to));
  for (let sweep = 0; sweep < 8; sweep++) {
    const down = sweep % 2 === 0;
    const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const row of order) {
      const centre = new Map(
        row.map((id) => {
          const ns = neighbours(id, down ? 'in' : 'out');
          const mean = ns.length
            ? ns.reduce((s, n) => s + (index.get(n) as number), 0) / ns.length
            : (index.get(id) as number);
          return [id, mean];
        }),
      );
      row.sort(
        (a, b) =>
          (centre.get(a) as number) - (centre.get(b) as number) ||
          (index.get(a) as number) - (index.get(b) as number),
      );
      reindex(row);
    }
  }

  const pinned = new Map(input.nodes.filter((n) => n.pinned).map((n) => [n.id, n.pinned as Pt]));
  const positions = new Map<string, Pt>();
  const columns = Math.max(1, layers.length - 1);
  layers.forEach((row, l) => {
    const x = layers.length === 1 ? width / 2 : MARGIN.x + (l * (width - 2 * MARGIN.x)) / columns;
    const band = height - MARGIN.top - MARGIN.bottom;
    row.forEach((id, i) => {
      const y = MARGIN.top + ((i + 0.5) * band) / row.length;
      positions.set(id, pinned.get(id) ?? { x: Math.round(x), y: Math.round(y) });
    });
  });
  return positions;
}
