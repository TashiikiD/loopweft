// The Present workspace: presenting the open map's story, as the polycrisis talk was given. The presenter
// console and a rehearsal in one window (@loopweft/player) show over the Studio; the console opens the
// audience window (audience.html) for the projector. Each presentation is a copy of the project taken when it
// opens, so nothing edited meanwhile reaches the audience mid-talk.
import { type Project, plural, readProject, serializeProject } from '@loopweft/model';
import {
  deckOf,
  fmt,
  PresentationStore,
  presentationId,
  resetSession,
  savedSession,
  startAudience,
  startConsole,
  totalSteps,
} from '@loopweft/player';
import { Alert, Button, Card, Group, List, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudio, useStudioStore } from '../context.tsx';
import { useStoryWarnings } from '../story/checks.tsx';

type Mode = 'console' | 'rehearse';

/** A presentation: the project as it was when it opened, its text and its id. */
interface Presentation {
  project: Project;
  text: string;
  show: string;
}

function take(project: Project): Presentation | null {
  const text = serializeProject(project);
  const read = readProject(text);
  return read.ok ? { project: read.project, text, show: presentationId(text) } : null;
}

/** What the keyboard can reach in the presentation now: not in a hidden part, nor in a closed dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const reachable = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[hidden], [inert], dialog:not([open])'),
  );

/**
 * Keeps Tab inside the presentation: past its last control it comes back to the first, and Shift+Tab before
 * its first goes to the last.
 */
function keepTabInside(e: KeyboardEvent, root: HTMLElement): void {
  if (e.key !== 'Tab') return;
  // A dialog open inside it (the console's keyboard help) keeps the keys among its own controls.
  const scope = root.querySelector<HTMLElement>('dialog[open]') ?? root;
  const items = reachable(scope);
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  const outside = !(active instanceof HTMLElement) || !scope.contains(active) || active === root;
  if (e.shiftKey && (outside || active === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (outside || active === last)) {
    e.preventDefault();
    first.focus();
  }
}

/** Shows the console or the rehearsal over the whole Studio, until the presenter goes back. */
function Overlay({
  presentation,
  mode,
  onClose,
}: {
  presentation: Presentation;
  mode: Mode;
  onClose(): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // A modal over the Studio. Keys go to the presentation: focus moves into it, off the button that opened it
  // (Space would press that button again), and Tab stays inside it. The Studio behind is inert meanwhile, so
  // neither the keyboard nor a screen reader reaches what is covered. On closing, all of it comes back, and
  // the focus returns to the button that opened it.
  useEffect(() => {
    const overlay = root.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const behind = [...document.body.children].filter((el) => el !== overlay && !el.hasAttribute('inert'));
    for (const el of behind) el.setAttribute('inert', '');
    overlay?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (overlay) keepTabInside(e, overlay);
    };
    overlay?.addEventListener('keydown', onKey);
    return () => {
      overlay?.removeEventListener('keydown', onKey);
      for (const el of behind) el.removeAttribute('inert');
      opener?.focus();
    };
  }, []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const { project, show, text } = presentation;
    if (mode === 'console') {
      const c = startConsole({
        host: el,
        project,
        show,
        projectText: text,
        address: false,
        audience: {
          url: new URL(`audience.html?show=${show}`, location.href).href,
          name: `loopweft-audience-${show}`,
        },
        onClose: { label: 'Back to the Studio', run: onClose },
      });
      return () => c.dispose();
    }
    // A rehearsal keeps to itself: its own link, so it never moves an audience window still open from the
    // console (its place and clock are the presentation's, as a rehearsal's should be).
    const a = startAudience({
      host: el,
      project,
      show,
      link: `${show}-rehearsal`,
      rehearse: true,
      address: false,
      paintPage: false,
    });
    // Escape leaves the rehearsal (unless it leaves full screen first, which the browser does).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      a.dispose();
    };
  }, [presentation, mode, onClose]);
  return createPortal(
    <div
      ref={root}
      tabIndex={-1}
      className="lp-overlay"
      data-mode={mode}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'console' ? 'Presenter console' : 'Rehearsal'}
    >
      <div ref={host} className={mode === 'console' ? 'lw-present-console' : 'lp-audience'} />
      {mode === 'rehearse' && (
        <button type="button" className="lw-present-back" onClick={onClose}>
          Back to the Studio (Esc)
        </button>
      )}
    </div>,
    document.body,
  );
}

