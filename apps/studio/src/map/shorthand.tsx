// Source: DataViz packages/web/src/data/shorthand-panel.tsx @ efcdbe2 (TashiikiD/DataViz, private), adapted
// for Loopweft: the same live preview and list of problems, for Loopweft's shorthand (variables, links and
// @group categories), added to the map as one undoable step.
//
// The shorthand box: links written as text ("Births -> Population (+)"), read as they are typed with the
// parser `loopweft add` uses, then added to the map as one step.
import {
  applyShorthand,
  type OpOutput,
  type Project,
  parseShorthand,
  plural,
  ShorthandError,
  type ShorthandIssue,
  type ShorthandResult,
} from '@loopweft/model';
import {
  Anchor,
  Button,
  Code,
  Group,
  List,
  Popover,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEdit, useStudio, useStudioStore } from '../context.tsx';

type Preview =
  | { out: OpOutput<ShorthandResult>; issues?: undefined }
  | { out?: undefined; issues: ShorthandIssue[] };

const byPosition = (a: ShorthandIssue, b: ShorthandIssue) => a.line - b.line || a.column - b.column;

/**
 * Runs the shorthand on the map (the map is not changed). When it cannot be applied, the errors come back
 * instead of being thrown, with the parse's warnings, so everything to fix shows at once.
 */
export function previewShorthand(project: Project, text: string): Preview | null {
  if (!text.trim()) return null;
  try {
    return { out: applyShorthand(project, text) };
  } catch (error) {
    const errors =
      error instanceof ShorthandError
        ? error.issues
        : [{ severity: 'error' as const, line: 1, column: 1, message: (error as Error).message }];
    const warnings = parseShorthand(text).issues.filter((i) => i.severity === 'warning');
    return { issues: [...errors, ...warnings].sort(byPosition) };
  }
}

/** Unsent shorthand survives switching panels and reloading this tab, never other tabs. */
const DRAFT_KEY = 'loopweft.shorthand';
function readDraft(): string {
  try {
    return sessionStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}
function writeDraft(text: string): void {
  try {
    if (text) sessionStorage.setItem(DRAFT_KEY, text);
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage may be unavailable (private windows); the draft then lasts as long as the panel.
  }
}

/** Character offset of a 1-based line and column in `text`. */
function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += (lines[i] as string).length + 1;
  return offset + Math.max(0, column - 1);
}

const EXAMPLES = [
  'Births -> Population (+)',
  'Population -> Deaths (+, delay "5 yrs")',
  'Deaths -> Population (-)',
  'Fertility -> Births (?, conf=M)',
  '@group Demography: Births, Population, Deaths',
];

function SyntaxHelp() {
  return (
    <Popover width={340} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Button variant="subtle" size="compact-sm">
          How to write it
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm">
            One link per line: the cause, an arrow (-&gt;, --&gt; or →), the effect, then in brackets:
          </Text>
          <List size="sm" spacing={2}>
            <List.Item>its sign: + (the same way), - (the opposite way) or ? (not known)</List.Item>
            <List.Item>delay, perhaps with how long: delay "5 yrs"</List.Item>
            <List.Item>conf= (low, medium, high) and weight=</List.Item>
            <List.Item>type=, conditional=, rationale="…" or a custom field by its name</List.Item>
          </List>
          <Text size="sm">
            Names match the map's variables by name or id; a new name becomes a new variable. @group puts
            variables in a category.
          </Text>
          <Code block>{EXAMPLES.join('\n')}</Code>
          <Text size="xs" c="dimmed">
            Quote a name that holds an arrow, a comma or brackets: "Cost (USD)" -&gt; Demand (+). Lines
            starting with # are comments.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function IssueList({
  issues,
  onJump,
}: {
  issues: ShorthandIssue[];
  onJump: (issue: ShorthandIssue) => void;
}) {
  return (
    <List listStyleType="none" spacing={2} aria-label="Shorthand problems">
      {issues.map((issue) => (
        // A button in each item, so assistive technology announces something to press.
        <List.Item key={`${issue.severity}:${issue.line}:${issue.column}:${issue.message}`}>
          <UnstyledButton onClick={() => onJump(issue)}>
            <Text size="sm" c={issue.severity === 'error' ? 'red' : 'yellow.8'}>
              {issue.severity === 'error' ? 'Error' : 'Warning'}, line {issue.line}, column {issue.column}:{' '}
              {issue.message}
            </Text>
          </UnstyledButton>
        </List.Item>
      ))}
    </List>
  );
}

