// A line along the bottom: how big the map is, how much of it cites a source, and how much the checks flag.
import { evidenceCoverage, validateProject } from '@loopweft/model';
import { Group, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useStudio } from '../context.tsx';

export function StatusBar() {
  const project = useStudio((s) => s.project);
  const issues = useMemo(() => validateProject(project), [project]);
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const links = useMemo(() => evidenceCoverage(project).links, [project]);
  return (
    <footer className="lw-status">
      <Group gap="lg" wrap="nowrap">
        <Text size="xs" c="dimmed">
          {project.variables.length} variables · {project.links.length} links · {project.loops.length} named
          loops
        </Text>
        {links.total > 0 && (
          <Text size="xs" c="dimmed">
            {links.cited} of {links.total} links cite a source · {project.sources.length} source
            {project.sources.length === 1 ? '' : 's'}
          </Text>
        )}
        <Text size="xs" c={warnings ? 'yellow.7' : 'dimmed'}>
          {warnings ? `${warnings} to look at` : 'Nothing flagged'}
        </Text>
      </Group>
    </footer>
  );
}
