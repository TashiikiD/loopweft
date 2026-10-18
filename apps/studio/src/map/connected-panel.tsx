// The most-connected variables (@loopweft/model, as `loopweft connected` lists them): links in and out,
// neighbours and named loops. Always with the caveat that connected does not mean leverage.
import { CONNECTED_CAVEAT, connectedness } from '@loopweft/model';
import { Alert, Button, ScrollArea, Stack, Switch, Table, Text, Title, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';

const FIRST = 15;

export function ConnectedPanel() {
  const project = useStudio((s) => s.project);
  const store = useStudioStore();
  const [includeOptional, setIncludeOptional] = useState(false);
  const [all, setAll] = useState(false);
  const result = useMemo(() => connectedness(project, { includeOptional }), [project, includeOptional]);
  const linked = result.variables.filter((v) => v.links > 0);
  const shown = all ? linked : linked.slice(0, FIRST);
  return (
    <ScrollArea className="lw-inspector" type="auto" offsetScrollbars>
      <div className="lw-inspector-body">
        <Stack gap="sm">
          <Title order={2} size="h5">
            Most connected
          </Title>
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} aria-hidden />} p="xs">
            <Text size="sm">{CONNECTED_CAVEAT}</Text>
          </Alert>
          <Switch
            size="xs"
            label="Count links of optional types too"
            checked={includeOptional}
            onChange={(e) => setIncludeOptional(e.currentTarget.checked)}
          />
          {linked.length === 0 ? (
            <Text size="sm" c="dimmed">
              No variable has a link yet.
            </Text>
          ) : (
            <Table verticalSpacing={4} highlightOnHover aria-label="The most-connected variables">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Variable</Table.Th>
                  <Table.Th ta="right">Links</Table.Th>
                  <Table.Th ta="right" title="Other variables it links with">
                    Neighbours
                  </Table.Th>
                  <Table.Th ta="right" title="Named loops through it">
                    Loops
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shown.map((v) => (
                  <Table.Tr key={v.id}>
                    <Table.Td>
                      <UnstyledButton
                        onClick={() => store.getState().select({ variables: [v.id], links: [], loop: null })}
                        aria-label={`Select ${v.label}`}
                      >
                        <Text size="sm">{v.label}</Text>
                        <Text size="xs" c="dimmed">
                          {v.in} in · {v.out} out
                        </Text>
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td ta="right">{v.links}</Table.Td>
                    <Table.Td ta="right">{v.neighbours}</Table.Td>
                    <Table.Td ta="right">{v.namedLoops}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          {linked.length > FIRST && (
            <Button size="compact-xs" variant="subtle" w="fit-content" onClick={() => setAll(!all)}>
              {all ? `Show the first ${FIRST}` : `Show all ${linked.length}`}
            </Button>
          )}
          {result.optionalLeftOut.length > 0 && (
            <Text size="xs" c="dimmed">
              Left out: {result.optionalLeftOut.length} link{result.optionalLeftOut.length === 1 ? '' : 's'}{' '}
              of optional types.
            </Text>
          )}
        </Stack>
      </div>
    </ScrollArea>
  );
}
