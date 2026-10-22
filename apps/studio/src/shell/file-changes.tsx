// What the person sees of live reload (state/watch.ts): a short note when the open map updates from its file,
// and, when the file changes while the map has unsaved changes, a bar asking which version to keep.
import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import { type WatchEvent, watchFile } from '../state/watch.ts';

const INVALID = 'lw-file-invalid';

function tell(event: WatchEvent) {
  switch (event.kind) {
    case 'reloaded':
      notifications.show({
        title: 'Updated from the file',
        message: `${event.name}: ${event.what}. Undo (Ctrl+Z) goes back.`,
        autoClose: 6000,
      });
      return;
    case 'held':
      notifications.show({
        title: 'The file changed',
        message: `${event.name} changed during the presentation. It loads when the presentation ends.`,
        autoClose: 8000,
      });
      return;
    case 'invalid':
      notifications.show({
        id: INVALID,
        color: 'yellow',
        title: 'The file cannot be read now',
        message: `${event.message}\nThe Studio keeps the last version that read, and loads the file again once it reads.`,
        autoClose: false,
      });
      return;
    case 'valid':
      notifications.hide(INVALID);
      return;
    case 'lost':
      notifications.show({
        color: 'yellow',
        title: 'The file cannot be found',
        message: `${event.name} was moved, renamed or removed, or the browser no longer lets the Studio read it. The map stays open here; Save as… writes it to a file again.`,
        autoClose: false,
      });
      return;
    case 'conflict':
      // The bar says it (FileChangedBar).
      return;
  }
}

/** Follows the open map's file while the Studio runs. */
export function useFileWatch(): void {
  const store = useStudioStore();
  useEffect(() => watchFile(store, { onEvent: tell }), [store]);
}

/** The file changed on disk while the map has unsaved changes: the person chooses which version to keep. */
export function FileChangedBar() {
  const store = useStudioStore();
  const conflict = useStudio((s) => s.conflict);
  const name = useStudio((s) => s.file?.name ?? 'The file');
  if (!conflict) return null;
  return (
    <div className="lw-recovery" role="alert">
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Text size="sm">
          <b>{name}</b> changed on disk ({conflict.what}), and this map has unsaved changes. Using the file's
          version keeps yours one step back in Undo (Ctrl+Z); keeping yours, Save asks before it replaces the
          file.
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="compact-sm"
            onClick={() => store.getState().reload(conflict.project, 'Changes from the file')}
          >
            Use the file's version
          </Button>
          <Button size="compact-sm" variant="default" onClick={() => store.getState().keepMine()}>
            Keep mine
          </Button>
        </Group>
      </Group>
    </div>
  );
}
