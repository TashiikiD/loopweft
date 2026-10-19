// The stage as the audience will see it: @loopweft/render's story view, drawn from the open project and
// showing the chosen step. The view is built again only when the map itself changes (variables, links,
// layout, types, theme, loops or images); an edit to the story just shows the step again.
import type { Project, Scene, Step } from '@loopweft/model';
import { FrameClock, Motion } from '@loopweft/motion';
import { StoryView, type Transition } from '@loopweft/render';
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface Shown {
  scene: Pick<Scene, 'title' | 'headline'>;
  sceneIndex: number;
  /** Null: the whole map, plainly, with no overlays. */
  step: Step | null;
}

export interface StageHandle {
  /** The story view, once built. */
  view(): StoryView | null;
  motion: Motion;
  /** Shows a step with a transition (the preview). */
  show(shown: Shown, transition: Transition): void;
  /** The transition the next change of step shows with (once; then changes show at once again). */
  nextTransition(transition: Transition): void;
}

function present(view: StoryView, shown: Shown, transition: Transition) {
  if (shown.step) view.showStep(shown.scene, shown.sceneIndex, shown.step, transition);
  else {
    view.overlays.apply([], { number: shown.sceneIndex, title: shown.scene.title }, transition);
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
  const [motion] = useState(() => new Motion(new FrameClock()));
  const [view, setView] = useState<StoryView | null>(null);
  const upcoming = useRef<Transition>('instant');

  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt from the parts of the map it draws, not the story
  useEffect(() => {
    const el = host.current;
    if (!el) return;
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
    project.assets,
    motion,
  ]);

  useEffect(() => {
    if (!view) return;
    motion.landAll();
    present(view, shown ?? { scene: { title: '' }, sceneIndex: 0, step: null }, upcoming.current);
    upcoming.current = 'instant';
  }, [view, shown, motion]);

  useEffect(() => () => motion.landAll(), [motion]);

  useImperativeHandle(
    ref,
    () => ({
      view: () => view,
      motion,
      show: (shownNext, transition) => {
        if (!view) return;
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
