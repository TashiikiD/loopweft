// The Sources workspace in jsdom: the library, adding a source by hand or from a DOI (the lookup answers from
// recorded Crossref and DataCite replies, never the network), changing and removing one, and the reference list.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CROSSREF_WORKS, createProject, DATACITE_DOIS, lookupDoi, type Project } from '@loopweft/model';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.tsx';
import type { Lookup } from '../src/sources/lookup.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/model/test/fixtures');

/** Crossref and DataCite, answered from their recorded replies: no network. */
const replay = (async (url: string | URL | Request) => {
  const address = String(url);
  const agency = address.startsWith(DATACITE_DOIS) ? 'datacite' : 'crossref';
  const doi = decodeURIComponent(
    address.slice((agency === 'datacite' ? DATACITE_DOIS : CROSSREF_WORKS).length),
  );
  const file = join(FIXTURES, agency, `${doi.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`);
  if (!existsSync(file)) return new Response('Not found', { status: 404 });
  const body = JSON.parse(readFileSync(file, 'utf8')) as { status?: unknown; text?: string };
  if (typeof body.status === 'number') return new Response(body.text ?? '', { status: body.status });
  return new Response(JSON.stringify(body));
}) as typeof fetch;

/** The Studio's lookup, as it runs for real, over the recorded replies. */
const recorded: Lookup = (doi, signal) => lookupDoi(doi, { signal, fetch: replay });

/** A small map with one cited source. */
function cited(): Project {
  const p = createProject({ title: 'Small map' });
  p.variables = [
    { id: 'births', label: 'Births', citations: [{ source: 'T', pages: '3' }] },
    { id: 'population', label: 'Population', citations: [] },
  ];
  p.links = [
    { id: 'L1', from: 'births', to: 'population', sign: '+', citations: [{ source: 'T', pages: '4–5' }] },
  ];
  p.layout.positions = { births: { x: 300, y: 300 }, population: { x: 700, y: 300 } };
  p.sources = [
    { id: 'T', label: 'Test (2020)', apa: 'Test, A. (2020). *A fictitious source for tests*. Test Press.' },
  ];
  return p;
}

