// "Work with an AI agent": the window, from the File menu and from an empty map, and the message it copies.
import { createProject } from '@loopweft/model';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app.tsx';
import { starterText } from '../src/shell/agent-text.ts';
import { memoryRecovery } from '../src/state/recovery.ts';
import { createStudioStore } from '../src/state/store.ts';

describe('the message for an agent', () => {
  it('names the file, how to run the command line, the guide and its rules, and leaves room for the request', () => {
    const text = starterText('garden.loopweft', true);
    expect(text).toContain('Please help me with a Loopweft map, the file garden.loopweft.');
    expect(text).toContain('`npx loopweft`');
    expect(text).toContain('Check that it runs first: `loopweft --version`.');
    expect(text).toContain('do not look for it, clone it or install it yourself');
    expect(text).toContain('Then run `loopweft guide` and follow it.');
    expect(text).toContain('do not search the computer');
    expect(text).toContain('when nothing settles it, write ?');
    expect(text).toContain('in its Basis field: brief, archetype, source, or suggestion');
    expect(text).toContain('never write a page number you have not seen');
    expect(text).toContain('Run `loopweft validate` before any export');
    expect(text).toContain('no warnings but uncited links and ? signs');
    expect(text).toContain('each of your own suggestions one by one');
    expect(text).toContain('I will see your changes as you save them.');
    expect(text.endsWith('What I would like:\n')).toBe(true);
    expect(starterText('garden.loopweft', false)).not.toContain('I will see your changes');
  });
});

describe('the window', () => {
  it('opens from the File menu with the message for this map', async () => {
    const store = createStudioStore(createProject({ title: 'Garden' }), { name: 'garden.loopweft' });
    render(<App store={store} recovery={memoryRecovery()} env="test" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('menuitem', { name: 'Work with an AI agent…' }));
    const dialog = screen.getByRole('dialog', { name: 'Work with an AI agent' });
    const message = within(dialog).getByRole('textbox', { name: 'The message for the agent' });
    expect((message as HTMLTextAreaElement).value).toBe(starterText('garden.loopweft', false));
    expect(within(dialog).getByRole('button', { name: 'Copy agent instructions' })).toBeTruthy();
    // jsdom cannot hold a file, as Firefox and Safari cannot: the window says how to see the changes there.
    expect(within(dialog).getByText(/This browser cannot follow the file/)).toBeTruthy();
    // Its ×, as every dialog's, says what it does.
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Work with an AI agent' })).toBeNull();
  });

  it('opens from an empty map, for a map not saved yet', async () => {
    const store = createStudioStore(createProject({ title: 'Water supply' }), null, false, true);
    render(<App store={store} recovery={memoryRecovery()} env="test" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Work with an AI agent…' }));
    const dialog = screen.getByRole('dialog', { name: 'Work with an AI agent' });
    expect(within(dialog).getByText(/Save the map into a folder of its own/)).toBeTruthy();
    // No file yet, so no file to name: the message waits until the map is saved, and nothing can be copied.
    expect(within(dialog).queryByRole('textbox', { name: 'The message for the agent' })).toBeNull();
    expect(within(dialog).getByText(/appears here once the map is saved/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Copy agent instructions' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(within(dialog).getByRole('button', { name: 'Save the map…' })).toBeTruthy();
    // Saved (here as a download, as Firefox saves), the message names the file.
    act(() => store.getState().markSaved(store.getState().project, { name: 'water-supply.loopweft' }));
    const message = within(dialog).getByRole('textbox', { name: 'The message for the agent' });
    expect((message as HTMLTextAreaElement).value).toContain('the file water-supply.loopweft.');
  });

  it('copies, and when the browser refuses, leaves the message selected and says so', async () => {
    const store = createStudioStore(createProject({ title: 'Garden' }), { name: 'garden.loopweft' });
    render(<App store={store} recovery={memoryRecovery()} env="test" />);
    store.getState().setAgentHelp(true);
    const dialog = await screen.findByRole('dialog', { name: 'Work with an AI agent' });
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(within(dialog).getByRole('button', { name: 'Copy agent instructions' }));
    expect(writeText).toHaveBeenCalledWith(starterText('garden.loopweft', false));
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeTruthy();

    writeText.mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'));
    document.execCommand = () => false;
    await user.click(within(dialog).getByRole('button', { name: 'Copied' }));
    expect(await within(dialog).findByText(/did not let the Studio copy it/)).toBeTruthy();
    const field = within(dialog).getByRole('textbox', {
      name: 'The message for the agent',
    }) as HTMLTextAreaElement;
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
  });
});

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});
