// The stage as the audience will see it: @loopweft/render's story view, drawn from the open project and
// showing the chosen step. The view is built again only when what it draws from changes (variables, links,
// layout, types, theme, loops, sources or images); an edit to the story just shows the step again. Its
// animation clock lives as long as the stage: it stops when the stage closes.
import type { Project, Scene, Step } from '@loopweft/model';
import { FrameClock, Motion } from '@loopweft/motion';
import { StoryView, type Transition } from '@loopweft/render';
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface Shown {
  scene: Pick<Scene, 'title' | 'headline'>;
  /** The scene's number in the story (`sceneNumbers`), if it shows a caption. */
  number: number | undefined;
  /** Null: the whole map, plainly, with no overlays. */
  step: Step | null;
}

export interface StageHandle {
  /** The story view, once built. */
  view(): StoryView | null;
  /** Skip: every animation playing jumps to its end. */
  skip(): void;
  /** Shows a step with a transition (the preview). */
  show(shown: Shown, transition: Transition): void;
  /** The transition the next change of step shows with (once; then changes show at once again). */
  nextTransition(transition: Transition): void;
}

function present(view: StoryView, shown: Shown, transition: Transition) {
  if (shown.step) view.showStep(shown.scene, shown.number, shown.step, transition);
  else {
    view.overlays.apply([], { number: shown.number, title: shown.scene.title }, transition);
    view.map.apply({}, transition);
  }
}

export const StoryStage = forwardRef<
  StageHandle,
  {
    project: Project;
    shown: Shown | null;
    className?: string;
    /** Drawn once the view is built, e.g. the record view's click targets (into the view's layers). */
    children?: (view: StoryView) => ReactNode;
  }
>(function StoryStage({ project, shown, className, children }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState<Motion | null>(null);
  const [view, setView] = useState<StoryView | null>(null);
  const upcoming = useRef<Transition>('instant');

  // The clock is made and stopped by an effect, not when the state is first made, so that every clock
  // started is stopped (React may mount a component twice in development).
  useEffect(() => {
    const next = new Motion(new FrameClock());
    setMotion(next);
    return () => next.dispose();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt from the parts of the project it draws, not the story
  useEffect(() => {
    const el = host.current;
    if (!el || !motion) return;
    motion.landAll();
    const next = new StoryView(el, { project, motion });
    setView(next);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) next.relayout();
    });
    return () => {
      live = false;
      next.dispose();
    };
  }, [
    project.variables,
    project.links,
    project.layout,
    project.types,
    project.theme,
    project.loops,
    project.sources,
    project.assets,
    motion,
  ]);

  useEffect(() => {
    if (!view || !motion) return;
    motion.landAll();
    present(view, shown ?? { scene: { title: '' }, number: undefined, step: null }, upcoming.current);
    upcoming.current = 'instant';
  }, [view, shown, motion]);

  useImperativeHandle(
    ref,
    () => ({
      view: () => view,
      skip: () => motion?.landAll(),
      show: (shownNext, transition) => {
        if (!view || !motion) return;
        motion.landAll();
        present(view, shownNext, transition);
      },
      nextTransition: (transition) => {
        upcoming.current = transition;
      },
    }),
    [view, motion],
  );

  return (
    <div ref={host} className={className ?? 'lw-story-stage'} data-testid="story-stage">
      {view && children?.(view)}
    </div>
  );
});