const labelOf = (project: Project, id: string): string =>
  project.variables.find((v) => v.id === id)?.label ?? id;

export function ShorthandPanel() {
  const store = useStudioStore();
  const edit = useEdit();
  const project = useStudio((s) => s.project);
  const [text, setText] = useState(readDraft);
  const [typed] = useDebouncedValue(text, 200);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => writeDraft(text), [text]);

  const preview = useMemo(() => previewShorthand(project, typed), [project, typed]);
  const current = typed === text ? preview : null;
  const result = current?.out?.result;
  const issues = current?.issues ?? result?.warnings ?? [];
  const changes = result
    ? result.addedLinks.length + result.addedVariables.length + result.parse.groups.length
    : 0;

  const jump = (issue: ShorthandIssue) => {
    const element = area.current;
    if (!element) return;
    const at = offsetOf(text, issue.line, issue.column);
    element.focus();
    element.setSelectionRange(at, at);
  };

  const add = () => {
    if (!previewShorthand(store.getState().project, text)?.out) return;
    const out = edit((p) => applyShorthand(p, text), 'Add from shorthand');
    if (!out) return;
    setText('');
    const { addedLinks, addedVariables, warnings } = out.result;
    store.getState().select({ variables: addedVariables, links: addedLinks, loop: null });
    notifications.show({
      title: `Added ${plural(addedLinks.length, 'link')} and ${plural(addedVariables.length, 'variable')}`,
      message: `${warnings.length ? `${plural(warnings.length, 'warning')} to look at: ${warnings[0]?.message} ` : ''}Ctrl+Z takes it back.`,
      autoClose: 6000,
    });
  };

  return (
    <div className="lw-panel-body">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Title order={2} size="h5">
            Add links as text
          </Title>
          <SyntaxHelp />
        </Group>
        <Textarea
          ref={area}
          aria-label="Shorthand"
          placeholder={EXAMPLES.slice(0, 3).join('\n')}
          autosize
          minRows={6}
          maxRows={18}
          ff="monospace"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              add();
            }
          }}
          spellCheck={false}
        />
        {result && (
          <Text size="sm" aria-live="polite">
            {[
              plural(result.addedLinks.length, 'link'),
              `${plural(result.addedVariables.length, 'new variable')}${
                result.addedVariables.length
                  ? ` (${result.addedVariables.map((id) => labelOf(current?.out?.project ?? project, id)).join(', ')})`
                  : ''
              }`,
              ...(result.matchedVariables.length
                ? [`uses ${result.matchedVariables.map((id) => labelOf(project, id)).join(', ')}`]
                : []),
              ...(result.parse.groups.length ? [plural(result.parse.groups.length, 'group line')] : []),
            ].join(' · ')}
          </Text>
        )}
        {issues.length > 0 && <IssueList issues={issues} onJump={jump} />}
        <Group justify="flex-end" gap="xs">
          {text && (
            <Anchor component="button" type="button" size="sm" onClick={() => setText('')}>
              Clear
            </Anchor>
          )}
          <Button size="compact-md" onClick={add} disabled={!result || changes === 0}>
            {result?.addedLinks.length ? `Add ${plural(result.addedLinks.length, 'link')}` : 'Add'}
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          Ctrl+Enter adds. Nothing changes while a line has an error.
        </Text>
      </Stack>
    </div>
  );
}
