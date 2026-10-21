// What a video plays and for how long, and the MP4 and WebM files the writers make, read back box by box and
// element by element. The encoding itself needs a browser: apps/studio/e2e/export-video.spec.ts.
import { readFileSync } from 'node:fs';
import { createProject, OpError, readProject } from '@loopweft/model';
import { describe, expect, it } from 'vitest';
import {
  checkVideoJob,
  type EncodedFrame,
  holdFrames,
  Mp4Writer,
  toI420,
  type VideoJob,
  type VideoTrack,
  videoPlan,
  videoSize,
  WebmWriter,
} from '../src/index.ts';

const read = readProject(
  readFileSync(new URL('../../../examples/polycrisis.loopweft', import.meta.url), 'utf8'),
);
if (!read.ok) throw new Error('The example does not open.');
const project = read.project;

const job = (over: Partial<VideoJob> = {}): VideoJob => ({
  format: 'mp4',
  target: { kind: 'story' },
  timing: { kind: 'hold', seconds: 3 },
  height: 1080,
  fps: 30,
  categoryWords: false,
  ...over,
});

const refusal = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof OpError) return error.message;
    throw error;
  }
  throw new Error('It was not refused.');
};

describe('what a video plays', () => {
  it('plays every step of the story, each settling when its motion is over', () => {
    const plan = videoPlan(project, job());
    expect(plan.steps).toHaveLength(70);
    expect(plan.steps[0]).toEqual({ sceneIndex: 0, stepIndex: 0, key: 'S00.1', frames: null });
    expect(plan.steps.every((s) => s.frames === null)).toBe(true);
    expect([plan.what, plan.name, plan.frames]).toEqual(['the story', 'story.mp4', null]);
  });

  it('gives each step the talk’s time: until the next is due, and the last until the scene’s target', () => {
    const plan = videoPlan(
      project,
      job({ target: { kind: 'scene', scene: 'S01' }, timing: { kind: 'talk' } }),
    );
    // S01's steps are due at 0, 14, 29 and 44 s, and the scene is meant to take 60 s.
    expect(plan.steps.map((s) => s.frames)).toEqual([420, 450, 450, 480]);
    expect([plan.what, plan.name, plan.frames]).toEqual(['Not a perfect storm', 'S01.mp4', 1800]);
    // The whole talk: its scenes' targets (840 s), and the untimed title page held for 4 s.
    const story = videoPlan(project, job({ timing: { kind: 'talk' }, fps: 60, format: 'webm' }));
    expect(story.frames).toBe(844 * 60);
    expect(story.steps.reduce((n, s) => n + (s.frames ?? 0), 0)).toBe(844 * 60);
    expect(story.name).toBe('story.webm');
  });

  it('counts frames from the running total, so the rounding never adds up', () => {
    const timed = createProject({ title: 'Timed' });
    const at = [0, 0.35, 0.7, 1.05, 1.4];
    timed.story.scenes.push({
      id: 'S1',
      title: 'One',
      sources: [],
      steps: at.map((t, i) => ({ id: String(i + 1), label: `Step ${i + 1}`, at: t, map: {}, overlays: [] })),
    });
    const plan = videoPlan(timed, job({ timing: { kind: 'talk' } }));
    // 0.35 s is 10.5 frames: the steps take 11, 10, 11, 10 frames, and the last its 4 s hold.
    expect(plan.steps.map((s) => s.frames)).toEqual([11, 10, 11, 10, 120]);
    expect(plan.frames).toBe(Math.round((1.4 + 4) * 30));
  });

  it('plays a scene named by its title, and the steps from one to another', () => {
    expect(videoPlan(project, job({ target: { kind: 'scene', scene: 'finding leverage' } })).name).toBe(
      'S08.mp4',
    );
    const steps = videoPlan(project, job({ target: { kind: 'steps', from: 'S04.2a', to: 'S05.1' } }));
    expect(steps.steps.map((s) => s.key)).toEqual([
      'S04.2a',
      'S04.2b',
      'S04.2c',
      'S04.2d',
      'S04.3',
      'S04.4',
      'S04.5',
      'S04.6',
      'S05.1',
    ]);
    expect([steps.what, steps.name]).toEqual(['S04.2a to S05.1', 'S04.2a-to-S05.1.mp4']);
    const one = videoPlan(project, job({ target: { kind: 'steps', from: 'S04.3', to: 'S04.3' } }));
    expect([one.steps.length, one.name]).toEqual([1, 'S04.3.mp4']);
  });

  it('refuses steps out of order, a scene or story with no steps, and a step that is not there', () => {
    expect(
      refusal(() => videoPlan(project, job({ target: { kind: 'steps', from: 'S05.1', to: 'S04.2a' } }))),
    ).toBe('S04.2a comes before S05.1 in the story; name the first step of the video first.');
    const empty = createProject({ title: 'Empty' });
    expect(refusal(() => videoPlan(empty, job()))).toBe(
      'The story has no steps yet, so there is nothing to play.',
    );
    empty.story.scenes.push({ id: 'S1', title: 'Nothing yet', sources: [], steps: [] });
    expect(refusal(() => videoPlan(empty, job({ target: { kind: 'scene', scene: 'S1' } })))).toBe(
      'Scene S1 has no steps yet, so there is nothing to play.',
    );
    expect(
      refusal(() => videoPlan(project, job({ target: { kind: 'steps', from: 'S04.9', to: 'S05.1' } }))),
    ).toMatch(/S04/);
  });

  it('refuses sizes, rates, holds and formats it does not make', () => {
    expect(refusal(() => checkVideoJob(job({ height: 900 as 1080 })))).toBe(
      'A video is 1080 (1920 × 1080) or 720 (1280 × 720) pixels high.',
    );
    expect(refusal(() => checkVideoJob(job({ fps: 25 as 30 })))).toBe(
      'A video runs at 30 or 60 frames a second.',
    );
    expect(refusal(() => checkVideoJob(job({ timing: { kind: 'hold', seconds: -1 } })))).toBe(
      'The hold after each step is 0 to 60 seconds, not -1.',
    );
    expect(refusal(() => checkVideoJob(job({ timing: { kind: 'hold', seconds: 61 } })))).toBe(
      'The hold after each step is 0 to 60 seconds, not 61.',
    );
    expect(refusal(() => checkVideoJob(job({ format: 'gif' as 'mp4' })))).toBe(
      'Video is MP4 or WebM, not "gif".',
    );
    expect(() => checkVideoJob(job({ height: 720, fps: 60, timing: { kind: 'talk' } }))).not.toThrow();
  });

  it('holds for whole frames, at least the one that shows the step settled', () => {
    expect([holdFrames(3, 30), holdFrames(3, 60), holdFrames(0, 30), holdFrames(0.01, 30)]).toEqual([
      90, 180, 1, 1,
    ]);
    expect([videoSize(1080), videoSize(720)]).toEqual([
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
    ]);
  });
});

