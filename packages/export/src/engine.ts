// The export engine: it runs in the export page (page/), where the Studio reaches it through a hidden frame and
// the command line through a headless Chrome or Edge, so both draw exactly the same way. A job yields its
// files one at a time, so a long one (every step) shows progress and can be cancelled between files; a video
// yields its file in pieces, a step at a time.
//
// Each job draws on a stage of its own, and reaches a step through the story from its first step, as a talk
// does: the map keeps some of what earlier steps did (the order it draws its links in, which a faint link
// crossing another shows by a shade), so a step drawn alone, in a zip of every step, or as a slide, comes out
// the same.
import { issueLines, type Project, readProject } from '@loopweft/model';
import { encodeCanvas } from './frame.ts';
import { SLIDE_QUALITY } from './pdf/slides.ts';
import { checkPictureJob, type Picture, type PictureJob, picturesFor } from './pictures.ts';
import { ExportStage } from './stage.ts';
import { chooseEncoder, FrameEncoder } from './video/encode.ts';
import { Mp4Writer } from './video/mp4.ts';
import {
  checkVideoJob,
  holdFrames,
  isVideoFormat,
  MOTION_MAX,
  type VideoJob,
  type VideoPlan,
  videoPlan,
  videoSize,
} from './video/plan.ts';
import { WebmWriter } from './video/webm.ts';
import type { VideoWriter } from './video/writer.ts';

export type Job = PictureJob | VideoJob;

export const isVideoJob = (job: Job): job is VideoJob => isVideoFormat(job.format);

