// @vitest-environment jsdom
// The drawing for PowerPoint and Word, from a small map laid out by hand (jsdom lays nothing out, so each
// element's computed style and box are given here): a halo inside faded groups comes out as a few rings whose
// opacity, laid on each other, is the gradient's times every group's around it; no group keeps an opacity; the
// opaque glyph over the halo is cut out of its rings, so nothing of the halo shows through the glyph; a
// response's ring and dot do not overlap; and a glow's outline keeps its stroke. Colours are checked by laying
// the written shapes on each other at a point, as a reader that keeps each shape's opacity would. (The
// example's drawings are checked in a browser: apps/studio/e2e/export-svg.spec.ts.)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawSvg } from '../src/svg/flatten.ts';
import { colourAt } from '../src/svg/rings.ts';

const SVG = 'http://www.w3.org/2000/svg';

/** What every element computes to unless the test says otherwise. */
const DEFAULTS: Record<string, string> = {
  display: 'inline',
  opacity: '1',
  visibility: 'visible',
  transform: 'none',
  transformOrigin: '0px 0px',
  translate: 'none',
  scale: 'none',
  rotate: 'none',
  filter: 'none',
  isolation: 'auto',
  mixBlendMode: 'normal',
  maskImage: 'none',
  position: 'static',
  zIndex: 'auto',
  content: 'none',
  boxShadow: 'none',
  textShadow: 'none',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  backgroundImage: 'none',
  overflowX: 'visible',
  overflowY: 'visible',
  fill: 'rgb(0, 0, 0)',
  stroke: 'none',
  fillRule: 'nonzero',
  fillOpacity: '1',
  strokeOpacity: '1',
  strokeWidth: '1px',
  strokeDasharray: 'none',
  strokeDashoffset: '0px',
  strokeLinecap: 'butt',
  strokeLinejoin: 'miter',
  stopColor: 'rgb(0, 0, 0)',
  stopOpacity: '1',
};
for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
  DEFAULTS[`border${side}Width`] = '0px';
  DEFAULTS[`border${side}Style`] = 'none';
  DEFAULTS[`border${side}Color`] = 'rgb(0, 0, 0)';
}
for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'])
  DEFAULTS[`border${corner}Radius`] = '0px';

const styles = new Map<Element, Record<string, string>>();

/**
 * The map: a halo (55% fading to clear) under a variable's opaque glyph (a response's ring and dot, or an
 * octagon), in a group at 0.75 in a map at 0.4; the halo outlined, if asked, with a faint dashed stroke.
 */
function map(
  options: { glyph?: 'ring' | 'octagon' | 'core'; outline?: boolean; coreOutline?: string } = {},
): HTMLElement {
  const viewport = document.createElement('div');
  viewport.className = 'lw-viewport';
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  const defs = document.createElementNS(SVG, 'defs');
  const gradient = document.createElementNS(SVG, 'radialGradient');
  gradient.id = 'h';
  for (const [offset, alpha] of [
    ['0%', '0.55'],
    ['100%', '0'],
  ] as const) {
    const stop = document.createElementNS(SVG, 'stop');
    stop.setAttribute('offset', offset);
    styles.set(stop, { stopColor: 'rgb(255, 0, 0)', stopOpacity: alpha });
    gradient.appendChild(stop);
  }
  defs.appendChild(gradient);
  const faded = document.createElementNS(SVG, 'g');
  styles.set(faded, { opacity: '0.4' });
  const node = document.createElementNS(SVG, 'g');
  node.setAttribute('transform', 'translate(50 50)');
  styles.set(node, { opacity: '0.75' });
  const halo = document.createElementNS(SVG, 'circle');
  halo.setAttribute('r', '20');
  styles.set(halo, {
    fill: 'url("#h")',
    ...(options.outline
      ? {
          stroke: 'rgb(1, 2, 3)',
          strokeWidth: '2px',
          strokeOpacity: '0.2',
          strokeDasharray: '4px, 2px',
          strokeDashoffset: '1px',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }
      : {}),
  });
  node.appendChild(halo);
  if (options.glyph === 'core') {
    // A variable's circle, outlined in the ink at 95% (as the map's .node-core is), or as asked.
    const core = document.createElementNS(SVG, 'circle');
    core.setAttribute('r', '10');
    styles.set(core, {
      fill: 'rgb(200, 100, 0)',
      stroke: 'rgb(7, 27, 22)',
      strokeWidth: '2.5px',
      strokeOpacity: options.coreOutline ?? '0.95',
    });
    node.appendChild(core);
  } else if (options.glyph === 'octagon') {
    const core = document.createElementNS(SVG, 'polygon');
    const points = Array.from({ length: 8 }, (_, k) => {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      return `${(12 * Math.cos(a)).toFixed(2)},${(12 * Math.sin(a)).toFixed(2)}`;
    });
    core.setAttribute('points', points.join(' '));
    styles.set(core, { fill: 'rgb(200, 100, 0)', stroke: 'rgb(7, 27, 22)', strokeWidth: '2.5px' });
    node.appendChild(core);
  } else {
    const ring = document.createElementNS(SVG, 'circle');
    ring.setAttribute('r', '10');
    styles.set(ring, { fill: 'rgb(10, 20, 30)', stroke: 'rgb(200, 100, 0)', strokeWidth: '3px' });
    const dot = document.createElementNS(SVG, 'circle');
    dot.setAttribute('r', '4.2');
    styles.set(dot, { fill: 'rgb(200, 100, 0)' });
    node.append(ring, dot);
  }
  faded.appendChild(node);
  svg.append(defs, faded);
  viewport.appendChild(svg);
  document.body.appendChild(viewport);
  const box = (w: number, h: number) => () => ({ left: 0, top: 0, width: w, height: h }) as DOMRect;
  viewport.getBoundingClientRect = box(1920, 1080);
  svg.getBoundingClientRect = box(100, 100);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const own = pseudo ? {} : (styles.get(el) ?? {});
    const all = { ...DEFAULTS, ...own };
    return { ...all, getPropertyValue: (name: string) => all[name] ?? '' } as unknown as CSSStyleDeclaration;
  });
  return viewport;
}

