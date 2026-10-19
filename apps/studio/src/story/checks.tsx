// The story's checks: every warning about the story (docs/format.md §14), by scene and step, each a link to
// the step it is about. The story still saves with them; they are shown until fixed.
import { checkProject, type Issue, type Project } from '@loopweft/model';
import { Button, Stack, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';

/** The step ("S05.3") or scene ("S05") a story warning is about, from its path. */
export function storyKeyOf(project: Project, issue: Issue): string | null {
  const [root, scenes, s, steps, t] = issue.path;
  if (root !== 'story' || scenes !== 'scenes' || typeof s !== 'number') return null;
  const scene = project.story.scenes[s];
  if (!scene) return null;
  if (steps === 'steps' && typeof t === 'number' && scene.steps[t])
    return `${scene.id}.${scene.steps[t]?.id}`;
  return scene.id;
}

/** The story's warnings (and images no step shows), grouped by the step or scene they are about. */
export function useStoryWarnings(): { key: string | null; issues: Issue[] }[] {
  const project = useStudio((s) => s.project);
  return useMemo(() => {
    const groups = new Map<string | null, Issue[]>();
    for (const issue of checkProject(project)) {
      if (issue.severity !== 'warning') continue;
      const key = storyKeyOf(project, issue);
      if (key === null && issue.code !== 'unusedAsset') continue;
      groups.set(key, [...(groups.get(key) ?? []), issue]);
    }
    return [...groups].map(([key, issues]) => ({ key, issues }));
  }, [project]);
}

/** Without the "Step S05.3: " that the group heading already says. */
const bare = (message: string, key: string | null) =>
  key && message.startsWith(`Step ${key}: `) ? message.slice(`Step ${key}: `.length) : message;

export function ChecksPanel() {
  const store = useStudioStore();
  const groups = useStoryWarnings();
  const count = groups.reduce((n, g) => n + g.issues.length, 0);
  return (
    <div className="lw-panel-body">
      <Stack gap="sm">
        <Title order={2} size="h5">
          Checks
        </Title>
        <Text size="xs" c="dimmed">
          The story is checked against the map: trends against the signs, pulses and cameras on hidden things,
          the script’s key marks, timing and loose ends. A story with warnings still saves.
        </Text>
        {count === 0 ? (
          <Text size="sm">Nothing flagged in the story.</Text>
        ) : (
          <Text size="sm" c="yellow.7">
            {count} to look at
          </Text>
        )}
        {groups.map(({ key, issues }) => (
          <Stack key={key ?? 'images'} gap={4} className="lw-check-group">
            {key ? (
              <Button
                size="compact-sm"
                variant="subtle"
                justify="flex-start"
                onClick={() => store.getState().selectStory(key)}
                aria-label={`Show ${key}`}
              >
                {key.includes('.') ? `Step ${key}` : `Scene ${key}`}
              </Button>
            ) : (
              <Text size="sm" fw={500}>
                Images
              </Text>
            )}
            <ul className="lw-check-list">
              {issues.map((issue) => (
                <li key={`${issue.code} ${issue.path.join('.')} ${issue.message}`}>
                  <Text size="xs">{bare(issue.message, key)}</Text>
                </li>
              ))}
            </ul>
          </Stack>
        ))}
      </Stack>
    </div>
  );
}
