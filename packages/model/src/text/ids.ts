// Source: DataViz packages/core/src/ids.ts @ efcdbe2 (TashiikiD/DataViz, private), copied for Loopweft.
// Loopweft adds ID_PATTERN.

/**
 * What an id may contain: letters (any script), digits, `_` and `-`. No spaces, so ids work in the CLI
 * unquoted, and no dots, so `S05.3` can name step 3 of scene S05.
 */
export const ID_PATTERN = /^[\p{L}\p{N}_-]+$/u;

/**
 * Turns a label into a stable identifier: lowercase, Latin diacritics removed, every run of other
 * non-alphanumeric characters collapsed to `_`. Letters from other scripts are kept.
 *
 *   "Municipal Fiscal Capacity"    -> "municipal_fiscal_capacity"
 *   "Ecological Deficit/Overshoot" -> "ecological_deficit_overshoot"
 *   "Ökonomie & Well-being"        -> "okonomie_well_being"
 *
 * Ported from cld-generator `modules/normalization/variable_registry.py` (which dropped accented letters).
 */
export function slugify(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

/** The longest an id may be (`IdSchema`). */
const MAX_ID_LENGTH = 80;

/** `text` cut to `max` UTF-16 units, never inside a surrogate pair, without a trailing "_". */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return cut.replace(/_+$/, '');
}

/**
 * `base` if free, otherwise `base_2`, `base_3`, … Empty bases fall back to `fallback`. A long base is cut so
 * that the id, with its number, stays within the 80 characters an id may have.
 */
export function uniqueId(base: string, taken: ReadonlySet<string>, fallback = 'item'): string {
  const root = clip(base, MAX_ID_LENGTH) || fallback;
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = `${clip(root, MAX_ID_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Smallest `<prefix><n>` (n ≥ 1) not in `taken`. */
export function nextSequentialId(prefix: string, taken: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const candidate = `${prefix}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Code-unit string comparison: identical on every platform and locale, unlike `localeCompare`. */
export const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