/** Frames of made-up bytes: a key frame every `every`, the others smaller. */
function frames(count: number, every: number): EncodedFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    key: i % every === 0,
    bytes: Uint8Array.from(
      { length: i % every === 0 ? 300 + i : 40 + (i % 7) },
      (_, j) => (i * 31 + j) % 256,
    ),
  }));
}

/** A whole file from a writer: its head, what each frame added, the rest, with the final head in place. */
function write(writer: Mp4Writer | WebmWriter, list: EncodedFrame[]): Uint8Array {
  const parts: Uint8Array[] = [writer.head];
  for (const frame of list) parts.push(...writer.add(frame));
  const end = writer.finish();
  expect(end.head.length).toBe(writer.head.length);
  parts.push(...end.body, end.tail);
  parts[0] = end.head;
  return Uint8Array.from(parts.flatMap((p) => [...p]));
}

const track = (over: Partial<VideoTrack> = {}): VideoTrack => ({
  width: 1920,
  height: 1080,
  fps: 30,
  codec: 'avc1.640028',
  description: Uint8Array.from([1, 100, 0, 40, 255, 225, 0, 4, 103, 100, 0, 40, 1, 0, 4, 104, 238, 60, 128]),
  colour: { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false },
  ...over,
});

const META = { title: 'Global Polycrisis · Not a perfect storm', author: 'A. Author', program: 'Loopweft' };

