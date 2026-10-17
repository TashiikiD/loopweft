// Source: PolycrisisPresentation src/core/dom.ts (h), src/core/text.ts (typeset) and src/map/map-view.ts (svg)
// @ 539bc8e (private).
//
// Small element builders. Text goes through textContent, never innerHTML.
import type { GlyphPart } from './glyphs.ts';

type Child = Node | string | number | null | undefined | false;
type AttrValue = string | number | boolean | null | undefined;

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Glyph parts (see glyphs.ts) as SVG elements. */
export function glyph(parts: GlyphPart[]): SVGElement[] {
  return parts.map((p) => {
    const el = svg(p.tag, p.attrs);
    if (p.text !== undefined) el.textContent = p.text;
    return el;
  });
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, AttrValue> | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

/** Typographic arrows and ranges: "->" → "→", "<->" → "↔", "2019-2024" → "2019–2024". */
export function typeset(s: string): string {
  return s
    .replace(/<->/g, '↔')
    .replace(/->/g, '→')
    .replace(/(\d{4})-(\d{4})/g, '$1–$2');
}
