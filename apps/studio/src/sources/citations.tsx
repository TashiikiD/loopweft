// Citing sources on variables, links and loops: an element's citations, each with its pages, strength and
// note to change or remove, and a form that cites a source on one element or on many at once. Every change
// is one of the model's operations (the ones `loopweft cite` runs), one undoable step each.
import { addCitation, type Citation, type Project, removeCitation, setCitation } from '@loopweft/model';
import {
  ActionIcon,
  Anchor,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useEdit, useStudio, useStudioStore } from '../context.tsx';
import { CommitText } from '../map/inputs.tsx';
import { plainReference } from './reference-text.tsx';

const STRENGTHS = [
  { value: '', label: 'Not rated' },
  { value: 'strong', label: 'Strong' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'weak', label: 'Weak' },
];

type Strength = 'strong' | 'moderate' | 'weak';

/** A source as a person picks it: its in-text label, or the start of its reference, and its id. */
export const sourceChoices = (project: Project) =>
  project.sources.map((s) => ({
    value: s.id,
    label: `${s.label ?? plainReference(s.apa).slice(0, 70)} [${s.id}]`,
  }));

/** Opens a source in the Sources workspace's library. */
function useOpenSource() {
  const store = useStudioStore();
  return (id: string | null) => {
    store.getState().selectSource(id);
    store.getState().showWorkspace('sources');
  };
}

function CitationRow({ element, index, citation }: { element: string; index: number; citation: Citation }) {
  const project = useStudio((s) => s.project);
  const edit = useEdit();
  const open = useOpenSource();
  const source = project.sources.find((s) => s.id === citation.source);
  const name = source?.label ?? citation.source;
  const set = (changes: Parameters<typeof setCitation>[3]) =>
    edit((p) => setCitation(p, element, index, changes));
  return (
    <Paper withBorder radius="sm" p={8} className="lw-citation">
      <Stack gap={6}>
        <Group gap={6} wrap="nowrap" justify="space-between">
          <Anchor
            component="button"
            size="sm"
            fw={500}
            onClick={() => open(citation.source)}
            title={source ? plainReference(source.apa) : undefined}
            style={{ textAlign: 'left', minWidth: 0 }}
          >
            {name}
          </Anchor>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={() => edit((p) => removeCitation(p, element, index))}
            aria-label={`Remove the citation of ${name}${citation.pages ? ` (${citation.pages})` : ''}`}
          >
            <IconX size={14} aria-hidden />
          </ActionIcon>
        </Group>
        <Group gap={6} grow align="flex-start">
          <CommitText
            label="Pages"
            placeholder="e.g. 11–12"
            value={citation.pages ?? ''}
            onCommit={(pages) => set({ pages })}
          />
          <CommitText
            label="Note"
            placeholder="e.g. Fig. 6c"
            value={citation.note ?? ''}
            onCommit={(note) => set({ note })}
          />
        </Group>
        <SegmentedControl
          size="xs"
          value={citation.strength ?? ''}
          data={STRENGTHS}
          onChange={(value) => set({ strength: value ? (value as Strength) : null })}
          aria-label={`Strength of the evidence from ${name}`}
        />
      </Stack>
    </Paper>
  );
}

/** An element's citations, to change one by one. */
export function CitationsEditor({ element, citations }: { element: string; citations: Citation[] }) {
  if (citations.length === 0) {
    return (
      <Text size="sm" c="yellow.7">
        No source cited yet.
      </Text>
    );
  }
  return (
    <Stack gap={6}>
      {citations.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: one element's citations, in their order
        <CitationRow key={i} element={element} index={i} citation={c} />
      ))}
    </Stack>
  );
}

/** Cites one source on the elements given: variables, links or loops, by id. */
export function CiteForm({
  elements,
  what,
  onCited,
}: {
  elements: string[];
  what?: string;
  /** After a citation is added, e.g. to clear a selection. */
  onCited?: () => void;
}) {
  const project = useStudio((s) => s.project);
  const store = useStudioStore();
  const edit = useEdit();
  const [source, setSource] = useState<string | null>(null);
  const [pages, setPages] = useState('');
  const [strength, setStrength] = useState('');
  const [note, setNote] = useState('');
  if (project.sources.length === 0) {
    return (
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Text size="sm" c="dimmed">
          No sources to cite yet.
        </Text>
        <Button size="compact-sm" variant="default" onClick={() => store.getState().showWorkspace('sources')}>
          Add one in Sources
        </Button>
      </Group>
    );
  }
  const cite = () => {
    if (!source) return;
    const out = edit((p) =>
      addCitation(p, elements, {
        source,
        ...(pages.trim() ? { pages: pages.trim() } : {}),
        ...(strength ? { strength: strength as Strength } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    );
    if (!out) return;
    if (elements.length > 1 || out.result.skipped.length)
      notifications.show({ message: out.summary, autoClose: 5000 });
    setPages('');
    setNote('');
    // A strength is a judgement about one citation: it never carries over to the next.
    setStrength('');
    onCited?.();
  };
  return (
    <Stack gap={6} className="lw-cite-form">
      <Select
        label={`Cite a source${what ? ` on ${what}` : ''}`}
        placeholder="Choose a source"
        searchable
        size="sm"
        data={sourceChoices(project)}
        value={source}
        onChange={setSource}
        nothingFoundMessage="No source matches"
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
      <Group gap={6} grow align="flex-start">
        <TextInput
          label="Pages"
          size="sm"
          placeholder="e.g. 11–12"
          value={pages}
          onChange={(event) => setPages(event.currentTarget.value)}
        />
        <TextInput
          label="Note"
          size="sm"
          placeholder="e.g. Fig. 6c"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
      </Group>
      <SegmentedControl
        size="xs"
        value={strength}
        data={STRENGTHS}
        onChange={setStrength}
        aria-label="Strength of the evidence"
      />
      <Text size="xs" c="dimmed">
        Strength: how strongly the source supports it, in your judgement.
      </Text>
      <Button size="compact-sm" disabled={!source || elements.length === 0} onClick={cite} w="fit-content">
        Cite
      </Button>
    </Stack>
  );
}
