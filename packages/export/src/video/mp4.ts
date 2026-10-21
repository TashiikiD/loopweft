// An MP4 file of H.264 frames, written by Loopweft from the ISO base media file format (ISO/IEC 14496-12 and
// 14496-15) rather than by a muxer library: the libraries stamp the file with the clock's time, and an export
// is the same bytes for the same project. Every time in the file is 0 (no date) or counts frames.
//
// The file is laid out as it is written: `ftyp`, then the frames in one `mdat`, then `moov` (what the frames
// are, and where each one is) once they are all in. Its first bytes (the size of `mdat`) are only known at the
// end, so the writer hands out a head of fixed length at the start and its final bytes at the end.
import { concat, fourcc, u8, u16, u32, u64, utf8 } from './bytes.ts';
import type { EncodedFrame, VideoMeta, VideoTrack, VideoWriter } from './writer.ts';

const box = (type: string, ...payload: Uint8Array[]) => {
  const body = concat(payload);
  return concat([u32(body.length + 8), fourcc(type), body]);
};

/** A "full box": a box whose payload starts with a version and flags. */
const fullBox = (type: string, version: number, flags: number, ...payload: Uint8Array[]) =>
  box(type, u8(version), uint24(flags), ...payload);

const uint24 = (v: number) => u32(v).subarray(1);

const zeros = (n: number) => new Uint8Array(n);

/** The unity matrix every track and movie header carries. */
const MATRIX = concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));

/** Ticks a second in the track's own clock: 512 a frame, as ffmpeg counts. */
const TICKS_PER_FRAME = 512;

/** Colour names, as WebCodecs gives them, and their numbers in an MP4 (ISO/IEC 23091-2). */
const PRIMARIES: Record<string, number> = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
const TRANSFERS: Record<string, number> = {
  bt709: 1,
  smpte170m: 6,
  linear: 8,
  'iec61966-2-1': 13,
  pq: 16,
  hlg: 18,
};
const MATRICES: Record<string, number> = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 };

/** The colour box, when the encoder named all three of its colour's parts. */
function colourBox(track: VideoTrack): Uint8Array[] {
  const c = track.colour;
  const primaries = c?.primaries ? PRIMARIES[c.primaries] : undefined;
  const transfer = c?.transfer ? TRANSFERS[c.transfer] : undefined;
  const matrix = c?.matrix ? MATRICES[c.matrix] : undefined;
  if (primaries === undefined || transfer === undefined || matrix === undefined) return [];
  return [
    box('colr', fourcc('nclx'), u16(primaries), u16(transfer), u16(matrix), u8(c?.fullRange ? 0x80 : 0)),
  ];
}

/** iTunes-style metadata (the title, author and the program that made it), as players show them. */
function metadata(meta: VideoMeta): Uint8Array {
  const item = (name: string, text: string) => box(name, box('data', u32(1), u32(0), utf8(text)));
  const items = [
    item('©nam', meta.title),
    ...(meta.author ? [item('©ART', meta.author)] : []),
    item('©too', meta.program),
  ];
  return box(
    'udta',
    fullBox(
      'meta',
      0,
      0,
      fullBox('hdlr', 0, 0, u32(0), fourcc('mdir'), fourcc('appl'), u32(0), u32(0), u8(0)),
      box('ilst', ...items),
    ),
  );
}

export class Mp4Writer implements VideoWriter {
  readonly #track: VideoTrack;
  readonly #meta: VideoMeta;
  readonly #sizes: number[] = [];
  readonly #keys: number[] = [];
  #body = 0;
  readonly head: Uint8Array;

  constructor(track: VideoTrack, meta: VideoMeta) {
    if (!track.description) throw new Error('An MP4 of H.264 needs the encoder’s description (avcC).');
    this.#track = track;
    this.#meta = meta;
    this.head = this.#head();
  }

