// The open project, what is selected, and undo and redo. Every edit is one of @loopweft/model's operations
// (the ones the command line runs), applied as one undoable step; a step keeps the project as it was
// before, sharing every unchanged part with the next (history.ts).
import type { OpOutput, Project } from '@loopweft/model';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { HISTORY_LIMIT, share } from './history.ts';

export interface FileRef {
  name: string;
  /** In Chrome and Edge: the file itself, so Save writes to it without asking again. */
  handle?: FileSystemFileHandle;
}

export interface Selection {
  variables: string[];
  links: string[];
  /** A named loop, chosen in the loop browser. */
  loop: string | null;
}

export const NOTHING: Selection = { variables: [], links: [], loop: null };

/** The Studio's five workspaces; Present and Export arrive in later phases. */
export type WorkspaceId = 'map' | 'sources' | 'story' | 'present' | 'export';

/** A project to go back (or forward) to, what the step between was, and what was selected there. */
interface Entry {
  project: Project;
  label: string;
  selection: Selection;
}

export interface StudioState {
  project: Project;
  /** Steps that can be undone, oldest first: each holds the project from before it. */
  past: Entry[];
  /** Steps that can be redone, the next one last: each holds the project after it. */
  future: Entry[];
  /** The project as last opened or saved; null for one never saved. */
  saved: Project | null;
  /**
   * A new map nobody has changed since it opened (the blank map at the start, a template, an import):
   * leaving it loses nothing, though it was never saved.
   */
  fresh: boolean;
  file: FileRef | null;
  selection: Selection;
  /** Counts the projects opened, so views can start afresh for each. */
  generation: number;
  /** Counts requests to show the whole map, e.g. after an automatic layout moved it. */
  fit: number;
  /** The workspace shown. */
  workspace: WorkspaceId;
  /** The source chosen in the Sources workspace's library. */
  source: string | null;
  /** The step chosen in the Story workspace, "<scene id>.<step id>", or a scene alone (its id). */
  story: string | null;
  /** True while a presentation or a rehearsal is open over the Studio: changes to the file wait. */
  presenting: boolean;
  /**
   * The file's own version, when the file changed on disk while the map had unsaved changes: the person
   * chooses which to keep. `what` says what the file's version changes.
   */
  conflict: { project: Project; what: string } | null;
  /** True while the "Work with an AI agent" window is open. */
  agentHelp: boolean;
  /** Runs one operation as one undoable step and returns its output; an OpError leaves everything as it was. */
  edit<R>(run: (project: Project) => OpOutput<R>, label?: string): OpOutput<R>;
  /** Several operations as one undoable step, e.g. removing everything selected. */
  editAll(runs: readonly ((project: Project) => OpOutput<unknown>)[], label: string): Project;
  /** Undoes the last step; returns what it was, or null when there is none. */
  undo(): string | null;
  redo(): string | null;
  /**
   * Opens a project: the history starts again. `saved`: it is the file's own content (default true);
   * `fresh`: a new map, made rather than recovered (default false).
   */
  open(project: Project, file: FileRef | null, options?: { saved?: boolean; fresh?: boolean }): void;
  /** After a save: the project as written (with its new `modified` date) and where. */
  markSaved(project: Project, file: FileRef): void;
  /**
   * The file changed on disk and now holds `project`: the map becomes it, as one undoable step (Undo goes
   * back to the map as it was, unsaved), and it counts as saved, since the file holds it.
   */
  reload(project: Project, label: string): void;
  /** The file changed on disk while the map has unsaved changes: holds its version for the person to choose. */
  fileChanged(project: Project, what: string): void;
  /** The person keeps their own version: the file's is let go (Save asks before it replaces the file). */
  keepMine(): void;
  setPresenting(presenting: boolean): void;
  setAgentHelp(open: boolean): void;
  select(selection: Partial<Selection>): void;
  /** Asks the canvas to show the whole map. */
  requestFit(): void;
  showWorkspace(workspace: WorkspaceId): void;
  /** Chooses a source in the library (null: none). */
  selectSource(id: string | null): void;
  /** Chooses a step ("S05.3") or a scene ("S05") in the Story workspace (null: none). */
  selectStory(ref: string | null): void;
}

export type StudioStore = StoreApi<StudioState>;