async function openSources(project: Project = cited(), lookup: Lookup = recorded) {
  const store: StudioStore = createStudioStore(project, { name: 'small.loopweft' });
  render(<App store={store} recovery={memoryRecovery()} env="test" lookup={lookup} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Sources' }));
  return { store, user };
}

describe('the Sources workspace', () => {
  it('lists the sources with how often each is cited, and shows the one chosen', async () => {
    const { store, user } = await openSources();
    expect(store.getState().workspace).toBe('sources');
    const item = screen.getByRole('listitem', { name: 'Test (2020): 2 citations' });
    await user.click(item);
    expect(screen.getByRole('heading', { name: 'Test (2020)' })).toBeTruthy();
    expect(screen.getByText('Cited by 2')).toBeTruthy();
    expect(screen.getByText('Births → Population')).toBeTruthy();
    // The reference reads with its italics.
    expect(document.querySelector('.lw-reference-preview i')?.textContent).toBe(
      'A fictitious source for tests',
    );
  });

  it('adds a source by hand, offline, and chooses it', async () => {
    const lookup = vi.fn(recorded);
    const { store, user } = await openSources(cited(), lookup);
    await user.click(screen.getByRole('button', { name: 'Add a source' }));
    await user.click(screen.getByRole('radio', { name: 'Enter by hand' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a source' });
    await user.type(
      within(dialog).getByRole('textbox', { name: /^Reference \(APA 7\)/ }),
      'Other, B. (2021). *Another fictitious source*. Test Press.',
    );
    expect(within(dialog).getByText('Left empty: other2021')).toBeTruthy();
    await user.type(within(dialog).getByRole('textbox', { name: 'DOI' }), 'not a doi');
    expect(within(dialog).getByText('Not a DOI: it starts with 10., a number and a slash.')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Add source' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.clear(within(dialog).getByRole('textbox', { name: 'DOI' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'DOI' }), 'https://doi.org/10.1234/other.1');
    await user.click(within(dialog).getByRole('button', { name: 'Add source' }));
    expect(store.getState().project.sources.at(-1)).toEqual({
      id: 'other2021',
      apa: 'Other, B. (2021). *Another fictitious source*. Test Press.',
      doi: '10.1234/other.1',
    });
    expect(store.getState().source).toBe('other2021');
    expect(lookup).not.toHaveBeenCalled();
    expect(store.getState().past.at(-1)?.label).toBe('Added source other2021.');
  });

  it('looks a DOI up, shows the draft and its notes, and adds it as corrected', async () => {
    const { store, user } = await openSources();
    await user.click(screen.getByRole('button', { name: 'Add a source' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a source' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'DOI' }),
      '10.1108/ijccsm-02-2022-0016{Enter}',
    );
    await waitFor(() => expect(within(dialog).getByText('Read before citing')).toBeTruthy());
    expect(within(dialog).getByText(/Crossref records a retraction of this work/)).toBeTruthy();
    const reference = within(dialog).getByRole('textbox', {
      name: /^Reference \(APA 7\)/,
    }) as HTMLTextAreaElement;
    expect(reference.value).toMatch(
      /^Bai, D., Ye, L., Yang, Z., & Wang, G. \(2024\)\. Impact of climate change/,
    );
    await user.type(within(dialog).getByRole('textbox', { name: 'Id' }), 'BAI');
    await user.click(within(dialog).getByRole('button', { name: 'Add source' }));
    expect(store.getState().project.sources.at(-1)).toMatchObject({
      id: 'BAI',
      label: 'Bai et al. (2024)',
      doi: '10.1108/ijccsm-02-2022-0016',
    });
  });

  it('says why a lookup failed and offers to enter the reference by hand', async () => {
    const { user } = await openSources();
    await user.click(screen.getByRole('button', { name: 'Add a source' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a source' });
    await user.type(within(dialog).getByRole('textbox', { name: 'DOI' }), '10.9999/not.registered.anywhere');
    await user.click(within(dialog).getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(within(dialog).getByText('No reference found')).toBeTruthy());
    expect(within(dialog).getByText(/^Neither Crossref nor DataCite has a record of 10\.9999/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Enter it by hand' }));
    expect((within(dialog).getByRole('textbox', { name: 'DOI' }) as HTMLInputElement).value).toBe(
      '10.9999/not.registered.anywhere',
    );
  });

  it('finds a DOI that only DataCite holds, such as the example’s supplement', async () => {
    const { store, user } = await openSources();
    await user.click(screen.getByRole('button', { name: 'Add a source' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a source' });
    await user.type(
      within(dialog).getByRole('textbox', { name: 'DOI' }),
      '10.6084/m9.figshare.c.6858564{Enter}',
    );
    const reference = (await within(dialog).findByRole('textbox', {
      name: /^Reference \(APA 7\)/,
    })) as HTMLTextAreaElement;
    expect(reference.value).toMatch(/\[Collection\]\. The Royal Society\. https:\/\/doi\.org\/10\.6084/);
    await user.click(within(dialog).getByRole('button', { name: 'Add source' }));
    expect(store.getState().project.sources.at(-1)).toMatchObject({
      id: 'søgaardjørgensen2023',
      label: 'Søgaard Jørgensen et al. (2023)',
      doi: '10.6084/m9.figshare.c.6858564',
      licence: 'CC BY 4.0',
    });
  });

  it('changes a source, refuses a DOI that is not one, and removes it with its citations', async () => {
    const { store, user } = await openSources();
    await user.click(screen.getByRole('listitem', { name: 'Test (2020): 2 citations' }));
    const label = screen.getByRole('textbox', { name: 'In-text label' });
    await user.clear(label);
    await user.type(label, 'Test (2020a){Enter}');
    expect(store.getState().project.sources[0]?.label).toBe('Test (2020a)');
    const doi = screen.getByRole('textbox', { name: 'DOI' });
    await user.type(doi, 'nonsense{Enter}');
    expect(store.getState().project.sources[0]?.doi).toBeUndefined();
    expect(await screen.findByText(/“nonsense” is not a DOI/)).toBeTruthy();

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Remove this source' }));
    expect(confirm).toHaveBeenCalledWith('Remove source T with 2 citations? Ctrl+Z brings it back.');
    expect(store.getState().project.sources).toEqual([]);
    expect(store.getState().project.links[0]?.citations).toEqual([]);
    expect(store.getState().source).toBeNull();
  });

  it('shows what cites a source on the map', async () => {
    const { store, user } = await openSources();
    await user.click(screen.getByRole('listitem', { name: 'Test (2020): 2 citations' }));
    const showLink = screen.getAllByRole('button', { name: 'Show on map' })[1] as HTMLElement;
    await user.click(showLink);
    expect(store.getState().workspace).toBe('map');
    expect(store.getState().selection).toEqual({ variables: [], links: ['L1'], loop: null });
  });

  it('shows the reference list made from the sources', async () => {
    const project = cited();
    project.sources.push({ id: 'A', apa: 'Aardvark, Z. (2019). An earlier work. *Journal*, *1*, 1–2.' });
    const { user } = await openSources(project);
    await user.click(screen.getByRole('radio', { name: 'Reference list' }));
    const list = screen.getByRole('list', { name: 'References' });
    expect([...list.querySelectorAll(':scope > li')].map((li) => li.textContent?.slice(0, 12))).toEqual([
      'Aardvark, Z.',
      'Test, A. (20',
    ]);
    expect(
      screen.getByText('2 references, APA 7, made from the sources: change a reference in the library.'),
    ).toBeTruthy();
  });
});
