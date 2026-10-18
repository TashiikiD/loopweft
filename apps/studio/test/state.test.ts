// The Studio's state without a screen: structural sharing, the store's undo and redo, saving and opening
// files, and crash recovery.
import {
  addLink,
  addVariable,
  createProject,
  OpError,
  readProject,
  removeVariable,
  serializeProject,
  setVariable,
} from '@loopweft/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { download, fileNameFor, readMap, saveMap, today } from '../src/state/files.ts';
import { HISTORY_LIMIT, share } from '../src/state/history.ts';
import { memoryRecovery, watchRecovery } from '../src/state/recovery.ts';
import { createStudioStore, isDirty } from '../src/state/store.ts';
import { example } from './helpers.ts';

describe('sharing unchanged parts between steps', () => {
  it('keeps what did not change, and makes new only what did', () => {
    const before = example();
    const after = setVariable(before, 'food_insecurity', { size: null }).project;
    const shared = share(before, after);
    expect(shared).not.toBe(before);
    expect(shared.links).toBe(before.links);
    expect(shared.story).toBe(before.story);
    expect(shared.variables).not.toBe(before.variables);
    const index = before.variables.findIndex((v) => v.id === 'food_insecurity');
    expect(shared.variables[index]).not.toBe(before.variables[index]);
    expect(shared.variables[index + 1]).toBe(before.variables[index + 1]);
    expect(serializeProject(shared)).toBe(serializeProject(after));
  });

  it('gives back the old project itself when nothing changed', () => {
    const before = example();
    expect(share(before, structuredClone(before))).toBe(before);
  });

  it("keeps the new key order, so the file's canonical order is the new one", () => {
    expect(Object.keys(share({ a: 1, b: 2 }, { b: 2, a: 1 }))).toEqual(['b', 'a']);
  });
});

