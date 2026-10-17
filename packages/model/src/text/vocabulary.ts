// Source: DataViz packages/core/src/vocabulary.ts @ efcdbe2 (TashiikiD/DataViz, private), adapted for
// Loopweft: plain types instead of zod schemas, and confidence stored as low / medium / high (DataViz's
// L / M / H are synonyms, so its projects and shorthand convert without loss). The group vocabulary is gone:
// Loopweft groups are categories.

export interface VocabularyValue {
  /** The value stored in the project. */
  value: string;
  label?: string;
  /** Alternative spellings that map to `value` (case- and spacing-insensitive). */
  synonyms?: string[];
}

export interface Vocabulary {
  label?: string;
  values: VocabularyValue[];
}

/** Lowercased, NFKC-normalized, trimmed, whitespace-collapsed form used for synonym matching. */
export const normalizeToken = (text: string): string =>
  text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');

export interface ResolvedValue {
  value: string;
  /** How the raw text matched: verbatim, ignoring case/spacing, via the display label, or via a synonym. */
  via: 'exact' | 'normalized' | 'label' | 'synonym';
}

/** Maps raw text onto a vocabulary value, or returns `null` when nothing matches. */
export function resolveVocabularyValue(vocabulary: Vocabulary, raw: string): ResolvedValue | null {
  const exact = vocabulary.values.find((v) => v.value === raw);
  if (exact) return { value: exact.value, via: 'exact' };
  const token = normalizeToken(raw);
  if (!token) return null;
  for (const v of vocabulary.values) {
    if (normalizeToken(v.value) === token) return { value: v.value, via: 'normalized' };
  }
  for (const v of vocabulary.values) {
    if (v.label !== undefined && normalizeToken(v.label) === token) return { value: v.value, via: 'label' };
  }
  for (const v of vocabulary.values) {
    if (v.synonyms?.some((s) => normalizeToken(s) === token)) return { value: v.value, via: 'synonym' };
  }
  return null;
}

/** Link signs and their spellings. */
export const SIGN_VOCABULARY: Vocabulary = {
  label: 'Link sign',
  values: [
    {
      value: '+',
      label: 'positive (same direction)',
      synonyms: ['positive', 'pos', 'p', 's', 'same', 'increase', 'increases', 'plus', '+ve', 'reinforcing'],
    },
    {
      value: '-',
      label: 'negative (opposite direction)',
      synonyms: [
        'negative',
        'neg',
        'n',
        'o',
        'opposite',
        'decrease',
        'decreases',
        'minus',
        '-ve',
        '−',
        '–',
        '—',
        'balancing',
      ],
    },
    {
      value: '?',
      label: 'unknown or ambiguous',
      synonyms: ['unknown', 'ambiguous', 'uncertain', 'unclear', 'u', '±', '+/-', '+/−'],
    },
  ],
};

/** Link confidence and its spellings (DataViz's L / M / H included). */
export const CONFIDENCE_VOCABULARY: Vocabulary = {
  label: 'Confidence',
  values: [
    { value: 'low', label: 'Low', synonyms: ['l', 'lo', 'weak'] },
    { value: 'medium', label: 'Medium', synonyms: ['m', 'med', 'moderate', 'mid'] },
    { value: 'high', label: 'High', synonyms: ['h', 'hi', 'strong'] },
  ],
};
