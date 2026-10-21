// Where a video's frames go, one at a time: the browser's encoder and Loopweft's MP4 or WebM writer, or the GIF
// writer. Each hands back its file's bytes as they are made, and its head's final bytes at the end.
import { chooseEncoder, type EncoderChoice, FrameEncoder } from './encode.ts';
import { GIF_HEAD, GifWriter } from './gif.ts';
import { Mp4Writer } from './mp4.ts';
import type { VideoJob } from './plan.ts';
import { videoSize } from './plan.ts';
import { WebmWriter } from './webm.ts';
import type { VideoMeta, VideoWriter } from './writer.ts';

/** The note a video carries when only the graphics card could encode it. */
export const HARDWARE_NOTE =
  'This browser could only encode the video on the graphics card, so exporting it again may not give exactly the same file.';

export interface FrameSink {
  /** The next frame: the canvas, and whether it shows what the frame before did. */
  frame(canvas: HTMLCanvasElement, same: boolean): Promise<void>;
  /** The file's bytes made since the last call, in order. */
  take(): Uint8Array[];
  /** Ends the file: its last bytes, and its head's final bytes (to write over its first). */
  finish(): Promise<{ last: Uint8Array[]; head: Uint8Array; codec: string }>;
  /** What to know about the file. */
  readonly notes: string[];
  close(): void;
}

/** The sink for a job, or an error when this browser cannot make its format. */
export async function openSink(job: VideoJob, meta: VideoMeta): Promise<FrameSink> {
  if (job.format === 'gif') return new GifSink(job);
  const choice = await chooseEncoder(job.format, job.height, job.fps);
  if (!choice)
    throw new Error(
      job.format === 'mp4'
        ? 'This browser cannot make MP4 video (H.264). Export WebM instead, or use Chrome or Edge.'
        : 'This browser cannot make WebM video (VP9). Use Chrome or Edge.',
    );
  return new EncodedSink(job, choice, meta);
}

/** MP4 or WebM: the browser's encoder, then Loopweft's writer. */
class EncodedSink implements FrameSink {
  readonly #job: VideoJob;
  readonly #meta: VideoMeta;
  readonly #encoder: FrameEncoder;
  readonly #pending: Uint8Array[] = [];
  #writer: VideoWriter | null = null;
  readonly notes: string[];

  constructor(job: VideoJob, choice: EncoderChoice, meta: VideoMeta) {
    this.#job = job;
    this.#meta = meta;
    this.#encoder = FrameEncoder.open(choice, job.fps);
    this.notes = choice.hardware ? [HARDWARE_NOTE] : [];
  }

  /** The encoder says what its frames are with the first one; the file starts then. */
  #collect(): void {
    const encoded = this.#encoder.take();
    if (encoded.length === 0) return;
    if (!this.#writer) {
      const track = this.#encoder.track;
      if (!track) throw new Error('The browser’s video encoder did not say what its frames are.');
      this.#writer =
        this.#job.format === 'mp4' ? new Mp4Writer(track, this.#meta) : new WebmWriter(track, this.#meta);
      this.#pending.push(this.#writer.head);
    }
    for (const frame of encoded) this.#pending.push(...this.#writer.add(frame));
  }

  async frame(canvas: HTMLCanvasElement): Promise<void> {
    await this.#encoder.encode(canvas);
    this.#collect();
  }

  take(): Uint8Array[] {
    return this.#pending.splice(0);
  }

  async finish(): Promise<{ last: Uint8Array[]; head: Uint8Array; codec: string }> {
    await this.#encoder.flush();
    this.#collect();
    const writer = this.#writer;
    if (!writer) throw new Error('The browser’s video encoder made no frames.');
    const made = writer.finish();
    return {
      last: [...this.#pending.splice(0), ...made.body, made.tail],
      head: made.head,
      codec: (this.#encoder.track as { codec: string }).codec,
    };
  }

  close(): void {
    this.#encoder.close();
  }
}

/** A GIF: the frames' pixels, each held frame written once. */
class GifSink implements FrameSink {
  readonly #writer: GifWriter;
  readonly #pending: Uint8Array[] = [];
  readonly notes: string[] = [];

  constructor(job: VideoJob) {
    const { width, height } = videoSize(job.height);
    this.#writer = new GifWriter(width, height, job.fps);
  }

  async frame(canvas: HTMLCanvasElement, same: boolean): Promise<void> {
    let pixels: Uint8ClampedArray | null = null;
    if (!same) {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser gives no canvas to read.');
      pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    }
    this.#pending.push(...this.#writer.add(pixels));
  }

  take(): Uint8Array[] {
    return this.#pending.splice(0);
  }

  async finish(): Promise<{ last: Uint8Array[]; head: Uint8Array; codec: string }> {
    return { last: [...this.#pending.splice(0), ...this.#writer.finish()], head: GIF_HEAD, codec: 'gif' };
  }

  close(): void {}
}
