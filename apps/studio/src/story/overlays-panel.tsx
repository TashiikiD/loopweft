// A step's overlays: what is drawn over the map, in list order (later ones on top). Add a caption, title
// page, statement, cards, legend or image (a new one asks first for what it cannot do without: a title, a
// line, a card, an image and its description); change each field; move, copy to the following steps of the
// scene, or remove. Every change is one of the model's overlay operations, one undoable step.
import {
  addAsset,
  addOverlay,
  assetUses,
  CARD_ICONS,
  type Citation,
  imageDataUri,
  moveOverlay,
  OpError,
  type OpOutput,
  OVERLAY_NAMES,
  type Overlay,
  PLACES,
  type Project,
  removeAsset,
  removeOverlay,
  type Step,
  setAsset,
  setOverlay,
} from '@loopweft/model';
import {
  ActionIcon,
  Button,
  Checkbox,
  FileButton,
  Group,
  Image,
  Menu,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconCopy, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { refused, useEdit, useStudio, useStudioStore } from '../context.tsx';
import { CommitText } from '../map/inputs.tsx';
import { STRENGTHS, type Strength, sourceChoices } from '../sources/citations.tsx';

type Kind = Overlay['type'];
type Edit = ReturnType<typeof useEdit>;

const STYLES = [
  { value: '', label: 'Plain' },
  { value: 'hero', label: 'Hero' },
  { value: 'question', label: 'Question' },
  { value: 'closing', label: 'Closing' },
  { value: 'title', label: 'Title' },
  { value: 'note', label: 'Note' },
];

const placeOptions = (usual: string) => [
  { value: '', label: `Usual place (${usual})` },
  ...PLACES.map((p) => ({ value: p, label: p })),
];

const USUAL_PLACE: Partial<Record<Kind, string>> = {
  statement: 'center',
  cards: 'left',
  legend: 'bottom-left',
  image: 'center',
};

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Lines typed one per line, without blank ones. */
const linesOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

/** Reads an image file into a data URI, refusing what is not an image. */
async function readImage(file: File): Promise<string> {
  return imageDataUri(new Uint8Array(await file.arrayBuffer()), file.name);
}

function Citations({
  citations,
  onChange,
}: {
  citations: readonly Citation[];
  onChange(next: Citation[] | null): void;
}) {
  const project = useStudio((s) => s.project);
  const [source, setSource] = useState<string | null>(null);
  const [pages, setPages] = useState('');
  // The same source at the same pages is cited once, as the model's own citation operations keep it.
  const cited = (c: Citation, except = -1) =>
    citations.some((o, k) => k !== except && o.source === c.source && o.pages === c.pages);
  const change = (i: number, changes: Partial<Record<keyof Citation, string | null>>) => {
    const next: Record<string, unknown> = { ...citations[i] };
    for (const [field, value] of Object.entries(changes)) {
      if (value === null) delete next[field];
      else next[field] = value;
    }
    const citation = next as Citation;
    if (cited(citation, i)) {
      refused(new OpError(`It already cites ${citation.source} at those pages.`, 'conflict'));
      return;
    }
    onChange(citations.map((c, k) => (k === i ? citation : c)));
  };
  if (project.sources.length === 0) {
    return (
      <Text size="xs" c="dimmed">
        Cites: none. Add sources in the Sources workspace to cite them here.
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      <Text size="xs" fw={500}>
        Cites
      </Text>
      {citations.length === 0 && (
        <Text size="xs" c="dimmed">
          None
        </Text>
      )}
      {citations.map((c, i) => {
        const who = `${project.sources.find((s) => s.id === c.source)?.label ?? c.source}${c.pages ? `, p. ${c.pages}` : ''}`;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: citations are positional
          <Paper key={i} withBorder p={6} radius="sm" role="group" aria-label={`Citation of ${who}`}>
            <Stack gap={4}>
              <Group gap={4} wrap="nowrap">
                <Text size="xs" fw={500} style={{ flex: 1 }}>
                  {who}
                </Text>
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  aria-label={`Remove the citation of ${c.source}${c.pages ? ` p. ${c.pages}` : ''}`}
                  onClick={() => {
                    const next = citations.filter((_, k) => k !== i);
                    onChange(next.length ? next : null);
                  }}
                >
                  <IconX size={12} aria-hidden />
                </ActionIcon>
              </Group>
              <Group gap={4} grow align="flex-start">
                <CommitText
                  label="Pages"
                  ariaLabel={`Pages: ${who}`}
                  placeholder="e.g. 11–12"
                  value={c.pages ?? ''}
                  onCommit={(next) => change(i, { pages: next })}
                />
                <CommitText
                  label="Note"
                  ariaLabel={`Note: ${who}`}
                  placeholder="e.g. Fig. 6c"
                  value={c.note ?? ''}
                  onCommit={(next) => change(i, { note: next })}
                />
              </Group>
              <SegmentedControl
                size="xs"
                value={c.strength ?? ''}
                data={STRENGTHS}
                onChange={(value) => change(i, { strength: value ? (value as Strength) : null })}
                aria-label={`Strength of the evidence: ${who}`}
              />
            </Stack>
          </Paper>
        );
      })}
      <Group gap={4} align="flex-end" wrap="nowrap">
        <Select
          label="Source to cite"
          placeholder="Search"
          size="xs"
          searchable
          data={sourceChoices(project)}
          value={source}
          onChange={setSource}
          style={{ flex: 1 }}
          comboboxProps={{ withinPortal: true }}
        />
        <TextInput
          label="Pages to cite"
          size="xs"
          w={90}
          value={pages}
          onChange={(e) => setPages(e.currentTarget.value)}
        />
        <Button
          size="xs"
          disabled={!source}
          onClick={() => {
            if (!source) return;
            const next: Citation = { source, ...(pages.trim() ? { pages: pages.trim() } : {}) };
            if (!cited(next)) onChange([...citations, next]);
            setSource(null);
            setPages('');
          }}
        >
          Cite
        </Button>
      </Group>
    </Stack>
  );
}

/** The fields of one overlay. */
function Fields({
  stepKey,
  index,
  overlay,
  edit,
}: {
  stepKey: string;
  index: number;
  overlay: Overlay;
  edit: Edit;
}) {
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const set = (changes: Record<string, unknown>) => edit((p) => setOverlay(p, stepKey, index, changes));
  // Every overlay but the caption and the title page has a place and citations, set or not.
  const placed = overlay.type !== 'caption' && overlay.type !== 'title';
  const place = placed && (
    <Select
      label="Place"
      size="xs"
      data={placeOptions(USUAL_PLACE[overlay.type] ?? 'center')}
      value={overlay.place ?? ''}
      allowDeselect={false}
      onChange={(next) => set({ place: next ? next : null })}
      comboboxProps={{ withinPortal: true }}
    />
  );
  const cites = placed && (
    <Citations citations={overlay.citations ?? []} onChange={(next) => set({ citations: next })} />
  );
  switch (overlay.type) {
    case 'caption':
      return (
        <Text size="xs" c="dimmed">
          The scene’s caption band: its title and headline (change them in the Scene panel).
        </Text>
      );
    case 'title':
      return (
        <Stack gap="xs">
          <CommitText
            label="Title"
            value={overlay.title}
            required
            onCommit={(next) => next && set({ title: next })}
          />
          <CommitText
            label="Subtitle"
            value={overlay.subtitle ?? ''}
            onCommit={(next) => set({ subtitle: next })}
          />
          <CommitText
            label="Further lines (one per line)"
            value={(overlay.lines ?? []).join('\n')}
            multiline
            onCommit={(next) => {
              const lines = linesOf(next ?? '');
              set({ lines: lines.length ? lines : null });
            }}
          />
        </Stack>
      );
    case 'statement':
      return (
        <Stack gap="xs">
          <CommitText
            label="Lines (one per line)"
            value={overlay.lines.join('\n')}
            multiline
            required
            onCommit={(next) => {
              const lines = linesOf(next ?? '');
              if (lines.length) set({ lines });
            }}
          />
          <CommitText
            label="Kicker"
            description="A small line above, e.g. INTERVENTION A"
            value={overlay.kicker ?? ''}
            onCommit={(next) => set({ kicker: next })}
          />
          <Group grow gap="xs">
            <Select
              label="Style"
              size="xs"
              data={STYLES}
              value={overlay.style ?? ''}
              allowDeselect={false}
              onChange={(next) => set({ style: next ? next : null })}
              comboboxProps={{ withinPortal: true }}
            />
            {place}
          </Group>
          {cites}
        </Stack>
      );
    case 'cards':
      return (
        <Stack gap="xs">
          <CommitText label="Heading" value={overlay.title ?? ''} onCommit={(next) => set({ title: next })} />
          {overlay.items.map((item, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: cards are positional
            <Paper key={k} withBorder p={6} radius="sm">
              <Stack gap={4}>
                <Group gap={4} wrap="nowrap">
                  <Checkbox
                    size="xs"
                    label={`Card ${k + 1} highlighted`}
                    checked={overlay.active?.includes(k) ?? false}
                    onChange={(e) => {
                      const active = new Set(overlay.active ?? []);
                      if (e.currentTarget.checked) active.add(k);
                      else active.delete(k);
                      const list = [...active].sort((a, b) => a - b);
                      set({ active: list.length ? list : null });
                    }}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    variant="subtle"
                    size="xs"
                    disabled={overlay.items.length === 1}
                    aria-label={`Remove card ${k + 1}`}
                    onClick={() => {
                      const items = overlay.items.filter((_, i) => i !== k);
                      const active = (overlay.active ?? [])
                        .filter((i) => i !== k)
                        .map((i) => (i > k ? i - 1 : i));
                      set({ items, active: active.length ? active : null });
                    }}
                  >
                    <IconX size={12} aria-hidden />
                  </ActionIcon>
                </Group>
                <CommitText
                  label={`Card ${k + 1} title`}
                  value={item.title}
                  required
                  onCommit={(next) =>
                    next &&
                    set({ items: overlay.items.map((it, i) => (i === k ? { ...it, title: next } : it)) })
                  }
                />
                <CommitText
                  label={`Card ${k + 1} line below`}
                  value={item.sub ?? ''}
                  onCommit={(next) =>
                    set({
                      items: overlay.items.map((it, i) => {
                        if (i !== k) return it;
                        const { sub: _, ...rest } = it;
                        return next ? { ...rest, sub: next } : rest;
                      }),
                    })
                  }
                />
                <Select
                  label={`Card ${k + 1} icon`}
                  size="xs"
                  data={[
                    { value: '', label: 'Its number' },
                    ...CARD_ICONS.map((i) => ({ value: i, label: i })),
                  ]}
                  value={item.icon ?? ''}
                  allowDeselect={false}
                  onChange={(next) =>
                    set({
                      items: overlay.items.map((it, i) => {
                        if (i !== k) return it;
                        const { icon: _, ...rest } = it;
                        return next ? { ...rest, icon: next } : rest;
                      }),
                    })
                  }
                  comboboxProps={{ withinPortal: true }}
                />
              </Stack>
            </Paper>
          ))}
          <AddCard onAdd={(title) => set({ items: [...overlay.items, { title }] })} />
          {place}
          {cites}
        </Stack>
      );
    case 'legend':
      return (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            The project’s roles and link styles.
          </Text>
          {place}
          {cites}
        </Stack>
      );
    case 'image': {
      const data = project.assets[overlay.asset];
      const uses = assetUses(project, overlay.asset).length;
      return (
        <Stack gap="xs">
          {data && <Image src={data} alt={overlay.alt} radius="sm" mah={160} fit="contain" />}
          <Group gap="xs">
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>
              Image {overlay.asset}
              {uses > 1 ? `, also shown on ${uses - 1} other ${uses === 2 ? 'step' : 'steps'}` : ''}
            </Text>
            <FileButton
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              onChange={(file) => {
                if (!file) return;
                // A project opened while the file is read is not the one it was chosen for: nothing changes.
                const generation = store.getState().generation;
                readImage(file).then(
                  (uri) => {
                    if (store.getState().generation === generation)
                      edit((p) => setAsset(p, overlay.asset, uri));
                  },
                  (error) => refused(error, 'Not an image'),
                );
              }}
            >
              {(props) => (
                <Button
                  size="compact-xs"
                  variant="default"
                  {...props}
                  onClick={() => {
                    // The image is the same one on every step that shows it: replacing it here replaces it there.
                    if (
                      uses > 1 &&
                      !window.confirm(`Replace image ${overlay.asset} on all ${uses} steps that show it?`)
                    )
                      return;
                    props.onClick();
                  }}
                >
                  {uses > 1 ? `Replace the image on all ${uses} steps…` : 'Replace the image…'}
                </Button>
              )}
            </FileButton>
          </Group>
          <CommitText
            label="Description (alt text)"
            description="What the image shows, for people who cannot see it"
            value={overlay.alt}
            required
            onCommit={(next) => next && set({ alt: next })}
          />
          <CommitText
            label="Caption"
            value={overlay.caption ?? ''}
            onCommit={(next) => set({ caption: next })}
          />
          <CommitText
            label="Credit"
            value={overlay.credit ?? ''}
            onCommit={(next) => set({ credit: next })}
          />
          {place}
          {cites}
        </Stack>
      );
    }
  }
}

function AddCard({ onAdd }: { onAdd(title: string): void }) {
  const [title, setTitle] = useState('');
  return (
    <Group gap={4} wrap="nowrap" align="flex-end">
      <TextInput
        aria-label="New card's title"
        placeholder="Another card's title"
        size="xs"
        value={title}
        style={{ flex: 1 }}
        onChange={(e) => setTitle(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && title.trim()) {
            onAdd(title.trim());
            setTitle('');
          }
        }}
      />
      <Button
        size="xs"
        variant="default"
        disabled={!title.trim()}
        onClick={() => {
          onAdd(title.trim());
          setTitle('');
        }}
      >
        Add card
      </Button>
    </Group>
  );
}