afterEach(() => {
  vi.restoreAllMocks();
  styles.clear();
  document.body.replaceChildren();
});

/** Each element of a name in the drawing, with its attributes. */
const elements = (svg: string, name: string) =>
  [...svg.matchAll(new RegExp(`<${name} ([^>]*?)/?>`, 'g'))].map((m) =>
    Object.fromEntries([...(m[1] as string).matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
  );

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** Whether a path the drawing writes (circles as two arcs, polygons as lines; even-odd) covers a point. */
function pathCovers(d: string, [x, y]: [number, number]): boolean {
  let inside = false;
  for (const sub of d.split('M').filter(Boolean)) {
    const numbers = sub.match(/-?[\d.]+/g)?.map(Number) ?? [];
    if (sub.includes('A')) {
      const [x0 = 0, y0 = 0, r = 0] = numbers;
      if (Math.hypot(x - (x0 - r), y - y0) <= r) inside = !inside;
      continue;
    }
    const pts: [number, number][] = [];
    for (let k = 0; k + 1 < numbers.length; k += 2)
      pts.push([numbers[k] as number, numbers[k + 1] as number]);
    let crossing = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i] as [number, number];
      const [xj, yj] = pts[j] as [number, number];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) crossing = !crossing;
    }
    if (crossing) inside = !inside;
  }
  return inside;
}

/** How far a point lies from a polygon's sides. */
function toSides(points: [number, number][], [x, y]: [number, number]): number {
  return Math.min(
    ...points.map(([x1, y1], k) => {
      const [x2, y2] = points[(k + 1) % points.length] as [number, number];
      const t = Math.max(
        0,
        Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)),
      );
      return Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1)));
    }),
  );
}

/**
 * The colour the drawing for PowerPoint and Word gives a point of the node (in its own units), over black: every
 * circle, path and polygon over it laid on each other in drawing order, its fill then its outline, each at its own
 * opacity (the drawing has no group opacity). Outlines are those of circles and polygons, away from corners.
 */
