// How the map looks: its stage (the base theme), its palette and its fonts, with colour-vision checks of the
// palettes and of the map's own category colours. The checks are @loopweft/render's (DataViz's simulation):
// measured for this map and this stage, never claimed.
import {
  type Category,
  DEFAULT_PALETTE_ID,
  PALETTE_IDS,
  PALETTES,
  type PaletteId,
  plural,
  setTheme,
  type Theme,
} from '@loopweft/model';
import {
  type ColourCheck,
  checkCategories,
  checkPalette,
  DISTINCT_DELTA_E,
  MIN_CONTRAST,
  VISIONS,
  type Vision,
} from '@loopweft/render';
import {
  ColorSwatch,
  Group,
  List,
  Radio,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useMemo } from 'react';
import { useEdit, useStudio } from '../context.tsx';
import { CommitText } from './inputs.tsx';

const BASES: { value: Theme['base']; label: string }[] = [
  { value: 'cinematic-dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'high-contrast', label: 'High contrast' },
];

const VISION_NAME: Record<Vision, string> = {
  normal: 'typical colour vision',
  protanopia: 'protanopia (no red cones)',
  deuteranopia: 'deuteranopia (no green cones)',
  tritanopia: 'tritanopia (no blue cones)',
  greyscale: 'greyscale',
};

const VISION_SHORT: Record<Vision, string> = {
  normal: 'Typical',
  protanopia: 'Protan.',
  deuteranopia: 'Deutan.',
  tritanopia: 'Tritan.',
  greyscale: 'Grey',
};

/** What a check found, in short lines: which visions bring colours too close, greyscale, contrast. */
function verdicts(check: ColourCheck, noun: string): string[] {
  const close = check.visions.filter((v) => v.vision !== 'greyscale' && v.collisions.length);
  const grey = check.visions.find((v) => v.vision === 'greyscale')?.collisions.length ?? 0;
  return [
    close.length
      ? `Close together for ${close.map((v) => `${VISION_NAME[v.vision].split(' (')[0]} (${plural(v.collisions.length, 'pair')})`).join(', ')}`
      : 'Apart for typical vision and the three colour-vision deficiencies',
    grey ? `${plural(grey, 'pair')} close in greyscale` : 'Apart in greyscale',
    check.lowContrast.length
      ? `${plural(check.lowContrast.length, noun)} below ${MIN_CONTRAST}:1 on this stage`
      : 'All stand out from this stage',
  ];
}

function PaletteChoice({ id, base }: { id: PaletteId; base: Theme['base'] }) {
  const preset = PALETTES[id];
  const check = useMemo(() => checkPalette(id, base), [id, base]);
  const safe = check.colourblindSafe && check.greyscaleSafe && check.lowContrast.length === 0;
  return (
    <Radio.Card value={id} radius="sm" p="xs" className="lw-palette">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Radio.Indicator mt={2} />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500}>
            {preset.name}
          </Text>
          <Group gap={3}>
            {preset.colours.map((colour) => (
              <ColorSwatch key={colour} color={colour} size={14} radius={3} aria-hidden />
            ))}
          </Group>
          <Text size="xs" c="dimmed">
            {preset.source}
          </Text>
          <List size="xs" spacing={0} c={safe ? 'teal' : 'yellow.7'}>
            {verdicts(check, 'colour').map((line) => (
              <List.Item key={line}>{line}</List.Item>
            ))}
          </List>
        </Stack>
      </Group>
    </Radio.Card>
  );
}

