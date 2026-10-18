// A new map: blank, from one of the eight system archetypes, or the polycrisis example, each shown as a small
// picture. The same templates as `loopweft new --template`.
import { ARCHETYPE_SOURCE, type Project, plural, TEMPLATES } from '@loopweft/model';
import { Modal, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { useMemo } from 'react';
import { exampleProject, startMap } from '../actions.ts';
import { useStudioStore } from '../context.tsx';
import { MapThumbnail } from '../map/thumbnail.tsx';

interface Choice {
  id: string;
  name: string;
  summary: string;
  project: Project;
}

function Choices({ onDone }: { onDone(): void }) {
  const store = useStudioStore();
  const choices = useMemo<Choice[]>(
    () => [
      ...TEMPLATES.map((t) => ({ id: t.id, name: t.name, summary: t.summary, project: t.build() })),
      {
        id: 'polycrisis',
        name: 'The polycrisis example',
        summary: 'The map and story Loopweft grew out of.',
        project: exampleProject(),
      },
    ],
    [],
  );
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="sm">
        {choices.map((c) => (
          <UnstyledButton
            key={c.id}
            className="lw-template"
            onClick={() => {
              if (startMap(store, c.id)) onDone();
            }}
            aria-label={c.name}
          >
            <MapThumbnail project={c.project} label={`A picture of ${c.name}`} width={232} height={130} />
            <Stack gap={2} p={8}>
              <Text size="sm" fw={600}>
                {c.name}
              </Text>
              <Text size="xs" c="dimmed">
                {c.summary}
              </Text>
              {c.id !== 'blank' && (
                <Text size="xs" c="dimmed">
                  {plural(c.project.variables.length, 'variable')} · {plural(c.project.links.length, 'link')}{' '}
                  · {plural(c.project.loops.length, 'named loop')}
                </Text>
              )}
            </Stack>
          </UnstyledButton>
        ))}
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {`The archetypes follow ${ARCHETYPE_SOURCE.label}. They are structures to rename for the system you are mapping; their links cite nothing until you cite your own sources.`}
      </Text>
    </Stack>
  );
}

export function TemplateGallery({ opened, onClose }: { opened: boolean; onClose(): void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="New map" size="56rem">
      {opened && <Choices onDone={onClose} />}
    </Modal>
  );
}
