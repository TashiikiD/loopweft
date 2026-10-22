// Live reload without a screen: the Studio's watcher on a stand-in for the file it holds, changed as another
// program (an AI agent using `loopweft`) would change it.
import {
  addLink,
  addVariable,
  createProject,
  type Project,
  serializeProject,
  setMeta,
  templateById,
} from '@loopweft/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeChange, sameMap } from '../src/state/changes.ts';
import { createStudioStore, isDirty } from '../src/state/store.ts';
import { type WatchEvent, watchFile } from '../src/state/watch.ts';

/** A file on a pretend disk, and a handle to it as Chrome would give one. */
function disk(text: string) {
  let content = text;
  let modified = 1;
  let gone = false;
  const handle = {
    kind: 'file',
    name: 'garden.loopweft',
    async getFile() {
      if (gone) throw new DOMException('A requested file could not be found.', 'NotFoundError');
      return new File([content], 'garden.loopweft', { lastModified: modified });
    },
  } as unknown as FileSystemFileHandle;
  return {
    handle,
    write(next: string) {
      content = next;
      modified += 1000;
    },
    remove() {
      gone = true;
    },
  };
}

const garden = (): Project => {
  const template = templateById('limits-to-growth');
  if (!template) throw new Error('no template');
  return setMeta(template.build(), { title: 'Garden', modified: '2026-01-01' }).project;
};

let stop = () => {};
afterEach(() => stop());

function start(project = garden()) {
  const file = disk(serializeProject(project));
  const store = createStudioStore(project, { name: 'garden.loopweft', handle: file.handle });
  const events: WatchEvent[] = [];
  stop = watchFile(store, { every: 5, onEvent: (e) => events.push(e) });
  const settle = () => new Promise((done) => setTimeout(done, 40));
  return { store, file, events, settle };
}

describe('live reload', () => {
  it('follows the file: the map updates, as one undoable step, and counts as saved', async () => {
    const { store, file, events, settle } = start();
    await settle();
    expect(events).toEqual([]);
    const agent = addLink(store.getState().project, { from: 'constraint', to: 'efforts', sign: '?' }).project;
    file.write(serializeProject(setMeta(agent, { modified: '2026-01-02' }).project));
    await vi.waitFor(() => expect(events.map((e) => e.kind)).toEqual(['reloaded']));
    expect(events[0]).toMatchObject({ name: 'garden.loopweft', what: '1 link added' });
    expect(store.getState().project.links).toHaveLength(6);
    expect(isDirty(store.getState())).toBe(false);
    expect(store.getState().undo()).toBe('Changes from the file');
    expect(store.getState().project.links).toHaveLength(5);
    expect(isDirty(store.getState())).toBe(true);
  });

  it("ignores the Studio's own save, and a save that changed nothing but the date", async () => {
    const { store, file, events, settle } = start();
    await settle();
    const written = setMeta(store.getState().project, { modified: '2026-01-03' }).project;
    file.write(serializeProject(written));
    store.getState().markSaved(written, { name: 'garden.loopweft', handle: file.handle });
    await settle();
    file.write(serializeProject(setMeta(written, { modified: '2026-01-04' }).project));
    await settle();
    expect(events).toEqual([]);
    expect(store.getState().past).toEqual([]);
  });

  it('never merges: with unsaved changes, the file waits for the person to choose', async () => {
    const { store, file, events, settle } = start();
    await settle();
    store.getState().edit((p) => setMeta(p, { title: 'Garden, edited here' }));
    file.write(serializeProject(addVariable(garden(), { label: 'Rainfall' }).project));
    await vi.waitFor(() => expect(events.map((e) => e.kind)).toEqual(['conflict']));
    expect(store.getState().project.meta.title).toBe('Garden, edited here');
    const conflict = store.getState().conflict;
    expect(conflict?.what).toBe('1 variable added');
    store.getState().reload(conflict?.project as Project, 'Changes from the file');
    expect(store.getState().project.variables).toHaveLength(5);
    expect(store.getState().conflict).toBeNull();
    store.getState().undo();
    expect(store.getState().project.meta.title).toBe('Garden, edited here');
  });

  it('holds a change during a presentation, and loads it after', async () => {
    const { store, file, events, settle } = start();
    store.getState().setPresenting(true);
    await settle();
    file.write(serializeProject(addVariable(garden(), { label: 'Rainfall' }).project));
    await vi.waitFor(() => expect(events.map((e) => e.kind)).toEqual(['held']));
    await settle();
    expect(store.getState().project.variables).toHaveLength(4);
    store.getState().setPresenting(false);
    await vi.waitFor(() => expect(events.map((e) => e.kind)).toEqual(['held', 'reloaded']));
    expect(store.getState().project.variables).toHaveLength(5);
  });

  it('keeps the last good map while the file does not read, and says when it reads again', async () => {
    const { store, file, events, settle } = start();
    await settle();
    file.write('{ "format": "loopweft", "version": 1 ');
    await vi.waitFor(() => expect(events.map((e) => e.kind)).toEqual(['invalid']));
    file.write('{ "format": "loopweft" }');
    await settle();
    expect(events.map((e) => e.kind)).toEqual(['invalid']);
    file.write(serializeProject(addVariable(garden(), { label: 'Rainfall' }).project));
    await vi.waitFor(() => expect(events.map((e) => e.kind)).toEqual(['invalid', 'valid', 'reloaded']));
    expect(store.getState().project.variables).toHaveLength(5);
  });

  it('says when the file is gone, once, after a moment (a save that replaces a file leaves a gap)', async () => {
    const { file, events, settle } = start();
    await settle();
    file.remove();
    await vi.waitFor(() => expect(events.map((e) => e.kind)).toEqual(['lost']));
    await settle();
    expect(events.map((e) => e.kind)).toEqual(['lost']);
  });

  it('looks at nothing for a map without a file handle', async () => {
    const store = createStudioStore(createProject({ title: 'Untitled' }), null, false, true);
    const events: WatchEvent[] = [];
    stop = watchFile(store, { every: 5, onEvent: (e) => events.push(e) });
    await new Promise((done) => setTimeout(done, 30));
    expect(events).toEqual([]);
  });
});

describe('what changed, in words', () => {
  it('counts what was added, removed and changed', () => {
    const before = garden();
    let after = addVariable(before, { label: 'Rainfall' }).project;
    after = addLink(after, { from: 'rainfall', to: 'efforts', sign: '+' }).project;
    after = addLink(after, { from: 'constraint', to: 'efforts', sign: '-' }).project;
    expect(describeChange(before, after)).toBe('1 variable and 2 links added');
    expect(describeChange(after, before)).toBe('1 variable and 2 links removed');
    expect(describeChange(before, setMeta(before, { modified: '2027-01-01' }).project)).toBe(
      'the order of things, or only the date',
    );
  });

  it('treats two versions that differ only in their dates as the same map', () => {
    const a = garden();
    expect(sameMap(a, setMeta(a, { modified: '2030-01-01', created: '2020-01-01' }).project)).toBe(true);
    expect(sameMap(a, setMeta(a, { title: 'Other' }).project)).toBe(false);
  });
});
