// The Export workspace's PDF documents card: the speaker notes and the references, on Letter or A4, made in
// the page with the code `loopweft export --pdf` runs (here with the fonts read from disk), and the Studio's
// own copies of every font file the PDFs may need.
import { ALL_FONT_FILES, notesPdf } from '@loopweft/export';
// The fonts' own entry: the rest of @loopweft/export/node builds pages with Vite, which jsdom cannot host.
import { nodeFonts } from '@loopweft/export/node/fonts';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioContext } from '../src/context.tsx';
import { STUDIO_FONT_FILES } from '../src/export/pdf-fonts.ts';
import { ExportWorkspace } from '../src/export/workspace.tsx';
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

describe('the PDF documents card', () => {
  it('makes the speaker notes and the references, on the paper chosen', async () => {
    const saved = downloads();
    const project = example();
    render(
      <Providers env="test">
        <StudioContext.Provider value={createStudioStore(project, { name: 'example.loopweft' })}>
          <ExportWorkspace template={async () => ''} fonts={nodeFonts} />
        </StudioContext.Provider>
      </Providers>,
    );
    const user = userEvent.setup();
    await act(() => user.click(screen.getByRole('button', { name: 'Export PDF…' })));
    expect(
      await screen.findByText(
        /^Last export: .*-speaker-notes\.pdf, 18 pages \(Letter\)/,
        {},
        { timeout: 30_000 },
      ),
    ).toBeTruthy();
    // The same file as the command line's.
    const notes = new Uint8Array(await (saved[0] as { blob: Blob }).blob.arrayBuffer());
    const direct = await notesPdf(project, { paper: 'letter', fonts: nodeFonts });
    expect(Buffer.from(notes).equals(Buffer.from(direct.bytes))).toBe(true);

    await user.click(screen.getByLabelText('References'));
    await user.click(screen.getByLabelText('A4'));
    await act(() => user.click(screen.getByRole('button', { name: 'Export PDF…' })));
    expect(
      await screen.findByText(/^Last export: .*-references\.pdf, 3 pages \(A4\)/, {}, { timeout: 30_000 }),
    ).toBeTruthy();
    const refs = await PDFDocument.load(await (saved[1] as { blob: Blob }).blob.arrayBuffer());
    expect(refs.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(saved.map((s) => s.name)).toEqual([
      'global-polycrisis-the-connections-that-change-everything-speaker-notes.pdf',
      'global-polycrisis-the-connections-that-change-everything-references.pdf',
    ]);
  });

  it('carries every font file the PDFs may need', () => {
    expect([...STUDIO_FONT_FILES.keys()].sort()).toEqual([...ALL_FONT_FILES].sort());
  });
});
