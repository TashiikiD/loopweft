// The map's vocabulary: its categories (and their colours), roles (and their shapes), link types (and how
// they are drawn) and custom fields. Every change is one of @loopweft/model's type operations, the ones
// `loopweft type` runs; a type still in use is removed only after asking, with what it clears.
import {
  addType,
  type Category,
  type Field,
  type LinkType,
  listing,
  moveType,
  type Project,
  paletteOf,
  plural,
  type Role,
  removeType,
  SHAPES,
  setType,
  slugify,
  type TypeKind,
  typeUses,
  uniqueId,
} from '@loopweft/model';
import { categoryColours } from '@loopweft/render';
import {
  ActionIcon,
  Button,
  ColorInput,
  ColorSwatch,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEdit, useStudio } from '../context.tsx';
import { Glyph } from '../glyph.tsx';
import { CommitText } from './inputs.tsx';

type Item = Category | Role | LinkType | Field;

const LISTS: { value: TypeKind; label: string }[] = [
  { value: 'category', label: 'Categories' },
  { value: 'role', label: 'Roles' },
  { value: 'linkType', label: 'Link types' },
  { value: 'field', label: 'Fields' },
];

const NAME: Record<TypeKind, string> = {
  category: 'category',
  role: 'role',
  linkType: 'link type',
  field: 'field',
};

/** What each list is for, in a line. */
const ABOUT: Record<TypeKind, string> = {
  category:
    'Groups of variables, each drawn in its colour. A category without a colour of its own takes the colour of its place in the list from the palette (see Look).',
  role: 'What a variable is in the story, such as a stress or a trigger, drawn as the shape of its glyph.',
  linkType: 'Kinds of link, each drawn its own way.',
  field: 'Values of your own that variables or links can carry, such as a region or a strength.',
};

const itemsOf = (project: Project, kind: TypeKind): readonly Item[] =>
  kind === 'category'
    ? project.types.categories
    : kind === 'role'
      ? project.types.roles
      : kind === 'linkType'
        ? project.types.linkTypes
        : project.types.fields;

const shapeName = (shape: string) => {
  const text = shape.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const SHAPE_OPTIONS = SHAPES.map((s) => ({ value: s, label: shapeName(s) }));

const KIND_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'choice', label: 'One of a list' },
  { value: 'boolean', label: 'Yes or no' },
];

const REACH_OPTIONS = [
  { value: 'variables', label: 'Variables' },
  { value: 'links', label: 'Links' },
  { value: 'both', label: 'Both' },
];

/** The options of a choice field from lines of text: one per line, ids made from the names. */
function optionsFrom(text: string, existing: Field['options'] = []) {
  const taken = new Set(existing.map((o) => o.id));
  const names = [...new Set(text.split('\n').map((line) => line.trim()))].filter(Boolean);
  return names.map((name) => {
    const id = uniqueId(slugify(name), taken, 'option');
    taken.add(id);
    return { id, name };
  });
}

/** A category's colour: one of its own, written as #rrggbb, or the palette's. */
function CategoryColour({ category, drawn }: { category: Category; drawn: string }) {
  const edit = useEdit();
  const project = useStudio((s) => s.project);
  const [draft, setDraft] = useState(category.colour ?? '');
  useEffect(() => setDraft(category.colour ?? ''), [category.colour]);
  const commit = (value: string) => {
    const colour = value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(colour) || colour.toLowerCase() === category.colour?.toLowerCase()) return;
    edit((p) => setType(p, 'category', category.id, { colour: colour.toUpperCase() }));
  };
  const palette = [...paletteOf(project.theme).colours];
  const input = useRef<HTMLInputElement>(null);
  return (
    <Stack gap={4}>
      <ColorInput
        ref={input}
        label="Colour"
        size="sm"
        format="hex"
        value={draft}
        placeholder={`The palette's: ${drawn}`}
        swatches={palette}
        swatchesPerRow={8}
        onChange={setDraft}
        // A colour picked or a swatch clicked counts at once; one being typed, when the field is left.
        onChangeEnd={(value) => {
          if (document.activeElement !== input.current) commit(value);
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(draft);
        }}
        popoverProps={{ withinPortal: true }}
      />
      {category.colour && (
        <Button
          size="compact-xs"
          variant="subtle"
          w="fit-content"
          onClick={() => edit((p) => setType(p, 'category', category.id, { colour: null }))}
        >
          Use the palette's colour instead
        </Button>
      )}
    </Stack>
  );
}