function composite(svg: string, point: [number, number]): Rgb {
  let colour: Rgb = [0, 0, 0];
  const lay = (hex: string, alpha: number) => {
    const paint = rgb(hex);
    colour = colour.map((c, k) => c * (1 - alpha) + (paint[k] as number) * alpha) as Rgb;
  };
  for (const m of svg.matchAll(/<(circle|path|polygon) ([^>]*?)\/?>/g)) {
    const a = Object.fromEntries(
      [...(m[2] as string).matchAll(/([\w:-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]),
    );
    const opacity = Number(a.opacity ?? 1);
    const points =
      m[1] === 'polygon'
        ? (((a.points as string).match(/-?[\d.]+/g) ?? [])
            .map(Number)
            .flatMap((v, k, all) => (k % 2 === 0 ? [[v, all[k + 1] as number] as [number, number]] : [])) as [
            number,
            number,
          ][])
        : [];
    if (a.fill && a.fill !== 'none') {
      const covers =
        m[1] === 'circle'
          ? Math.hypot(point[0] - Number(a.cx ?? 0), point[1] - Number(a.cy ?? 0)) <= Number(a.r)
          : m[1] === 'path'
            ? pathCovers(a.d as string, point)
            : pathCovers(`M${points.map((p) => p.join(' ')).join('L')}Z`, point);
      if (covers) lay(a.fill as string, Number(a['fill-opacity'] ?? 1) * opacity);
    }
    if (a.stroke && a.stroke !== 'none' && m[1] !== 'path') {
      const half = Number(a['stroke-width'] ?? 1) / 2;
      const away =
        m[1] === 'circle'
          ? Math.abs(Math.hypot(point[0] - Number(a.cx ?? 0), point[1] - Number(a.cy ?? 0)) - Number(a.r))
          : toSides(points, point);
      if (away <= half) lay(a.stroke as string, Number(a['stroke-opacity'] ?? 1) * opacity);
    }
  }
  return colour;
}

/** A colour at an opacity over black. */
const over = (hex: string, alpha: number): Rgb => rgb(hex).map((c) => c * alpha) as Rgb;

const HALO = [
  { offset: 0, colour: { hex: '#ff0000', alpha: 0.55 } },
  { offset: 1, colour: { hex: '#ff0000', alpha: 0 } },
];

describe('the drawing for PowerPoint and Word', () => {
  it('solves a halo’s rings for every faded group around it, and leaves no group an opacity', () => {
    const { svg } = drawSvg(map(), { styles: '', title: 'Rings', office: true });
    expect(svg).not.toContain('radialGradient');
    expect(svg).not.toContain('data-lw-solved');
    expect(svg).not.toMatch(/<(g|svg) [^>]*\sopacity=/);
    // A faint glow (0.55 × 0.75 × 0.4 at most) is a few bands (4: radii 5, 10, 15 and 20), none fainter than the
    // colour's steps can show; those wholly under the glyph (5 and 10) are left out.
    const rings = [...svg.matchAll(/<(?:circle|path) [^>]*fill="#ff0000" fill-opacity="([\d.]+)"/g)];
    expect(rings).toHaveLength(2);
    expect(rings.every((r) => Number(r[1]) >= 0.02)).toBe(true);
    // Laid on each other in the middle of each band outside the glyph: the gradient times 0.75 times 0.4.
    for (const t of [0.625, 0.875]) {
      const want = over('#ff0000', colourAt(HALO, t).alpha * 0.75 * 0.4)[0];
      expect(composite(svg, [t * 20, 0])[0], `at ${t}`).toBeCloseTo(want, 1);
    }
  });

  it('cuts the opaque glyph out of the halo: over the glyph, only the glyph at the groups’ opacity', () => {
    for (const glyph of ['ring', 'octagon'] as const) {
      document.body.replaceChildren();
      styles.clear();
      vi.restoreAllMocks();
      const { svg } = drawSvg(map({ glyph }), { styles: '', title: 'Glyph', office: true });
      // The plain drawing paints the glyph over the halo, then fades the whole node: nothing of the halo shows
      // where the glyph is, at its centre, on a response's ring around its dot, or near an octagon's corner.
      const inner: [[number, number], string][] =
        glyph === 'ring'
          ? [
              [[0, 0], '#c86400'],
              [[6, 0], '#0a141e'],
              [[0, -7], '#0a141e'],
            ]
          : [
              [[0, 0], '#c86400'],
              [[7, 4], '#c86400'],
              [[-8, -2], '#c86400'],
            ];
      for (const [point, paint] of inner) {
        const got = composite(svg, point);
        const want = over(paint, 0.75 * 0.4);
        got.forEach((c, k) => {
          expect(c, `${glyph} at ${point}, channel ${k}`).toBeCloseTo(want[k] as number, 1);
        });
      }
      // Outside the glyph, the halo as its rings give it.
      expect(composite(svg, [17.5, 0])[0]).toBeCloseTo(
        over('#ff0000', colourAt(HALO, 0.875).alpha * 0.3)[0],
        1,
      );
    }
  });

  it('cuts the glyph’s outline out of the halo too, out to its outer edge', () => {
    // Under the outer half of a glyph's outline, the plain drawing paints the outline over the halo, then fades
    // the node: the halo shows only through what the outline lets through (none for an opaque one, a twentieth
    // for the map's ink at 95%).
    const halo = (t: number) => colourAt(HALO, t).alpha;
    const cases = [
      {
        glyph: 'core',
        points: [
          [10.8, 0],
          [0, -10.9],
        ],
        ink: '#071b16',
        through: 0.05,
      },
      {
        glyph: 'ring',
        points: [
          [11, 0],
          [0, 11.2],
        ],
        ink: '#c86400',
        through: 0,
      },
      {
        glyph: 'octagon',
        points: [
          [11.9, 0],
          [-11.8, 0],
        ],
        ink: '#071b16',
        through: 0,
      },
    ] as const;
    for (const { glyph, points, ink, through } of cases) {
      document.body.replaceChildren();
      styles.clear();
      vi.restoreAllMocks();
      const { svg, notes } = drawSvg(map({ glyph }), { styles: '', title: 'Outline', office: true });
      expect(
        notes.filter((n) => n.startsWith('Drawn approximately')),
        glyph,
      ).toEqual([]);
      for (const point of points) {
        const t = Math.hypot(...point) / 20;
        // The plain drawing: in the node, the outline at (1 − through) over the halo; then the node at 0.3.
        const plain = rgb(ink).map(
          (c, k) => 0.3 * ((1 - through) * c + through * halo(t) * (rgb('#ff0000')[k] as number)),
        );
        const got = composite(svg, point as [number, number]);
        got.forEach((c, k) => {
          // What the halo shows through a 95% outline is left out: under half a level of 255 here.
          expect(Math.abs(c - (plain[k] as number)), `${glyph} at ${point}, channel ${k}`).toBeLessThan(
            through > 0 ? 1 : 0.05,
          );
        });
      }
    }
  });

  it('says so where a glyph’s outline is too faint to cut the halo out under it', () => {
    const { notes } = drawSvg(map({ glyph: 'core', coreOutline: '0.5' }), {
      styles: '',
      title: 'Faint',
      office: true,
    });
    expect(notes).toContain(
      'Drawn approximately: a glow under a see-through or dashed outline in a faded group, drawn under it.',
    );
  });

  it('draws a response’s ring around its dot, with its outline apart, so that none overlaps', () => {
    const { svg } = drawSvg(map(), { styles: '', title: 'Ring', office: true });
    const fill = elements(svg, 'path').find((p) => p.fill === '#0a141e');
    expect(fill).toMatchObject({ 'fill-rule': 'evenodd', opacity: '0.3' });
    // From inside the outline (10 − 3 / 2) to the dot's edge.
    expect(fill?.d).toBe(
      'M8.5 0A8.5 8.5 0 1 0 -8.5 0A8.5 8.5 0 1 0 8.5 0ZM4.2 0A4.2 4.2 0 1 0 -4.2 0A4.2 4.2 0 1 0 4.2 0Z',
    );
    const circles = elements(svg, 'circle').filter((c) => c.fill !== '#ff0000');
    expect(circles).toEqual([
      { cx: '0', cy: '0', r: '10', fill: 'none', stroke: '#c86400', 'stroke-width': '3', opacity: '0.3' },
      { r: '4.2', fill: '#c86400', stroke: 'none', opacity: '0.3' },
    ]);
  });

  it('outlines a glow as the plain drawing does: its stroke’s opacity, dashes, caps and joins', () => {
    const plain = elements(
      drawSvg(map({ outline: true }), { styles: '', title: 'Plain' }).svg,
      'circle',
    ).find((c) => c.r === '20');
    document.body.replaceChildren();
    styles.clear();
    vi.restoreAllMocks();
    const office = elements(
      drawSvg(map({ outline: true }), { styles: '', title: 'Office', office: true }).svg,
      'circle',
    ).find((c) => c.r === '20' && c.fill === 'none');
    const stroke = (a: Record<string, string | undefined> | undefined) =>
      Object.fromEntries(Object.entries(a ?? {}).filter(([k]) => k.startsWith('stroke')));
    expect(stroke(plain)).toEqual({
      stroke: '#010203',
      'stroke-width': '2',
      'stroke-opacity': '0.2',
      'stroke-dasharray': '4 2',
      'stroke-dashoffset': '1',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    expect(stroke(office)).toEqual(stroke(plain));
  });

  it('leaves the plain drawing as it was: gradients, and the groups’ opacity', () => {
    const { svg } = drawSvg(map(), { styles: '', title: 'Plain' });
    expect(svg).toContain('<radialGradient id="s1">');
    expect(svg).toContain('<g opacity="0.4"><g transform="translate(50 50)" opacity="0.75">');
    expect(svg).toContain('<circle r="10" fill="#0a141e" stroke="#c86400" stroke-width="3"/>');
  });
});