  #ftyp(): Uint8Array {
    return box('ftyp', fourcc('isom'), u32(0x200), ...['isom', 'iso2', 'avc1', 'mp41'].map(fourcc));
  }

  /**
   * `ftyp`, then the start of `mdat`: an 8-byte `free` box and the 8-byte `mdat` header. If the frames come
   * to 4 GB or more, the two become one 16-byte header with a 64-bit size, as ffmpeg does.
   */
  #head(): Uint8Array {
    const size = this.#body + 8;
    const mdat =
      size < 2 ** 32
        ? concat([box('free'), u32(size), fourcc('mdat')])
        : concat([u32(1), fourcc('mdat'), u64(this.#body + 16)]);
    return concat([this.#ftyp(), mdat]);
  }

  add(frame: EncodedFrame): Uint8Array[] {
    this.#sizes.push(frame.bytes.length);
    if (frame.key) this.#keys.push(this.#sizes.length);
    this.#body += frame.bytes.length;
    return [frame.bytes];
  }

  finish(): { head: Uint8Array; body: Uint8Array[]; tail: Uint8Array } {
    const frames = this.#sizes.length;
    if (frames === 0) throw new Error('A video needs at least one frame.');
    const t = this.#track;
    const timescale = t.fps * TICKS_PER_FRAME;
    const ms = Math.round((frames * 1000) / t.fps);
    // Where each frame is in the file: after the head, one after another.
    const offsets: number[] = [];
    let at = this.head.length;
    for (const size of this.#sizes) {
      offsets.push(at);
      at += size;
    }
    const wide = at >= 2 ** 32;
    const sampleEntry = box(
      'avc1',
      zeros(6),
      u16(1),
      zeros(16),
      u16(t.width),
      u16(t.height),
      u32(0x480000),
      u32(0x480000),
      u32(0),
      u16(1),
      zeros(32),
      u16(0x18),
      u16(0xffff),
      box('avcC', t.description as Uint8Array),
      ...colourBox(t),
    );
    const stbl = box(
      'stbl',
      fullBox('stsd', 0, 0, u32(1), sampleEntry),
      fullBox('stts', 0, 0, u32(1), u32(frames), u32(TICKS_PER_FRAME)),
      ...(this.#keys.length < frames
        ? [fullBox('stss', 0, 0, u32(this.#keys.length), ...this.#keys.map(u32))]
        : []),
      fullBox('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)),
      fullBox('stsz', 0, 0, u32(0), u32(frames), ...this.#sizes.map(u32)),
      wide
        ? fullBox('co64', 0, 0, u32(frames), ...offsets.map(u64))
        : fullBox('stco', 0, 0, u32(frames), ...offsets.map(u32)),
    );
    const trak = box(
      'trak',
      fullBox(
        'tkhd',
        0,
        3,
        u32(0),
        u32(0),
        u32(1),
        u32(0),
        u32(ms),
        zeros(8),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        MATRIX,
        u32(t.width * 0x10000),
        u32(t.height * 0x10000),
      ),
      box(
        'mdia',
        fullBox(
          'mdhd',
          0,
          0,
          u32(0),
          u32(0),
          u32(timescale),
          u32(frames * TICKS_PER_FRAME),
          u16(0x55c4),
          u16(0),
        ),
        fullBox('hdlr', 0, 0, u32(0), fourcc('vide'), zeros(12), utf8('VideoHandler'), u8(0)),
        box(
          'minf',
          fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)),
          box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
          stbl,
        ),
      ),
    );
    const moov = box(
      'moov',
      fullBox(
        'mvhd',
        0,
        0,
        u32(0),
        u32(0),
        u32(1000),
        u32(ms),
        u32(0x10000),
        u16(0x100),
        zeros(10),
        MATRIX,
        zeros(24),
        u32(2),
      ),
      trak,
      metadata(this.#meta),
    );
    return { head: this.#head(), body: [], tail: moov };
  }
}
