// What a step's map shows, field by field: the exact counterpart of the record view's clicks, and the way to
// reach things the stage cannot click (an element by name, a loop's badge, the timing of pulses, the reveal
// and the ambient pulses). Each change is one undoable edit through the model's story operations.
import {
  FRAMES,
  LEVELS,
  type Level,
  loopPolarity,
  type MapState,
  type Project,
  pulseRoundLoop,
  resolveLevels,
  type Step,
  setStepBase,
  setStepLevel,
  setStepLoops,
  setStepMap,
  setStepTrend,
  type Trend,
} from '@loopweft/model';
import {
  Accordion,
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Pill,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconRepeat, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useEdit, useStudio } from '../context.tsx';
import { CommitText, NumberValue } from '../map/inputs.tsx';

const TREND_MARK: Record<Trend, string> = { up: '▲', down: '▼', mixed: '±' };

type Edit = ReturnType<typeof useEdit>;

/** Variables and links by name, for choosing one. */
function elementOptions(project: Project) {
  return [
    {
      group: 'Variables',
      items: project.variables.map((v) => ({ value: v.id, label: `${v.label} (${v.id})` })),
    },
    {
      group: 'Links',
      items: project.links.map((l) => {
        const from = project.variables.find((v) => v.id === l.from)?.label ?? l.from;
        const to = project.variables.find((v) => v.id === l.to)?.label ?? l.to;
        return { value: l.id, label: `${l.id}: ${from} → ${to}` };
      }),
    },
  ];
}

const variableOptions = (project: Project) =>
  project.variables.map((v) => ({ value: v.id, label: `${v.label} (${v.id})` }));

/**
 * A searchable list that adds what is picked and then empties itself, ready for the next one (the choice
 * is an action, not a value the list keeps).
 */
function AddSelect({
  label,
  data,
  onPick,
}: {
  label: string;
  data: { value: string; label: string }[];
  onPick(id: string): void;
}) {
  const [search, setSearch] = useState('');
  return (
    <Select
      label={label}
      placeholder="Search by name"
      size="xs"
      searchable
      data={data}
      value={null}
      searchValue={search}
      onSearchChange={setSearch}
      onChange={(id) => {
        setSearch('');
        if (id) onPick(id);
      }}
      comboboxProps={{ withinPortal: true }}
    />
  );
}

/** Ids as small removable pills. */
function Ids({
  ids,
  onRemove,
  label,
}: {
  ids: readonly string[];
  onRemove(id: string): void;
  label: string;
}) {
  if (ids.length === 0)
    return (
      <Text size="xs" c="dimmed">
        None
      </Text>
    );
  return (
    <Pill.Group aria-label={label}>
      {ids.map((id) => (
        <Pill
          key={id}
          withRemoveButton
          onRemove={() => onRemove(id)}
          removeButtonProps={{ 'aria-hidden': false, tabIndex: 0, 'aria-label': `Remove ${id}` }}
        >
          {id}
        </Pill>
      ))}
    </Pill.Group>
  );
}

