// Source: DataViz packages/normalize/src/similarity.ts @ efcdbe2 (TashiikiD/DataViz, private), copied for
// Loopweft (editDistanceRatio only). Loopweft adds typoDistanceRatio, closest and didYouMean.

/** Levenshtein distance divided by the longer length (0 = identical, 1 = nothing in common). */
export function editDistanceRatio(a: string, b: string): number {
  if (a === b) return 0;
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
    }
    previous = current;
  }
  return (previous[b.length] as number) / longer;
}

/**
 * Like editDistanceRatio, but swapping two neighbouring letters counts as one edit (optimal string
 * alignment), so "lable" is as close to "label" as "labl" is.
 */
export function typoDistanceRatio(a: string, b: string): number {
  if (a === b) return 0;
  const longer = Math.max(a.length, b.length);
  if (longer === 0) return 0;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const at = (i: number, j: number) => (d[i] as number[])[j] as number;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        best = Math.min(best, at(i - 2, j - 2) + 1);
      (d[i] as number[])[j] = best;
    }
  }
  return at(a.length, b.length) / longer;
}

/**
 * Up to three candidates spelt closest to `name` (at most a third of it differs, ignoring case), nearest
 * first, for "did you mean" hints.
 */
export function closest(name: string, candidates: Iterable<string>): string[] {
  const token = name.toLowerCase();
  const near = [...new Set(candidates)]
    .map((c) => ({ c, distance: typoDistanceRatio(token, c.toLowerCase()) }))
    .filter((d) => d.distance <= 1 / 3)
    .sort((a, b) => a.distance - b.distance || (a.c < b.c ? -1 : a.c > b.c ? 1 : 0));
  const best = near[0]?.distance ?? 0;
  return near
    .filter((d) => d.distance <= best + 0.1)
    .slice(0, 3)
    .map((d) => d.c);
}

/** " (did you mean x?)" or "". */
export function didYouMean(name: string, candidates: Iterable<string>): string {
  const near = closest(name, candidates);
  return near.length ? ` (did you mean ${near.map((n) => `"${n}"`).join(' or ')}?)` : '';
}
