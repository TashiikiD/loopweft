// Adding a source: look its DOI up at Crossref or DataCite (the draft, where it came from and its notes are
// shown, to correct before adding), or enter it by hand, which needs no network. Nothing is added until the
// person says so.
import {
  addSource,
  type LookupFailure,
  type Project,
  type ReferenceDraft,
  readDoi,
  type SourceInput,
  suggestSourceId,
} from '@loopweft/model';
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconWorldSearch } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useEdit, useStudio, useStudioStore } from '../context.tsx';
import { failureTitle, useLookup } from './lookup.tsx';
import { DraftNotes, plainReference, ReferenceText } from './reference-text.tsx';

interface Form {
  id: string;
  apa: string;
  label: string;
  doi: string;
  url: string;
  licence: string;
  summary: string;
  partOf: string;
}

const EMPTY: Form = { id: '', apa: '', label: '', doi: '', url: '', licence: '', summary: '', partOf: '' };

type Mode = 'doi' | 'hand';

type Lookup =
  | { state: 'idle' }
  | { state: 'looking'; doi: string }
  | { state: 'failed'; failure: LookupFailure; doi?: string }
  | { state: 'found'; draft: ReferenceDraft };

/** What the form adds: only the fields given, the DOI in its bare form. */
function sourceInput(form: Form): SourceInput {
  const given = (value: string) => value.trim() || undefined;
  const doi = given(form.doi);
  const input: Record<string, string> = { apa: form.apa.trim() };
  for (const [key, value] of [
    ['id', given(form.id)],
    ['label', given(form.label)],
    ['doi', doi ? (readDoi(doi) ?? doi) : undefined],
    ['url', given(form.url)],
    ['licence', given(form.licence)],
    ['summary', given(form.summary)],
    ['partOf', given(form.partOf)],
  ] as const) {
    if (value !== undefined) input[key] = value;
  }
  return input as SourceInput;
}

function SourceFields({
  form,
  onChange,
  project,
}: {
  form: Form;
  onChange(next: Form): void;
  project: Project;
}) {
  const set = (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...form, [key]: event.currentTarget.value });
  const taken = new Set(project.sources.map((s) => s.id));
  const suggested = form.apa.trim() ? suggestSourceId(form.apa, taken) : '';
  const badDoi = form.doi.trim() !== '' && readDoi(form.doi) === null;
  return (
    <Stack gap="sm">
      <Textarea
        label="Reference (APA 7)"
        description="The full reference. *Asterisks* mark italics."
        required
        autosize
        minRows={3}
        maxRows={8}
        value={form.apa}
        onChange={set('apa')}
      />
      {form.apa.trim() && (
        <div className="lw-reference-preview">
          <ReferenceText apa={form.apa} />
        </div>
      )}
      <Group grow align="flex-start">
        <TextInput
          label="In-text label"
          placeholder="e.g. Lawrence et al. (2024)"
          value={form.label}
          onChange={set('label')}
        />
        <TextInput
          label="Id"
          description={suggested ? `Left empty: ${suggested}` : 'A short tag citations use'}
          placeholder={suggested}
          value={form.id}
          onChange={set('id')}
        />
      </Group>
      <Group grow align="flex-start">
        <TextInput
          label="DOI"
          placeholder="10.xxxx/xxxxx"
          value={form.doi}
          onChange={set('doi')}
          error={badDoi ? 'Not a DOI: it starts with 10., a number and a slash.' : undefined}
        />
        <TextInput label="Web address" placeholder="https://" value={form.url} onChange={set('url')} />
      </Group>
      <Group grow align="flex-start">
        <TextInput
          label="Licence"
          placeholder="e.g. CC BY 4.0"
          value={form.licence}
          onChange={set('licence')}
        />
        <Select
          label="Supplement of"
          placeholder="Not a supplement"
          clearable
          value={form.partOf || null}
          data={project.sources.map((s) => ({
            value: s.id,
            label: s.label ?? plainReference(s.apa).slice(0, 60),
          }))}
          onChange={(value) => onChange({ ...form, partOf: value ?? '' })}
          comboboxProps={{ withinPortal: true }}
        />
      </Group>
      <Textarea
        label="Summary"
        description="What the map draws from it."
        autosize
        minRows={2}
        value={form.summary}
        onChange={set('summary')}
      />
    </Stack>
  );
}

