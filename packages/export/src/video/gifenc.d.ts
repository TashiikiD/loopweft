// The parts of gifenc (MIT, https://github.com/mattdesl/gifenc) that Loopweft uses: it ships no types.
declare module 'gifenc' {
  /** Colours, each [r, g, b] (or [r, g, b, a] for "rgba4444"). */
  export type Palette = number[][];
  export type ColorFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: ColorFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean },
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: ColorFormat,
  ): Uint8Array;

  export interface FrameOptions {
    palette?: Palette;
    /** Milliseconds; the file keeps hundredths of a second (the nearest). */
    delay?: number;
    /** On the first frame: -1 plays once, 0 loops for ever. */
    repeat?: number;
    /** Manual mode: the first frame, which writes the screen, its colours and the loop. */
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    colorDepth?: number;
    dispose?: number;
  }

  export interface GifEncoder {
    writeHeader(): void;
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    /** A copy of the bytes written since the last reset. */
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): GifEncoder;
}
