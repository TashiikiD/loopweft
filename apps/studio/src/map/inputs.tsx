// Inputs that commit one change at a time: a text field keeps its draft while it is typed in and commits on
// Enter or on leaving the field (Escape goes back), so one edit is one undoable step.
import type { Field, FieldValue } from '@loopweft/model';
import { NumberInput, SegmentedControl, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';

interface CommitTextProps {
  label: string;
  value: string;
  /** A blank text clears an optional field (null); `required` fields refuse it. */
  onCommit(next: string | null): void;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
}

export function CommitText({
  label,
  value,
  onCommit,
  required,
  multiline,
  placeholder,
  description,
  disabled,
}: CommitTextProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  // An undo (or another edit) can change the value under the field: show it unless the person is typing.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const next = multiline ? draft.replace(/\r\n?/g, '\n').trim() : draft.trim();
    if (next === value.trim()) {
      setDraft(value);
      return;
    }
    if (!next && required) {
      setDraft(value);
      return;
    }
    onCommit(next ? next : null);
  };
  const shared = {
    label,
    value: draft,
    placeholder,
    description,
    disabled,
    size: 'sm' as const,
    onFocus: () => setEditing(true),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setEditing(true);
      setDraft(event.currentTarget.value);
    },
    onBlur: commit,
  };
  if (multiline) {
    return (
      <Textarea
        {...shared}
        autosize
        minRows={2}
        maxRows={8}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.blur();
          if (event.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <TextInput
      {...shared}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(value);
          setEditing(false);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** A choice with a "not set" entry; null clears it. */
export function ChoiceInput({
  label,
  value,
  options,
  onChange,
  none = 'None',
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange(next: string | null): void;
  none?: string;
}) {
  return (
    <Select
      label={label}
      size="sm"
      value={value ?? ''}
      data={[{ value: '', label: none }, ...options]}
      onChange={(next) => onChange(next ? next : null)}
      allowDeselect={false}
      comboboxProps={{ withinPortal: true }}
    />
  );
}

/** A number, or nothing. */
export function NumberValue({
  label,
  value,
  onCommit,
  min,
  max,
  step,
  description,
  placeholder,
  disabled,
}: {
  label: string;
  value: number | undefined;
  onCommit(next: number | null): void;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | number>(value ?? '');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const next = typeof draft === 'number' ? draft : draft.trim() === '' ? null : Number(draft);
    if (next !== null && !Number.isFinite(next)) {
      setDraft(value ?? '');
      return;
    }
    if ((next ?? undefined) !== value) onCommit(next);
  };
  return (
    <NumberInput
      label={label}
      description={description}
      placeholder={placeholder}
      disabled={disabled}
      size="sm"
      value={draft}
      min={min}
      max={max}
      step={step}
      onFocus={() => setEditing(true)}
      onChange={(next) => {
        setEditing(true);
        setDraft(next);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

/** Yes, no or not set: a true/false field left unset says nothing, which is not the same as no. */
export function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange(next: boolean | null): void;
}) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      <SegmentedControl
        size="xs"
        value={value === undefined ? 'unset' : value ? 'yes' : 'no'}
        data={[
          { value: 'unset', label: 'Not set' },
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        onChange={(next) => onChange(next === 'unset' ? null : next === 'yes')}
        aria-label={label}
      />
    </Stack>
  );
}

/** The value of one custom field, edited as its kind says. */
export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: FieldValue | undefined;
  onChange(next: FieldValue | null): void;
}) {
  switch (field.kind) {
    case 'number':
      return (
        <NumberValue
          label={field.name}
          description={field.description}
          value={value as number | undefined}
          onCommit={onChange}
        />
      );
    case 'boolean':
      return <TriState label={field.name} value={value as boolean | undefined} onChange={onChange} />;
    case 'choice':
      return (
        <ChoiceInput
          label={field.name}
          value={value as string | undefined}
          none="Not set"
          options={(field.options ?? []).map((o) => ({ value: o.id, label: o.name }))}
          onChange={onChange}
        />
      );
    default:
      return (
        <CommitText
          label={field.name}
          description={field.description}
          value={(value as string | undefined) ?? ''}
          onCommit={onChange}
          multiline
        />
      );
  }
}
