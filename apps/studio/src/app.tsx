// The Loopweft Studio: one window with five workspaces (Map, Sources, Story, Present and Export). It holds
// one map at a time, saved to a .loopweft file; while it has unsaved changes a copy is kept in the browser,
// so a crash or a closed tab loses nothing.
import { createProject, type Project, serializeProject } from '@loopweft/model';
import { AppShell, Button, Group, Text } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { exampleProject, mayDiscard, openFile, openText, saveFile } from './actions.ts';
import { StudioContext, useStudio, useStudioStore } from './context.tsx';
import { ExportWorkspace } from './export/workspace.tsx';
import { ImportWizard } from './import/wizard.tsx';
import { MapWorkspace } from './map/workspace.tsx';
import { PresentWorkspace } from './present/workspace.tsx';
import { Providers } from './providers.tsx';
import { TemplateGallery } from './shell/gallery.tsx';
import { Header } from './shell/header.tsx';
import { StatusBar } from './shell/status-bar.tsx';
import { crossrefLookup, type Lookup, LookupContext } from './sources/lookup.tsx';
import { SourcesWorkspace } from './sources/workspace.tsx';
import { browserRecovery, type RecoveryCopy, type RecoveryStore, watchRecovery } from './state/recovery.ts';
import { createStudioStore, hasUnsavedWork, type StudioStore } from './state/store.ts';
import { StoryWorkspace } from './story/workspace.tsx';

export interface AppProps {
  /** The map to start with (tests); default: an untitled blank map, or the example with ?example. */
  store?: StudioStore;
  recovery?: RecoveryStore;
  /** `test`: Mantine without transitions or portals (component tests in jsdom). */
  env?: 'default' | 'test';
  /** The DOI lookup (tests give one that answers from recorded replies); default: Crossref's, then DataCite's. */
  lookup?: Lookup;
}

/** The workspace shown: Map, Sources, Story, Present or Export. */
function Workspace() {
  const workspace = useStudio((s) => s.workspace);
  if (workspace === 'sources') return <SourcesWorkspace />;
  if (workspace === 'story') return <StoryWorkspace />;
  if (workspace === 'present') return <PresentWorkspace />;
  if (workspace === 'export') return <ExportWorkspace />;
  return <MapWorkspace />;
}

/** The map the Studio opens with: the polycrisis example with ?example in the address, else a blank one. */
function startStore(): StudioStore {
  const example = typeof location !== 'undefined' && new URLSearchParams(location.search).has('example');
  const start: Project = example ? exampleProject() : createProject({ title: 'Untitled map' });
  return createStudioStore(start, null, false, true);
}

/** Offers back a map that had unsaved changes when the Studio last closed. */
function RecoveryOffer({ copy, onDone }: { copy: RecoveryCopy; onDone(): void }) {
  const store = useStudioStore();
  const title = /"title":\s*"([^"]*)"/.exec(copy.text)?.[1] ?? 'A map';
  return (
    <div className="lw-recovery" role="alert">
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Text size="sm">
          <b>{title}</b> had unsaved changes when the Studio last closed
          {copy.name ? ` (from ${copy.name})` : ''}.
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="compact-sm"
            onClick={() => {
              if (openText(store, copy.text, { name: copy.name ?? 'Recovered map' }, { saved: false }))
                onDone();
            }}
          >
            Bring it back
          </Button>
          <Button size="compact-sm" variant="default" onClick={onDone}>
            Discard
          </Button>
        </Group>
      </Group>
    </div>
  );
}

export function App({ store: given, recovery: givenRecovery, env = 'default', lookup }: AppProps) {
  const [store] = useState(() => given ?? startStore());
  const [recovery] = useState(() => givenRecovery ?? browserRecovery());
  const [offer, setOffer] = useState<RecoveryCopy | null>(null);
  const [dialog, setDialog] = useState<'new' | 'import' | null>(null);
  // A table, Kumu or DataViz file dropped on the window: the import wizard starts with it.
  const [dropped, setDropped] = useState<File | null>(null);

  // A copy that survived the last session is offered back, once; then the copy follows this session.
  useEffect(() => {
    let stop = () => {};
    let live = true;
    void recovery.read().then((copy) => {
      if (!live) return;
      if (copy && copy.text !== serializeProject(store.getState().project)) setOffer(copy);
      stop = watchRecovery(store, recovery);
    });
    return () => {
      live = false;
      stop();
    };
  }, [store, recovery]);

  // Closing the tab with unsaved changes asks first.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedWork(store.getState())) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [store]);

  // A .loopweft file dropped on the window opens; a file to import opens the import wizard with it.
  useEffect(() => {
    const over = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      if (/\.(csv|tsv|txt|xlsx|json)$/i.test(file.name)) {
        event.preventDefault();
        setDropped(file);
        setDialog('import');
        return;
      }
      if (!/\.loopweft$/i.test(file.name)) return;
      event.preventDefault();
      if (!mayDiscard(store)) return;
      void file.text().then((text) => openText(store, text, { name: file.name }));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [store]);

  return (
    <Providers env={env}>
      <StudioContext.Provider value={store}>
        <LookupContext.Provider value={lookup ?? crossrefLookup}>
          <Shortcuts store={store} />
          <AppShell header={{ height: 56 }} padding={0}>
            <AppShell.Header>
              <Header
                onNew={() => setDialog('new')}
                onImport={() => {
                  setDropped(null);
                  setDialog('import');
                }}
              />
            </AppShell.Header>
            <AppShell.Main className="lw-main">
              {offer && <RecoveryOffer copy={offer} onDone={() => setOffer(null)} />}
              <Workspace />
              <StatusBar />
            </AppShell.Main>
          </AppShell>
          <TemplateGallery opened={dialog === 'new'} onClose={() => setDialog(null)} />
          <ImportWizard opened={dialog === 'import'} file={dropped} onClose={() => setDialog(null)} />
        </LookupContext.Provider>
      </StudioContext.Provider>
    </Providers>
  );
}

function Shortcuts({ store }: { store: StudioStore }) {
  const say = (label: string | null, verb: string) => {
    if (label) notifications.show({ message: `${verb}: ${label}`, autoClose: 2500 });
  };
  useHotkeys([
    ['mod+Z', () => say(store.getState().undo(), 'Undone')],
    ['mod+shift+Z', () => say(store.getState().redo(), 'Redone')],
    ['mod+Y', () => say(store.getState().redo(), 'Redone')],
    ['mod+S', () => void saveFile(store)],
    ['mod+shift+S', () => void saveFile(store, { as: true })],
    ['mod+O', () => void openFile(store)],
    ['Escape', () => store.getState().select({ variables: [], links: [], loop: null })],
  ]);
  return null;
}
