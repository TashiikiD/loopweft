// Source: DataViz packages/web/src/project/editable-text.tsx @ efcdbe2 (TashiikiD/DataViz, private), adapted
// for Loopweft: no pending-edit bookkeeping (the Studio saves only when asked).
import { TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { type ReactNode, useState } from 'react';

/**
 * A text shown as a button; click it to edit. Enter or leaving the field keeps the new text, Escape
 * cancels, and a blank or unchanged text changes nothing.
 */
export function EditableText({
  value,
  onCommit,
  inputLabel,
  buttonLabel,
  width = 360,
  wrap = (button) => button,
}: {
  value: string;
  onCommit(next: string): void;
  /** Accessible name of the text field. */
  inputLabel: string;
  /** Accessible name of the button that starts editing. */
  buttonLabel: string;
  width?: number;
  /** Places the button, e.g. inside a heading. */
  wrap?: (button: ReactNode) => ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const next = draft?.trim();
    if (next && next !== value) onCommit(next);
    setDraft(null);
  };
  if (draft !== null) {
    return (
      <TextInput
        aria-label={inputLabel}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(null);
        }}
        autoFocus
        w={width}
        maw="100%"
        size="sm"
      />
    );
  }
  return wrap(
    <Tooltip label="Rename" openDelay={500}>
      <UnstyledButton
        onClick={() => setDraft(value)}
        aria-label={buttonLabel}
        style={{ font: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        maw="min(480px, 100%)"
      >
        {value}
      </UnstyledButton>
    </Tooltip>,
  );
}