function CategoryEditor({ item, drawn }: { item: Category; drawn: string }) {
  const edit = useEdit();
  return (
    <Stack gap="xs">
      <CommitText
        label="Name"
        value={item.name}
        required
        onCommit={(name) => name && edit((p) => setType(p, 'category', item.id, { name }))}
      />
      <CategoryColour category={item} drawn={drawn} />
      <CommitText
        label="Description"
        value={item.description ?? ''}
        multiline
        onCommit={(description) => edit((p) => setType(p, 'category', item.id, { description }))}
      />
    </Stack>
  );
}

function RoleEditor({ item }: { item: Role }) {
  const edit = useEdit();
  return (
    <Stack gap="xs">
      <CommitText
        label="Name"
        value={item.name}
        required
        onCommit={(name) => name && edit((p) => setType(p, 'role', item.id, { name }))}
      />
      <Select
        label="Shape"
        size="sm"
        value={item.shape}
        data={SHAPE_OPTIONS}
        allowDeselect={false}
        onChange={(shape) =>
          shape && edit((p) => setType(p, 'role', item.id, { shape: shape as Role['shape'] }))
        }
        renderOption={({ option }) => (
          <Group gap="xs" wrap="nowrap">
            <Glyph shape={option.value as Role['shape']} colour="var(--mantine-color-text)" size={16} />
            {option.label}
          </Group>
        )}
        comboboxProps={{ withinPortal: true }}
      />
      <Switch
        label="A response"
        description="A deliberate action against the pressures, such as a policy. Pulses arriving at one show relief."
        checked={item.response === true}
        onChange={(e) =>
          edit((p) => setType(p, 'role', item.id, { response: e.currentTarget.checked ? true : null }))
        }
      />
      <CommitText
        label="Description"
        value={item.description ?? ''}
        multiline
        onCommit={(description) => edit((p) => setType(p, 'role', item.id, { description }))}
      />
    </Stack>
  );
}

function LinkTypeEditor({ item }: { item: LinkType }) {
  const edit = useEdit();
  return (
    <Stack gap="xs">
      <CommitText
        label="Name"
        value={item.name}
        required
        onCommit={(name) => name && edit((p) => setType(p, 'linkType', item.id, { name }))}
      />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Line
        </Text>
        <SegmentedControl
          size="xs"
          value={item.style ?? 'solid'}
          data={[
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'dotted', label: 'Dotted' },
          ]}
          onChange={(style) =>
            edit((p) =>
              setType(p, 'linkType', item.id, {
                style: style === 'solid' ? null : (style as LinkType['style']),
              }),
            )
          }
          aria-label="Line"
        />
      </Stack>
      <Switch
        label="A flag at the middle"
        checked={item.marker === 'flag'}
        onChange={(e) =>
          edit((p) => setType(p, 'linkType', item.id, { marker: e.currentTarget.checked ? 'flag' : null }))
        }
      />
      <Switch
        label="Optional"
        description="Not part of the main structure: hidden until a story step names them, and left out of automatic loop counts."
        checked={item.optional === true}
        onChange={(e) =>
          edit((p) => setType(p, 'linkType', item.id, { optional: e.currentTarget.checked ? true : null }))
        }
      />
      <CommitText
        label="Description"
        value={item.description ?? ''}
        multiline
        onCommit={(description) => edit((p) => setType(p, 'linkType', item.id, { description }))}
      />
    </Stack>
  );
}

