// Source: DataViz packages/render-kit/src/cvd.ts @ efcdbe2 (TashiikiD/DataViz, private), copied for Loopweft
// unchanged.
//
// Colour-vision checks for categorical colours: how they look to people with the three complete forms
// of colour-vision deficiency and in greyscale print, and which pairs become hard to tell apart.
//
// Simulation: Machado, Oliveira & Fernandes (2009), "A physiologically-based model for simulation of
// color vision deficiency", severity 1.0 matrices, applied to linear sRGB. Greyscale: relative luminance.
// Difference: CIEDE2000 (Sharma, Wu & Dalal 2005) on CIELAB (D65).

export type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'greyscale';
export const VISIONS: readonly Vision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia', 'greyscale'];

/** Pairs closer than this (CIEDE2000) are reported as hard to tell apart. */
export const DISTINCT_DELTA_E = 10;

type Rgb = [number, number, number];
type Matrix = [Rgb, Rgb, Rgb];

const MACHADO: Record<'protanopia' | 'deuteranopia' | 'tritanopia', Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));

function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Expected a #rrggbb colour, got "${hex}".`);
  return [1, 2, 3].map((i) => Number.parseInt(match[i] as string, 16) / 255) as Rgb;
}

const toHex = (rgb: Rgb): string =>
  `#${rgb
    .map((c) =>
      Math.round(clamp01(c) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

/** How a colour looks under a vision condition, as #RRGGBB. */
export function simulateVision(hex: string, vision: Vision): string {
  const rgb = parseHex(hex);
  if (vision === 'normal') return toHex(rgb);
  const linear = rgb.map(toLinear) as Rgb;
  if (vision === 'greyscale') {
    const y = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    const grey = toGamma(clamp01(y));
    return toHex([grey, grey, grey]);
  }
  const m = MACHADO[vision];
  const out = m.map((row) => toGamma(clamp01(row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])));
  return toHex(out as Rgb);
}

/** CIELAB (D65) of an sRGB colour. */
export function hexToLab(hex: string): Rgb {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** CIEDE2000 colour difference of two CIELAB colours. */
export function deltaE2000(lab1: readonly number[], lab2: readonly number[]): number {
  const [l1, a1, b1] = lab1 as Rgb;
  const [l2, a2, b2] = lab2 as Rgb;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));
  const a1p = (1 + g) * a1;
  const a2p = (1 + g) * a2;
  const c1p = Math.hypot(a1p, b1);
  const c2p = Math.hypot(a2p, b2);
  const hue = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360);
  const h1p = hue(a1p, b1);
  const h2p = hue(a2p, b2);

  const dLp = l2 - l1;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2));

  const lBarP = (l1 + l2) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) / 2;
    else hBarP = (h1p + h2p - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos(rad(hBarP - 30)) +
    0.24 * Math.cos(rad(2 * hBarP)) +
    0.32 * Math.cos(rad(3 * hBarP + 6)) -
    0.2 * Math.cos(rad(4 * hBarP - 63));
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rc = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7));
  const sl = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;
  return Math.sqrt((dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh));
}

/** CIEDE2000 difference of two #rrggbb colours. */
export const colorDifference = (a: string, b: string): number => deltaE2000(hexToLab(a), hexToLab(b));

export interface CheckedColor {
  /** What the colour stands for (a category value, a palette slot). */
  key: string;
  label: string;
  /** Its colour as the palette or vocabulary gives it. */
  color: string;
  /**
   * Every colour its marks are drawn in, as drawn (e.g. a tinted fill, then a border), in the same order
   * for every item checked together. Default: `[color]`.
   */
  drawn?: readonly string[];
  /** Line pattern drawn with it ('' = solid); a different pattern keeps two categories apart. */
  dash?: string;
  /** A glyph always drawn with it (e.g. a link sign); a different glyph keeps two categories apart. */
  glyph?: string;
}

export interface ColorCollision {
  a: string;
  b: string;
  /**
   * CIEDE2000 between the simulated colours, cut to one decimal (so it always reads below the threshold):
   * for marks drawn in several colours, the largest difference among them.
   */
  deltaE: number;
}

export interface VisionCheck {
  vision: Vision;
  /** Each item as it looks under this condition, in input order: its colour, and every colour drawn. */
  colors: { key: string; color: string; drawn: string[] }[];
  /** Pairs whose drawn colours are all closer than the threshold, and that no line pattern or glyph tells apart. */
  collisions: ColorCollision[];
}

/**
 * Simulates every condition on a set of categories and names the pairs that become hard to tell apart:
 * every colour their marks are drawn in is closer than the threshold, and no pattern or glyph differs.
 */
export function checkColors(items: readonly CheckedColor[], threshold = DISTINCT_DELTA_E): VisionCheck[] {
  const drawnOf = (item: CheckedColor) => (item.drawn?.length ? item.drawn : [item.color]);
  return VISIONS.map((vision) => {
    const simulated = items.map((item) => ({
      key: item.key,
      color: simulateVision(item.color, vision),
      drawn: drawnOf(item).map((c) => simulateVision(c, vision)),
    }));
    const labs = simulated.map((s) => s.drawn.map(hexToLab));
    const collisions: ColorCollision[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if ((items[i]?.dash ?? '') !== (items[j]?.dash ?? '')) continue;
        if ((items[i]?.glyph ?? '') !== (items[j]?.glyph ?? '')) continue;
        const a = labs[i] as Rgb[];
        const b = labs[j] as Rgb[];
        const cues = Math.min(a.length, b.length);
        let largest = 0;
        for (let k = 0; k < cues && largest < threshold; k++) {
          largest = Math.max(largest, deltaE2000(a[k] as Rgb, b[k] as Rgb));
        }
        if (largest < threshold) {
          collisions.push({
            a: items[i]?.key as string,
            b: items[j]?.key as string,
            deltaE: Math.floor(largest * 10) / 10,
          });
        }
      }
    }
    return { vision, colors: simulated, collisions };
  });
}
