// Source: DataViz packages/render-kit/src/color.ts @ efcdbe2 (TashiikiD/DataViz, private), copied for Loopweft
// unchanged.
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses `#rgb` or `#rrggbb`. */
export function parseHex(color: string): Rgb {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!match) throw new Error(`Not a hex colour: ${color}`);
  let hex = match[1] as string;
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export const toHex = ({ r, g, b }: Rgb): string =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** Linear blend in sRGB: `t = 0` gives `a`, `t = 1` gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Lighter version of `color`: `amount` 0 = unchanged, 1 = white. */
export const tint = (color: string, amount: number): string => mix(color, '#ffffff', amount);

/** WCAG 2 relative luminance. */
export function relativeLuminance(color: string): number {
  const { r, g, b } = parseHex(color);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2 contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Whichever of `dark` / `light` contrasts more with `background`. */
export const readableTextColor = (background: string, dark = '#1a1a1a', light = '#ffffff'): string =>
  contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;

/** The grey a colour prints as in black and white (luminance-preserving). */
export function toGrayscale(color: string): string {
  const { r, g, b } = parseHex(color);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return toHex({ r: y, g: y, b: y });
}