/** A choice field's options: renamed, removed or added; ids stay. */
function FieldOptions({ field }: { field: Field }) {
  const edit = useEdit();
  const [name, setName] = useState('');
  const options = field.options ?? [];
  const add = () => {
    const made = optionsFrom(name, options);
    if (!made.length) return;
    if (edit((p) => setType(p, 'field', field.id, { options: [...options, ...made] }))) setName('');
  };
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        Options
      </Text>
      {options.map((option, i) => (
        <Group key={option.id} gap={6} wrap="nowrap" align="flex-end">
          <div style={{ flex: 1 }}>
            <CommitText
              label={`Option ${i + 1}`}
              value={option.name}
              required
              onCommit={(next) =>
                next &&
                edit((p) =>
                  setType(p, 'field', field.id, {
                    options: options.map((o) => (o.id === option.id ? { ...o, name: next } : o)),
                  }),
                )
              }
            />
          </div>
          <Tooltip label="Remove this option">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label={`Remove the option ${option.name}`}
              disabled={options.length === 1}
              onClick={() =>
                edit((p) =>
                  setType(p, 'field', field.id, { options: options.filter((o) => o.id !== option.id) }),
                )
              }
            >
              <IconTrash size={16} aria-hidden />
            </ActionIcon>
          </Tooltip>
        </Group>
      ))}
      <Group gap={6} wrap="nowrap">
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          aria-label="New option"
          placeholder="New option"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <Button size="compact-sm" variant="default" onClick={add} disabled={!name.trim()}>
          Add
        </Button>
      </Group>
    </Stack>
  );
}

