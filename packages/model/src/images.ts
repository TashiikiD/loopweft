// Reading embedded images from their bytes, never their names: which type a file is, and whether it is whole.
// The operations that add or replace an image refuse one that is not (ops/overlays.ts), and so does checking a
// project (refs.ts), so a file opened by hand or imported keeps to the same rule.

const u16be = (b: Uint8Array, at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u32be = (b: Uint8Array, at: number) => u16be(b, at) * 0x10000 + u16be(b, at + 2);
const u16le = (b: Uint8Array, at: number) => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u32le = (b: Uint8Array, at: number) =>
  (b[at] ?? 0) + (b[at + 1] ?? 0) * 0x100 + (b[at + 2] ?? 0) * 0x10000 + (b[at + 3] ?? 0) * 0x1000000;
const STOPS = 'it stops before its end';
const EMPTY = 'it has no picture in it';

/**
 * What a file of a known image type lacks to be shown whole, or null: its parts are walked to the end the
 * format marks (PNG chunks to IEND, JPEG segments to the end of the image, GIF blocks to the trailer, WebP's
 * RIFF chunks to the size it states, SVG to the root's closing tag), and it must hold a picture.
 */
function incomplete(bytes: Uint8Array, type: NonNullable<ReturnType<typeof imageType>>): string | null {
  switch (type) {
    case 'png': {
      // Chunks: length, type, data, CRC. The header first; image data; the end.
      let at = 8;
      let data = false;
      for (let first = true; ; first = false) {
        if (at + 12 > bytes.length) return STOPS;
        const length = u32be(bytes, at);
        const kind = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
        if (at + 12 + length > bytes.length) return STOPS;
        if (first && (kind !== 'IHDR' || length !== 13)) return 'it does not start with its header';
        // The header's width and height, each above 0.
        if (first && (u32be(bytes, at + 8) === 0 || u32be(bytes, at + 12) === 0)) return EMPTY;
        if (kind === 'IDAT' && length > 0) data = true;
        if (kind === 'IEND') return data ? null : EMPTY;
        at += 12 + length;
      }
    }
    case 'jpeg': {
      // Segments after the start: markers with a length, up to the scan; the scan's data runs to the end mark.
      let at = 2;
      let frame = false;
      for (;;) {
        if (at + 4 > bytes.length || bytes[at] !== 0xff) return STOPS;
        const marker = bytes[at + 1] as number;
        if (marker === 0xff) {
          at += 1; // fill byte
          continue;
        }
        if (marker === 0xd9) return EMPTY; // the end, before any scan
        const length = u16be(bytes, at + 2);
        if (length < 2 || at + 2 + length > bytes.length) return STOPS;
        // Start of a frame: C0–CF, except C4 (tables), C8 (reserved) and CC (coding). It holds the precision, a
        // height and width above 0 (a height left to a later DNL marker is not taken) and 1 to 4 components.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          const components = bytes[at + 9] ?? 0;
          const sized = u16be(bytes, at + 5) > 0 && u16be(bytes, at + 7) > 0;
          if (length < 8 + 3 * components || components < 1 || components > 4 || !sized) return EMPTY;
          frame = true;
        }
        if (marker === 0xda) {
          // The scan's header: 1 to 4 components of 2 bytes each, then the spectral selection and approximation.
          const components = bytes[at + 4] ?? 0;
          if (!frame || length < 6 + 2 * components || components < 1 || components > 4) return EMPTY;
          // The scan's data, which must have some bytes before the end mark.
          const data = at + 2 + length;
          for (let i = data; i + 1 < bytes.length; i++) {
            // Fill bytes (FF) before the end mark are not data.
            if (bytes[i] === 0xff && bytes[i + 1] === 0xd9)
              return bytes.subarray(data, i).some((b) => b !== 0xff) ? null : EMPTY;
          }
          return STOPS;
        }
        at += 2 + length;
      }
    }
    case 'gif': {
      // The screen, its colour table, then images and extensions in sub-blocks, to the trailer.
      const subBlocks = (from: number) => {
        let at = from;
        while (at < bytes.length && bytes[at] !== 0) at += 1 + (bytes[at] as number);
        return at < bytes.length ? at + 1 : -1;
      };
      if (bytes.length < 13) return STOPS;
      const flags = bytes[10] as number;
      let at = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0);
      let image = false;
      for (;;) {
        if (at >= bytes.length) return STOPS;
        const block = bytes[at];
        if (block === 0x3b) return image ? null : EMPTY;
        if (block === 0x21) at = subBlocks(at + 2);
        else if (block === 0x2c) {
          if (at + 10 > bytes.length) return STOPS;
          const local = bytes[at + 9] as number;
          // A width and height above 0 (little-endian).
          const sized = u16le(bytes, at + 5) > 0 && u16le(bytes, at + 7) > 0;
          at += 10 + (local & 0x80 ? 3 * 2 ** ((local & 7) + 1) : 0);
          // Past the LZW code size: an image holds a picture only when its data has some bytes.
          if (sized && (bytes[at + 1] ?? 0) > 0) image = true;
          at = subBlocks(at + 1);
        } else return STOPS;
        if (at < 0) return STOPS;
      }
    }
    case 'webp': {
      // RIFF states its size; its chunks must fit it, and one must hold the picture.
      const end = 8 + u32le(bytes, 4);
      if (end > bytes.length) return STOPS;
      let at = 12;
      let picture = false;
      while (at < end) {
        if (at + 8 > end) return STOPS;
        const kind = String.fromCharCode(...bytes.subarray(at, at + 4));
        const size = u32le(bytes, at + 4);
        if (at + 8 + size > end) return STOPS;
        if (webpPicture(bytes, kind, at + 8, size)) picture = true;
        at += 8 + size + (size % 2);
      }
      // An odd-sized last chunk's padding byte counts within the size RIFF states.
      if (at > end) return STOPS;
      return picture ? null : EMPTY;
    }
    case 'svg+xml': {
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return 'it is not UTF-8 text';
      }
      // The root closes at the end, comments and spaces aside: `</svg>`, or a root that closes itself.
      let body = text.trimEnd();
      while (body.endsWith('-->') && body.includes('<!--'))
        body = body.slice(0, body.lastIndexOf('<!--')).trimEnd();
      // Or a root that closes itself, its tag read to its ">" past quoted values.
      const start = body.search(/<svg[\s>/]/i);
      const end = start < 0 ? -1 : tagEnd(body, start);
      const closed = /<\/svg\s*>$/i.test(body) || (end === body.length - 1 && body[end - 1] === '/');
      if (!closed) return STOPS;
      return nests(text) ? null : 'its tags do not match up';
    }
  }
}

