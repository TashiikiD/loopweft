// Live reload. While a map opened (or saved) through Chrome's or Edge's file access is open, the Studio looks
// at its file about once a second. When another program changes it (an AI agent working with `loopweft`, say),
// the map updates in place: the same workspace and view, a note of what changed, and one step in Undo. Nothing
// is ever merged: if the person has unsaved changes of their own, they choose which version to keep. Browsers
// give no event for a changed file, so it is looked at; only that one file is read, and nothing is sent anywhere.
import type { Project } from '@loopweft/model';
import { describeChange, sameMap } from './changes.ts';
import { readMap } from './files.ts';
import { isDirty, type StudioStore } from './store.ts';

/** What the person is told. */
export type WatchEvent =
  /** The map was updated from the file. */
  | { kind: 'reloaded'; name: string; what: string }
  /** The file changed while the map has unsaved changes: the store's `conflict` holds the file's version. */
  | { kind: 'conflict'; name: string; what: string }
  /** The file changed during a presentation: it loads when the presentation ends. */
  | { kind: 'held'; name: string }
  /** The file no longer reads as a map: the Studio keeps the last good version. */
  | { kind: 'invalid'; name: string; message: string }
  /** The file reads as a map again. */
  | { kind: 'valid'; name: string }
  /** The file cannot be read (removed, moved, or the browser took the permission back). */
  | { kind: 'lost'; name: string };

export interface WatchOptions {
  onEvent(event: WatchEvent): void;
  /** Milliseconds between looks (default 1000). */
  every?: number;
}

/** How often a missing file is looked for before the person is told: a save that writes a new file and moves
 * it into place leaves a moment without one. */
const MISSING_LOOKS = 3;

/** Starts looking at the store's file; returns a function that stops it. */
export function watchFile(store: StudioStore, options: WatchOptions): () => void {
  /** The handle looked at, and its file as last read: `lastModified:size`, and its text. */
  let seen: { handle: FileSystemFileHandle; stamp: string; text: string } | null = null;
  let busy = false;
  let invalid = false;
  let missing = 0;
  /** A version that arrived during a presentation, to load when it ends. */
  let held: Project | null = null;

  const nameOf = () => store.getState().file?.name ?? 'The file';

  /** The file holds `project`, which is not what the Studio last read from it or wrote to it. */
  const arrived = (project: Project) => {
    const state = store.getState();
    const name = nameOf();
    if (state.saved && sameMap(project, state.saved)) {
      // Only the date it was saved changed: the Studio takes it quietly (no note, no step in Undo), unless that
      // would lose work.
      if (!isDirty(state) && state.file) state.markSaved(project, state.file);
      return;
    }
    if (state.presenting) {
      if (!held) options.onEvent({ kind: 'held', name });
      held = project;
      return;
    }
    held = null;
    // What the file changed since the Studio last read or wrote it (not the person's own unsaved changes).
    const what = describeChange(state.saved ?? state.project, project);
    if (isDirty(state)) {
      state.fileChanged(project, what);
      options.onEvent({ kind: 'conflict', name, what });
      return;
    }
    state.reload(project, 'Changes from the file');
    options.onEvent({ kind: 'reloaded', name, what });
  };

  const look = async () => {
    const state = store.getState();
    const handle = state.file?.handle;
    if (!handle) {
      seen = null;
      return;
    }
    if (held && !state.presenting) arrived(held);
    let file: File;
    try {
      file = await handle.getFile();
    } catch {
      missing += 1;
      if (missing === MISSING_LOOKS) options.onEvent({ kind: 'lost', name: nameOf() });
      return;
    }
    missing = 0;
    const stamp = `${file.lastModified}:${file.size}`;
    if (seen?.handle === handle && seen.stamp === stamp) return;
    const text = await file.text();
    if (store.getState().file?.handle !== handle) return;
    const unchanged = seen?.handle === handle && seen.text === text;
    seen = { handle, stamp, text };
    if (unchanged) return;
    const read = readMap(text, nameOf());
    if (!read.ok) {
      if (!invalid) options.onEvent({ kind: 'invalid', name: nameOf(), message: read.message });
      invalid = true;
      return;
    }
    if (invalid) options.onEvent({ kind: 'valid', name: nameOf() });
    invalid = false;
    // A file just opened (or saved as) holds what the Studio read or wrote, unless it changed in between.
    const saved = store.getState().saved;
    if (saved && sameMap(read.project, saved) && read.project.meta.modified === saved.meta.modified) return;
    arrived(read.project);
  };

  const tick = () => {
    if (busy) return;
    busy = true;
    look()
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  };
  const timer = setInterval(tick, options.every ?? 1000);
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  tick();
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
