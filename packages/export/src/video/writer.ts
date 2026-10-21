// What the video file writers share: the frames they take, and how they hand out the file's bytes.

/** A frame the encoder made, in order. */
export interface EncodedFrame {
  bytes: Uint8Array;
  /** A key frame: one a player can start from. */
  key: boolean;
}

export interface VideoTrack {
  width: number;
  height: number;
  fps: number;
  /** The encoder's codec string, e.g. "avc1.640028" or "vp09.00.40.08". */
  codec: string;
  /** What a decoder needs before the first frame (H.264's avcC), as the encoder gives it. */
  description?: Uint8Array;
  /** The frames' colour, as the encoder names it (WebCodecs' VideoColorSpace). */
  colour?: {
    primaries?: string | null;
    transfer?: string | null;
    matrix?: string | null;
    fullRange?: boolean | null;
  };
}

/** What a file says about itself (a player's "properties"). */
export interface VideoMeta {
  title: string;
  author?: string;
  /** The program that made it: "Loopweft". */
  program: string;
}

/**
 * Writes a video file as its frames come: `head` first (of its final length, its numbers not yet known), then
 * the bytes `add` hands back, in order, then `finish`'s body and tail. At the end, `finish`'s head takes the
 * place of the first one.
 */
export interface VideoWriter {
  readonly head: Uint8Array;
  add(frame: EncodedFrame): Uint8Array[];
  finish(): { head: Uint8Array; body: Uint8Array[]; tail: Uint8Array };
}
