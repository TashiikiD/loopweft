// The Export workspace's Video card, with a stand-in engine (the real one plays the story in a browser:
// apps/studio/e2e/export-video.spec.ts): the job it asks for, the file it saves from the pieces, and what it
// says when this browser cannot encode video.
import type { Job, JobEvent, VideoEndEvent, VideoFormat } from '@loopweft/export';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioContext } from '../src/context.tsx';
import type { Engine } from '../src/export/engine.ts';
import { VideoCard, withHead } from '../src/export/video.tsx';
import { Providers } from '../src/providers.tsx';
import { createStudioStore } from '../src/state/store.ts';
import { example } from './helpers.ts';

afterEach(() => vi.restoreAllMocks());

function downloads() {
  const saved: { name: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  let n = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:${++n}`;
    blobs.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, blob: blobs.get(this.href) as Blob });
  });
  return saved;
}

const bytes = (text: string) => new TextEncoder().encode(text);

/** An engine that "plays" three steps: a head of "head" that becomes "HEAD", then a piece a step. */
function fakeEngine(options: { hold?: Promise<void> } = {}) {
  const jobs: Job[] = [];
  const cancelled: string[] = [];
  let made = 0;
  const end: VideoEndEvent = {
    type: 'video',
    name: 'S01.mp4',
    head: bytes('HEAD'),
    width: 1920,
    height: 1080,
    fps: 30,
    frames: 420,
    seconds: 14,
    size: 16,
    codec: 'avc1.640028',
    notes: [],
    warnings: [],
  };
  const events = (): JobEvent[] => [
    { type: 'data', bytes: bytes('he'), done: 1, total: 3, key: 'S01.1', seconds: 4 },
    { type: 'data', bytes: bytes('ad|one|'), done: 2, total: 3, key: 'S01.2', seconds: 9.5 },
    { type: 'data', bytes: bytes('two|end'), done: 3, total: 3, key: 'S01.3', seconds: 14 },
    { ...end, head: bytes('HEAD') },
  ];
  const engine: Engine = {
    open: async () => ({ title: 'Global Polycrisis', scenes: 11, steps: 70 }),
    start: async (job) => {
      jobs.push(job);
      made = 0;
      return String(jobs.length);
    },
    next: async () => {
      if (made === 2 && options.hold) await options.hold;
      return events()[made++] ?? null;
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
    dispose: () => undefined,
  };
  return { engine, jobs, cancelled, end };
}

function show(engine: Engine, support: Record<VideoFormat, boolean> = { mp4: true, webm: true, gif: true }) {
  render(
    <Providers env="test">
      <StudioContext.Provider value={createStudioStore(example(), { name: 'example.loopweft' })}>
        <VideoCard engine={async () => engine} support={async () => support} />
      </StudioContext.Provider>
    </Providers>,
  );
}

describe('the video card', () => {
  it('plays the story with each step held 3 s, at 1080p and 30 frames a second, unless asked otherwise', async () => {
    const saved = downloads();
    const { engine, jobs } = fakeEngine();
    show(engine);
    const user = userEvent.setup();
    await act(() => user.click(screen.getByRole('button', { name: 'Export MP4…' })));
    expect(
      await screen.findByText(/^Last export: .*-story\.mp4, 0:14 at 1920 × 1080, 30 frames/),
    ).toBeTruthy();
    expect(jobs).toEqual([
      {
        format: 'mp4',
        target: { kind: 'story' },
        timing: { kind: 'hold', seconds: 3 },
        height: 1080,
        fps: 30,
        categoryWords: false,
      },
    ]);
    // The pieces in order, with the final head over the first bytes (across the first two pieces).
    expect(await (saved[0] as { blob: Blob }).blob.text()).toBe('HEAD|one|two|end');
    expect(saved[0]?.name).toBe('global-polycrisis-the-connections-that-change-everything-story.mp4');
  });

  it('plays a scene or steps in the talk’s timing, as WebM at 720p and 60 frames a second', async () => {
    downloads();
    const { engine, jobs } = fakeEngine();
    show(engine);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('WebM (VP9)'));
    await user.click(screen.getByLabelText('One scene'));
    await user.click(screen.getByLabelText("The talk's own timing"));
    await user.click(screen.getByLabelText('1280 × 720'));
    await user.click(screen.getByLabelText('60'));
    await user.click(screen.getByLabelText('Name categories in words'));
    await act(() => user.click(screen.getByRole('button', { name: 'Export WebM…' })));
    expect(await screen.findByText(/^Last export: .*-S00\.webm/)).toBeTruthy();
    expect(jobs[0]).toEqual({
      format: 'webm',
      target: { kind: 'scene', scene: 'S00' },
      timing: { kind: 'talk' },
      height: 720,
      fps: 60,
      categoryWords: true,
    });
    await user.click(screen.getByLabelText('Steps, from one to another'));
    await user.click(screen.getByLabelText("Each step's motion, then a hold"));
    const holdField = screen.getByLabelText('Hold (seconds)');
    await user.clear(holdField);
    await user.type(holdField, '1.5');
    await act(() => user.click(screen.getByRole('button', { name: 'Export WebM…' })));
    expect(await screen.findByText(/^Last export: .*-S00\.1-to-S10\.4\.webm/)).toBeTruthy();
    expect(jobs[1]).toMatchObject({
      target: { kind: 'steps', from: 'S00.1', to: 'S10.4' },
      timing: { kind: 'hold', seconds: 1.5 },
    });
  });

  it('shows how far it has got, and stops on Cancel without saving', async () => {
    const saved = downloads();
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { engine, cancelled } = fakeEngine({ hold });
    show(engine);
    const user = userEvent.setup();
    await act(() => user.click(screen.getByRole('button', { name: 'Export MP4…' })));
    expect(await screen.findByText('Played 2 of 3 steps (last: S01.2): 0:10 of video so far.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    release();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(cancelled).toEqual(['1']);
    expect(saved).toEqual([]);
    expect(screen.queryByText(/^Last export/)).toBeNull();
  });

  it('offers WebM alone when this browser cannot make MP4, and says so when it can make neither', async () => {
    const { engine } = fakeEngine();
    show(engine, { mp4: false, webm: true, gif: true });
    expect(
      await screen.findByText('This browser cannot make MP4: use WebM, or Chrome or Edge.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export WebM…' })).toBeTruthy();
    expect((screen.getByLabelText('MP4 (H.264): plays everywhere') as HTMLInputElement).disabled).toBe(true);
  });

  it('offers a GIF when this browser can make no MP4 or WebM', async () => {
    const { engine } = fakeEngine();
    show(engine, { mp4: false, webm: false, gif: true });
    expect(await screen.findByText('No MP4 or WebM from this browser')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Export GIF…' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('makes a GIF of a scene (never the whole story) at 960 × 540 and 15 frames a second, and warns past 20 MB', async () => {
    downloads();
    const { engine, jobs, end } = fakeEngine();
    end.warnings = ['At 23.4 MB, this GIF is past 20 MB.'];
    show(engine);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('GIF: a short loop that shows wherever an image does'));
    expect((screen.getByLabelText(/^The whole story/) as HTMLInputElement).disabled).toBe(true);
    // No size or rate to choose.
    expect(screen.queryByLabelText('1280 × 720')).toBeNull();
    await act(() => user.click(screen.getByRole('button', { name: 'Export GIF…' })));
    expect(await screen.findByText(/^Last export: .*-S00\.gif/)).toBeTruthy();
    expect(jobs[0]).toEqual({
      format: 'gif',
      target: { kind: 'scene', scene: 'S00' },
      timing: { kind: 'hold', seconds: 3 },
      height: 540,
      fps: 15,
      categoryWords: false,
    });
    expect(screen.getByText('Before you share it')).toBeTruthy();
    expect(screen.getByText('At 23.4 MB, this GIF is past 20 MB.')).toBeTruthy();
  });

  it('puts the head over the first bytes wherever they fell', () => {
    const parts = [bytes(''), bytes('h'), bytes('ead+rest')];
    expect(
      new TextDecoder().decode(Uint8Array.from(withHead(parts, bytes('HEAD')).flatMap((p) => [...p]))),
    ).toBe('HEAD+rest');
    expect(() => withHead([bytes('he')], bytes('HEAD'))).toThrow('The video did not arrive whole.');
  });
});
