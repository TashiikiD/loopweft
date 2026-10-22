// The Studio's top bar: the map's title (click to rename), where it is saved, the five workspaces, and the
// File menu, Save and Undo / Redo.
import { setMeta } from '@loopweft/model';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  type MantineColorScheme,
  Menu,
  Tabs,
  Title,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronDown,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconFile,
  IconFolderOpen,
  IconMoon,
  IconRobot,
  IconSun,
} from '@tabler/icons-react';
import { openFile, saveFile, startMap } from '../actions.ts';
import { useEdit, useStudio, useStudioStore } from '../context.tsx';
import { EditableText } from '../editable-text.tsx';
import { isDirty, type WorkspaceId } from '../state/store.ts';

export const WORKSPACES = [
  { id: 'map', label: 'Map', ready: true, note: '' },
  { id: 'sources', label: 'Sources', ready: true, note: '' },
  { id: 'story', label: 'Story', ready: true, note: '' },
  { id: 'present', label: 'Present', ready: true, note: '' },
  { id: 'export', label: 'Export', ready: true, note: '' },
] as const;

function Mark() {
  return (
    <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#071B16" />
      <path d="M18 22L32 14L46 24L42 44L24 46Z" fill="none" stroke="#70E2C5" strokeWidth="3" opacity=".85" />
      <g fill="#70E2C5">
        <circle cx="18" cy="22" r="5" />
        <circle cx="32" cy="14" r="5" />
        <circle cx="46" cy="24" r="5" />
        <circle cx="42" cy="44" r="5" />
        <circle cx="24" cy="46" r="5" />
      </g>
    </svg>
  );
}

function MapTitle() {
  const title = useStudio((s) => s.project.meta.title);
  const edit = useEdit();
  return (
    <EditableText
      value={title}
      inputLabel="Map title"
      buttonLabel={`${title} (rename)`}
      onCommit={(next) => edit((p) => setMeta(p, { title: next }))}
      wrap={(button) => (
        <Title order={1} size="h4" miw={0} fw={600}>
          {button}
        </Title>
      )}
    />
  );
}

function SaveState() {
  const dirty = useStudio(isDirty);
  const file = useStudio((s) => s.file);
  const label = dirty
    ? file
      ? 'Unsaved changes'
      : 'Not saved yet'
    : file
      ? `Saved · ${file.name}`
      : 'Saved';
  return (
    <output aria-live="polite" aria-label={`Save status: ${label}`}>
      <Badge variant="light" color={dirty ? 'yellow' : 'gray'} radius="sm" style={{ textTransform: 'none' }}>
        {label}
      </Badge>
    </output>
  );
}

function UndoRedo() {
  const store = useStudioStore();
  const undo = useStudio((s) => s.past.at(-1)?.label);
  const redo = useStudio((s) => s.future.at(-1)?.label);
  return (
    <Group gap={2} wrap="nowrap">
      <Tooltip label={undo ? `Undo: ${undo} (Ctrl+Z)` : 'Nothing to undo'} multiline maw={320}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          disabled={!undo}
          onClick={() => store.getState().undo()}
          aria-label={undo ? `Undo: ${undo}` : 'Undo'}
        >
          <IconArrowBackUp size={18} aria-hidden />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={redo ? `Redo: ${redo} (Ctrl+Shift+Z)` : 'Nothing to redo'} multiline maw={320}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          disabled={!redo}
          onClick={() => store.getState().redo()}
          aria-label={redo ? `Redo: ${redo}` : 'Redo'}
        >
          <IconArrowForwardUp size={18} aria-hidden />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function FileMenu({ onNew, onImport }: { onNew?: () => void; onImport?: () => void }) {
  const store = useStudioStore();
  return (
    <Menu position="bottom-end" withinPortal shadow="md">
      <Menu.Target>
        <Button variant="default" size="compact-md" rightSection={<IconChevronDown size={14} aria-hidden />}>
          File
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconFile size={16} aria-hidden />} onClick={() => startMap(store, 'blank')}>
          New blank map
        </Menu.Item>
        {onNew && <Menu.Item onClick={onNew}>New from a template…</Menu.Item>}
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconFolderOpen size={16} aria-hidden />}
          onClick={() => void openFile(store)}
        >
          Open… (Ctrl+O)
        </Menu.Item>
        {onImport && <Menu.Item onClick={onImport}>Import a table, Kumu or DataViz file…</Menu.Item>}
        <Menu.Divider />
        <Menu.Item onClick={() => void saveFile(store)}>Save (Ctrl+S)</Menu.Item>
        <Menu.Item onClick={() => void saveFile(store, { as: true })}>Save as… (Ctrl+Shift+S)</Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconRobot size={16} aria-hidden />}
          onClick={() => store.getState().setAgentHelp(true)}
        >
          Work with an AI agent…
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

const SCHEMES: { value: MantineColorScheme; label: string; Icon: typeof IconSun }[] = [
  { value: 'light', label: 'Light', Icon: IconSun },
  { value: 'dark', label: 'Dark', Icon: IconMoon },
  { value: 'auto', label: 'Same as the system', Icon: IconDeviceDesktop },
];

/** The Studio's own light or dark look (the map keeps its theme). */
function SchemeMenu() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const current = SCHEMES.find((c) => c.value === colorScheme) ?? (SCHEMES[2] as (typeof SCHEMES)[number]);
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" size="lg" aria-label={`Studio colours: ${current.label}`}>
          <current.Icon size={18} aria-hidden />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {SCHEMES.map(({ value, label, Icon }) => (
          <Menu.Item
            key={value}
            leftSection={<Icon size={16} aria-hidden />}
            onClick={() => setColorScheme(value)}
            aria-checked={value === colorScheme}
            role="menuitemradio"
          >
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

export function Header({ onNew, onImport }: { onNew?: () => void; onImport?: () => void }) {
  const store = useStudioStore();
  const workspace = useStudio((s) => s.workspace);
  return (
    <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="md">
      <Group gap="sm" wrap="nowrap" miw={0}>
        <Mark />
        <MapTitle />
        <SaveState />
      </Group>
      <Tabs
        value={workspace}
        onChange={(next) => next && store.getState().showWorkspace(next as WorkspaceId)}
        variant="pills"
        radius="sm"
        aria-label="Workspaces"
      >
        <Tabs.List>
          {WORKSPACES.map((w) =>
            w.ready ? (
              <Tabs.Tab key={w.id} value={w.id}>
                {w.label}
              </Tabs.Tab>
            ) : (
              <Tooltip key={w.id} label={w.note}>
                <Tabs.Tab value={w.id} disabled>
                  {w.label}
                </Tabs.Tab>
              </Tooltip>
            ),
          )}
        </Tabs.List>
      </Tabs>
      <Group gap="xs" wrap="nowrap">
        <FileMenu {...(onNew ? { onNew } : {})} {...(onImport ? { onImport } : {})} />
        <Button
          variant="filled"
          size="compact-md"
          leftSection={<IconDeviceFloppy size={16} aria-hidden />}
          onClick={() => void saveFile(store)}
        >
          Save
        </Button>
        <UndoRedo />
        <SchemeMenu />
      </Group>
    </Group>
  );
}
