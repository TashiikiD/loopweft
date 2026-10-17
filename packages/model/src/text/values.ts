// Source: DataViz packages/normalize/src/values.ts @ efcdbe2 (TashiikiD/DataViz, private), copied for
// Loopweft: readNumber, readBoolean and cleanText (date reading and list helpers left out).

/** Result of reading text as a typed value. */
export type Reading<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'ambiguous'; options: { value: T; note: string }[] }
  | { kind: 'invalid' };

const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const COMMA_THOUSANDS = /^[+-]?\d{1,3}(,\d{3})+$/;
const COMMA_THOUSANDS_DOT_DECIMAL = /^[+-]?\d{1,3}(,\d{3})+\.\d+$/;
const DOT_THOUSANDS_COMMA_DECIMAL = /^[+-]?\d{1,3}(\.\d{3})+,\d+$/;
const COMMA_DECIMAL = /^[+-]?\d+,\d+$/;
const PERCENT = /^([+-]?(\d+\.?\d*|\.\d+))\s*%$/;

/**
 * Reads a number. Plain notation and unmistakable grouped forms (1,234.5 / 1.234,5) are safe;
 * `1,234` (thousands or decimal comma?), `1,5` (decimal comma) and percentages need a decision.
 */
export function readNumber(text: string): Reading<number> {
  const t = text
    .trim()
    .replace(/−/g, '-')
    .replace(/[\s\u00a0\u202f]/g, '');
  if (PLAIN_NUMBER.test(t)) return { kind: 'ok', value: Number(t) };
  if (COMMA_THOUSANDS_DOT_DECIMAL.test(t)) return { kind: 'ok', value: Number(t.replace(/,/g, '')) };
  if (DOT_THOUSANDS_COMMA_DECIMAL.test(t))
    return { kind: 'ok', value: Number(t.replace(/\./g, '').replace(',', '.')) };
  if (COMMA_THOUSANDS.test(t)) {
    return {
      kind: 'ambiguous',
      options: [
        { value: Number(t.replace(/,/g, '')), note: 'comma as thousands separator' },
        { value: Number(t.replace(',', '.')), note: 'comma as decimal separator' },
      ],
    };
  }
  if (COMMA_DECIMAL.test(t))
    return {
      kind: 'ambiguous',
      options: [{ value: Number(t.replace(',', '.')), note: 'comma as decimal separator' }],
    };
  const percent = PERCENT.exec(t);
  if (percent) {
    const n = Number(percent[1]);
    return {
      kind: 'ambiguous',
      options: [
        { value: n / 100, note: 'percentage as a fraction' },
        { value: n, note: 'percentage points' },
      ],
    };
  }
  return { kind: 'invalid' };
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'x', '✓', '✔']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0']);

/** Reads true/false from common spellings (true/false, yes/no, y/n, 1/0, x, ✓). */
export function readBoolean(text: string): Reading<boolean> {
  const t = text.trim().toLowerCase();
  if (TRUE_WORDS.has(t)) return { kind: 'ok', value: true };
  if (FALSE_WORDS.has(t)) return { kind: 'ok', value: false };
  return { kind: 'invalid' };
}

/** Whitespace and Unicode cleanup. Multiline text keeps its line breaks (at most one blank line). */
export function cleanText(value: string, multiline = false): string {
  const nfc = value.normalize('NFC');
  if (!multiline) return nfc.replace(/\s+/g, ' ').trim();
  return nfc
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
