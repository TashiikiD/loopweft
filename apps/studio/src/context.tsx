// The Studio's store for components: `useStudio(selector)` reads it, `useEdit()` runs an operation and tells
// the person, in plain words, when the operation refuses (an OpError: something the change would break).
import { OpError, type OpOutput, type Project, ShorthandError } from '@loopweft/model';
import { notifications } from '@mantine/notifications';
import { createContext, useCallback, useContext } from 'react';
import { useStore } from 'zustand';
import type { StudioState, StudioStore } from './state/store.ts';

export const StudioContext = createContext<StudioStore | null>(null);

export function useStudioStore(): StudioStore {
  const store = useContext(StudioContext);
  if (!store) throw new Error('The Studio store is missing: wrap the app in StudioContext.');
  return store;
}

export const useStudio = <T,>(selector: (state: StudioState) => T): T => useStore(useStudioStore(), selector);

/** Says why an edit was refused. */
export function refused(error: unknown, title = 'That change was not made'): void {
  const message =
    error instanceof OpError || error instanceof ShorthandError
      ? error.message
      : `Something went wrong: ${String(error)}`;
  notifications.show({ color: 'red', title, message, autoClose: 8000 });
}

/**
 * Runs one operation as one undoable step. Returns its output, or null when it was refused (the person is
 * told why, and nothing changes).
 */
export function useEdit(): <R>(run: (project: Project) => OpOutput<R>, label?: string) => OpOutput<R> | null {
  const store = useStudioStore();
  return useCallback(
    (run, label) => {
      try {
        return store.getState().edit(run, label);
      } catch (error) {
        if (!(error instanceof OpError) && !(error instanceof ShorthandError)) console.error(error);
        refused(error);
        return null;
      }
    },
    [store],
  );
}
