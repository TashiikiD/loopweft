// The stage as a true SVG drawing: what the page has laid out, written as SVG shapes, gradients, filters and
// text, so it opens and stays editable in PowerPoint, Word, Inkscape, Illustrator and browsers. Every box and
// every line of text is placed where the page placed it (read from the page, not laid out again); the map,
// already SVG, is copied with its styles written out. Fonts are embedded for browsers. Anything the drawing
// cannot carry across exactly is named in its notes, never quietly changed.
//
// The stage's painting order is followed as CSS does for what Loopweft's stylesheet uses: boxes in tree order,
// and a backdrop placed behind its box's stacking context (z-index -1) painted just after that context's own
// background.
import { type Box, STAGE_SIZE } from '../frame.ts';
import {
  type Colour,
  type FilterPart,
  type Gradient,
  parseColour,
  parseFilter,
  parseGradient,
  parseLength,
  parseShadows,
  type Shadow,
  type Stop,
  splitTop,
} from './css.ts';
import { selectFontFaces } from './fonts.ts';
import {
  type Cover,
  clipToCircle,
  coverInradius,
  fadeEnd,
  gradientRings,
  offsetPolygon,
  type Pt,
  type Ring,
} from './rings.ts';
import { type Attrs, Defs, escapeText, fadeShapes, num, SOLVED, tag } from './writer.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface SvgOptions {
  /** The part of the stage to draw (default: all of it). */
  crop?: Box;
  /** The page's style rules as text (documentStyles): the fonts are taken from them. */
  styles: string;
  /** The drawing's title, e.g. the project's title and the step's key. */
  title: string;
  /**
   * For PowerPoint and Word: no radial gradients, which their Convert to Shape turns into solid discs, and no
   * group opacity, which it drops. Glows are drawn as rings of flat see-through colour instead (shading that
   * cannot be is left out, and noted), and a group's opacity is put on each of its shapes.
   */
  office?: boolean;
}

export interface SvgDrawing {
  svg: string;
  /** What a reader should know: what some editors leave out, and anything drawn approximately. */
  notes: string[];
}

/** What every note says, so the same thing is said once, the same way. */
export const NOTES = {
  text: 'Text is real text, in Inter and Fraunces, embedded for browsers. An editor without these fonts installed shows another font in their place (both are free to install).',
  filters:
    'Glows and soft shadows are SVG filters: browsers and Inkscape draw them; PowerPoint and Word leave them out.',
  masks:
    'The soft top and bottom edges of the backdrop behind a column of cards are an SVG mask, which PowerPoint and Word leave out (the backdrop then ends sharply).',
  office:
    'Made for PowerPoint and Word: its glows are rings of flat see-through colour, and each faded part carries its own opacity, which PowerPoint’s Convert to Shape keeps. In Word, keep it as a picture: Word’s Convert to Shape breaks the text, whatever the drawing.',
  shading:
    'Round shading that does not fade out to clear, such as the darkened edges of the stage’s backdrop, is left out (PowerPoint and Word would make it a solid shape): the backdrop shows its plain colour there.',
} as const;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Corner radii of a box: top-left, top-right, bottom-right, bottom-left. */
type Radii = [number, number, number, number];

const visibleOpacity = (s: CSSStyleDeclaration) => (s.display === 'none' ? 0 : Number(s.opacity));

/** A rounded rectangle as a path, each corner its own radius (clamped so corners never overlap). */
function roundedPath(r: Rect, radii: Radii): string {
  const { x, y, w, h } = r;
  const scale = Math.min(
    1,
    w / Math.max(1e-6, radii[0] + radii[1]),
    w / Math.max(1e-6, radii[3] + radii[2]),
    h / Math.max(1e-6, radii[0] + radii[3]),
    h / Math.max(1e-6, radii[1] + radii[2]),
  );
  const [a, b, c, d] = radii.map((v) => Math.max(0, v * scale)) as Radii;
  if (a === 0 && b === 0 && c === 0 && d === 0) {
    return `M${num(x)} ${num(y)}H${num(x + w)}V${num(y + h)}H${num(x)}Z`;
  }
  return [
    `M${num(x + a)} ${num(y)}`,
    `H${num(x + w - b)}`,
    b ? `A${num(b)} ${num(b)} 0 0 1 ${num(x + w)} ${num(y + b)}` : '',
    `V${num(y + h - c)}`,
    c ? `A${num(c)} ${num(c)} 0 0 1 ${num(x + w - c)} ${num(y + h)}` : '',
    `H${num(x + d)}`,
    d ? `A${num(d)} ${num(d)} 0 0 1 ${num(x)} ${num(y + h - d)}` : '',
    `V${num(y + a)}`,
    a ? `A${num(a)} ${num(a)} 0 0 1 ${num(x + a)} ${num(y)}` : '',
    'Z',
  ].join('');
}

/** A circle as a path (for cutting one shape out of another, with fill-rule evenodd). */
const circlePath = (cx: number, cy: number, r: number) =>
  `M${num(cx + r)} ${num(cy)}A${num(r)} ${num(r)} 0 1 0 ${num(cx - r)} ${num(cy)}A${num(r)} ${num(r)} 0 1 0 ${num(cx + r)} ${num(cy)}Z`;

const paint = (c: Colour, kind: 'fill' | 'stroke' = 'fill'): Attrs =>
  kind === 'fill'
    ? { fill: c.hex, 'fill-opacity': c.alpha < 1 ? c.alpha : null }
    : { stroke: c.hex, 'stroke-opacity': c.alpha < 1 ? c.alpha : null };

/** True for an element that starts a stacking context of its own (the cases Loopweft's stylesheet makes). */
function stackingRoot(s: CSSStyleDeclaration): boolean {
  return (
    Number(s.opacity) < 1 ||
    s.transform !== 'none' ||
    s.translate !== 'none' ||
    s.scale !== 'none' ||
    s.rotate !== 'none' ||
    s.filter !== 'none' ||
    s.isolation === 'isolate' ||
    s.mixBlendMode !== 'normal' ||
    (s.maskImage !== 'none' && s.maskImage !== '') ||
    (s.position !== 'static' && s.zIndex !== 'auto') ||
    s.position === 'fixed'
  );
}

class Flattener {
  readonly defs = new Defs();
  readonly notes = new Set<string>();
  /** Characters drawn, by font family, for choosing the font files to embed. */
  readonly chars = new Map<string, Set<string>>();
  readonly #origin: { x: number; y: number };
  readonly #view: Window;
  readonly #ascents = new Map<string, number>();
  readonly #doc: Document;
  /** Ids in a copied SVG, renamed in the order they are met. */
  readonly #ids = new Map<string, string>();
  /** Backdrops already painted with their stacking context: the element and which of its two. */
  readonly #painted = new Map<Element, Set<string>>();
  /** For PowerPoint and Word: radial gradients drawn as rings, or left out. */
  readonly #office: boolean;
  /**
   * For PowerPoint and Word: the opacity of the groups being drawn, all of them multiplied, which is put on each
   * of their shapes when they are written (#faded).
   */
  #fade = 1;

  constructor(viewport: Element, office = false) {
    const r = viewport.getBoundingClientRect();
    this.#origin = { x: r.left, y: r.top };
    this.#view = viewport.ownerDocument.defaultView as Window;
    this.#doc = viewport.ownerDocument;
    this.#office = office;
  }