/**
 * Whether a WebP chunk starts as a picture: a lossy frame with its start code, a lossless one with its
 * signature, or an animation frame holding either. (The picture itself is not decoded.)
 */
function webpPicture(bytes: Uint8Array, kind: string, from: number, size: number): boolean {
  if (kind === 'VP8 ') {
    // The start code, then a width and height (14 bits each) above 0.
    const start = bytes[from + 3] === 0x9d && bytes[from + 4] === 0x01 && bytes[from + 5] === 0x2a;
    return (
      size >= 10 && start && (u16le(bytes, from + 6) & 0x3fff) > 0 && (u16le(bytes, from + 8) & 0x3fff) > 0
    );
  }
  if (kind === 'VP8L') return size >= 5 && bytes[from] === 0x2f;
  if (kind !== 'ANMF') return false;
  // After the frame's 16-byte header, its own chunks.
  for (let at = from + 16; at + 8 <= from + size; ) {
    const sub = String.fromCharCode(...bytes.subarray(at, at + 4));
    const length = u32le(bytes, at + 4);
    if (at + 8 + length > from + size) return false;
    if (webpPicture(bytes, sub, at + 8, length)) return true;
    at += 8 + length + (length % 2);
  }
  return false;
}

/** Where the tag starting at `from` ends: its ">", past quoted attribute values; -1 when it does not end. */
function tagEnd(text: string, from: number): number {
  let quote = '';
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return -1;
}

/**
 * Whether an SVG document's tags nest, with one root: each element opened is closed in turn, comments, CDATA,
 * processing instructions, the doctype and quoted attribute values passed over. (Not a full XML parser:
 * names, attributes and entities are not checked.)
 */
