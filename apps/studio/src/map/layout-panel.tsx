// Automatic layouts, as `loopweft layout --auto` runs them: a constellation by category (the polycrisis
// map's look), DataViz's force layout, or a flow from causes to effects. Pinned variables stay where they
// are and curves set by hand stay; the same map and seed always give the same layout.
import { applyAutoLayout, type LayoutKind } from '@loopweft/layout';
import { plural, setPinned } from '@loopweft/model';
import { Button, Group, NumberInput, Radio, ScrollArea, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useEdit, useStudio, useStudioStore } from '../context.tsx';

const KINDS: { value: LayoutKind; name: string; about: string; seeded: boolean }[] = [
  {
    value: 'constellation',
    name: 'Constellation by category',
    about: "Each category a cluster round the map, with its halo and its name: the polycrisis map's look.",
    seeded: true,
  },
  {
    value: 'force',
    name: 'Force',
    about:
      "DataViz's force layout: linked variables drawn together, each category kept together, crossings kept down.",
    seeded: true,
  },
  {
    value: 'flow',
    name: 'Flow',
    about: 'From causes on the left to their effects on the right.',
    seeded: false,
  },
];

export function LayoutPanel() {
  const project = useStudio((s) => s.project);
  const store = useStudioStore();
  const edit = useEdit();
  const [kind, setKind] = useState<LayoutKind>('constellation');
  const [seed, setSeed] = useState<number | string>(1337);
  const choice = KINDS.find((k) => k.value === kind) as (typeof KINDS)[number];
  const positions = project.layout.positions;
  const pinned = project.variables.filter((v) => positions[v.id]?.pinned).map((v) => v.id);
  const unplaced = project.variables.filter((v) => !positions[v.id]).length;
  const halos = project.layout.groups.filter((g) => g.halo).length;
  const seedOk = !choice.seeded || (typeof seed === 'number' && Number.isInteger(seed) && seed >= 0);

  const lay = () => {
    if (!seedOk) return;
    const out = edit((p) => applyAutoLayout(p, { kind, ...(choice.seeded ? { seed: seed as number } : {}) }));
    if (!out) return;
    store.getState().requestFit();
    notifications.show({ message: `${out.summary} Ctrl+Z takes it back.`, autoClose: 6000 });
  };

  return (
    <ScrollArea className="lw-inspector" type="auto" offsetScrollbars>
      <div className="lw-inspector-body">
        <Stack gap="sm">
          <Title order={2} size="h5">
            Layout
          </Title>
          <Text size="xs" c="dimmed">
            Move variables by hand on the canvas, or let a layout place them all. Pinned variables stay where
            they are, and curves set by hand stay.
          </Text>
          <Radio.Group
            label="An automatic layout"
            value={kind}
            onChange={(value) => setKind(value as LayoutKind)}
          >
            <Stack gap={6} mt={6}>
              {KINDS.map((k) => (
                <Radio.Card key={k.value} value={k.value} radius="sm" p="xs">
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    <Radio.Indicator mt={2} />
                    <Stack gap={2}>
                      <Text size="sm" fw={500}>
                        {k.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {k.about}
                      </Text>
                    </Stack>
                  </Group>
                </Radio.Card>
              ))}
            </Stack>
          </Radio.Group>
          {choice.seeded && (
            <NumberInput
              label="Seed"
              description="The same map and seed always give the same layout; another seed, another arrangement."
              size="sm"
              value={seed}
              min={0}
              step={1}
              allowDecimal={false}
              allowNegative={false}
              onChange={setSeed}
            />
          )}
          {kind !== 'constellation' && halos > 0 && (
            <Text size="xs" c="yellow.7">
              This layout draws no group halos: the map's {plural(halos, 'halo')} will go.
            </Text>
          )}
          {kind === 'constellation' && (
            <Text size="xs" c="dimmed">
              Each category's halo and name are drawn again where its cluster lands.
            </Text>
          )}
          <Button onClick={lay} disabled={project.variables.length === 0 || !seedOk}>
            Lay out the map
          </Button>
          <Text size="xs" c="dimmed">
            {plural(project.variables.length - unplaced, 'variable')} placed
            {unplaced
              ? `, ${unplaced} not yet (drawn ${unplaced === project.variables.length ? 'as a constellation' : 'beside the placed ones'} until placed)`
              : ''}
            ; {pinned.length ? `${pinned.length} pinned` : 'none pinned'}.
          </Text>
          {pinned.length > 0 && (
            <Button
              size="xs"
              variant="default"
              w="fit-content"
              onClick={() => edit((p) => setPinned(p, pinned, false))}
            >
              Unpin all {pinned.length}
            </Button>
          )}
        </Stack>
      </div>
    </ScrollArea>
  );
}
