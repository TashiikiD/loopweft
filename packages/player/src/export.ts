// The one-file HTML: the player's page (build/template.ts) with a project in it. Pure, so the Studio, the
// command line and the site build make the same file: the same project and template give the same bytes.
import { type Project, serializeProject } from '@loopweft/model';

/** Where the project goes: the page's empty JSON script (page/index.html). */
export const SLOT = '<script type="application/json" id="loopweft-project"></script>';

/** The fonts the page carries. A theme naming another font shows it only where that font is installed. */
export const EMBEDDED_FONTS = ['Inter', 'Fraunces'] as const;

/** Above this size the export warns: many email services refuse attachments of 20 to 25 MB. */
export const SIZE_WARNING_BYTES = 20_000_000;

export interface ExportOptions {
  /** Include the speaker notes, the script and each step's cue (the presenter's words). */
  notes: boolean;
}

export interface ExportImage {
  id: string;
  type: string;
  bytes: number;
}

export interface HtmlExport {
  html: string;
  bytes: number;
  notes: boolean;
  /** The embedded images, largest first. */
  images: ExportImage[];
  /** Fonts the theme names that the page does not carry. */
  fontsLeftOut: string[];
  warnings: string[];
}

/** The project without the presenter's words: scenes' notes and scripts, steps' cues. */
export function withoutNotes(project: Project): Project {
  return {
    ...project,
    story: {
      ...project.story,
      scenes: project.story.scenes.map(({ notes: _notes, script: _script, ...scene }) => ({
        ...scene,
        steps: scene.steps.map(({ cue: _cue, ...step }) => step),
      })),
    },
  };
}

/** Whether a project holds any of the presenter's words. */
export const hasNotes = (project: Project): boolean =>
  project.story.scenes.some(
    (s) => !!s.notes?.trim() || !!s.script?.trim() || s.steps.some((t) => !!t.cue?.trim()),
  );

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// "<" written as its JSON escape (backslash, u003c), so nothing in the project can close the script element.
const LESS_THAN = `${String.fromCharCode(92)}u003c`;

/** How many bytes a base64 data address holds. */
function dataBytes(uri: string): { type: string; bytes: number } {
  const comma = uri.indexOf(',');
  const type = /^data:([^;,]+)/.exec(uri)?.[1] ?? 'unknown';
  const data = uri.slice(comma + 1);
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return { type, bytes: Math.floor((data.length * 3) / 4) - padding };
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** The one-file HTML for a project, from the player's template. */
export function exportHtml(project: Project, template: string, options: ExportOptions): HtmlExport {
  if (!template.includes(SLOT)) throw new Error('The template has no project slot.');
  const shown = options.notes ? project : withoutNotes(project);
  const json = serializeProject(shown).trimEnd().replace(/</g, LESS_THAN);
  const slot = `<script type="application/json" id="loopweft-project" data-notes="${options.notes ? 'included' : 'left-out'}">${json}</script>`;
  const html = template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(project.meta.title)}</title>`)
    .replace(SLOT, () => slot);
  const bytes = new TextEncoder().encode(html).length;

  const images = Object.entries(project.assets)
    .map(([id, uri]) => ({ id, ...dataBytes(uri) }))
    .sort((a, b) => b.bytes - a.bytes || (a.id < b.id ? -1 : 1));
  const named = [project.theme.fonts?.heading, project.theme.fonts?.body].filter((f): f is string => !!f);
  const fontsLeftOut = [...new Set(named)].filter(
    (f) =>
      !EMBEDDED_FONTS.some(
        (e) =>
          f
            .trim()
            .toLowerCase()
            .replace(/\s+variable$/, '') === e.toLowerCase(),
      ),
  );
  const warnings: string[] = [];
  if (bytes > SIZE_WARNING_BYTES) {
    const largest = images
      .slice(0, 3)
      .map((i) => `${i.id} (${megabytes(i.bytes)})`)
      .join(', ');
    warnings.push(
      `The file is ${megabytes(bytes)}: many email services refuse attachments of 20 to 25 MB.${largest ? ` The largest images: ${largest}.` : ''}`,
    );
  }
  for (const font of fontsLeftOut)
    warnings.push(`The font "${font}" is not included: it shows only on computers where it is installed.`);
  return { html, bytes, notes: options.notes, images, fontsLeftOut, warnings };
}

/** The project a page holds, and whether its notes were left out, read from the page's slot. */
export function embeddedProject(doc: Document): { text: string; notes: boolean } | null {
  const el = doc.getElementById('loopweft-project');
  const text = el?.textContent?.trim();
  if (!el || !text) return null;
  return { text, notes: el.getAttribute('data-notes') !== 'left-out' };
}
