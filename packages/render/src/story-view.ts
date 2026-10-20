// The stage for a project's story: the map with its overlays, moved step by step. It follows the deck's
// audience view (PolycrisisPresentation src/audience/audience.ts @ 539bc8e, private): text first, so the map
// can place its labels around it, then the map.
import { type Project, type Scene, type Step as StoryStep, sceneNumbers } from '@loopweft/model';
import type { Motion } from '@loopweft/motion';
import { MapView } from './map-view.ts';
import { OverlayStage } from './overlays/index.ts';
import { Stage } from './stage.ts';
import type { Transition } from './step.ts';
import { themeTokens } from './theme.ts';

/** A step's place in the story. */
export interface StoryPosition {
  scene: number;
  step: number;
  /** "<scene id>.<step id>", e.g. "S04.2a". */
  key: string;
}

/** Every step of the story, in order. */
export function storyPositions(project: Project): StoryPosition[] {
  return project.story.scenes.flatMap((scene, s) =>
    scene.steps.map((step, t) => ({ scene: s, step: t, key: `${scene.id}.${step.id}` })),
  );
}

export class StoryView {
  readonly project: Project;
  readonly stage: Stage;
  readonly map: MapView;
  readonly overlays: OverlayStage;
  readonly #motion: Motion;
  #at: { scene: number; step: number } | null = null;

  constructor(host: HTMLElement, options: { project: Project; motion: Motion }) {
    this.project = options.project;
    this.#motion = options.motion;
    this.stage = new Stage(host, { base: options.project.theme.base, tokens: themeTokens(options.project) });
    this.map = new MapView(this.stage.layers.map, { project: options.project, motion: options.motion });
    this.overlays = new OverlayStage(this.stage.layers.overlay, options.motion, options.project);
    // Text marked data-reserve (captions, cards, statements) keeps map labels out of its way.
    this.map.reserve = () =>
      [...this.stage.root.querySelectorAll('[data-reserve]')].map((el) => this.stage.boxOf(el));
  }

  /** Where the story is, or null before the first step is shown. */
  get position(): { scene: number; step: number } | null {
    return this.#at;
  }

  /** Shows one step of the story. */
  show(sceneIndex: number, stepIndex: number, transition: Transition): void {
    const scene = this.project.story.scenes[sceneIndex];
    const step = scene?.steps[stepIndex];
    if (!scene || !step)
      throw new Error(`The story has no step ${stepIndex + 1} in scene ${sceneIndex + 1}.`);
    this.#at = { scene: sceneIndex, step: stepIndex };
    this.showStep(scene, sceneNumbers(this.project.story.scenes)[sceneIndex], step, transition);
  }

  /**
   * Shows a step given whole, e.g. one being edited in the Studio, whose story is newer than the project
   * the view was built from. Only the map (variables, links, layout, types, theme) must be the view's own.
   * `number` is the scene's number in that story (`sceneNumbers`), if it has one.
   */
  showStep(
    scene: Pick<Scene, 'title' | 'headline'>,
    number: number | undefined,
    step: StoryStep,
    transition: Transition,
  ): void {
    const caption = {
      number,
      title: scene.title,
      ...(scene.headline ? { headline: scene.headline } : {}),
    };
    this.overlays.apply(step.overlays, caption, transition);
    this.map.apply(step.map, transition);
  }

  /** Low power: no blurred glows, and at most 30 frames a second. */
  setLowPower(on: boolean): void {
    this.stage.root.classList.toggle('low-power', on);
    this.#motion.setMaxFps(on ? 30 : 0);
  }

  /** Re-places labels (once web fonts have loaded). */
  relayout(): void {
    this.map.relayout();
  }

  dispose(): void {
    this.map.dispose();
    this.stage.dispose();
  }
}
