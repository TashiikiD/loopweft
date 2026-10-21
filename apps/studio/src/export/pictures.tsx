// Pictures: PNG (pixels, as the screen shows them) or SVG (a drawing that stays sharp and can be edited) of one
// step, every step (one .zip), or the whole map, drawn by the export page in a hidden frame (engine.ts), the
// same files `loopweft export --png` and `--svg` make. A step is drawn as it stands once its motion is over,
// without travelling or wandering pulses.
import { fileStem, type JobEvent, type PictureJob, type PictureTarget, picturesFor } from '@loopweft/export';
import { type Project, plural, serializeProject, stepKey } from '@loopweft/model';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  List,
  Progress,
  Radio,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { zipSync } from 'fflate';
import { useMemo, useRef, useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import { chooseSaveTarget, PNG_FILE, SVG_FILE, ZIP_FILE } from '../state/files.ts';
import type { Engine } from './engine.ts';

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

type What = 'step' | 'steps' | 'map';
type Format = 'png' | 'svg';

/**
 * Every zip entry is dated 1 January 1980 (the earliest date a zip holds), so the same pictures always give
 * the same zip. Written in local time, as zip dates are.
 */
const ZIP_DATE = new Date(1980, 0, 1, 0, 0, 0);

/** Pictures as one zip, stored as they are (a PNG is compressed already). */
export function zipPictures(files: readonly { name: string; bytes: Uint8Array }[]): Uint8Array {
  return zipSync(Object.fromEntries(files.map((f) => [f.name, [f.bytes, { level: 0, mtime: ZIP_DATE }]])));
}

/** The story's steps for the step list: "S04.2a · Farm input costs". */
function stepOptions(project: Project): { value: string; label: string }[] {
  return project.story.scenes.flatMap((scene) =>
    scene.steps.map((step) => {
      const key = stepKey(scene.id, step.id);
      return { value: key, label: `${key} · ${step.label}` };
    }),
  );
}

export interface PicturesCardProps {
  /** The engine, started the first time it is needed and kept while the workspace is open. */
  engine: () => Promise<Engine>;
}

interface Made {
  name: string;
  format: Format;
  count: number;
  width: number;
  height: number;
  bytes: number;
  /** An SVG's notes: what some editors leave out, and anything drawn approximately. */
  notes: string[];
}

export function PicturesCard({ engine }: PicturesCardProps) {
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const steps = useMemo(() => stepOptions(project), [project]);
  const [what, setWhat] = useState<What>(steps.length > 0 ? 'step' : 'map');
  const [format, setFormat] = useState<Format>('png');
  const [step, setStep] = useState<string | null>(steps[0]?.value ?? null);
  const [scale, setScale] = useState<'1' | '2'>('1');
  const [trim, setTrim] = useState(false);
  const [categoryWords, setCategoryWords] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; key?: string } | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  const chosenStep = step && steps.some((s) => s.value === step) ? step : (steps[0]?.value ?? null);
  const mode: What = what !== 'map' && steps.length === 0 ? 'map' : what;
  const stem = fileStem(project.meta.title);

  const target = (): PictureTarget =>
    mode === 'map'
      ? { kind: 'map', trim }
      : mode === 'steps'
        ? { kind: 'steps' }
        : { kind: 'step', step: chosenStep as string };

  const run = async () => {
    const now = store.getState().project;
    const job: PictureJob = {
      format,
      target: target(),
      scale: format === 'png' && scale === '2' ? 2 : 1,
      categoryWords,
    };
    let pictures: ReturnType<typeof picturesFor>;
    try {
      pictures = picturesFor(now, job.target, format);
    } catch (error) {
      setFailure(String((error as Error).message ?? error));
      return;
    }
    const single = pictures.length === 1 && mode !== 'steps';
    const name = single
      ? `${stem}-${pictures[0]?.name}`
      : format === 'png'
        ? `${stem}-steps.zip`
        : `${stem}-steps-svg.zip`;
    // Where to save is asked first, in the click itself (see chooseSaveTarget).
    const asking = chooseSaveTarget(name, single ? (format === 'png' ? PNG_FILE : SVG_FILE) : ZIP_FILE);
    setFailure(null);
    setProgress({ done: 0, total: pictures.length });
    let stopped = false;
    let running: { engine: Engine; id: string } | null = null;
    cancel.current = () => {
      stopped = true;
      if (running) void running.engine.cancel(running.id);
    };
    try {
      const saved = await asking;
      if (!saved || stopped) return;
      const drawing = await engine();
      await drawing.open(serializeProject(now));
      const id = await drawing.start(job);
      running = { engine: drawing, id };
      const files: JobEvent[] = [];
      for (;;) {
        if (stopped) return;
        const event = await drawing.next(id);
        if (!event) break;
        files.push(event);
        setProgress({ done: event.done, total: event.total, ...(event.key ? { key: event.key } : {}) });
      }
      if (stopped) return;
      const first = files[0] as JobEvent;
      const bytes = single ? first.bytes : zipPictures(files);
      await saved.write(bytes);
      const result: Made = {
        name: saved.name,
        format,
        count: files.length,
        width: first.width,
        height: first.height,
        bytes: bytes.length,
        notes: [...new Set(files.flatMap((f) => f.notes ?? []))],
      };
      setMade(result);
      notifications.show({
        title: saved.how === 'file' ? 'Exported' : 'Downloaded',
        message:
          saved.how === 'file'
            ? `Saved ${saved.name} (${megabytes(result.bytes)}).`
            : `${saved.name} (${megabytes(result.bytes)}) is in your downloads.`,
        autoClose: 4000,
      });
    } catch (error) {
      if (!stopped) setFailure(String((error as Error).message ?? error));
    } finally {
      cancel.current = null;
      setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Title order={3} size="h4">
          Pictures (PNG or SVG)
        </Title>
        <Text size="sm">
          A step as the audience sees it once its motion is over, every step at once, or the whole map. Drawn
          by this browser, as the slides are.
        </Text>
        <Radio.Group
          label="Format"
          value={format}
          onChange={(v) => setFormat(v as Format)}
          name="picture-format"
        >
          <Stack gap={6} mt={4}>
            <Radio
              value="png"
              label="PNG: pixels, as the screen shows them"
              description="For documents, slides and the web."
              disabled={busy}
            />
            <Radio
              value="svg"
              label="SVG: a drawing that stays sharp at any size"
              description="Shapes and text stay editable in PowerPoint, Word, Inkscape and Illustrator."
              disabled={busy}
            />
          </Stack>
        </Radio.Group>
        <Radio.Group
          label="What to draw"
          value={mode}
          onChange={(v) => setWhat(v as What)}
          name="picture-what"
        >
          <Stack gap={6} mt={4}>
            <Radio value="step" label="One step" disabled={steps.length === 0 || busy} />
            <Radio
              value="steps"
              label={`Every step (${plural(steps.length, format === 'png' ? 'picture' : 'drawing')} in one .zip)`}
              disabled={steps.length === 0 || busy}
            />
            <Radio value="map" label="The whole map, without the story" disabled={busy} />
          </Stack>
        </Radio.Group>
        {mode === 'step' && (
          <Select
            label="Step"
            data={steps}
            value={chosenStep}
            onChange={(v) => v && setStep(v)}
            searchable
            allowDeselect={false}
            disabled={busy}
          />
        )}
        {mode === 'map' && (
          <Checkbox
            checked={trim}
            onChange={(e) => setTrim(e.currentTarget.checked)}
            label="Trim to the map"
            description="Only the map and a margin, not the whole 16:9 screen."
            disabled={busy}
          />
        )}
        {format === 'png' && (
          <Radio.Group
            label="Size"
            value={scale}
            onChange={(v) => setScale(v as '1' | '2')}
            name="picture-size"
          >
            <Group gap="lg" mt={4}>
              <Radio value="1" label="1920 × 1080 (the screen)" disabled={busy} />
              <Radio value="2" label="3840 × 2160 (for print and posters)" disabled={busy} />
            </Group>
          </Radio.Group>
        )}
        <Checkbox
          checked={categoryWords}
          onChange={(e) => setCategoryWords(e.currentTarget.checked)}
          label="Name categories in words"
          description="Each shown variable's category written under its label, as the C key shows it."
          disabled={busy}
        />
        <Group>
          <Button onClick={() => void run()} loading={busy && progress?.done === 0} disabled={busy}>
            {mode === 'steps'
              ? format === 'png'
                ? 'Export pictures…'
                : 'Export drawings…'
              : format === 'png'
                ? 'Export PNG…'
                : 'Export SVG…'}
          </Button>
          {busy && (
            <Button variant="default" onClick={() => cancel.current?.()}>
              Cancel
            </Button>
          )}
        </Group>
        {busy && progress && progress.total > 1 && (
          <Stack gap={4}>
            <Progress value={(progress.done / progress.total) * 100} aria-label="Drawing the pictures" />
            <Text size="sm" c="dimmed" aria-live="polite">
              Drawn {progress.done} of {progress.total}
              {progress.key ? ` (last: ${progress.key})` : ''}.
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
              Last export: {made.name},{' '}
              {made.count > 1
                ? `${plural(made.count, made.format === 'png' ? 'picture' : 'drawing')} of `
                : ''}
              {made.width} × {made.height}, {megabytes(made.bytes)}.
            </Text>
            {made.notes.length > 0 && (
              <Alert color="blue" title="To know about this drawing">
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
