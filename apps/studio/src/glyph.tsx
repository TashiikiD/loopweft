// A variable's glyph, small, as the canvas draws it: for the role and category lists.
import type { Role } from '@loopweft/model';
import { shapeGlyph } from '@loopweft/render';
import { createElement } from 'react';

/** SVG attributes from a glyph part's, with `class` as React's `className`. */
export const glyphProps = (attrs: Record<string, string | number>) => {
  const { class: className, ...rest } = attrs;
  return className === undefined ? rest : { ...rest, className };
};

/** A glyph of `shape` in `colour`, `size` pixels square. */
export function Glyph({ shape, colour, size = 20 }: { shape: Role['shape']; colour: string; size?: number }) {
  const r = 9;
  return (
    <svg
      className="lw-glyph"
      width={size}
      height={size}
      viewBox="-12 -12 24 24"
      style={{ '--c': colour } as React.CSSProperties}
      aria-hidden
    >
      {shapeGlyph(shape, r).map((part, i) =>
        createElement(part.tag, { key: i, ...glyphProps(part.attrs) }, part.text),
      )}
    </svg>
  );
}
