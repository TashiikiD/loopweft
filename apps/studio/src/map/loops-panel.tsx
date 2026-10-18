// The map's feedback loops, as `loopweft loops` lists them: the named ones (what the story shows and
// cites), and a search that finds every loop, reinforcing (R) or balancing (B) by its signs, to name. A loop
// through a link of unknown sign has unknown polarity (?).
import {
  addLoop,
  type FoundLoop,
  type Loop,
  type LoopStats,
  loopKey,
  loopPolarity,
  type Polarity,
  type Project,
  plural,
  removeLoop,
  setLoop,
  stepsMentioning,
} from '@loopweft/model';
import {
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type LoopAnswer, type LoopSearch, searchLoops } from '../analysis/loop-search.ts';
import { refused, useEdit, useStudio, useStudioStore } from '../context.tsx';
import { CommitText } from './inputs.tsx';

/** How many loops a search lists (all are counted). */
const LIST_LIMIT = 1000;
/** How many of them are drawn at a time. */
const PAGE = 50;

const POLARITY: Record<Polarity, { name: string; color: string }> = {
  R: { name: 'reinforcing', color: 'teal' },
  B: { name: 'balancing', color: 'orange' },
  '?': { name: 'of unknown polarity', color: 'gray' },
};

function PolarityBadge({ polarity }: { polarity: Polarity }) {
  return (
    <Badge
      size="sm"
      variant="light"
      color={POLARITY[polarity].color}
      title={POLARITY[polarity].name}
      style={{ flex: 'none' }}
    >
      {polarity}
    </Badge>
  );
}

/** The variables round a loop, by name: "A → B → C → A". */
function pathText(project: Project, links: readonly string[]): string {
  const byId = new Map(project.links.map((l) => [l.id, l]));
  const names = new Map(project.variables.map((v) => [v.id, v.label]));
  const stops = links.map((id) => byId.get(id)?.from ?? '?');
  return [...stops, stops[0] ?? '?'].map((id) => names.get(id) ?? id).join(' → ');
}

/** Shows a loop's variables and links as the selection, on the canvas and in the table. */
function useShowLoop() {
  const store = useStudioStore();
  return (links: readonly string[], loop: string | null) => {
    const project = store.getState().project;
    const ends = new Set(project.links.filter((l) => links.includes(l.id)).flatMap((l) => [l.from, l.to]));
    store.getState().select({ variables: [...ends], links: [...links], loop });
  };
}

function NamedLoop({ loop, open, onToggle }: { loop: Loop; open: boolean; onToggle(): void }) {
  const project = useStudio((s) => s.project);
  const edit = useEdit();
  const show = useShowLoop();
  const polarity = loopPolarity(project, loop) ?? '?';
  const remove = () => {
    const steps = stepsMentioning(project, {
      variables: new Set(),
      links: new Set(),
      loops: new Set([loop.id]),
    });
    if (
      steps.length &&
      !window.confirm(
        `Loop "${loop.name}" is shown by ${plural(steps.length, 'story step')}; removing it removes it from them too. Its links stay. Remove it?`,
      )
    )
      return;
    edit((p) => removeLoop(p, loop.id, { cascade: true }));
  };
  return (
    <Paper withBorder radius="sm" className="lw-type-row">
      <Group gap={6} wrap="nowrap" px={8} py={6}>
        <UnstyledButton
          onClick={() => {
            onToggle();
            show(loop.links, loop.id);
          }}
          aria-expanded={open}
          aria-label={`${loop.name}: ${open ? 'close' : 'show and edit'}`}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Group gap={8} wrap="nowrap">
            {open ? <IconChevronDown size={14} aria-hidden /> : <IconChevronRight size={14} aria-hidden />}
            <PolarityBadge polarity={polarity} />
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {loop.name}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {loop.id} · {plural(loop.links.length, 'link')}
                {loop.archetype ? ` · ${loop.archetype}` : ''}
              </Text>
            </div>
          </Group>
        </UnstyledButton>
      </Group>
      {open && (
        <div className="lw-type-editor">
          <Stack gap="xs">
            <Text size="xs" c="dimmed">
              {pathText(project, loop.links)}
            </Text>
            <CommitText
              label="Name"
              value={loop.name}
              required
              onCommit={(name) => name && edit((p) => setLoop(p, loop.id, { name }))}
            />
            <CommitText
              label="Archetype"
              value={loop.archetype ?? ''}
              placeholder="e.g. Fixes that fail"
              onCommit={(archetype) => edit((p) => setLoop(p, loop.id, { archetype }))}
            />
            <CommitText
              label="Description"
              value={loop.description ?? ''}
              multiline
              onCommit={(description) => edit((p) => setLoop(p, loop.id, { description }))}
            />
            <CommitText
              label="Caution"
              description="What the loop does not show, e.g. that it is a conceptual archetype, not measured."
              value={loop.caution ?? ''}
              multiline
              onCommit={(caution) => edit((p) => setLoop(p, loop.id, { caution }))}
            />
            <Button size="xs" variant="default" color="red" w="fit-content" onClick={remove}>
              Remove the name
            </Button>
          </Stack>
        </div>
      )}
    </Paper>
  );
}

