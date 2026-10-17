// Easing curves. Each maps progress 0..1 to eased progress (0 → 0, 1 → 1). Names follow the GSAP
// vocabulary the deck was written in ("power2.out", "back.out(1.9)"), so its choreography ports as is;
// CSS cubic-bezier(x1, y1, x2, y2) works too. The curves are standard formulas, written here.

export type Ease = (t: number) => number;
/** A curve, or its name: "none", "power1".."power4", "sine", "expo", "circ" or "back", with ".in", ".out" or ".inOut". */
export type EaseSpec = Ease | string;

const power = (p: number) => ({
  in: (t: number) => t ** p,
  out: (t: number) => 1 - (1 - t) ** p,
  inOut: (t: number) => (t < 0.5 ? (2 * t) ** p / 2 : 1 - (2 * (1 - t)) ** p / 2),
});

const sine = {
  in: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  out: (t: number) => Math.sin((t * Math.PI) / 2),
  inOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

const expo = {
  in: (t: number) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  out: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOut: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
};

const circ = {
  in: (t: number) => 1 - Math.sqrt(1 - t * t),
  out: (t: number) => Math.sqrt(1 - (t - 1) ** 2),
  inOut: (t: number) =>
    t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2,
};

/** Overshoots by `s` (1.70158 is the usual amount) before settling. */
const back = (s: number) => ({
  in: (t: number) => (s + 1) * t ** 3 - s * t ** 2,
  out: (t: number) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  inOut: (t: number) => {
    const k = s * 1.525;
    return t < 0.5
      ? ((2 * t) ** 2 * ((k + 1) * 2 * t - k)) / 2
      : ((2 * t - 2) ** 2 * ((k + 1) * (t * 2 - 2) + k) + 2) / 2;
  },
});

/** CSS cubic-bezier timing: solves x(u) = t for u, then returns y(u). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (u: number) => ((ax * u + bx) * u + cx) * u;
  const y = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Newton's method, falling back to bisection where the slope is flat.
    let u = t;
    for (let i = 0; i < 8; i++) {
      const err = x(u) - t;
      if (Math.abs(err) < 1e-7) return y(u);
      const slope = dx(u);
      if (Math.abs(slope) < 1e-6) break;
      u -= err / slope;
    }
    let lo = 0;
    let hi = 1;
    u = t;
    for (let i = 0; i < 40; i++) {
      if (x(u) < t) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return y(u);
  };
}

const linear: Ease = (t) => t;

const FAMILIES: Record<string, (param?: number) => { in: Ease; out: Ease; inOut: Ease }> = {
  power0: () => ({ in: linear, out: linear, inOut: linear }),
  power1: () => power(2),
  power2: () => power(3),
  power3: () => power(4),
  power4: () => power(5),
  quad: () => power(2),
  cubic: () => power(3),
  quart: () => power(4),
  quint: () => power(5),
  sine: () => sine,
  expo: () => expo,
  circ: () => circ,
  back: (s = 1.70158) => back(s),
};

const cache = new Map<string, Ease>();

/** The curve a spec names. Unknown names are an error, so a typo never animates linearly by surprise. */
export function ease(spec: EaseSpec | undefined, fallback: EaseSpec = 'power1.out'): Ease {
  if (spec === undefined) return ease(fallback);
  if (typeof spec === 'function') return spec;
  const known = cache.get(spec);
  if (known) return known;
  let curve: Ease | undefined;
  const name = spec.trim();
  if (name === 'none' || name === 'linear') curve = linear;
  const bezier = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(name);
  if (bezier) {
    const [x1, y1, x2, y2] = bezier.slice(1).map(Number) as [number, number, number, number];
    if ([x1, y1, x2, y2].every(Number.isFinite)) curve = cubicBezier(x1, y1, x2, y2);
  }
  const named = /^([a-z]+[0-4]?)(?:\.(in|out|inOut))?(?:\((-?[\d.]+)\))?$/.exec(name);
  if (!curve && named) {
    const family = FAMILIES[named[1] as string];
    if (family)
      curve = family(named[3] === undefined ? undefined : Number(named[3]))[(named[2] ?? 'out') as 'out'];
  }
  if (!curve) throw new Error(`Unknown ease "${spec}".`);
  cache.set(spec, curve);
  return curve;
}
