// Readers for the CSS values the browser computes for the stage, as the SVG drawing (flatten.ts) needs them:
// colours, gradients, shadows, filters and lengths. They read the browser's own computed form (colours as
// rgb() or color(srgb …), lengths in px), not what a stylesheet may say. A value they cannot read is reported,
// never guessed.

/** A colour as SVG writes it: #rrggbb, with its alpha apart (SVG editors read opacity attributes best). */
export interface Colour {
  hex: string;
  alpha: number;
}

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');

/** Reads a computed colour; null if it is not one the browser writes (rgb, rgba, color(srgb …)). */
export function parseColour(text: string): Colour | null {
  const t = text.trim();
  let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(t);
  if (m) {
    return {
      hex: `#${hex2(Number(m[1]))}${hex2(Number(m[2]))}${hex2(Number(m[3]))}`,
      alpha: m[4] === undefined ? 1 : alphaOf(m[4]),
    };
  }
  m = /^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(t);
  if (m) {
    return {
      hex: `#${hex2(Number(m[1]) * 255)}${hex2(Number(m[2]) * 255)}${hex2(Number(m[3]) * 255)}`,
      alpha: m[4] === undefined ? 1 : alphaOf(m[4]),
    };
  }
  if (t === 'transparent') return { hex: '#000000', alpha: 0 };
  return null;
}

const alphaOf = (text: string) => (text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text));

/** Splits a value at its top-level commas (not those inside brackets). */
export function splitTop(text: string, separator = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

/** Splits at top-level spaces. */
const words = (text: string) => splitTop(text.replace(/\s+/g, ' ').trim(), ' ');

/** A length in px against `basis` (for %); calc(a% ± b px) too. Null if it is something else. */
export function parseLength(text: string, basis: number): number | null {
  const t = text.trim();
  let m = /^(-?[\d.e]+)px$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(-?[\d.e]+)%$/.exec(t);
  if (m) return (Number(m[1]) / 100) * basis;
  if (t === '0') return 0;
  m = /^calc\((.*)\)$/.exec(t);
  if (m) {
    const terms = (m[1] as string).replace(/\s([+-])\s/g, ' $1').split(/\s+/);
    let sum = 0;
    for (const term of terms) {
      const value = parseLength(term.replace(/^\+/, ''), basis);
      if (value === null) return null;
      sum += value;
    }
    return sum;
  }
  return null;
}

export interface Stop {
  /** Along the gradient line or ray, from 0 to 1 (may be outside). */
  offset: number;
  colour: Colour;
}

export type Gradient =
  | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: Stop[] }
  | { kind: 'radial'; cx: number; cy: number; rx: number; ry: number; stops: Stop[] };

/**
 * Colour stops with their positions as fractions of `length` px; stops without one are spread evenly between
 * their neighbours, as CSS does. Null if a stop cannot be read.
 */
