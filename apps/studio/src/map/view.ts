// The canvas's view of the map: a pan and a zoom. A map point (x, y) is drawn at (x * k + dx, y * k + dy)
// on the canvas, in CSS pixels. Pure, so it is easy to test.
import type { Graph } from '@loopweft/render';

export interface View {
  dx: number;
  dy: number;
  k: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** What the map covers: its variables (with room for their labels) and its group halos. */
export function mapBounds(graph: Graph): Bounds | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const n of graph.nodes.values()) {
    // Room for the label on the side it goes.
    xs.push(
      n.x - n.r - (n.labelSide === 'left' ? 150 : 75),
      n.x + n.r + (n.labelSide === 'right' ? 150 : 75),
    );
    ys.push(n.y - n.r - (n.labelSide === 'above' ? 55 : 25), n.y + n.r + (n.labelSide === 'below' ? 60 : 25));
  }
  for (const g of graph.groups) {
    if (!g.halo) continue;
    xs.push(g.halo.x - g.halo.r, g.halo.x + g.halo.r);
    ys.push(g.halo.y - g.halo.r, g.halo.y + g.halo.r);
  }
  if (xs.length === 0) return null;
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** A view that shows `bounds` whole, centred, with a margin; an empty map shows the stage at zoom 0.5. */
export function fitView(bounds: Bounds | null, size: Size, margin = 32, maxZoom = 1.6): View {
  const b = bounds ?? { x0: 0, y0: 0, x1: 1920, y1: 1080 };
  const w = Math.max(1, b.x1 - b.x0);
  const h = Math.max(1, b.y1 - b.y0);
  const k = clamp(Math.min((size.w - 2 * margin) / w, (size.h - 2 * margin) / h), MIN_ZOOM, maxZoom);
  return { k, dx: size.w / 2 - ((b.x0 + b.x1) / 2) * k, dy: size.h / 2 - ((b.y0 + b.y1) / 2) * k };
}

/** The map point under a canvas point. */
export const toMap = (view: View, sx: number, sy: number) => ({
  x: (sx - view.dx) / view.k,
  y: (sy - view.dy) / view.k,
});

/** The canvas point of a map point. */
export const toScreen = (view: View, x: number, y: number) => ({
  x: x * view.k + view.dx,
  y: y * view.k + view.dy,
});

/** Zooms by `factor` about a canvas point, which stays over the same map point. */
export function zoomAt(view: View, sx: number, sy: number, factor: number): View {
  const k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
  const p = toMap(view, sx, sy);
  return { k, dx: sx - p.x * k, dy: sy - p.y * k };
}

/** A view moved so that a map point sits at the canvas centre, at the same zoom. */
export const centreOn = (view: View, size: Size, x: number, y: number): View => ({
  k: view.k,
  dx: size.w / 2 - x * view.k,
  dy: size.h / 2 - y * view.k,
});
