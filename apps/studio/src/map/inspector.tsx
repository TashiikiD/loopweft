// What is selected, to read and change: a variable, a link, several of them, or (with nothing selected) the
// project itself and the problems its checks find. Every change is one of the model's operations.
import {
  type Citation,
  type Field,
  type FieldValue,
  formatPath,
  type Issue,
  type Link,
  type Project,
  setBends,
  setLabelSide,
  setLink,
  setMeta,
  setPinned,
  setVariable,
  signText,
  type Variable,
  validateProject,
} from '@loopweft/model';
import {
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  ScrollArea,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useMemo } from 'react';
import { useEdit, useStudio, useStudioStore } from '../context.tsx';
import { useGraph } from './canvas.tsx';
import { ChoiceInput, CommitText, FieldInput, NumberValue } from './inputs.tsx';

const fieldsFor = (project: Project, carrier: 'variables' | 'links') =>
  project.types.fields.filter(
    (f) => (f.appliesTo ?? 'both') !== (carrier === 'links' ? 'variables' : 'links'),
  );

/** The values of an element's custom fields after one is set or cleared, or null when none is left. */
function withField(values: Record<string, FieldValue> | undefined, field: Field, value: FieldValue | null) {
  const next = { ...(values ?? {}) };
  if (value === null) delete next[field.id];
  else next[field.id] = value;
  return Object.keys(next).length ? next : null;
}

function Citations({ citations, project }: { citations: Citation[]; project: Project }) {
  if (citations.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No source cited yet.
      </Text>
    );
  }
  return (
    <Stack gap={4}>
      {citations.map((c, i) => {
        const source = project.sources.find((s) => s.id === c.source);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: citations of one element, in their order
          <Text key={i} size="sm">
            {source?.label ?? c.source}
            {c.pages ? `, p. ${c.pages}` : ''}
            {c.note ? ` (${c.note})` : ''}
            {c.strength ? ` · ${c.strength}` : ''}
          </Text>
        );
      })}
    </Stack>
  );
}

function VariableInspector({ variable }: { variable: Variable }) {
  const project = useStudio((s) => s.project);
  const edit = useEdit();
  const set = (changes: Parameters<typeof setVariable>[2]) =>
    edit((p) => setVariable(p, variable.id, changes));
  const position = project.layout.positions[variable.id];
  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Title order={2} size="h5">
          Variable
        </Title>
        <Badge variant="light" color="gray" style={{ textTransform: 'none' }}>
          {variable.id}
        </Badge>
      </Group>
      <CommitText
        label="Name"
        value={variable.label}
        required
        onCommit={(label) => label && set({ label })}
      />
      <CommitText
        label="Name on the map"
        description="Shorter, if the name is long; a new line breaks it."
        value={variable.mapLabel ?? ''}
        multiline
        onCommit={(mapLabel) => set({ mapLabel })}
      />
      <ChoiceInput
        label="Category"
        value={variable.category}
        options={project.types.categories.map((c) => ({ value: c.id, label: c.name }))}
        onChange={(category) => set({ category })}
      />
      <ChoiceInput
        label="Role"
        value={variable.role}
        options={project.types.roles.map((r) => ({ value: r.id, label: r.name }))}
        onChange={(role) => set({ role })}
      />
      <CommitText
        label="Definition"
        description="What exactly rises or falls."
        value={variable.definition ?? ''}
        multiline
        onCommit={(definition) => set({ definition })}
      />
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Size
        </Text>
        <SegmentedControl
          size="xs"
          value={variable.size ?? 'normal'}
          data={[
            { value: 'normal', label: 'Normal' },
            { value: 'large', label: 'Large (a hub)' },
          ]}
          onChange={(size) => set({ size: size === 'large' ? 'large' : null })}
          aria-label="Size"
        />
      </Stack>
      {fieldsFor(project, 'variables').map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          value={variable.fields?.[field.id]}
          onChange={(value) => set({ fields: withField(variable.fields, field, value) })}
        />
      ))}
      <Divider label="On the map" labelPosition="left" />
      {position ? (
        <>
          <Text size="sm" c="dimmed">
            At {Math.round(position.x)}, {Math.round(position.y)}
          </Text>
          <Switch
            label="Pinned: automatic layouts leave it where it is"
            checked={position.pinned === true}
            onChange={(event) => edit((p) => setPinned(p, [variable.id], event.currentTarget.checked))}
          />
          <ChoiceInput
            label="Label"
            none="Placed automatically"
            value={position.labelSide}
            options={['above', 'below', 'left', 'right'].map((side) => ({
              value: side,
              label: `${side.charAt(0).toUpperCase()}${side.slice(1)}`,
            }))}
            onChange={(side) => edit((p) => setLabelSide(p, variable.id, side as 'above' | null))}
          />
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Placed by an automatic layout until it is moved.
        </Text>
      )}
      <Divider label="Sources" labelPosition="left" />
      <Citations citations={variable.citations} project={project} />
    </Stack>
  );
}