function readStops(parts: string[], length: number): Stop[] | null {
  const raw: { colour: Colour; at: number | null }[] = [];
  for (const part of parts) {
    const w = words(part);
    const colour = parseColour(w[0] ?? '');
    if (!colour) return null;
    if (w.length === 1) raw.push({ colour, at: null });
    for (const position of w.slice(1)) {
      const px = parseLength(position, length);
      if (px === null) return null;
      raw.push({ colour, at: length > 0 ? px / length : 0 });
    }
  }
  if (raw.length === 0) return null;
  const first = raw[0] as { at: number | null };
  const last = raw[raw.length - 1] as { at: number | null };
  if (first.at === null) first.at = 0;
  if (last.at === null) last.at = 1;
  // A stop placed before an earlier one is moved up to it (CSS's rule).
  let floor = Number.NEGATIVE_INFINITY;
  for (const stop of raw) {
    if (stop.at !== null) {
      stop.at = Math.max(stop.at, floor);
      floor = stop.at;
    }
  }
  for (let i = 0; i < raw.length; i++) {
    if (raw[i]?.at !== null) continue;
    let j = i;
    while (raw[j]?.at === null) j++;
    const a = raw[i - 1]?.at as number;
    const b = raw[j]?.at as number;
    for (let k = i; k < j; k++)
      (raw[k] as { at: number | null }).at = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  return raw.map((s) => ({ offset: s.at as number, colour: s.colour }));
}

/**
 * A CSS gradient (as computed) for a box at (x, y) of w × h, in the page's pixels: a linear one as a line
 * between two points, a radial one as an ellipse. Null if it is a kind this drawing does not read (repeating,
 * conic, a shape it does not know).
 */
export function parseGradient(text: string, x: number, y: number, w: number, h: number): Gradient | null {
  const linear = /^linear-gradient\((.*)\)$/s.exec(text.trim());
  if (linear) {
    const parts = splitTop(linear[1] as string);
    let angle = 180;
    const head = parts[0] ?? '';
    const deg = /^(-?[\d.]+)deg$/.exec(head);
    const turn = /^to (top|bottom|left|right)$/.exec(head);
    if (deg) {
      angle = Number(deg[1]);
      parts.shift();
    } else if (turn) {
      angle = { top: 0, right: 90, bottom: 180, left: 270 }[turn[1] as 'top'];
      parts.shift();
    } else if (/^to /.test(head)) return null;
    const a = (angle * Math.PI) / 180;
    const length = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
    const cx = x + w / 2;
    const cy = y + h / 2;
    const dx = (Math.sin(a) * length) / 2;
    const dy = (-Math.cos(a) * length) / 2;
    const stops = readStops(parts, length);
    if (!stops) return null;
    return { kind: 'linear', x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy, stops };
  }
  const radial = /^radial-gradient\((.*)\)$/s.exec(text.trim());
  if (!radial) return null;
  const parts = splitTop(radial[1] as string);
  const head = parts[0] ?? '';
  let shape = '';
  if (!parseColour(words(head)[0] ?? '')) {
    shape = head;
    parts.shift();
  }
  const [sizePart = '', atPart = ''] = shape.split(/\bat\b/).map((s) => s.trim());
  const at = words(atPart || '50% 50%');
  const cx = x + (parseLength(at[0] ?? '50%', w) ?? Number.NaN);
  const cy = y + (parseLength(at[1] ?? at[0] ?? '50%', h) ?? Number.NaN);
  if (Number.isNaN(cx) || Number.isNaN(cy)) return null;
  const size = words(sizePart.replace(/\b(ellipse|circle)\b/g, '').trim());
  const left = cx - x;
  const right = x + w - cx;
  const top = cy - y;
  const bottom = y + h - cy;
  let rx: number;
  let ry: number;
  const circle = /\bcircle\b/.test(sizePart);
  if (size.length === 2 && size[0] && size[1] && !/-/.test(size[0])) {
    const a = parseLength(size[0], w);
    const b = parseLength(size[1], h);
    if (a === null || b === null) return null;
    rx = a;
    ry = b;
  } else if (size.length === 1 && size[0] && parseLength(size[0], w) !== null) {
    rx = parseLength(size[0], w) as number;
    ry = rx;
  } else {
    const keyword = size[0] || 'farthest-corner';
    const sideX = keyword.includes('closest') ? Math.min(left, right) : Math.max(left, right);
    const sideY = keyword.includes('closest') ? Math.min(top, bottom) : Math.max(top, bottom);
    if (keyword.endsWith('-side')) {
      rx = sideX;
      ry = sideY;
    } else if (keyword.endsWith('-corner')) {
      // An ellipse with the sides' proportions that passes through the corner.
      if (circle) {
        rx = Math.hypot(sideX, sideY);
        ry = rx;
      } else {
        rx = sideX * Math.SQRT2;
        ry = sideY * Math.SQRT2;
      }
    } else return null;
    if (circle && keyword.endsWith('-side')) {
      rx = keyword.includes('closest') ? Math.min(sideX, sideY) : Math.max(sideX, sideY);
      ry = rx;
    }
  }
  const stops = readStops(parts, rx);
  if (!stops) return null;
  return { kind: 'radial', cx, cy, rx, ry, stops };
}

export interface Shadow {
  colour: Colour;
  x: number;
  y: number;
  blur: number;
  spread: number;
  inset: boolean;
}

/** A computed box-shadow or text-shadow list; null if a part cannot be read. */
export function parseShadows(text: string): Shadow[] | null {
  if (text.trim() === 'none') return [];
  const shadows: Shadow[] = [];
  for (const part of splitTop(text)) {
    const w = words(part);
    let colour: Colour | null = null;
    const lengths: number[] = [];
    let inset = false;
    for (const word of w) {
      if (word === 'inset') inset = true;
      else if (/^-?[\d.]+px$|^0$/.test(word)) lengths.push(parseLength(word, 0) as number);
      else colour = parseColour(word);
    }
    if (!colour || lengths.length < 2) return null;
    shadows.push({
      colour,
      x: lengths[0] as number,
      y: lengths[1] as number,
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      inset,
    });
  }
  return shadows;
}

export type FilterPart =
  | { kind: 'drop-shadow'; shadow: Shadow }
  | { kind: 'brightness'; amount: number }
  | { kind: 'blur'; radius: number };

/** A computed filter list; null if a part is one this drawing does not read. */
export function parseFilter(text: string): FilterPart[] | null {
  if (text.trim() === 'none') return [];
  const parts: FilterPart[] = [];
  for (const fn of splitTop(text, ' ')) {
    const m = /^([a-z-]+)\((.*)\)$/s.exec(fn);
    if (!m) return null;
    const [, name, arg = ''] = m;
    if (name === 'drop-shadow') {
      const shadow = parseShadows(arg)?.[0];
      if (!shadow) return null;
      parts.push({ kind: 'drop-shadow', shadow });
    } else if (name === 'brightness') {
      parts.push({
        kind: 'brightness',
        amount: arg.endsWith('%') ? Number(arg.slice(0, -1)) / 100 : Number(arg),
      });
    } else if (name === 'blur') {
      const radius = parseLength(arg, 0);
      if (radius === null) return null;
      parts.push({ kind: 'blur', radius });
    } else return null;
  }
  return parts;
}
