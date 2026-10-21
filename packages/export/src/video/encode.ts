// The browser's video encoder (WebCodecs), fed the stage's frames one at a time. A software encoder is chosen
// where the browser has one: it gives the same bytes for the same frames on every run, where a graphics
// card's encoder may not.
import type { VideoFormat } from './plan.ts';

/** The formats the browser's encoder makes (a GIF is Loopweft's own, gif.ts). */
export type EncodedFormat = Exclude<VideoFormat, 'gif'>;

import type { EncodedFrame, VideoTrack } from './writer.ts';
import { I420_COLOUR, toI420 } from './yuv.ts';

/** Bits a second, by height and frame rate: enough for the map's thin lines and small text to stay sharp. */
const BITRATES: Record<string, number> = {
  '1080@30': 8_000_000,
  '1080@60': 12_000_000,
  '720@30': 4_000_000,
  '720@60': 6_000_000,
};

/** The codec strings, at the lowest level that holds the size and rate (H.264 High; VP9 profile 0, 8-bit). */
const CODECS: Record<EncodedFormat, Record<string, string>> = {
  mp4: {
    '1080@30': 'avc1.640028',
    '1080@60': 'avc1.64002a',
    '720@30': 'avc1.64001f',
    '720@60': 'avc1.640020',
  },
  webm: {
    '1080@30': 'vp09.00.40.08',
    '1080@60': 'vp09.00.41.08',
    '720@30': 'vp09.00.31.08',
    '720@60': 'vp09.00.40.08',
  },
};

/** A key frame (one a player can start from) every this many seconds. */
export const KEY_SECONDS = 2;

export interface EncoderChoice {
  config: VideoEncoderConfig;
  /** True when only the graphics card's encoder takes it: then two runs may not give the same bytes. */
  hardware: boolean;
}

function configFor(format: EncodedFormat, height: number, fps: number): VideoEncoderConfig {
  const key = `${height}@${fps}`;
  const codec = CODECS[format][key];
  const bitrate = BITRATES[key];
  if (!codec || !bitrate) throw new Error(`No video of ${height} pixels at ${fps} frames a second.`);
  return {
    codec,
    width: Math.round((height * 16) / 9),
    height,
    framerate: fps,
    bitrate,
    bitrateMode: 'variable',
    latencyMode: 'quality',
    ...(format === 'mp4' ? { avc: { format: 'avc' as const } } : {}),
  };
}

/** The encoder this browser offers for a video, software first; null when it has none. */
export async function chooseEncoder(
  format: EncodedFormat,
  height: number,
  fps: number,
): Promise<EncoderChoice | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const base = configFor(format, height, fps);
  for (const hardwareAcceleration of ['prefer-software', 'no-preference'] as const) {
    const config = { ...base, hardwareAcceleration };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return { config, hardware: hardwareAcceleration !== 'prefer-software' };
    } catch {
      // A browser that cannot even judge the config cannot make it.
    }
  }
  return null;
}

/** Which video formats this browser can make (MP4 and WebM at 1080p and 30 frames a second; a GIF always). */
export async function videoSupport(): Promise<Record<VideoFormat, boolean>> {
  const [mp4, webm] = await Promise.all([chooseEncoder('mp4', 1080, 30), chooseEncoder('webm', 1080, 30)]);
  return { mp4: mp4 !== null, webm: webm !== null, gif: true };
}

/** A copy of bytes the encoder lends. */
function copyOf(source: AllowSharedBufferSource): Uint8Array {
  return ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice()
    : new Uint8Array(source).slice();
}

/** Encodes canvases as frames, in order, at a fixed rate; the frames come out of `take`. */
export class FrameEncoder {
  readonly #encoder: VideoEncoder;
  readonly #fps: number;
  readonly #done: EncodedFrame[] = [];
  #track: VideoTrack | null = null;
  #error: Error | null = null;
  #frames = 0;
  /** The last frame's canvas and its pixels as I420. */
  #canvas: HTMLCanvasElement | null = null;
  #i420: Uint8Array | null = null;

  private constructor(choice: EncoderChoice, fps: number) {
    this.#fps = fps;
    this.#encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        this.#done.push({ bytes, key: chunk.type === 'key' });
        const decoder = metadata?.decoderConfig;
        if (decoder && !this.#track) {
          const description = decoder.description ? copyOf(decoder.description) : undefined;
          this.#track = {
            width: choice.config.width,
            height: choice.config.height,
            fps,
            codec: decoder.codec,
            ...(description ? { description } : {}),
            ...(decoder.colorSpace ? { colour: { ...decoder.colorSpace } } : {}),
          };
        }
      },
      error: (error) => {
        this.#error = error instanceof Error ? error : new Error(String(error));
      },
    });
    this.#encoder.configure(choice.config);
  }

  static open(choice: EncoderChoice, fps: number): FrameEncoder {
    return new FrameEncoder(choice, fps);
  }

  /** What the frames are, once the encoder has said (with its first frame). */
  get track(): VideoTrack | null {
    return this.#track;
  }

  #check(): void {
    if (this.#error) throw new Error(`The browser’s video encoder stopped: ${this.#error.message}`);
  }

  /** Encodes the canvas as the next frame; waits while the encoder has a few frames in hand. */
  async encode(canvas: HTMLCanvasElement): Promise<void> {
    this.#check();
    const n = this.#frames++;
    // The frame as I420, converted here (yuv.ts); the same canvas again is the same frame again.
    if (canvas !== this.#canvas) {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser gives no canvas to read.');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      this.#i420 = toI420(pixels, canvas.width, canvas.height);
      this.#canvas = canvas;
    }
    const frame = new VideoFrame(this.#i420 as Uint8Array, {
      format: 'I420',
      codedWidth: canvas.width,
      codedHeight: canvas.height,
      colorSpace: I420_COLOUR,
      timestamp: Math.round((n * 1e6) / this.#fps),
      duration: Math.round(1e6 / this.#fps),
    });
    try {
      this.#encoder.encode(frame, { keyFrame: n % (KEY_SECONDS * this.#fps) === 0 });
    } finally {
      frame.close();
    }
    while (this.#encoder.encodeQueueSize > 4) {
      await new Promise<void>((resolve) =>
        this.#encoder.addEventListener('dequeue', () => resolve(), { once: true }),
      );
      this.#check();
    }
  }

  /** The frames encoded since the last call, in order. */
  take(): EncodedFrame[] {
    this.#check();
    return this.#done.splice(0);
  }

  /** Waits for every frame given to come out. */
  async flush(): Promise<void> {
    await this.#encoder.flush();
    this.#check();
  }

  close(): void {
    if (this.#encoder.state !== 'closed') this.#encoder.close();
  }
}
