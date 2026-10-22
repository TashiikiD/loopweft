// "Work with an AI agent": Loopweft has no AI of its own, but an agent that runs commands on the person's
// computer (Claude Code, Codex) can work on a map through the `loopweft` command line. This window says how, and
// gives a short message to paste into the agent: the map's file name, how to run the command line, the guide
// (`loopweft guide`) and its rules in brief. Copying puts the text on the clipboard; nothing is sent anywhere.
import { Button, List, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useRef, useState } from 'react';
import { useStudio, useStudioStore } from '../context.tsx';
import { canSaveInPlace, fileNameFor } from '../state/files.ts';

/** The message to paste into an agent, for the map in `file`; `watching`: the Studio follows the file. */
export function starterText(file: string, watching: boolean): string {
  return [
    `Please help me with a Loopweft map, the file ${file}.`,
    '',
    "Loopweft is a studio for animated causal maps. You work on the map's .loopweft file with Loopweft's command line, `loopweft`. Inside a copy of the Loopweft repository (https://github.com/TashiikiD/loopweft, after `npm install`; it needs Node 24) it runs as `npx loopweft`.",
    '',
    'First run `loopweft guide` and follow it. In short:',
    "- Change the map only through `loopweft` commands, never by editing the file's text.",
    "- Never guess a link's sign: write ? when neither my brief nor a source says which way it goes.",
    '- Add only sources I give you or that you confirm with `loopweft source lookup <doi>`, and never write a page number you have not seen. When unsure, leave the link uncited.',
    '- Run `loopweft validate` before any export, and export only with 0 errors.',
    '- When you finish, tell me what you changed, which links are your own suggestions, every ? sign, what is still uncited, and the files you exported.',
    '',
    ...(watching
      ? ['I have the map open in the Loopweft Studio, so I will see your changes as you save them.', '']
      : []),
    'What I would like:',
    '',
  ].join('\n');
}

/**
 * Copies a text field's text: through the clipboard where the browser allows it, else by selecting it and
 * copying the selection. Resolves to false when neither worked; the text is then left selected.
 */
export async function copyField(field: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(field.value);
    return true;
  } catch {
    field.focus();
    field.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

export function AgentHelp() {
  const store = useStudioStore();
  const opened = useStudio((s) => s.agentHelp);
  const file = useStudio((s) => s.file);
  const title = useStudio((s) => s.project.meta.title);
  const follows = canSaveInPlace();
  const name = file?.name ?? fileNameFor(title);
  const text = starterText(name, follows && Boolean(file?.handle));
  const field = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const close = () => {
    setCopied(null);
    store.getState().setAgentHelp(false);
  };
  const copy = async () => {
    if (field.current) setCopied((await copyField(field.current)) ? 'yes' : 'no');
  };
  return (
    <Modal opened={opened} onClose={close} title="Work with an AI agent" size="44rem">
      <Stack gap="md">
        <Text size="sm">
          Loopweft has no AI of its own. An AI agent that runs commands on your computer, such as Claude Code
          or Codex, can build and change this map with Loopweft's command line, following the rules Loopweft
          gives it: never invent evidence, never guess a link's sign, check the map before exporting it.
        </Text>
        <List type="ordered" size="sm" spacing={4}>
          <List.Item>
            {file?.handle
              ? `The map is saved as ${file.name}. Keep it in a folder of its own.`
              : 'Save the map into a folder of its own (File › Save).'}
          </List.Item>
          <List.Item>Open your agent in that folder.</List.Item>
          <List.Item>
            Copy the message below, paste it into the agent, and add what you would like it to do.
          </List.Item>
          <List.Item>
            {follows
              ? 'Watch the map here: each change the agent saves appears within a second or two, with a note of what changed, and Undo goes back.'
              : 'This browser cannot follow the file as the agent changes it (Chrome and Edge can): open the file again (File › Open) to see the changes.'}
          </List.Item>
        </List>
        <Textarea
          ref={field}
          label="The message for the agent"
          value={text}
          readOnly
          autosize
          minRows={8}
          maxRows={16}
          styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 } }}
        />
        <Button onClick={() => void copy()} color={copied === 'yes' ? 'teal' : undefined}>
          {copied === 'yes' ? 'Copied' : 'Copy agent instructions'}
        </Button>
        {copied === 'no' && (
          <Text size="sm" role="status">
            This browser did not let the Studio copy it. The message is selected: press Ctrl+C (⌘C on a Mac)
            to copy it.
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Copying puts the message on your clipboard; Loopweft sends nothing anywhere. What the agent does
          with the map is between you and it: read its report, and check its changes before you rely on them.
        </Text>
      </Stack>
    </Modal>
  );
}
