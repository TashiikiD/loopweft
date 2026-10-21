// Video: the story, a scene or steps played as the talk plays them, frame by frame, by the export page in a
// hidden frame (engine.ts), and encoded by this browser (MP4, WebM) or by Loopweft (GIF, of a scene or some
// steps): the same file `loopweft export --mp4` makes. Each step's motion then a hold (its pulses wandering),
// or the talk's own timing. No sound.
import {
  FRAME_RATES,
  fileStem,
  GIF_HEIGHT,
  GIF_RATE,
  HOLD_DEFAULT,
  HOLD_MAX,
  type VideoEndEvent,
  type VideoFormat,
  type VideoJob,
  type VideoTarget,
  videoPlan,
  videoSupport,
} from '@loopweft/export';
import { type Project, plural, serializeProject, stepKey } from '@loopweft/model';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  List,
  NumberInput,
  Progress,
  Radio,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import { chooseSaveTarget, type FileKind } from '../state/files.ts';
import type { Engine } from './engine.ts';

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

const minutes = (seconds: number) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const MP4_FILE: FileKind = { description: 'MP4 video', type: 'video/mp4', extension: '.mp4' };
export const WEBM_FILE: FileKind = { description: 'WebM video', type: 'video/webm', extension: '.webm' };
export const GIF_FILE: FileKind = { description: 'GIF animation', type: 'image/gif', extension: '.gif' };

const FILE_KINDS = { mp4: MP4_FILE, webm: WEBM_FILE, gif: GIF_FILE } as const;

type What = 'story' | 'scene' | 'steps';

/**
 * Puts a video's final head over its first bytes, wherever they fell among the pieces: the encoder may hand
 * its first frame (and so the head) in after the first step's piece.
 */
export function withHead(parts: Uint8Array[], head: Uint8Array): Uint8Array[] {
  let at = 0;
  for (const part of parts) {
    if (at >= head.length) break;
    const n = Math.min(part.length, head.length - at);
    part.set(head.subarray(at, at + n), 0);
    at += n;
  }
  if (at < head.length) throw new Error('The video did not arrive whole.');
  return parts;
}

function stepOptions(project: Project): { value: string; label: string }[] {
  return project.story.scenes.flatMap((scene) =>
    scene.steps.map((step) => {
      const key = stepKey(scene.id, step.id);
      return { value: key, label: `${key} · ${step.label}` };
    }),
  );
}

function sceneOptions(project: Project): { value: string; label: string }[] {
  return project.story.scenes
    .filter((scene) => scene.steps.length > 0)
    .map((scene) => ({ value: scene.id, label: `${scene.id} · ${scene.title}` }));
}

export interface VideoCardProps {
  /** The engine, started the first time it is needed and kept while the workspace is open. */
  engine: () => Promise<Engine>;
  /** Which formats this browser can encode (its own page asks: the export page is the same browser). */
  support?: () => Promise<Record<VideoFormat, boolean>>;
}

interface Made {
  name: string;
  end: VideoEndEvent;
}

interface Playing {
  done: number;
  total: number;
  key?: string;
  seconds: number;
}