interface Box {
  type: string;
  start: number;
  /** Where its payload starts and ends. */
  body: number;
  end: number;
}

/** The boxes between `from` and `to`, as an MP4 reader finds them. */
function boxes(file: Uint8Array, from = 0, to = file.length): Box[] {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const out: Box[] = [];
  for (let at = from; at < to; ) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(...file.subarray(at + 4, at + 8));
    let body = at + 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      body = at + 16;
    }
    expect(size, type).toBeGreaterThanOrEqual(8);
    out.push({ type, start: at, body, end: at + size });
    at += size;
  }
  return out;
}

/** The box at a path of types, e.g. ["moov", "trak", "mdia", "mdhd"]; full boxes skip their 4 header bytes. */
function find(file: Uint8Array, path: string[], from = 0, to = file.length): Box {
  const [first, ...rest] = path;
  const found = boxes(file, from, to).find((b) => b.type === first);
  if (!found) throw new Error(`No ${first} box.`);
  if (rest.length === 0) return found;
  const skip = { meta: 4, stsd: 8, dref: 8 }[first as string] ?? 0;
  return find(file, rest, found.body + skip, found.end);
}

describe('the MP4 writer', () => {
  const list = frames(95, 60);
  const file = write(new Mp4Writer(track(), META), list);
  const view = new DataView(file.buffer);
  const u32 = (at: number) => view.getUint32(at);

  it('lays the file out as ftyp, free, mdat (the frames) and moov', () => {
    expect(boxes(file).map((b) => b.type)).toEqual(['ftyp', 'free', 'mdat', 'moov']);
    const mdat = find(file, ['mdat']);
    expect(mdat.end - mdat.body).toBe(list.reduce((n, f) => n + f.bytes.length, 0));
    expect(String.fromCharCode(...file.subarray(8, 12))).toBe('isom');
  });

  it('says where every frame is, how big, and which are key frames', () => {
    const stsz = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsz']);
    const stco = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco']);
    const stss = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stss']);
    const stts = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stts']);
    expect(u32(stsz.body + 8)).toBe(95);
    list.forEach((frame, i) => {
      const size = u32(stsz.body + 12 + 4 * i);
      const offset = u32(stco.body + 8 + 4 * i);
      expect(size).toBe(frame.bytes.length);
      expect(file.subarray(offset, offset + size)).toEqual(frame.bytes);
    });
    expect([u32(stss.body + 4), u32(stss.body + 8), u32(stss.body + 12)]).toEqual([2, 1, 61]);
    // One run of 95 frames, 512 ticks each, of a clock of 30 × 512 ticks a second.
    expect([u32(stts.body + 4), u32(stts.body + 8), u32(stts.body + 12)]).toEqual([1, 95, 512]);
    const mdhd = find(file, ['moov', 'trak', 'mdia', 'mdhd']);
    expect([u32(mdhd.body + 4), u32(mdhd.body + 8), u32(mdhd.body + 12), u32(mdhd.body + 16)]).toEqual([
      0,
      0,
      15360,
      95 * 512,
    ]);
  });

  it('gives its length in milliseconds and no date: every time stamp is 0', () => {
    const mvhd = find(file, ['moov', 'mvhd']);
    expect([u32(mvhd.body + 4), u32(mvhd.body + 8), u32(mvhd.body + 12), u32(mvhd.body + 16)]).toEqual([
      0,
      0,
      1000,
      Math.round((95 * 1000) / 30),
    ]);
    const tkhd = find(file, ['moov', 'trak', 'tkhd']);
    expect([u32(tkhd.body + 4), u32(tkhd.body + 8), u32(tkhd.body + 12)]).toEqual([0, 0, 1]);
    expect([u32(tkhd.body + 76) / 65536, u32(tkhd.body + 80) / 65536]).toEqual([1920, 1080]);
  });

  it('carries the encoder’s description, the colour, and the title, author and program', () => {
    const entry = find(file, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'avc1']);
    const inner = boxes(file, entry.body + 78, entry.end);
    expect(inner.map((b) => b.type)).toEqual(['avcC', 'colr']);
    const avcC = inner[0] as Box;
    expect(file.subarray(avcC.body, avcC.end)).toEqual(track().description);
    const colr = inner[1] as Box;
    expect([...file.subarray(colr.body, colr.end)]).toEqual([110, 99, 108, 120, 0, 1, 0, 1, 0, 1, 0]);
    const udta = find(file, ['moov', 'udta']);
    const text = new TextDecoder().decode(file.subarray(udta.body, udta.end));
    expect(text).toContain('Global Polycrisis · Not a perfect storm');
    expect(text).toContain('A. Author');
    expect(text).toContain('Loopweft');
  });

  it('is the same bytes for the same frames', () => {
    expect(write(new Mp4Writer(track(), META), frames(95, 60))).toEqual(file);
  });

  it('leaves out a colour it cannot name, and the key frame list when every frame is one', () => {
    const plain = write(
      new Mp4Writer(track({ colour: { primaries: 'bt709', transfer: null } }), META),
      frames(3, 1),
    );
    const entry = find(plain, ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'avc1']);
    expect(boxes(plain, entry.body + 78, entry.end).map((b) => b.type)).toEqual(['avcC']);
    const stbl = find(plain, ['moov', 'trak', 'mdia', 'minf', 'stbl']);
    expect(boxes(plain, stbl.body, stbl.end).map((b) => b.type)).toEqual([
      'stsd',
      'stts',
      'stsc',
      'stsz',
      'stco',
    ]);
  });
});

