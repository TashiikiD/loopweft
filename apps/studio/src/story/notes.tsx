// A scene's speaker notes (Markdown) and its full script. In the script, [>] marks each keypress: the n-th
// mark brings up step n + 1, and one more after the closing line moves on to the next scene (none in the last
// scene). The script is shown cut at its marks (▶), each part beside the step it is spoken over.
import {
  countKeyMarks,
  KEY_MARK,
  keyMarksNeeded,
  type Scene,
  scriptSegments,
  setScene,
} from '@loopweft/model';
import { Alert, Button, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useEdit, useStudio, useStudioStore } from '../context.tsx';
import type { Current } from './current.ts';

/** A long text that keeps its draft while typed in and commits when the field is left. */
function DraftText({
  label,
  description,
  value,
  onCommit,
  minRows = 4,
  insert,
}: {
  label: string;
  description?: string;
  value: string;
  onCommit(next: string | null): void;
  minRows?: number;
  /** A button that inserts this text where the cursor is. */
  insert?: { text: string; label: string };
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  /** Whether the field has had the cursor: its place (kept when the field loses focus) is where text goes in. */
  const touched = useRef(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const commit = (text: string) => {
    setEditing(false);
    const next = text.replace(/\r\n?/g, '\n').trim();
    if (next !== value.trim()) onCommit(next ? next : null);
  };
  return (
    <Stack gap={4}>
      <Textarea
        ref={field}
        label={label}
        description={description}
        size="sm"
        autosize
        minRows={minRows}
        maxRows={18}
        value={draft}
        onFocus={() => {
          touched.current = true;
          setEditing(true);
        }}
        onChange={(event) => {
          setEditing(true);
          setDraft(event.currentTarget.value);
        }}
        onBlur={(event) => {
          // On to the insert button, the draft waits: what is typed and what goes in are one change.
          if (insert && event.relatedTarget && event.relatedTarget === button.current) return;
          commit(event.currentTarget.value);
        }}
      />
      {insert && (
        <Group>
          <Button
            ref={button}
            size="compact-xs"
            variant="default"
            // Keep the cursor in the field while the mark goes in.
            onMouseDown={(event) => event.preventDefault()}
            onBlur={(event) => {
              // Left for somewhere other than the field: the draft is done.
              if (event.relatedTarget !== field.current) commit(draft);
            }}
            onClick={() => {
              // At the cursor, or over the selection, the field last had, from the mouse or the keyboard.
              const el = field.current;
              const at = el && touched.current ? el.selectionStart : draft.length;
              const end = el && touched.current ? el.selectionEnd : draft.length;
              const before = draft.slice(0, at);
              const after = draft.slice(end);
              const spaced = `${/\s$|^$/.test(before) ? '' : ' '}${insert.text}${/^\s/.test(after) ? '' : ' '}`;
              const next = `${before}${spaced}${after}`;
              setDraft(next);
              setEditing(true);
              if (!el) return;
              // Back to the field, the cursor after the mark; the change is kept when the field is left.
              el.focus();
              requestAnimationFrame(() => el.setSelectionRange(at + spaced.length, at + spaced.length));
            }}
          >
            {insert.label}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

/** The script cut at its key marks, each part beside the step it is spoken over. */
function ScriptByStep({ scene, last, current }: { scene: Scene; last: boolean; current: Current }) {
  const store = useStudioStore();
  const script = scene.script ?? '';
  const marks = countKeyMarks(script);
  const needed = keyMarksNeeded(scene.steps.length, last);
  const parts = scriptSegments(script);
  return (
    <Stack gap={6}>
      {marks !== needed && (
        <Alert color="yellow" variant="light" p="xs">
          <Text size="xs">
            The script has {marks} key {marks === 1 ? 'mark' : 'marks'}; its {scene.steps.length}{' '}
            {scene.steps.length === 1 ? 'step needs' : 'steps need'} {needed} (one per step after the first
            {last ? '' : ', and one to leave the scene'}).
          </Text>
        </Alert>
      )}
      {parts.map((part, i) => {
        const step = scene.steps[i];
        const key = step ? `${scene.id}.${step.id}` : null;
        const where = step
          ? `${key} · ${step.label}`
          : i === scene.steps.length && !last
            ? 'Leaving the scene'
            : 'After the last step';
        return (
          <Paper
            // Parts after the last step (surplus marks) share their heading, so their place keys them.
            key={key ?? `${where} ${i}`}
            withBorder
            p={8}
            radius="sm"
            className={key === current.key ? 'lw-script-now' : undefined}
          >
            <Group gap={6} justify="space-between" wrap="nowrap">
              <Text size="xs" c="dimmed" fw={500}>
                {i > 0 ? '▶ ' : ''}
                {where}
              </Text>
              {key && key !== current.key && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  aria-label={`Show step ${key}`}
                  onClick={() => store.getState().selectStory(key)}
                >
                  Show
                </Button>
              )}
            </Group>
            <Text size="sm" mt={2}>
              {part || <i>(nothing said)</i>}
            </Text>
          </Paper>
        );
      })}
    </Stack>
  );
}

export function NotesPanel({ current }: { current: Current }) {
  const edit = useEdit();
  const count = useStudio((s) => s.project.story.scenes.length);
  const { scene } = current;
  const id = scene.id;
  const words = (scene.script ?? '').split(KEY_MARK).join(' ').split(/\s+/).filter(Boolean).length;
  return (
    <div className="lw-panel-body">
      <Stack gap="sm">
        <Title order={2} size="h5">
          Notes for scene {id}
        </Title>
        <DraftText
          label="Speaker notes"
          description="For the presenter only (Markdown)"
          value={scene.notes ?? ''}
          onCommit={(next) => edit((p) => setScene(p, id, { notes: next }))}
        />
        <DraftText
          label="Script"
          description={`The full text, for the presenter only. ${KEY_MARK} marks each keypress.${words ? ` ${words} words.` : ''}`}
          value={scene.script ?? ''}
          minRows={6}
          insert={{ text: KEY_MARK, label: `Insert a key mark ${KEY_MARK}` }}
          onCommit={(next) => edit((p) => setScene(p, id, { script: next }))}
        />
        {scene.script !== undefined && (
          <ScriptByStep scene={scene} last={current.sceneIndex === count - 1} current={current} />
        )}
      </Stack>
    </div>
  );
}
