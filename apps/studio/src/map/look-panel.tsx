// How the map looks: its stage (the base theme), its palette and its fonts, with colour-vision checks of the
// palettes and of the map's own category colours. The checks are @loopweft/render's (DataViz's simulation):
// measured for this map and this stage, never claimed. A palette is one of Loopweft's presets or one the
// map holds itself, made from another and then renamed and recoloured here.
import {
  addPalette,
  type Category,
  DEFAULT_PALETTE_ID,
  normalizeToken,
  type Palette,
  type PaletteChanges,
  paletteOf,
  plural,
  removePalette,
  setPalette,
  setTheme,
  type Theme,
  type ThemePalette,
  themePalettes,
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
  ActionIcon,
  Button,
  ColorInput,
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
import { IconArrowDown, IconArrowUp, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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

const COLOUR = /^#[0-9a-fA-F]{6}$/;

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

function PaletteChoice({ palette, base }: { palette: ThemePalette; base: Theme['base'] }) {
  const check = useMemo(() => checkPalette(palette.colours, base), [palette.colours, base]);
  const safe = check.colourblindSafe && check.greyscaleSafe && check.lowContrast.length === 0;
  return (
    <Radio.Card value={palette.id} radius="sm" p="xs" className="lw-palette">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Radio.Indicator mt={2} />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500}>
            {palette.name}
          </Text>
          <Group gap={3}>
            {palette.colours.map((colour, i) => (
              // A palette may repeat a colour, so its place keys it.
              // biome-ignore lint/suspicious/noArrayIndexKey: the place is what tells the swatches apart
              <ColorSwatch key={i} color={colour} size={14} radius={3} aria-hidden />
            ))}
          </Group>
          {palette.about && (
            <Text size="xs" c="dimmed">
              {palette.about}
            </Text>
          )}
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

/** One colour of the map's own palette: picked or typed (#rrggbb), moved, or taken out. */
function PaletteColour({
  value,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  value: string;
  index: number;
  count: number;
  onChange(colour: string): void;
  onMove(by: number): void;
  onRemove(): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const input = useRef<HTMLInputElement>(null);
  const commit = (next: string) => {
    const colour = next.trim();
    if (!COLOUR.test(colour)) {
      setDraft(value);
      return;
    }
    if (colour.toLowerCase() !== value.toLowerCase()) onChange(colour.toUpperCase());
  };
  const place = `colour ${index + 1}`;
  return (
    <Group gap={2} wrap="nowrap">
      <ColorInput
        ref={input}
        size="xs"
        format="hex"
        value={draft}
        aria-label={`Colour ${index + 1}`}
        style={{ flex: 1 }}
        onChange={setDraft}
        // A colour picked counts at once; one being typed, when the field is left.
        onChangeEnd={(next) => {
          if (document.activeElement !== input.current) commit(next);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(draft);
        }}
        popoverProps={{ withinPortal: true }}
      />
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label={`Move ${place} up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <IconArrowUp size={14} aria-hidden />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label={`Move ${place} down`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <IconArrowDown size={14} aria-hidden />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="gray"
        aria-label={`Take out ${place}`}
        disabled={count <= 2}
        onClick={onRemove}
      >
        <IconX size={14} aria-hidden />
      </ActionIcon>
    </Group>
  );
}

/** The chosen palette, when the map holds it: its name, its colours in order, and what it says of them. */
function OwnPalette({ palette }: { palette: Palette }) {
  const edit = useEdit();
  const [adding, setAdding] = useState('');
  const set = (changes: PaletteChanges) => edit((p) => setPalette(p, palette.id, changes));
  const colours = palette.colours;
  const moved = (index: number, by: number) => {
    const next = [...colours];
    const [colour] = next.splice(index, 1);
    next.splice(index + by, 0, colour as string);
    return next;
  };
  const add = () => {
    if (!COLOUR.test(adding.trim())) return;
    set({ colours: [...colours, adding.trim().toUpperCase()] });
    setAdding('');
  };
  const remove = () => {
    if (
      !window.confirm(
        `Remove the palette "${palette.name}" from this map? The map goes back to the Loopweft palette.`,
      )
    )
      return;
    edit((p) => {
      const back = setTheme(p, { palette: null });
      const out = removePalette(back.project, palette.id);
      return { ...out, summary: `${out.summary} The map uses the Loopweft palette again.` };
    }, 'Remove palette');
  };
  return (
    <Stack gap="xs" className="lw-own-palette" aria-label={`The palette ${palette.name}`}>
      <CommitText label="Name" value={palette.name} required onCommit={(name) => name && set({ name })} />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Colours
        </Text>
        <Text size="xs" c="dimmed">
          Categories take them in this order, from the first again after the last.
        </Text>
        {colours.map((colour, index) => (
          <PaletteColour
            // biome-ignore lint/suspicious/noArrayIndexKey: a colour is known by its place in the palette
            key={index}
            value={colour}
            index={index}
            count={colours.length}
            onChange={(next) => set({ colours: colours.map((c, i) => (i === index ? next : c)) })}
            onMove={(by) => set({ colours: moved(index, by) })}
            onRemove={() => set({ colours: colours.filter((_, i) => i !== index) })}
          />
        ))}
        <Group gap={4} wrap="nowrap" align="flex-end">
          <ColorInput
            size="xs"
            format="hex"
            value={adding}
            placeholder="#rrggbb"
            aria-label="A colour to add"
            style={{ flex: 1 }}
            onChange={setAdding}
            onKeyDown={(event) => {
              if (event.key === 'Enter') add();
            }}
            popoverProps={{ withinPortal: true }}
          />
          <Button size="xs" variant="default" disabled={!COLOUR.test(adding.trim())} onClick={add}>
            Add colour
          </Button>
        </Group>
      </Stack>
      <CommitText
        label="Colours as text"
        multiline
        value={colours.join(' ')}
        description="Paste #rrggbb colours, separated by spaces, commas or lines, to replace them all; copy them to use this palette in another map."
        onCommit={(text) =>
          set({
            colours: (text ?? '')
              .split(/[\s,;]+/)
              .filter(Boolean)
              .map((c) => c.toUpperCase()),
          })
        }
      />
      <CommitText
        label="About"
        value={palette.description ?? ''}
        placeholder="Where the colours come from"
        onCommit={(text) => set({ description: text })}
      />
      <Button size="xs" variant="subtle" color="red" w="fit-content" onClick={remove}>
        Remove this palette
      </Button>
    </Stack>
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

/** A name for a copy of a palette that no palette of the theme has yet: "Name (copy)", then "(copy 2)"… */
function copyName(theme: Theme, name: string): string {
  const taken = new Set(themePalettes(theme).map((p) => normalizeToken(p.name)));
  let copy = `${name} (copy)`;
  for (let n = 2; taken.has(normalizeToken(copy)); n++) copy = `${name} (copy ${n})`;
  return copy;
}

export function LookPanel() {
  const project = useStudio((s) => s.project);
  const edit = useEdit();
  const base = project.theme.base;
  const chosen = project.theme.palette ?? DEFAULT_PALETTE_ID;
  const palettes = themePalettes(project.theme);
  const own = project.theme.palettes ?? [];
  const ownChosen = own.find((p) => p.id === chosen);
  const copy = () => {
    const from = paletteOf(project.theme);
    edit((p) => {
      const added = addPalette(p, { name: copyName(p.theme, from.name), colours: [...from.colours] });
      const used = setTheme(added.project, { palette: added.result.id });
      return { ...used, result: added.result, summary: `${added.summary} The map uses it.` };
    }, 'New palette');
  };
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
            value={chosen}
            onChange={(value) => edit((p) => setTheme(p, { palette: value }))}
          >
            <Stack gap={6} mt={6}>
              {palettes
                .filter((p) => !p.own)
                .map((p) => (
                  <PaletteChoice key={p.id} palette={p} base={base} />
                ))}
              {own.length > 0 && (
                <Text size="xs" fw={600} c="dimmed" mt={4}>
                  This map's own
                </Text>
              )}
              {palettes
                .filter((p) => p.own)
                .map((p) => (
                  <PaletteChoice key={p.id} palette={p} base={base} />
                ))}
            </Stack>
          </Radio.Group>
          <Stack gap={4}>
            <Button size="xs" variant="default" w="fit-content" onClick={copy}>
              New palette from this one
            </Button>
            <Text size="xs" c="dimmed">
              A copy of the chosen palette, held by this map, to rename and recolour.
            </Text>
          </Stack>
          {ownChosen && <OwnPalette palette={ownChosen} />}
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