interface Element {
  id: number;
  start: number;
  body: number;
  end: number;
}

/** The size or id at `at`: its value and its length in bytes. */
function vint(file: Uint8Array, at: number, keepMarker: boolean): { value: number; length: number } {
  const first = file[at] as number;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  let value = keepMarker ? first : first & (0xff >> length);
  for (let i = 1; i < length; i++) value = value * 256 + (file[at + i] as number);
  return { value, length };
}

function elements(file: Uint8Array, from: number, to: number): Element[] {
  const out: Element[] = [];
  for (let at = from; at < to; ) {
    const id = vint(file, at, true);
    const size = vint(file, at + id.length, false);
    const body = at + id.length + size.length;
    out.push({ id: id.value, start: at, body, end: body + size.value });
    at = body + size.value;
  }
  return out;
}

const uintOf = (file: Uint8Array, e: Element) => {
  let v = 0;
  for (let i = e.body; i < e.end; i++) v = v * 256 + (file[i] as number);
  return v;
};

describe('the WebM writer', () => {
  const list = frames(95, 60);
  const vp9 = track({ codec: 'vp09.00.40.08' });
  const { description: _, ...withoutDescription } = vp9;
  const file = write(new WebmWriter(withoutDescription, META), list);
  const top = elements(file, 0, file.length);
  const segment = top[1] as Element;
  const inside = elements(file, segment.body, segment.end);
  const named = (id: number) => inside.filter((e) => e.id === id);

  it('is an EBML header and one Segment that runs to the end of the file', () => {
    expect(top.map((e) => e.id)).toEqual([0x1a45dfa3, 0x18538067]);
    expect(new TextDecoder().decode(file.subarray(0, top[0]?.end))).toContain('webm');
    expect(segment.end).toBe(file.length);
    expect(inside.map((e) => e.id)).toEqual([
      0x114d9b74, 0x1549a966, 0x1654ae6b, 0x1f43b675, 0x1f43b675, 0x1c53bb6b,
    ]);
  });

  it('holds every frame in a Cluster from each key frame, its time in milliseconds', () => {
    const clusters = named(0x1f43b675);
    const blocks = clusters.flatMap((c) => elements(file, c.body, c.end).filter((e) => e.id === 0xa3));
    expect(blocks).toHaveLength(95);
    blocks.forEach((block, i) => {
      expect(file.subarray(block.body + 4, block.end)).toEqual(list[i]?.bytes);
      expect((file[block.body + 3] as number) & 0x80 ? 'key' : 'delta').toBe(i % 60 === 0 ? 'key' : 'delta');
    });
    const times = clusters.map((c) => uintOf(file, elements(file, c.body, c.end)[0] as Element));
    expect(times).toEqual([0, 2000]);
  });

  it('puts its length in the Info, and the Cues where the Clusters start', () => {
    const info = elements(
      file,
      (named(0x1549a966)[0] as Element).body,
      (named(0x1549a966)[0] as Element).end,
    );
    const duration = info.find((e) => e.id === 0x4489) as Element;
    expect(new DataView(file.buffer).getFloat64(duration.body)).toBeCloseTo((95 * 1000) / 30, 9);
    const cues = named(0x1c53bb6b)[0] as Element;
    const points = elements(file, cues.body, cues.end);
    const positions = points.map((p) => {
      const track = elements(file, p.body, p.end).find((e) => e.id === 0xb7) as Element;
      return uintOf(file, elements(file, track.body, track.end).find((e) => e.id === 0xf1) as Element);
    });
    expect(positions.map((p) => segment.body + p)).toEqual(named(0x1f43b675).map((c) => c.start));
    // The SeekHead finds the Cues too.
    const seeks = elements(
      file,
      (named(0x114d9b74)[0] as Element).body,
      (named(0x114d9b74)[0] as Element).end,
    );
    const last = elements(file, (seeks[2] as Element).body, (seeks[2] as Element).end);
    expect(segment.body + uintOf(file, last[1] as Element)).toBe(cues.start);
  });

  it('is the same bytes for the same frames', () => {
    expect(write(new WebmWriter(withoutDescription, META), frames(95, 60))).toEqual(file);
  });
});