function nests(text: string): boolean {
  const open: string[] = [];
  let roots = 0;
  let at = 0;
  const past = (end: string, from: number) => {
    const found = text.indexOf(end, from);
    return found < 0 ? -1 : found + end.length;
  };
  for (;;) {
    const lt = text.indexOf('<', at);
    if (lt < 0) break;
    if (text.startsWith('<!--', lt)) at = past('-->', lt + 4);
    else if (text.startsWith('<![CDATA[', lt)) at = past(']]>', lt + 9);
    else if (text.startsWith('<?', lt)) at = past('?>', lt + 2);
    else {
      // A doctype (its internal subset in brackets), or a tag: to its closing ">", past quoted values.
      const doctype = text.startsWith('<!', lt);
      let i = lt + 1;
      let quote = '';
      let depth = 0;
      for (; i < text.length; i++) {
        const c = text[i];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (doctype && c === '[') depth++;
        else if (doctype && c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      if (i >= text.length) return false;
      at = i + 1;
      if (doctype) continue;
      const tag = text.slice(lt + 1, i);
      if (tag.startsWith('/')) {
        if (open.pop() !== tag.slice(1).trim()) return false;
        continue;
      }
      const name = /^[^\s/>]+/.exec(tag)?.[0];
      if (!name) return false;
      if (open.length === 0) roots++;
      if (!tag.trimEnd().endsWith('/')) open.push(name);
    }
    if (at < 0) return false;
  }
  return open.length === 0 && roots === 1;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64[(n >> 18) & 63];
    out += BASE64[(n >> 12) & 63];
    out += b === undefined ? '=' : BASE64[(n >> 6) & 63];
    out += c === undefined ? '=' : BASE64[n & 63];
  }
  return out;
}

const starts = (bytes: Uint8Array, at: number, text: string) =>
  [...text].every((ch, i) => bytes[at + i] === ch.charCodeAt(0));

/** The image type of a file's bytes, read from the bytes themselves (never from its name), or null. */
export function imageType(bytes: Uint8Array): 'png' | 'jpeg' | 'gif' | 'webp' | 'svg+xml' | null {
  // The whole signature of each type, so a cut-off header is not taken for an image.
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((b, i) => bytes[i] === b)) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (starts(bytes, 0, 'GIF87a') || starts(bytes, 0, 'GIF89a')) return 'gif';
  if (starts(bytes, 0, 'RIFF') && starts(bytes, 8, 'WEBP')) return 'webp';
  // The whole text, however long the preamble before the root; TextDecoder drops a byte-order mark.
  const head = new TextDecoder().decode(bytes).trimStart();
  // Before the root: processing instructions (the XML declaration among them), comments, and a doctype (with
  // an internal subset in brackets).
  const misc = String.raw`(?:<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*)*`;
  const doctype = String.raw`(?:<!DOCTYPE svg[^[>]*(?:\[[\s\S]*?\])?\s*>\s*)?`;
  if (new RegExp(`^${misc}${doctype}${misc}<svg[\\s>/]`, 'i').test(head)) return 'svg+xml';
  return null;
}

/**
 * Problems already found, by data URI: a project is checked after every edit, and its images rarely change.
 * The data URIs kept are bounded by their total length (about 8 million characters), oldest first out.
 */
const found = new Map<string, string | null>();
const KEPT = 8_000_000;
let kept = 0;

/**
 * Why image data (a data URI) could not be shown, or null when it is a whole image of the type it names: base64
 * that does not decode, bytes of another type or of none, or an image cut off or with no picture in it.
 */
export function imageProblem(data: string): string | null {
  const known = found.get(data);
  if (known !== undefined) return known;
  const problem = readProblem(data);
  if (data.length > KEPT) return problem;
  for (const old of found.keys()) {
    if (kept + data.length <= KEPT) break;
    found.delete(old);
    kept -= old.length;
  }
  found.set(data, problem);
  kept += data.length;
  return problem;
}

function readProblem(data: string): string | null {
  const declared = data.slice('data:image/'.length, data.indexOf(';'));
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  } catch {
    return 'The image data is not valid base64.';
  }
  const type = bytes.length ? imageType(bytes) : null;
  if (type === null || type !== declared) {
    return type
      ? `The image data says image/${declared} but holds a ${type.replace('+xml', '').toUpperCase()} image.`
      : `The image data says image/${declared} but is not a readable image.`;
  }
  const missing = incomplete(bytes, type);
  return missing
    ? `The image data is not a whole ${type.replace('+xml', '').toUpperCase()} image: ${missing}.`
    : null;
}