/** What a new overlay of each kind cannot do without, asked for before it is added. */
function NewOverlay({ kind, stepKey, onDone }: { kind: Kind; stepKey: string; onDone(): void }) {
  const store = useStudioStore();
  const edit = useEdit();
  const [text, setText] = useState('');
  const [alt, setAlt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  // Set when the form is cancelled or closes: an image still being read is then not added. (Cleared on every
  // mount, as React may mount a component twice in development.)
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);
  const add = async () => {
    if (kind === 'image') {
      if (!file || !alt.trim()) return;
      const generation = store.getState().generation;
      let data: string;
      try {
        data = await readImage(file);
      } catch (error) {
        refused(error, 'Not an image');
        return;
      }
      if (cancelled.current || store.getState().generation !== generation) return;
      // The image and the overlay that shows it: one undoable step.
      try {
        const asset = addAsset(store.getState().project, { data, name: file.name });
        const id = asset.result.id;
        store
          .getState()
          .editAll(
            [
              (p) => addAsset(p, { data, id }),
              (p) => addOverlay(p, stepKey, { type: 'image', asset: id, alt: alt.trim() }),
            ],
            `Step ${stepKey}: added an image (${id}).`,
          );
        onDone();
      } catch (error) {
        refused(error);
      }
      return;
    }
    const overlay =
      kind === 'title'
        ? { type: 'title', title: text.trim() }
        : kind === 'statement'
          ? { type: 'statement', lines: linesOf(text) }
          : { type: 'cards', items: [{ title: text.trim() }] };
    if (edit((p) => addOverlay(p, stepKey, overlay))) onDone();
  };
  const ready =
    kind === 'image'
      ? !!file && !!alt.trim()
      : kind === 'statement'
        ? linesOf(text).length > 0
        : !!text.trim();
  return (
    <Paper withBorder p="xs" radius="sm">
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          New {OVERLAY_NAMES[kind]}
        </Text>
        {kind === 'title' && (
          <TextInput
            label="Title"
            size="xs"
            value={text}
            autoFocus
            onChange={(e) => setText(e.currentTarget.value)}
          />
        )}
        {kind === 'statement' && (
          <Textarea
            label="Lines (one per line)"
            size="xs"
            autosize
            minRows={2}
            value={text}
            autoFocus
            onChange={(e) => setText(e.currentTarget.value)}
          />
        )}
        {kind === 'cards' && (
          <TextInput
            label="First card's title"
            size="xs"
            value={text}
            autoFocus
            onChange={(e) => setText(e.currentTarget.value)}
          />
        )}
        {kind === 'image' && (
          <>
            <FileButton accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={setFile}>
              {(props) => (
                <Button size="compact-xs" variant="default" {...props}>
                  {file ? `Image: ${file.name}` : 'Choose an image…'}
                </Button>
              )}
            </FileButton>
            <TextInput
              label="Description (alt text)"
              description="What the image shows, for people who cannot see it"
              size="xs"
              value={alt}
              onChange={(e) => setAlt(e.currentTarget.value)}
            />
          </>
        )}
        <Group gap="xs">
          <Button size="compact-xs" disabled={!ready} onClick={() => void add()}>
            Add
          </Button>
          <Button
            size="compact-xs"
            variant="default"
            onClick={() => {
              cancelled.current = true;
              onDone();
            }}
          >
            Cancel
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

/** A change the panel makes to the order of a step's overlays: one removed, or one moved. */
type Reorder = { remove: number } | { move: [from: number, to: number] };

function reorder<T>(list: readonly T[], change: Reorder): T[] {
  const next = [...list];
  if ('remove' in change) next.splice(change.remove, 1);
  else next.splice(change.move[1], 0, ...next.splice(change.move[0], 1));
  return next;
}

/**
 * A key for each overlay that follows it when overlays move, so what is being typed in one (a new card, a
 * citation being chosen) stays with that overlay. A removal or move the panel makes is told with it (`tell`),
 * so keys follow it exactly, even among overlays that are alike. A list of overlays drawn before, brought back as
 * it was by an undo or a redo (the very same list), gets back the keys it had then. Otherwise they follow the
 * content: an overlay keeps its key while it is
 * unchanged, in its place or wherever it goes, and one changed in place keeps the key of its place. Keys start
 * again on another step.
 */
function useOverlayKeys(stepKey: string, overlays: readonly Overlay[]) {
  const store = useStudioStore();
  const memory = useRef({
    stepKey,
    prints: [] as string[],
    types: [] as string[],
    keys: [] as string[],
    next: 0,
    expected: null as Reorder | null,
    /** The keys each list of overlays had when drawn: an undo or redo brings back the same list. */
    seen: new WeakMap<readonly Overlay[], string[]>(),
  });
  const m = memory.current;
  if (m.stepKey !== stepKey)
    Object.assign(m, { stepKey, prints: [], types: [], keys: [], expected: null, seen: new WeakMap() });
  const prints = overlays.map((o) => JSON.stringify(o));
  /** Runs the edit that makes `change`; a change refused, or that changes nothing, is forgotten at once. */
  const tell = (change: Reorder, run: () => unknown) => {
    const was = store.getState().project;
    m.expected = change;
    run();
    if (store.getState().project === was) m.expected = null;
  };
  // The change told, if it is what happened: the overlays as they were, reordered, are the overlays now.
  let told = false;
  if (m.expected) {
    const was = reorder(m.prints, m.expected);
    if (was.length === prints.length && was.every((p, i) => p === prints[i])) {
      Object.assign(m, {
        prints: was,
        types: reorder(m.types, m.expected),
        keys: reorder(m.keys, m.expected),
      });
      told = true;
    }
    m.expected = null;
  }
  // Overlays as they were drawn before (an undo or a redo) get back the keys they had then.
  const before = told ? undefined : m.seen.get(overlays);
  if (before) {
    Object.assign(m, { prints, types: overlays.map((o) => o.type), keys: before });
    return { keys: before, tell };
  }
  // An overlay unchanged in its own place keeps its key first, so one changed to match it cannot take it; then
  // one unchanged from elsewhere (moved) takes the key it had there.
  const used = new Set<number>();
  const kept = prints.map((print, i): string | null => {
    if (m.prints[i] !== print) return null;
    used.add(i);
    return m.keys[i] as string;
  });
  prints.forEach((print, i) => {
    if (kept[i]) return;
    const k = m.prints.findIndex((p, j) => p === print && !used.has(j));
    if (k < 0) return;
    used.add(k);
    kept[i] = m.keys[k] as string;
  });
  const keys = kept.map((key, i) => {
    if (key) return key;
    if (i < m.keys.length && !used.has(i) && m.types[i] === overlays[i]?.type) {
      used.add(i);
      return m.keys[i] as string;
    }
    return `${stepKey}:${m.next++}`;
  });
  Object.assign(m, { prints, types: overlays.map((o) => o.type), keys });
  m.seen.set(overlays, keys);
  return { keys, tell };
}

/** Copies an overlay to every later step of its scene (a caption only where there is none yet), as one step. */
function copyForward(
  project: Project,
  stepKey: string,
  overlay: Overlay,
): ((p: Project) => OpOutput<unknown>)[] {
  const [sceneId, stepId] = [stepKey.slice(0, stepKey.indexOf('.')), stepKey.slice(stepKey.indexOf('.') + 1)];
  const scene = project.story.scenes.find((s) => s.id === sceneId);
  if (!scene) return [];
  const later = scene.steps.slice(scene.steps.findIndex((s) => s.id === stepId) + 1);
  return later
    .filter((s) => !(overlay.type === 'caption' && s.overlays.some((o) => o.type === 'caption')))
    .map((s) => (p: Project) => addOverlay(p, `${sceneId}.${s.id}`, structuredClone(overlay)));
}

export function OverlaysPanel({ stepKey, step }: { stepKey: string; step: Step }) {
  const store = useStudioStore();
  const edit = useEdit();
  const project = useStudio((s) => s.project);
  const [adding, setAdding] = useState<Kind | null>(null);
  const { keys, tell } = useOverlayKeys(stepKey, step.overlays);
  const hasCaption = step.overlays.some((o) => o.type === 'caption');
  const start = (kind: Kind) => {
    if (kind === 'caption' || kind === 'legend') edit((p) => addOverlay(p, stepKey, { type: kind }));
    else setAdding(kind);
  };
  return (
    <div className="lw-panel-body">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text size="sm" fw={600}>
            Overlays on step {stepKey}
          </Text>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button size="compact-xs" leftSection={<IconPlus size={12} aria-hidden />}>
                Add
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item disabled={hasCaption} onClick={() => start('caption')}>
                Caption{hasCaption ? ' (shown)' : ''}
              </Menu.Item>
              <Menu.Item onClick={() => start('title')}>Title page</Menu.Item>
              <Menu.Item onClick={() => start('statement')}>Statement</Menu.Item>
              <Menu.Item onClick={() => start('cards')}>Cards</Menu.Item>
              <Menu.Item onClick={() => start('legend')}>Legend</Menu.Item>
              <Menu.Item onClick={() => start('image')}>Image</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
        {adding && <NewOverlay kind={adding} stepKey={stepKey} onDone={() => setAdding(null)} />}
        {step.overlays.length === 0 && !adding && (
          <Text size="xs" c="dimmed">
            Nothing is drawn over the map on this step. Overlays draw in list order, later ones on top.
          </Text>
        )}
        {step.overlays.map((overlay, i) => (
          <Paper key={keys[i]} withBorder p="xs" radius="sm" className="lw-overlay-card">
            <Stack gap="xs">
              <Group gap={2} wrap="nowrap">
                <Text size="sm" fw={500} style={{ flex: 1 }}>
                  {i + 1}. {capital(OVERLAY_NAMES[overlay.type])}
                </Text>
                <Tooltip label="Move down (drawn under)">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    disabled={i === 0}
                    aria-label={`Move overlay ${i + 1} under`}
                    onClick={() =>
                      tell({ move: [i, i - 1] }, () => edit((p) => moveOverlay(p, stepKey, i, i - 1)))
                    }
                  >
                    <IconArrowUp size={14} aria-hidden />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Move up (drawn over)">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    disabled={i === step.overlays.length - 1}
                    aria-label={`Move overlay ${i + 1} over`}
                    onClick={() =>
                      tell({ move: [i, i + 1] }, () => edit((p) => moveOverlay(p, stepKey, i, i + 1)))
                    }
                  >
                    <IconArrowDown size={14} aria-hidden />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Copy to the following steps of this scene">
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    aria-label={`Copy overlay ${i + 1} to the following steps`}
                    onClick={() => {
                      const runs = copyForward(project, stepKey, overlay);
                      if (runs.length === 0) {
                        refused(
                          new OpError(`No later step of this scene needs it.`, 'usage'),
                          'Nothing to copy',
                        );
                        return;
                      }
                      try {
                        store
                          .getState()
                          .editAll(
                            runs,
                            `Copied the ${OVERLAY_NAMES[overlay.type]} of step ${stepKey} to ${runs.length} later steps.`,
                          );
                      } catch (error) {
                        refused(error);
                      }
                    }}
                  >
                    <IconCopy size={14} aria-hidden />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Remove">
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label={`Remove overlay ${i + 1}`}
                    onClick={() =>
                      // An image that nothing shows once the overlay is gone goes with it, in the same undoable
                      // step; counted after the removal, so another overlay of it on this step keeps it.
                      tell({ remove: i }, () =>
                        edit((p) => {
                          const removed = removeOverlay(p, stepKey, i);
                          if (overlay.type !== 'image' || assetUses(removed.project, overlay.asset).length)
                            return removed;
                          return {
                            ...removed,
                            project: removeAsset(removed.project, overlay.asset).project,
                            summary: `Step ${stepKey}: removed the image ${overlay.asset} and its overlay.`,
                          };
                        }),
                      )
                    }
                  >
                    <IconTrash size={14} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Fields stepKey={stepKey} index={i} overlay={overlay} edit={edit} />
            </Stack>
          </Paper>
        ))}
      </Stack>
    </div>
  );
}
