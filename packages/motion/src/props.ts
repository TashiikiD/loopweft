// How a tween reads and writes a target's properties. A target is a plain object (its numeric fields)
// or a DOM element:
//   x, y, scale, scaleX, scaleY, rotate   the element's transform (owned by the engine once tweened):
//                                         CSS transform on HTML, the transform attribute on SVG
//   attr: { r: 10 }                       attributes
//   anything else                         inline style (opacity, strokeDashoffset, transformOrigin…)
// Numbers are written rounded to 4 decimals, so the DOM holds the same text on every run.

export type Value = number | string;
/** Properties to animate or set; `attr` holds attributes. */
export type Props = Record<string, Value | Record<string, Value>>;

/** One animatable property of one target. */
export interface Channel {
  target: object;
  /** e.g. `opacity`, `attr.r`, `x`. */
  key: string;
  read(): number;
  write(value: Value): void;
}

const TRANSFORM_KEYS = new Set(['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate']);
/** Style properties written with px (others, such as opacity, are unitless). */
const LENGTH_STYLES = new Set([
  'left',
  'top',
  'right',
  'bottom',
  'width',
  'height',
  'fontSize',
  'letterSpacing',
  'strokeWidth',
  'strokeDashoffset',
]);

interface TransformState {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
}

const transforms = new WeakMap<Element, TransformState>();

export const round = (v: number): number => Math.round(v * 1e4) / 1e4;
const text = (v: Value): string => (typeof v === 'number' ? String(round(v)) : v);

const isElement = (target: object): target is Element =>
  typeof Element !== 'undefined' && target instanceof Element;
const isSvg = (el: Element): boolean => el.namespaceURI === 'http://www.w3.org/2000/svg';

function transformOf(el: Element): TransformState {
  let state = transforms.get(el);
  if (!state) {
    state = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0 };
    transforms.set(el, state);
  }
  return state;
}

function writeTransform(el: Element, t: TransformState): void {
  const parts: string[] = [];
  if (isSvg(el)) {
    if (t.x || t.y) parts.push(`translate(${round(t.x)} ${round(t.y)})`);
    if (t.rotate) parts.push(`rotate(${round(t.rotate)})`);
    if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(`scale(${round(t.scaleX)} ${round(t.scaleY)})`);
    if (parts.length) el.setAttribute('transform', parts.join(' '));
    else el.removeAttribute('transform');
  } else {
    if (t.x || t.y) parts.push(`translate(${round(t.x)}px, ${round(t.y)}px)`);
    if (t.rotate) parts.push(`rotate(${round(t.rotate)}deg)`);
    if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(`scale(${round(t.scaleX)}, ${round(t.scaleY)})`);
    (el as HTMLElement).style.transform = parts.join(' ');
  }
}

/** The style value as a number: inline first, then computed, then the property's natural default. */
function readStyle(el: Element, prop: string): number {
  const style = (el as HTMLElement).style as unknown as Record<string, string>;
  let raw = style[prop] ?? '';
  if (raw === '' && typeof getComputedStyle === 'function') {
    raw = (getComputedStyle(el) as unknown as Record<string, string>)[prop] ?? '';
  }
  const n = Number.parseFloat(raw);
  if (Number.isFinite(n)) return n;
  return prop === 'opacity' ? 1 : 0;
}

function elementChannel(el: Element, key: string): Channel {
  if (TRANSFORM_KEYS.has(key)) {
    return {
      target: el,
      key,
      read: () => {
        const t = transformOf(el);
        return key === 'scale' ? t.scaleX : t[key as keyof TransformState];
      },
      write: (value) => {
        const t = transformOf(el);
        const v = typeof value === 'number' ? value : Number.parseFloat(value);
        if (key === 'scale') {
          t.scaleX = v;
          t.scaleY = v;
        } else t[key as keyof TransformState] = v;
        writeTransform(el, t);
      },
    };
  }
  if (key.startsWith('attr.')) {
    const name = key.slice(5);
    return {
      target: el,
      key,
      read: () => Number.parseFloat(el.getAttribute(name) ?? '') || 0,
      write: (value) => el.setAttribute(name, text(value)),
    };
  }
  return {
    target: el,
    key,
    read: () => readStyle(el, key),
    write: (value) => {
      const style = (el as HTMLElement).style as unknown as Record<string, string>;
      style[key] = typeof value === 'number' && LENGTH_STYLES.has(key) ? `${round(value)}px` : text(value);
    },
  };
}

function objectChannel(target: object, key: string): Channel {
  const record = target as Record<string, unknown>;
  return {
    target,
    key,
    read: () => {
      const v = record[key];
      return typeof v === 'number' ? v : Number.parseFloat(String(v ?? 0)) || 0;
    },
    write: (value) => {
      record[key] = value;
    },
  };
}

/** A channel for each property, with the value it should reach (attributes flattened to `attr.<name>`). */
export function channels(target: object, props: Props): { channel: Channel; value: Value }[] {
  const out: { channel: Channel; value: Value }[] = [];
  const make = (key: string) =>
    isElement(target) ? elementChannel(target, key) : objectChannel(target, key);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'attr' && typeof value === 'object') {
      for (const [name, v] of Object.entries(value)) out.push({ channel: make(`attr.${name}`), value: v });
    } else out.push({ channel: make(key), value: value as Value });
  }
  return out;
}