const SIGNS: { value: Link['sign']; label: string }[] = [
  { value: '+', label: '+ same' },
  { value: '-', label: '− opposite' },
  { value: '?', label: '? unknown' },
];

function LinkInspector({ link }: { link: Link }) {
  const project = useStudio((s) => s.project);
  const store = useStudioStore();
  const edit = useEdit();
  const set = (changes: Parameters<typeof setLink>[2]) => edit((p) => setLink(p, link.id, changes));
  const name = (id: string) => project.variables.find((v) => v.id === id)?.label ?? id;
  const bend = project.layout.bends[link.id];
  // The curve it is drawn with now: set by hand, or chosen automatically.
  const drawn = useGraph(project).edges.get(link.id)?.bend;
  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Title order={2} size="h5">
          Link
        </Title>
        <Badge variant="light" color="gray" style={{ textTransform: 'none' }}>
          {link.id}
        </Badge>
      </Group>
      <Text size="sm">
        <Anchor
          component="button"
          onClick={() => store.getState().select({ variables: [link.from], links: [] })}
        >
          {name(link.from)}
        </Anchor>{' '}
        → {signText(link.sign)} →{' '}
        <Anchor
          component="button"
          onClick={() => store.getState().select({ variables: [link.to], links: [] })}
        >
          {name(link.to)}
        </Anchor>
      </Text>
      <Stack gap={4}>
        <Text size="sm" fw={500}>
          Sign
        </Text>
        <SegmentedControl
          size="xs"
          value={link.sign}
          data={SIGNS}
          onChange={(sign) => set({ sign: sign as Link['sign'] })}
          aria-label="Sign"
        />
        <Text size="xs" c="dimmed">
          + : the effect moves the same way as the cause; − : the opposite way; ? : not known (flagged).
        </Text>
      </Stack>
      <ChoiceInput
        label="Type"
        value={link.type}
        options={project.types.linkTypes.map((t) => ({ value: t.id, label: t.name }))}
        onChange={(type) => set({ type })}
      />
      <Switch
        label="Conditional: holds only under some conditions"
        checked={link.conditional === true}
        onChange={(event) => set({ conditional: event.currentTarget.checked ? true : null })}
      />
      <Switch
        label="Delayed: takes notably long"
        checked={link.delay === true}
        onChange={(event) =>
          set(event.currentTarget.checked ? { delay: true } : { delay: null, delayLabel: null })
        }
      />
      {link.delay && (
        <CommitText
          label="How long"
          placeholder="e.g. 5 yrs"
          value={link.delayLabel ?? ''}
          onCommit={(delayLabel) => set({ delayLabel })}
        />
      )}
      <ChoiceInput
        label="Confidence"
        none="Not set"
        value={link.confidence}
        options={[
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ]}
        onChange={(confidence) => set({ confidence: confidence as Link['confidence'] | null })}
      />
      <NumberValue
        label="Weight"
        description="Relative strength, for line thickness: no units."
        value={link.weight}
        min={0}
        onCommit={(weight) => set({ weight })}
      />
      <CommitText
        label="Rationale"
        description="Why the cause moves the effect: the mechanism."
        value={link.rationale ?? ''}
        multiline
        onCommit={(rationale) => set({ rationale })}
      />
      {fieldsFor(project, 'links').map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          value={link.fields?.[field.id]}
          onChange={(value) => set({ fields: withField(link.fields, field, value) })}
        />
      ))}
      <Divider label="On the map" labelPosition="left" />
      <Stack gap={4}>
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Curve
          </Text>
          {bend === undefined ? (
            <Text size="xs" c="dimmed">
              Automatic
            </Text>
          ) : (
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => edit((p) => setBends(p, { [link.id]: null }))}
            >
              Back to automatic
            </Button>
          )}
        </Group>
        <Slider
          min={-0.6}
          max={0.6}
          step={0.02}
          value={bend ?? drawn ?? 0.12}
          label={(v) => v.toFixed(2)}
          onChangeEnd={(value) => edit((p) => setBends(p, { [link.id]: value }))}
          aria-label="Curve"
        />
      </Stack>
      <Divider label="Sources" labelPosition="left" />
      <Citations citations={link.citations} project={project} />
    </Stack>
  );
}

