// Opening and saving .loopweft files. Chrome and Edge let the Studio write back to the file it opened (the
// File System Access API), so Save just saves; other browsers open through a file chooser and save by
// downloading a copy. Nothing leaves the computer.
import { issueLines, type Project, readProject, serializeProject, slugify } from '@loopweft/model';
import type { FileRef } from './store.ts';

/** The parts of the File System Access API the Studio uses (not yet in TypeScript's DOM types). */
interface PickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[];
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
}
interface Pickers {
  showOpenFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: PickerOptions) => Promise<FileSystemFileHandle>;
}
interface Writable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

const pickers = (): Pickers => (typeof window === 'undefined' ? {} : (window as unknown as Pickers));

const MAP_TYPES = [{ description: 'Loopweft map', accept: { 'application/json': ['.loopweft'] } }];

/** True when the browser can save straight back to a file (Chrome, Edge). */
export const canSaveInPlace = (): boolean => typeof pickers().showSaveFilePicker === 'function';

/** A file name for a map: its title, as letters, digits and dashes. */
export const fileNameFor = (title: string): string =>
  `${slugify(title).replace(/_/g, '-') || 'map'}.loopweft`;

export interface PickedFile {
  name: string;
  text: string;
  handle?: FileSystemFileHandle;
}

/** The person cancelled a file chooser. */
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** Asks for a file: the browser's file chooser for maps, or a plain file input. Null when cancelled. */
export async function pickFile(accept = '.loopweft,application/json'): Promise<PickedFile | null> {
  const { showOpenFilePicker } = pickers();
  if (showOpenFilePicker && accept.startsWith('.loopweft')) {
    try {
      const [handle] = await showOpenFilePicker({ types: MAP_TYPES });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if (cancelled(error)) return null;
      throw error;
    }
  }
  const file = await chooseFile(accept);
  return file ? { name: file.name, text: await file.text() } : null;
}

/** A plain file chooser; resolves to the file, or null when nothing was chosen. */
export function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

export type Opened =
  | { ok: true; project: Project; warnings: number; migrated: string[] }
  | { ok: false; message: string };

/** Reads a map's text: the project, or why it cannot be opened. */
export function readMap(text: string, name: string): Opened {
  const result = readProject(text);
  if (!result.ok) {
    const errors = result.issues.filter((i) => i.severity === 'error');
    return {
      ok: false,
      message: `${name} could not be opened (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n${issueLines(errors.slice(0, 12))}`,
    };
  }
  const warnings = result.issues.filter((i) => i.severity === 'warning').length;
  return { ok: true, project: result.project, warnings, migrated: result.migrated };
}

/** Hands the browser a file to save (other browsers' Save, and every export). */
export function download(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A file name for a map's one-file HTML: its title, as letters, digits and dashes. */
export const htmlNameFor = (title: string): string =>
  `${slugify(title).replace(/_/g, '-') || 'presentation'}.html`;

/**
 * Saves an exported page: where the person chooses (Chrome, Edge), else as a download. Null when they cancel;
 * otherwise how it was saved and under which name.
 */
export async function saveHtml(
  name: string,
  html: string,
): Promise<{ how: 'file' | 'download'; name: string } | null> {
  const { showSaveFilePicker } = pickers();
  if (showSaveFilePicker) {
    let handle: FileSystemFileHandle;
    try {
      handle = await showSaveFilePicker({
        types: [{ description: 'Web page', accept: { 'text/html': ['.html'] } }],
        suggestedName: name,
      });
    } catch (error) {
      if (cancelled(error)) return null;
      throw error;
    }
    const writable = (await (
      handle as unknown as { createWritable(): Promise<Writable> }
    ).createWritable()) as Writable;
    await writable.write(html);
    await writable.close();
    return { how: 'file', name: handle.name };
  }
  download(name, html, 'text/html');
  return { how: 'download', name };
}

export interface Saved {
  /** The project as written: its `modified` date is today's. */
  project: Project;
  file: FileRef;
  /** `file`: written to the file itself; `download`: handed to the browser as a download. */
  how: 'file' | 'download';
}

/**
 * Saves a project, stamping `meta.modified` with `today` (YYYY-MM-DD, read from the clock by the caller).
 * With a file handle (and not `as`), it writes to that file; else it asks where (Chrome, Edge) or downloads
 * a copy. Null when the person cancels.
 */
export async function saveMap(
  project: Project,
  file: FileRef | null,
  options: { today: string; as?: boolean },
): Promise<Saved | null> {
  const stamped: Project = { ...project, meta: { ...project.meta, modified: options.today } };
  const text = serializeProject(stamped);
  const name = file?.name ?? fileNameFor(project.meta.title);
  const { showSaveFilePicker } = pickers();
  let handle = options.as ? undefined : file?.handle;
  if (!handle && showSaveFilePicker) {
    try {
      handle = await showSaveFilePicker({
        types: MAP_TYPES,
        suggestedName: name,
        excludeAcceptAllOption: true,
      });
    } catch (error) {
      if (cancelled(error)) return null;
      throw error;
    }
  }
  if (handle) {
    const writable = (await (
      handle as unknown as { createWritable(): Promise<Writable> }
    ).createWritable()) as Writable;
    await writable.write(text);
    await writable.close();
    return { project: stamped, file: { name: handle.name, handle }, how: 'file' };
  }
  download(name, text);
  return { project: stamped, file: { name }, how: 'download' };
}

/** Today's date as YYYY-MM-DD, in the computer's own time zone: for `meta.modified` when saving. */
export function today(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