export function VideoCard({ engine, support: ask = videoSupport }: VideoCardProps) {
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const steps = useMemo(() => stepOptions(project), [project]);
  const scenes = useMemo(() => sceneOptions(project), [project]);
  const [format, setFormat] = useState<VideoFormat>('mp4');
  const [what, setWhat] = useState<What>('story');
  const [scene, setScene] = useState<string | null>(scenes[0]?.value ?? null);
  const [from, setFrom] = useState<string | null>(steps[0]?.value ?? null);
  const [to, setTo] = useState<string | null>(steps.at(-1)?.value ?? null);
  const [talk, setTalk] = useState(false);
  const [hold, setHold] = useState<number>(HOLD_DEFAULT);
  const [height, setHeight] = useState<'1080' | '720'>('1080');
  const [fps, setFps] = useState<'30' | '60'>('30');
  const [categoryWords, setCategoryWords] = useState(false);
  const [support, setSupport] = useState<Record<VideoFormat, boolean> | null>(null);
  const [progress, setProgress] = useState<Playing | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  // What this browser can encode, asked once.
  useEffect(() => {
    let live = true;
    ask().then(
      (s) => {
        if (!live) return;
        setSupport(s);
        if (!s.mp4) setFormat(s.webm ? 'webm' : 'gif');
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [ask]);

  const pick = (value: string | null, options: { value: string }[], fallback?: string) =>
    value && options.some((o) => o.value === value) ? value : (fallback ?? null);
  const chosenScene = pick(scene, scenes, scenes[0]?.value);
  const chosenFrom = pick(from, steps, steps[0]?.value);
  const chosenTo = pick(to, steps, steps.at(-1)?.value);
  const stem = fileStem(project.meta.title);
  const noSteps = steps.length === 0;
  const gif = format === 'gif';
  /** No MP4 or WebM from this browser (a GIF is always possible). */
  const noVideo = support !== null && !support.mp4 && !support.webm;
  // A GIF is of a scene or some steps, never the whole story.
  const playing: What = gif && what === 'story' ? 'scene' : what;

  const target = (): VideoTarget =>
    playing === 'scene'
      ? { kind: 'scene', scene: chosenScene as string }
      : playing === 'steps'
        ? { kind: 'steps', from: chosenFrom as string, to: chosenTo as string }
        : { kind: 'story' };

  const run = async () => {
    const now = store.getState().project;
    const job: VideoJob = {
      format,
      target: target(),
      timing: talk ? { kind: 'talk' } : { kind: 'hold', seconds: hold },
      height: gif ? GIF_HEIGHT : height === '720' ? 720 : 1080,
      fps: gif ? GIF_RATE : fps === '60' ? 60 : 30,
      categoryWords,
    };
    let name: string;
    try {
      name = `${stem}-${videoPlan(now, job).name}`;
    } catch (error) {
      setFailure(String((error as Error).message ?? error));
      return;
    }
    // Where to save is asked first, in the click itself (see chooseSaveTarget).
    const asking = chooseSaveTarget(name, FILE_KINDS[format]);
    setFailure(null);
    setProgress({ done: 0, total: 0, seconds: 0 });
    let stopped = false;
    let running: { engine: Engine; id: string } | null = null;
    cancel.current = () => {
      stopped = true;
      if (running) void running.engine.cancel(running.id);
    };
    try {
      const saved = await asking;
      if (!saved || stopped) return;
      const player = await engine();
      await player.open(serializeProject(now));
      const id = await player.start(job);
      running = { engine: player, id };
      const parts: Uint8Array[] = [];
      let end: VideoEndEvent | null = null;
      for (;;) {
        if (stopped) return;
        const event = await player.next(id);
        if (!event) break;
        if (event.type === 'data') {
          parts.push(event.bytes);
          setProgress({ done: event.done, total: event.total, key: event.key, seconds: event.seconds });
        } else if (event.type === 'video') end = event;
      }
      if (stopped) return;
      if (!end) throw new Error('The video did not arrive whole.');
      const file = new Blob(withHead(parts, end.head) as BlobPart[], { type: FILE_KINDS[format].type });
      if (file.size !== end.size) throw new Error('The video did not arrive whole.');
      await saved.write(file);
      setMade({ name: saved.name, end });
      notifications.show({
        title: saved.how === 'file' ? 'Exported' : 'Downloaded',
        message:
          saved.how === 'file'
            ? `Saved ${saved.name} (${megabytes(end.size)}).`
            : `${saved.name} (${megabytes(end.size)}) is in your downloads.`,
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
          Video (MP4, WebM or GIF)
        </Title>
        <Text size="sm">
          The story as the talk plays it, with its full motion, frame by frame. Made by this browser; no
          sound. A long story takes a few minutes.
        </Text>
        <Radio.Group
          label="Format"
          value={format}
          onChange={(v) => setFormat(v as VideoFormat)}
          name="video-format"
        >
          <Stack gap={6} mt={4}>
            <Radio
              value="mp4"
              label="MP4 (H.264): plays everywhere"
              description={
                support && !support.mp4
                  ? 'This browser cannot make MP4: use WebM, or Chrome or Edge.'
                  : 'For PowerPoint, Keynote, video players and the web.'
              }
              disabled={busy || (support !== null && !support.mp4)}
            />
            <Radio
              value="webm"
              label="WebM (VP9)"
              description="Plays in browsers, VLC and most players; for when MP4 cannot be made."
              disabled={busy || (support !== null && !support.webm)}
            />
            <Radio
              value="gif"
              label="GIF: a short loop that shows wherever an image does"
              description="A scene or some steps, 960 × 540 at 15 frames a second, 256 colours a frame: for chats, web pages and slides."
              disabled={busy}
            />
          </Stack>
        </Radio.Group>
        <Radio.Group
          label="What to play"
          value={playing}
          onChange={(v) => setWhat(v as What)}
          name="video-what"
        >
          <Stack gap={6} mt={4}>
            <Radio
              value="story"
              label={`The whole story (${plural(steps.length, 'step')})`}
              description={gif ? 'Not as a GIF: it would be far too large to share.' : undefined}
              disabled={busy || noSteps || gif}
            />
            <Radio value="scene" label="One scene" disabled={busy || noSteps} />
            <Radio value="steps" label="Steps, from one to another" disabled={busy || noSteps} />
          </Stack>
        </Radio.Group>
        {playing === 'scene' && (
          <Select
            label="Scene"
            data={scenes}
            value={chosenScene}
            onChange={(v) => v && setScene(v)}
            allowDeselect={false}
            disabled={busy}
          />
        )}
        {playing === 'steps' && (
          <Group grow align="flex-start">
            <Select
              label="From"
              data={steps}
              value={chosenFrom}
              onChange={(v) => v && setFrom(v)}
              searchable
              allowDeselect={false}
              disabled={busy}
            />
            <Select
              label="To"
              data={steps}
              value={chosenTo}
              onChange={(v) => v && setTo(v)}
              searchable
              allowDeselect={false}
              disabled={busy}
            />
          </Group>
        )}
        <Radio.Group
          label="Timing"
          value={talk ? 'talk' : 'hold'}
          onChange={(v) => setTalk(v === 'talk')}
          name="video-timing"
        >
          <Stack gap={6} mt={4}>
            <Radio
              value="hold"
              label="Each step's motion, then a hold"
              description="The step held, its pulses wandering, before the next one."
              disabled={busy}
            />
            <Radio
              value="talk"
              label="The talk's own timing"
              description="Each step until the next is due, as the Story workspace's Play does; a scene's last step until its target length."
              disabled={busy}
            />
          </Stack>
        </Radio.Group>
        {!talk && (
          <NumberInput
            label="Hold (seconds)"
            value={hold}
            onChange={(v) => setHold(typeof v === 'number' ? v : Number(v) || 0)}
            min={0}
            max={HOLD_MAX}
            step={0.5}
            decimalScale={2}
            clampBehavior="strict"
            w={160}
            disabled={busy}
          />
        )}
        {!gif && (
          <Group gap="xl" align="flex-start">
            <Radio.Group
              label="Size"
              value={height}
              onChange={(v) => setHeight(v as '1080' | '720')}
              name="video-size"
            >
              <Group gap="lg" mt={4}>
                <Radio value="1080" label="1920 × 1080" disabled={busy} />
                <Radio value="720" label="1280 × 720" disabled={busy} />
              </Group>
            </Radio.Group>
            <Radio.Group
              label="Frames a second"
              value={fps}
              onChange={(v) => setFps(v as '30' | '60')}
              name="video-fps"
            >
              <Group gap="lg" mt={4}>
                {FRAME_RATES.map((rate) => (
                  <Radio key={rate} value={String(rate)} label={String(rate)} disabled={busy} />
                ))}
              </Group>
            </Radio.Group>
          </Group>
        )}
        <Checkbox
          checked={categoryWords}
          onChange={(e) => setCategoryWords(e.currentTarget.checked)}
          label="Name categories in words"
          description="Each shown variable's category written under its label, as the C key shows it."
          disabled={busy}
        />
        <Group>
          <Button
            onClick={() => void run()}
            loading={busy && progress?.done === 0}
            disabled={busy || noSteps || (noVideo && !gif)}
          >
            {format === 'mp4' ? 'Export MP4…' : gif ? 'Export GIF…' : 'Export WebM…'}
          </Button>
          {busy && (
            <Button variant="default" onClick={() => cancel.current?.()}>
              Cancel
            </Button>
          )}
        </Group>
        {noSteps && (
          <Text size="sm" c="dimmed">
            The story has no steps yet, so there is nothing to play.
          </Text>
        )}
        {noVideo && (
          <Alert color="yellow" title="No MP4 or WebM from this browser">
            This browser cannot encode video, though it can make a GIF. Chrome and Edge can, as can `loopweft
            export --mp4`.
          </Alert>
        )}
        {busy && progress && progress.total > 0 && (
          <Stack gap={4}>
            <Progress value={(progress.done / progress.total) * 100} aria-label="Playing the video" />
            <Text size="sm" c="dimmed" aria-live="polite">
              Played {progress.done} of {plural(progress.total, 'step')}
              {progress.key ? ` (last: ${progress.key})` : ''}: {minutes(progress.seconds)} of video so far.
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
              Last export: {made.name}, {minutes(made.end.seconds)} at {made.end.width} × {made.end.height},{' '}
              {made.end.fps} frames a second, {megabytes(made.end.size)}.
            </Text>
            {made.end.warnings.length > 0 && (
              <Alert color="yellow" title="Before you share it">
                <List size="sm">
                  {made.end.warnings.map((warning) => (
                    <List.Item key={warning}>{warning}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            {made.end.notes.length > 0 && (
              <Alert color="blue" title="To know about this video">
                <List size="sm">
                  {made.end.notes.map((note) => (
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
