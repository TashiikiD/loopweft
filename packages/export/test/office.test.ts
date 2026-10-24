// @vitest-environment jsdom
// The drawing for PowerPoint and Word, from a small map laid out by hand (jsdom lays nothing out, so each
// element's computed style and box are given here): a halo inside faded groups comes out as rings whose opacity,
// laid on each other, is the gradient's times every group's around it; no group keeps an opacity; and a
// response's ring and dot do not overlap, so neither shows through the other. (The example's drawings are
// checked in a browser: apps/studio/e2e/export-svg.spec.ts.)
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

/** The map: a halo (55% fading to clear), a response's ring and dot, in a group at 0.75 in a map at 0.4. */
function map(): HTMLElement {
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
  styles.set(halo, { fill: 'url("#h")' });
  const ring = document.createElementNS(SVG, 'circle');
  ring.setAttribute('r', '10');
  styles.set(ring, { fill: 'rgb(10, 20, 30)', stroke: 'rgb(200, 100, 0)', strokeWidth: '3px' });
  const dot = document.createElementNS(SVG, 'circle');
  dot.setAttribute('r', '4.2');
  styles.set(dot, { fill: 'rgb(200, 100, 0)' });
  node.append(halo, ring, dot);
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

describe('the drawing for PowerPoint and Word', () => {
  it('solves a halo’s rings for every faded group around it, and leaves no group an opacity', () => {
    const { svg } = drawSvg(map(), { styles: '', title: 'Rings', office: true });
    expect(svg).not.toContain('radialGradient');
    expect(svg).not.toContain('data-lw-solved');
    expect(svg).not.toMatch(/<(g|svg) [^>]*\sopacity=/);
    const rings = elements(svg, 'circle').filter((c) => c.fill === '#ff0000');
    expect(rings).toHaveLength(10);
    // Laid on each other at the middle of each band: the gradient times 0.75 times 0.4.
    const stops = [
      { offset: 0, colour: { hex: '#ff0000', alpha: 0.55 } },
      { offset: 1, colour: { hex: '#ff0000', alpha: 0 } },
    ];
    for (let k = 0; k < 10; k++) {
      const t = (k + 0.5) / 10;
      const got = rings
        .filter((ring) => Number(ring.r) >= t * 20)
        .reduce(
          (below, ring) =>
            below + Number(ring['fill-opacity'] ?? 1) * Number(ring.opacity ?? 1) * (1 - below),
          0,
        );
      expect(got, `band ${k}`).toBeCloseTo(colourAt(stops, t).alpha * 0.75 * 0.4, 3);
    }
  });

  it('draws a response’s ring around its dot, with its outline apart, so that none overlaps', () => {
    const { svg } = drawSvg(map(), { styles: '', title: 'Ring', office: true });
    const [fill] = elements(svg, 'path');
    expect(fill).toMatchObject({ 'fill-rule': 'evenodd', fill: '#0a141e', opacity: '0.3' });
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

  it('leaves the plain drawing as it was: gradients, and the groups’ opacity', () => {
    const { svg } = drawSvg(map(), { styles: '', title: 'Plain' });
    expect(svg).toContain('<radialGradient id="s1">');
    expect(svg).toContain('<g opacity="0.4"><g transform="translate(50 50)" opacity="0.75">');
    expect(svg).toContain('<circle r="10" fill="#0a141e" stroke="#c86400" stroke-width="3"/>');
  });
});
