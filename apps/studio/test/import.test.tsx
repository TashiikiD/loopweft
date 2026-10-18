// The import wizard in jsdom, on the importers' own synthetic test files: a links table mapped and
// checked, a Kumu blueprint with its signs, a DataViz project, and imports that stop with their problems.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '@loopweft/model';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app.tsx';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore, type StudioStore } from '../src/state/store.ts';

// A path, not a URL: under jsdom the global URL is jsdom's, which Node's file functions refuse.
const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/model/test/fixtures/import',
);
const fixture = (name: string) => new File([readFileSync(join(FIXTURES, name))], name);

function renderStudio() {
  const store: StudioStore = createStudioStore(createProject({ title: 'Untitled map' }), null);
  render(<App store={store} recovery={memoryRecovery()} env="test" />);
  return { store, user: userEvent.setup() };
}

/** Drops a file on the Studio's window, as from the desktop. */
async function drop(file: File) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files: [file], types: ['Files'] } });
  await act(async () => {
    window.dispatchEvent(event);
  });
}

const wizard = () => screen.getByRole('dialog', { name: 'Import a map' });
const next = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(within(wizard()).getByRole('button', { name: 'Next' }));

describe('the import wizard', () => {
  it('imports a links table: the columns guessed, one left out, checked, then opened as a new map', async () => {
    const { store, user } = renderStudio();
    await drop(fixture('links.csv'));
    expect(await within(wizard()).findByText('A table (CSV).')).toBeTruthy();
    await next(user);

    const goes = (column: string) =>
      within(wizard()).getByRole('combobox', { name: `Where "${column}" goes` }) as HTMLInputElement;
    expect(goes('Cause').value).toBe('From (the cause)');
    expect(goes('Polarity').value).toBe('Sign');
    expect(goes('Mechanism').value).toBe('Rationale');
    expect(goes('Evidence').value).toBe('A custom field');
    await user.click(goes('Notes'));
    await user.click(within(wizard()).getByRole('option', { name: 'Leave out' }));
    expect(goes('Notes').value).toBe('Leave out');
    await next(user);

    expect(within(wizard()).getByRole('status').textContent).toBe(
      '4 variables, 5 links, 0 categories and 1 custom field.',
    );
    const notes = within(wizard()).getByRole('list', { name: 'What the import says' }).textContent ?? '';
    expect(notes).toContain('Left out the column "Notes" of links.csv, as chosen.');
    expect(notes).toContain('Read links.csv as links.');
    expect(notes).toMatch(/Laid out the map with the force layout \(seed 1337\)/);

    await user.click(within(wizard()).getByRole('button', { name: 'Open the imported map' }));
    const project = store.getState().project;
    expect(project.meta.title).toBe('links');
    expect(project.meta.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(project.links.map((l) => l.sign)).toEqual(['+', '-', '+', '-', '?']);
    expect(project.types.fields.map((f) => f.id)).toEqual(['evidence']);
    expect(store.getState().saved).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Import a map' })).toBeNull();
  });

  it('says what a mapping still needs before going on', async () => {
    const { user } = renderStudio();
    await drop(new File(['From,To,Sign\nA,B,+\n'], 'two.csv'));
    await within(wizard()).findByText('A table (CSV).');
    await next(user);
    await user.click(within(wizard()).getByRole('combobox', { name: 'Where "From" goes' }));
    await user.click(within(wizard()).getByRole('option', { name: 'Leave out' }));
    expect(
      within(wizard()).getByText("two.csv: Choose the column that holds each link's cause (from)."),
    ).toBeTruthy();
    expect(within(wizard()).getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
  });

  it('stops when a value cannot be read, naming where', async () => {
    const { store, user } = renderStudio();
    await drop(new File(['From,To,Sign\nA,B,sideways\n'], 'odd.csv'));
    await within(wizard()).findByText('A table (CSV).');
    await next(user);
    await next(user);
    const stopped = within(wizard()).getByRole('alert');
    expect(stopped.textContent).toContain('The import stopped');
    expect(stopped.textContent).toMatch(/odd\.csv, row 2/);
    expect(stopped.textContent).toContain('sideways');
    expect(within(wizard()).getByRole('button', { name: 'Open the imported map' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(store.getState().project.meta.title).toBe('Untitled map');
  });

  it('imports a Kumu blueprint, its signs from a connection field', async () => {
    const { store, user } = renderStudio();
    await drop(fixture('kumu-blueprint.json'));
    expect(
      await within(wizard()).findByText('A Kumu map (a JSON blueprint): 4 elements and 5 connections.'),
    ).toBeTruthy();
    await next(user);
    await user.click(within(wizard()).getByRole('combobox', { name: 'Signs come from' }));
    await user.click(within(wizard()).getByRole('option', { name: 'Polarity' }));
    await next(user);
    const notes = within(wizard()).getByRole('list', { name: 'What the import says' }).textContent ?? '';
    expect(notes).toContain('Signs came from the connection field "Polarity".');
    await user.click(within(wizard()).getByRole('button', { name: 'Open the imported map' }));
    const project = store.getState().project;
    expect(project.meta.title).toBe('kumu blueprint');
    expect(project.links.map((l) => `${l.from}>${l.to}${l.sign}`)).toEqual([
      'workload>stress+',
      'stress>sleep_quality-',
      'sleep_quality>performance+',
      'performance>workload-',
      'workload>performance-',
    ]);
  });

  it('imports a DataViz project under its own title, with nothing to choose', async () => {
    const { store, user } = renderStudio();
    await drop(fixture('garden.dataviz.json'));
    expect(await within(wizard()).findByText('A DataViz project.')).toBeTruthy();
    await next(user);
    expect(within(wizard()).getByRole('textbox', { name: 'Title' })).toHaveProperty(
      'placeholder',
      "The project's own title",
    );
    await user.click(within(wizard()).getByRole('button', { name: 'Open the imported map' }));
    expect(store.getState().project.meta.title).toBe('Garden (test data)');
  });
});
