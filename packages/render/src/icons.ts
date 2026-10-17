// The small icons a card can carry (CARD_ICONS in the format), as plain element descriptions drawn in the
// card's text colour. The icons for the ways crises become entangled and for leverage at depth are the deck's
// (PolycrisisPresentation src/viz/legend.ts mechanismGlyph and src/viz/cards.ts depthGlyph @ 539bc8e,
// private); the shapes are the map's own glyphs, the link marks the legend's, and the loops the badge arrow.
import type { CardIcon } from '@loopweft/model';
import { type GlyphPart, shapeGlyph } from './glyphs.ts';

export interface Icon {
  viewBox: string;
  width: number;
  height: number;
  parts: GlyphPart[];
}

const f = (n: number) => n.toFixed(2);

/** A line ending in an arrowhead at (x2, y2). */
function arrow(x1: number, y1: number, x2: number, y2: number, width: number): GlyphPart[] {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx = (d: number, s: number) => f(x2 - Math.cos(a) * d + Math.cos(a + Math.PI / 2) * s);
  const hy = (d: number, s: number) => f(y2 - Math.sin(a) * d + Math.sin(a + Math.PI / 2) * s);
  return [
    {
      tag: 'path',
      attrs: {
        d: `M${x1} ${y1}L${f(x2 - Math.cos(a) * 5)} ${f(y2 - Math.sin(a) * 5)}`,
        class: 'ic-line',
        'stroke-width': width,
      },
    },
    {
      tag: 'path',
      attrs: {
        d: `M${x2} ${y2}L${hx(7, 3.5)} ${hy(7, 3.5)}L${hx(7, -3.5)} ${hy(7, -3.5)}Z`,
        class: 'ic-fill',
      },
    },
  ];
}

/** The badge's circular arrow (see LOOP_ARROW), centred at (cx, cy) with radius `R`, and a letter inside. */
function loop(cx: number, cy: number, R: number, width: number, letter?: string): GlyphPart[] {
  const k = R / 15;
  const a0 = (-60 * Math.PI) / 180;
  const a1 = (230 * Math.PI) / 180;
  const p = (a: number) => `${f(cx + R * Math.cos(a))} ${f(cy + R * Math.sin(a))}`;
  const tip = { x: cx + R * Math.cos(a1), y: cy + R * Math.sin(a1) };
  const [tx, ty, nx, ny] = [-Math.sin(a1), Math.cos(a1), Math.cos(a1), Math.sin(a1)];
  const head =
    `M${f(tip.x + tx * 5 * k)} ${f(tip.y + ty * 5 * k)}` +
    `L${f(tip.x + nx * 3.6 * k)} ${f(tip.y + ny * 3.6 * k)}` +
    `L${f(tip.x - nx * 3.6 * k)} ${f(tip.y - ny * 3.6 * k)}Z`;
  return [
    {
      tag: 'path',
      attrs: { d: `M${p(a0)}A${f(R)} ${f(R)} 0 1 1 ${p(a1)}`, class: 'ic-line', 'stroke-width': width },
    },
    { tag: 'path', attrs: { d: head, class: 'ic-fill' } },
    ...(letter
      ? [
          {
            tag: 'text' as const,
            attrs: {
              x: cx,
              y: cy,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-size': f(15 * k),
              class: 'ic-text',
            },
            text: letter,
          },
        ]
      : []),
  ];
}

/** The deck's fan of three arrows, from a stress or a trigger out to what it strains. */
const FAN = [...arrow(19, 15, 58, 4, 2.2), ...arrow(20, 17, 58, 17, 2.2), ...arrow(19, 19, 58, 30, 2.2)];

/** The ways crises become entangled share the deck's 64 × 34 box. */
const ENTANGLED = { viewBox: '0 0 64 34', width: 64, height: 34 };
/** Leverage at depth: the deck's 48 × 32 box, centred. */
const DEPTH = { viewBox: '-24 -16 48 32', width: 48, height: 32 };
/** Link marks: the legend's 54 × 16 box. */
const LINK = { viewBox: '0 0 54 16', width: 54, height: 16 };

const linkMark = (head: 'arrow' | 'bar', dashed: boolean): GlyphPart[] => [
  {
    tag: 'path',
    attrs: {
      d: 'M2 8H42',
      class: 'ic-line',
      'stroke-width': 2.6,
      ...(dashed ? { 'stroke-dasharray': '7 6' } : {}),
    },
  },
  {
    tag: 'path',
    attrs: { d: head === 'bar' ? 'M44 1.5H47.5V14.5H44Z' : 'M52 8L41 2.5V13.5Z', class: 'ic-fill' },
  },
];

/** A card icon, drawn in the card's text colour (`currentColor`). */
export function cardIcon(name: CardIcon): Icon {
  switch (name) {
    case 'increases':
      return { ...LINK, parts: linkMark('arrow', false) };
    case 'decreases':
      return { ...LINK, parts: linkMark('bar', false) };
    case 'conditional':
      return { ...LINK, parts: linkMark('arrow', true) };
    case 'feedback':
      return { ...ENTANGLED, parts: loop(32, 17, 15 * 0.95, 2.2) };
    case 'reinforcing':
      return { ...DEPTH, parts: loop(0, 0, 15 * 0.85, 2.6 * 0.85, 'R') };
    case 'balancing':
      return { ...DEPTH, parts: loop(0, 0, 15 * 0.85, 2.6 * 0.85, 'B') };
    case 'common-stress':
      return {
        ...ENTANGLED,
        parts: [
          { tag: 'rect', attrs: { x: 3, y: 10, width: 14, height: 14, rx: 4, class: 'ic-fill' } },
          ...FAN,
        ],
      };
    case 'common-trigger':
      return {
        ...ENTANGLED,
        parts: [{ tag: 'circle', attrs: { cx: 10, cy: 17, r: 7.5, class: 'ic-fill' } }, ...FAN],
      };
    case 'domino':
      return {
        ...ENTANGLED,
        parts: [
          ...[7, 31, 55].map((cx) => ({
            tag: 'circle' as const,
            attrs: { cx, cy: 17, r: 5.5, class: 'ic-fill' },
          })),
          ...arrow(13, 17, 25, 17, 2.2),
          ...arrow(37, 17, 49, 17, 2.2),
        ],
      };
    case 'broken-link':
      return {
        ...DEPTH,
        parts: [
          { tag: 'path', attrs: { d: 'M-22 0H-7M-9 -6L-4 6', class: 'ic-line', 'stroke-width': 2.6 } },
          { tag: 'path', attrs: { d: 'M5 -6L10 6M8 0H22', class: 'ic-line', 'stroke-width': 2.6 } },
        ],
      };
    case 'root':
      return {
        ...DEPTH,
        parts: [
          {
            tag: 'path',
            attrs: {
              d: 'M0 -14V2M0 2C-4 8 -12 9 -16 14M0 2C4 8 12 9 16 14M0 2V14',
              class: 'ic-line',
              'stroke-width': 2.6,
            },
          },
        ],
      };
    default:
      // The role shapes, drawn as the map draws them.
      return {
        viewBox: '-17 -17 34 34',
        width: 34,
        height: 34,
        parts: shapeGlyph(name, name === 'ring' ? 11 : 12.5),
      };
  }
}
