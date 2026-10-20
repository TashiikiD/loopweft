// Source: PolycrisisPresentation src/core/deck.ts @ 3e5da10 (private), adapted for Loopweft: the deck is read
// from a project's story instead of the presentation's own content files. Scenes without steps are left out
// (there is nothing to show), scene numbers come from the captions (`sceneNumbers`), and an untimed scene
// counts 0 seconds towards the clock.
import { type Project, type Scene, type Step, sceneNumbers } from '@loopweft/model';

/** A place in the deck: the scene (among the deck's scenes) and the step in it, both from 0. */
export interface Pos {
  s: number;
  b: number;
}

export interface DeckStep {
  /** "<scene id>.<step id>", e.g. "S04.2a", as the Story workspace and the command line name it. */
  key: string;
  step: Step;
}

export interface DeckScene {
  /** The scene's place in the project's story (which may hold scenes without steps). */
  index: number;
  id: string;
  title: string;
  headline?: string;
  /** Its number as its caption shows it; none for a scene without a caption, such as a title page. */
  number: number | undefined;
  /** 0 when the scene is untimed. */
  targetSeconds: number;
  /** When the scene should start and end on the presenter's clock: the targets of the scenes before it. */
  clockStart: number;
  clockEnd: number;
  scene: Scene;
  steps: DeckStep[];
}

export interface Deck {
  title: string;
  /** The scenes' targets added up. */
  targetSeconds: number;
  scenes: DeckScene[];
}

/** The deck a project's story makes: its scenes that have steps, in order. */
export function deckOf(project: Project): Deck {
  const numbers = sceneNumbers(project.story.scenes);
  const scenes: DeckScene[] = [];
  let clock = 0;
  project.story.scenes.forEach((scene, index) => {
    if (scene.steps.length === 0) return;
    const target = scene.targetSeconds ?? 0;
    scenes.push({
      index,
      id: scene.id,
      title: scene.title,
      ...(scene.headline ? { headline: scene.headline } : {}),
      number: numbers[index],
      targetSeconds: target,
      clockStart: clock,
      clockEnd: clock + target,
      scene,
      steps: scene.steps.map((step) => ({ key: `${scene.id}.${step.id}`, step })),
    });
    clock += target;
  });
  return { title: project.meta.title, targetSeconds: clock, scenes };
}

export function sceneAt(deck: Deck, pos: Pos): DeckScene {
  const scene = deck.scenes[pos.s];
  if (!scene) throw new Error(`The deck has no scene ${pos.s + 1}.`);
  return scene;
}

export function stepAt(deck: Deck, pos: Pos): DeckStep {
  const scene = sceneAt(deck, pos);
  const step = scene.steps[pos.b];
  if (!step) throw new Error(`Scene ${scene.id} has no step ${pos.b + 1}.`);
  return step;
}

export function isValidPos(deck: Deck, pos: Pos): boolean {
  const scene = deck.scenes[pos.s];
  return !!scene && Number.isInteger(pos.b) && pos.b >= 0 && pos.b < scene.steps.length;
}

export const samePos = (a: Pos, b: Pos): boolean => a.s === b.s && a.b === b.b;

export const firstPos = (): Pos => ({ s: 0, b: 0 });

export function lastPos(deck: Deck): Pos {
  const s = Math.max(0, deck.scenes.length - 1);
  return { s, b: Math.max(0, (deck.scenes[s]?.steps.length ?? 1) - 1) };
}

/** The next step, crossing into the next scene; null at the very end. */
export function nextPos(deck: Deck, pos: Pos): Pos | null {
  const scene = deck.scenes[pos.s];
  if (!scene) return null;
  if (pos.b + 1 < scene.steps.length) return { s: pos.s, b: pos.b + 1 };
  if (pos.s + 1 < deck.scenes.length) return { s: pos.s + 1, b: 0 };
  return null;
}

/** The step before, crossing back to the last step of the scene before; null at the very start. */
export function prevPos(deck: Deck, pos: Pos): Pos | null {
  if (pos.b > 0) return { s: pos.s, b: pos.b - 1 };
  if (pos.s > 0) return { s: pos.s - 1, b: (deck.scenes[pos.s - 1]?.steps.length ?? 1) - 1 };
  return null;
}

export const nextScenePos = (deck: Deck, pos: Pos): Pos | null =>
  pos.s + 1 < deck.scenes.length ? { s: pos.s + 1, b: 0 } : null;

/** Like a media player: first back to the start of this scene, then the scene before. */
export function prevScenePos(pos: Pos): Pos | null {
  if (pos.b > 0) return { s: pos.s, b: 0 };
  return pos.s > 0 ? { s: pos.s - 1, b: 0 } : null;
}

/** The start of the scene with this number (as its caption shows it), or null. */
export function sceneStartPos(deck: Deck, number: number): Pos | null {
  const s = deck.scenes.findIndex((scene) => scene.number === number);
  return s >= 0 ? { s, b: 0 } : null;
}

export const posKey = (deck: Deck, pos: Pos): string => stepAt(deck, pos).key;

/** Reads "S04.2a" (or "#S04.2a", or "S04": the scene's first step) back into a place, or null. */
export function parseKey(deck: Deck, text: string): Pos | null {
  let key = text.trim().replace(/^#/, '');
  try {
    key = decodeURIComponent(key);
  } catch {
    return null;
  }
  if (!key) return null;
  for (const [s, scene] of deck.scenes.entries()) {
    const b = scene.steps.findIndex((step) => step.key === key);
    if (b >= 0) return { s, b };
  }
  const s = deck.scenes.findIndex((scene) => scene.id === key);
  return s >= 0 ? { s, b: 0 } : null;
}

/** The step's place in the whole deck, from 0. */
export function flatIndex(deck: Deck, pos: Pos): number {
  let n = 0;
  for (let i = 0; i < pos.s; i++) n += deck.scenes[i]?.steps.length ?? 0;
  return n + pos.b;
}

export const totalSteps = (deck: Deck): number => deck.scenes.reduce((n, scene) => n + scene.steps.length, 0);

/** "01", "10"; an unnumbered scene has none. */
export const sceneTag = (scene: Pick<DeckScene, 'number'>): string =>
  scene.number === undefined ? '' : String(scene.number).padStart(2, '0');
