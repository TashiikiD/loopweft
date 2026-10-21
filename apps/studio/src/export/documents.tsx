// PDF documents: the slides (one 16:9 page per step, drawn by the export page in its hidden frame, as pictures
// are), the speaker notes (each scene on its own page, its steps with their slide numbers, notes and script) and
// the references (an APA list, with every image's credit), the last two on Letter or A4 paper. Made in this page,
// with the same code as `loopweft export --pdf`.
import {
  type FontReader,
  fileStem,
  type JobEvent,
  notesPdf,
  type Paper,
  referencesPdf,
  type SlidePicture,
  slidesPdf,
} from '@loopweft/export';
import { type Project, plural, serializeProject } from '@loopweft/model';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  List,
  Progress,
  Radio,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRef, useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import { chooseSaveTarget, PDF_FILE } from '../state/files.ts';
import type { Engine } from './engine.ts';

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

type Which = 'slides' | 'notes' | 'references';

const FILES: Record<Which, string> = { slides: 'slides', notes: 'speaker-notes', references: 'references' };

interface Made {
  name: string;
  which: Which;
  pages: number;
  bytes: number;
  paper: Paper;
  notes: string[];
}

export interface DocumentsCardProps {
  fonts: FontReader;
  /** The export engine, for the slides (started the first time it is needed). */
  engine: () => Promise<Engine>;
}

export function DocumentsCard({ fonts, engine }: DocumentsCardProps) {
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const steps = project.story.scenes.reduce((n, s) => n + s.steps.length, 0);
  const [which, setWhich] = useState<Which>('notes');
  const [paper, setPaper] = useState<Paper>('letter');
  const [categoryWords, setCategoryWords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  /**
   * Every step drawn as a slide by the engine, with progress; null if cancelled. `drawing` is told how to stop
   * the engine's job once it has started.
   */
  const drawSlides = async (
    now: Project,
    stopped: () => boolean,
    drawing: (stop: () => void) => void,
  ): Promise<SlidePicture[] | null> => {
    const drawer = await engine();
    await drawer.open(serializeProject(now));
    const id = await drawer.start({ format: 'jpeg', target: { kind: 'steps' }, scale: 1, categoryWords });
    drawing(() => void drawer.cancel(id));
    const pictures: SlidePicture[] = [];
    for (;;) {
      if (stopped()) return null;
      const event: JobEvent | null = await drawer.next(id);
      if (!event) break;
      pictures.push({ key: event.key as string, jpeg: event.bytes });
      setProgress({ done: event.done, total: event.total });
    }
    return stopped() ? null : pictures;
  };

  const run = async () => {
    const choice = which;
    const asking = chooseSaveTarget(`${fileStem(project.meta.title)}-${FILES[choice]}.pdf`, PDF_FILE);
    let stopped = false;
    let stopEngine: (() => void) | null = null;
    cancel.current = () => {
      stopped = true;
      stopEngine?.();
    };
    setBusy(true);
    setFailure(null);
    try {
      const saved = await asking;
      if (!saved || stopped) return;
      const now = store.getState().project;
      let result: { bytes: Uint8Array; pages: number; notes: string[] };
      if (choice === 'slides') {
        setProgress({ done: 0, total: steps });
        const pictures = await drawSlides(
          now,
          () => stopped,
          (stop) => {
            stopEngine = stop;
          },
        );
        if (!pictures) return;
        result = { ...(await slidesPdf(now, pictures)), notes: [] };
      } else {
        result = await (choice === 'notes' ? notesPdf : referencesPdf)(now, { paper, fonts });
      }
      if (stopped) return;
      await saved.write(result.bytes);
      setMade({
        name: saved.name,
        which: choice,
        pages: result.pages,
        bytes: result.bytes.length,
        paper,
        notes: result.notes,
      });
      notifications.show({
        title: saved.how === 'file' ? 'Exported' : 'Downloaded',
        message:
          saved.how === 'file'
            ? `Saved ${saved.name} (${megabytes(result.bytes.length)}).`
            : `${saved.name} (${megabytes(result.bytes.length)}) is in your downloads.`,
        autoClose: 4000,
      });
    } catch (error) {
      if (!stopped) setFailure(String((error as Error).message ?? error));
    } finally {
      cancel.current = null;
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Title order={3} size="h4">
          PDF documents
        </Title>
        <Text size="sm">
          To print, to hand out, or to keep as a backup for the day. The slides are one page per step, as the
          audience sees each. The speaker notes give each scene a page: its steps with their slide numbers and
          cues, the notes and the script. The references list every source in APA style, with the scenes that
          cite it and every image's credit.
        </Text>
        <Radio.Group
          label="Document"
          value={which}
          onChange={(v) => setWhich(v as Which)}
          name="pdf-document"
        >
          <Group gap="lg" mt={4}>
            <Radio
              value="slides"
              label={`Slides (${plural(steps, 'page')})`}
              disabled={busy || steps === 0}
            />
            <Radio value="notes" label="Speaker notes" disabled={busy} />
            <Radio value="references" label="References" disabled={busy} />
          </Group>
        </Radio.Group>
        {which === 'slides' ? (
          <Checkbox
            checked={categoryWords}
            onChange={(e) => setCategoryWords(e.currentTarget.checked)}
            label="Name categories in words"
            description="Each shown variable's category written under its label, as the C key shows it."
            disabled={busy}
          />
        ) : (
          <Radio.Group label="Paper" value={paper} onChange={(v) => setPaper(v as Paper)} name="pdf-paper">
            <Group gap="lg" mt={4}>
              <Radio value="letter" label="Letter" disabled={busy} />
              <Radio value="a4" label="A4" disabled={busy} />
            </Group>
          </Radio.Group>
        )}
        <Group>
          <Button onClick={() => void run()} loading={busy && !progress} disabled={busy}>
            Export PDF…
          </Button>
          {busy && which === 'slides' && (
            <Button variant="default" onClick={() => cancel.current?.()}>
              Cancel
            </Button>
          )}
        </Group>
        {busy && progress && (
          <Stack gap={4}>
            <Progress
              value={(progress.done / Math.max(1, progress.total)) * 100}
              aria-label="Drawing the slides"
            />
            <Text size="sm" c="dimmed" aria-live="polite">
              Drawn {progress.done} of {progress.total} slides.
            </Text>
          </Stack>
        )}
        {failure && (
          <Alert color="red" title="Not exported">
            {failure}
          </Alert>
        )}
        {made && !busy && (
          <Stack gap={4}>
            <Text size="sm">
              Last export: {made.name}, {plural(made.pages, 'page')} (
              {made.which === 'slides' ? '16:9' : made.paper === 'a4' ? 'A4' : 'Letter'}),{' '}
              {megabytes(made.bytes)}.
            </Text>
            {made.notes.length > 0 && (
              <Alert color="yellow" title="To know about this file">
                <List size="sm">
                  {made.notes.map((note) => (
                    <List.Item key={note}>{note}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