function Emphasis({
  project,
  stepKey,
  map,
  edit,
}: {
  project: Project;
  stepKey: string;
  map: MapState;
  edit: Edit;
}) {
  const [element, setElement] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>('focus');
  const links = new Set(project.links.map((l) => l.id));
  const kindOf = (id: string) => (links.has(id) ? 'links' : 'variables');
  const levelOptions = LEVELS.map((l) => ({ value: l, label: l }));
  const lit = resolveLevels(project, map);
  return (
    <Stack gap="xs">
      <Group grow gap="xs">
        <Select
          label="Variables not listed"
          size="xs"
          data={levelOptions}
          value={map.variables?.base ?? 'normal'}
          allowDeselect={false}
          onChange={(next) =>
            next &&
            edit((p) => setStepBase(p, stepKey, 'variables', next === 'normal' ? null : (next as Level)))
          }
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label="Links not listed"
          size="xs"
          data={levelOptions}
          value={map.links?.base ?? 'normal'}
          allowDeselect={false}
          onChange={(next) =>
            next && edit((p) => setStepBase(p, stepKey, 'links', next === 'normal' ? null : (next as Level)))
          }
          comboboxProps={{ withinPortal: true }}
        />
      </Group>
      <Table withRowBorders={false} verticalSpacing={4} fz="xs">
        <Table.Tbody>
          {[...LEVELS].reverse().map((l) => {
            const ids = [...(map.variables?.[l] ?? []), ...(map.links?.[l] ?? [])];
            return (
              <Table.Tr key={l}>
                <Table.Td w={64} c="dimmed" style={{ verticalAlign: 'top' }}>
                  {l}
                </Table.Td>
                <Table.Td>
                  <Ids
                    ids={ids}
                    label={`Listed at ${l}`}
                    onRemove={(id) => edit((p) => setStepLevel(p, stepKey, kindOf(id), [id], null))}
                  />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <Select
          label="Put a variable or link"
          placeholder="Search by name"
          size="xs"
          searchable
          data={elementOptions(project)}
          value={element}
          onChange={setElement}
          style={{ flex: 1 }}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label="at"
          size="xs"
          w={92}
          data={levelOptions}
          value={level}
          allowDeselect={false}
          onChange={(next) => next && setLevel(next as Level)}
          comboboxProps={{ withinPortal: true }}
        />
        <Button
          size="xs"
          disabled={!element}
          onClick={() => {
            if (element && edit((p) => setStepLevel(p, stepKey, kindOf(element), [element], level)))
              setElement(null);
          }}
        >
          Put
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        Lit (focus or active): {lit.litVariables.length} variables, {lit.litLinks.length} links. Both ends of
        a visible link are shown.
      </Text>
    </Stack>
  );
}

function Camera({
  project,
  stepKey,
  map,
  edit,
}: {
  project: Project;
  stepKey: string;
  map: MapState;
  edit: Edit;
}) {
  const camera = map.camera ?? {};
  const setCamera = (next: MapState['camera'], summary?: string) =>
    edit((p) => setStepMap(p, stepKey, { camera: next && Object.keys(next).length ? next : null }, summary));
  // What is lit: the lit variables and both ends of the lit links, in the map's order.
  const resolved = resolveLevels(project, map);
  const litLinks = new Set(resolved.litLinks);
  const ends = new Set([
    ...resolved.litVariables,
    ...project.links.filter((l) => litLinks.has(l.id)).flatMap((l) => [l.from, l.to]),
  ]);
  const lit = project.variables.filter((v) => ends.has(v.id)).map((v) => v.id);
  return (
    <Stack gap="xs">
      <Text size="xs" fw={500}>
        Frames
      </Text>
      {camera.fit?.length ? (
        <Ids
          ids={camera.fit}
          label="The camera frames"
          onRemove={(id) => {
            const fit = (camera.fit ?? []).filter((v) => v !== id);
            const { fit: _, ...rest } = camera;
            setCamera(fit.length ? { ...rest, fit } : rest);
          }}
        />
      ) : (
        <Text size="xs" c="dimmed">
          The whole map{project.layout.home ? ' (the home view)' : ''}
        </Text>
      )}
      <Group gap="xs">
        <Button
          size="compact-xs"
          variant="default"
          disabled={lit.length === 0}
          onClick={() =>
            setCamera({ ...camera, fit: lit }, `Step ${stepKey}: the camera frames what is lit.`)
          }
        >
          Frame what is lit
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          disabled={!camera.fit}
          onClick={() => {
            const { fit: _, ...rest } = camera;
            setCamera(rest, `Step ${stepKey}: the camera shows the whole map.`);
          }}
        >
          Whole map
        </Button>
      </Group>
      <AddSelect
        label="Add a variable to frame"
        data={variableOptions(project).filter((o) => !camera.fit?.includes(o.value))}
        onPick={(id) => setCamera({ ...camera, fit: [...(camera.fit ?? []), id] })}
      />
      <Group grow gap="xs">
        <Select
          label="Where on the stage"
          size="xs"
          data={FRAMES.map((f) => ({ value: f, label: f }))}
          value={camera.frame ?? 'center'}
          allowDeselect={false}
          onChange={(next) => {
            if (!next) return;
            const { frame: _, ...rest } = camera;
            setCamera(next === 'center' ? rest : { ...rest, frame: next as (typeof FRAMES)[number] });
          }}
          comboboxProps={{ withinPortal: true }}
        />
        <NumberValue
          label="Zoom at most"
          value={camera.maxZoom}
          min={0.1}
          step={0.1}
          onCommit={(next) => {
            const { maxZoom: _, ...rest } = camera;
            setCamera(next === null ? rest : { ...rest, maxZoom: next });
          }}
        />
      </Group>
    </Stack>
  );
}

function Look({ stepKey, map, edit }: { stepKey: string; map: MapState; edit: Edit }) {
  const set = (changes: Parameters<typeof setStepMap>[2]) => edit((p) => setStepMap(p, stepKey, changes));
  return (
    <Stack gap="xs">
      <Switch
        size="xs"
        label="Show the map"
        checked={map.show !== false}
        onChange={(event) => set({ show: event.currentTarget.checked ? null : false })}
      />
      <Group grow gap="xs">
        <Select
          label="Labels"
          size="xs"
          data={[
            { value: 'none', label: 'None' },
            { value: 'focus', label: 'Lit ones' },
            { value: 'view', label: 'In view' },
            { value: 'all', label: 'All' },
          ]}
          value={map.labels ?? 'view'}
          allowDeselect={false}
          onChange={(next) => next && set({ labels: next === 'view' ? null : (next as MapState['labels']) })}
          comboboxProps={{ withinPortal: true }}
        />
        <NumberValue
          label="Opacity"
          value={map.opacity}
          min={0}
          max={1}
          step={0.1}
          onCommit={(next) => set({ opacity: next })}
        />
      </Group>
      <Group grow gap="xs">
        <Select
          label="Group halos"
          size="xs"
          data={[
            { value: 'show', label: 'Show' },
            { value: 'dim', label: 'Dim' },
            { value: 'hide', label: 'Hide' },
          ]}
          value={map.clusters ?? 'show'}
          allowDeselect={false}
          onChange={(next) => next && set({ clusters: next === 'show' ? null : (next as 'dim' | 'hide') })}
          comboboxProps={{ withinPortal: true }}
        />
        <Select
          label="Minimap"
          size="xs"
          data={[
            { value: 'auto', label: 'When zoomed in' },
            { value: 'on', label: 'Always' },
            { value: 'off', label: 'Never' },
          ]}
          value={map.minimap === undefined ? 'auto' : map.minimap ? 'on' : 'off'}
          allowDeselect={false}
          onChange={(next) => next && set({ minimap: next === 'auto' ? null : next === 'on' })}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>
      <Switch
        size="xs"
        label="Group labels"
        checked={map.categoryLabels === true}
        onChange={(event) => set({ categoryLabels: event.currentTarget.checked ? true : null })}
      />
    </Stack>
  );
}

function Trends({
  project,
  stepKey,
  map,
  edit,
}: {
  project: Project;
  stepKey: string;
  map: MapState;
  edit: Edit;
}) {
  const [variable, setVariable] = useState<string | null>(null);
  const trends = Object.entries(map.trends ?? {});
  return (
    <Stack gap="xs">
      {trends.length ? (
        <Pill.Group aria-label="Trends">
          {trends.map(([id, t]) => (
            <Pill
              key={id}
              withRemoveButton
              onRemove={() => edit((p) => setStepTrend(p, stepKey, [id], null))}
              removeButtonProps={{
                'aria-hidden': false,
                tabIndex: 0,
                'aria-label': `Remove the trend of ${id}`,
              }}
            >
              {id} {TREND_MARK[t]}
            </Pill>
          ))}
        </Pill.Group>
      ) : (
        <Text size="xs" c="dimmed">
          None
        </Text>
      )}
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <Select
          label="Mark a variable"
          placeholder="Search by name"
          size="xs"
          searchable
          data={variableOptions(project)}
          value={variable}
          onChange={setVariable}
          style={{ flex: 1 }}
          comboboxProps={{ withinPortal: true }}
        />
        {(['up', 'down', 'mixed'] as const).map((t) => (
          <Tooltip
            key={t}
            label={t === 'mixed' ? 'Mixed: opposing influences meet' : t === 'up' ? 'Rising' : 'Falling'}
          >
            <ActionIcon
              variant="default"
              size="md"
              disabled={!variable}
              aria-label={`Mark ${t}`}
              onClick={() => variable && edit((p) => setStepTrend(p, stepKey, [variable], t))}
            >
              {TREND_MARK[t]}
            </ActionIcon>
          </Tooltip>
        ))}
      </Group>
      <Text size="xs" c="dimmed">
        The Spread tool marks trends for you: it follows the signs of the lit links.
      </Text>
    </Stack>
  );
}

function Loops({
  project,
  stepKey,
  map,
  edit,
}: {
  project: Project;
  stepKey: string;
  map: MapState;
  edit: Edit;
}) {
  if (project.loops.length === 0)
    return (
      <Text size="xs" c="dimmed">
        The map has no named loops. Name loops in the Map workspace’s Loops panel to badge them here.
      </Text>
    );
  const badges = new Set(map.loops ?? []);
  const names = new Set(map.loopNames ?? []);
  return (
    <Table withRowBorders={false} verticalSpacing={2} fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Loop</Table.Th>
          <Table.Th w={52}>Badge</Table.Th>
          <Table.Th w={52}>Name</Table.Th>
          <Table.Th w={36} />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {project.loops.map((loop) => (
          <Table.Tr key={loop.id}>
            <Table.Td>
              {loop.id} ({loopPolarity(project, loop) ?? '?'}) {loop.name}
            </Table.Td>
            <Table.Td>
              <Checkbox
                size="xs"
                aria-label={`Badge ${loop.id}`}
                checked={badges.has(loop.id)}
                onChange={(event) =>
                  edit((p) => setStepLoops(p, stepKey, [loop.id], { badge: event.currentTarget.checked }))
                }
              />
            </Table.Td>
            <Table.Td>
              <Checkbox
                size="xs"
                aria-label={`Name ${loop.id}`}
                checked={names.has(loop.id)}
                onChange={(event) =>
                  edit((p) => setStepLoops(p, stepKey, [loop.id], { name: event.currentTarget.checked }))
                }
              />
            </Table.Td>
            <Table.Td>
              <Tooltip label="Pulse round this loop">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label={`Pulse round ${loop.id}`}
                  onClick={() => edit((p) => pulseRoundLoop(p, stepKey, loop.id))}
                >
                  <IconRepeat size={14} aria-hidden />
                </ActionIcon>
              </Tooltip>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function Pulses({ stepKey, map, edit }: { stepKey: string; map: MapState; edit: Edit }) {
  const pulses = map.pulses;
  if (!pulses)
    return (
      <Text size="xs" c="dimmed">
        No pulses. Use the Pulse tool on the stage, or pulse round a loop above.
      </Text>
    );
  const set = (next: Partial<NonNullable<MapState['pulses']>> & Record<string, unknown>) => {
    const merged: Record<string, unknown> = { ...pulses, ...next };
    for (const key of Object.keys(merged)) if (merged[key] === null) delete merged[key];
    return edit((p) => setStepMap(p, stepKey, { pulses: merged as NonNullable<MapState['pulses']> }));
  };
  return (
    <Stack gap="xs">
      <ol className="lw-hops" aria-label="Pulse hops">
        {pulses.hops.map((hop, h) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: hops are positional
          <li key={h}>
            <Group gap={4} wrap="nowrap">
              <Text size="xs" style={{ flex: 1 }}>
                {hop.join(' + ')}
              </Text>
              <ActionIcon
                variant="subtle"
                size="xs"
                aria-label={`Remove hop ${h + 1}`}
                onClick={() => {
                  const hops = pulses.hops.filter((_, i) => i !== h);
                  edit((p) => setStepMap(p, stepKey, { pulses: hops.length ? { ...pulses, hops } : null }));
                }}
              >
                <IconX size={12} aria-hidden />
              </ActionIcon>
            </Group>
          </li>
        ))}
      </ol>
      <Group grow gap="xs">
        <NumberValue
          label="Extra passes"
          value={pulses.repeat}
          min={0}
          step={1}
          onCommit={(next) => set({ repeat: next as never })}
        />
        <NumberValue
          label="Delay (s)"
          value={pulses.delay}
          min={0}
          step={0.1}
          onCommit={(next) => set({ delay: next as never })}
        />
      </Group>
      <Select
        label="Tone"
        size="xs"
        data={[
          { value: 'auto', label: 'By the trends (default)' },
          { value: 'harm', label: 'Harm' },
          { value: 'relief', label: 'Relief' },
          { value: 'mixed', label: 'Mixed' },
        ]}
        value={pulses.tone ?? 'auto'}
        allowDeselect={false}
        onChange={(next) => next && set({ tone: (next === 'auto' ? null : next) as never })}
        comboboxProps={{ withinPortal: true }}
      />
      <Button
        size="compact-xs"
        variant="default"
        color="red"
        onClick={() => edit((p) => setStepMap(p, stepKey, { pulses: null }))}
      >
        Remove the pulses
      </Button>
    </Stack>
  );
}

function Reveal({
  project,
  stepKey,
  map,
  edit,
}: {
  project: Project;
  stepKey: string;
  map: MapState;
  edit: Edit;
}) {
  const reveal = map.reveal ?? {};
  const set = (next: Record<string, unknown>) => {
    const merged: Record<string, unknown> = { ...reveal, ...next };
    for (const key of Object.keys(merged)) if (merged[key] === null) delete merged[key];
    return edit((p) =>
      setStepMap(p, stepKey, { reveal: Object.keys(merged).length ? (merged as MapState['reveal']) : null }),
    );
  };
  return (
    <Stack gap="xs">
      <Select
        label="New links arrive"
        size="xs"
        data={[
          { value: 'draw', label: 'Tracing in from their source (default)' },
          { value: 'bloom', label: 'Blooming out, ring by ring' },
        ]}
        value={reveal.mode ?? 'draw'}
        allowDeselect={false}
        onChange={(next) => next && set({ mode: next === 'draw' ? null : next })}
        comboboxProps={{ withinPortal: true }}
      />
      <Text size="xs" fw={500}>
        Grows from
      </Text>
      <Ids
        ids={reveal.from ?? []}
        label="The reveal grows from"
        onRemove={(id) => {
          const from = (reveal.from ?? []).filter((v) => v !== id);
          set({ from: from.length ? from : null });
        }}
      />
      <AddSelect
        label="Add a variable it grows from"
        data={variableOptions(project).filter((o) => !reveal.from?.includes(o.value))}
        onPick={(id) => set({ from: [...(reveal.from ?? []), id] })}
      />
      <CommitText
        label="Exact order (ids, comma-separated)"
        description="Variables appear and links trace in this order, one beat each"
        value={(reveal.sequence ?? []).join(', ')}
        onCommit={(next) => {
          const ids = (next ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          set({ sequence: ids.length ? ids : null });
        }}
      />
      <Group grow gap="xs">
        <NumberValue
          label="Between beats (s)"
          value={reveal.stagger}
          min={0}
          step={0.1}
          onCommit={(next) => set({ stagger: next })}
        />
        <NumberValue
          label="Delay (s)"
          value={reveal.delay}
          min={0}
          step={0.1}
          onCommit={(next) => set({ delay: next })}
        />
      </Group>
    </Stack>
  );
}

function Ambient({
  project,
  stepKey,
  map,
  edit,
}: {
  project: Project;
  stepKey: string;
  map: MapState;
  edit: Edit;
}) {
  const ambient = map.ambient;
  const [adding, setAdding] = useState<string | null>(null);
  const [tone, setTone] = useState<'harm' | 'relief'>('harm');
  if (!ambient) {
    return (
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Pulses that keep wandering the lit map while the step is held, for a title or a close.
        </Text>
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <Select
            label="Start from"
            placeholder="Search by name"
            size="xs"
            searchable
            data={variableOptions(project)}
            value={adding}
            onChange={setAdding}
            style={{ flex: 1 }}
            comboboxProps={{ withinPortal: true }}
          />
          <Select
            label="Tone"
            size="xs"
            w={92}
            data={[
              { value: 'harm', label: 'Harm' },
              { value: 'relief', label: 'Relief' },
            ]}
            value={tone}
            allowDeselect={false}
            onChange={(next) => next && setTone(next as 'harm' | 'relief')}
            comboboxProps={{ withinPortal: true }}
          />
          <Button
            size="xs"
            disabled={!adding}
            onClick={() =>
              adding && edit((p) => setStepMap(p, stepKey, { ambient: { from: [adding], tone } }))
            }
          >
            Add
          </Button>
        </Group>
      </Stack>
    );
  }
  const set = (next: Record<string, unknown>) => {
    const merged: Record<string, unknown> = { ...ambient, ...next };
    for (const key of Object.keys(merged)) if (merged[key] === null) delete merged[key];
    return edit((p) => setStepMap(p, stepKey, { ambient: merged as NonNullable<MapState['ambient']> }));
  };
  return (
    <Stack gap="xs">
      <Text size="xs" fw={500}>
        Starts from
      </Text>
      <Ids
        ids={ambient.from}
        label="Ambient pulses start from"
        onRemove={(id) => {
          const from = ambient.from.filter((v) => v !== id);
          if (from.length) set({ from });
          else edit((p) => setStepMap(p, stepKey, { ambient: null }));
        }}
      />
      <AddSelect
        label="Add a start"
        data={variableOptions(project).filter((o) => !ambient.from.includes(o.value))}
        onPick={(id) => set({ from: [...ambient.from, id] })}
      />
      <Select
        label="Tone"
        size="xs"
        data={[
          { value: 'harm', label: 'Harm (an increase spreading)' },
          { value: 'relief', label: 'Relief (a decrease spreading)' },
        ]}
        value={ambient.tone}
        allowDeselect={false}
        onChange={(next) => next && set({ tone: next })}
        comboboxProps={{ withinPortal: true }}
      />
      <Group grow gap="xs">
        <NumberValue
          label="Delay (s)"
          value={ambient.delay}
          min={0}
          step={0.1}
          onCommit={(next) => set({ delay: next })}
        />
      </Group>
      <Button
        size="compact-xs"
        variant="default"
        color="red"
        onClick={() => edit((p) => setStepMap(p, stepKey, { ambient: null }))}
      >
        Remove the ambient pulses
      </Button>
    </Stack>
  );
}

function LabelText({
  project,
  stepKey,
  map,
  edit,
}: {
  project: Project;
  stepKey: string;
  map: MapState;
  edit: Edit;
}) {
  const entries = Object.entries(map.labelText ?? {});
  const setText = (id: string, text: string | null) => {
    const next = { ...(map.labelText ?? {}) };
    if (text === null) delete next[id];
    else next[id] = text;
    return edit((p) => setStepMap(p, stepKey, { labelText: Object.keys(next).length ? next : null }));
  };
  return (
    <Stack gap="xs">
      {entries.map(([id, text]) => (
        <Group key={id} gap="xs" align="flex-end" wrap="nowrap">
          <div style={{ flex: 1 }}>
            <CommitText
              label={`Label of ${id} on this step`}
              value={text}
              onCommit={(next) => setText(id, next)}
            />
          </div>
          <ActionIcon
            variant="subtle"
            aria-label={`Remove the label text of ${id}`}
            onClick={() => setText(id, null)}
            mb={6}
          >
            <IconX size={14} aria-hidden />
          </ActionIcon>
        </Group>
      ))}
      <AddSelect
        label="Give a variable other label text on this step"
        data={variableOptions(project).filter((o) => !(o.value in (map.labelText ?? {})))}
        onPick={(id) => {
          const variable = project.variables.find((v) => v.id === id);
          if (variable) setText(variable.id, (variable.mapLabel ?? variable.label).replace(/\n/g, ' '));
        }}
      />
    </Stack>
  );
}

/** Everything a step's map shows. */
export function MapPanel({ stepKey, step }: { stepKey: string; step: Step }) {
  const edit = useEdit();
  const project = useStudio((s) => s.project);
  const props = { project, stepKey, map: step.map, edit };
  const sections = [
    { value: 'emphasis', label: 'What stands out', body: <Emphasis {...props} /> },
    { value: 'camera', label: 'Camera', body: <Camera {...props} /> },
    { value: 'trends', label: 'Trends ▲ ▼ ±', body: <Trends {...props} /> },
    { value: 'loops', label: 'Loop badges', body: <Loops {...props} /> },
    { value: 'pulses', label: 'Pulses', body: <Pulses {...props} /> },
    { value: 'reveal', label: 'How new things arrive', body: <Reveal {...props} /> },
    { value: 'ambient', label: 'Ambient pulses', body: <Ambient {...props} /> },
    { value: 'look', label: 'Labels, halos and minimap', body: <Look {...props} /> },
    { value: 'labelText', label: 'Label text for this step', body: <LabelText {...props} /> },
  ];
  return (
    <div className="lw-panel-body">
      <Text size="sm" fw={600} mb="xs">
        What step {stepKey} shows
      </Text>
      <Accordion
        multiple
        defaultValue={['emphasis', 'camera', 'trends']}
        variant="contained"
        chevronPosition="left"
      >
        {sections.map((s) => (
          <Accordion.Item key={s.value} value={s.value}>
            <Accordion.Control>
              <Text size="sm">{s.label}</Text>
            </Accordion.Control>
            <Accordion.Panel>{s.body}</Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  );
}