describe('the store', () => {
  const start = () => createStudioStore(createProject({ title: 'Test' }));

  it('applies an operation as one step, and undoes and redoes it', () => {
    const store = start();
    const out = store.getState().edit((p) => addVariable(p, { label: 'Births' }));
    expect(out.result).toEqual({ id: 'births' });
    expect(store.getState().project.variables.map((v) => v.id)).toEqual(['births']);
    expect(store.getState().past.map((e) => e.label)).toEqual(['Added variable births ("Births").']);
    expect(store.getState().undo()).toBe('Added variable births ("Births").');
    expect(store.getState().project.variables).toEqual([]);
    expect(store.getState().redo()).toBe('Added variable births ("Births").');
    expect(store.getState().project.variables.map((v) => v.id)).toEqual(['births']);
    expect(store.getState().undo()).not.toBeNull();
    expect(store.getState().undo()).toBeNull();
  });

  it('leaves everything as it was when an operation refuses', () => {
    const store = start();
    store.getState().edit((p) => addVariable(p, { label: 'A' }));
    const before = store.getState();
    expect(() => store.getState().edit((p) => addVariable(p, { id: 'a', label: 'Again' }))).toThrow(OpError);
    expect(store.getState().project).toBe(before.project);
    expect(store.getState().past).toBe(before.past);
  });

  it('records no step for an operation that changes nothing', () => {
    const store = start();
    store.getState().edit((p) => addVariable(p, { label: 'A' }));
    store.getState().edit((p) => setVariable(p, 'a', { label: 'A' }));
    expect(store.getState().past).toHaveLength(1);
  });

  it('runs several operations as one step', () => {
    const store = start();
    store
      .getState()
      .editAll(
        [
          (p) => addVariable(p, { label: 'A' }),
          (p) => addVariable(p, { label: 'B' }),
          (p) => addLink(p, { from: 'a', to: 'b', sign: '+' }),
        ],
        'Add two variables and a link',
      );
    expect(store.getState().past.map((e) => e.label)).toEqual(['Add two variables and a link']);
    store.getState().undo();
    expect(store.getState().project.variables).toEqual([]);
  });

  it('keeps only what still exists selected, and brings back the selection of a step undone', () => {
    const store = start();
    store.getState().edit((p) => addVariable(p, { label: 'A' }));
    store.getState().select({ variables: ['a', 'ghost'] });
    expect(store.getState().selection.variables).toEqual(['a']);
    store.getState().edit((p) => removeVariable(p, 'a'));
    expect(store.getState().selection.variables).toEqual([]);
    store.getState().undo();
    expect(store.getState().selection.variables).toEqual(['a']);
  });

  it('knows when there are unsaved changes, including after undoing back to the saved map', () => {
    const store = createStudioStore(createProject({ title: 'Saved' }));
    expect(isDirty(store.getState())).toBe(false);
    store.getState().edit((p) => addVariable(p, { label: 'A' }));
    expect(isDirty(store.getState())).toBe(true);
    store.getState().undo();
    expect(isDirty(store.getState())).toBe(false);
    expect(isDirty(createStudioStore(createProject({ title: 'New' }), null, false).getState())).toBe(true);
  });

  it('starts the history again for each map opened', () => {
    const store = start();
    store.getState().edit((p) => addVariable(p, { label: 'A' }));
    store.getState().open(example(), { name: 'polycrisis.loopweft' });
    expect(store.getState()).toMatchObject({ past: [], future: [], generation: 1 });
    expect(store.getState().file?.name).toBe('polycrisis.loopweft');
  });

  it(`keeps the last ${HISTORY_LIMIT} steps`, () => {
    const store = start();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++)
      store.getState().edit((p) => addVariable(p, { label: `V${i}` }));
    expect(store.getState().past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('files', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a map, or says why it cannot', () => {
    const opened = readMap(serializeProject(example()), 'polycrisis.loopweft');
    expect(opened.ok && opened.project.variables).toHaveLength(41);
    const broken = readMap('{"format":"loopweft","version":1,"meta":{}}', 'broken.loopweft');
    expect(broken).toEqual({
      ok: false,
      message:
        'broken.loopweft could not be opened (1 problem):\nerror   meta.title: Missing required field "title".',
    });
  });

  it('names a file after the map', () => {
    expect(fileNameFor('Global Polycrisis: the map')).toBe('global-polycrisis-the-map.loopweft');
    expect(fileNameFor('???')).toBe('map.loopweft');
  });

  it('saves to the file the map came from, stamping the date', async () => {
    const written: string[] = [];
    const handle = {
      name: 'mine.loopweft',
      createWritable: async () => ({
        write: async (text: string) => {
          written.push(text);
        },
        close: async () => undefined,
      }),
    } as unknown as FileSystemFileHandle;
    const saved = await saveMap(
      createProject({ title: 'Mine' }),
      { name: 'mine.loopweft', handle },
      { today: '2026-10-18' },
    );
    expect(saved?.how).toBe('file');
    expect(saved?.project.meta.modified).toBe('2026-10-18');
    const read = readProject(written[0] as string);
    expect(read.ok && read.project.meta).toEqual({ title: 'Mine', modified: '2026-10-18' });
  });

  it('downloads a copy where the browser cannot write to files', async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
    const saved = await saveMap(createProject({ title: 'Plain' }), null, { today: '2026-10-18' });
    expect(saved).toMatchObject({ how: 'download', file: { name: 'plain.loopweft' } });
    expect(clicked).toEqual(['plain.loopweft']);
    download('x.txt', 'x');
    expect(clicked).toEqual(['plain.loopweft', 'x.txt']);
  });

  it("reads today's date in the computer's own time", () => {
    expect(today(new Date(2026, 9, 18, 23, 59))).toBe('2026-10-18');
  });
});

describe('crash recovery', () => {
  it('keeps a copy while there are unsaved changes, and drops it once saved', async () => {
    vi.useFakeTimers();
    try {
      const store = createStudioStore(createProject({ title: 'Kept' }), { name: 'kept.loopweft' });
      const recovery = memoryRecovery();
      const stop = watchRecovery(store, recovery, 100);
      store.getState().edit((p) => addVariable(p, { label: 'A' }));
      expect(await recovery.read()).toBeNull();
      await vi.advanceTimersByTimeAsync(150);
      const copy = await recovery.read();
      expect(copy?.name).toBe('kept.loopweft');
      expect(copy?.text).toBe(serializeProject(store.getState().project));
      store.getState().markSaved(store.getState().project, { name: 'kept.loopweft' });
      await vi.advanceTimersByTimeAsync(0);
      expect(await recovery.read()).toBeNull();
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
