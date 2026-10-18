// The APA reference list, made from the sources: alphabetical by first author, supplements under their work,
// each with the scenes that draw on it. It is never typed separately, so it always matches the sources. It
// copies as plain text, or with its italics for a word processor.
import { referenceList } from '@loopweft/model';
import { Button, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useStudio } from '../context.tsx';
import { plainReference, ReferenceText } from './reference-text.tsx';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A reference as HTML for the clipboard: italics as <i>. */
const referenceHtml = (apa: string) =>
  apa
    .split(/(\*[^*]+\*)/)
    .map((part) =>
      part.length > 2 && part.startsWith('*') && part.endsWith('*')
        ? `<i>${escapeHtml(part.slice(1, -1))}</i>`
        : escapeHtml(part),
    )
    .join('');

export function ReferenceList() {
  const project = useStudio((s) => s.project);
  const refs = useMemo(() => referenceList(project), [project]);
  const sceneNumber = new Map(project.story.scenes.map((s, i) => [s.id, i + 1]));
  const scenes = (ids: string[]) => {
    const numbers = ids.map((id) => sceneNumber.get(id)).filter((n): n is number => n !== undefined);
    if (!numbers.length) return '';
    return numbers.length === 1
      ? `Scene ${numbers[0]}`
      : `Scenes ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
  };
  const all = refs.flatMap((r) => [r.source.apa, ...r.parts.map((p) => p.source.apa)]);

  const copy = async (formatted: boolean) => {
    const text = all.map(plainReference).join('\n');
    try {
      if (formatted && typeof ClipboardItem !== 'undefined') {
        const html = all.map((apa) => `<p>${referenceHtml(apa)}</p>`).join('');
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ]);
      } else await navigator.clipboard.writeText(text);
      notifications.show({
        message: `Copied ${all.length} reference${all.length === 1 ? '' : 's'}${formatted ? ' with italics' : ''}.`,
        autoClose: 2500,
      });
    } catch {
      notifications.show({ color: 'red', message: 'The browser did not allow copying here.' });
    }
  };

  if (refs.length === 0) {
    return (
      <Text size="sm" c="dimmed" p="md">
        No sources yet: the reference list is made from them.
      </Text>
    );
  }
  return (
    <Stack gap="sm" className="lw-references">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {all.length} reference{all.length === 1 ? '' : 's'}, APA 7, made from the sources: change a
          reference in the library.
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Button
            size="compact-sm"
            variant="default"
            leftSection={<IconCopy size={14} aria-hidden />}
            onClick={() => void copy(true)}
          >
            Copy with italics
          </Button>
          <Button size="compact-sm" variant="default" onClick={() => void copy(false)}>
            Copy as plain text
          </Button>
        </Group>
      </Group>
      <ScrollArea type="auto" offsetScrollbars style={{ flex: 1 }}>
        <ol className="lw-reference-list" aria-label="References">
          {refs.map((ref) => (
            <li key={ref.source.id}>
              <ReferenceText apa={ref.source.apa} />
              {scenes(ref.scenes) && (
                <Text size="xs" c="dimmed">
                  {scenes(ref.scenes)}
                </Text>
              )}
              {ref.parts.length > 0 && (
                <ol className="lw-reference-parts">
                  {ref.parts.map((part) => (
                    <li key={part.source.id}>
                      <ReferenceText apa={part.source.apa} />
                      {scenes(part.scenes) && (
                        <Text size="xs" c="dimmed">
                          {scenes(part.scenes)}
                        </Text>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </ScrollArea>
    </Stack>
  );
}
