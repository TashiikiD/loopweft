// What if one variable rises, or falls? The ripple (@loopweft/model) carries the change link by link by the
// links' signs, and says where it stops: at a link of unknown sign, and where opposing pushes meet. It tells
// directions only, never how much or how soon.
import { plural, type RippleDirection, ripple, type Trend } from '@loopweft/model';
import {
  Button,
  Group,
  List,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';

const MARK: Record<Trend, string> = { up: '▲', down: '▼', mixed: '±' };
const WORD: Record<Trend, string> = { up: 'rises', down: 'falls', mixed: 'pushed both ways' };

export function RipplePanel() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const store = useStudioStore();
  const selected = selection.variables.length === 1 ? (selection.variables[0] as string) : null;
  const [start, setStart] = useState<string | null>(selected);
  const [direction, setDirection] = useState<RippleDirection>('up');
  const [includeOptional, setIncludeOptional] = useState(false);
  const names = useMemo(() => new Map(project.variables.map((v) => [v.id, v.label])), [project.variables]);
  const name = (id: string) => names.get(id) ?? id;
  const present = start !== null && names.has(start);
  const result = useMemo(
    () => (present ? ripple(project, start, direction, { includeOptional }) : null),
    [project, start, direction, includeOptional, present],
  );

  const steps = useMemo(() => {
    const byStep = new Map<number, NonNullable<typeof result>['reached']>();
    for (const r of result?.reached ?? []) byStep.set(r.step, [...(byStep.get(r.step) ?? []), r]);
    return [...byStep];
  }, [result]);

  const select = (ids: string[], links: string[] = []) =>
    store.getState().select({ variables: ids, links, loop: null });

  const counts = (trend: Trend) => result?.reached.filter((r) => r.trend === trend).length ?? 0;
  const later = result?.reached.filter((r) => r.against.length) ?? [];

  return (
    <ScrollArea className="lw-inspector" type="auto" offsetScrollbars>
      <div className="lw-inspector-body">
        <Stack gap="sm">
          <Title order={2} size="h5">
            Ripple
          </Title>
          <Text size="xs" c="dimmed">
            What if one variable rises, or falls? A + link carries the change the same way, a − link the
            opposite way. It shows directions only, not how much or how soon.
          </Text>
          <Select
            label="Start from"
            size="sm"
            searchable
            placeholder="Choose a variable"
            value={present ? start : null}
            data={project.variables.map((v) => ({ value: v.id, label: v.label }))}
            onChange={setStart}
            nothingFoundMessage="No variable by that name"
            comboboxProps={{ withinPortal: true }}
          />
          {selected && selected !== start && (
            <Button size="compact-xs" variant="subtle" w="fit-content" onClick={() => setStart(selected)}>
              Start from the selected variable, {name(selected)}
            </Button>
          )}
          <SegmentedControl
            size="xs"
            value={direction}
            onChange={(value) => setDirection(value as RippleDirection)}
            data={[
              { value: 'up', label: '▲ It rises' },
              { value: 'down', label: '▼ It falls' },
            ]}
            aria-label="The change"
          />
          <Switch
            size="xs"
            label="Follow links of optional types too"
            checked={includeOptional}
            onChange={(e) => setIncludeOptional(e.currentTarget.checked)}
          />
          {result && start && (
            <Stack gap="xs">
              <Text size="sm" role="status">
                {result.reached.length === 0
                  ? `The change reaches no other variable.`
                  : `It reaches ${plural(result.reached.length, 'variable')} in ${plural(result.hops.length, 'step')}: ${[
                      counts('up') ? `${counts('up')} ▲` : '',
                      counts('down') ? `${counts('down')} ▼` : '',
                      counts('mixed') ? `${counts('mixed')} ±` : '',
                    ]
                      .filter(Boolean)
                      .join(', ')}.`}
              </Text>
              {result.reached.length > 0 && (
                <Button
                  size="xs"
                  variant="default"
                  w="fit-content"
                  onClick={() =>
                    select([start, ...result.reached.map((r) => r.variable)], result.hops.flat())
                  }
                >
                  Select it on the map
                </Button>
              )}
              {steps.map(([step, reached]) => (
                <Stack key={step} gap={2}>
                  <Text size="xs" fw={600} c="dimmed">
                    Step {step}
                  </Text>
                  {reached.map((r) => (
                    <UnstyledButton
                      key={r.variable}
                      onClick={() => select([r.variable], r.via)}
                      aria-label={`${name(r.variable)} ${WORD[r.trend]}`}
                    >
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" w={14} ta="center" c={r.trend === 'mixed' ? 'yellow.7' : undefined}>
                          {MARK[r.trend]}
                        </Text>
                        <Text size="sm" truncate>
                          {name(r.variable)}
                        </Text>
                      </Group>
                    </UnstyledButton>
                  ))}
                </Stack>
              ))}
              <List size="xs" spacing={4} c="dimmed">
                {result.feedback.map((f) => (
                  <List.Item key={f.link}>
                    Back to {name(start)} at step {f.step} along {f.link}:{' '}
                    {f.trend === direction
                      ? `${MARK[f.trend]} the same way, so the loop reinforces the change.`
                      : `${MARK[f.trend]} the other way, so the loop counters it.`}
                  </List.Item>
                ))}
                {counts('mixed') > 0 && (
                  <List.Item>
                    ± where opposing pushes arrive together: the signs alone cannot tell which wins, so the
                    ripple goes no further from there.
                  </List.Item>
                )}
                {later.length > 0 && (
                  <List.Item>
                    Pushed the other way later, round a loop or by a longer way:{' '}
                    {later.map((r) => `${name(r.variable)} (${r.against.join(', ')})`).join('; ')}.
                  </List.Item>
                )}
                {result.unknownLinks.length > 0 && (
                  <List.Item>
                    Not crossed: {plural(result.unknownLinks.length, 'link')} of unknown sign (
                    {result.unknownLinks.join(', ')}).
                  </List.Item>
                )}
                {result.optionalLinks.length > 0 && (
                  <List.Item>
                    Left out: {plural(result.optionalLinks.length, 'link')} of optional types (
                    {result.optionalLinks.join(', ')}).
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
