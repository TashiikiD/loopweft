// Custom fields as people write them: naming a field by its id or name, and reading text as a value of its
// kind. Values are read strictly: one that cannot be read one way only is an error, never a guess.
import { OpError } from './ops/support.ts';
import type { Field, FieldValue, Project } from './schema.ts';
import { didYouMean } from './text/similarity.ts';
import { cleanText, readBoolean, readNumber } from './text/values.ts';
import { normalizeToken } from './text/vocabulary.ts';

/** A field that variables or links (`for`) may carry, named by its id, or by a name only it has. */
export function resolveField(project: Project, ref: string, carrier: 'variables' | 'links'): Field {
  const fields = project.types.fields.filter(
    (f) => (f.appliesTo ?? 'both') !== (carrier === 'links' ? 'variables' : 'links'),
  );
  const exact = fields.find((f) => f.id === ref);
  if (exact) return exact;
  const token = normalizeToken(ref);
  const matches = fields.filter((f) => normalizeToken(f.id) === token || normalizeToken(f.name) === token);
  if (matches.length === 1) return matches[0] as Field;
  if (matches.length > 1) {
    throw new OpError(
      `"${ref}" names ${matches.length} fields (${matches.map((f) => f.id).join(', ')}); use the id of the one you mean.`,
      'usage',
    );
  }
  const other = project.types.fields.find((f) => f.id === ref || normalizeToken(f.name) === token);
  if (other) throw new OpError(`Field ${other.id} is for ${other.appliesTo} only.`, 'usage');
  const what = carrier === 'links' ? 'Links' : 'Variables';
  throw new OpError(
    `${what} have no field "${ref}"${didYouMean(
      ref,
      fields.flatMap((f) => [f.id, f.name]),
    )}.`,
    'notFound',
  );
}

/** Text read as a value of a field: a number, true or false, a choice (by id or name) or text. */
export function readFieldValue(field: Field, raw: string): { value: FieldValue } | { error: string } {
  const text = cleanText(raw);
  if (!text) return { error: `${field.id} has no value.` };
  switch (field.kind) {
    case 'number': {
      const reading = readNumber(text);
      if (reading.kind === 'ok') return { value: reading.value };
      if (reading.kind === 'ambiguous') {
        const ways = reading.options.map((o) => `${o.value} (${o.note})`).join(' or ');
        return { error: `${field.id} must be a plain number; "${text}" could be ${ways}.` };
      }
      return { error: `${field.id} must be a number, got "${text}".` };
    }
    case 'boolean': {
      const reading = readBoolean(text);
      return reading.kind === 'ok'
        ? { value: reading.value }
        : { error: `${field.id} must be true or false (yes or no), got "${text}".` };
    }
    case 'choice': {
      const options = field.options ?? [];
      const token = normalizeToken(text);
      const found =
        options.find((o) => o.id === text) ??
        options.find((o) => normalizeToken(o.id) === token || normalizeToken(o.name) === token);
      return found
        ? { value: found.id }
        : {
            error: `${field.id} must be one of ${options.map((o) => `"${o.id}"`).join(', ')}, got "${text}".`,
          };
    }
    default:
      return { value: text };
  }
}
