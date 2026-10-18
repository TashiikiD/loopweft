// The references library: every source, in the order of the reference list (supplements under their work),
// with how often each is cited; and the chosen source, to read and change, with everything that cites it.
import {
  evidenceCoverage,
  type Project,
  plural,
  type ReferenceDraft,
  readDoi,
  referenceList,
  removeSource,
  type Source,
  type SourceUse,
  setSource,
  sourceUses,
} from '@loopweft/model';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch, IconTrash, IconWorldSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { refused, useEdit, useStudio, useStudioStore } from '../context.tsx';
import { ChoiceInput, CommitText } from '../map/inputs.tsx';
import { useLookup } from './lookup.tsx';
import { DraftNotes, plainReference, ReferenceText } from './reference-text.tsx';

/** A variable's, link's or loop's name as people read it: "Births", "Births → Population", a loop's name. */
export function elementName(project: Project, kind: 'variable' | 'link' | 'loop', id: string): string {
  const label = (v: string) => project.variables.find((x) => x.id === v)?.label ?? v;
  if (kind === 'variable') return label(id);
  if (kind === 'link') {
    const link = project.links.find((l) => l.id === id);
    return link ? `${label(link.from)} → ${label(link.to)}` : id;
  }
  return project.loops.find((l) => l.id === id)?.name ?? id;
}

/** Shows an element on the map: selects it and switches to the Map workspace. */
export function useShowOnMap() {
  const store = useStudioStore();
  return (kind: 'variable' | 'link' | 'loop', ids: string[]) => {
    const project = store.getState().project;
    if (kind === 'loop') {
      const loop = project.loops.find((l) => l.id === ids[0]);
      const links = loop?.links ?? [];
      const ends = project.links.filter((l) => links.includes(l.id)).flatMap((l) => [l.from, l.to]);
      store.getState().select({ variables: [...new Set(ends)], links, loop: loop?.id ?? null });
    } else {
      store.getState().select({
        variables: kind === 'variable' ? ids : [],
        links: kind === 'link' ? ids : [],
        loop: null,
      });
    }
    store.getState().showWorkspace('map');
  };
}

const citedText = (c: { pages?: string; strength?: string; note?: string }) =>
  [c.pages ? `${/[–—,-]/.test(c.pages) ? 'pp.' : 'p.'} ${c.pages}` : '', c.strength ?? '', c.note ?? '']
    .filter(Boolean)
    .join(' · ');

// ----- the list -----