/** A loop the search found: shown on a click, named with a name. */
function FoundRow({ found, named }: { found: FoundLoop; named: Loop | undefined }) {
  const project = useStudio((s) => s.project);
  const edit = useEdit();
  const show = useShowLoop();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const save = () => {
    if (!name.trim()) return;
    const out = edit((p) => addLoop(p, { name: name.trim(), links: found.links }));
    if (!out) return;
    notifications.show({ message: out.summary, autoClose: 5000 });
    setNaming(false);
    setName('');
    show(found.links, out.result.id);
  };
  return (
    <Paper withBorder radius="sm" px={8} py={6}>
      <Stack gap={4}>
        <Group gap={6} wrap="nowrap" align="flex-start">
          <PolarityBadge polarity={found.polarity} />
          <UnstyledButton
            style={{ flex: 1, minWidth: 0 }}
            onClick={() => show(found.links, named?.id ?? null)}
            aria-label={`Show the loop ${pathText(project, found.links)}`}
          >
            <Text size="xs" lineClamp={3}>
              {pathText(project, found.links)}
            </Text>
          </UnstyledButton>
          <Text size="xs" c="dimmed" style={{ flex: 'none' }}>
            {found.links.length}
          </Text>
        </Group>
        {named ? (
          <Text size="xs" c="dimmed">
            Named {named.id}: {named.name}
          </Text>
        ) : naming ? (
          <Group gap={6} wrap="nowrap">
            <TextInput
              size="xs"
              style={{ flex: 1 }}
              aria-label="Name of the loop"
              placeholder="Its name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') setNaming(false);
              }}
            />
            <Button size="compact-sm" onClick={save} disabled={!name.trim()}>
              Name it
            </Button>
          </Group>
        ) : (
          <Button size="compact-xs" variant="subtle" w="fit-content" onClick={() => setNaming(true)}>
            Name this loop
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

/** "1,234 loops: 600 reinforcing, 634 balancing", or a lower bound when counting stopped. */
function totals(stats: LoopStats, maxLength: number | undefined): string {
  const count = `${stats.capped ? 'At least ' : ''}${stats.count.toLocaleString('en')}`;
  const kinds = [
    `${stats.reinforcing.toLocaleString('en')} reinforcing`,
    `${stats.balancing.toLocaleString('en')} balancing`,
    ...(stats.unknown ? [`${stats.unknown.toLocaleString('en')} of unknown polarity`] : []),
  ];
  const length = maxLength ? ` of up to ${plural(maxLength, 'link')}` : '';
  return `${count} ${stats.count === 1 ? 'loop' : 'loops'}${length}: ${kinds.join(', ')}.${stats.capped ? ' Counting stopped there.' : ''}`;
}

function LoopFinder() {
  const project = useStudio((s) => s.project);
  const [maxLength, setMaxLength] = useState<number | string>('');
  const [includeOptional, setIncludeOptional] = useState(false);
  const [answer, setAnswer] = useState<{
    answer: LoopAnswer;
    maxLength: number | undefined;
    of: Project;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const search = useRef<LoopSearch | null>(null);
  useEffect(() => () => search.current?.stop(), []);

  const find = () => {
    search.current?.stop();
    const length = typeof maxLength === 'number' && maxLength >= 1 ? maxLength : undefined;
    const started = searchLoops({
      project,
      includeOptional,
      listLimit: LIST_LIMIT,
      ...(length !== undefined ? { maxLength: length } : {}),
    });
    search.current = started;
    setRunning(true);
    started.result
      .then((result) => {
        if (search.current !== started) return;
        setRunning(false);
        if (result) {
          setAnswer({ answer: result, maxLength: length, of: project });
          setShown(PAGE);
        }
      })
      .catch((error: unknown) => {
        setRunning(false);
        refused(error, 'The loops could not be found');
      });
  };

  const named = useMemo(() => new Map(project.loops.map((l) => [loopKey(l.links), l])), [project.loops]);
  // Shortest first: a search lists loops in the order it finds them.
  const listed = useMemo(
    () =>
      answer
        ? [...answer.answer.loops].sort(
            (a, b) => a.links.length - b.links.length || (loopKey(a.links) < loopKey(b.links) ? -1 : 1),
          )
        : [],
    [answer],
  );
  const stale = answer !== null && answer.of !== project;

  return (
    <Stack gap="xs">
      <Group gap="sm" align="flex-end" wrap="nowrap">
        <NumberInput
          size="xs"
          label="Up to how many links"
          placeholder="Any number"
          value={maxLength}
          min={1}
          step={1}
          allowDecimal={false}
          allowNegative={false}
          onChange={setMaxLength}
          style={{ flex: 1 }}
        />
        {running ? (
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              search.current?.stop();
              search.current = null;
              setRunning(false);
            }}
          >
            Stop
          </Button>
        ) : (
          <Button size="xs" onClick={find} disabled={project.links.length === 0}>
            Find loops
          </Button>
        )}
      </Group>
      <Switch
        size="xs"
        label="Count links of optional types too"
        checked={includeOptional}
        onChange={(e) => setIncludeOptional(e.currentTarget.checked)}
      />
      {running && (
        <Text size="xs" c="dimmed" role="status">
          Finding the loops…
        </Text>
      )}
      {answer && !running && (
        <Stack gap={6}>
          <Text size="sm" role="status">
            {totals(answer.answer.total, answer.maxLength)}
          </Text>
          {stale && (
            <Text size="xs" c="yellow.7">
              The map has changed since: find them again to be sure.
            </Text>
          )}
          <Text size="xs" c="dimmed">
            By length:{' '}
            {Object.entries(answer.answer.total.byLength)
              .map(([n, c]) => `${n} links ${c.toLocaleString('en')}`)
              .join(' · ') || 'none'}
          </Text>
          {listed.length > 0 && (
            <Text size="xs" c="dimmed">
              {listed.length < answer.answer.total.count
                ? `Listed: the first ${listed.length.toLocaleString('en')} found, shortest first. Fewer links narrow the search.`
                : 'Listed shortest first.'}
            </Text>
          )}
          {listed.slice(0, shown).map((found) => (
            <FoundRow key={loopKey(found.links)} found={found} named={named.get(loopKey(found.links))} />
          ))}
          {listed.length > shown && (
            <Button size="xs" variant="default" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, listed.length - shown)} more
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}

export function LoopsPanel() {
  const project = useStudio((s) => s.project);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ScrollArea className="lw-inspector" type="auto" offsetScrollbars>
      <div className="lw-inspector-body">
        <Stack gap="md">
          <Title order={2} size="h5">
            Loops
          </Title>
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Named loops ({project.loops.length})
            </Text>
            {project.loops.length === 0 && (
              <Text size="xs" c="dimmed">
                None yet. Find the map's loops below and name the ones the story is about.
              </Text>
            )}
            {project.loops.map((loop) => (
              <NamedLoop
                key={loop.id}
                loop={loop}
                open={open === loop.id}
                onToggle={() => setOpen(open === loop.id ? null : loop.id)}
              />
            ))}
          </Stack>
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Every loop of the map
            </Text>
            <Text size="xs" c="dimmed">
              A loop is reinforcing (R) when it has an even number of − links, balancing (B) when odd.
              Optional links (such as side-effects) are left out unless counted too.
            </Text>
            <LoopFinder />
          </Stack>
        </Stack>
      </div>
    </ScrollArea>
  );
}
