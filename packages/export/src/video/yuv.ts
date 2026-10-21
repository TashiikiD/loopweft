// A frame's pixels as a video encoder takes them: I420 (a full-size brightness plane, then two colour planes at
// half the width and height), BT.709 colours in the video range (16 to 235), each colour sample the mean of
// a 2 × 2 block. Loopweft converts frames itself: a browser asked to convert a frame's pixels for its encoder
// can give slightly different bytes from one run to the next (Chrome does where it has no graphics card),
// and the same frames must make the same file.

/** How the frames' colours are named to the encoder (and so in the file): BT.709, sRGB's tone curve. */
export const I420_COLOUR = {
  primaries: 'bt709',
  transfer: 'iec61966-2-1',
  matrix: 'bt709',
  fullRange: false,
} as const;

/**
 * RGBA pixels (as a canvas gives them) as I420. The weights are BT.709's, times 219/255 (brightness) or
 * 224/255 (colour) and 256, rounded so that a grey has no colour.
 */
export function toI420(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  if (width % 2 !== 0 || height % 2 !== 0) throw new Error('An I420 frame has an even width and height.');
  if (rgba.length !== width * height * 4)
    throw new Error(`A frame of ${width} × ${height} has ${width * height * 4} bytes.`);
  const area = width * height;
  const out = new Uint8Array(area + area / 2);
  for (let i = 0, p = 0; i < area; i++, p += 4) {
    out[i] =
      ((47 * (rgba[p] as number) + 157 * (rgba[p + 1] as number) + 16 * (rgba[p + 2] as number) + 128) >> 8) +
      16;
  }
  const half = width / 2;
  const u = area;
  const v = area + area / 4;
  for (let y = 0; y < height / 2; y++) {
    for (let x = 0; x < half; x++) {
      const a = (2 * y * width + 2 * x) * 4;
      const b = a + width * 4;
      const r = (rgba[a] as number) + (rgba[a + 4] as number) + (rgba[b] as number) + (rgba[b + 4] as number);
      const g =
        (rgba[a + 1] as number) + (rgba[a + 5] as number) + (rgba[b + 1] as number) + (rgba[b + 5] as number);
      const bl =
        (rgba[a + 2] as number) + (rgba[a + 6] as number) + (rgba[b + 2] as number) + (rgba[b + 6] as number);
      out[u + y * half + x] = ((-26 * r - 86 * g + 112 * bl + 512) >> 10) + 128;
      out[v + y * half + x] = ((112 * r - 102 * g - 10 * bl + 512) >> 10) + 128;
    }
  }
  return out;
}
