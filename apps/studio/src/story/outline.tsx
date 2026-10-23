// The story's outline: its scenes, each with its steps, in order. Choose a step to show and edit it; add,
// copy, move and remove scenes and steps from here. A new step starts as a copy of the one chosen (so a
// story builds up step by step), or as the whole map when it is the scene's first.
import {
  addScene,
  addStep,
  assetUses,
  copyStep,
  listing,
  moveScene,
  moveStep,
  type OpOutput,
  type Project,
  plural,
  removeAsset,
  removeScene,
  removeStep,
  type Scene,
  type Step,
  stepKey,
} from '@loopweft/model';
import { ActionIcon, Button, Group, Menu, Radio, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconDots, IconPlus, IconX } from '@tabler/icons-react';
import {
  createContext,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { refused, useEdit, useStudio, useStudioStore } from '../context.tsx';
import { useStoryWarnings } from './checks.tsx';
import { type Current, useCurrent } from './current.ts';

/** How many story warnings each step ("S05.3") or scene ("S05") has, worked out once for the outline. */
const Flags = createContext<ReadonlyMap<string, number>>(new Map());

function Flag({ at: key }: { at: string }) {
  const n = useContext(Flags).get(key) ?? 0;
  if (!n) return null;
  return (
    <Tooltip label={`${n} to look at (see Checks)`}>
      <span className="lw-outline-flag" role="img" aria-label={`${n} ${n === 1 ? 'warning' : 'warnings'}`}>
        ●
      </span>
    </Tooltip>
  );
}

/**
 * Moves keyboard focus, once the outline has drawn it, to the button of a scene or step just added ("S05",
 * "S05.3"), or else to `fallback` (the button that opened the form). A naming form closes when it is done, so
 * focus goes somewhere sensible instead of back to the page.
 */
const FocusAfter = createContext<(key: string, fallback: RefObject<HTMLElement | null>) => void>(() => {});

const seconds = (s: number) =>
  s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;

/** A short form that asks for one name, then adds what it names. */
function NameForm({
  label,
  placeholder,
  onAdd,
  onCancel,
  children,
}: {
  label: string;
  placeholder: string;
  onAdd(name: string): boolean;
  onCancel(): void;
  children?: React.ReactNode;
}) {
  const [name, setName] = useState('');
  const submit = () => {
    const text = name.trim();
    if (text && onAdd(text)) setName('');
  };
  return (
    <form
      className="lw-outline-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Stack gap={6}>
        <TextInput
          aria-label={label}
          placeholder={placeholder}
          size="xs"
          value={name}
          autoFocus
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancel();
          }}
        />
        {children}
        <Group gap={6}>
          <Button size="compact-xs" type="submit" disabled={!name.trim()}>
            Add
          </Button>
          <Button size="compact-xs" variant="default" onClick={onCancel}>
            Cancel
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/**
 * Removes steps (by `remove`) and, with them, the images no other step shows, as one undoable edit: removing
 * an image's last overlay does the same. Returns whether the steps were removed.
 */
function useRemoveWithImages() {
  const store = useStudioStore();
  const edit = useEdit();
  return (keys: readonly string[], remove: (p: Project) => OpOutput<unknown>): boolean => {
    const project = store.getState().project;
    const gone = new Set(keys);
    const shown = project.story.scenes.flatMap((scene) =>
      scene.steps
        .filter((step) => gone.has(stepKey(scene.id, step.id)))
        .flatMap((step) => step.overlays.flatMap((o) => (o.type === 'image' ? [o.asset] : []))),
    );
    const lone = [...new Set(shown)].filter((id) => assetUses(project, id).every((key) => gone.has(key)));
    if (lone.length === 0) return edit(remove) !== null;
    try {
      const { summary } = remove(project);
      store
        .getState()
        .editAll(
          [remove, ...lone.map((id) => (p: Project) => removeAsset(p, id))],
          `${summary.replace(/\.$/, '')}, with ${lone.length === 1 ? 'image' : 'images'} ${listing(lone)}, which no other step shows.`,
        );
      return true;
    } catch (error) {
      refused(error);
      return false;
    }
  };
}

function StepRow({
  scene,
  step,
  index,
  current,
}: {
  scene: Scene;
  step: Step;
  index: number;
  current: Current | null;
}) {
  const store = useStudioStore();
  const edit = useEdit();
  const removeWithImages = useRemoveWithImages();
  const key = `${scene.id}.${step.id}`;
  const chosen = current?.key === key;
  const [copying, setCopying] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const focusAfter = useContext(FocusAfter);
  const scenes = useStudio((s) => s.project.story.scenes);
  const sceneIndex = scenes.findIndex((s) => s.id === scene.id);
  const last = index === scene.steps.length - 1;
  const move = (direction: -1 | 1) => {
    // At the edge of a scene, a step moves into the scene beside it.
    const edge = direction === -1 ? index === 0 : last;
    const out = edge
      ? (() => {
          const other = scenes[sceneIndex + direction];
          if (!other) return null;
          return edit((p) =>
            moveStep(p, key, { scene: other.id, index: direction === -1 ? other.steps.length : 0 }),
          );
        })()
      : edit((p) => moveStep(p, key, { index: index + direction }));
    if (out) store.getState().selectStory(out.result.key);
  };
  return (
    <li>
      <div className={`lw-outline-step${chosen ? ' chosen' : ''}`}>
        <button
          type="button"
          className="lw-outline-pick"
          data-outline-key={key}
          aria-current={chosen ? 'step' : undefined}
          onClick={() => store.getState().selectStory(key)}
        >
          <span className="lw-outline-key">{key}</span>
          <span className="lw-outline-label">{step.label}</span>
        </button>
        <Flag at={key} />
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon ref={more} variant="subtle" color="gray" size="sm" aria-label={`Step ${key}: more`}>
              <IconDots size={14} aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => setCopying(true)}>Copy this step…</Menu.Item>
            <Menu.Item disabled={index === 0 && sceneIndex === 0} onClick={() => move(-1)}>
              Move up
            </Menu.Item>
            <Menu.Item disabled={last && sceneIndex === scenes.length - 1} onClick={() => move(1)}>
              Move down
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              onClick={() => {
                if (!window.confirm(`Remove step ${key} ("${step.label}")?`)) return;
                const neighbour = scene.steps[index + 1] ?? scene.steps[index - 1];
                if (removeWithImages([key], (p) => removeStep(p, key)))
                  store.getState().selectStory(neighbour ? `${scene.id}.${neighbour.id}` : scene.id);
              }}
            >
              Remove step
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
      {copying && (
        <NameForm
          label={`Label of the copy of ${key}`}
          placeholder="The copy's label"
          onCancel={() => {
            setCopying(false);
            more.current?.focus();
          }}
          onAdd={(label) => {
            const out = edit((p) => copyStep(p, key, { label }));
            if (!out) return false;
            store.getState().selectStory(out.result.key);
            focusAfter(out.result.key, more);
            setCopying(false);
            return true;
          }}
        />
      )}
    </li>
  );
}