  rectOf(el: Element): Rect {
    const r = el.getBoundingClientRect();
    return { x: r.left - this.#origin.x, y: r.top - this.#origin.y, w: r.width, h: r.height };
  }

  #style(el: Element, pseudo?: string): CSSStyleDeclaration {
    return this.#view.getComputedStyle(el, pseudo);
  }

  /** Draws what `make` draws inside a group at `opacity` (for PowerPoint and Word, tracked in #fade). */
  #inside<T>(opacity: number, make: () => T): T {
    if (!this.#office || opacity >= 1) return make();
    const outer = this.#fade;
    this.#fade = outer * opacity;
    try {
      return make();
    } finally {
      this.#fade = outer;
    }
  }

  /**
   * A group for PowerPoint and Word, with `attrs` (a transform, a filter): its opacity is put on each shape in
   * it, as their Convert to Shape keeps a shape's opacity but drops a group's.
   */
  #faded(opacity: number, body: string, attrs: Attrs = {}): string {
    const inner = fadeShapes(body, opacity);
    return Object.values(attrs).some((v) => v !== null && v !== undefined && v !== '')
      ? tag('g', attrs, inner)
      : inner;
  }

  /** Something the drawing could not carry across exactly. */
  approximate(what: string): void {
    this.notes.add(`Drawn approximately: ${what}.`);
  }

  // ----- HTML -----

  /** An HTML element and everything in it, in painting order. */
  html(el: Element): string {
    const s = this.#style(el);
    const opacity = visibleOpacity(s);
    if (opacity === 0 || s.visibility === 'hidden') return '';
    return this.#inside(opacity, () => this.#htmlBox(el, s, opacity));
  }

  #htmlBox(el: Element, s: CSSStyleDeclaration, opacity: number): string {
    const rect = this.rectOf(el);
    const parts: string[] = [];
    if (
      s.transform !== 'none' &&
      !/^matrix\(1, 0, 0, 1, [-\d.e]+, [-\d.e]+\)$/.test(s.transform) &&
      el !== stageRoot(el)
    ) {
      this.approximate(`a box turned or scaled (${s.transform}), drawn at its place without the turn`);
    }
    parts.push(this.#box(el, s, rect));
    if (stackingRoot(s) || el === stageRoot(el)) parts.push(this.#backdrops(el));
    parts.push(this.#pseudo(el, '::before'));
    const text: string[] = [];
    const flushText = () => {
      if (text.length) parts.push(this.#textGroup(el, s, rect, text.splice(0)));
    };
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const drawn = this.#text(node as Text, s);
        if (drawn) text.push(drawn);
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      flushText();
      const child = node as Element;
      if (child.namespaceURI === SVG_NS && child.localName === 'svg')
        parts.push(this.svgRoot(child as SVGSVGElement));
      else if (child.localName === 'img') parts.push(this.#image(child as HTMLImageElement));
      else parts.push(this.html(child));
    }
    flushText();
    parts.push(this.#pseudo(el, '::after'));
    let body = parts.join('');
    if (!body) return '';
    if (s.overflowX !== 'visible' || s.overflowY !== 'visible')
      body = this.#clip(body, this.#paddingBox(s, rect), this.#radii(s, rect));
    const filter = this.#filter(s.filter, rect);
    if (this.#office) return this.#faded(opacity, body, { filter });
    const attrs: Attrs = { opacity: opacity < 1 ? opacity : null, filter };
    return attrs.opacity !== null || filter ? tag('g', attrs, body) : body;
  }

  /**
   * The backdrops (a ::before or ::after placed at z-index below 0) that belong to this stacking context, in
   * tree order: its own, and those of elements in it that start no stacking context of their own.
   */
  #backdrops(root: Element): string {
    const out: string[] = [];
    const take = (el: Element) => {
      for (const pseudo of ['::before', '::after'] as const) {
        const p = this.#style(el, pseudo);
        if (p.content === 'none' || p.content === 'normal') continue;
        if (p.position === 'static' || !(Number.parseInt(p.zIndex, 10) < 0)) continue;
        out.push(this.#pseudoBox(el, pseudo, p));
        const done = this.#painted.get(el) ?? new Set<string>();
        done.add(pseudo);
        this.#painted.set(el, done);
      }
    };
    const walk = (el: Element) => {
      for (const child of el.children) {
        if (child.namespaceURI === SVG_NS) continue;
        const s = this.#style(child);
        if (s.display === 'none' || stackingRoot(s)) continue;
        take(child);
        walk(child);
      }
    };
    take(root);
    walk(root);
    return out.join('');
  }

  /** A ::before or ::after with no text of its own: a box (a backdrop, a dot). */
  #pseudo(el: Element, pseudo: '::before' | '::after'): string {
    const p = this.#style(el, pseudo);
    if (p.content === 'none' || p.content === 'normal') return '';
    if (this.#painted.get(el)?.has(pseudo)) return '';
    if (p.position !== 'static' && Number.parseInt(p.zIndex, 10) < 0) {
      // A backdrop whose stacking context was not found: drawn here, under the box's content.
      this.approximate('a backdrop drawn in the order of its box');
    }
    return this.#pseudoBox(el, pseudo, p);
  }

  #pseudoBox(el: Element, pseudo: '::before' | '::after', p: CSSStyleDeclaration): string {
    if (p.display === 'none' || visibleOpacity(p) === 0) return '';
    if (p.content !== '""') this.approximate(`generated text (${p.content}), left out`);
    const width = parseLength(p.width, 0);
    const height = parseLength(p.height, 0);
    if (width === null || height === null) {
      this.approximate('a decoration whose size the page does not give');
      return '';
    }
    let rect: Rect | null = null;
    if (p.position === 'absolute') {
      const host = this.#style(el);
      const box = this.#paddingBox(host, this.rectOf(el));
      const left = parseLength(p.left, box.w);
      const top = parseLength(p.top, box.h);
      if (left !== null && top !== null) rect = { x: box.x + left, y: box.y + top, w: width, h: height };
    } else if (p.display === 'inline-block' && pseudo === '::before') {
      // A dot before the first line of text (a category's colour): beside its first letter, raised from the
      // baseline as its vertical-align says.
      const first = this.#firstLine(el);
      if (first) {
        const margin = parseLength(p.marginRight, 0) ?? 0;
        const raise = parseLength(p.verticalAlign, 0) ?? 0;
        rect = { x: first.x - margin - width, y: first.baseline - raise - height, w: width, h: height };
      }
    }
    if (!rect) {
      this.approximate(`a decoration placed as ${p.position} ${p.display}, left out`);
      return '';
    }
    const opacity = visibleOpacity(p);
    let body = this.#inside(opacity, () => this.#box(el, p, rect));
    if (p.maskImage && p.maskImage !== 'none') body = this.#mask(body, p.maskImage, rect);
    if (this.#office) return this.#faded(opacity, body);
    return opacity < 1 ? tag('g', { opacity }, body) : body;
  }

  /** Where the first line of an element's text starts, and its baseline. */
  #firstLine(el: Element): { x: number; baseline: number } | null {
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const lines = this.#lines(node as Text);
      const line = lines[0];
      if (line) {
        const s = this.#style(node.parentElement as Element);
        return { x: line.x, baseline: line.y + this.#ascent(s) };
      }
    }
    return null;
  }

  #paddingBox(s: CSSStyleDeclaration, r: Rect): Rect {
    const l = parseLength(s.borderLeftWidth, 0) ?? 0;
    const t = parseLength(s.borderTopWidth, 0) ?? 0;
    const ri = parseLength(s.borderRightWidth, 0) ?? 0;
    const b = parseLength(s.borderBottomWidth, 0) ?? 0;
    return { x: r.x + l, y: r.y + t, w: r.w - l - ri, h: r.h - t - b };
  }

  #radii(s: CSSStyleDeclaration, r: Rect): Radii {
    const one = (v: string, basis: number) => parseLength(splitTop(v, ' ')[0] ?? '0', basis) ?? 0;
    const basis = Math.min(r.w, r.h);
    return [
      one(s.borderTopLeftRadius, basis),
      one(s.borderTopRightRadius, basis),
      one(s.borderBottomRightRadius, basis),
      one(s.borderBottomLeftRadius, basis),
    ];
  }

  /** A box's shadows, background and border. */
  #box(_el: Element, s: CSSStyleDeclaration, rect: Rect): string {
    if (rect.w <= 0 || rect.h <= 0) return '';
    const radii = this.#radii(s, rect);
    const out: string[] = [];
    const shadows = parseShadows(s.boxShadow);
    if (shadows === null) this.approximate(`a shadow (${s.boxShadow}), left out`);
    else {
      for (const shadow of [...shadows].reverse()) {
        if (shadow.inset) {
          this.approximate('an inner shadow, left out');
          continue;
        }
        out.push(this.#boxShadow(shadow, rect, radii));
      }
    }
    const background = parseColour(s.backgroundColor);
    if (background && background.alpha > 0)
      out.push(tag('path', { d: roundedPath(rect, radii), ...paint(background) }));
    if (s.backgroundImage && s.backgroundImage !== 'none') {
      const area = this.#paddingBox(s, rect);
      const layers = splitTop(s.backgroundImage).filter((l) => l !== 'none');
      for (const layer of [...layers].reverse()) {
        const gradient = parseGradient(layer, area.x, area.y, area.w, area.h);
        if (!gradient) {
          this.approximate(`a background (${layer.slice(0, 60)}), left out`);
          continue;
        }
        if (gradient.kind === 'radial' && this.#office) {
          out.push(this.#boxRings(gradient, rect, radii));
          continue;
        }
        out.push(tag('path', { d: roundedPath(rect, radii), fill: `url(#${this.#gradient(gradient)})` }));
      }
    }
    out.push(this.#border(s, rect, radii));
    return out.join('');
  }

  /**
   * A box's radial gradient for PowerPoint and Word: rings, cut to the box where they reach past it, if it fades
   * out to clear (a glow, the backdrop behind a statement); left out if it does not (the stage's darkened edges).
   */
  #boxRings(g: Gradient & { kind: 'radial' }, rect: Rect, radii: Radii): string {
    const end = fadeEnd(g.stops);
    if (end === null) {
      this.notes.add(NOTES.shading);
      return '';
    }
    // Solved for the groups around it too, which then leave the rings' opacity alone (#ring).
    const { rings, exact } = gradientRings(g.stops, end, this.#fade);
    if (!exact) this.approximate('a radial gradient that changes colour, drawn as rings of its colours');
    const body = rings.map((ring) => this.#ring(g.cx, g.cy, g.rx * ring.r, g.ry * ring.r, ring)).join('');
    const reach = { x: g.rx * end, y: g.ry * end };
    const inside =
      g.cx - reach.x >= rect.x &&
      g.cx + reach.x <= rect.x + rect.w &&
      g.cy - reach.y >= rect.y &&
      g.cy + reach.y <= rect.y + rect.h;
    return body && !inside ? this.#clip(body, rect, radii) : body;
  }

  /**
   * One ring: a circle, or an ellipse where its radii differ, of flat colour. Its opacity is final (solved for
   * the groups around it), so it is marked for fadeShapes to pass over.
   */
  #ring(cx: number, cy: number, rx: number, ry: number, ring: Ring, cover?: Cover | null): string {
    const fill: Attrs = {
      fill: ring.hex,
      'fill-opacity': ring.opacity < 1 ? String(ring.opacity) : null,
      [SOLVED]: '1',
    };
    if (cover) {
      // Cut where the opaque shape over it lies (a ring wholly under it is left out).
      if (rx <= coverInradius(cover)) return '';
      const hole =
        'r' in cover
          ? circlePath(cx, cy, cover.r)
          : `M${clipToCircle(cover.points, rx)
              .map(([x, y]) => `${num(cx + x)} ${num(cy + y)}`)
              .join('L')}Z`;
      return tag('path', { d: circlePath(cx, cy, rx) + hole, 'fill-rule': 'evenodd', ...fill });
    }
    return Math.abs(rx - ry) < 0.005
      ? tag('circle', { cx, cy, r: rx, ...fill })
      : tag('ellipse', { cx, cy, rx, ry, ...fill });
  }

  #boxShadow(shadow: Shadow, rect: Rect, radii: Radii): string {
    const spread = shadow.spread;
    const shape: Rect = {
      x: rect.x + shadow.x - spread,
      y: rect.y + shadow.y - spread,
      w: rect.w + 2 * spread,
      h: rect.h + 2 * spread,
    };
    const grown = radii.map((r) => (r > 0 ? r + spread : 0)) as Radii;
    // A box shadow's blur is twice the standard deviation of its Gaussian (CSS Backgrounds 3).
    const sigma = shadow.blur / 2;
    const reach = 3 * sigma + 2;
    const region = {
      x: shape.x - reach,
      y: shape.y - reach,
      width: shape.w + 2 * reach,
      height: shape.h + 2 * reach,
    };
    let filter: string | null = null;
    if (sigma > 0) {
      this.notes.add(NOTES.filters);
      filter = `url(#${this.defs.unique((id) =>
        tag(
          'filter',
          { id, filterUnits: 'userSpaceOnUse', ...region },
          tag('feGaussianBlur', { stdDeviation: sigma }),
        ),
      )})`;
    }
    // An outer shadow shows only outside the box.
    const mask = this.defs.unique((id) =>
      tag(
        'mask',
        { id, maskUnits: 'userSpaceOnUse', ...region },
        tag('rect', { ...region, fill: '#ffffff' }) +
          tag('path', { d: roundedPath(rect, radii), fill: '#000000' }),
      ),
    );
    return tag(
      'g',
      { mask: `url(#${mask})` },
      tag('path', { d: roundedPath(shape, grown), ...paint(shadow.colour), filter }),
    );
  }

  /** A border of solid sides, each its own width and colour, joined at the corners as CSS joins them. */
  #border(s: CSSStyleDeclaration, rect: Rect, radii: Radii): string {
    const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => ({
      width: parseLength(s[`border${side}Width`], 0) ?? 0,
      colour: parseColour(s[`border${side}Color`]),
      style: s[`border${side}Style`],
    }));
    if (sides.every((side) => side.width === 0 || side.style === 'none')) return '';
    for (const side of sides) {
      if (side.width > 0 && side.style !== 'solid' && side.style !== 'none')
        this.approximate(`a ${side.style} border, drawn solid`);
    }
    const [t, r, b, l] = sides.map((side) => (side.style === 'none' ? 0 : side.width)) as [
      number,
      number,
      number,
      number,
    ];
    const inner: Rect = { x: rect.x + l, y: rect.y + t, w: rect.w - l - r, h: rect.h - t - b };
    const innerRadii: Radii = [
      Math.max(0, radii[0] - Math.max(l, t)),
      Math.max(0, radii[1] - Math.max(r, t)),
      Math.max(0, radii[2] - Math.max(r, b)),
      Math.max(0, radii[3] - Math.max(l, b)),
    ];
    const ring = `${roundedPath(rect, radii)}${inner.w > 0 && inner.h > 0 ? roundedPath(inner, innerRadii) : ''}`;
    const colours = sides.map((side) => (side.colour ? `${side.colour.hex}/${side.colour.alpha}` : ''));
    if (colours.every((c) => c === colours[0]) && sides[0]?.colour) {
      return tag('path', { d: ring, 'fill-rule': 'evenodd', ...paint(sides[0].colour) });
    }
    // Each side in its own wedge: from the outer corners to the inner ones.
    const o = { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h };
    const i = { x0: inner.x, y0: inner.y, x1: inner.x + inner.w, y1: inner.y + inner.h };
    const wedges = [
      [o.x0, o.y0, o.x1, o.y0, i.x1, i.y0, i.x0, i.y0],
      [o.x1, o.y0, o.x1, o.y1, i.x1, i.y1, i.x1, i.y0],
      [o.x1, o.y1, o.x0, o.y1, i.x0, i.y1, i.x1, i.y1],
      [o.x0, o.y1, o.x0, o.y0, i.x0, i.y0, i.x0, i.y1],
    ];
    return sides
      .map((side, k) => {
        if (!side.colour || side.colour.alpha === 0 || side.width === 0 || side.style === 'none') return '';
        const points = (wedges[k] as number[]).map(num).join(' ');
        const clip = this.defs.unique((id) => tag('clipPath', { id }, tag('polygon', { points })));
        return tag('path', {
          d: ring,
          'fill-rule': 'evenodd',
          'clip-path': `url(#${clip})`,
          ...paint(side.colour),
        });
      })
      .join('');
  }

  #gradient(g: Gradient): string {
    // CSS mixes towards a transparent stop in the colour of its neighbour; SVG would mix towards its black.
    const stops = g.stops.map((stop, k) => {
      if (stop.colour.alpha > 0) return stop;
      const near =
        g.stops.slice(k + 1).find((n) => n.colour.alpha > 0) ??
        [...g.stops.slice(0, k)].reverse().find((n) => n.colour.alpha > 0);
      return near ? { offset: stop.offset, colour: { hex: near.colour.hex, alpha: 0 } } : stop;
    });
    const stopTags = stops
      .map((stop) =>
        tag('stop', {
          offset: Math.max(0, Math.min(1, stop.offset)),
          'stop-color': stop.colour.hex,
          'stop-opacity': stop.colour.alpha < 1 ? stop.colour.alpha : null,
        }),
      )
      .join('');
    if (g.stops.some((s) => s.offset < 0 || s.offset > 1))
      this.approximate('a gradient with stops outside its box, cut at its ends');
    const key = JSON.stringify(g);
    return this.defs.id(key, (id) =>
      g.kind === 'linear'
        ? tag(
            'linearGradient',
            { id, gradientUnits: 'userSpaceOnUse', x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 },
            stopTags,
          )
        : tag(
            'radialGradient',
            {
              id,
              gradientUnits: 'userSpaceOnUse',
              cx: 0,
              cy: 0,
              r: 1,
              gradientTransform: `matrix(${num(g.rx)} 0 0 ${num(g.ry)} ${num(g.cx)} ${num(g.cy)})`,
            },
            stopTags,
          ),
    );
  }

  /** A CSS mask-image (a gradient) over a box: SVG masks by brightness, so the mask's white fades out. */
  #mask(body: string, maskImage: string, rect: Rect): string {
    const gradient = parseGradient(maskImage, rect.x, rect.y, rect.w, rect.h);
    if (!gradient || (gradient.kind === 'radial' && this.#office)) {
      this.approximate(`a mask (${maskImage.slice(0, 60)}), left out`);
      return body;
    }
    this.notes.add(NOTES.masks);
    const white = {
      ...gradient,
      stops: gradient.stops.map((s) => ({
        offset: s.offset,
        colour: { hex: '#ffffff', alpha: s.colour.alpha },
      })),
    };
    const fill = this.#gradient(white);
    const id = this.defs.unique((mid) =>
      tag(
        'mask',
        { id: mid, maskUnits: 'userSpaceOnUse', x: rect.x, y: rect.y, width: rect.w, height: rect.h },
        tag('rect', { x: rect.x, y: rect.y, width: rect.w, height: rect.h, fill: `url(#${fill})` }),
      ),
    );
    return tag('g', { mask: `url(#${id})` }, body);
  }

  #clip(body: string, box: Rect, radii: Radii): string {
    const id = this.defs.unique((cid) =>
      tag('clipPath', { id: cid }, tag('path', { d: roundedPath(box, radii) })),
    );
    return tag('g', { 'clip-path': `url(#${id})` }, body);
  }

  /**
   * A CSS filter as an SVG filter, over a region of the page's pixels (or `space`, in the element's own user
   * space), its lengths times `scale`.
   */
  #filter(
    text: string,
    rect: Rect | null,
    space?: { x: number; y: number; w: number; h: number },
    scale = 1,
  ): string | null {
    if (!text || text === 'none') return null;
    const parts = parseFilter(text);
    if (!parts) {
      this.approximate(`an effect (${text}), left out`);
      return null;
    }
    if (parts.length === 0) return null;
    this.notes.add(NOTES.filters);
    const region =
      space ?? (rect ? { x: rect.x - 60, y: rect.y - 60, w: rect.w + 120, h: rect.h + 120 } : null);
    const key = `${text}|${region ? JSON.stringify(region) : 'object'}|${num(scale)}`;
    return `url(#${this.defs.id(key, (id) =>
      tag(
        'filter',
        {
          id,
          ...(region
            ? { filterUnits: 'userSpaceOnUse', x: region.x, y: region.y, width: region.w, height: region.h }
            : { x: '-50%', y: '-50%', width: '200%', height: '200%' }),
          'color-interpolation-filters': 'sRGB',
        },
        filterPrimitives(parts, scale),
      ),
    )})`;
  }

  // ----- Text -----

  /** The lines a text node takes on the page: its text, where each starts, its box. */
  #lines(node: Text): { text: string; x: number; y: number; w: number; h: number }[] {
    const value = node.data;
    const range = node.ownerDocument.createRange();
    const lines: { text: string; x: number; y: number; w: number; h: number; right: number }[] = [];
    let current: (typeof lines)[number] | null = null;
    let pending = '';
    for (let i = 0; i < value.length; ) {
      const code = value.codePointAt(i) as number;
      const size = code > 0xffff ? 2 : 1;
      const ch = value.slice(i, i + size);
      range.setStart(node, i);
      range.setEnd(node, i + size);
      const r = range.getClientRects()[0];
      i += size;
      if (/\s/.test(ch) || !r || r.width === 0) {
        if (/\s/.test(ch) && current) pending = ' ';
        continue;
      }
      const x = r.left - this.#origin.x;
      const y = r.top - this.#origin.y;
      if (!current || Math.abs(y - current.y) > Math.max(2, r.height / 2)) {
        current = { text: '', x, y, w: 0, h: r.height, right: x };
        lines.push(current);
        pending = '';
      }
      current.text += pending + ch;
      pending = '';
      current.right = Math.max(current.right, x + r.width);
      current.w = current.right - current.x;
    }
    return lines;
  }

  /**
   * Where the baseline lies below the top of a line's text, for a style's font, as the page lays it out: a
   * probe in the same font (its settings, such as the serif's optical size, included) beside a marker of no
   * size, which sits on the baseline. Measured once per font, off the stage.
   */
  #ascent(s: CSSStyleDeclaration): number {
    const font = [
      s.fontStyle,
      s.fontWeight,
      s.fontSize,
      s.fontFamily,
      s.fontStretch,
      s.fontVariationSettings,
      s.fontFeatureSettings,
      s.fontOpticalSizing,
    ].join('|');
    const known = this.#ascents.get(font);
    if (known !== undefined) return known;
    const doc = this.#doc;
    const probe = doc.createElement('span');
    for (const [name, value] of [
      ['position', 'absolute'],
      ['left', '-10000px'],
      ['top', '0'],
      ['white-space', 'nowrap'],
      ['line-height', 'normal'],
      ['font-style', s.fontStyle],
      ['font-weight', s.fontWeight],
      ['font-size', s.fontSize],
      ['font-family', s.fontFamily],
      ['font-stretch', s.fontStretch],
      ['font-variation-settings', s.fontVariationSettings],
      ['font-feature-settings', s.fontFeatureSettings],
      ['font-optical-sizing', s.fontOpticalSizing],
    ] as const) {
      probe.style.setProperty(name, value);
    }
    const letter = doc.createTextNode('H');
    const marker = doc.createElement('span');
    marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    probe.append(letter, marker);
    doc.body.appendChild(probe);
    const range = doc.createRange();
    range.selectNodeContents(letter);
    const top = range.getClientRects()[0]?.top ?? 0;
    const ascent = marker.getBoundingClientRect().bottom - top;
    probe.remove();
    this.#ascents.set(font, ascent);
    return ascent;
  }

  /** A text node, one <text> per line, at the place the page gives each line. */
  #text(node: Text, s: CSSStyleDeclaration): string {
    if (!node.data.trim()) return '';
    const colour = parseColour(s.color);
    if (!colour || colour.alpha === 0) return '';
    const lines = this.#lines(node);
    if (lines.length === 0) return '';
    this.notes.add(NOTES.text);
    const transform = (t: string) =>
      s.textTransform === 'uppercase'
        ? t.toUpperCase()
        : s.textTransform === 'lowercase'
          ? t.toLowerCase()
          : s.textTransform === 'capitalize'
            ? t.replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
            : t;
    const family = s.fontFamily;
    const used = this.chars.get(family) ?? new Set<string>();
    this.chars.set(family, used);
    const ascent = this.#ascent(s);
    const spacing = s.letterSpacing === 'normal' ? null : parseLength(s.letterSpacing, 0);
    const variation =
      s.fontVariationSettings !== 'normal' ? `font-variation-settings:${s.fontVariationSettings}` : null;
    const features =
      s.fontFeatureSettings !== 'normal' ? `font-feature-settings:${s.fontFeatureSettings}` : null;
    const style = [variation, features, smoothing(s)].filter(Boolean).join(';') || null;
    return lines
      .map((line) => {
        const text = transform(line.text);
        for (const ch of text) used.add(ch);
        return tag(
          'text',
          {
            x: line.x,
            y: line.y + ascent,
            'font-family': family,
            'font-size': parseLength(s.fontSize, 0) ?? s.fontSize,
            'font-weight': s.fontWeight === '400' ? null : s.fontWeight,
            'font-style': s.fontStyle === 'normal' ? null : s.fontStyle,
            'letter-spacing': spacing ? spacing : null,
            ...paint(colour),
            style,
          },
          escapeText(text),
        );
      })
      .join('');
  }

  /** An element's text, with its text-shadow (a glow) as one filter for the whole box. */
  #textGroup(_el: Element, s: CSSStyleDeclaration, rect: Rect, texts: string[]): string {
    const body = texts.join('');
    if (s.textShadow === 'none') return body;
    const shadows = parseShadows(s.textShadow);
    if (!shadows) {
      this.approximate(`a text glow (${s.textShadow}), left out`);
      return body;
    }
    if (shadows.length === 0) return body;
    this.notes.add(NOTES.filters);
    const reach = Math.max(...shadows.map((sh) => 1.5 * sh.blur + Math.abs(sh.x) + Math.abs(sh.y))) + 4;
    const region = { x: rect.x - reach, y: rect.y - reach, w: rect.w + 2 * reach, h: rect.h + 2 * reach };
    const key = `text-shadow|${s.textShadow}|${JSON.stringify(region)}`;
    const id = this.defs.id(key, (fid) => {
      // CSS paints the first shadow on top, all of them under the text.
      const layers = shadows.map((sh, k) =>
        [
          tag('feFlood', {
            'flood-color': sh.colour.hex,
            'flood-opacity': sh.colour.alpha < 1 ? sh.colour.alpha : null,
            result: `c${k}`,
          }),
          tag('feComposite', { in: `c${k}`, in2: 'SourceAlpha', operator: 'in', result: `a${k}` }),
          tag('feGaussianBlur', { in: `a${k}`, stdDeviation: sh.blur / 2, result: `b${k}` }),
          tag('feOffset', { in: `b${k}`, dx: sh.x, dy: sh.y, result: `s${k}` }),
        ].join(''),
      );
      const merge = tag(
        'feMerge',
        {},
        [
          ...shadows.map((_, k) => tag('feMergeNode', { in: `s${k}` })).reverse(),
          tag('feMergeNode', { in: 'SourceGraphic' }),
        ].join(''),
      );
      return tag(
        'filter',
        {
          id: fid,
          filterUnits: 'userSpaceOnUse',
          x: region.x,
          y: region.y,
          width: region.w,
          height: region.h,
          'color-interpolation-filters': 'sRGB',
        },
        layers.join('') + merge,
      );
    });
    return tag('g', { filter: `url(#${id})` }, body);
  }

  // ----- Images -----

  #image(img: HTMLImageElement): string {
    const s = this.#style(img);
    const opacity = visibleOpacity(s);
    if (opacity === 0 || s.visibility === 'hidden') return '';
    const rect = this.rectOf(img);
    if (s.objectFit !== 'fill' && s.objectFit !== '')
      this.approximate(`an image fitted by "${s.objectFit}", drawn stretched to its box`);
    const radii = this.#radii(s, rect);
    const shadows = parseShadows(s.boxShadow) ?? [];
    const out = [...shadows]
      .reverse()
      .filter((sh) => !sh.inset)
      .map((sh) => this.#boxShadow(sh, rect, radii));
    let picture = tag('image', {
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      preserveAspectRatio: 'none',
      // xlink:href, which every SVG reader takes (newer ones take href too).
      'xlink:href': img.currentSrc || img.src,
    });
    if (radii.some((r) => r > 0)) picture = this.#clip(picture, rect, radii);
    out.push(picture);
    const body = out.join('');
    if (this.#office) return this.#faded(opacity, body);
    return opacity < 1 ? tag('g', { opacity }, body) : body;
  }

  // ----- SVG -----

  /** An inline <svg> of the page (the map, a glyph), placed in its box. */
  svgRoot(svg: SVGSVGElement): string {
    const s = this.#style(svg);
    const opacity = visibleOpacity(s);
    if (opacity === 0 || s.visibility === 'hidden') return '';
    const rect = this.rectOf(svg);
    if (rect.w === 0 || rect.h === 0) return '';
    const viewBox = svg.getAttribute('viewBox');
    let inner = this.#inside(opacity, () => [...svg.childNodes].map((n) => this.svgNode(n)).join(''));
    if (!inner) return '';
    if (this.#office) inner = fadeShapes(inner, opacity);
    const drawn = tag(
      'svg',
      {
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
        viewBox: viewBox
          ? viewBox
              .split(/[\s,]+/)
              .map((v) => num(Number(v)))
              .join(' ')
          : null,
        preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
        overflow: s.overflowX === 'visible' ? 'visible' : null,
        opacity: opacity < 1 && !this.#office ? opacity : null,
      },
      inner,
    );
    // A filter goes on a group around the drawing, in the page's pixels (on the <svg> itself, its region would
    // be read in the drawing's own units).
    const filter = this.#filter(s.filter, rect);
    return filter ? tag('g', { filter }, drawn) : drawn;
  }

  #id(old: string): string {
    const known = this.#ids.get(old);
    if (known) return known;
    const id = `s${this.#ids.size + 1}`;
    this.#ids.set(old, id);
    return id;
  }

  /** A paint value of a copied SVG element: a colour, none, or a reference to one of its gradients. */
  #svgPaint(value: string, kind: 'fill' | 'stroke'): Attrs {
    if (value === 'none') return { [kind]: 'none' };
    const ref = /^url\("?#([^")]+)"?\)/.exec(value);
    if (ref) return { [kind]: `url(#${this.#id(ref[1] as string)})` };
    const colour = parseColour(value);
    if (!colour) {
      this.approximate(`a ${kind} (${value}), left out`);
      return { [kind]: 'none' };
    }
    return paint(colour, kind);
  }

  svgNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node as Text).data;
      return text.trim() ? escapeText(text) : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as SVGElement;
    const name = el.localName;
    if (name === 'defs') return this.#svgDefs(el);
    if (name === 'title' || name === 'desc' || name === 'metadata') return '';
    const s = this.#style(el);
    if (s.display === 'none') return '';
    const opacity = Number(s.opacity);
    if (opacity === 0 || s.visibility === 'hidden') return '';
    if (name === 'foreignObject') {
      this.approximate('HTML inside an SVG drawing, left out');
      return '';
    }
    const attrs: Attrs = {};
    for (const a of GEOMETRY[name] ?? []) {
      const v = el.getAttribute(a);
      if (v !== null) attrs[a] = /^-?[\d.]+(e-?\d+)?$/.test(v) ? Number(v) : v;
    }
    const transform = el.getAttribute('transform');
    if (transform) attrs.transform = transform;
    else if (s.transform !== 'none') {
      // A transform set in CSS (its origin is the drawing's origin for SVG, unless the stylesheet moves it).
      if (s.transformOrigin !== '0px 0px') this.approximate('an SVG transform about another origin');
      attrs.transform = s.transform.replace(/,\s*/g, ' ');
    }
    if (name === 'svg') {
      this.approximate('an SVG nested in an SVG, drawn as a group');
    }
    const radial = this.#office && SHAPES.has(name) ? this.#radialFill(s.fill) : null;
    if (radial) return this.#shapeRings(el, s, attrs, radial, opacity);
    if (SHAPES.has(name)) {
      Object.assign(attrs, this.#svgPaint(s.fill, 'fill'), this.#svgPaint(s.stroke, 'stroke'));
      if (s.fillRule === 'evenodd') attrs['fill-rule'] = 'evenodd';
      if (s.fillOpacity !== '1')
        attrs['fill-opacity'] = Number(s.fillOpacity) * Number(attrs['fill-opacity'] ?? 1);
      if (s.stroke !== 'none') this.#strokeDetails(s, attrs);
    }
    if (name === 'text' || name === 'tspan') {
      attrs['font-family'] = s.fontFamily;
      attrs['font-size'] = parseLength(s.fontSize, 0) ?? s.fontSize;
      if (s.fontWeight !== '400') attrs['font-weight'] = s.fontWeight;
      if (s.textAnchor !== 'start') attrs['text-anchor'] = s.textAnchor;
      if (s.dominantBaseline !== 'auto') attrs['dominant-baseline'] = s.dominantBaseline;
      if (s.letterSpacing !== 'normal') attrs['letter-spacing'] = parseLength(s.letterSpacing, 0) ?? null;
      const smooth = smoothing(s);
      if (smooth) attrs.style = smooth;
      const used = this.chars.get(s.fontFamily) ?? new Set<string>();
      this.chars.set(s.fontFamily, used);
      for (const ch of el.textContent ?? '') used.add(ch);
      this.notes.add(NOTES.text);
    }
    if (opacity < 1) attrs.opacity = opacity;
    const filter = this.#filter(s.filter, null, { x: -100000, y: -100000, w: 200000, h: 200000 });
    if (filter) attrs.filter = filter;
    const children =
      name === 'g' || name === 'svg'
        ? this.#inside(opacity, () => [...el.childNodes].map((n) => this.svgNode(n)).join(''))
        : [...el.childNodes].map((n) => this.svgNode(n)).join('');
    if ((name === 'g' || name === 'svg') && this.#office) {
      const { opacity: _, ...rest } = attrs;
      return children ? this.#faded(opacity, children, rest) : '';
    }
    if (name === 'g' || name === 'svg') return children ? tag('g', attrs, children) : '';
    if (!KNOWN.has(name)) {
      this.approximate(`an SVG ${name}, left out`);
      return '';
    }
    if (this.#office && name === 'circle' && this.#fade * opacity < 1) {
      const ring = this.#ringUnderDot(el, attrs);
      if (ring) return ring;
    }
    return tag(name, attrs, children || undefined);
  }

  /**
   * For PowerPoint and Word, a circle with a smaller one at its centre drawn next (a response's ring and dot), in
   * a faded group: its fill as a ring around the dot and its outline apart, so that no two shapes overlap where
   * each carries the group's opacity. Null if the next shape is no such dot.
   */
  #ringUnderDot(el: SVGElement, attrs: Attrs): string | null {
    const dot = el.nextElementSibling;
    if (dot?.localName !== 'circle') return null;
    const at = (e: Element, a: string) => Number(e.getAttribute(a) ?? 0);
    const r = at(el, 'r');
    const inner = at(dot, 'r');
    const style = this.#style(dot);
    if (
      at(dot, 'cx') !== at(el, 'cx') ||
      at(dot, 'cy') !== at(el, 'cy') ||
      !(inner > 0 && inner < r) ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) < 1 ||
      style.fill === 'none' ||
      Number(style.fillOpacity) < 1 ||
      dot.hasAttribute('transform') ||
      style.transform !== 'none'
    )
      return null;
    const cx = at(el, 'cx');
    const cy = at(el, 'cy');
    const stroked = attrs.stroke !== undefined && attrs.stroke !== 'none';
    const width = stroked ? Number(attrs['stroke-width'] ?? 1) : 0;
    const outer = r - width / 2;
    const common: Attrs = { transform: attrs.transform, opacity: attrs.opacity, filter: attrs.filter };
    const circle = (radius: number) => circlePath(cx, cy, radius);
    const fill =
      attrs.fill !== 'none' && outer > inner
        ? tag('path', {
            d: circle(outer) + circle(inner),
            'fill-rule': 'evenodd',
            fill: attrs.fill,
            'fill-opacity': attrs['fill-opacity'],
            ...common,
          })
        : '';
    const outline = stroked
      ? tag('circle', {
          cx,
          cy,
          r,
          fill: 'none',
          ...Object.fromEntries(Object.entries(attrs).filter(([a]) => a.startsWith('stroke'))),
          ...common,
        })
      : '';
    return fill + outline;
  }

  /**
   * What the first opaque shape drawn after a glow (in its group, at its centre: a variable's glyph) covers, about
   * the glow's centre, its outline included out to half its width where the outline is (nearly) opaque; null if
   * none does, or if it is not a circle, rectangle or convex polygon about the centre.
   */
  #coverOver(el: SVGElement, cx: number, cy: number): Cover | null {
    for (let next = el.nextElementSibling; next; next = next.nextElementSibling) {
      const st = this.#style(next);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
      const fill = parseColour(st.fill);
      const opaque =
        fill?.alpha === 1 &&
        Number(st.fillOpacity) === 1 &&
        Number(st.opacity) === 1 &&
        !next.hasAttribute('transform') &&
        st.transform === 'none';
      if (!opaque) continue;
      // Its outline covers the glow too, out to half its width. An outline that lets a twentieth through at most
      // (the map's) is taken as opaque; through a fainter one the glow would show in the plain drawing, which
      // the rings cannot match there: they stop at the fill.
      let grow = 0;
      const line = st.stroke !== 'none' ? parseColour(st.stroke) : null;
      const width = line ? (parseLength(st.strokeWidth, 0) ?? 0) : 0;
      if (line && width > 0 && line.alpha > 0 && Number(st.strokeOpacity) > 0) {
        const solid = line.alpha * Number(st.strokeOpacity) >= 0.949 && st.strokeDasharray === 'none';
        if (solid) grow = width / 2;
        else
          this.approximate('a glow under a see-through or dashed outline in a faded group, drawn under it');
      }
      const at = (a: string) => Number(next.getAttribute(a) ?? 0);
      if (next.localName === 'circle') {
        return at('cx') === cx && at('cy') === cy ? { r: at('r') + grow } : null;
      }
      if (next.localName === 'polygon') {
        const values = (next.getAttribute('points') ?? '')
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        const points: Pt[] = [];
        for (let k = 0; k + 1 < values.length; k += 2)
          points.push([(values[k] as number) - cx, (values[k + 1] as number) - cy]);
        return points.length >= 3 && points.every((p) => p.every(Number.isFinite)) && convexAround(points)
          ? { points: grow > 0 ? offsetPolygon(points, grow) : points }
          : null;
      }
      if (next.localName === 'rect') {
        const [x, y, w, h] = [
          at('x') - cx - grow,
          at('y') - cy - grow,
          at('width') + 2 * grow,
          at('height') + 2 * grow,
        ];
        const rounded = Math.min(
          Number(next.getAttribute('rx') ?? next.getAttribute('ry') ?? 0),
          w / 2,
          h / 2,
        );
        // A stroke round a rounded corner is rounded the wider; a square corner stays square (mitred).
        const r = rounded > 0 ? rounded + grow : 0;
        const points: Pt[] = [];
        // The rounded corners, each as a few points along its arc.
        for (const [ox, oy, start] of [
          [x + w - r, y + r, -90],
          [x + w - r, y + h - r, 0],
          [x + r, y + h - r, 90],
          [x + r, y + r, 180],
        ] as const) {
          for (let k = 0; k <= 4; k++) {
            const a = ((start + k * 22.5) * Math.PI) / 180;
            points.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]);
          }
        }
        return convexAround(points) ? { points } : null;
      }
      return null;
    }
    return null;
  }

  /** A stroke's width, opacity, dashes, caps and joins, added to `attrs` (which hold its paint). */
  #strokeDetails(s: CSSStyleDeclaration, attrs: Attrs): void {
    attrs['stroke-width'] = parseLength(s.strokeWidth, 0) ?? s.strokeWidth;
    if (s.strokeOpacity !== '1')
      attrs['stroke-opacity'] = Number(s.strokeOpacity) * Number(attrs['stroke-opacity'] ?? 1);
    if (s.strokeDasharray !== 'none')
      attrs['stroke-dasharray'] = s.strokeDasharray.replace(/px/g, '').replace(/,\s*/g, ' ');
    if (s.strokeDashoffset !== '0px') attrs['stroke-dashoffset'] = parseLength(s.strokeDashoffset, 0) ?? null;
    if (s.strokeLinecap !== 'butt') attrs['stroke-linecap'] = s.strokeLinecap;
    if (s.strokeLinejoin !== 'miter') attrs['stroke-linejoin'] = s.strokeLinejoin;
  }

  /** The radialGradient a fill refers to, if it does. */
  #radialFill(fill: string): Element | null {
    const ref = /^url\("?#([^")]+)"?\)/.exec(fill);
    const def = ref ? this.#doc.getElementById(ref[1] as string) : null;
    return def?.localName === 'radialGradient' ? def : null;
  }

  /** A gradient's stops as the page computes them (their colour may come from the stylesheet). */
  #svgStops(def: Element): Stop[] {
    return [...def.children]
      .filter((c) => c.localName === 'stop')
      .map((stop) => {
        const st = this.#style(stop);
        const colour = parseColour(st.stopColor) ?? { hex: '#000000', alpha: 1 };
        const at = stop.getAttribute('offset') ?? '0';
        const offset = at.endsWith('%') ? Number(at.slice(0, -1)) / 100 : Number(at);
        return {
          offset: Math.max(0, Math.min(1, offset || 0)),
          colour: { hex: colour.hex, alpha: colour.alpha * Number(st.stopOpacity) },
        };
      });
  }

  /**
   * A circle or ellipse filled with a radial gradient (a halo, a group's glow), for PowerPoint and Word: rings of
   * flat colour, in a group with the shape's own transform, opacity and filter.
   */
  #shapeRings(el: SVGElement, s: CSSStyleDeclaration, attrs: Attrs, def: Element, opacity: number): string {
    const name = el.localName;
    const n = (a: string) =>
      typeof attrs[a] === 'number' ? (attrs[a] as number) : attrs[a] ? Number.NaN : 0;
    const cx = n('cx');
    const cy = n('cy');
    const rx = name === 'circle' ? n('r') : n('rx');
    const ry = name === 'circle' ? n('r') : n('ry');
    if ((name !== 'circle' && name !== 'ellipse') || [cx, cy, rx, ry].some(Number.isNaN)) {
      this.approximate(`an SVG ${name} filled with a radial gradient, left out`);
      return '';
    }
    const placed = ['cx', 'cy', 'r', 'fx', 'fy'].some((a) => {
      const v = def.getAttribute(a);
      return v !== null && v !== '50%';
    });
    if (
      placed ||
      def.hasAttribute('gradientTransform') ||
      (def.getAttribute('gradientUnits') ?? 'objectBoundingBox') !== 'objectBoundingBox'
    )
      this.approximate('a radial gradient placed off its shape’s centre, drawn as rings about the centre');
    const stops = this.#svgStops(def);
    if (stops.length === 0) return '';
    // The shape's opacity and the groups' around it are solved into the rings, so that laid on each other they
    // match the glow exactly; the groups then leave the rings' opacity alone (#ring).
    const { rings, exact } = gradientRings(
      stops,
      Math.min(1, fadeEnd(stops) ?? 1),
      Number(s.fillOpacity) * opacity * this.#fade,
    );
    if (!exact) this.approximate('a radial gradient that changes colour, drawn as rings of its colours');
    // In a faded group, cut out the opaque glyph drawn over the glow: each carries the group's opacity, and the
    // glow must not show through it.
    const cover = this.#fade * opacity < 1 && Math.abs(rx - ry) < 0.005 ? this.#coverOver(el, cx, cy) : null;
    const body = rings.map((ring) => this.#ring(cx, cy, rx * ring.r, ry * ring.r, ring, cover)).join('');
    let outline = '';
    if (s.stroke !== 'none') {
      // Its outline, apart: stroked as any shape is (its opacity, dashes, caps and joins too).
      const line: Attrs = {
        ...Object.fromEntries(Object.entries(attrs).filter(([a]) => a !== 'transform')),
        fill: 'none',
        ...this.#svgPaint(s.stroke, 'stroke'),
      };
      this.#strokeDetails(s, line);
      outline = tag(name, line);
    }
    const filter = this.#filter(s.filter, null, { x: -100000, y: -100000, w: 200000, h: 200000 });
    const drawn = body + fadeShapes(outline, opacity);
    if (!drawn) return '';
    return this.#faded(1, drawn, { transform: attrs.transform, filter });
  }

  /** The gradients a copied SVG defines, with their colours written out and their ids renamed. */
  #svgDefs(defs: SVGElement): string {
    const out: string[] = [];
    for (const def of defs.children) {
      const name = def.localName;
      // For PowerPoint and Word, the shapes they fill are drawn as rings instead.
      if (name === 'radialGradient' && this.#office) continue;
      if (name !== 'radialGradient' && name !== 'linearGradient') {
        this.approximate(`an SVG ${name} definition, left out`);
        continue;
      }
      const attrs: Attrs = { id: this.#id(def.id) };
      for (const a of [
        'cx',
        'cy',
        'r',
        'fx',
        'fy',
        'x1',
        'y1',
        'x2',
        'y2',
        'gradientUnits',
        'gradientTransform',
        'spreadMethod',
      ]) {
        const v = def.getAttribute(a);
        if (v !== null) attrs[a] = v;
      }
      const stops = [...def.children]
        .filter((c) => c.localName === 'stop')
        .map((stop) => {
          const st = this.#style(stop);
          const colour = parseColour(st.stopColor) ?? { hex: '#000000', alpha: 1 };
          const alpha = colour.alpha * Number(st.stopOpacity);
          return tag('stop', {
            offset: stop.getAttribute('offset'),
            'stop-color': colour.hex,
            'stop-opacity': alpha < 1 ? alpha : null,
          });
        })
        .join('');
      out.push(tag(name, attrs, stops));
    }
    return out.length ? `<defs>${out.join('')}</defs>` : '';
  }
}

