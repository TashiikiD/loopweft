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
  write(data: string | Blob): Promise<void>;
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

/** File contents as the browser takes them. */
export type FileData = string | Uint8Array | Blob;

const blobOf = (data: FileData, type: string): Blob =>
  data instanceof Blob ? data : new Blob([data as BlobPart], { type });

/** Hands the browser a file to save (other browsers' Save, and every export). */
export function download(name: string, data: FileData, type = 'application/json'): void {
  const url = URL.createObjectURL(blobOf(data, type));
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

/** Where an exported file goes: a file the person chose (Chrome, Edge), or a download. */
export interface SaveTarget {
  how: 'file' | 'download';
  name: string;
  write(data: FileData): Promise<void>;
}

/** An exported page's target (the one-file HTML). */
export type HtmlTarget = SaveTarget;

/** A kind of file an export makes, for the save dialog. */
export interface FileKind {
  description: string;
  type: string;
  extension: string;
}

export const HTML_FILE: FileKind = { description: 'Web page', type: 'text/html', extension: '.html' };
export const PNG_FILE: FileKind = { description: 'PNG picture', type: 'image/png', extension: '.png' };
export const ZIP_FILE: FileKind = { description: 'Zip folder', type: 'application/zip', extension: '.zip' };

/**
 * Asks where to save an exported file: the browser's save dialog (Chrome, Edge), else a download. Call it
 * straight from the click, before anything slow: the browser shows the dialog only while the click still
 * counts (a few seconds), so the file is made after the place is chosen. Null when the person cancels.
 */
export function chooseSaveTarget(name: string, kind: FileKind): Promise<SaveTarget | null> {
  const { showSaveFilePicker } = pickers();
  if (!showSaveFilePicker)
    return Promise.resolve({
      how: 'download',
      name,
      write: async (data) => download(name, data, kind.type),
    });
  // Called now, in the click; only its answer is awaited.
  const asking = showSaveFilePicker({
    types: [{ description: kind.description, accept: { [kind.type]: [kind.extension] } }],
    suggestedName: name,
  });
  return asking.then(
    (handle): SaveTarget => ({
      how: 'file',
      name: handle.name,
      async write(data) {
        const writable = (await (
          handle as unknown as { createWritable(): Promise<Writable> }
        ).createWritable()) as Writable;
        await writable.write(typeof data === 'string' ? data : blobOf(data, kind.type));
        await writable.close();
      },
    }),
    (error: unknown) => {
      if (cancelled(error)) return null;
      throw error;
    },
  );
}

/** Where an exported page goes (see chooseSaveTarget). */
export const chooseHtmlTarget = (name: string): Promise<HtmlTarget | null> =>
  chooseSaveTarget(name, HTML_FILE);

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
