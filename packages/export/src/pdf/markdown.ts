// Speaker notes (Markdown, read by the player's safe reader) as PDF paragraphs: headings, paragraphs, lists
// (nested by indent, numbered or not), quotes, code and rules; bold, italics, inline code and links within.
import { type MdElement, type MdNode, parseMarkdown } from '@loopweft/player';
import type { Face } from './fonts.ts';
import { type Block, INK, type Inline, para, type Rgb, type Run } from './typeset.ts';

interface Style {
  face: Face;
  size: number;
  colour?: Rgb;
  link?: string;
}

const bolder: Record<Face, Face> = {
  sans: 'sansBold',
  sansBold: 'sansBold',
  sansItalic: 'sansBold',
  serif: 'serifBold',
  serifBold: 'serifBold',
  serifItalic: 'serifBold',
};
const italic: Record<Face, Face> = {
  sans: 'sansItalic',
  sansBold: 'sansBold',
  sansItalic: 'sansItalic',
  serif: 'serifItalic',
  serifBold: 'serifBold',
  serifItalic: 'serifItalic',
};

/** The runs of inline Markdown, in `style` (bold, italics, code and links change it). */
function inlines(nodes: readonly MdNode[], style: Style): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    if (typeof node === 'string') {
      const r: Run = { text: node.replace(/\s+/g, ' '), face: style.face, size: style.size };
      if (style.colour) r.colour = style.colour;
      if (style.link) r.link = style.link;
      out.push(r);
      continue;
    }
    if (node.tag === 'strong') out.push(...inlines(node.children, { ...style, face: bolder[style.face] }));
    else if (node.tag === 'em') out.push(...inlines(node.children, { ...style, face: italic[style.face] }));
    else if (node.tag === 'code')
      out.push(...inlines(node.children, { ...style, face: 'sans', size: style.size * 0.9 }));
    else if (node.tag === 'a')
      out.push(
        ...inlines(node.children, {
          ...style,
          colour: INK.accent,
          ...(node.href ? { link: node.href } : {}),
        }),
      );
    else out.push(...inlines(node.children, style));
  }
  return out;
}

const blockTags = new Set(['h3', 'h4', 'h5', 'p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr']);

/** Markdown as blocks, indented by `indent` points, the body in `size`-point serif. */
export function markdownBlocks(text: string, size: number, indent = 0): Block[] {
  const out: Block[] = [];
  const walk = (nodes: readonly MdNode[], depth: number) => {
    for (const node of nodes) {
      if (typeof node === 'string') {
        if (node.trim())
          out.push(
            para({ inlines: inlines([node], { face: 'serif', size }), indent: indent + depth, after: 4 }),
          );
        continue;
      }
      const el = node as MdElement;
      switch (el.tag) {
        case 'h3':
        case 'h4':
        case 'h5':
          out.push(
            para({
              inlines: inlines(el.children, {
                face: 'sansBold',
                size: size * (el.tag === 'h3' ? 1.05 : 0.95),
                colour: INK.heading,
              }),
              indent: indent + depth,
              before: 6,
              after: 2,
              keepWithNext: true,
            }),
          );
          break;
        case 'p':
          out.push(
            para({
              inlines: inlines(el.children, { face: 'serif', size }),
              indent: indent + depth,
              after: 5,
            }),
          );
          break;
        case 'ul':
        case 'ol': {
          let number = 0;
          for (const item of el.children) {
            if (typeof item === 'string' || item.tag !== 'li') continue;
            number++;
            const own = item.children.filter((c) => typeof c === 'string' || !blockTags.has(c.tag));
            const nested = item.children.filter(
              (c): c is MdElement => typeof c !== 'string' && blockTags.has(c.tag),
            );
            const first = nested[0]?.tag === 'p' ? nested.shift() : undefined;
            const content = first ? [...own, ...first.children] : own;
            out.push(
              para({
                inlines: inlines(content, { face: 'serif', size }),
                indent: indent + depth + 14,
                marker: {
                  text: el.tag === 'ol' ? `${number}.` : '•',
                  face: 'serif',
                  size,
                  colour: INK.muted,
                },
                after: 2,
              }),
            );
            walk(nested, depth + 14);
          }
          out.push(para({ inlines: [], after: 3 }));
          break;
        }
        case 'blockquote':
          walk(
            el.children.map((c) => (typeof c === 'string' ? c : c)),
            depth + 14,
          );
          break;
        case 'pre':
          for (const line of el.children
            .map((c) => (typeof c === 'string' ? c : ''))
            .join('')
            .split('\n')) {
            out.push(
              para({
                inlines: [{ text: line || ' ', face: 'sans', size: size * 0.88 }],
                indent: indent + depth + 8,
                leading: 1.3,
              }),
            );
          }
          out.push(para({ inlines: [], after: 4 }));
          break;
        case 'hr':
          out.push({ kind: 'rule', before: 4, after: 8 });
          break;
        default:
          out.push(
            para({
              inlines: inlines(el.children, { face: 'serif', size }),
              indent: indent + depth,
              after: 4,
            }),
          );
      }
    }
  };
  walk(parseMarkdown(text), 0);
  return out;
}