/** True for a convex polygon with the centre (0, 0) inside it, its points in order either way round. */
function convexAround(points: Pt[]): boolean {
  const turns = points.map(([x1, y1], k) => {
    const [x2, y2] = points[(k + 1) % points.length] as Pt;
    return x1 * y2 - x2 * y1;
  });
  return turns.every((t) => t >= -1e-9) || turns.every((t) => t <= 1e-9);
}

/** The attributes that give each SVG shape its geometry. */
const GEOMETRY: Record<string, string[]> = {
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
  text: ['x', 'y', 'dx', 'dy'],
  tspan: ['x', 'y', 'dx', 'dy'],
};
const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan']);
const KNOWN = new Set([...SHAPES, 'g', 'svg']);

/**
 * How the page smooths a text's letters, where it says (the stage asks for "antialiased", which a Mac draws
 * thinner than its default): written on the text, so a browser draws the drawing's letters as the slide's.
 */
function smoothing(s: CSSStyleDeclaration): string | null {
  const value = s.getPropertyValue('-webkit-font-smoothing');
  return value && value !== 'auto' ? `-webkit-font-smoothing:${value}` : null;
}

/** The stage (the element whose transform centres it), which never counts as a turned box. */
function stageRoot(el: Element): Element | null {
  return el.closest('.lw-stage');
}