export function SourceList({ query, onQuery }: { query: string; onQuery(next: string): void }) {
  const project = useStudio((s) => s.project);
  const chosen = useStudio((s) => s.source);
  const store = useStudioStore();
  const uses = useMemo(() => new Map(evidenceCoverage(project).sources.map((s) => [s.id, s])), [project]);
  const rows = useMemo(() => {
    const ordered = referenceList(project).flatMap((ref) => [
      { source: ref.source, part: false },
      ...ref.parts.map((p) => ({ source: p.source, part: true })),
    ]);
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return ordered;
    return ordered.filter(({ source }) => {
      const text = [source.id, source.label, source.apa, source.doi, source.summary].join(' ').toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [project, query]);

  return (
    <Stack gap="xs" className="lw-library-list">
      <TextInput
        size="sm"
        placeholder="Search the sources"
        leftSection={<IconSearch size={14} aria-hidden />}
        value={query}
        onChange={(event) => onQuery(event.currentTarget.value)}
        aria-label="Search the sources"
      />
      <ScrollArea type="auto" offsetScrollbars style={{ flex: 1 }}>
        <Stack gap={2} role="list" aria-label="Sources">
          {project.sources.length === 0 && (
            <Text size="sm" c="dimmed" p="xs">
              No sources yet. Add one by its DOI, or by hand.
            </Text>
          )}
          {project.sources.length > 0 && rows.length === 0 && (
            <Text size="sm" c="dimmed" p="xs">
              No source matches “{query}”.
            </Text>
          )}
          {rows.map(({ source, part }) => {
            const use = uses.get(source.id);
            const cited = use?.citations ?? 0;
            return (
              <UnstyledButton
                key={source.id}
                role="listitem"
                className="lw-source-row"
                data-active={source.id === chosen || undefined}
                data-part={part || undefined}
                onClick={() => store.getState().selectSource(source.id)}
                aria-label={`${source.label ?? source.id}: ${plural(cited, 'citation')}`}
                aria-current={source.id === chosen ? 'true' : undefined}
              >
                <Text size="sm" fw={500} lineClamp={1}>
                  {part ? 'Supplement: ' : ''}
                  {source.label ?? plainReference(source.apa)}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {plainReference(source.apa)}
                </Text>
                <Group gap={6} mt={2}>
                  <Badge size="xs" variant="light" color="gray" style={{ textTransform: 'none' }}>
                    {source.id}
                  </Badge>
                  <Badge
                    size="xs"
                    variant="light"
                    color={cited || use?.story ? 'teal' : 'yellow'}
                    style={{ textTransform: 'none' }}
                  >
                    {cited ? plural(cited, 'citation') : use?.story ? 'in the story' : 'not cited'}
                  </Badge>
                  {source.doi && (
                    <Badge size="xs" variant="outline" color="gray" style={{ textTransform: 'none' }}>
                      DOI
                    </Badge>
                  )}
                </Group>
              </UnstyledButton>
            );
          })}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

// ----- checking a source against Crossref -----

function RecordCheck({ source, onDone }: { source: Source; onDone(): void }) {
  const lookup = useLookup();
  const edit = useEdit();
  const [state, setState] = useState<
    { state: 'looking' } | { state: 'found'; draft: ReferenceDraft } | { state: 'failed'; message: string }
  >({ state: 'looking' });
  useEffect(() => {
    const stop = new AbortController();
    void lookup(source.doi ?? '', stop.signal).then((found) => {
      if (stop.signal.aborted) return;
      setState(
        found.ok
          ? { state: 'found', draft: found.draft }
          : { state: 'failed', message: found.failure.message },
      );
    });
    return () => stop.abort();
  }, [lookup, source.doi]);
  if (state.state === 'looking') {
    return (
      <Group gap="xs">
        <Loader size="xs" />
        <Text size="sm" c="dimmed">
          Looking up {source.doi}…
        </Text>
      </Group>
    );
  }
  if (state.state === 'failed') {
    return (
      <Alert color="red" variant="light" title="No reference found">
        {state.message}
      </Alert>
    );
  }
  const { draft } = state;
  const same = draft.apa === source.apa;
  return (
    <Stack gap="sm">
      <DraftNotes notes={draft.notes} />
      <Text size="sm" fw={500}>
        {draft.agency}’s record gives
      </Text>
      <div className="lw-reference-preview">
        <ReferenceText apa={draft.apa} />
      </div>
      <Text size="sm" fw={500}>
        This source says
      </Text>
      <div className="lw-reference-preview">
        <ReferenceText apa={source.apa} />
      </div>
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          Keep this source’s
        </Button>
        <Button
          disabled={same}
          onClick={() => {
            if (
              edit(
                (p) => setSource(p, source.id, { apa: draft.apa }),
                `Took ${draft.agency}’s reference for ${source.id}`,
              )
            )
              onDone();
          }}
        >
          {same ? 'They are the same' : `Use ${draft.agency}’s reference`}
        </Button>
      </Group>
    </Stack>
  );
}

// ----- the chosen source -----

function UseRow({ project, use }: { project: Project; use: SourceUse }) {
  const show = useShowOnMap();
  if (use.kind === 'scene') {
    return <Text size="sm">Listed by scene {use.id}</Text>;
  }
  if (use.kind === 'overlay') {
    return (
      <Text size="sm">
        Step {use.where}
        {citedText(use.citation) ? `: ${citedText(use.citation)}` : ''}
      </Text>
    );
  }
  const kind = use.kind;
  const word = kind === 'variable' ? 'Variable' : kind === 'link' ? 'Link' : 'Loop';
  return (
    <Group gap="xs" wrap="nowrap" justify="space-between">
      <Text size="sm" style={{ minWidth: 0 }}>
        <Text span size="xs" c="dimmed">
          {word}{' '}
        </Text>
        {elementName(project, kind, use.id)}
        {citedText(use.citation) ? (
          <Text span size="sm" c="dimmed">
            {' '}
            · {citedText(use.citation)}
          </Text>
        ) : null}
      </Text>
      <Anchor component="button" size="xs" onClick={() => show(kind, [use.id])} style={{ flex: 'none' }}>
        Show on map
      </Anchor>
    </Group>
  );
}

export function SourceEditor({ source }: { source: Source }) {
  const project = useStudio((s) => s.project);
  const store = useStudioStore();
  const edit = useEdit();
  const [checking, setChecking] = useState(false);
  const set = (changes: Parameters<typeof setSource>[2]) => edit((p) => setSource(p, source.id, changes));
  const uses = useMemo(() => sourceUses(project, source.id), [project, source.id]);
  const parts = project.sources.filter((s) => s.partOf === source.id);
  const remove = () => {
    const cited = uses.filter((u) => u.kind !== 'scene').length;
    const listed = uses.length - cited;
    const what = [
      cited ? plural(cited, 'citation') : '',
      listed ? `its listing in ${plural(listed, 'scene')}` : '',
    ]
      .filter(Boolean)
      .join(' and ');
    if (!window.confirm(`Remove source ${source.id}${what ? ` with ${what}` : ''}? Ctrl+Z brings it back.`))
      return;
    if (edit((p) => removeSource(p, source.id, { cascade: true }))) store.getState().selectSource(null);
  };
  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Title order={2} size="h5" lineClamp={1}>
          {source.label ?? 'Source'}
        </Title>
        <Badge variant="light" color="gray" style={{ textTransform: 'none' }}>
          {source.id}
        </Badge>
      </Group>
      <div className="lw-reference-preview">
        <ReferenceText apa={source.apa} />
      </div>
      <CommitText
        label="Reference (APA 7)"
        description="*Asterisks* mark italics. Ctrl+Enter keeps the change."
        value={source.apa}
        required
        multiline
        onCommit={(apa) => apa && set({ apa })}
      />
      <CommitText
        label="In-text label"
        placeholder="e.g. Lawrence et al. (2024)"
        value={source.label ?? ''}
        onCommit={(label) => set({ label })}
      />
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <div style={{ flex: 1 }}>
          <CommitText
            label="DOI"
            placeholder="10.1017/sus.2024.1"
            value={source.doi ?? ''}
            onCommit={(text) => {
              if (text === null) {
                set({ doi: null });
                return;
              }
              const doi = readDoi(text);
              if (!doi) {
                notifications.show({
                  color: 'red',
                  title: 'That change was not made',
                  message: `“${text}” is not a DOI. A DOI starts with 10., a number and a slash, e.g. 10.1017/sus.2024.1.`,
                });
                return;
              }
              set({ doi });
            }}
          />
        </div>
        {source.doi && (
          <Button
            size="sm"
            variant="default"
            leftSection={<IconWorldSearch size={16} aria-hidden />}
            onClick={() => setChecking(true)}
          >
            Check against its record
          </Button>
        )}
      </Group>
      <CommitText
        label="Web address"
        placeholder="https://"
        value={source.url ?? ''}
        onCommit={(url) => set({ url })}
      />
      <CommitText
        label="Licence"
        placeholder="e.g. CC BY 4.0"
        value={source.licence ?? ''}
        onCommit={(licence) => set({ licence })}
      />
      <CommitText
        label="Summary"
        description="What the map draws from it."
        value={source.summary ?? ''}
        multiline
        onCommit={(summary) => set({ summary })}
      />
      <ChoiceInput
        label="Supplement of"
        none="Not a supplement"
        value={source.partOf}
        options={project.sources
          .filter((s) => s.id !== source.id && s.partOf !== source.id)
          .map((s) => ({ value: s.id, label: s.label ?? plainReference(s.apa).slice(0, 60) }))}
        onChange={(partOf) => set({ partOf })}
      />
      {parts.length > 0 && (
        <Text size="sm" c="dimmed">
          Its supplements: {parts.map((p) => p.label ?? p.id).join(', ')}.
        </Text>
      )}
      <Divider label={`Cited by ${uses.length}`} labelPosition="left" />
      {uses.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nothing cites this source yet. Select variables or links on the map and cite it in the inspector.
        </Text>
      ) : (
        <Stack gap={4}>
          {uses.map((use, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one source's uses, in project order
            <UseRow key={i} project={project} use={use} />
          ))}
        </Stack>
      )}
      <Divider />
      <Group justify="flex-end">
        <Button
          size="compact-sm"
          variant="subtle"
          color="red"
          leftSection={<IconTrash size={14} aria-hidden />}
          onClick={() => {
            try {
              remove();
            } catch (error) {
              refused(error);
            }
          }}
        >
          Remove this source
        </Button>
      </Group>
      <Modal
        opened={checking}
        onClose={() => setChecking(false)}
        title={`Check ${source.id} against its DOI record`}
        size="40rem"
      >
        {checking && <RecordCheck source={source} onDone={() => setChecking(false)} />}
      </Modal>
    </Stack>
  );
}
