// A line along the bottom: how big the map is, and how much the checks flag.
import { validateProject } from '@loopweft/model';
import { Group, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useStudio } from '../context.tsx';

export function StatusBar() {
  const project = useStudio((s) => s.project);
  const issues = useMemo(() => validateProject(project), [project]);
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  return (
    <footer className="lw-status">
      <Group gap="lg" wrap="nowrap">
        <Text size="xs" c="dimmed">
          {project.variables.length} variables · {project.links.length} links · {project.loops.length} named
          loops
        </Text>
        <Text size="xs" c={warnings ? 'yellow.7' : 'dimmed'}>
          {warnings ? `${warnings} to look at` : 'Nothing flagged'}
        </Text>
      </Group>
    </footer>
  );
}
