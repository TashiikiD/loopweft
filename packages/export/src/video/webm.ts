// A WebM file of VP9 frames, written by Loopweft from the Matroska specification (RFC 9559) and WebM's
// subset of it, for a browser that cannot make MP4. As in mp4.ts, nothing in it reads the clock.
//
// Laid out as it is written: the EBML header, then the Segment: SeekHead, Info and Tracks (the head, of fixed
// length), a Cluster from each key frame on, and the Cues (where each Cluster starts) at the end. The head's
// numbers (the Segment's size, the length, where the Cues are) are put in at the end.
import { concat, f64, i16, u8, u64, utf8 } from './bytes.ts';
import type { EncodedFrame, VideoMeta, VideoTrack, VideoWriter } from './writer.ts';

/** An element's id, as the specification writes it (its length marker included). */
function idBytes(id: number): Uint8Array {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256);
  return new Uint8Array(out);
}

/** A size, in the fewest bytes (or exactly `length`). */
function vint(value: number, length?: number): Uint8Array {
  let n = length ?? 1;
  if (length === undefined) while (value >= 2 ** (7 * n) - 1) n++;
  if (n > 8 || value >= 2 ** (7 * n) - 1) throw new RangeError(`${value} is too large for an EBML size.`);
  const out = new Uint8Array(n);
  let v = value;
  for (let i = n - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  out[0] = (out[0] as number) | (0x80 >> (n - 1));
  return out;
}

/** A Segment of a size not known yet, as a live stream writes it. */
const UNKNOWN_SIZE = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

const element = (id: number, ...payload: Uint8Array[]) => {
  const body = concat(payload);
  return concat([idBytes(id), vint(body.length), body]);
};

function uintBytes(value: number): Uint8Array {
  const out: number[] = [];
  for (let v = value; v > 0; v = Math.floor(v / 256)) out.unshift(v % 256);
  return new Uint8Array(out.length > 0 ? out : [0]);
}

const uintElement = (id: number, value: number) => element(id, uintBytes(value));
const textElement = (id: number, text: string) => element(id, utf8(text));

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Info: 0x1549a966,
  Tracks: 0x1654ae6b,
  Cluster: 0x1f43b675,
  Cues: 0x1c53bb6b,
} as const;

/** Colour numbers, as in mp4.ts (Matroska numbers colours as ISO/IEC 23091-2 does). */
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

function colourElement(track: VideoTrack): Uint8Array[] {
  const c = track.colour;
  const primaries = c?.primaries ? PRIMARIES[c.primaries] : undefined;
  const transfer = c?.transfer ? TRANSFERS[c.transfer] : undefined;
  const matrix = c?.matrix ? MATRICES[c.matrix] : undefined;
  if (primaries === undefined || transfer === undefined || matrix === undefined) return [];
  return [
    element(
      0x55b0,
      uintElement(0x55b1, matrix),
      uintElement(0x55b9, c?.fullRange ? 2 : 1),
      uintElement(0x55ba, transfer),
      uintElement(0x55bb, primaries),
    ),
  ];
}

/** The file's first element: it is a WebM file, of version 4, readable as version 2. */
const EBML_HEADER = element(
  ID.EBML,
  uintElement(0x4286, 1),
  uintElement(0x42f7, 1),
  uintElement(0x42f2, 4),
  uintElement(0x42f3, 8),
  textElement(0x4282, 'webm'),
  uintElement(0x4287, 4),
  uintElement(0x4285, 2),
);

interface Cluster {
  ms: number;
  blocks: Uint8Array[];
}

export class WebmWriter implements VideoWriter {
  readonly #track: VideoTrack;
  readonly #meta: VideoMeta;
  #frames = 0;
  #cluster: Cluster | null = null;
  /** Where each Cluster starts, from the first, in bytes, and its time. */
  readonly #cues: { ms: number; at: number }[] = [];
  #clusters = 0;
  readonly head: Uint8Array;

