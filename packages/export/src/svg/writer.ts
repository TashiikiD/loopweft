// Writing the SVG drawing as text: elements with their attributes in the order given, numbers with at most two
// decimals, ids numbered in drawing order, shared definitions (gradients, filters, masks, clips) written once.
// The same drawing always gives the same bytes.

/** A number as the drawing writes it: at most two decimals, no trailing zeros, no "-0". */
export function num(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type Attrs = Record<string, string | number | null | undefined>;

/** One element as text. Attributes left null or undefined are left out; numbers are written with `num`. */
export function tag(name: string, attrs: Attrs, children?: string): string {
  let out = `<${name}`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === '') continue;
    out += ` ${key}="${escapeAttr(typeof value === 'number' ? num(value) : value)}"`;
  }
  return children === undefined || children === '' ? `${out}/>` : `${out}>${children}</${name}>`;
}

/** The definitions a drawing collects, each written once, with ids in the order they were first needed. */
export class Defs {
  readonly #byKey = new Map<string, string>();
  readonly #items: string[] = [];
  #next = 1;

  /** The id of a definition made by `make(id)`, written once whatever the number of uses. */
  id(key: string, make: (id: string) => string): string {
    const known = this.#byKey.get(key);
    if (known) return known;
    const id = `d${this.#next++}`;
    this.#byKey.set(key, id);
    this.#items.push(make(id));
    return id;
  }

  /** A new id for a definition used once (a clip of one box). */
  unique(make: (id: string) => string): string {
    const id = `d${this.#next++}`;
    this.#items.push(make(id));
    return id;
  }

  toString(): string {
    return this.#items.length ? `<defs>${this.#items.join('')}</defs>` : '';
  }
}
