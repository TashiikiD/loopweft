// The Export workspace's Pictures card, with a stand-in engine (the real one draws in a browser: see
// apps/studio/e2e/export-pictures.spec.ts): what it asks the engine for, what it saves and under which name,
// the progress and Cancel of every step, the whole map of a project without a story, and the zip itself.

import type { Job, JobEvent } from '@loopweft/export';
import { createProject, type Project, serializeProject } from '@loopweft/model';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioContext } from '../src/context.tsx';
import type { Engine } from '../src/export/engine.ts';
import { zipPictures } from '../src/export/pictures.tsx';
import { ExportWorkspace } from '../src/export/workspace.tsx';
import { Providers } from '../src/providers.tsx';
import { createStudioStore } from '../src/state/store.ts';

function small(): Project {
  const p = createProject({ title: 'Small map' });
  p.variables = [
    { id: 'births', label: 'Births', citations: [] },
    { id: 'population', label: 'Population', citations: [] },
  ];
  p.links = [{ id: 'L1', from: 'births', to: 'population', sign: '+', citations: [] }];
  p.layout.positions = { births: { x: 300, y: 300 }, population: { x: 700, y: 300 } };
  p.story.scenes = [
    {
      id: 'S1',
      title: 'Growth',
      sources: [],
      steps: [
        { id: '1', label: 'The map', map: {}, overlays: [] },
        { id: '2', label: 'The link', map: { links: { base: 'dim', active: ['L1'] } }, overlays: [] },
      ],
    },
  ];
  return p;
}

