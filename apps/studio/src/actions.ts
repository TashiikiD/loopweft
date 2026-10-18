/// <reference types="vite/client" />
// What the File menu and its shortcuts do: start a map (blank, from a template, or the polycrisis
// example), open one, save it. Starting or opening another map asks first when there are unsaved changes.
import { createProject, type Project, templateById } from '@loopweft/model';
import { notifications } from '@mantine/notifications';
import exampleText from '../../../examples/polycrisis.loopweft?raw';
import { refused } from './context.tsx';
import { pickFile, readMap, saveMap, today } from './state/files.ts';
import { type FileRef, isDirty, type StudioStore } from './state/store.ts';

/** True when there is nothing unsaved to lose, or the person agrees to lose it. */
export function mayDiscard(store: StudioStore): boolean {
  const state = store.getState();
  if (!isDirty(state)) return true;
  return window.confirm(`“${state.project.meta.title}” has unsaved changes. Discard them?`);
}

/** The polycrisis example, as the repository holds it. */
export function exampleProject(): Project {
  const opened = readMap(exampleText, 'The example');
  if (!opened.ok) throw new Error(opened.message);
  return opened.project;
}

/** A new map: blank (`title` names it), from a template by id, or the polycrisis example. */
export function startMap(store: StudioStore, template: string, title?: string): boolean {
  if (!mayDiscard(store)) return false;
  let project: Project;
  if (template === 'polycrisis') project = exampleProject();
  else {
    const found = templateById(template);
    if (!found) throw new Error(`No template ${template}.`);
    project = found.build();
  }
  if (title) project = { ...project, meta: { ...project.meta, title } };
  if (template === 'blank' && !title) project = createProject({ title: 'Untitled map' });
  project = { ...project, meta: { ...project.meta, created: today() } };
  store.getState().open(project, null, { saved: false });
  return true;
}

/** Opens a map's text as the open map (a file chosen, dropped, or recovered). */
export function openText(
  store: StudioStore,
  text: string,
  file: FileRef,
  options: { saved?: boolean } = {},
): boolean {
  const opened = readMap(text, file.name);
  if (!opened.ok) {
    notifications.show({ color: 'red', title: 'Not opened', message: opened.message, autoClose: 12000 });
    return false;
  }
  store.getState().open(opened.project, file, options);
  if (opened.migrated.length) {
    notifications.show({
      title: 'Upgraded',
      message: `${file.name} was upgraded: ${opened.migrated.join('; ')}`,
    });
  }
  return true;
}

export async function openFile(store: StudioStore): Promise<void> {
  if (!mayDiscard(store)) return;
  try {
    const picked = await pickFile();
    if (!picked) return;
    openText(store, picked.text, { name: picked.name, ...(picked.handle ? { handle: picked.handle } : {}) });
  } catch (error) {
    refused(error, 'Not opened');
  }
}

/** Saves the open map: to its own file when the browser allows it, else as a download. */
export async function saveFile(store: StudioStore, options: { as?: boolean } = {}): Promise<boolean> {
  const { project, file } = store.getState();
  try {
    const saved = await saveMap(project, file, { today: today(), ...(options.as ? { as: true } : {}) });
    if (!saved) return false;
    store.getState().markSaved(saved.project, saved.file);
    notifications.show({
      title: saved.how === 'file' ? 'Saved' : 'Downloaded',
      message:
        saved.how === 'file'
          ? `Saved to ${saved.file.name}.`
          : `${saved.file.name} is in your downloads. This browser cannot save into a file directly; Chrome and Edge can.`,
      autoClose: 4000,
    });
    return true;
  } catch (error) {
    refused(error, 'Not saved');
    return false;
  }
}