export function PresentWorkspace() {
  const store = useStudioStore();
  const project = useStudio((s) => s.project);
  const warnings = useStoryWarnings().reduce((n, g) => n + g.issues.length, 0);
  const deck = useMemo(() => deckOf(project), [project]);
  const show = useMemo(() => presentationId(serializeProject(project)), [project]);
  const [open, setOpen] = useState<{ mode: Mode; presentation: Presentation } | null>(null);
  const [, setTick] = useState(0);

  const saved = deck.scenes.length > 0 ? savedSession(deck, new PresentationStore(show), Date.now()) : null;
  const start = (mode: Mode) => {
    const presentation = take(store.getState().project);
    if (presentation) setOpen({ mode, presentation });
  };
  const close = useMemo(() => () => setOpen(null), []);

  if (deck.scenes.length === 0)
    return (
      <div className="lw-workspace">
        <div className="lw-library-detail">
          <Stack gap="md">
            <Title order={2} size="h3">
              Present
            </Title>
            <Text>This map has no story to present yet. Add scenes and steps in the Story workspace.</Text>
            <Group>
              <Button onClick={() => store.getState().showWorkspace('story')}>
                Go to the Story workspace
              </Button>
            </Group>
          </Stack>
        </div>
      </div>
    );

  const steps = totalSteps(deck);
  return (
    <div className="lw-workspace">
      <div className="lw-library-detail">
        <Stack gap="lg">
          <div>
            <Title order={2} size="h3">
              Present
            </Title>
            <Text c="dimmed" size="sm">
              {plural(deck.scenes.length, 'scene')} · {plural(steps, 'step')}
              {deck.targetSeconds > 0 ? ` · ${fmt(deck.targetSeconds)} in all` : ' · no target times'}
            </Text>
          </div>

          {warnings > 0 && (
            <Alert color="yellow" title={`The story has ${plural(warnings, 'warning')}`}>
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Text size="sm">
                  It presents all the same; the Story workspace’s Checks list them, step by step.
                </Text>
                <Button
                  size="compact-sm"
                  variant="default"
                  onClick={() => store.getState().showWorkspace('story')}
                >
                  See them
                </Button>
              </Group>
            </Alert>
          )}

          {saved && !saved.fresh && (
            <Alert color="yellow" title="This browser saved a place from an earlier run">
              <Group justify="space-between" wrap="nowrap" gap="md">
                <Text size="sm">
                  {saved.key}
                  {saved.clockMs >= 1000
                    ? ` · clock ${fmt(saved.clockMs / 1000)}${saved.clockRunning ? ' (running)' : ''}`
                    : ''}
                  . If that was a rehearsal, start again before the talk (never during it).
                </Text>
                <Button
                  size="compact-sm"
                  onClick={() => {
                    resetSession(new PresentationStore(show));
                    setTick((n) => n + 1);
                  }}
                >
                  Start again from the first step
                </Button>
              </Group>
            </Alert>
          )}

          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Card withBorder padding="lg">
              <Stack gap="xs" h="100%">
                <Title order={3} size="h4">
                  Presenter console
                </Title>
                <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                  Your private view: each step beside its notes, script, cues, clocks and the evidence for
                  what is on screen. It opens the audience window for the projector.
                </Text>
                <Group>
                  <Button onClick={() => start('console')}>Open the console</Button>
                </Group>
              </Stack>
            </Card>
            <Card withBorder padding="lg">
              <Stack gap="xs" h="100%">
                <Title order={3} size="h4">
                  Rehearse in one window
                </Title>
                <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                  The slides alone, as the room sees them. N shows rehearsal notes with the clock (T starts
                  it); F is full screen; Esc comes back here.
                </Text>
                <Group>
                  <Button variant="default" onClick={() => start('rehearse')}>
                    Rehearse
                  </Button>
                </Group>
              </Stack>
            </Card>
          </SimpleGrid>

          <div>
            <Title order={3} size="h5" mb="xs">
              Presentation day
            </Title>
            <List type="ordered" size="sm" spacing={4}>
              <List.Item>If a saved place from a rehearsal shows above, start again first.</List.Item>
              <List.Item>
                Connect the projector and extend the desktop onto it (Windows: the Windows key + P, then
                Extend; Mac: System Settings, Displays).
              </List.Item>
              <List.Item>Open the console here, on the laptop’s screen.</List.Item>
              <List.Item>
                Click Send to projector (Chrome or Edge: the first time, allow the browser to place windows),
                or Open audience window and drag it onto the projector.
              </List.Item>
              <List.Item>Click the audience window once and press F for full screen.</List.Item>
              <List.Item>Press T in the console when you start speaking. → or a clicker moves on.</List.Item>
            </List>
            <Text size="sm" c="dimmed" mt="sm">
              The presentation is the map as it is when the console opens: changes made later show the next
              time it opens. Keep this tab open while presenting: the audience window gets the map from the
              console. To share the story, or to present without the Studio, export it as one HTML file
              (Export).
            </Text>
          </div>
        </Stack>
      </div>
      {open && <Overlay presentation={open.presentation} mode={open.mode} onClose={close} />}
    </div>
  );
}
