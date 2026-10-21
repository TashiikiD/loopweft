// The export engine: it runs in the export page (page/), where the Studio reaches it through a hidden frame and
// the command line through a headless Chrome or Edge, so both draw exactly the same way. A job yields its
// files one at a time, so a long one (every step) shows progress and can be cancelled between files.
//
// Each job draws on a stage of its own, and reaches a step through the story from its first step, as a talk
// does: the map keeps some of what earlier steps did (the order it draws its links in, which a faint link
// crossing another shows by a shade), so a step drawn alone, in a zip of every step, or as a slide, comes out
// the same.
import { issueLines, type Project, readProject } from '@loopweft/model';
import { encodeCanvas } from './frame.ts';
import { checkPictureJob, type Picture, type PictureJob, picturesFor } from './pictures.ts';
import { ExportStage } from './stage.ts';

export type Job = PictureJob;

/** What a job hands back, one at a time. */
export type JobEvent = {
  type: 'file';
  name: string;
  bytes: Uint8Array;
  /** Which of the job's files this is (from 1), and how many it makes. */
  done: number;
  total: number;
  width: number;
  height: number;
  /** The step it shows, e.g. "S04.2a" (none for the whole map). */
  key?: string;
  /** An SVG's notes: what some editors leave out, and anything drawn approximately. */
  notes?: string[];
};

export interface Opened {
  title: string;
  scenes: number;
  steps: number;
}

export class ExportEngine {
  readonly #host: HTMLElement;
  #project: Project | null = null;
  readonly #jobs = new Map<string, AsyncGenerator<JobEvent, void>>();
  #nextJob = 1;

  constructor(host: HTMLElement) {
    this.#host = host;
  }

  /** Opens a project (its file's text), checked as any file is opened. */
  async open(text: string): Promise<Opened> {
    const read = readProject(text);
    if (!read.ok) {
      throw new Error(
        `The project could not be opened:\n${issueLines(read.issues.filter((i) => i.severity === 'error').slice(0, 20))}`,
      );
    }
    if (this.#jobs.size > 0) throw new Error('An export is still running.');
    this.#project = read.project;
    return {
      title: read.project.meta.title,
      scenes: read.project.story.scenes.length,
      steps: read.project.story.scenes.reduce((n, s) => n + s.steps.length, 0),
    };
  }

  /** Starts a job; its files come from `next`. Mistakes in the job are refused here, before any drawing. */
  start(job: Job): string {
    const project = this.#project;
    if (!project) throw new Error('Open a project before exporting.');
    if (this.#jobs.size > 0) throw new Error('An export is still running.');
    checkPictureJob(job);
    const pictures = picturesFor(project, job.target, job.format);
    const id = String(this.#nextJob++);
    this.#jobs.set(id, this.#pictures(project, job, pictures));
    return id;
  }

  /** The job's next file, or null when it has made them all. */
  async next(id: string): Promise<JobEvent | null> {
    const job = this.#jobs.get(id);
    if (!job) throw new Error(`No export ${id} is running.`);
    try {
      const step = await job.next();
      if (step.done) {
        this.#jobs.delete(id);
        return null;
      }
      return step.value;
    } catch (error) {
      this.#jobs.delete(id);
      throw error;
    }
  }

  /** Stops a job between two files. */
  async cancel(id: string): Promise<void> {
    const job = this.#jobs.get(id);
    this.#jobs.delete(id);
    await job?.return();
  }

  async *#pictures(project: Project, job: PictureJob, pictures: Picture[]): AsyncGenerator<JobEvent, void> {
    this.#host.replaceChildren();
    const stage = await ExportStage.create(this.#host, project);
    try {
      stage.setCategoryWords(job.categoryWords);
      // Where the story has been shown up to: the next step to show on the way to a picture.
      const order = project.story.scenes.flatMap((scene, s) => scene.steps.map((_, t) => [s, t] as const));
      let shown = 0;
      let done = 0;
      for (const picture of pictures) {
        if (picture.kind === 'map') await stage.showMap();
        else {
          const at = order.findIndex(([s, t]) => s === picture.sceneIndex && t === picture.stepIndex);
          if (at < shown) throw new Error(`The pictures are out of story order at ${picture.key}.`);
          for (; shown < at; shown++) {
            const [s, t] = order[shown] as readonly [number, number];
            await stage.showStep(s, t);
          }
          await stage.showStep(picture.sceneIndex, picture.stepIndex);
          shown = at + 1;
        }
        const crop = picture.kind === 'map' && picture.trim ? (stage.mapBox() ?? undefined) : undefined;
        let bytes: Uint8Array;
        let width: number;
        let height: number;
        let notes: string[] | undefined;
        if (job.format === 'svg') {
          const what = picture.kind === 'map' ? 'the whole map' : picture.key;
          const drawing = stage.svg(`${project.meta.title} · ${what}`, crop);
          bytes = new TextEncoder().encode(drawing.svg);
          width = Math.round(crop?.w ?? 1920);
          height = Math.round(crop?.h ?? 1080);
          notes = drawing.notes;
        } else {
          const canvas = await stage.frame(job.scale, crop);
          bytes = await encodeCanvas(canvas, 'image/png');
          width = canvas.width;
          height = canvas.height;
        }
        done++;
        yield {
          type: 'file',
          name: picture.name,
          bytes,
          done,
          total: pictures.length,
          width,
          height,
          ...(picture.kind === 'step' ? { key: picture.key } : {}),
          ...(notes ? { notes } : {}),
        };
      }
    } finally {
      stage.dispose();
    }
  }
}