function AddSource({ onDone }: { onDone(): void }) {
  const project = useStudio((s) => s.project);
  const store = useStudioStore();
  const edit = useEdit();
  const lookup = useLookup();
  const [mode, setMode] = useState<Mode>('doi');
  const [doi, setDoi] = useState('');
  const [result, setResult] = useState<Lookup>({ state: 'idle' });
  const [form, setForm] = useState<Form>(EMPTY);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  const look = async () => {
    running.current?.abort();
    const stop = new AbortController();
    running.current = stop;
    setResult({ state: 'looking', doi });
    const found = await lookup(doi, stop.signal);
    // A newer lookup has taken this one's place: its answer counts, not this one's.
    if (running.current !== stop) return;
    running.current = null;
    if (found.ok) {
      const { draft } = found;
      setResult({ state: 'found', draft });
      setForm({
        ...EMPTY,
        apa: draft.apa,
        label: draft.label ?? '',
        doi: draft.doi,
        licence: draft.licence ?? '',
      });
    } else {
      setResult({ state: 'failed', failure: found.failure, ...(found.doi ? { doi: found.doi } : {}) });
    }
  };

  const add = () => {
    const out = edit((p) => addSource(p, sourceInput(form)));
    if (!out) return;
    store.getState().selectSource(out.result.id);
    onDone();
  };
  const ready = form.apa.trim() !== '' && !(form.doi.trim() && readDoi(form.doi) === null);

  return (
    <Stack gap="md">
      <SegmentedControl
        value={mode}
        onChange={(next) => setMode(next as Mode)}
        data={[
          { value: 'doi', label: 'Look up a DOI' },
          { value: 'hand', label: 'Enter by hand' },
        ]}
        aria-label="How to add it"
      />
      {mode === 'doi' && (
        <Stack gap="sm">
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              label="DOI"
              description="Bare, or as a doi.org address. Only the DOI is sent: to Crossref, and to DataCite if Crossref has no record."
              placeholder="10.xxxx/xxxxx"
              value={doi}
              onChange={(event) => setDoi(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && doi.trim()) void look();
              }}
              style={{ flex: 1 }}
              data-autofocus
            />
            {result.state === 'looking' ? (
              <Button variant="default" onClick={() => running.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button
                leftSection={<IconWorldSearch size={16} aria-hidden />}
                disabled={!doi.trim()}
                onClick={() => void look()}
              >
                Look up
              </Button>
            )}
          </Group>
          {result.state === 'looking' && (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                Looking it up…
              </Text>
            </Group>
          )}
          {result.state === 'failed' && (
            <Alert
              color={result.failure.kind === 'cancelled' ? 'gray' : 'red'}
              variant="light"
              title={failureTitle(result.failure)}
            >
              <Stack gap="xs" align="flex-start">
                <Text size="sm">{result.failure.message}</Text>
                <Button
                  size="compact-sm"
                  variant="default"
                  onClick={() => {
                    setForm({ ...EMPTY, doi: result.doi ?? '' });
                    setMode('hand');
                  }}
                >
                  Enter it by hand
                </Button>
              </Stack>
            </Alert>
          )}
          {result.state === 'found' && (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Record from {result.draft.agency}
              </Text>
              <DraftNotes notes={result.draft.notes} />
              <SourceFields form={form} onChange={setForm} project={project} />
            </Stack>
          )}
        </Stack>
      )}
      {mode === 'hand' && (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Works offline. Write the reference as APA 7 has it; Loopweft keeps it exactly as written.
          </Text>
          <SourceFields form={form} onChange={setForm} project={project} />
        </Stack>
      )}
      {(mode === 'hand' || result.state === 'found') && (
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button disabled={!ready} onClick={add}>
            Add source
          </Button>
        </Group>
      )}
    </Stack>
  );
}

export function AddSourceDialog({ opened, onClose }: { opened: boolean; onClose(): void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Add a source" size="44rem">
      {opened && <AddSource onDone={onClose} />}
    </Modal>
  );
}