describe('the frames as the encoder takes them (I420)', () => {
  /** A 2 × 2 frame of one colour, as I420: its brightness and its one pair of colour samples. */
  const of = (r: number, g: number, b: number) => [
    ...toI420(
      Uint8Array.from({ length: 16 }, (_, i) => [r, g, b, 255][i % 4] as number),
      2,
      2,
    ),
  ];

  it('puts BT.709 colours in the video range, a grey without colour', () => {
    expect(of(255, 255, 255)).toEqual([235, 235, 235, 235, 128, 128]);
    expect(of(0, 0, 0)).toEqual([16, 16, 16, 16, 128, 128]);
    expect(of(128, 128, 128)).toEqual([126, 126, 126, 126, 128, 128]);
    // BT.709's red, green and blue (63/102/240, 173/42/26, 32/240/118), each within one step.
    expect(of(255, 0, 0)).toEqual([63, 63, 63, 63, 102, 240]);
    expect(of(0, 255, 0)).toEqual([172, 172, 172, 172, 42, 26]);
    expect(of(0, 0, 255)).toEqual([32, 32, 32, 32, 240, 118]);
  });

  it('takes each colour sample from its 2 × 2 block, and refuses an odd size', () => {
    const rgba = new Uint8Array(4 * 2 * 4);
    // A 4 × 2 frame: the left block white, the right block black.
    for (const i of [0, 1, 4, 5]) rgba.set([255, 255, 255, 255], i * 4);
    const out = [...toI420(rgba, 4, 2)];
    expect(out.slice(0, 8)).toEqual([235, 235, 16, 16, 235, 235, 16, 16]);
    expect(out.slice(8)).toEqual([128, 128, 128, 128]);
    expect(() => toI420(new Uint8Array(3 * 2 * 4), 3, 2)).toThrow(
      'An I420 frame has an even width and height.',
    );
  });
});