  constructor(track: VideoTrack, meta: VideoMeta) {
    this.#track = track;
    this.#meta = meta;
    this.head = this.#head(null);
  }

  /** The head, with the Segment's size, the length and where the Cues are once they are known. */
  #head(end: { size: number; ms: number; cues: number } | null): Uint8Array {
    const t = this.#track;
    const info = element(
      ID.Info,
      uintElement(0x2ad7b1, 1_000_000),
      element(0x4489, f64(end?.ms ?? 0)),
      textElement(0x4d80, this.#meta.program),
      textElement(0x5741, this.#meta.program),
      textElement(0x7ba9, this.#meta.title),
    );
    const tracks = element(
      ID.Tracks,
      element(
        0xae,
        uintElement(0xd7, 1),
        uintElement(0x73c5, 1),
        uintElement(0x83, 1),
        uintElement(0x9c, 0),
        textElement(0x86, 'V_VP9'),
        uintElement(0x23e383, Math.round(1e9 / t.fps)),
        element(0xe0, uintElement(0xb0, t.width), uintElement(0xba, t.height), ...colourElement(t)),
      ),
    );
    // Positions as 8-byte numbers, so the SeekHead's length never changes.
    const seek = (id: number, at: number) =>
      element(ID.Seek, element(ID.SeekID, idBytes(id)), element(ID.SeekPosition, u64(at)));
    const seekLength = (n: number) =>
      element(ID.SeekHead, ...Array.from({ length: n }, () => seek(ID.Info, 0))).length;
    const before = seekLength(3);
    const seekHead = element(
      ID.SeekHead,
      seek(ID.Info, before),
      seek(ID.Tracks, before + info.length),
      seek(ID.Cues, end?.cues ?? 0),
    );
    return concat([
      EBML_HEADER,
      idBytes(ID.Segment),
      end ? vint(end.size, 8) : UNKNOWN_SIZE,
      seekHead,
      info,
      tracks,
    ]);
  }

  /** How many bytes of the Segment come before the first Cluster: the head after the Segment's id and size. */
  #lead(): number {
    return this.head.length - EBML_HEADER.length - 4 - 8;
  }

  #close(): Uint8Array[] {
    const cluster = this.#cluster;
    if (!cluster) return [];
    this.#cluster = null;
    const bytes = element(ID.Cluster, uintElement(0xe7, cluster.ms), ...cluster.blocks);
    this.#cues.push({ ms: cluster.ms, at: this.#lead() + this.#clusters });
    this.#clusters += bytes.length;
    return [bytes];
  }

  add(frame: EncodedFrame): Uint8Array[] {
    const ms = Math.round((this.#frames * 1000) / this.#track.fps);
    this.#frames++;
    const out: Uint8Array[] = [];
    // A Cluster from each key frame, and whenever a frame's time is too far from its Cluster's to be written.
    if (frame.key || !this.#cluster || ms - this.#cluster.ms > 32767) {
      out.push(...this.#close());
      this.#cluster = { ms, blocks: [] };
    }
    const cluster = this.#cluster as Cluster;
    cluster.blocks.push(
      element(0xa3, new Uint8Array([0x81]), i16(ms - cluster.ms), u8(frame.key ? 0x80 : 0), frame.bytes),
    );
    return out;
  }

  finish(): { head: Uint8Array; body: Uint8Array[]; tail: Uint8Array } {
    if (this.#frames === 0) throw new Error('A video needs at least one frame.');
    const body = this.#close();
    const cues = element(
      ID.Cues,
      ...this.#cues.map(({ ms, at }) =>
        element(0xbb, uintElement(0xb3, ms), element(0xb7, uintElement(0xf7, 1), uintElement(0xf1, at))),
      ),
    );
    const lead = this.#lead();
    const ms = (this.#frames * 1000) / this.#track.fps;
    const head = this.#head({ size: lead + this.#clusters + cues.length, ms, cues: lead + this.#clusters });
    if (head.length !== this.head.length) throw new Error('The WebM head changed its length.');
    return { head, body, tail: cues };
  }
}
