// Bytes for the video files: big-endian numbers, text, and joining, without anything from the browser.

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Joins byte arrays into one. */
export function concat(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** An unsigned number as `bytes` big-endian bytes (up to 2^53). */
export function uint(value: number, bytes: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** (8 * bytes))
    throw new RangeError(`${value} does not fit in ${bytes} bytes.`);
  const out = new Uint8Array(bytes);
  let v = value;
  for (let i = bytes - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

export const u8 = (v: number) => uint(v, 1);
export const u16 = (v: number) => uint(v, 2);
export const u32 = (v: number) => uint(v, 4);
export const u64 = (v: number) => uint(v, 8);

/** A signed 16-bit number, big-endian. */
export function i16(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < -32768 || value > 32767)
    throw new RangeError(`${value} does not fit in a signed 16-bit number.`);
  return u16(value < 0 ? value + 65536 : value);
}

/** A 64-bit float, big-endian. */
export function f64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value);
  return out;
}

/** Four characters, e.g. a box type ("moov"); "©" counts as one byte (0xA9), as MP4's metadata names use it. */
export function fourcc(code: string): Uint8Array {
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) out[i] = (code.codePointAt(i) ?? 0) & 0xff;
  if (code.length !== 4) throw new RangeError(`"${code}" is not four characters.`);
  return out;
}