/**
 * SVG filter primitives for a CSS filter; lengths times `scale` (the drawing's units per page pixel). A
 * filter's drop-shadow() and blur() give the blur's standard deviation itself (Filter Effects 1), unlike a box
 * or text shadow, whose blur is twice it.
 */
function filterPrimitives(parts: FilterPart[], scale = 1): string {
  const out: string[] = [];
  let input = 'SourceGraphic';
  parts.forEach((part, k) => {
    const result = `f${k}`;
    if (part.kind === 'brightness') {
      const slope = num(part.amount);
      out.push(
        tag(
          'feComponentTransfer',
          { in: input, result },
          ['R', 'G', 'B'].map((c) => tag(`feFunc${c}`, { type: 'linear', slope })).join(''),
        ),
      );
    } else if (part.kind === 'blur') {
      out.push(tag('feGaussianBlur', { in: input, stdDeviation: part.radius * scale, result }));
    } else {
      const sh = part.shadow;
      out.push(
        tag('feDropShadow', {
          in: input,
          dx: sh.x * scale,
          dy: sh.y * scale,
          stdDeviation: sh.blur * scale,
          'flood-color': sh.colour.hex,
          'flood-opacity': sh.colour.alpha < 1 ? sh.colour.alpha : null,
          result,
        }),
      );
    }
    input = result;
  });
  return out.join('');
}

