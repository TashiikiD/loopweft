// The Export workspace. Phase 5 brings the one-file HTML: the story with its start page, slides, presenter
// console and sources, opening offline from any folder. It is the same file `loopweft export --html` writes:
// the player's page (loaded only when exporting, about 1.2 MB) with the project in it. PNG, SVG, PDF and video
// come in Phase 6.
import { plural } from '@loopweft/model';
import { exportHtml, type HtmlExport, hasNotes, presenterWords } from '@loopweft/player';
import { Alert, Button, Card, Checkbox, Group, List, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import { htmlNameFor, saveHtml } from '../state/files.ts';

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** The player's one-file page (a separate download, loaded the first time it is needed). */
export const loadTemplate = async (): Promise<string> =>
  (await import('virtual:loopweft-player-template')).default;

export function ExportWorkspace({ template = loadTemplate }: { template?: () => Promise<string> }) {
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const [notes, setNotes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<HtmlExport | null>(null);
  const scenes = project.story.scenes.length;
  const steps = project.story.scenes.reduce((n, s) => n + s.steps.length, 0);

  const run = async () => {
    setBusy(true);
    try {
      const result = exportHtml(store.getState().project, await template(), { notes });
      const saved = await saveHtml(htmlNameFor(project.meta.title), result.html);
      if (!saved) return;
      setMade(result);
      notifications.show({
        title: saved.how === 'file' ? 'Exported' : 'Downloaded',
        message:
          saved.how === 'file'
            ? `Saved ${saved.name} (${megabytes(result.bytes)}).`
            : `${saved.name} (${megabytes(result.bytes)}) is in your downloads.`,
        autoClose: 4000,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Not exported',
        message: String((error as Error).message ?? error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lw-workspace">
      <div className="lw-library-detail">
        <Stack gap="lg">
          <Title order={2} size="h3">
            Export
          </Title>
          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Title order={3} size="h4">
                One-file HTML
              </Title>
              <Text size="sm">
                The story as one web page that opens by double-click, from any folder, offline: a start page
                with every source, the slides, and the presenter console with its second window for a
                projector. Chrome or Edge works best.
              </Text>
              <Text size="sm" c="dimmed">
                {plural(scenes, 'scene')} · {plural(steps, 'step')} ·{' '}
                {plural(project.sources.length, 'source')} ·{' '}
                {plural(Object.keys(project.assets).length, 'image')}
              </Text>
              <Checkbox
                checked={notes}
                onChange={(e) => setNotes(e.currentTarget.checked)}
                label="Include the speaker notes, the script and the cues"
                description={
                  hasNotes(project)
                    ? `${presenterWords(project, true)} Untick for a copy for the audience: the slides and the sources only.`
                    : 'The story has no speaker notes, script or cues yet.'
                }
              />
              <Group>
                <Button onClick={() => void run()} loading={busy} disabled={steps === 0}>
                  Export HTML…
                </Button>
                {steps === 0 && (
                  <Text size="sm" c="dimmed">
                    Add scenes and steps in the Story workspace first.
                  </Text>
                )}
              </Group>
              {made && (
                <Stack gap={4}>
                  <Text size="sm">
                    Last export: {megabytes(made.bytes)}, speaker notes {made.notes ? 'included' : 'left out'}
                    .
                    {made.images.length > 0 &&
                      ` Images: ${made.images.map((i) => `${i.id} (${megabytes(i.bytes)})`).join(', ')}.`}
                  </Text>
                  {made.warnings.length > 0 && (
                    <Alert color="yellow" title="To know about this file">
                      <List size="sm">
                        {made.warnings.map((w) => (
                          <List.Item key={w}>{w}</List.Item>
                        ))}
                      </List>
                    </Alert>
                  )}
                </Stack>
              )}
            </Stack>
          </Card>
          <Text size="sm" c="dimmed">
            PNG and SVG images of a step, PDFs (slides, speaker notes, references) and video come in Phase 6.
          </Text>
        </Stack>
      </div>
    </div>
  );
}
