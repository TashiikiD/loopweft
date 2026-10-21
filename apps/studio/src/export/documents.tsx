// PDF documents: the speaker notes (each scene on its own page, its steps with their slide numbers, notes and
// script) and the references (an APA list, with every image's credit), on Letter or A4 paper. Made in this
// page, with the same code as `loopweft export --pdf`, so the same project gives the same file.
import {
  type FontReader,
  fileStem,
  notesPdf,
  type Paper,
  type PdfResult,
  referencesPdf,
} from '@loopweft/export';
import { plural } from '@loopweft/model';
import { Alert, Button, Card, Group, List, Radio, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import { chooseSaveTarget, PDF_FILE } from '../state/files.ts';

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

type Which = 'notes' | 'references';

const DOCUMENTS: Record<Which, { file: string; name: string; make: typeof notesPdf }> = {
  notes: { file: 'speaker-notes', name: 'Speaker notes', make: notesPdf },
  references: { file: 'references', name: 'References', make: referencesPdf },
};

export function DocumentsCard({ fonts }: { fonts: FontReader }) {
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const [which, setWhich] = useState<Which>('notes');
  const [paper, setPaper] = useState<Paper>('letter');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<(PdfResult & { name: string; paper: Paper }) | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async () => {
    const doc = DOCUMENTS[which];
    const asking = chooseSaveTarget(`${fileStem(project.meta.title)}-${doc.file}.pdf`, PDF_FILE);
    setBusy(true);
    setFailure(null);
    try {
      const saved = await asking;
      if (!saved) return;
      const result = await doc.make(store.getState().project, { paper, fonts });
      await saved.write(result.bytes);
      setMade({ ...result, name: saved.name, paper });
      notifications.show({
        title: saved.how === 'file' ? 'Exported' : 'Downloaded',
        message:
          saved.how === 'file'
            ? `Saved ${saved.name} (${megabytes(result.bytes.length)}).`
            : `${saved.name} (${megabytes(result.bytes.length)}) is in your downloads.`,
        autoClose: 4000,
      });
    } catch (error) {
      setFailure(String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card withBorder padding="lg">
      <Stack gap="sm">
        <Title order={3} size="h4">
          PDF documents
        </Title>
        <Text size="sm">
          To print or to hand out. The speaker notes give each scene a page: its steps with their slide
          numbers and cues, the notes and the script. The references list every source in APA style, with the
          scenes that cite it and every image's credit.
        </Text>
        <Radio.Group
          label="Document"
          value={which}
          onChange={(v) => setWhich(v as Which)}
          name="pdf-document"
        >
          <Group gap="lg" mt={4}>
            <Radio value="notes" label="Speaker notes" disabled={busy} />
            <Radio value="references" label="References" disabled={busy} />
          </Group>
        </Radio.Group>
        <Radio.Group label="Paper" value={paper} onChange={(v) => setPaper(v as Paper)} name="pdf-paper">
          <Group gap="lg" mt={4}>
            <Radio value="letter" label="Letter" disabled={busy} />
            <Radio value="a4" label="A4" disabled={busy} />
          </Group>
        </Radio.Group>
        <Group>
          <Button onClick={() => void run()} loading={busy}>
            Export PDF…
          </Button>
        </Group>
        {failure && (
          <Alert color="red" title="Not exported">
            {failure}
          </Alert>
        )}
        {made && !busy && (
          <Stack gap={4}>
            <Text size="sm">
              Last export: {made.name}, {plural(made.pages, 'page')} ({made.paper === 'a4' ? 'A4' : 'Letter'}
              ), {megabytes(made.bytes.length)}.
            </Text>
            {made.notes.length > 0 && (
              <Alert color="yellow" title="To know about this file">
                <List size="sm">
                  {made.notes.map((note) => (
                    <List.Item key={note}>{note}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