/** An engine that "draws" each picture as its name's bytes, and remembers what it was asked. */
function fakeEngine(options: { hold?: Promise<void> } = {}) {
  const opened: string[] = [];
  const jobs: Job[] = [];
  const cancelled: string[] = [];
  const engine: Engine = {
    open: async (text) => {
      opened.push(text);
      return { title: 'Small map', scenes: 1, steps: 2 };
    },
    start: async (job) => {
      jobs.push(job);
      return String(jobs.length);
    },
    next: async (id) => {
      const job = jobs[Number(id) - 1] as Job;
      const names =
        job.target.kind === 'map'
          ? ['map.png']
          : job.target.kind === 'steps'
            ? ['S1.1.png', 'S1.2.png']
            : ['S1.2.png'];
      const done = (engine as unknown as { made: Map<string, number> }).made.get(id) ?? 0;
      if (done >= names.length) return null;
      if (done > 0 && options.hold) await options.hold;
      (engine as unknown as { made: Map<string, number> }).made.set(id, done + 1);
      const name = names[done] as string;
      const event: JobEvent = {
        type: 'file',
        name,
        bytes: new TextEncoder().encode(name),
        done: done + 1,
        total: names.length,
        width: 1920 * job.scale,
        height: 1080 * job.scale,
        ...(name === 'map.png' ? {} : { key: name.slice(0, -4) }),
      };
      return event;
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
    dispose: vi.fn(),
  };
  (engine as unknown as { made: Map<string, number> }).made = new Map();
  return { engine, opened, jobs, cancelled };
}

/** Downloads, by name, with their contents (as the browser would save them). */
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

function show(project: Project, engine: Engine) {
  const store = createStudioStore(project, { name: 'small.loopweft' });
  const start = vi.fn(async () => engine);
  const view = render(
    <Providers env="test">
      <StudioContext.Provider value={store}>
        <ExportWorkspace template={async () => ''} startEngine={start} />
      </StudioContext.Provider>
    </Providers>,
  );
  return { store, start, view };
}

afterEach(() => vi.restoreAllMocks());

describe('the Pictures card', () => {
  it('draws the chosen step at the chosen size, and saves it under the map’s name and the step’s key', async () => {
    const saved = downloads();
    const { engine, opened, jobs } = fakeEngine();
    const { start, view } = show(small(), engine);
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Step' }));
    await user.click(await screen.findByRole('option', { name: 'S1.2 · The link' }));
    await user.click(screen.getByLabelText(/^3840 × 2160/));
    await user.click(screen.getByLabelText('Name categories in words'));
    await act(() => user.click(screen.getByRole('button', { name: 'Export PNG…' })));
    expect(await screen.findByText('Last export: small-map-S1.2.png, 3840 × 2160, 0.0 MB.')).toBeTruthy();
    expect(jobs).toEqual([
      { format: 'png', target: { kind: 'step', step: 'S1.2' }, scale: 2, categoryWords: true },
    ]);
    expect(opened).toEqual([serializeProject(small())]);
    expect(saved.map((s) => s.name)).toEqual(['small-map-S1.2.png']);
    expect(await saved[0]?.blob.text()).toBe('S1.2.png');
    // The engine starts once and stays while the workspace is open; it goes with the workspace.
    await act(() => user.click(screen.getByRole('button', { name: 'Export PNG…' })));
    expect(start).toHaveBeenCalledTimes(1);
    view.unmount();
    await vi.waitFor(() => expect(engine.dispose).toHaveBeenCalledTimes(1));
  });

  it('puts every step into one zip, in story order, showing its progress, and can be cancelled', async () => {
    const saved = downloads();
    const { engine, jobs } = fakeEngine();
    show(small(), engine);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Every step (2 pictures in one .zip)'));
    await act(() => user.click(screen.getByRole('button', { name: 'Export pictures…' })));
    expect(
      await screen.findByText('Last export: small-map-steps.zip, 2 pictures of 1920 × 1080, 0.0 MB.'),
    ).toBeTruthy();
    expect(jobs[0]?.target).toEqual({ kind: 'steps' });
    expect(saved.map((s) => s.name)).toEqual(['small-map-steps.zip']);
    const entries = unzipSync(new Uint8Array(await (saved[0] as { blob: Blob }).blob.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(['S1.1.png', 'S1.2.png']);
    expect(new TextDecoder().decode(entries['S1.2.png'])).toBe('S1.2.png');

    // Cancelled after the first picture: nothing is saved.
    let release: () => void = () => undefined;
    const held = fakeEngine({ hold: new Promise<void>((r) => (release = r)) });
    saved.length = 0;
    show(small(), held.engine);
    const cards = screen.getAllByText('Pictures (PNG or SVG)');
    expect(cards).toHaveLength(2);
    const everyStep = screen.getAllByLabelText('Every step (2 pictures in one .zip)')[1] as HTMLElement;
    await user.click(everyStep);
    await act(() =>
      user.click(screen.getAllByRole('button', { name: 'Export pictures…' })[1] as HTMLElement),
    );
    expect(await screen.findByText('Drawn 1 of 2 (last: S1.1).')).toBeTruthy();
    await act(() => user.click(screen.getByRole('button', { name: 'Cancel' })));
    await act(async () => release());
    expect(held.cancelled).toEqual(['1']);
    expect(saved).toEqual([]);
    expect(screen.queryByText(/^Drawn /)).toBeNull();
  });

  it('draws the whole map of a project with no story, trimmed if asked', async () => {
    const saved = downloads();
    const { engine, jobs } = fakeEngine();
    const bare = { ...small(), story: { scenes: [] } };
    show(bare, engine);
    const user = userEvent.setup();
    // Without steps, only the whole map can be drawn.
    expect(screen.getByLabelText('One step')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('The whole map, without the story')).toHaveProperty('checked', true);
    await user.click(screen.getByLabelText('Trim to the map'));
    await act(() => user.click(screen.getByRole('button', { name: 'Export PNG…' })));
    expect(await screen.findByText(/^Last export: small-map-map\.png/)).toBeTruthy();
    expect(jobs[0]?.target).toEqual({ kind: 'map', trim: true });
    expect(saved.map((s) => s.name)).toEqual(['small-map-map.png']);
  });

  it('draws an SVG, with no size to choose, and lists what to know about the drawing', async () => {
    const saved = downloads();
    const { engine, jobs } = fakeEngine();
    const next = engine.next;
    engine.next = async (id) => {
      const event = await next(id);
      return event
        ? { ...event, name: event.name.replace(/\.png$/, '.svg'), notes: ['Glows are filters.'] }
        : null;
    };
    show(small(), engine);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/^SVG: a drawing/));
    expect(screen.queryByLabelText(/^3840 × 2160/)).toBeNull();
    expect(screen.getByLabelText('Every step (2 drawings in one .zip)')).toBeTruthy();
    await act(() => user.click(screen.getByRole('button', { name: 'Export SVG…' })));
    expect(await screen.findByText('Glows are filters.')).toBeTruthy();
    expect(jobs[0]).toEqual({
      format: 'svg',
      target: { kind: 'step', step: 'S1.1' },
      scale: 1,
      categoryWords: false,
    });
    expect(saved.map((s) => s.name)).toEqual(['small-map-S1.1.svg']);
    await user.click(screen.getByLabelText('Every step (2 drawings in one .zip)'));
    await act(() => user.click(screen.getByRole('button', { name: 'Export drawings…' })));
    expect(await screen.findByText(/^Last export: small-map-steps-svg\.zip, 2 drawings of/)).toBeTruthy();
  });

  it('says why a picture could not be made', async () => {
    downloads();
    const { engine } = fakeEngine();
    engine.start = async () => {
      throw new Error('The export page gave up.');
    };
    show(small(), engine);
    const user = userEvent.setup();
    await act(() => user.click(screen.getByRole('button', { name: 'Export PNG…' })));
    expect(await screen.findByText('The export page gave up.')).toBeTruthy();
  });
});

describe('zipPictures', () => {
  it('makes the same zip from the same pictures, dated 1 January 1980, stored as they are', () => {
    const files = [
      { name: 'S1.1.png', bytes: new Uint8Array([1, 2, 3]) },
      { name: 'S1.2.png', bytes: new Uint8Array([4, 5]) },
    ];
    const a = zipPictures(files);
    expect(Buffer.from(zipPictures(files)).equals(Buffer.from(a))).toBe(true);
    // The first entry's local header: stored (method 0), DOS time 00:00:00 and date 1980-01-01 (day 1, month 1).
    const view = new DataView(a.buffer, a.byteOffset, a.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint16(10, true)).toBe(0);
    expect(view.getUint16(12, true)).toBe((0 << 9) | (1 << 5) | 1);
    expect(Object.keys(unzipSync(a))).toEqual(['S1.1.png', 'S1.2.png']);
  });
});
