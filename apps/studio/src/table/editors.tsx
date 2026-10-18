// Source: DataViz packages/web/src/data/cell-editors.tsx @ efcdbe2 (TashiikiD/DataViz, private), adapted for
// Loopweft: the same three editors, without DataViz's pending-edit registry.
//
// Editors the table opens in a cell. Each keeps its draft and commits it when it closes (Enter, Tab, a
// click elsewhere), unless Escape cancelled it. Text that did not change is not committed.
import { Autocomplete } from '@mantine/core';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

interface EditorProps {
  /** The cell as text when the editor opened. */
  initial: string;
  /** Applies the text to the map (read strictly). */
  onCommit(text: string): void;
  label: string;
}

/** Commits on close unless cancelled. */
function useDraft({ initial, onCommit }: EditorProps) {
  const [text, setText] = useState(initial);
  const draft = useRef({ text: initial, base: initial, cancelled: false });
  const commit = useRef(onCommit);
  commit.current = onCommit;
  // Commits once, when the editor closes.
  useEffect(
    () => () => {
      const { text: current, base, cancelled } = draft.current;
      if (cancelled || current === base) return;
      draft.current.base = current;
      commit.current(current);
    },
    [],
  );
  return {
    text,
    set(next: string) {
      draft.current.text = next;
      setText(next);
    },
    cancel() {
      draft.current.cancelled = true;
    },
  };
}

/**
 * Focuses the field as soon as it exists, as the table's own editor does: typing a character on a cell
 * opens the editor, and the character must land in it (a focus that waits for an effect would lose it). The
 * text is selected, so what is typed replaces it.
 */
const focusNow = (element: HTMLInputElement | HTMLTextAreaElement | null) => {
  if (!element || element.dataset.focused) return;
  element.dataset.focused = 'true';
  element.focus();
  element.select();
};

const cancelOnEscape = (cancel: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Escape') cancel();
};

const inputStyle = {
  width: '100%',
  height: '100%',
  border: 0,
  padding: '0 8px',
  font: 'inherit',
  background: 'var(--mantine-color-body)',
  color: 'inherit',
  outline: '2px solid var(--mantine-primary-color-filled)',
  outlineOffset: -2,
} as const;

/** One line of text (numbers too, read when committed). */
export function TextEditor(props: EditorProps) {
  const draft = useDraft(props);
  return (
    <input
      ref={focusNow}
      aria-label={props.label}
      value={draft.text}
      onChange={(e) => draft.set(e.currentTarget.value)}
      onKeyDown={cancelOnEscape(draft.cancel)}
      style={inputStyle}
    />
  );
}

/** Text with line breaks: Shift+Enter adds a line, Enter commits. */
export function MultilineEditor(props: EditorProps) {
  const draft = useDraft(props);
  return (
    <textarea
      ref={focusNow}
      aria-label={props.label}
      value={draft.text}
      rows={4}
      onChange={(e) => draft.set(e.currentTarget.value)}
      onKeyDown={(e) => {
        cancelOnEscape(draft.cancel)(e);
        // Keeps the table from closing the editor: Shift+Enter is a line break here.
        if (e.key === 'Enter' && e.shiftKey) e.stopPropagation();
      }}
      style={{
        ...inputStyle,
        position: 'absolute',
        inset: 0,
        height: 120,
        padding: 8,
        resize: 'none',
        zIndex: 1,
      }}
    />
  );
}

/**
 * Text with suggestions: the names of variables, categories or link types, or a column's values. Other
 * text may be typed; what it means is decided when committed (a new category, a new variable, or a
 * problem).
 */
export function SuggestEditor(props: EditorProps & { options: readonly string[] }) {
  const draft = useDraft(props);
  return (
    <Autocomplete
      ref={focusNow}
      aria-label={props.label}
      value={draft.text}
      data={[...new Set(props.options)]}
      onChange={draft.set}
      onKeyDown={cancelOnEscape(draft.cancel)}
      limit={50}
      size="xs"
      variant="unstyled"
      comboboxProps={{ withinPortal: true, position: 'bottom-start', width: 'max-content' }}
      styles={{
        root: { height: '100%' },
        wrapper: { height: '100%' },
        input: { ...inputStyle, height: '100%', minHeight: 0 },
      }}
    />
  );
}