/** The stage (a `.lw-viewport` laid out by the page) as an SVG drawing. */
export function drawSvg(viewport: Element, options: SvgOptions): SvgDrawing {
  const flattener = new Flattener(viewport, options.office === true);
  const drawn = flattener.html(viewport);
  // The rings' marks for fadeShapes are no part of the drawing.
  const body = options.office ? drawn.replaceAll(` ${SOLVED}="1"`, '') : drawn;
  if (options.office) flattener.notes.add(NOTES.office);
  const crop = options.crop ?? { x: 0, y: 0, w: STAGE_SIZE.w, h: STAGE_SIZE.h };
  const faces = selectFontFaces(options.styles, flattener.chars);
  const style = faces ? `<style>${escapeText(faces)}</style>` : '';
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(crop.w)}" height="${num(crop.h)}" viewBox="${num(crop.x)} ${num(crop.y)} ${num(crop.w)} ${num(crop.h)}">`,
    tag('title', {}, escapeText(options.title)),
    tag('metadata', {}, 'Made with Loopweft, https://github.com/TashiikiD/loopweft'),
    style,
    flattener.defs.toString(),
    // The stage's edge: nothing outside 1920 × 1080 shows, as on the screen.
    tag('clipPath', { id: 'stage' }, tag('rect', { x: 0, y: 0, width: STAGE_SIZE.w, height: STAGE_SIZE.h })),
    tag('g', { 'clip-path': 'url(#stage)' }, body),
    '</svg>\n',
  ].join('');
  const order = [NOTES.text, NOTES.filters, NOTES.masks, NOTES.office, NOTES.shading];
  const notes = [...flattener.notes].sort((a, b) => {
    const ia = order.indexOf(a as (typeof order)[number]);
    const ib = order.indexOf(b as (typeof order)[number]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : a > b ? 1 : 0);
  });
  return { svg, notes };
}
