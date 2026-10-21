// The Export workspace's PDF documents card: the speaker notes and the references, on Letter or A4, made in
// the page with the code `loopweft export --pdf` runs (here with the fonts read from disk), and the Studio's
// own copies of every font file the PDFs may need.
import { ALL_FONT_FILES, type FileEvent, type Job, notesPdf } from '@loopweft/export';
// The fonts' own entry: the rest of @loopweft/export/node builds pages with Vite, which jsdom cannot host.
import { nodeFonts } from '@loopweft/export/node/fonts';
import { createProject, type Project } from '@loopweft/model';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioContext } from '../src/context.tsx';
import type { Engine } from '../src/export/engine.ts';
import { STUDIO_FONT_FILES } from '../src/export/pdf-fonts.ts';
import { ExportWorkspace } from '../src/export/workspace.tsx';
import { Providers } from '../src/providers.tsx';
import { createStudioStore } from '../src/state/store.ts';
import { example } from './helpers.ts';

afterEach(() => vi.restoreAllMocks());

/** A small map with a two-step story, notes on its scene and one source it cites. */
function small(): Project {
  const p = createProject({ title: 'Small map' });
  p.sources = [{ id: 'S', apa: 'Author, A. (2024). *A book*. Publisher.', label: 'Author (2024)' }];
  p.variables = [
    { id: 'births', label: 'Births', citations: [] },
    { id: 'population', label: 'Population', citations: [] },
  ];
  p.links = [{ id: 'L1', from: 'births', to: 'population', sign: '+', citations: [{ source: 'S' }] }];
  p.layout.positions = { births: { x: 300, y: 300 }, population: { x: 700, y: 300 } };
  p.story.scenes = [
    {
      id: 'S1',
      title: 'Growth',
      targetSeconds: 30,
      notes: '- Say why births matter.',
      sources: [],
      steps: [
        { id: '1', label: 'The map', cue: 'Show the map.', map: {}, overlays: [{ type: 'caption' }] },
        { id: '2', label: 'The link', map: { links: { base: 'dim', active: ['L1'] } }, overlays: [] },
      ],
    },
  ];
  return p;
}

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

describe('the PDF documents card', () => {
  it('makes the speaker notes and the references, on the paper chosen', async () => {
    const saved = downloads();
    // A small project: setting a PDF in jsdom is slow, and the example takes a busy laptop half a minute.
    const project = small();
    render(
      <Providers env="test">
        <StudioContext.Provider value={createStudioStore(project, { name: 'small.loopweft' })}>
          <ExportWorkspace template={async () => ''} fonts={nodeFonts} />
        </StudioContext.Provider>
      </Providers>,
    );
    const user = userEvent.setup();
    const direct = await notesPdf(project, { paper: 'letter', fonts: nodeFonts });
    expect(direct.pages).toBe(1);
    await act(() => user.click(screen.getByRole('button', { name: 'Export PDF…' })));
    expect(
      await screen.findByText(
        /^Last export: small-map-speaker-notes\.pdf, 1 page \(Letter\)/,
        {},
        { timeout: 90_000 },
      ),
    ).toBeTruthy();
    // The same file as the command line's.
    const notes = new Uint8Array(await (saved[0] as { blob: Blob }).blob.arrayBuffer());
    expect(Buffer.from(notes).equals(Buffer.from(direct.bytes))).toBe(true);

    await user.click(screen.getByLabelText('References'));
    await user.click(screen.getByLabelText('A4'));
    await act(() => user.click(screen.getByRole('button', { name: 'Export PDF…' })));
    expect(
      await screen.findByText(
        /^Last export: small-map-references\.pdf, 1 page \(A4\)/,
        {},
        { timeout: 90_000 },
      ),
    ).toBeTruthy();
    const refs = await PDFDocument.load(await (saved[1] as { blob: Blob }).blob.arrayBuffer());
    expect(refs.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(saved.map((s) => s.name)).toEqual(['small-map-speaker-notes.pdf', 'small-map-references.pdf']);
  });

  it('makes the slides from the engine’s picture of every step, and names categories in words if asked', async () => {
    const saved = downloads();
    const project = example();
    const keys = project.story.scenes.flatMap((s) => s.steps.map((t) => `${s.id}.${t.id}`));
    // The smallest whole JPEG: one white pixel, for every step.
    const jpeg = Uint8Array.from(
      atob(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      ),
      (c) => c.charCodeAt(0),
    );
    const jobs: Job[] = [];
    let done = 0;
    const engine: Engine = {
      open: async () => ({ title: project.meta.title, scenes: 11, steps: 70 }),
      start: async (job) => {
        jobs.push(job);
        return '1';
      },
      next: async (): Promise<FileEvent | null> => {
        if (done === keys.length) return null;
        const key = keys[done++] as string;
        return {
          type: 'file',
          name: `${key}.jpeg`,
          key,
          bytes: jpeg,
          done,
          total: keys.length,
          width: 1920,
          height: 1080,
        };
      },
      cancel: async () => undefined,
      dispose: () => undefined,
    };
    render(
      <Providers env="test">
        <StudioContext.Provider value={createStudioStore(project, { name: 'example.loopweft' })}>
          <ExportWorkspace template={async () => ''} fonts={nodeFonts} startEngine={async () => engine} />
        </StudioContext.Provider>
      </Providers>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Slides (70 pages)'));
    // Slides are 16:9 pages: no paper to choose, but categories in words.
    expect(screen.queryByLabelText('A4')).toBeNull();
    const card = screen
      .getByRole('heading', { name: 'PDF documents' })
      .closest('.mantine-Card-root') as HTMLElement;
    const words = within(card).getByLabelText('Name categories in words');
    await user.click(words);
    await act(() => user.click(screen.getByRole('button', { name: 'Export PDF…' })));
    expect(
      await screen.findByText(/^Last export: .*-slides\.pdf, 70 pages \(16:9\)/, {}, { timeout: 90_000 }),
    ).toBeTruthy();
    expect(jobs).toEqual([{ format: 'jpeg', target: { kind: 'steps' }, scale: 1, categoryWords: true }]);
    const doc = await PDFDocument.load(await (saved[0] as { blob: Blob }).blob.arrayBuffer());
    expect(doc.getPageCount()).toBe(70);
    expect(doc.getPage(0).getSize()).toEqual({ width: 1440, height: 810 });
    expect(saved[0]?.name).toBe('global-polycrisis-the-connections-that-change-everything-slides.pdf');
  });

  it('carries every font file the PDFs may need', () => {
    expect([...STUDIO_FONT_FILES.keys()].sort()).toEqual([...ALL_FONT_FILES].sort());
  });
});
