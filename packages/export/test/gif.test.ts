// The GIF writer, read back block by block: the screen, the loop, each frame's colours and delay, and a held
// frame written once. The frames themselves come from the export page: apps/studio/e2e/export-video.spec.ts.
import { describe, expect, it } from 'vitest';
import { changedRect, GIF_FPS, GIF_SIZE, GifWriter } from '../src/index.ts';

interface Frame {
  /** Hundredths of a second. */
  delay: number;
  /** Where it is drawn, over the frames before. */
  left: number;
  top: number;
  /** What happens to it when the next is drawn: 1 leaves it. */
  dispose: number;
  width: number;
  height: number;
  /** Its own colours (none: the file's). */
  local: number;
}

interface Gif {
  width: number;
  height: number;
  global: number;
  /** How many times it plays again: 0 for ever (null: no loop block). */
  loops: number | null;
  frames: Frame[];
  ended: boolean;
}

/** A GIF's blocks, as a decoder walks them. */
function parse(bytes: Uint8Array): Gif {
  const text = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n));
  const u16 = (at: number) => (bytes[at] as number) | ((bytes[at + 1] as number) << 8);
  expect(text(0, 6)).toBe('GIF89a');
  const packed = bytes[10] as number;
  const global = packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0;
  const gif: Gif = {
    width: u16(6),
    height: u16(8),
    global: global / 3,
    loops: null,
    frames: [],
    ended: false,
  };
  let at = 13 + global;
  let delay = 0;
  let dispose = 0;
  const skipBlocks = () => {
    while ((bytes[at] as number) !== 0) at += (bytes[at] as number) + 1;
    at++;
  };
  while (at < bytes.length) {
    const kind = bytes[at] as number;
    if (kind === 0x3b) {
      gif.ended = true;
      at++;
      break;
    }
    if (kind === 0x21) {
      const label = bytes[at + 1] as number;
      if (label === 0xf9) {
        dispose = ((bytes[at + 3] as number) >> 2) & 7;
        delay = u16(at + 4);
        at += 8;
      } else if (label === 0xff) {
        expect(text(at + 3, 11)).toBe('NETSCAPE2.0');
        gif.loops = u16(at + 16);
        at += 14;
        skipBlocks();
      } else {
        at += 2;
        skipBlocks();
      }
    } else if (kind === 0x2c) {
      const flags = bytes[at + 9] as number;
      const local = flags & 0x80 ? 2 ** ((flags & 7) + 1) : 0;
      gif.frames.push({
        delay,
        left: u16(at + 1),
        top: u16(at + 3),
        dispose,
        width: u16(at + 5),
        height: u16(at + 7),
        local,
      });
      at += 10 + 3 * local + 1;
      skipBlocks();
    } else throw new Error(`An unknown block ${kind} at ${at}.`);
  }
  expect(at).toBe(bytes.length);
  return gif;
}

const W = 32;
const H = 18;

/** A frame of one colour, with a square of another at `x`. */
function frame(x: number): Uint8Array {
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const inside = i % W >= x && i % W < x + 4 && Math.floor(i / W) < 4;
    rgba.set(inside ? [250, 180, 40, 255] : [10, 30, 25, 255], i * 4);
  }
  return rgba;
}

function write(frames: (Uint8Array | null)[], fps = GIF_FPS): Uint8Array {
  const writer = new GifWriter(W, H, fps);
  const parts = frames.flatMap((f) => writer.add(f));
  parts.push(...writer.finish());
  return Uint8Array.from(parts.flatMap((p) => [...p]));
}

describe('the GIF writer', () => {
  it('is 960 × 540 at 15 frames a second for a video', () => {
    expect([GIF_SIZE.width, GIF_SIZE.height, GIF_FPS]).toEqual([960, 540, 15]);
  });

  it('loops for ever, each frame in its own colours, its delay from the running total', () => {
    const gif = parse(write(Array.from({ length: 10 }, (_, i) => frame(i * 2))));
    expect([gif.width, gif.height, gif.loops, gif.ended]).toEqual([W, H, 0, true]);
    expect(gif.frames).toHaveLength(10);
    // 15 frames a second in hundredths: 7, 6, 7, 7, 6, … and the whole is 10/15 s, to the hundredth.
    expect(gif.frames.map((f) => f.delay)).toEqual([7, 6, 7, 7, 6, 7, 7, 6, 7, 7]);
    expect(gif.frames.reduce((n, f) => n + f.delay, 0)).toBe(67);
    // The first frame's colours are the file's; every other frame has its own.
    expect(gif.global).toBeGreaterThan(0);
    expect(gif.frames.map((f) => f.local > 0)).toEqual([false, ...Array(9).fill(true)]);
    // The first frame is the whole screen; each after it only the rectangle the square left and reached.
    expect(gif.frames.slice(0, 3).map(({ left, top, width, height }) => [left, top, width, height])).toEqual([
      [0, 0, W, H],
      [0, 0, 6, 4],
      [2, 0, 6, 4],
    ]);
    expect(gif.frames.every((f) => f.dispose === 1)).toBe(true);
  });

  it('writes a frame the same as the one before once, shown for longer', () => {
    const gif = parse(write([frame(0), null, null, frame(8), null]));
    expect(gif.frames.map((f) => f.delay)).toEqual([20, 13]);
    // The same pixels drawn again count as the same frame too.
    expect(parse(write([frame(0), frame(0), frame(8)])).frames.map((f) => f.delay)).toEqual([13, 7]);
  });

  it('is the same bytes for the same frames, and hands them out as it goes', () => {
    const frames = [frame(0), frame(4), null, frame(8)];
    expect(write(frames)).toEqual(write(frames));
    const writer = new GifWriter(W, H, GIF_FPS);
    // The first frame is held until its end is known; the header is out at once.
    expect(new TextDecoder().decode(Uint8Array.from(writer.add(frame(0)).flatMap((p) => [...p])))).toBe(
      'GIF89a',
    );
    const second = writer.add(frame(4));
    expect(second.flatMap((p) => [...p]).length).toBeGreaterThan(6);
    expect([writer.frames, writer.written]).toEqual([2, 1]);
  });

  it('refuses a first frame without pixels, and pixels of another size', () => {
    expect(() => new GifWriter(W, H, GIF_FPS).add(null)).toThrow(
      'The first frame of a GIF needs its pixels.',
    );
    expect(() => new GifWriter(W, H, GIF_FPS).add(new Uint8Array(12))).toThrow(
      `A frame of ${W} × ${H} has ${W * H * 4} bytes.`,
    );
    expect(() => new GifWriter(W, H, GIF_FPS).finish()).toThrow('A GIF needs at least one frame.');
  });

  it('finds the rectangle that changed', () => {
    const before = new Uint32Array(6 * 4);
    const after = before.slice();
    expect(changedRect(before, after, 6, 4)).toBeNull();
    after[1 * 6 + 2] = 1;
    after[2 * 6 + 4] = 1;
    expect(changedRect(before, after, 6, 4)).toEqual({ x: 2, y: 1, w: 3, h: 2 });
  });
});
