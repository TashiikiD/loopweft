// Source: PolycrisisPresentation src/map/camera.ts @ 539bc8e (private), adapted for Loopweft: it fits any
// map's variables instead of the deck's graph, the deck's "core" frame is "inset", and the whole-map view is
// fitted to the map rather than fixed for one layout.
//
// Camera maths (pure). A camera puts world point (cx, cy) at the stage centre, magnified by `zoom`. World
// units equal stage pixels at zoom 1.

export interface Camera {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** The stage: what an audience sees, in stage pixels. */
export const STAGE = { w: 1920, h: 1080 };

export type Frame = 'full' | 'center' | 'left' | 'right' | 'lower' | 'inset';

/** Screen regions (stage px) that a framed subject should occupy. Every frame but `full` starts below the caption band (y ≈ 0–220). */
export const FRAMES: Record<Frame, Rect> = {
  full: { x: 0, y: 0, w: 1920, h: 1080 },
  center: { x: 150, y: 235, w: 1620, h: 770 },
  left: { x: 90, y: 235, w: 980, h: 770 },
  right: { x: 850, y: 235, w: 980, h: 770 },
  lower: { x: 150, y: 360, w: 1620, h: 650 },
  // A small area at the centre, for an overlay that surrounds the map (the deck's trap ring).
  inset: { x: 550, y: 468, w: 500, h: 300 },
};

/** Where the whole map goes: the stage below the caption band, with a margin. */
export const MAP_FRAME: Rect = { x: 96, y: 225, w: 1728, h: 813 };

export interface CameraSpec {
  /** Fit these variables (with room for labels). Absent: the whole map. */
  fit?: string[];
  frame?: Frame;
  /** Upper bound on zoom so small clusters don't fill the screen. */
  maxZoom?: number;
}

// Room around fitted variables for their labels (world units at zoom 1).
const PAD_X = 130;
const PAD_Y = 95;
// Room around the whole map.
const MAP_PAD = 60;

const bounds = (pts: Pt[]) => ({
  x0: Math.min(...pts.map((p) => p.x)),
  x1: Math.max(...pts.map((p) => p.x)),
  y0: Math.min(...pts.map((p) => p.y)),
  y1: Math.max(...pts.map((p) => p.y)),
});

/** A camera showing the box [x0, x1] × [y0, y1] inside `frame`, zoom limited to [minZoom, maxZoom]. */
function frameBox(
  box: { x0: number; x1: number; y0: number; y1: number },
  frame: Rect,
  minZoom: number,
  maxZoom: number,
): Camera {
  const zoom = Math.max(minZoom, Math.min(frame.w / (box.x1 - box.x0), frame.h / (box.y1 - box.y0), maxZoom));
  const tx = frame.x + frame.w / 2;
  const ty = frame.y + frame.h / 2;
  return {
    cx: (box.x0 + box.x1) / 2 - (tx - STAGE.w / 2) / zoom,
    cy: (box.y0 + box.y1) / 2 - (ty - STAGE.h / 2) / zoom,
    zoom,
  };
}

/** The whole map, fitted below the caption band. */
export function wholeMapCamera(positions: ReadonlyMap<string, Pt>): Camera {
  const pts = [...positions.values()];
  if (pts.length === 0) return { cx: STAGE.w / 2, cy: STAGE.h / 2, zoom: 1 };
  const b = bounds(pts);
  return frameBox(
    { x0: b.x0 - MAP_PAD, x1: b.x1 + MAP_PAD, y0: b.y0 - MAP_PAD, y1: b.y1 + MAP_PAD },
    MAP_FRAME,
    0.05,
    1,
  );
}

/**
 * The camera for a step: its subject (or, with a frame other than full or center and no subject, the whole
 * map shrunk into that frame, leaving room for an overlay) placed in its frame.
 */
export function fitCamera(positions: ReadonlyMap<string, Pt>, spec: CameraSpec | undefined): Camera {
  const wholeMapAside =
    !spec?.fit?.length && spec?.frame !== undefined && spec.frame !== 'full' && spec.frame !== 'center';
  if (!spec?.fit?.length && !wholeMapAside) return wholeMapCamera(positions);
  const ids = spec?.fit?.length ? spec.fit : [...positions.keys()];
  const pts = ids.map((id) => positions.get(id)).filter((p): p is Pt => !!p);
  if (pts.length === 0 || !spec) return wholeMapCamera(positions);
  const b = bounds(pts);
  const minZoom = wholeMapAside ? (spec.frame === 'inset' ? 0.25 : 0.4) : wholeMapCamera(positions).zoom;
  return frameBox(
    { x0: b.x0 - PAD_X, x1: b.x1 + PAD_X, y0: b.y0 - PAD_Y, y1: b.y1 + PAD_Y },
    FRAMES[spec.frame ?? 'center'],
    minZoom,
    spec.maxZoom ?? 2.4,
  );
}

/** World → stage coordinates. */
export function project(cam: Camera, x: number, y: number): Pt {
  return { x: (x - cam.cx) * cam.zoom + STAGE.w / 2, y: (y - cam.cy) * cam.zoom + STAGE.h / 2 };
}

/** The world rectangle the camera currently shows. */
export function viewRect(cam: Camera): Rect {
  const w = STAGE.w / cam.zoom;
  const h = STAGE.h / cam.zoom;
  return { x: cam.cx - w / 2, y: cam.cy - h / 2, w, h };
}

export function inView(cam: Camera, x: number, y: number, margin = 40): boolean {
  const r = viewRect(cam);
  return x >= r.x + margin && x <= r.x + r.w - margin && y >= r.y + margin && y <= r.y + r.h - margin;
}

/** The SVG transform that applies a camera to world coordinates. */
export function cameraTransform(cam: Camera): string {
  const tx = STAGE.w / 2 - cam.cx * cam.zoom;
  const ty = STAGE.h / 2 - cam.cy * cam.zoom;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${cam.zoom.toFixed(4)})`;
}