/** The map's categories as each vision sees them, and the pairs that become hard to tell apart. */
function CategoryCheck() {
  const project = useStudio((s) => s.project);
  const check = useMemo(() => checkCategories(project), [project]);
  const categories = project.types.categories;
  if (categories.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        The map has no categories yet.
      </Text>
    );
  }
  const name = (id: string) => categories.find((c: Category) => c.id === id)?.name ?? id;
  // One line per vision, its closest pairs first, so a long list stays readable.
  const findings = [
    ...check.visions
      .filter((v) => v.collisions.length)
      .map((v) => {
        const pairs = [...v.collisions].sort((a, b) => a.deltaE - b.deltaE);
        const shown = pairs.slice(0, 4).map((p) => `"${name(p.a)}" and "${name(p.b)}" (ΔE ${p.deltaE})`);
        const more =
          pairs.length > shown.length ? `; and ${plural(pairs.length - shown.length, 'more pair')}` : '';
        return `Hard to tell apart in ${VISION_NAME[v.vision]}: ${shown.join('; ')}${more}.`;
      }),
    ...check.lowContrast.map(
      (low) =>
        `${name(low.key)} stands out too little from the stage (${low.ratio}:1, ${MIN_CONTRAST}:1 needed).`,
    ),
  ];
  return (
    <Stack gap="xs">
      <Table
        className="lw-vision-table"
        layout="fixed"
        withRowBorders={false}
        verticalSpacing={2}
        horizontalSpacing={4}
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Category</Table.Th>
            {VISIONS.map((v) => (
              <Table.Th key={v} title={VISION_NAME[v]} w={44}>
                {VISION_SHORT[v]}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {categories.map((c, i) => (
            <Table.Tr key={c.id}>
              <Table.Td>
                <Text size="xs" truncate>
                  {c.name}
                </Text>
              </Table.Td>
              {check.visions.map((v) => (
                <Table.Td key={v.vision}>
                  <ColorSwatch
                    color={v.colors[i]?.color ?? 'transparent'}
                    size={16}
                    radius={3}
                    aria-label={`${c.name} in ${VISION_NAME[v.vision]}`}
                  />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {findings.length ? (
        <List size="xs" spacing={2} c="yellow.7" aria-label="What the check found">
          {findings.map((line) => (
            <List.Item key={line}>{line}</List.Item>
          ))}
        </List>
      ) : (
        <Text size="xs" c="teal">
          No two categories are hard to tell apart in any of these, and each stands out from the stage.
        </Text>
      )}
    </Stack>
  );
}

function Fonts() {
  const project = useStudio((s) => s.project);
  const edit = useEdit();
  const fonts = project.theme.fonts ?? {};
  const set = (key: 'heading' | 'body', value: string | null) => {
    const next = { ...fonts, [key]: value ?? undefined };
    const kept = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    edit((p) => setTheme(p, { fonts: Object.keys(kept).length ? kept : null }));
  };
  return (
    <Stack gap="xs">
      <CommitText
        label="Headings"
        value={fonts.heading ?? ''}
        placeholder="Fraunces"
        onCommit={(value) => set('heading', value)}
      />
      <CommitText
        label="Text"
        value={fonts.body ?? ''}
        placeholder="Inter"
        onCommit={(value) => set('body', value)}
      />
      <Text size="xs" c="dimmed">
        A font family by name, used where the computer showing the map has it (otherwise a system font). Left
        empty: Fraunces for headings and Inter for text.
      </Text>
    </Stack>
  );
}

export function LookPanel() {
  const project = useStudio((s) => s.project);
  const edit = useEdit();
  const base = project.theme.base;
  const palette = project.theme.palette ?? DEFAULT_PALETTE_ID;
  return (
    <ScrollArea className="lw-inspector" type="auto" offsetScrollbars>
      <div className="lw-inspector-body">
        <Stack gap="md">
          <Title order={2} size="h5">
            Look
          </Title>
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Stage
            </Text>
            <SegmentedControl
              size="xs"
              fullWidth
              value={base}
              data={BASES}
              onChange={(value) => edit((p) => setTheme(p, { base: value as Theme['base'] }))}
              aria-label="Stage"
            />
          </Stack>
          <Radio.Group
            label="Palette"
            description="The colours categories take in order when they have none of their own, checked on this stage."
            value={palette}
            onChange={(value) => edit((p) => setTheme(p, { palette: value as PaletteId }))}
          >
            <Stack gap={6} mt={6}>
              {PALETTE_IDS.map((id) => (
                <PaletteChoice key={id} id={id} base={base} />
              ))}
            </Stack>
          </Radio.Group>
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              The map's categories, as people see them
            </Text>
            <CategoryCheck />
            <Text size="xs" c="dimmed">
              Simulated for the three complete colour-vision deficiencies (Machado, Oliveira and Fernandes
              2009) and in greyscale. Colours closer than ΔE {DISTINCT_DELTA_E} (CIEDE2000) are hard to tell
              apart; a mark needs {MIN_CONTRAST}:1 contrast with the stage (WCAG 2.1, non-text contrast).
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Fonts
            </Text>
            <Fonts />
          </Stack>
        </Stack>
      </div>
    </ScrollArea>
  );
}
