// The Story workspace's side panel: the chosen step (its label, timing and cue) and its scene (title,
// headline, target time and the sources it draws on beyond those its steps light).
import { setScene, setStep, stepSources } from '@loopweft/model';
import { MultiSelect, Stack, Tabs, Text, Title } from '@mantine/core';
import {
  IconAlertTriangle,
  IconLayersSubtract,
  IconListDetails,
  IconMap2,
  IconMovie,
  IconNotes,
} from '@tabler/icons-react';
import { type ComponentType, useState } from 'react';
import { useEdit, useStudio } from '../context.tsx';
import { CommitText, NumberValue } from '../map/inputs.tsx';
import { ChecksPanel } from './checks.tsx';
import { type Current, useCurrent } from './current.ts';
import { MapPanel } from './map-panel.tsx';
import { NotesPanel } from './notes.tsx';
import { OverlaysPanel } from './overlays-panel.tsx';

function StepPanel({ current }: { current: Current }) {
  const edit = useEdit();
  const project = useStudio((s) => s.project);
  const { step, key } = current;
  if (!step) {
    return (
      <div className="lw-panel-body">
        <Text size="sm" c="dimmed">
          {current.scene.steps.length
            ? 'Choose a step in the outline to set up what it shows.'
            : `Scene ${current.scene.id} has no steps yet: add one with its + in the outline.`}
        </Text>
      </div>
    );
  }
  const sources = stepSources(project, step);
  return (
    <div className="lw-panel-body">
      <Stack gap="sm">
        <Title order={2} size="h5">
          Step {key}
        </Title>
        <CommitText
          label="Label"
          description="A short name, for the presenter"
          value={step.label}
          required
          onCommit={(next) => next && edit((p) => setStep(p, key, { label: next }))}
        />
        <CommitText
          label="Cue"
          description="What happens on this step, for the presenter"
          value={step.cue ?? ''}
          multiline
          onCommit={(next) => edit((p) => setStep(p, key, { cue: next }))}
        />
        <NumberValue
          label="Due at (seconds into the scene)"
          description="For pacing; left empty, the step is not timed"
          value={step.at}
          min={0}
          onCommit={(next) => edit((p) => setStep(p, key, { at: next }))}
        />
        <Text size="xs" c="dimmed">
          Sources it draws on: {sources.length ? sources.join(', ') : 'none'} (those its overlays cite, and
          those cited by what it lights and the loops it badges).
        </Text>
      </Stack>
    </div>
  );
}

function StepMapPanel({ current }: { current: Current }) {
  if (!current.step)
    return (
      <div className="lw-panel-body">
        <Text size="sm" c="dimmed">
          Choose a step in the outline to set up what its map shows.
        </Text>
      </div>
    );
  return <MapPanel stepKey={current.key} step={current.step} />;
}

function StepOverlaysPanel({ current }: { current: Current }) {
  if (!current.step)
    return (
      <div className="lw-panel-body">
        <Text size="sm" c="dimmed">
          Choose a step in the outline to set up what is drawn over its map.
        </Text>
      </div>
    );
  return <OverlaysPanel stepKey={current.key} step={current.step} />;
}

const seconds = (s: number) =>
  s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;

function ScenePanel({ current }: { current: Current }) {
  const edit = useEdit();
  const sources = useStudio((s) => s.project.sources);
  const { scene } = current;
  const id = scene.id;
  const due = scene.steps.map((s) => s.at).filter((at): at is number => at !== undefined);
  return (
    <div className="lw-panel-body">
      <Stack gap="sm">
        <Title order={2} size="h5">
          Scene {id}
        </Title>
        <CommitText
          label="Title"
          value={scene.title}
          required
          onCommit={(next) => next && edit((p) => setScene(p, id, { title: next }))}
        />
        <CommitText
          label="Headline"
          description="The scene's one-line message, shown in its caption"
          value={scene.headline ?? ''}
          onCommit={(next) => edit((p) => setScene(p, id, { headline: next }))}
        />
        <NumberValue
          label="Target time (seconds)"
          description={
            due.length
              ? `Left empty, the scene is untimed. Its last timed step is due at ${seconds(Math.max(...due))}.`
              : 'Left empty, the scene is untimed (like a title page).'
          }
          value={scene.targetSeconds}
          min={1}
          onCommit={(next) => edit((p) => setScene(p, id, { targetSeconds: next }))}
        />
        <MultiSelect
          label="Also draws on"
          description="Sources the scene draws on beyond those its steps light"
          size="sm"
          searchable
          data={sources.map((s) => ({ value: s.id, label: s.label ? `${s.label} (${s.id})` : s.id }))}
          value={scene.sources}
          onChange={(next) => edit((p) => setScene(p, id, { sources: next }))}
          comboboxProps={{ withinPortal: true }}
        />
      </Stack>
    </div>
  );
}

interface PanelSpec {
  id: string;
  label: string;
  Icon: ComponentType<{ size?: number; stroke?: number; 'aria-hidden'?: boolean }>;
  Panel: ComponentType<{ current: Current }>;
}

const PANELS: PanelSpec[] = [
  { id: 'step', label: 'Step', Icon: IconListDetails, Panel: StepPanel },
  { id: 'map', label: 'Map', Icon: IconMap2, Panel: StepMapPanel },
  { id: 'overlays', label: 'Overlays', Icon: IconLayersSubtract, Panel: StepOverlaysPanel },
  { id: 'scene', label: 'Scene', Icon: IconMovie, Panel: ScenePanel },
  { id: 'notes', label: 'Notes', Icon: IconNotes, Panel: NotesPanel },
  { id: 'checks', label: 'Checks', Icon: IconAlertTriangle, Panel: () => <ChecksPanel /> },
];

export function StorySide() {
  const [panel, setPanel] = useState('step');
  const current = useCurrent();
  return (
    <aside className="lw-side" aria-label="Story panel">
      <Tabs
        value={panel}
        onChange={(value) => value && setPanel(value)}
        orientation="vertical"
        placement="right"
        keepMounted={false}
        classNames={{ root: 'lw-side-tabs', list: 'lw-rail', tab: 'lw-rail-tab', panel: 'lw-side-panel' }}
      >
        <Tabs.List aria-label="Story panels">
          {PANELS.map(({ id, label, Icon }) => (
            <Tabs.Tab key={id} value={id} leftSection={<Icon size={20} stroke={1.6} aria-hidden />}>
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {PANELS.map(({ id, Panel }) => (
          <Tabs.Panel key={id} value={id}>
            {current ? (
              <Panel key={current.key} current={current} />
            ) : (
              <div className="lw-panel-body">
                <Text size="sm" c="dimmed">
                  Add a scene to start the story.
                </Text>
              </div>
            )}
          </Tabs.Panel>
        ))}
      </Tabs>
    </aside>
  );
}
