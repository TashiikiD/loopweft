// Source: DataViz packages/module-cld/src/engine/geometry.ts @ efcdbe2 (TashiikiD/DataViz, private), itself ported
// from cld-generator engine/cldGeometry.ts and cldRouting.ts (pointOnRoute) @ 6e477a3; copied for Loopweft.
// Boxes here are given by their centre.

export type Point = { x: number; y: number };
/** Axis-aligned box given by its centre and size. */
export type Box = Point & { w: number; h: number };

export const intersects = (a: Box, b: Box, gap = 0): boolean =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + gap * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap * 2;

/** Open-interior intersection; touching an obstacle boundary is permitted. */
export function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  let lo = 0;
  let hi = 1;
  for (const axis of ['x', 'y'] as const) {
    const half = (axis === 'x' ? box.w : box.h) / 2 - 0.01;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) {
      if (a[axis] <= box[axis] - half || a[axis] >= box[axis] + half) return false;
    } else {
      const p = (box[axis] - half - a[axis]) / delta;
      const q = (box[axis] + half - a[axis]) / delta;
      lo = Math.max(lo, Math.min(p, q));
      hi = Math.min(hi, Math.max(p, q));
      if (lo >= hi) return false;
    }
  }
  return lo < hi;
}

/** Point at `fraction` of a polyline's length, with the unit normal (px, py) of that segment. */
export function pointOnRoute(points: Point[], fraction: number): Point & { px: number; py: number } {
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - (points[i] as Point).x, p.y - (points[i] as Point).y));
  let remaining = lengths.reduce((a, b) => a + b, 0) * fraction;
  for (let i = 0; i < lengths.length; i++) {
    const segment = lengths[i] as number;
    if (remaining <= segment || i === lengths.length - 1) {
      const a = points[i] as Point;
      const b = points[i + 1] as Point;
      const length = segment || 1;
      const t = Math.min(1, remaining / length);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        px: -(b.y - a.y) / length,
        py: (b.x - a.x) / length,
      };
    }
    remaining -= segment;
  }
  return { ...(points[0] as Point), px: 0, py: 1 };
}