function SceneBlock({ scene, index, current }: { scene: Scene; index: number; current: Current | null }) {
  const store = useStudioStore();
  const edit = useEdit();
  const removeWithImages = useRemoveWithImages();
  const count = useStudio((s) => s.project.story.scenes.length);
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusAfter = useContext(FocusAfter);
  const chosenStep = current?.sceneIndex === index ? current.step : null;
  const [start, setStart] = useState<'copy' | 'whole'>('copy');
  const chosen = current?.key === scene.id;
  return (
    <li className="lw-outline-scene">
      <div className={`lw-outline-scene-head${chosen ? ' chosen' : ''}`}>
        <button
          type="button"
          className="lw-outline-pick"
          data-outline-key={scene.id}
          aria-current={chosen ? 'true' : undefined}
          onClick={() => store.getState().selectStory(scene.id)}
        >
          <span className="lw-outline-title">
            {scene.title} <Flag at={scene.id} />
          </span>
          <span className="lw-outline-meta">
            {scene.id} · {plural(scene.steps.length, 'step')}
            {scene.targetSeconds !== undefined ? ` · ${seconds(scene.targetSeconds)}` : ''}
          </span>
        </button>
        <Tooltip label="Add a step">
          <ActionIcon
            ref={addButton}
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={`Add a step to scene ${scene.id}`}
            onClick={() => setAdding(true)}
          >
            <IconPlus size={14} aria-hidden />
          </ActionIcon>
        </Tooltip>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Scene ${scene.id}: more`}>
              <IconDots size={14} aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              disabled={index === 0}
              onClick={() => edit((p) => moveScene(p, scene.id, { index: index - 1 }))}
            >
              Move up
            </Menu.Item>
            <Menu.Item
              disabled={index === count - 1}
              onClick={() => edit((p) => moveScene(p, scene.id, { index: index + 1 }))}
            >
              Move down
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              onClick={() => {
                const steps = scene.steps.length;
                const question = steps
                  ? `Remove scene ${scene.id} ("${scene.title}") and its ${plural(steps, 'step')}?`
                  : `Remove scene ${scene.id} ("${scene.title}")?`;
                if (!window.confirm(question)) return;
                const keys = scene.steps.map((s) => stepKey(scene.id, s.id));
                if (removeWithImages(keys, (p) => removeScene(p, scene.id, { cascade: true })))
                  store.getState().selectStory(null);
              }}
            >
              Remove scene
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
      <ol className="lw-outline-steps" aria-label={`Steps of scene ${scene.id}`}>
        {scene.steps.map((step, i) => (
          <StepRow key={step.id} scene={scene} step={step} index={i} current={current} />
        ))}
      </ol>
      {adding && (
        <NameForm
          label={`Label of the new step in scene ${scene.id}`}
          placeholder="The new step's label"
          onCancel={() => {
            setAdding(false);
            addButton.current?.focus();
          }}
          onAdd={(label) => {
            const copyFrom = start === 'copy' ? (chosenStep ?? scene.steps.at(-1) ?? null) : null;
            const after = chosenStep ? { after: chosenStep.id } : undefined;
            const out = copyFrom
              ? edit((p) =>
                  copyStep(p, `${scene.id}.${copyFrom.id}`, {
                    label,
                    ...(after ?? { index: scene.steps.length }),
                  }),
                )
              : edit((p) => addStep(p, scene.id, { label, map: {} }, after));
            if (!out) return false;
            store.getState().selectStory(out.result.key);
            focusAfter(out.result.key, addButton);
            setAdding(false);
            return true;
          }}
        >
          {scene.steps.length > 0 && (
            <Radio.Group
              value={start}
              onChange={(v) => setStart(v as 'copy' | 'whole')}
              size="xs"
              label="Start from"
            >
              <Stack gap={4} mt={4}>
                <Radio
                  value="copy"
                  label={`A copy of ${chosenStep ? `${scene.id}.${chosenStep.id}` : 'the last step'}`}
                />
                <Radio value="whole" label="The whole map, plainly" />
              </Stack>
            </Radio.Group>
          )}
        </NameForm>
      )}
    </li>
  );
}

/** The outline; `over`: laid over the stage, in a narrow window, and closed by Escape (`onClose`). */
/**
 * The story's scenes and steps. In a narrow window it opens over the stage (`over`), shown while `open`: the
 * focus goes to its Close button as it opens, and Close, Escape or choosing a scene or step closes it.
 */
export function StoryOutline({
  id,
  over = false,
  open = true,
  onClose,
}: {
  id?: string;
  over?: boolean;
  open?: boolean;
  onClose?: () => void;
} = {}) {
  const store = useStudioStore();
  const edit = useEdit();
  const scenes = useStudio((s) => s.project.story.scenes);
  const current = useCurrent();
  const [adding, setAdding] = useState(false);
  const sceneButton = useRef<HTMLButtonElement>(null);
  const steps = scenes.reduce((n, s) => n + s.steps.length, 0);
  const warnings = useStoryWarnings();
  const flags = useMemo(
    () => new Map(warnings.flatMap((g) => (g.key ? [[g.key, g.issues.length] as const] : []))),
    [warnings],
  );
  const nav = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (over && open) closeButton.current?.focus();
  }, [over, open]);
  const pending = useRef<{ key: string; fallback: RefObject<HTMLElement | null> } | null>(null);
  const focusAfter = useCallback((key: string, fallback: RefObject<HTMLElement | null>) => {
    pending.current = { key, fallback };
  }, []);
  // After each drawing of the outline: focus waiting for a scene or step just added goes to it.
  useEffect(() => {
    const wanted = pending.current;
    if (!wanted) return;
    pending.current = null;
    const button = [...(nav.current?.querySelectorAll<HTMLElement>('[data-outline-key]') ?? [])].find(
      (b) => b.dataset.outlineKey === wanted.key,
    );
    (button ?? wanted.fallback.current)?.focus();
  });
  return (
    <Flags.Provider value={flags}>
      <FocusAfter.Provider value={focusAfter}>
        <nav
          ref={nav}
          id={id}
          hidden={!open}
          className={`lw-outline${over ? ' over' : ''}`}
          aria-label="Story outline"
          onKeyDown={(event) => {
            if (over && event.key === 'Escape' && !event.defaultPrevented) onClose?.();
          }}
          // Over the stage, choosing a scene or step (after its own handler has chosen it) closes the list.
          onClick={(event) => {
            if (over && (event.target as Element).closest('.lw-outline-pick')) onClose?.();
          }}
        >
          <div className="lw-outline-top">
            <Text size="sm" fw={600}>
              Story
            </Text>
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>
              {plural(scenes.length, 'scene')}, {plural(steps, 'step')}
            </Text>
            <Button
              ref={sceneButton}
              size="compact-xs"
              variant="light"
              leftSection={<IconPlus size={12} aria-hidden />}
              onClick={() => setAdding(true)}
            >
              Scene
            </Button>
            {over && (
              <Tooltip label="Close the scenes (Escape)">
                <ActionIcon
                  ref={closeButton}
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label="Close scenes"
                  onClick={onClose}
                >
                  <IconX size={14} aria-hidden />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
          <div className="lw-outline-body">
            {scenes.length === 0 && !adding && (
              <Text size="sm" c="dimmed" p="sm">
                No story yet. A story is a list of scenes, each a list of steps: one keypress each. Add a
                scene, then its steps, and set up what each step shows.
              </Text>
            )}
            <ol className="lw-outline-scenes">
              {scenes.map((scene, i) => (
                <SceneBlock key={scene.id} scene={scene} index={i} current={current} />
              ))}
            </ol>
            {adding && (
              <NameForm
                label="Title of the new scene"
                placeholder="The new scene's title"
                onCancel={() => {
                  setAdding(false);
                  sceneButton.current?.focus();
                }}
                onAdd={(title) => {
                  const after = current ? { after: current.scene.id } : undefined;
                  const out = edit((p) => addScene(p, { title }, after));
                  if (!out) return false;
                  store.getState().selectStory(out.result.id);
                  focusAfter(out.result.id, sceneButton);
                  setAdding(false);
                  return true;
                }}
              />
            )}
          </div>
        </nav>
      </FocusAfter.Provider>
    </Flags.Provider>
  );
}
