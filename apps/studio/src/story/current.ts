// Which scene and step the Story workspace shows: the one chosen, else the first step of the story.
import { type Project, resolveScene, resolveStep, type Scene, type Step } from '@loopweft/model';
import { useStudio } from '../context.tsx';

export interface Current {
  scene: Scene;
  sceneIndex: number;
  /** Null when a scene without steps (or the scene itself) is chosen. */
  step: Step | null;
  stepIndex: number;
  /** "S05.3", or the scene's id when no step is shown. */
  key: string;
  /** Where the step comes in the whole story, from 0, and how many steps there are. */
  position: number;
  total: number;
}

/** The step (or scene) `ref` names, or the story's first step; null for a story without scenes. */
export function currentOf(project: Project, ref: string | null): Current | null {
  const scenes = project.story.scenes;
  const total = scenes.reduce((n, s) => n + s.steps.length, 0);
  const before = (sceneIndex: number, stepIndex: number) =>
    scenes.slice(0, sceneIndex).reduce((n, s) => n + s.steps.length, 0) + stepIndex;
  const tryStep = (r: string): Current | null => {
    try {
      const found = resolveStep(project, r);
      return {
        scene: found.scene,
        sceneIndex: found.sceneIndex,
        step: found.step,
        stepIndex: found.stepIndex,
        key: found.key,
        position: before(found.sceneIndex, found.stepIndex),
        total,
      };
    } catch {
      return null;
    }
  };
  if (ref?.includes('.')) {
    const found = tryStep(ref);
    if (found) return found;
  } else if (ref) {
    try {
      const { index, scene } = resolveScene(project, ref);
      return {
        scene,
        sceneIndex: index,
        step: null,
        stepIndex: -1,
        key: scene.id,
        position: before(index, 0),
        total,
      };
    } catch {
      // Fall through to the first step.
    }
  }
  const first = scenes.findIndex((s) => s.steps.length > 0);
  if (first >= 0) {
    const scene = scenes[first] as Scene;
    return tryStep(`${scene.id}.${(scene.steps[0] as Step).id}`);
  }
  const scene = scenes[0];
  return scene
    ? { scene, sceneIndex: 0, step: null, stepIndex: -1, key: scene.id, position: 0, total }
    : null;
}

export const useCurrent = (): Current | null => {
  const project = useStudio((s) => s.project);
  const ref = useStudio((s) => s.story);
  return currentOf(project, ref);
};

/** Every step of the story in order, as "S05.3" keys. */
export const stepKeys = (project: Project): string[] =>
  project.story.scenes.flatMap((scene) => scene.steps.map((step) => `${scene.id}.${step.id}`));
