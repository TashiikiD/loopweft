// How can a change in one variable reach another? The path finder (@loopweft/model, as `loopweft paths` runs
// it) lists the paths along the links, shortest first, each + or − by its signs. Directions only: a path's
// sign says which way it pushes, not how much, and paths of both signs leave the net effect open.
import { type FoundPath, findPaths, plural, signText } from '@loopweft/model';
import {
  ActionIcon,
  Button,
  Group,
  List,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconArrowsExchange } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';

const PAGE = 50;
const SIGN_WORD = { '+': 'same direction', '-': 'opposite direction', '?': 'unknown' } as const;

export function PathsPanel() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const store = useStudioStore();
  const [from, setFrom] = useState<string | null>(selection.variables[0] ?? null);
  const [to, setTo] = useState<string | null>(selection.variables[1] ?? null);
  const [maxLength, setMaxLength] = useState<number | ''>('');
  const [includeOptional, setIncludeOptional] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const names = useMemo(() => new Map(project.variables.map((v) => [v.id, v.label])), [project.variables]);
  const name = (id: string) => names.get(id) ?? id;
  const ready = from !== null && to !== null && from !== to && names.has(from) && names.has(to);
  const result = useMemo(
    () =>
      ready
        ? findPaths(project, from, to, {
            limit,
            includeOptional,
            ...(typeof maxLength === 'number' && maxLength >= 1 ? { maxLength } : {}),
          })
        : null,
    [project, from, to, limit, includeOptional, maxLength, ready],
  );
  const select = (paths: FoundPath[]) =>
    store.getState().select({
      variables: [...new Set(paths.flatMap((p) => p.variables))],
      links: [...new Set(paths.flatMap((p) => p.links))],
      loop: null,
    });
  const choices = project.variables.map((v) => ({ value: v.id, label: v.label }));
  const two = selection.variables.length === 2 ? (selection.variables as [string, string]) : null;

  return (
    <ScrollArea className="lw-inspector" type="auto" offsetScrollbars>
      <div className="lw-inspector-body">
        <Stack gap="sm">
          <Title order={2} size="h5">
            Paths
          </Title>
          <Text size="xs" c="dimmed">
            How can a change in one variable reach another? Each path follows the links’ directions without
            passing a variable twice; its sign says which way it pushes the end, not how much.
          </Text>
          <Group gap={6} align="flex-end" wrap="nowrap">
            <Select
              label="From"
              size="sm"
              searchable
              placeholder="A variable"
              value={from}
              data={choices}
              onChange={(next) => {
                setFrom(next);
                setLimit(PAGE);
              }}
              comboboxProps={{ withinPortal: true }}
              style={{ flex: 1 }}
            />
            <Tooltip label="Swap">
              <ActionIcon
                variant="default"
                size="lg"
                mb={1}
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                  setLimit(PAGE);
                }}
                aria-label="Swap from and to"
              >
                <IconArrowsExchange size={16} aria-hidden />
              </ActionIcon>
            </Tooltip>
            <Select
              label="To"
              size="sm"
              searchable
              placeholder="Another"
              value={to}
              data={choices}
              onChange={(next) => {
                setTo(next);
                setLimit(PAGE);
              }}
              comboboxProps={{ withinPortal: true }}
              style={{ flex: 1 }}
            />
          </Group>
          {two && !(two[0] === from && two[1] === to) && (
            <Button
              size="compact-xs"
              variant="subtle"
              w="fit-content"
              onClick={() => {
                setFrom(two[0]);
                setTo(two[1]);
                setLimit(PAGE);
              }}
            >
              From {name(two[0])} to {name(two[1])} (the two selected)
            </Button>
          )}
          <Group gap="sm" align="flex-end">
            <NumberInput
              label="At most this many links"
              size="sm"
              min={1}
              allowDecimal={false}
              placeholder="Any"
              value={maxLength}
              onChange={(next) => setMaxLength(typeof next === 'number' ? next : '')}
              w={180}
            />
            <Switch
              size="xs"
              mb={8}
              label="Follow links of optional types too"
              checked={includeOptional}
              onChange={(e) => setIncludeOptional(e.currentTarget.checked)}
            />
          </Group>
          {from !== null && from === to && (
            <Text size="sm" c="dimmed">
              Choose two different variables: the paths from a variable back to itself are its loops.
            </Text>
          )}
          {result && (
            <Stack gap="xs">
              <Text size="sm" role="status" aria-label="Paths found">
                {result.count === 0
                  ? `No path leads from ${name(result.from)} to ${name(result.to)}${
                      typeof maxLength === 'number' ? ` in ${plural(result.maxLength, 'link')} or fewer` : ''
                    }.`
                  : `${result.complete ? '' : 'At least '}${result.count.toLocaleString('en')} ${
                      result.count === 1 ? 'path leads' : 'paths lead'
                    } from ${name(result.from)} to ${name(result.to)}: ${(['+', '-', '?'] as const)
                      .filter((s) => result.signs[s])
                      .map((s) => `${result.signs[s].toLocaleString('en')} ${signText(s)}`)
                      .join(', ')}. The shortest has ${plural(result.shortest ?? 0, 'link')}.`}
              </Text>
              {result.signs['+'] > 0 && result.signs['-'] > 0 && (
                <Text size="xs" c="yellow.7">
                  Paths of both signs: along some, a rise at the start pushes the end up; along others, down.
                  The signs alone cannot tell which wins.
                </Text>
              )}
              {result.paths.length > 0 && (
                <Button size="xs" variant="default" w="fit-content" onClick={() => select(result.paths)}>
                  Select {result.paths.length === 1 ? 'it' : `these ${result.paths.length}`} on the map
                </Button>
              )}
              <Stack gap={4} role="list" aria-label="Paths">
                {result.paths.map((p) => (
                  <UnstyledButton
                    key={p.links.join(' ')}
                    role="listitem"
                    className="lw-path"
                    onClick={() => select([p])}
                    aria-label={`${signText(p.sign)} (${SIGN_WORD[p.sign]}): ${p.variables.map(name).join(' → ')}`}
                  >
                    <Group gap={8} wrap="nowrap" align="flex-start">
                      <Text size="sm" fw={700} w={14} ta="center" c={p.sign === '?' ? 'yellow.7' : undefined}>
                        {signText(p.sign)}
                      </Text>
                      <Text size="sm">{p.variables.map(name).join(' → ')}</Text>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
              {result.count > result.paths.length && (
                <Group gap="xs">
                  <Text size="xs" c="dimmed">
                    Listed: the {result.paths.length} shortest.
                  </Text>
                  <Button size="compact-xs" variant="subtle" onClick={() => setLimit(limit + PAGE)}>
                    List {PAGE} more
                  </Button>
                </Group>
              )}
              <List size="xs" spacing={4} c="dimmed">
                {!result.complete && (
                  <List.Item>
                    Counting stopped at {result.count.toLocaleString('en')}: there are more paths than that.
                  </List.Item>
                )}
                {result.optionalLeftOut.length > 0 && (
                  <List.Item>
                    Left out: {plural(result.optionalLeftOut.length, 'link')} of optional types (
                    {result.optionalLeftOut.join(', ')}).
                  </List.Item>
                )}
              </List>
            </Stack>
          )}
        </Stack>
      </div>
    </ScrollArea>
  );
}
