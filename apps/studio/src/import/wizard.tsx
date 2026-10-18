// The import wizard: a table file (CSV, TSV, Excel), a Kumu map or a DataViz project becomes a new map, made
// by the importers `loopweft import` runs. Three steps: the file; where its columns go (tables) or where its
// signs are (Kumu); and a check of what comes across, with every note the importer makes, before the map
// opens. Nothing leaves the computer.
import {
  type Field,
  IMPORT_FORMATS,
  type ImportFormat,
  type ImportSource,
  MAX_IMPORT_BYTES,
  plural,
  readImportFile,
  type Shape,
  TEXT_ENCODINGS,
  type TextEncodingName,
  tableLabel,
  titleFromName,
} from '@loopweft/model';
import {
  Alert,
  Button,
  Group,
  List,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Stepper,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { type DragEvent, useEffect, useMemo, useState } from 'react';
import { mayDiscard } from '../actions.ts';
import { useStudioStore } from '../context.tsx';
import { MapThumbnail } from '../map/thumbnail.tsx';
import { chooseFile, today } from '../state/files.ts';
import {
  type Checked,
  choiceProblems,
  describeSource,
  FIELD_KEYS,
  FIELD_NAMES,
  hasOwnTitle,
  initialChoices,
  KIND_NAMES,
  kumuConnectionFields,
  type Placement,
  runImport,
  samples,
  type TableChoice,
  withHeaderRow,
  withShape,
  withTarget,
} from './plan.ts';

export const IMPORT_ACCEPT = '.csv,.tsv,.txt,.xlsx,.json';

const FORMAT_NAMES: Record<ImportFormat, string> = {
  tables: 'Tables (CSV, TSV, Excel)',
  kumu: 'A Kumu map',
  dataviz: 'A DataViz project',
};

const PLACEMENTS: { value: Placement; label: string }[] = [
  { value: 'force', label: 'Force' },
  { value: 'constellation', label: 'Constellation' },
  { value: 'flow', label: 'Flow' },
  { value: 'none', label: 'Leave unplaced' },
];

/** Where a column goes, as the select shows it. */
const targetValue = (choice: TableChoice, column: string): string => {
  const target = choice.mapping[column];
  if (!target || target.kind === 'ignore') return 'ignore';
  return target.kind === 'field' ? `field:${target.key}` : 'custom';
};

function TableColumns({
  choice,
  onShape,
  onHeaderRow,
  onTarget,
}: {
  choice: TableChoice;
  onShape(shape: Shape | 'ignore'): void;
  onHeaderRow(row: number): void;
  onTarget(column: string, target: Parameters<typeof withTarget>[3]): void;
}) {
  const shape = choice.shape;
  const options =
    shape === 'ignore'
      ? []
      : [
          {
            group: "Loopweft's fields",
            items: FIELD_KEYS[shape].map((key) => ({
              value: `field:${key}`,
              label: FIELD_NAMES[shape][key] ?? key,
            })),
          },
          {
            group: 'Other',
            items: [
              { value: 'custom', label: 'A custom field' },
              { value: 'ignore', label: 'Leave out' },
            ],
          },
        ];
  return (
    <Paper withBorder p="sm" radius="sm">
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Text fw={600} size="sm">
            {tableLabel(choice.table)}
            <Text span size="xs" c="dimmed" ml={8}>
              {plural(choice.table.rows.length, 'row')}
            </Text>
          </Text>
          <Group gap="sm" wrap="nowrap">
            <SegmentedControl
              size="xs"
              value={shape}
              onChange={(value) => onShape(value as Shape | 'ignore')}
              data={[
                { value: 'variables', label: 'Variables' },
                { value: 'links', label: 'Links' },
                { value: 'ignore', label: 'Leave out' },
              ]}
              aria-label={`What ${tableLabel(choice.table)} holds`}
            />
            {choice.table.headerRow !== undefined && (
              <NumberInput
                size="xs"
                w={130}
                label="Header row"
                description="0: none"
                min={0}
                allowDecimal={false}
                allowNegative={false}
                value={choice.table.headerRow}
                onChange={(value) => typeof value === 'number' && onHeaderRow(value)}
              />
            )}
          </Group>
        </Group>
        {shape !== 'ignore' && (
          <Table withRowBorders verticalSpacing={4} horizontalSpacing={6} className="lw-import-columns">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Column</Table.Th>
                <Table.Th>Examples</Table.Th>
                <Table.Th w={260}>Goes to</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {choice.table.columns.map((column) => {
                const target = choice.mapping[column];
                return (
                  <Table.Tr key={column}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {column}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {samples(choice.table, column).join(' · ') || 'empty'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Select
                          size="xs"
                          style={{ flex: 1 }}
                          aria-label={`Where "${column}" goes`}
                          value={targetValue(choice, column)}
                          data={options}
                          allowDeselect={false}
                          onChange={(value) => {
                            if (!value) return;
                            if (value === 'ignore') onTarget(column, { kind: 'ignore' });
                            else if (value === 'custom') onTarget(column, { kind: 'custom' });
                            else onTarget(column, { kind: 'field', key: value.slice(6) });
                          }}
                          comboboxProps={{ withinPortal: true }}
                        />
                        {target?.kind === 'custom' && (
                          <Select
                            size="xs"
                            w={118}
                            aria-label={`The kind of "${column}"`}
                            value={target.type}
                            data={Object.entries(KIND_NAMES).map(([value, label]) => ({ value, label }))}
                            allowDeselect={false}
                            onChange={(value) =>
                              value && onTarget(column, { kind: 'custom', type: value as Field['kind'] })
                            }
                            comboboxProps={{ withinPortal: true }}
                          />
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}

/** The check: what the import gives, and what it says it could not carry. */
function CheckStep({ checked }: { checked: Checked }) {
  if (!checked.ok) {
    return (
      <Alert color="red" title="The import stopped" role="alert">
        <List size="sm" spacing={2}>
          {checked.problems.slice(0, 30).map((p) => (
            <List.Item key={p}>{p}</List.Item>
          ))}
        </List>
        {checked.problems.length > 30 && <Text size="sm">…and {checked.problems.length - 30} more.</Text>}
      </Alert>
    );
  }
  const { project } = checked;
  return (
    <Group align="flex-start" gap="md" wrap="nowrap">
      <MapThumbnail project={project} label="A picture of the imported map" width={260} height={146} />
      <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={600} role="status">
          {plural(project.variables.length, 'variable')}, {plural(project.links.length, 'link')},{' '}
          {plural(project.types.categories.length, 'category', 'categories')} and{' '}
          {plural(project.types.fields.length, 'custom field')}.
        </Text>
        <Text size="xs" fw={600}>
          What the import says
        </Text>
        <List size="xs" spacing={2} aria-label="What the import says">
          {checked.notes.map((note) => (
            <List.Item key={note}>{note}</List.Item>
          ))}
        </List>
      </Stack>
    </Group>
  );
}

function Wizard({ initial, onDone }: { initial: File | null; onDone(): void }) {
  const store = useStudioStore();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array; size: number } | null>(null);
  const [format, setFormat] = useState<ImportFormat | 'auto'>('auto');
  const [encoding, setEncoding] = useState<TextEncodingName | 'auto'>('auto');
  const [source, setSource] = useState<ImportSource | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [choices, setChoices] = useState<TableChoice[]>([]);
  const [signField, setSignField] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [placement, setPlacement] = useState<Placement>('force');
  const [seed, setSeed] = useState<number | string>(1337);

  const read = async (
    picked: { name: string; bytes: Uint8Array; size: number },
    as: ImportFormat | 'auto',
    enc: TextEncodingName | 'auto',
  ) => {
    setFile(picked);
    setSource(null);
    setStep(0);
    if (picked.size > MAX_IMPORT_BYTES) {
      setReadError(
        `${picked.name} is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB, the most an import reads.`,
      );
      return;
    }
    try {
      const next = await readImportFile(
        { name: picked.name, bytes: picked.bytes },
        { ...(as !== 'auto' ? { format: as } : {}), ...(enc !== 'auto' ? { encoding: enc } : {}) },
      );
      setSource(next);
      setReadError(null);
      setChoices(next.format === 'tables' ? initialChoices(next) : []);
      setSignField(null);
      setTitle(hasOwnTitle(next) ? '' : titleFromName(picked.name));
    } catch (error) {
      setReadError((error as Error).message);
    }
  };

  const load = async (picked: File) => {
    const bytes = new Uint8Array(await picked.arrayBuffer());
    await read({ name: picked.name, bytes, size: picked.size }, format, encoding);
  };

  // A file dropped on the Studio opens the wizard with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once, the file the wizard opened with
  useEffect(() => {
    if (initial) void load(initial);
  }, [initial]);

  const problems = useMemo(
    () => (source?.format === 'tables' ? choiceProblems(choices) : []),
    [source, choices],
  );
  const seedOk = placement === 'none' || placement === 'flow' || (typeof seed === 'number' && seed >= 0);
  const checked = useMemo(
    () =>
      step === 2 && source && seedOk
        ? runImport(source, {
            choices,
            signField,
            title,
            placement,
            ...(typeof seed === 'number' && placement !== 'flow' ? { seed } : {}),
          })
        : null,
    [step, source, choices, signField, title, placement, seed, seedOk],
  );

  const open = () => {
    if (!checked?.ok || !mayDiscard(store)) return;
    const project = { ...checked.project, meta: { ...checked.project.meta, created: today() } };
    store.getState().open(project, null, { saved: false, fresh: true });
    notifications.show({
      title: `Imported ${file?.name ?? 'the file'}`,
      message: `${plural(project.variables.length, 'variable')} and ${plural(project.links.length, 'link')}. Save the map to keep it.`,
      autoClose: 6000,
    });
    onDone();
  };

  const middle =
    source?.format === 'tables' ? 'Columns' : source?.format === 'kumu' ? 'Signs' : 'Nothing to choose';
  const drop = (event: DragEvent<HTMLDivElement>) => {
    const picked = event.dataTransfer.files[0];
    if (!picked) return;
    event.preventDefault();
    event.stopPropagation();
    void load(picked);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a file can be dropped here; the button chooses one too
    <div onDragOver={(e) => e.preventDefault()} onDrop={drop}>
      <Stepper
        active={step}
        onStepClick={(s) => s < step && setStep(s)}
        size="sm"
        allowNextStepsSelect={false}
      >
        <Stepper.Step label="File">
          <Stack gap="sm" mt="sm">
            <Text size="sm">
              Make a new map from a table of links (CSV, TSV or Excel, with a table of variables if you have
              one), a Kumu map (its JSON export, a JSON blueprint or its spreadsheet) or a DataViz project.
              Nothing leaves this computer.
            </Text>
            <Group gap="sm">
              <Button
                onClick={() =>
                  void chooseFile(IMPORT_ACCEPT).then((picked) => {
                    if (picked) void load(picked);
                  })
                }
              >
                Choose a file…
              </Button>
              <Text size="xs" c="dimmed">
                or drop one here
              </Text>
            </Group>
            {file && source && (
              <Paper withBorder p="sm" radius="sm">
                <Text size="sm" fw={600}>
                  {file.name}
                </Text>
                <Text size="sm" role="status">
                  {describeSource(source)}
                </Text>
              </Paper>
            )}
            {readError && (
              <Alert color="red" title="The file could not be read" role="alert">
                {readError}
              </Alert>
            )}
            <Group gap="sm" grow>
              <Select
                size="xs"
                label="Read it as"
                value={format}
                data={[
                  { value: 'auto', label: 'Found from the file' },
                  ...IMPORT_FORMATS.map((f) => ({ value: f, label: FORMAT_NAMES[f] })),
                ]}
                allowDeselect={false}
                onChange={(value) => {
                  const next = (value ?? 'auto') as ImportFormat | 'auto';
                  setFormat(next);
                  if (file) void read(file, next, encoding);
                }}
                comboboxProps={{ withinPortal: true }}
              />
              <Select
                size="xs"
                label="Text encoding"
                value={encoding}
                data={[
                  { value: 'auto', label: 'Found from the file' },
                  ...TEXT_ENCODINGS.map((e) => ({ value: e, label: e })),
                ]}
                allowDeselect={false}
                onChange={(value) => {
                  const next = (value ?? 'auto') as TextEncodingName | 'auto';
                  setEncoding(next);
                  if (file) void read(file, format, next);
                }}
                comboboxProps={{ withinPortal: true }}
              />
            </Group>
          </Stack>
        </Stepper.Step>
        <Stepper.Step label={middle}>
          <Stack gap="sm" mt="sm">
            {source?.format === 'tables' && (
              <>
                <Text size="sm">
                  Each column goes to one of Loopweft's fields, or is kept as a custom field so nothing is
                  lost. Check what was guessed.
                </Text>
                {choices.map((choice, index) => (
                  <TableColumns
                    key={choice.table.sheet ?? choice.table.name}
                    choice={choice}
                    onShape={(shape) => setChoices((c) => withShape(c, index, shape))}
                    onHeaderRow={(row) => setChoices((c) => withHeaderRow(source, c, index, row))}
                    onTarget={(column, target) => setChoices((c) => withTarget(c, index, column, target))}
                  />
                ))}
                {problems.length > 0 && (
                  <Alert color="yellow" title="Before going on" role="alert">
                    <List size="sm" spacing={2}>
                      {problems.map((p) => (
                        <List.Item key={p}>{p}</List.Item>
                      ))}
                    </List>
                  </Alert>
                )}
              </>
            )}
            {source?.format === 'kumu' && (
              <Stack gap="xs">
                <Text size="sm">
                  Kumu links have no sign. Choose the connection field that holds the signs (+, − or ?), or
                  let the importer look for one: a field named sign or polarity, else a connection type that
                  reads as signs. Without one, every link is recorded as unknown (?) and flagged.
                </Text>
                <Select
                  size="sm"
                  label="Signs come from"
                  value={signField ?? ''}
                  data={[{ value: '', label: 'Found by the importer' }, ...kumuConnectionFields(source.data)]}
                  allowDeselect={false}
                  onChange={(value) => setSignField(value ? value : null)}
                  comboboxProps={{ withinPortal: true }}
                />
              </Stack>
            )}
          </Stack>
        </Stepper.Step>
        <Stepper.Step label="Check and open">
          <Stack gap="sm" mt="sm">
            <Group gap="sm" align="flex-end" wrap="wrap">
              <TextInput
                size="sm"
                style={{ flex: 1, minWidth: 220 }}
                label="Title"
                placeholder={source && hasOwnTitle(source) ? "The project's own title" : 'Untitled map'}
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
              />
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Variables without a place
                </Text>
                <SegmentedControl
                  size="xs"
                  value={placement}
                  onChange={(value) => setPlacement(value as Placement)}
                  data={PLACEMENTS}
                  aria-label="Lay out variables without a place"
                />
              </Stack>
              {(placement === 'force' || placement === 'constellation') && (
                <NumberInput
                  size="sm"
                  w={110}
                  label="Seed"
                  min={0}
                  allowDecimal={false}
                  allowNegative={false}
                  value={seed}
                  onChange={setSeed}
                />
              )}
            </Group>
            {checked && <CheckStep checked={checked} />}
          </Stack>
        </Stepper.Step>
      </Stepper>
      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          onClick={() => setStep((s) => (s === 2 && source?.format === 'dataviz' ? 0 : s - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        {step < 2 ? (
          <Button
            onClick={() => setStep((s) => (s === 0 && source?.format === 'dataviz' ? 2 : s + 1))}
            disabled={!source || (step === 1 && problems.length > 0)}
          >
            Next
          </Button>
        ) : (
          <Button onClick={open} disabled={!checked?.ok}>
            Open the imported map
          </Button>
        )}
      </Group>
    </div>
  );
}

export function ImportWizard({
  opened,
  onClose,
  file = null,
}: {
  opened: boolean;
  onClose(): void;
  /** A file dropped on the Studio, to start with. */
  file?: File | null;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="Import a map" size="64rem">
      {opened && <Wizard initial={file} onDone={onClose} />}
    </Modal>
  );
}