/** The element an issue's path points at, to select it. */
function issueTarget(project: Project, issue: Issue): Target | null {
  const [section, index] = issue.path;
  if (section === 'variables' && typeof index === 'number') {
    const v = project.variables[index];
    return v ? { variables: [v.id], links: [] } : null;
  }
  if (section === 'links' && typeof index === 'number') {
    const l = project.links[index];
    return l ? { variables: [], links: [l.id] } : null;
  }
  return null;
}

type Target = { variables?: string[]; links?: string[] };

/** One flag of the checks; a click selects what it is about. */
function IssueRow({
  issue,
  target,
  onSelect,
}: {
  issue: Issue;
  target: Target | null;
  onSelect(target: Target): void;
}) {
  const text = (
    <Text size="sm">
      <Badge size="xs" variant="light" color="yellow" mr={6} style={{ textTransform: 'none' }}>
        {issue.code}
      </Badge>
      {issue.message}
    </Text>
  );
  if (!target) return <div>{text}</div>;
  return (
    <UnstyledButton
      onClick={() => onSelect(target)}
      aria-label={`Select ${formatPath(issue.path)}: ${issue.message}`}
    >
      {text}
    </UnstyledButton>
  );
}

function ProjectInspector() {
  const project = useStudio((s) => s.project);
  const store = useStudioStore();
  const edit = useEdit();
  const issues = useMemo(() => validateProject(project), [project]);
  const warnings = issues.filter((i) => i.severity === 'warning');
  const meta = (changes: Parameters<typeof setMeta>[1]) => edit((p) => setMeta(p, changes));
  return (
    <Stack gap="sm">
      <Title order={2} size="h5">
        The map
      </Title>
      <CommitText
        label="Title"
        value={project.meta.title}
        required
        onCommit={(title) => title && meta({ title })}
      />
      <CommitText
        label="Description"
        description='What the map is and is not, e.g. "a qualitative synthesis, not a model".'
        value={project.meta.description ?? ''}
        multiline
        onCommit={(description) => meta({ description })}
      />
      <Group grow>
        <CommitText
          label="Author"
          value={project.meta.author ?? ''}
          onCommit={(author) => meta({ author })}
        />
        <CommitText
          label="Course"
          value={project.meta.course ?? ''}
          onCommit={(course) => meta({ course })}
        />
      </Group>
      <Text size="sm" c="dimmed">
        {project.variables.length} variables · {project.links.length} links · {project.loops.length} named
        loops · {project.sources.length} sources
      </Text>
      <Divider label={`To look at: ${warnings.length}`} labelPosition="left" />
      {warnings.length === 0 ? (
        <Text size="sm" c="dimmed">
          The checks find nothing to look at.
        </Text>
      ) : (
        <Stack gap={6}>
          {warnings.slice(0, 60).map((issue, i) => (
            <IssueRow
              // biome-ignore lint/suspicious/noArrayIndexKey: the issues of one check, in order
              key={i}
              issue={issue}
              target={issueTarget(project, issue)}
              onSelect={(target) => store.getState().select(target)}
            />
          ))}
          {warnings.length > 60 && (
            <Text size="sm" c="dimmed">
              … and {warnings.length - 60} more.
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function SeveralInspector({ variables, links }: { variables: number; links: number }) {
  return (
    <Stack gap="sm">
      <Title order={2} size="h5">
        Selected
      </Title>
      <Text size="sm">
        {variables} variable{variables === 1 ? '' : 's'} and {links} link{links === 1 ? '' : 's'}.
      </Text>
    </Stack>
  );
}

export function Inspector() {
  const project = useStudio((s) => s.project);
  const selection = useStudio((s) => s.selection);
  const count = selection.variables.length + selection.links.length;
  let body: React.ReactNode;
  if (count === 0) body = <ProjectInspector />;
  else if (count > 1)
    body = <SeveralInspector variables={selection.variables.length} links={selection.links.length} />;
  else if (selection.variables.length === 1) {
    const variable = project.variables.find((v) => v.id === selection.variables[0]);
    body = variable ? <VariableInspector key={variable.id} variable={variable} /> : null;
  } else {
    const link = project.links.find((l) => l.id === selection.links[0]);
    body = link ? <LinkInspector key={link.id} link={link} /> : null;
  }
  return (
    <ScrollArea className="lw-inspector" type="auto" offsetScrollbars>
      <div className="lw-inspector-body">{body}</div>
    </ScrollArea>
  );
}
