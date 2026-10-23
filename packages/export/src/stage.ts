// The stage an export draws: the project's StoryView on a 1920 × 1080 host, moved only by a manual clock, so
// every frame is exact and the same project always gives the same frames. A still shows a step settled: as it
// stands once its motion is over, without the pulses that travel or wander.
import type { Project, Scene, Step } from '@loopweft/model';
import { ManualClock, Motion } from '@loopweft/motion';
import { StoryView, themeTokens } from '@loopweft/render';
import { type Box, documentStyles, drawFrame, STAGE_SIZE } from './frame.ts';
import { TRIM_MARGIN } from './pictures.ts';
import { drawSvg, type SvgDrawing } from './svg/flatten.ts';

/** Loads every font face the page declares, so labels are measured with the real fonts from the start. */
export async function loadFonts(doc: Document): Promise<void> {
  const faces = [...doc.fonts];
  await Promise.all(faces.map((face) => face.load().catch(() => undefined)));
  await doc.fonts.ready;
}

/** The whole map plainly, as a step that lists nothing shows it (format §11), with no overlays. */
const WHOLE_MAP: Step = { id: 'map', label: 'The whole map', map: {}, overlays: [] };

/** How much of an element shows: its opacity times every ancestor's, up to `root`; 0 if any is hidden. */
function shownOpacity(el: Element, root: Element): number {
  let opacity = 1;
  for (let at: Element | null = el; at && at !== root.parentElement; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    opacity *= Number(style.opacity);
    if (opacity === 0) return 0;
  }
  return opacity;
}

export class ExportStage {
  readonly project: Project;
  readonly clock = new ManualClock();
  readonly motion: Motion;
  readonly story: StoryView;
  readonly #host: HTMLElement;
  #styles: string | null = null;

  /** The project's images, decoded before anything is shown (see `create`). */
  readonly #images: HTMLImageElement[] = [];

  private constructor(host: HTMLElement, project: Project) {
    this.project = project;
    this.#host = host;
    this.motion = new Motion(this.clock);
    this.story = new StoryView(host, { project, motion: this.motion });
    host.ownerDocument.body.style.background = themeTokens(project).bgDeep;
  }

  /**
   * A stage for `project`, once the page's fonts are loaded and the project's images decoded. Then a step is
   * laid out with its real sizes from the first moment: an image the browser already holds has its size at
   * once, so the map keeps clear of it, as text keeps clear of captions measured in the real fonts.
   */
  static async create(host: HTMLElement, project: Project): Promise<ExportStage> {
    const doc = host.ownerDocument;
    await loadFonts(doc);
    const stage = new ExportStage(host, project);
    for (const uri of Object.values(project.assets)) {
      const img = doc.createElement('img');
      img.src = uri;
      stage.#images.push(img);
    }
    await Promise.all(stage.#images.map((img) => img.decode().catch(() => undefined)));
    return stage;
  }

  /** Shows a step of the story at once, settled. */
  async showStep(sceneIndex: number, stepIndex: number): Promise<void> {
    this.story.show(sceneIndex, stepIndex, 'instant');
    await this.#imagesReady();
  }

  /** The stage before the story's first step, as the presenter's replay of that step starts from: empty. */
  async showEmpty(sceneIndex: number, stepIndex: number): Promise<void> {
    const scene = this.project.story.scenes[sceneIndex];
    const step = scene?.steps[stepIndex];
    if (!scene || !step)
      throw new Error(`The story has no step ${stepIndex + 1} in scene ${sceneIndex + 1}.`);
    this.story.showStep(scene, undefined, { ...step, map: { show: false }, overlays: [] }, 'instant');
    await this.#imagesReady();
  }

  /** Moves on to a step as the talk's → does, with its full motion, from wherever the stage stands. */
  async play(sceneIndex: number, stepIndex: number): Promise<void> {
    this.story.show(sceneIndex, stepIndex, 'smooth');
    await this.#imagesReady();
  }

  /** Shows the whole map plainly, without overlays: the map of a project with or without a story. */
  async showMap(): Promise<void> {
    const scene: Pick<Scene, 'title'> = { title: this.project.meta.title };
    this.story.showStep(scene, undefined, WHOLE_MAP, 'instant');
    await this.#imagesReady();
  }

  setCategoryWords(on: boolean): void {
    this.story.setCategoryWords(on);
  }

  /** Waits until every image on the stage is decoded, so a frame never catches one half drawn. */
  async #imagesReady(): Promise<void> {
    const images = [...this.story.stage.root.querySelectorAll('img')];
    await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  }

  /**
   * Where the map's visible parts are (variables, links, labels, loop badges), with a margin, in stage
   * pixels, kept on the stage. Null when nothing of the map shows.
   */
  mapBox(): Box | null {
    const root = this.story.stage.root;
    const origin = root.getBoundingClientRect();
    const scale = this.story.stage.scale || 1;
    const parts = root.querySelectorAll(
      [
        '.map-svg .edge-line',
        '.map-svg .edge-head',
        '.map-svg .node > :not(.node-halo)',
        '.map-svg .loop-badge',
        '.map-labels > *',
      ].join(','),
    );
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const part of parts) {
      if (shownOpacity(part, root) <= 0) continue;
      const r = part.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      x0 = Math.min(x0, (r.left - origin.left) / scale);
      y0 = Math.min(y0, (r.top - origin.top) / scale);
      x1 = Math.max(x1, (r.right - origin.left) / scale);
      y1 = Math.max(y1, (r.bottom - origin.top) / scale);
    }
    if (!Number.isFinite(x0)) return null;
    const left = Math.max(0, Math.floor(x0 - TRIM_MARGIN));
    const top = Math.max(0, Math.floor(y0 - TRIM_MARGIN));
    const right = Math.min(STAGE_SIZE.w, Math.ceil(x1 + TRIM_MARGIN));
    const bottom = Math.min(STAGE_SIZE.h, Math.ceil(y1 + TRIM_MARGIN));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  /** The stage as it is now, drawn onto a canvas. */
  async frame(scale: number, crop?: Box): Promise<HTMLCanvasElement> {
    this.#styles ??= documentStyles(this.#host.ownerDocument);
    // TEMPORARY diagnostic: wait for the page to paint the stage first.
    const wait = Number(new URLSearchParams(location.search).get('wait') || 0);
    if (wait > 0) {
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r, wait));
    }
    return drawFrame(this.story.stage.viewport, this.#styles, { scale, ...(crop ? { crop } : {}) });
  }

  /** The stage as it is now, as an SVG drawing. */
  svg(title: string, crop?: Box): SvgDrawing {
    this.#styles ??= documentStyles(this.#host.ownerDocument);
    return drawSvg(this.story.stage.viewport, { styles: this.#styles, title, ...(crop ? { crop } : {}) });
  }

  dispose(): void {
    this.story.dispose();
    this.motion.dispose();
  }
}