/** A field's kind: changed only while nothing holds a value of it, so no value is ever converted. */
function FieldKind({ field, held }: { field: Field; held: number }) {
  const edit = useEdit();
  const [choosing, setChoosing] = useState(false);
  const [lines, setLines] = useState('');
  const label = KIND_OPTIONS.find((k) => k.value === field.kind)?.label ?? field.kind;
  if (held > 0) {
    return (
      <Text size="sm">
        <b>Kind:</b> {label}.{' '}
        <Text span size="xs" c="dimmed">
          {plural(held, 'value')} of it {held === 1 ? 'is' : 'are'} on the map, so its kind stays.
        </Text>
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      <Select
        label="Kind"
        size="sm"
        value={choosing ? 'choice' : field.kind}
        data={KIND_OPTIONS}
        allowDeselect={false}
        onChange={(kind) => {
          if (!kind || kind === field.kind) {
            setChoosing(false);
            return;
          }
          if (kind === 'choice') {
            setChoosing(true);
            return;
          }
          setChoosing(false);
          edit((p) => setType(p, 'field', field.id, { kind: kind as Field['kind'], options: null }));
        }}
        comboboxProps={{ withinPortal: true }}
      />
      {choosing && (
        <>
          <Textarea
            size="sm"
            label="Its options, one per line"
            autosize
            minRows={3}
            value={lines}
            onChange={(e) => setLines(e.currentTarget.value)}
          />
          <Group gap={6}>
            <Button
              size="compact-sm"
              disabled={optionsFrom(lines).length === 0}
              onClick={() => {
                const options = optionsFrom(lines);
                if (edit((p) => setType(p, 'field', field.id, { kind: 'choice', options }))) {
                  setChoosing(false);
                  setLines('');
                }
              }}
            >
              Make it one of a list
            </Button>
            <Button size="compact-sm" variant="default" onClick={() => setChoosing(false)}>
              Cancel
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

function FieldEditor({ item, held }: { item: Field; held: number }) {
  const edit = useEdit();
  return (
    <Stack gap="xs">
      <CommitText
        label="Name"
        value={item.name}
        required
        onCommit={(name) => name && edit((p) => setType(p, 'field', item.id, { name }))}
      />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Carried by
        </Text>
        <SegmentedControl
          size="xs"
          value={item.appliesTo ?? 'both'}
          data={REACH_OPTIONS}
          onChange={(reach) =>
            edit((p) =>
              setType(p, 'field', item.id, {
                appliesTo: reach === 'both' ? null : (reach as Field['appliesTo']),
              }),
            )
          }
          aria-label="Carried by"
        />
      </Stack>
      <FieldKind field={item} held={held} />
      {item.kind === 'choice' && <FieldOptions field={item} />}
      <CommitText
        label="Description"
        value={item.description ?? ''}
        multiline
        onCommit={(description) => edit((p) => setType(p, 'field', item.id, { description }))}
      />
    </Stack>
  );
}

/** What a type's uses lose when it is removed. */
const REMOVAL: Record<TypeKind, string> = {
  category: 'The variables lose it, and groups drawn in it are removed.',
  role: 'The variables lose their role.',
  linkType: 'The links lose their type.',
  field: 'Their values of it are removed.',
};

function TypeRow({
  kind,
  item,
  index,
  count,
  open,
  onToggle,
  colour,
}: {
  kind: TypeKind;
  item: Item;
  index: number;
  count: number;
  open: boolean;
  onToggle(): void;
  /** A category's colour as drawn. */
  colour: string;
}) {
  const project = useStudio((s) => s.project);
  const edit = useEdit();
  const uses = typeUses(project, kind, item.id).filter((u) => u.ids.length);
  const usedBy = listing(uses.map((u) => plural(u.ids.length, u.what)));
  const held = uses.reduce((n, u) => n + u.ids.length, 0);
  const remove = () => {
    if (uses.length) {
      const how = kind === 'field' ? `${usedBy} hold a value of it` : `it is used by ${usedBy}`;
      const what = NAME[kind].charAt(0).toUpperCase() + NAME[kind].slice(1);
      if (!window.confirm(`${what} "${item.name}": ${how}. ${REMOVAL[kind]} Remove it?`)) return;
    }
    edit((p) => removeType(p, kind, item.id, { cascade: true }));
  };
  const mark =
    kind === 'category' ? (
      <ColorSwatch color={colour} size={16} aria-hidden />
    ) : kind === 'role' ? (
      <Glyph shape={(item as Role).shape} colour="var(--mantine-color-text)" size={18} />
    ) : null;
  return (
    <Paper withBorder radius="sm" className="lw-type-row">
      <Group gap={6} wrap="nowrap" px={8} py={6}>
        <UnstyledButton
          onClick={onToggle}
          aria-expanded={open}
          style={{ flex: 1, minWidth: 0 }}
          aria-label={`${item.name}: ${open ? 'close' : 'edit'}`}
        >
          <Group gap={8} wrap="nowrap">
            {open ? <IconChevronDown size={14} aria-hidden /> : <IconChevronRight size={14} aria-hidden />}
            {mark}
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>
                {item.name}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {kind === 'field'
                  ? `${KIND_OPTIONS.find((k) => k.value === (item as Field).kind)?.label} · ${held ? `${plural(held, 'value')}` : 'no values yet'}`
                  : uses.length
                    ? usedBy
                    : 'Not used yet'}
              </Text>
            </div>
          </Group>
        </UnstyledButton>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Move ${item.name} up`}
          disabled={index === 0}
          onClick={() => edit((p) => moveType(p, kind, item.id, index - 1))}
        >
          <IconArrowUp size={16} aria-hidden />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={`Move ${item.name} down`}
          disabled={index === count - 1}
          onClick={() => edit((p) => moveType(p, kind, item.id, index + 1))}
        >
          <IconArrowDown size={16} aria-hidden />
        </ActionIcon>
        <ActionIcon variant="subtle" color="red" aria-label={`Remove ${item.name}`} onClick={remove}>
          <IconTrash size={16} aria-hidden />
        </ActionIcon>
      </Group>
      {open && (
        <div className="lw-type-editor">
          {kind === 'category' && <CategoryEditor item={item as Category} drawn={colour} />}
          {kind === 'role' && <RoleEditor item={item as Role} />}
          {kind === 'linkType' && <LinkTypeEditor item={item as LinkType} />}
          {kind === 'field' && <FieldEditor item={item as Field} held={held} />}
        </div>
      )}
    </Paper>
  );
}

/** A new one: its name, and what it cannot be without (a role's shape; a field's kind and options). */
function AddType({ kind, onAdded }: { kind: TypeKind; onAdded(id: string): void }) {
  const edit = useEdit();
  const [name, setName] = useState('');
  const [shape, setShape] = useState<string | null>(null);
  const [fieldKind, setFieldKind] = useState<string | null>(null);
  const [reach, setReach] = useState('both');
  const [lines, setLines] = useState('');
  const options = optionsFrom(lines);
  const ready =
    name.trim() !== '' &&
    (kind !== 'role' || shape !== null) &&
    (kind !== 'field' || (fieldKind !== null && (fieldKind !== 'choice' || options.length > 0)));
  const add = () => {
    if (!ready) return;
    const label = name.trim();
    const out = edit((p) => {
      if (kind === 'role') return addType(p, 'role', { name: label, shape: shape as Role['shape'] });
      if (kind === 'field') {
        return addType(p, 'field', {
          name: label,
          kind: fieldKind as Field['kind'],
          ...(reach === 'both' ? {} : { appliesTo: reach as Field['appliesTo'] }),
          ...(fieldKind === 'choice' ? { options } : {}),
        });
      }
      return addType(p, kind, { name: label });
    });
    if (!out) return;
    setName('');
    setLines('');
    onAdded(out.result.id);
  };
  return (
    <Paper withBorder radius="sm" p={8} className="lw-type-add">
      <Stack gap={6}>
        <Group gap={6} wrap="nowrap" align="flex-end">
          <TextInput
            size="xs"
            style={{ flex: 1 }}
            label={`New ${NAME[kind]}`}
            placeholder="Its name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
          <Button size="compact-sm" onClick={add} disabled={!ready}>
            Add
          </Button>
        </Group>
        {kind === 'role' && (
          <Select
            size="xs"
            label="Its shape"
            placeholder="Choose a shape"
            value={shape}
            data={SHAPE_OPTIONS}
            onChange={setShape}
            comboboxProps={{ withinPortal: true }}
          />
        )}
        {kind === 'field' && (
          <>
            <Select
              size="xs"
              label="Its kind"
              placeholder="Choose a kind"
              value={fieldKind}
              data={KIND_OPTIONS}
              onChange={setFieldKind}
              comboboxProps={{ withinPortal: true }}
            />
            {fieldKind === 'choice' && (
              <Textarea
                size="xs"
                label="Its options, one per line"
                autosize
                minRows={2}
                value={lines}
                onChange={(e) => setLines(e.currentTarget.value)}
              />
            )}
            <SegmentedControl
              size="xs"
              value={reach}
              data={REACH_OPTIONS}
              onChange={setReach}
              aria-label="Carried by"
            />
          </>
        )}
      </Stack>
    </Paper>
  );
}

function TypeList({ kind }: { kind: TypeKind }) {
  const project = useStudio((s) => s.project);
  const items = itemsOf(project, kind);
  const colours = useMemo(() => categoryColours(project), [project]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed">
        {ABOUT[kind]}
      </Text>
      {items.length === 0 && (
        <Text size="sm" c="dimmed">
          No {NAME[kind]}s yet.
        </Text>
      )}
      {items.map((item, index) => (
        <TypeRow
          key={item.id}
          kind={kind}
          item={item}
          index={index}
          count={items.length}
          open={open === item.id}
          onToggle={() => setOpen(open === item.id ? null : item.id)}
          colour={colours.get(item.id) ?? 'transparent'}
        />
      ))}
      <AddType key={kind} kind={kind} onAdded={setOpen} />
    </Stack>
  );
}

export function TypesPanel() {
  const [kind, setKind] = useState<TypeKind>('category');
  return (
    <ScrollArea className="lw-inspector" type="auto" offsetScrollbars>
      <div className="lw-inspector-body">
        <Stack gap="sm">
          <Title order={2} size="h5">
            Types
          </Title>
          <SegmentedControl
            size="xs"
            fullWidth
            value={kind}
            onChange={(value) => setKind(value as TypeKind)}
            data={LISTS}
            aria-label="Which types"
          />
          <TypeList key={kind} kind={kind} />
        </Stack>
      </div>
    </ScrollArea>
  );
}