/** A picture's file (or a slide's), handed back one at a time. */
export type FileEvent = {
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

/**
 * The next bytes of a video's file, in order, once a step has been played: the first are the file's head as
 * it stands at the start (its final bytes come with the end).
 */
export interface VideoDataEvent {
  type: 'data';
  bytes: Uint8Array;
  /** Steps played so far, of how many. */
  done: number;
  total: number;
  /** The step just played. */
  key: string;
  /** Seconds of video so far. */
  seconds: number;
}

/** The end of a video: its head's final bytes, to write over the first `head.length` bytes of the file. */
export interface VideoEndEvent {
  type: 'video';
  name: string;
  head: Uint8Array;
  width: number;
  height: number;
  fps: number;
  frames: number;
  seconds: number;
  /** The whole file, in bytes. */
  size: number;
  /** The codec the browser encoded with, e.g. "avc1.640028". */
  codec: string;
  notes: string[];
}

export type VideoEvent = VideoDataEvent | VideoEndEvent;

/** What a job hands back, one at a time. */
export type JobEvent = FileEvent | VideoEvent;

/** The events a job of this kind hands back. */
export type EventOf<J extends Job> = J extends VideoJob ? VideoEvent : FileEvent;

/** A picture's event, or an error for anything else (a picture job hands back nothing else). */
export function fileEvent(event: JobEvent): FileEvent {
  if (event.type !== 'file') throw new Error(`A picture job handed back a "${event.type}" event.`);
  return event;
}

/** The note a video carries when only the graphics card could encode it. */
export const HARDWARE_NOTE =
  'This browser could only encode the video on the graphics card, so exporting it again may not give exactly the same file.';

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
    let run: AsyncGenerator<JobEvent, void>;
    if (isVideoJob(job)) {
      checkVideoJob(job);
      run = this.#video(project, job, videoPlan(project, job));
    } else {
      checkPictureJob(job);
      run = this.#pictures(project, job, picturesFor(project, job.target, job.format));
    }
    const id = String(this.#nextJob++);
    this.#jobs.set(id, run);
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

  async *#pictures(project: Project, job: PictureJob, pictures: Picture[]): AsyncGenerator<FileEvent, void> {
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
          bytes =
            job.format === 'jpeg'
              ? await encodeCanvas(canvas, 'image/jpeg', SLIDE_QUALITY)
              : await encodeCanvas(canvas, 'image/png');
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

  /**
   * Plays the steps as the talk does, on the stage's clock, a frame at a time: the frame of a key press shows
   * the step as it starts, each frame after it 1 / fps seconds on. The stage stands as the story leaves it
   * before the first step (its steps shown at once, from the first; before the story's first step, an empty
   * stage), so the video starts as the presenter's replay of that step does.
   */
  async *#video(project: Project, job: VideoJob, plan: VideoPlan): AsyncGenerator<VideoEvent, void> {
    const choice = await chooseEncoder(job.format, job.height, job.fps);
    if (!choice)
      throw new Error(
        job.format === 'mp4'
          ? 'This browser cannot make MP4 video (H.264). Export WebM instead, or use Chrome or Edge.'
          : 'This browser cannot make WebM video (VP9). Use Chrome or Edge.',
      );
    this.#host.replaceChildren();
    const stage = await ExportStage.create(this.#host, project);
    const encoder = FrameEncoder.open(choice, job.fps);
    try {
      stage.setCategoryWords(job.categoryWords);
      const order = project.story.scenes.flatMap((scene, s) => scene.steps.map((_, t) => [s, t] as const));
      const first = plan.steps[0] as VideoPlan['steps'][number];
      const at = order.findIndex(([s, t]) => s === first.sceneIndex && t === first.stepIndex);
      for (let i = 0; i < at; i++) {
        const [s, t] = order[i] as readonly [number, number];
        await stage.showStep(s, t);
      }
      if (at === 0) await stage.showEmpty(first.sceneIndex, first.stepIndex);

      const { width, height } = videoSize(job.height);
      const scale = width / 1920;
      const dt = 1 / job.fps;
      const hold = job.timing.kind === 'hold' ? holdFrames(job.timing.seconds, job.fps) : 0;
      const meta = {
        title: plan.what === 'the story' ? project.meta.title : `${project.meta.title} · ${plan.what}`,
        ...(project.meta.author ? { author: project.meta.author } : {}),
        program: 'Loopweft',
      };
      let writer: VideoWriter | null = null;
      const pending: Uint8Array[] = [];
      // The encoder says what its frames are with the first one; the file starts then.
      const collect = () => {
        const encoded = encoder.take();
        if (encoded.length === 0) return;
        if (!writer) {
          const track = encoder.track;
          if (!track) throw new Error('The browser’s video encoder did not say what its frames are.');
          writer = job.format === 'mp4' ? new Mp4Writer(track, meta) : new WebmWriter(track, meta);
          pending.push(writer.head);
        }
        for (const frame of encoded) pending.push(...writer.add(frame));
      };
      let frames = 0;
      let ticks = 0;
      let canvas: HTMLCanvasElement | null = null;
      let pressed = false;
      // Moves the clock on to the time of frame `n`.
      const reach = (n: number) => {
        for (; ticks < n; ticks++) stage.clock.tick(dt);
      };
      const draw = async () => {
        // Nothing playing and no key pressed since the last frame: this frame is that one again.
        const same = canvas !== null && !pressed && stage.motion.active === 0;
        reach(frames);
        if (!same) canvas = await stage.frame(scale);
        pressed = false;
        await encoder.encode(canvas as HTMLCanvasElement);
        frames++;
        collect();
      };
      let size = 0;
      const piece = (): Uint8Array => {
        const bytes = new Uint8Array(pending.reduce((n, p) => n + p.length, 0));
        let o = 0;
        for (const p of pending) {
          bytes.set(p, o);
          o += p.length;
        }
        pending.length = 0;
        size += bytes.length;
        return bytes;
      };

      for (const [i, step] of plan.steps.entries()) {
        reach(frames);
        await stage.play(step.sceneIndex, step.stepIndex);
        pressed = true;
        if (step.frames !== null) {
          for (let f = 0; f < step.frames; f++) await draw();
        } else {
          // Its motion, to the first frame that shows it settled; then the hold, that frame its first.
          const limit = frames + MOTION_MAX * job.fps;
          for (;;) {
            await draw();
            if (stage.motion.busy === 0) break;
            if (frames > limit)
              throw new Error(`The motion of ${step.key} is still going after ${MOTION_MAX} seconds.`);
          }
          for (let h = 1; h < hold; h++) await draw();
        }
        yield {
          type: 'data',
          bytes: piece(),
          done: i + 1,
          total: plan.steps.length,
          key: step.key,
          seconds: frames / job.fps,
        };
      }
      if (frames === 0)
        throw new Error('These steps all come up at once in the talk, so there is no video to make.');
      await encoder.flush();
      collect();
      const made = (writer as VideoWriter | null)?.finish();
      if (!made) throw new Error('The browser’s video encoder made no frames.');
      pending.push(...made.body, made.tail);
      const last = plan.steps.at(-1) as VideoPlan['steps'][number];
      yield {
        type: 'data',
        bytes: piece(),
        done: plan.steps.length,
        total: plan.steps.length,
        key: last.key,
        seconds: frames / job.fps,
      };
      yield {
        type: 'video',
        name: plan.name,
        head: made.head,
        width,
        height,
        fps: job.fps,
        frames,
        seconds: frames / job.fps,
        size,
        codec: (encoder.track as { codec: string }).codec,
        notes: choice.hardware ? [HARDWARE_NOTE] : [],
      };
    } finally {
      encoder.close();
      stage.dispose();
    }
  }
}
