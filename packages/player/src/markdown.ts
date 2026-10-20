// Speaker notes are Markdown (docs/format.md, section 10). This reads the common part of it, safely: headings,
// paragraphs, lists (nested by indent), quotes, code, rules, bold, italics, inline code and links (web and mail
// addresses only). Nothing in a note is ever read as HTML: anything else shows as the text it is.

export type MdTag =
  | 'h3'
  | 'h4'
  | 'h5'
  | 'p'
  | 'ul'
  | 'ol'
  | 'li'
  | 'blockquote'
  | 'pre'
  | 'hr'
  | 'strong'
  | 'em'
  | 'code'
  | 'a';

export interface MdElement {
  tag: MdTag;
  children: MdNode[];
  href?: string;
}

export type MdNode = string | MdElement;

const el = (tag: MdTag, children: MdNode[], href?: string): MdElement =>
  href === undefined ? { tag, children } : { tag, children, href };

const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const FENCE = /^\s*(```|~~~)/;
const QUOTE = /^\s*>\s?(.*)$/;

const isOrdered = (line: string): boolean => /^\d/.test(LIST_ITEM.exec(line)?.[2] ?? '');

const indentOf = (line: string): number => (/^\s*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length;

/** Reads Markdown into a tree of plain elements and text. */
export function parseMarkdown(text: string): MdNode[] {
  return blocks(text.replace(/\r\n?/g, '\n').split('\n'));
}

function blocks(lines: string[]): MdNode[] {
  const out: MdNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] as string).trim().startsWith(fence[1] as string))
        body.push(lines[i++] as string);
      i++;
      out.push(el('pre', [el('code', [body.join('\n')])]));
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = Math.min(3, (heading[1] as string).length);
      out.push(el((['h3', 'h4', 'h5'] as const)[level - 1] as MdTag, inline(heading[2] as string)));
      i++;
      continue;
    }
    if (RULE.test(line)) {
      out.push(el('hr', []));
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i] as string))
        inner.push(QUOTE.exec(lines[i++] as string)?.[1] ?? '');
      out.push(el('blockquote', blocks(inner)));
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const start = i;
      const base = indentOf(line);
      const ordered = isOrdered(line);
      /** An item of this list: at its indent and of its kind (a numbered list after a bulleted one starts anew). */
      const sameList = (l: string) => LIST_ITEM.test(l) && (indentOf(l) > base || isOrdered(l) === ordered);
      while (i < lines.length) {
        const l = lines[i] as string;
        if (!l.trim()) {
          // A blank line ends the list unless an item of it or an indented line follows.
          const next = lines[i + 1];
          if (next?.trim() && (sameList(next) || (!LIST_ITEM.test(next) && indentOf(next) > base))) {
            i++;
            continue;
          }
          break;
        }
        if (i > start && LIST_ITEM.test(l) && !sameList(l)) break;
        if (!LIST_ITEM.test(l) && indentOf(l) === 0 && i > start) break;
        i++;
      }
      out.push(list(lines.slice(start, i).filter((l) => l.trim())));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] as string;
      if (!l.trim() || HEADING.test(l) || RULE.test(l) || FENCE.test(l) || QUOTE.test(l) || LIST_ITEM.test(l))
        break;
      para.push(l.trim());
      i++;
    }
    out.push(el('p', inline(para.join(' '))));
  }
  return out;
}

/** A list from its lines: items, their continuation lines, and lists nested deeper. */
function list(lines: string[]): MdElement {
  const base = indentOf(lines[0] as string);
  const ordered = isOrdered(lines[0] as string);
  const items: MdElement[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i] as string) as RegExpExecArray;
    const text = [m[3] as string];
    const nested: string[] = [];
    i++;
    while (i < lines.length) {
      const l = lines[i] as string;
      const item = LIST_ITEM.exec(l);
      if (item && indentOf(l) <= base) break;
      if (item || nested.length > 0) nested.push(l);
      else text.push(l.trim());
      i++;
    }
    const children: MdNode[] = inline(text.join(' '));
    if (nested.length > 0) children.push(list(nested));
    items.push(el('li', children));
  }
  return el(ordered ? 'ol' : 'ul', items);
}

const ESCAPABLE = /[\\`*_[\]()#+\-.!>{}|~]/;
const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const WORD = /[\p{L}\p{N}]/u;

/** Bold, italics, inline code, links and escapes within a line. */
function inline(text: string): MdNode[] {
  const out: MdNode[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push(buf);
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    const next = text[i + 1] ?? '';
    if (c === '\\' && ESCAPABLE.test(next)) {
      buf += next;
      i += 2;
      continue;
    }
    if (c === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push(el('code', [text.slice(i + 1, end)]));
        i = end + 1;
        continue;
      }
    }
    if ((c === '*' || c === '_') && next === c) {
      const end = text.indexOf(c + c, i + 2);
      if (end > i + 2 && text[i + 2] !== ' ') {
        flush();
        out.push(el('strong', inline(text.slice(i + 2, end))));
        i = end + 2;
        continue;
      }
    }
    if (
      (c === '*' || c === '_') &&
      next &&
      next !== ' ' &&
      next !== c &&
      !(c === '_' && WORD.test(text[i - 1] ?? ''))
    ) {
      const end = closing(text, i + 1, c);
      if (end > 0) {
        flush();
        out.push(el('em', inline(text.slice(i + 1, end))));
        i = end + 1;
        continue;
      }
    }
    if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (m && SAFE_LINK.test(m[2] as string)) {
        flush();
        out.push(el('a', inline(m[1] as string), m[2]));
        i += m[0].length;
        continue;
      }
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

/** Where a single `*` or `_` closes an emphasis opened before `from`, or -1. */
function closing(text: string, from: number, mark: string): number {
  for (let j = from + 1; j < text.length; j++) {
    if (text[j] !== mark) continue;
    if (text[j + 1] === mark) {
      j++;
      continue;
    }
    if (text[j - 1] === ' ') continue;
    if (mark === '_' && WORD.test(text[j + 1] ?? '')) continue;
    return j;
  }
  return -1;
}

/** The tree as DOM nodes; text goes through `typeset` (code excepted). */
export function markdownToDom(
  nodes: MdNode[],
  typeset: (s: string) => string = (s) => s,
  doc: Document = document,
): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const build = (node: MdNode, inCode: boolean): Node => {
    if (typeof node === 'string') return doc.createTextNode(inCode ? node : typeset(node));
    const e = doc.createElement(node.tag);
    if (node.tag === 'a' && node.href) {
      e.setAttribute('href', node.href);
      e.setAttribute('target', '_blank');
      e.setAttribute('rel', 'noopener noreferrer');
    }
    for (const child of node.children) e.appendChild(build(child, inCode || node.tag === 'code'));
    return e;
  };
  for (const node of nodes) fragment.appendChild(build(node, false));
  return fragment;
}
