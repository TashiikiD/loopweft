// A GIF of the frames a video plays, with gifenc (MIT), looping for ever. Each frame holds only the rectangle
// that changed since the frame before, in 256 colours of its own, laid over what is shown; a frame with nothing
// changed (a held step where nothing moves) is not written again: the one before is shown longer. GIF counts
// time in hundredths of a second, so each frame's delay comes from the running total (at 15 frames a second:
// 7, 6, 7, 7, 6, …), and the whole lasts exactly as long as the video.

import type { GifEncoder, Palette } from 'gifenc';
import * as gifencModule from 'gifenc';

/**
 * gifenc ships ES modules for bundlers (the export page) and CommonJS for Node, whose exports Node hands over as
 * the module's default (it cannot see their names): its functions are taken from wherever they are.
 */
const gifenc: typeof gifencModule =
  typeof gifencModule.GIFEncoder === 'function'
    ? gifencModule
    : (gifencModule as unknown as { default: typeof gifencModule }).default;
const { applyPalette, GIFEncoder, quantize } = gifenc;

/** A GIF's size and rate (decision 10 of Phase 6): small enough to share, smooth enough to follow. */
export const GIF_SIZE = { width: 960, height: 540 } as const;
export const GIF_FPS = 15;

/** Past this size, many apps, chats and email services refuse a GIF or play it slowly. */
export const GIF_WARNING_BYTES = 20_000_000;

/** The file's first bytes, which never change. */
export const GIF_HEAD = new TextEncoder().encode('GIF89a');

/** GIF's disposal "leave it": a frame stays shown under the next, which draws over part of it. */
const KEEP = 1;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pending {
  index: Uint8Array;
  palette: Palette;
  rect: Rect;
  /** The frame it starts at. */
  from: number;
}

/** The smallest rectangle holding every pixel that differs between two frames; null when none does. */
export function changedRect(
  before: Uint32Array,
  after: Uint32Array,
  width: number,
  height: number,
): Rect | null {
  const rowDiffers = (y: number) => {
    for (let i = y * width, end = i + width; i < end; i++) if (before[i] !== after[i]) return true;
    return false;
  };
  let top = 0;
  while (top < height && !rowDiffers(top)) top++;
  if (top === height) return null;
  let bottom = height - 1;
  while (bottom > top && !rowDiffers(bottom)) bottom--;
  let left = width;
  let right = -1;
  for (let y = top; y <= bottom; y++) {
    const row = y * width;
    for (let x = 0; x < left; x++) {
      if (before[row + x] !== after[row + x]) {
        left = x;
        break;
      }
    }
    for (let x = width - 1; x > right; x--) {
      if (before[row + x] !== after[row + x]) {
        right = x;
        break;
      }
    }
  }
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/** The pixels of a rectangle of a frame. */
function crop(rgba: Uint8Array | Uint8ClampedArray, width: number, rect: Rect): Uint8Array {
  const out = new Uint8Array(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const from = ((rect.y + y) * width + rect.x) * 4;
    out.set(rgba.subarray(from, from + rect.w * 4), y * rect.w * 4);
  }
  return out;
}

export class GifWriter {
  readonly #width: number;
  readonly #height: number;
  readonly #fps: number;
  readonly #gif: GifEncoder = GIFEncoder({ auto: false });
  #pending: Pending | null = null;
  /** The last frame's pixels, to find what the next one changes. */
  #last: Uint32Array | null = null;
  #frames = 0;
  #written = 0;

  constructor(width: number, height: number, fps: number) {
    this.#width = width;
    this.#height = height;
    this.#fps = fps;
    this.#gif.writeHeader();
  }

  /** Frames so far. */
  get frames(): number {
    return this.#frames;
  }

  /** GIF frames written so far (a held frame counts once). */
  get written(): number {
    return this.#written;
  }

  /** Hundredths of a second from the start to frame `n`. */
  #at(n: number): number {
    return Math.round((100 * n) / this.#fps);
  }

  /** Writes the frame in hand, now that its end is known; hands back the bytes made since the last call. */
  #flush(): Uint8Array[] {
    const p = this.#pending;
    if (!p) return this.#take();
    this.#pending = null;
    const first = this.#written === 0;
    this.#gif.writeFrame(p.index, p.rect.w, p.rect.h, {
      palette: p.palette,
      // gifenc takes milliseconds and keeps the nearest hundredth.
      delay: (this.#at(this.#frames) - this.#at(p.from)) * 10,
      dispose: KEEP,
      ...(first ? { first: true, repeat: 0 } : {}),
    });
    this.#written++;
    const bytes = this.#take();
    if (!first) {
      // gifenc places every frame at 0, 0: its image descriptor (after the 8 bytes of its delay and disposal)
      // gets the rectangle's place.
      const frame = bytes[0] as Uint8Array;
      if (frame[8] !== 0x2c) throw new Error('gifenc wrote a frame Loopweft does not know how to place.');
      frame.set([p.rect.x & 0xff, p.rect.x >> 8, p.rect.y & 0xff, p.rect.y >> 8], 9);
    }
    return bytes;
  }

  #take(): Uint8Array[] {
    const bytes = this.#gif.bytes();
    this.#gif.reset();
    return bytes.length > 0 ? [bytes] : [];
  }

  /** The next frame: its pixels (RGBA, as a canvas gives them), or null when it is the one before again. */
  add(rgba: Uint8Array | Uint8ClampedArray | null): Uint8Array[] {
    if (rgba === null && this.#pending) {
      this.#frames++;
      return [];
    }
    if (rgba === null) throw new Error('The first frame of a GIF needs its pixels.');
    const w = this.#width;
    const h = this.#height;
    if (rgba.length !== w * h * 4) throw new Error(`A frame of ${w} × ${h} has ${w * h * 4} bytes.`);
    const now = new Uint32Array(rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength));
    const rect = this.#last ? changedRect(this.#last, now, w, h) : { x: 0, y: 0, w, h };
    this.#last = now;
    if (!rect) {
      this.#frames++;
      return [];
    }
    const out = this.#flush();
    const pixels = rect.w === w && rect.h === h ? rgba : crop(rgba, w, rect);
    const palette = quantize(pixels, 256);
    this.#pending = { index: applyPalette(pixels, palette), palette, rect, from: this.#frames };
    this.#frames++;
    return out;
  }

  /** The last frame and the end of the file. */
  finish(): Uint8Array[] {
    if (this.#frames === 0) throw new Error('A GIF needs at least one frame.');
    const out = this.#flush();
    this.#gif.finish();
    return [...out, ...this.#take()];
  }
}
