// The Story workspace: the outline of scenes and steps, the stage showing the chosen step as the audience
// will see it, and the side panel to change it. The preview plays the transitions: into the chosen step, or
// the scene from the chosen step on, at the times its steps are due; choosing another step, or any edit, stops
// it. With the stage focused, the arrow keys move through the story as a presenter would (forward with the
// full motion, back with a quick fade).

import type { Project, Step } from '@loopweft/model';
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPlay,
  IconPlayerSkipForward,
  IconPlayerStop,
  IconPlayerTrackNext,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import { currentOf, stepKeys, useCurrent } from './current.ts';
import { StoryOutline } from './outline.tsx';
import { StorySide } from './panels.tsx';
import { type Brush, LOOK, RecordBar, RecordLayer } from './record.tsx';
import { type Shown, type StageHandle, StoryStage } from './stage.tsx';

/** How long a step holds while the scene plays when the next has no time it is due. */
export const HOLD_SECONDS = 4;

/**
 * When each step of a scene comes up as the scene plays, in seconds into the scene: a step due at a time
 * (`at`) comes up then, or at once when the step before came up later; an untimed step comes up HOLD_SECONDS
 * after the one before. The first step comes up at its own time, or at 0.
 */
export function playTimes(steps: readonly Pick<Step, 'at'>[]): number[] {
  const times: number[] = [];
  for (const step of steps) {
    const before = times.at(-1);
    if (before === undefined) times.push(step.at ?? 0);
    else times.push(step.at !== undefined ? Math.max(before, step.at) : before + HOLD_SECONDS);
  }
  return times;
}

