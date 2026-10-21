// The SVG drawing's parts that need no browser: reading the computed CSS values the stage uses, writing the
// drawing's text, and choosing the fonts it carries. (The drawing itself is checked against the PNG of every
// step in a browser: apps/studio/e2e/export-svg.spec.ts.)
import { describe, expect, it } from 'vitest';
import {
  parseColour,
  parseFilter,
  parseGradient,
  parseLength,
  parseShadows,
  splitTop,
} from '../src/svg/css.ts';
import { firstFamily, selectFontFaces, unicodeRanges } from '../src/svg/fonts.ts';
import { Defs, num, tag } from '../src/svg/writer.ts';

describe('reading computed CSS', () => {
  it('reads the colours the browser writes', () => {
    expect(parseColour('rgb(112, 226, 197)')).toEqual({ hex: '#70e2c5', alpha: 1 });
    expect(parseColour('rgba(0, 0, 0, 0.45)')).toEqual({ hex: '#000000', alpha: 0.45 });
    expect(parseColour('color(srgb 0.439216 0.886275 0.772549 / 0.07)')).toEqual({
      hex: '#70e2c5',
      alpha: 0.07,
    });
    expect(parseColour('color(srgb 1 0 0)')).toEqual({ hex: '#ff0000', alpha: 1 });
    expect(parseColour('transparent')).toEqual({ hex: '#000000', alpha: 0 });
    expect(parseColour('oklch(0.7 0.1 200)')).toBeNull();
  });

  it('splits at top-level commas and reads lengths, calc() too', () => {
    expect(splitTop('a(1, 2), b, c(d(3, 4))')).toEqual(['a(1, 2)', 'b', 'c(d(3, 4))']);
    expect(parseLength('48px', 0)).toBe(48);
    expect(parseLength('25%', 200)).toBe(50);
    expect(parseLength('calc(100% - 48px)', 300)).toBe(252);
    expect(parseLength('2em', 0)).toBeNull();
  });

  it('reads linear gradients as a line across the box, stops spread as CSS spreads them', () => {
    const g = parseGradient(
      'linear-gradient(90deg, rgb(112, 226, 197), color(srgb 0.439216 0.886274 0.772549 / 0.2))',
      10,
      20,
      132,
      3,
    );
    expect(g).toMatchObject({ kind: 'linear', x1: 10, x2: 142 });
    expect(g?.kind === 'linear' && [g.y1, g.y2].map((v) => Number(v.toFixed(6)))).toEqual([21.5, 21.5]);
    expect(g?.stops.map((s) => s.offset)).toEqual([0, 1]);
    // The default direction is downwards, and px stops are fractions of the line.
    const mask = parseGradient(
      'linear-gradient(rgba(0, 0, 0, 0) 0px, rgb(0, 0, 0) 48px, rgb(0, 0, 0) calc(100% - 48px), rgba(0, 0, 0, 0) 100%)',
      0,
      0,
      100,
      480,
    );
    expect(
      mask?.kind === 'linear' && [mask.x1, mask.y1, mask.x2, mask.y2].map((v) => Number(v.toFixed(6))),
    ).toEqual([50, 0, 50, 480]);
    expect(mask?.stops.map((s) => s.offset)).toEqual([0, 0.1, 0.9, 1]);
    const spread = parseGradient(
      'linear-gradient(180deg, red 0%, rgb(0, 0, 0), rgb(1, 1, 1), blue 90%)',
      0,
      0,
      10,
      10,
    );
    expect(spread).toBeNull(); // "red" and "blue" are not colours as the browser computes them
    const even = parseGradient(
      'linear-gradient(rgb(0, 0, 0) 0%, rgb(1, 1, 1), rgb(2, 2, 2), rgb(3, 3, 3) 90%)',
      0,
      0,
      10,
      10,
    );
    expect(even?.stops.map((s) => Number(s.offset.toFixed(3)))).toEqual([0, 0.3, 0.6, 0.9]);
  });

  it('reads radial gradients: sizes, percentages, closest-side and the default corner', () => {
    const sized = parseGradient(
      'radial-gradient(1200px 800px at 50% 46%, rgba(0, 0, 0, 0.07), rgba(0, 0, 0, 0) 70%)',
      0,
      0,
      1920,
      1080,
    );
    expect(sized).toMatchObject({ kind: 'radial', cx: 960, cy: 496.8, rx: 1200, ry: 800 });
    expect(sized?.stops.map((s) => s.offset)).toEqual([0, 0.7]);
    const percent = parseGradient(
      'radial-gradient(62% 78% at 24% 52%, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0) 100%)',
      0,
      0,
      1000,
      500,
    );
    expect(percent).toMatchObject({ cx: 240, cy: 260, rx: 620, ry: 390 });
    const side = parseGradient(
      'radial-gradient(closest-side, rgb(0, 0, 0), rgba(0, 0, 0, 0))',
      0,
      0,
      400,
      200,
    );
    expect(side).toMatchObject({ cx: 200, cy: 100, rx: 200, ry: 100 });
    const corner = parseGradient('radial-gradient(rgb(0, 0, 0), rgba(0, 0, 0, 0))', 0, 0, 400, 200);
    expect(corner?.kind === 'radial' && Number(corner.rx.toFixed(2))).toBe(
      Number((200 * Math.SQRT2).toFixed(2)),
    );
    expect(parseGradient('conic-gradient(rgb(0, 0, 0), rgb(1, 1, 1))', 0, 0, 1, 1)).toBeNull();
    expect(
      parseGradient('repeating-linear-gradient(rgb(0, 0, 0), rgb(1, 1, 1) 10px)', 0, 0, 1, 1),
    ).toBeNull();
  });

  it('reads shadows and filters', () => {
    expect(
      parseShadows(
        'color(srgb 0.439216 0.886275 0.772549 / 0.28) 0px 0px 0px 1px, rgba(0, 0, 0, 0.4) 0px 12px 34px 0px',
      ),
    ).toEqual([
      { colour: { hex: '#70e2c5', alpha: 0.28 }, x: 0, y: 0, blur: 0, spread: 1, inset: false },
      { colour: { hex: '#000000', alpha: 0.4 }, x: 0, y: 12, blur: 34, spread: 0, inset: false },
    ]);
    expect(parseShadows('none')).toEqual([]);
    expect(parseShadows('rgb(7, 27, 22) 0px 0px 10px')).toEqual([
      { colour: { hex: '#071b16', alpha: 1 }, x: 0, y: 0, blur: 10, spread: 0, inset: false },
    ]);
    expect(parseFilter('drop-shadow(rgb(135, 201, 244) 0px 0px 5px)')).toEqual([
      {
        kind: 'drop-shadow',
        shadow: { colour: { hex: '#87c9f4', alpha: 1 }, x: 0, y: 0, blur: 5, spread: 0, inset: false },
      },
    ]);
    expect(parseFilter('brightness(1.15)')).toEqual([{ kind: 'brightness', amount: 1.15 }]);
    expect(parseFilter('blur(4px) brightness(50%)')).toEqual([
      { kind: 'blur', radius: 4 },
      { kind: 'brightness', amount: 0.5 },
    ]);
    expect(parseFilter('sepia(1)')).toBeNull();
  });
});

