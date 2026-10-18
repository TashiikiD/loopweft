// How far the map's evidence reaches: the links, variables and named loops that cite a source and those that
// cite nothing, with the citations by strength. Rows can be chosen and cited in one go, or shown on the map.
import { type Citation, evidenceCoverage, signText } from '@loopweft/model';
import {
  Anchor,
  Button,
  Checkbox,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { useStudio } from '../context.tsx';
import { CiteForm } from './citations.tsx';
import { elementName, useShowOnMap } from './library.tsx';

type Kind = 'link' | 'variable' | 'loop';
type Show = 'uncited' | 'all';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'link', label: 'Links' },
  { value: 'variable', label: 'Variables' },
  { value: 'loop', label: 'Named loops' },
];

const pagesText = (pages: string) => `${/[–—,-]/.test(pages) ? 'pp.' : 'p.'} ${pages}`;

export function Coverage() {
  const project = useStudio((s) => s.project);
  const coverage = useMemo(() => evidenceCoverage(project), [project]);
  const show = useShowOnMap();
  const [kind, setKind] = useState<Kind>('link');
  const [filter, setFilter] = useState<Show>('uncited');
  const [chosen, setChosen] = useState<string[]>([]);

  const label = new Map(project.sources.map((s) => [s.id, s.label ?? s.id]));
  const citationsText = (citations: Citation[]) =>
    citations
      .map(
        (c) =>
          `${label.get(c.source) ?? c.source}${c.pages ? ` ${pagesText(c.pages)}` : ''}${c.strength ? ` (${c.strength})` : ''}`,
      )
      .join('; ');

  const items: { id: string; name: string; citations: Citation[] }[] =
    kind === 'link'
      ? project.links.map((l) => ({
          id: l.id,
          name: `${elementName(project, 'link', l.id).replace(' → ', ` → ${signText(l.sign)} → `)}`,
          citations: l.citations,
        }))
      : kind === 'variable'
        ? project.variables.map((v) => ({ id: v.id, name: v.label, citations: v.citations }))
        : project.loops.map((l) => ({ id: l.id, name: l.name, citations: l.citations }));
  const rows = filter === 'uncited' ? items.filter((i) => i.citations.length === 0) : items;
  const visible = new Set(rows.map((r) => r.id));
  const picked = chosen.filter((id) => visible.has(id));
  const count = coverage[kind === 'link' ? 'links' : kind === 'variable' ? 'variables' : 'loops'];
  const word = KINDS.find((k) => k.value === kind)?.label.toLowerCase() ?? '';
  const s = coverage.strengths;

  return (
    <div className="lw-coverage">
      <Stack gap="sm" className="lw-coverage-main">
        <Group gap="lg" wrap="wrap">
          {(
            [
              ['Links', coverage.links],
              ['Variables', coverage.variables],
              ['Named loops', coverage.loops],
            ] as const
          ).map(([name, c]) => (
            <Paper key={name} withBorder radius="sm" px="sm" py={6}>
              <Text size="xs" c="dimmed">
                {name}
              </Text>
              <Text size="sm" fw={600}>
                {c.cited} of {c.total} cite a source
              </Text>
            </Paper>
          ))}
          <Paper withBorder radius="sm" px="sm" py={6}>
            <Text size="xs" c="dimmed">
              Citations by strength
            </Text>
            <Text size="sm">
              {s.strong} strong · {s.moderate} moderate · {s.weak} weak · {s.unrated} not rated
              {coverage.withoutPages ? ` · ${coverage.withoutPages} without pages` : ''}
            </Text>
          </Paper>
        </Group>
        <Group gap="sm">
          <SegmentedControl
            size="xs"
            value={kind}
            onChange={(next) => {
              setKind(next as Kind);
              setChosen([]);
            }}
            data={KINDS}
            aria-label="Which elements"
          />
          <SegmentedControl
            size="xs"
            value={filter}
            onChange={(next) => setFilter(next as Show)}
            data={[
              { value: 'uncited', label: 'Citing nothing' },
              { value: 'all', label: 'All' },
            ]}
            aria-label="Which of them"
          />
          {kind !== 'loop' && picked.length > 0 && (
            <Button size="compact-xs" variant="default" onClick={() => show(kind, picked)}>
              Select {picked.length} on the map
            </Button>
          )}
        </Group>
        {rows.length === 0 ? (
          <Text size="sm" c="dimmed">
            {count.total === 0
              ? `The map has no ${word} yet.`
              : `Every one of the ${count.total} ${word} cites a source.`}
          </Text>
        ) : (
          <ScrollArea type="auto" offsetScrollbars style={{ flex: 1 }}>
            <Table
              striped
              highlightOnHover
              verticalSpacing={4}
              aria-label={`${KINDS.find((k) => k.value === kind)?.label} and their citations`}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={36}>
                    <Checkbox
                      size="xs"
                      checked={picked.length === rows.length}
                      indeterminate={picked.length > 0 && picked.length < rows.length}
                      onChange={(event) =>
                        setChosen(event.currentTarget.checked ? rows.map((r) => r.id) : [])
                      }
                      aria-label="Choose them all"
                    />
                  </Table.Th>
                  <Table.Th>{KINDS.find((k) => k.value === kind)?.label.replace(/s$/, '')}</Table.Th>
                  <Table.Th>Cites</Table.Th>
                  <Table.Th w={110} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <Checkbox
                        size="xs"
                        checked={picked.includes(row.id)}
                        onChange={(event) => {
                          const on = event.currentTarget.checked;
                          setChosen((current) =>
                            on ? [...current, row.id] : current.filter((id) => id !== row.id),
                          );
                        }}
                        aria-label={`Choose ${row.name}`}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{row.name}</Text>
                      <Text size="xs" c="dimmed">
                        {row.id}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {row.citations.length ? (
                        <Text size="sm">{citationsText(row.citations)}</Text>
                      ) : (
                        <Text size="sm" c="yellow.7">
                          nothing
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Anchor component="button" size="xs" onClick={() => show(kind, [row.id])}>
                        Show on map
                      </Anchor>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Stack>
      <aside className="lw-coverage-side" aria-label="Cite the chosen">
        <Title order={2} size="h6" mb="xs">
          {picked.length ? `${picked.length} chosen` : `Choose ${word} to cite`}
        </Title>
        <CiteForm
          elements={picked}
          what={picked.length ? `the ${picked.length} chosen` : undefined}
          onCited={() => setChosen([])}
        />
      </aside>
    </div>
  );
}