/** The selection, keeping only what the project still has. */
function valid(selection: Selection, project: Project): Selection {
  const variables = new Set(project.variables.map((v) => v.id));
  const links = new Set(project.links.map((l) => l.id));
  const kept = {
    variables: selection.variables.filter((id) => variables.has(id)),
    links: selection.links.filter((id) => links.has(id)),
    loop: selection.loop && project.loops.some((l) => l.id === selection.loop) ? selection.loop : null,
  };
  const same =
    kept.variables.length === selection.variables.length &&
    kept.links.length === selection.links.length &&
    kept.loop === selection.loop;
  return same ? selection : kept;
}

export function createStudioStore(
  project: Project,
  file: FileRef | null = null,
  saved = true,
  fresh = false,
): StudioStore {
  return createStore<StudioState>()((set, get) => {
    const step = (next: Project, label: string) => {
      const state = get();
      const shared = share(state.project, next);
      if (shared === state.project) return state.project;
      const entry: Entry = { project: state.project, label, selection: state.selection };
      set({
        project: shared,
        past: [...state.past, entry].slice(-HISTORY_LIMIT),
        future: [],
        selection: valid(state.selection, shared),
        fresh: false,
      });
      return shared;
    };

    return {
      project,
      past: [],
      future: [],
      saved: saved ? project : null,
      fresh,
      file,
      selection: NOTHING,
      generation: 0,
      fit: 0,
      workspace: 'map',
      source: null,
      story: null,
      presenting: false,
      conflict: null,
      agentHelp: false,

      edit(run, label) {
        const out = run(get().project);
        const next = step(out.project, label ?? out.summary);
        return { ...out, project: next };
      },

      editAll(runs, label) {
        let next = get().project;
        for (const run of runs) next = run(next).project;
        return step(next, label);
      },

      undo() {
        const { past, future, project: current, selection } = get();
        const entry = past.at(-1);
        if (!entry) return null;
        set({
          project: entry.project,
          past: past.slice(0, -1),
          future: [...future, { project: current, label: entry.label, selection }],
          selection: valid(entry.selection, entry.project),
        });
        return entry.label;
      },

      redo() {
        const { past, future, project: current, selection } = get();
        const entry = future.at(-1);
        if (!entry) return null;
        set({
          project: entry.project,
          past: [...past, { project: current, label: entry.label, selection }],
          future: future.slice(0, -1),
          selection: valid(entry.selection, entry.project),
        });
        return entry.label;
      },

      open(next, nextFile, options = {}) {
        set({
          project: next,
          past: [],
          future: [],
          saved: options.saved === false ? null : next,
          fresh: options.fresh === true,
          file: nextFile,
          selection: NOTHING,
          source: null,
          story: null,
          conflict: null,
          generation: get().generation + 1,
        });
      },

      markSaved(written, nextFile) {
        const state = get();
        const shared = share(state.project, written);
        set({ project: shared, saved: shared, file: nextFile });
      },

      reload(next, label) {
        const state = get();
        const shared = share(state.project, next);
        const changed = shared !== state.project;
        set({
          project: shared,
          saved: shared,
          conflict: null,
          ...(changed
            ? {
                past: [...state.past, { project: state.project, label, selection: state.selection }].slice(
                  -HISTORY_LIMIT,
                ),
                future: [],
                selection: valid(state.selection, shared),
                fresh: false,
              }
            : {}),
        });
      },

      fileChanged(next, what) {
        set({ conflict: { project: next, what } });
      },

      keepMine() {
        set({ conflict: null });
      },

      setPresenting(presenting) {
        set({ presenting });
      },

      setAgentHelp(agentHelp) {
        set({ agentHelp });
      },

      select(selection) {
        const state = get();
        set({ selection: valid({ ...state.selection, ...selection }, state.project) });
      },

      requestFit() {
        set({ fit: get().fit + 1 });
      },

      showWorkspace(workspace) {
        set({ workspace });
      },

      selectSource(id) {
        set({ source: id });
      },

      selectStory(ref) {
        set({ story: ref });
      },
    };
  });
}

/** True when the project differs from the file it was opened from or last saved to. */
export const isDirty = (state: Pick<StudioState, 'project' | 'saved'>): boolean =>
  state.project !== state.saved;

/** True when leaving the map would lose work: it is not saved, and it is not a fresh, unchanged new map. */
export const hasUnsavedWork = (state: Pick<StudioState, 'project' | 'saved' | 'fresh'>): boolean =>
  isDirty(state) && !state.fresh;