describe('writing the drawing', () => {
  it('writes numbers with at most two decimals, and never "-0"', () => {
    expect([num(1), num(1.006), num(-0.001), num(2.5), num(1e-7), num(1234.5678)]).toEqual([
      '1',
      '1.01',
      '0',
      '2.5',
      '0',
      '1234.57',
    ]);
  });

  it('writes elements with their attributes in order, leaving out the empty ones', () => {
    expect(tag('rect', { x: 1.234, y: null, fill: '#fff', title: 'a "b" <c>' })).toBe(
      '<rect x="1.23" fill="#fff" title="a &quot;b&quot; &lt;c&gt;"/>',
    );
    expect(tag('g', { opacity: 0.5 }, '<path/>')).toBe('<g opacity="0.5"><path/></g>');
  });

  it('writes each definition once, its id numbered in the order it was first needed', () => {
    const defs = new Defs();
    const a = defs.id('grad A', (id) => `<a id="${id}"/>`);
    const b = defs.id('grad B', (id) => `<b id="${id}"/>`);
    expect(defs.id('grad A', () => 'never')).toBe(a);
    const c = defs.unique((id) => `<c id="${id}"/>`);
    expect([a, b, c]).toEqual(['d1', 'd2', 'd3']);
    expect(String(defs)).toBe('<defs><a id="d1"/><b id="d2"/><c id="d3"/></defs>');
    expect(String(new Defs())).toBe('');
  });
});

describe('the fonts a drawing carries', () => {
  const styles = [
    '@font-face { font-family: "Inter Variable"; src: url("data:font/woff2;base64,AAA") format("woff2"); unicode-range: U+0000-00FF, U+0131; }',
    '@font-face { font-family: "Inter Variable"; src: url("data:font/woff2;base64,BBB") format("woff2"); unicode-range: U+0400-045F; }',
    '@font-face { font-family: "Fraunces Variable"; src: url("data:font/woff2;base64,CCC") format("woff2"); unicode-range: U+0000-00FF; }',
    '.lw-stage { color: red; }',
  ].join('\n');

  it('reads unicode ranges, wildcards too', () => {
    expect(unicodeRanges('U+0000-00FF, U+0131, U+4??')).toEqual([
      [0, 255],
      [0x131, 0x131],
      [0x400, 0x4ff],
    ]);
    expect(unicodeRanges(null)).toEqual([[0, 0x10ffff]]);
    expect(firstFamily('"Inter Variable", Inter, sans-serif')).toBe('Inter Variable');
  });

  it('carries only the files of the families drawn, for the characters drawn', () => {
    const latin = selectFontFaces(styles, new Map([['"Inter Variable", sans-serif', new Set(['A', 'b'])]]));
    expect(latin).toContain('AAA');
    expect(latin).not.toContain('BBB');
    expect(latin).not.toContain('CCC');
    const both = selectFontFaces(
      styles,
      new Map([
        ['"Inter Variable", sans-serif', new Set(['Ж'])],
        ['"Fraunces Variable", serif', new Set(['x'])],
      ]),
    );
    expect(both).not.toContain('AAA');
    expect(both).toContain('BBB');
    expect(both).toContain('CCC');
    expect(selectFontFaces(styles, new Map())).toBe('');
  });
});
