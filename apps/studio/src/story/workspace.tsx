// The Story workspace: the outline of scenes and steps, the stage showing the chosen step as the audience
// will see it, and the side panel to change it.
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import { stepKeys, useCurrent } from './current.ts';
import { StoryOutline } from './outline.tsx';
import { StorySide } from './panels.tsx';
import { type Brush, LOOK, RecordBar, RecordLayer } from './record.tsx';
import { type Shown, type StageHandle, StoryStage } from './stage.tsx';

export function StoryWorkspace() {
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const current = useCurrent();
  const stage = useRef<StageHandle>(null);
  const [brush, setBrush] = useState<Brush>(LOOK);
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
  const go = (offset: number) => {
    const next = keys[at + offset];
    if (next) store.getState().selectStory(next);
  };
  return (
    <div className="lw-workspace">
      <StoryOutline />
      <div className="lw-view">
        <div className="lw-viewbar">
          <Group gap={2} wrap="nowrap">
            <Tooltip label="Previous step">
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
            <Tooltip label="Next step">
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
              ? `${current.key} · ${current.step.label} · step ${current.position + 1} of ${current.total}`
              : current
                ? `Scene ${current.scene.id} · ${current.scene.title}`
                : 'No story yet'}
          </Text>
        </div>
        {current?.step && <RecordBar brush={brush} onChange={setBrush} />}
        <div className={`lw-story-frame${brush.tool !== 'look' && current?.step ? ' recording' : ''}`}>
          <StoryStage ref={stage} project={project} shown={shown}>
            {(view) =>
              brush.tool !== 'look' &&
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
        </div>
      </div>
      <StorySide />
    </div>
  );
}
