// A reference as it reads in a list: *asterisks* as italics, web addresses as links that open in a new tab.
// Also the notes a DOI lookup gives with its draft: warnings first, then what is missing, then what to check.
import { type DraftNote, referenceSpans } from '@loopweft/model';
import { Alert, List, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle, IconQuestionMark } from '@tabler/icons-react';

export function ReferenceText({ apa, size = 'sm' }: { apa: string; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <Text size={size} className="lw-reference">
      {referenceSpans(apa).map((span, i) => {
        // The runs of one reference, in order: their place is their identity.
        const key = `${i} ${span.text}`;
        if (span.href) {
          return (
            <a key={key} href={span.href} target="_blank" rel="noreferrer noopener">
              {span.text}
            </a>
          );
        }
        return span.italic ? <i key={key}>{span.text}</i> : <span key={key}>{span.text}</span>;
      })}
    </Text>
  );
}

/** A reference without its italics marks: for plain-text copies and short lists. */
export const plainReference = (apa: string): string => apa.replace(/\*([^*]+)\*/g, '$1');

const LEVELS = [
  { level: 'warning', title: 'Read before citing', color: 'red', Icon: IconAlertTriangle },
  { level: 'missing', title: 'Not in the record', color: 'yellow', Icon: IconQuestionMark },
  { level: 'check', title: 'To check', color: 'blue', Icon: IconInfoCircle },
] as const;

export function DraftNotes({ notes }: { notes: readonly DraftNote[] }) {
  if (notes.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        The record gave every part of this reference. Check it against the work before citing it.
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      {LEVELS.map(({ level, title, color, Icon }) => {
        const some = notes.filter((n) => n.level === level);
        if (some.length === 0) return null;
        return (
          <Alert
            key={level}
            color={color}
            variant="light"
            title={title}
            icon={<Icon size={18} aria-hidden />}
            p="xs"
          >
            <List size="sm" spacing={4}>
              {some.map((n) => (
                <List.Item key={n.message}>{n.message}</List.Item>
              ))}
            </List>
          </Alert>
        );
      })}
    </Stack>
  );
}