export function StoryWorkspace() {
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const current = useCurrent();
  const stage = useRef<StageHandle>(null);
  const [brush, setBrush] = useState<Brush>(LOOK);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The step the playing scene last brought up. */
  const playedTo = useRef<string | null>(null);
  /** The project the scene started playing in: its steps and times are the ones being played. */
  const playedIn = useRef<Project | null>(null);
  const title = current?.scene.title;
  const headline = current?.scene.headline;
  const sceneIndex = current?.sceneIndex ?? 0;
  const step = current?.step ?? null;
  const shown = useMemo<Shown | null>(
    () =>
      title === undefined ? null : { scene: { title, ...(headline ? { headline } : {}) }, sceneIndex, step },
    [title, headline, sceneIndex, step],
  );
  const keys = stepKeys(project);
  const at = current?.step ? keys.indexOf(current.key) : -1;

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: stops the scene's timer when the workspace closes
  useEffect(() => () => stop(), []);
  // Another step chosen while the scene plays (in the outline, with the arrows or the script) stops it; so does
  // any edit (a step moved, a time changed), which leaves the scene played out of date even on the same step.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the chosen step or the project changes
  useEffect(() => {
    if (playing && (current?.key !== playedTo.current || project !== playedIn.current)) stop();
  }, [playing, current?.key, project]);

  /** Moves to another step: forward with the full motion, back with a quick fade. None from a scene's head. */
  const go = (offset: number) => {
    if (at < 0) return;
    const next = keys[at + offset];
    if (!next) return;
    stage.current?.nextTransition(offset === 1 ? 'smooth' : offset === -1 ? 'quick' : 'instant');
    store.getState().selectStory(next);
  };

  /** Plays the change into the chosen step: the step before it at once, then this one with its motion. */
  const playInto = () => {
    const handle = stage.current;
    if (!current?.step || !handle || !shown) return;
    const before = keys[at - 1];
    const previous = before ? currentOf(project, before) : null;
    if (previous?.step) {
      const { title: t, headline: h } = previous.scene;
      handle.show(
        {
          scene: { title: t, ...(h ? { headline: h } : {}) },
          sceneIndex: previous.sceneIndex,
          step: previous.step,
        },
        'instant',
      );
    } else {
      // The first step of the story comes out of an empty stage.
      handle.show({ ...shown, step: { id: '', label: '', map: { show: false }, overlays: [] } }, 'instant');
    }
    handle.show(shown, 'smooth');
  };

  /** Plays the scene from the chosen step on: each step when the next is due (or after a short hold). */
  const playScene = () => {
    if (!current?.step) return;
    stop();
    setBrush(LOOK);
    setPlaying(true);
    playInto();
    const scene = current.scene;
    const times = playTimes(scene.steps);
    playedTo.current = current.key;
    playedIn.current = project;
    const advance = (index: number) => {
      const next = scene.steps[index + 1];
      if (!next) {
        timer.current = setTimeout(() => setPlaying(false), HOLD_SECONDS * 1000);
        return;
      }
      const wait = (times[index + 1] ?? 0) - (times[index] ?? 0);
      timer.current = setTimeout(() => {
        const key = `${scene.id}.${next.id}`;
        playedTo.current = key;
        stage.current?.nextTransition('smooth');
        store.getState().selectStory(key);
        advance(index + 1);
      }, wait * 1000);
    };
    advance(current.stepIndex);
  };

  const recording = brush.tool !== 'look' && !!current?.step && !playing;
  return (
    <div className="lw-workspace">
      <StoryOutline />
      <div className="lw-view">
        <div className="lw-viewbar">
          <Group gap={2} wrap="nowrap">
            <Tooltip label="Previous step (←)">
              <ActionIcon
                variant="subtle"
                color="gray"
                disabled={at <= 0}
                onClick={() => go(-1)}
                aria-label="Previous step"
              >
                <IconChevronLeft size={18} aria-hidden />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Next step, with its motion (→)">
              <ActionIcon
                variant="subtle"
                color="gray"
                disabled={at < 0 || at >= keys.length - 1}
                onClick={() => go(1)}
                aria-label="Next step"
              >
                <IconChevronRight size={18} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Text size="sm" fw={500} truncate style={{ flex: 1 }} aria-live="polite">
            {current?.step
              ? `${playing ? 'Playing · ' : ''}${current.key} · ${current.step.label} · step ${current.position + 1} of ${current.total}`
              : current
                ? `Scene ${current.scene.id} · ${current.scene.title}`
                : 'No story yet'}
          </Text>
          <Group gap={2} wrap="nowrap">
            <Tooltip label="Play into this step (R)">
              <ActionIcon
                variant="subtle"
                disabled={!current?.step}
                onClick={playInto}
                aria-label="Play into this step"
              >
                <IconPlayerPlay size={18} aria-hidden />
              </ActionIcon>
            </Tooltip>
            {playing ? (
              <Tooltip label="Stop">
                <ActionIcon variant="subtle" color="red" onClick={stop} aria-label="Stop playing">
                  <IconPlayerStop size={18} aria-hidden />
                </ActionIcon>
              </Tooltip>
            ) : (
              <Tooltip
                label={`Play the scene from here (each step when the next is due; ${HOLD_SECONDS} s when untimed)`}
              >
                <ActionIcon
                  variant="subtle"
                  disabled={!current?.step}
                  onClick={playScene}
                  aria-label="Play the scene from here"
                >
                  <IconPlayerTrackNext size={18} aria-hidden />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="Skip to the end of the motion (S)">
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => stage.current?.skip()}
                aria-label="Skip to the end of the motion"
              >
                <IconPlayerSkipForward size={18} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
        </div>
        {current?.step && !playing && <RecordBar brush={brush} onChange={setBrush} />}
        <section
          className={`lw-story-frame${recording ? ' recording' : ''}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage takes the arrow keys, as a presenter's would
          tabIndex={0}
          aria-label="Stage (arrow keys move through the story)"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey)
              return;
            const keyMap: Record<string, () => void> = {
              ArrowRight: () => go(1),
              PageDown: () => go(1),
              ArrowLeft: () => go(-1),
              PageUp: () => go(-1),
              r: playInto,
              R: playInto,
              s: () => stage.current?.skip(),
              S: () => stage.current?.skip(),
            };
            const run = keyMap[event.key];
            if (run) {
              event.preventDefault();
              run();
            }
          }}
        >
          <StoryStage ref={stage} project={project} shown={shown}>
            {(view) =>
              recording &&
              current?.step && (
                <RecordLayer
                  view={view}
                  project={project}
                  stepKey={current.key}
                  map={current.step.map}
                  brush={brush}
                />
              )
            }
          </StoryStage>
        </section>
      </div>
      <StorySide />
    </div>
  );
}
