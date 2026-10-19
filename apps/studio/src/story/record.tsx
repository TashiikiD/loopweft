// The record view: set up what a step shows by clicking on the stage. A tool is chosen in the bar above the
// stage; a click on a variable or a link applies it to the step, as one undoable edit:
// - Show: put it at a level (hidden … active) or back to the step's base level;
// - Trend: ▲, ▼ or ± on a variable, or none;
// - Spread: a what-if ▲/▼ from a variable, spread by sign along the lit links;
// - Pulse: each link clicked is the next hop (Shift adds it to the last hop);
// - Frame: a variable clicked joins (or leaves) what the camera frames.
// While a tool is on, hidden variables and links are drawn as dashed outlines so they can be clicked too. Every
// target the tool applies to can also be reached with Tab and applied with Enter or Space: Pulse reaches the
// links, Trend, Spread and Frame the variables, Show both. Those the step's camera leaves off the stage are
// skipped (the Map panel's lists reach them).
import { cameraTransform, circleOnStage, curveOnStage } from '@loopweft/layout';
import {
  addPulseHop,
  LEVELS,
  type Level,
  type MapState,
  type OpOutput,
  type Project,
  resolveLevels,
  setStepLevel,
  setStepMap,
  setStepTrend,
  spreadTrend,
  type Trend,
} from '@loopweft/model';
import { resolveMap, type StoryView } from '@loopweft/render';
import { Group, SegmentedControl, Text } from '@mantine/core';
import { createPortal } from 'react-dom';
import { useEdit } from '../context.tsx';

export type Tool = 'look' | 'show' | 'trend' | 'spread' | 'pulse' | 'frame';

export interface Brush {
  tool: Tool;
  level: Level | 'base';
  trend: Trend | 'none';
  direction: 'up' | 'down';
}

export const LOOK: Brush = { tool: 'look', level: 'focus', trend: 'up', direction: 'up' };

const LEVEL_NAMES: Record<Level | 'base', string> = {
  hidden: 'Hide',
  ghost: 'Ghost',
  dim: 'Dim',
  normal: 'Normal',
  focus: 'Focus',
  active: 'Active',
  base: 'Base',
};

const HINTS: Record<Tool, string> = {
  look: 'Choose a tool, then click variables and links on the stage.',
  show: 'Click variables and links to put them at this level (Base: back to the step’s base level).',
  trend: 'Click variables to mark them.',
  spread: 'Click a variable: it rises (or falls), and the change spreads by sign along the lit links.',
  pulse: 'Click links in the order the pulse travels; Shift-click adds a link to the last hop.',
  frame: 'Click variables to add them to, or take them from, what the camera frames.',
};

/** The tools above the stage. */
export function RecordBar({ brush, onChange }: { brush: Brush; onChange(next: Brush): void }) {
  return (
    <div className="lw-record-bar">
      <Group gap="xs" wrap="wrap">
        <SegmentedControl
          size="xs"
          value={brush.tool}
          onChange={(tool) => onChange({ ...brush, tool: tool as Tool })}
          data={[
            { value: 'look', label: 'Look' },
            { value: 'show', label: 'Show' },
            { value: 'trend', label: 'Trend' },
            { value: 'spread', label: 'Spread' },
            { value: 'pulse', label: 'Pulse' },
            { value: 'frame', label: 'Frame' },
          ]}
          aria-label="Record tool"
        />
        {brush.tool === 'show' && (
          <SegmentedControl
            size="xs"
            value={brush.level}
            onChange={(level) => onChange({ ...brush, level: level as Brush['level'] })}
            data={[...LEVELS, 'base' as const].map((l) => ({ value: l, label: LEVEL_NAMES[l] }))}
            aria-label="Level"
          />
        )}
        {brush.tool === 'trend' && (
          <SegmentedControl
            size="xs"
            value={brush.trend}
            onChange={(trend) => onChange({ ...brush, trend: trend as Brush['trend'] })}
            data={[
              { value: 'up', label: '▲ Up' },
              { value: 'down', label: '▼ Down' },
              { value: 'mixed', label: '± Mixed' },
              { value: 'none', label: 'None' },
            ]}
            aria-label="Trend"
          />
        )}
        {brush.tool === 'spread' && (
          <SegmentedControl
            size="xs"
            value={brush.direction}
            onChange={(direction) => onChange({ ...brush, direction: direction as 'up' | 'down' })}
            data={[
              { value: 'up', label: '▲ Rises' },
              { value: 'down', label: '▼ Falls' },
            ]}
            aria-label="What if it"
          />
        )}
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        {HINTS[brush.tool]}
      </Text>
    </div>
  );
}

/** Whether a tool does anything to a variable or a link: Show to both, Pulse to links, the rest to variables. */
export function toolApplies(tool: Tool, kind: 'variable' | 'link'): boolean {
  if (tool === 'look') return false;
  if (tool === 'show') return true;
  return tool === 'pulse' ? kind === 'link' : kind === 'variable';
}

/** The edit a click with `brush` makes on the step `key`, or null when the tool does not apply to it. */
export function pickEdit(
  brush: Brush,
  key: string,
  map: MapState,
  pick: { kind: 'variable' | 'link'; id: string; shift: boolean },
): ((p: Project) => OpOutput<unknown>) | null {
  const { kind, id, shift } = pick;
  if (!toolApplies(brush.tool, kind)) return null;
  switch (brush.tool) {
    case 'show':
      return (p) =>
        setStepLevel(
          p,
          key,
          kind === 'variable' ? 'variables' : 'links',
          [id],
          brush.level === 'base' ? null : brush.level,
        );
    case 'trend':
      return kind === 'variable'
        ? (p) => setStepTrend(p, key, [id], brush.trend === 'none' ? null : brush.trend)
        : null;
    case 'spread':
      return kind === 'variable' ? (p) => spreadTrend(p, key, id, brush.direction) : null;
    case 'pulse':
      return kind === 'link' ? (p) => addPulseHop(p, key, [id], { join: shift }) : null;
    case 'frame': {
      if (kind !== 'variable') return null;
      const fit = map.camera?.fit ?? [];
      const next = fit.includes(id) ? fit.filter((v) => v !== id) : [...fit, id];
      const camera = { ...(map.camera ?? {}) };
      if (next.length) camera.fit = next;
      else delete camera.fit;
      return (p) =>
        setStepMap(
          p,
          key,
          { camera: Object.keys(camera).length ? camera : null },
          `Step ${key}: the camera ${fit.includes(id) ? 'no longer frames' : 'frames'} ${id}.`,
        );
    }
    default:
      return null;
  }
}

/**
 * Click targets over the stage, in the step's camera: every variable and link, with hidden ones drawn as
 * dashed outlines. Drawn into the stage's top layer, so it scales with the stage. Only targets the tool applies
 * to, with some part on the stage, are in the Tab order; the others are marked as not available.
 */
export function RecordLayer({
  view,
  project,
  stepKey,
  map,
  brush,
}: {
  view: StoryView;
  project: Project;
  stepKey: string;
  map: MapState;
  brush: Brush;
}) {
  const edit = useEdit();
  const graph = view.map.graph;
  const camera = resolveMap(project, graph, map).camera;
  const levels = resolveLevels(project, map);
  const fit = new Set(map.camera?.fit ?? []);
  const hops = new Map<string, number>();
  map.pulses?.hops.forEach((hop, h) => {
    for (const id of hop) if (!hops.has(id)) hops.set(id, h + 1);
  });
  const pick = (kind: 'variable' | 'link', id: string, shift: boolean) => {
    const run = pickEdit(brush, stepKey, map, { kind, id, shift });
    if (run) edit(run);
  };
  // From the keyboard: Tab reaches each target, Enter or Space applies the tool (Shift as with a click).
  const press = (event: React.KeyboardEvent, kind: 'variable' | 'link', id: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    pick(kind, id, event.shiftKey);
  };
  const k = camera.zoom;
  const layer = (
    // biome-ignore lint/a11y/useSemanticElements: a group of SVG click targets over the stage
    <svg
      className={`lw-record-layer tool-${brush.tool}`}
      viewBox="0 0 1920 1080"
      role="group"
      aria-label="Record: click variables and links"
    >
      <g transform={cameraTransform(camera)}>
        {[...graph.edges.values()].map((e) => {
          const level = levels.links.get(e.id) ?? 'normal';
          const name = `${e.id}: ${e.source.label.replace(/\n/g, ' ')} → ${e.target.label.replace(/\n/g, ' ')} (link, ${level})`;
          // Half the 14-pixel target either side of the curve counts.
          const onStage = curveOnStage(camera, e.geom.p0, e.geom.c, e.geom.p1, 7);
          const applies = toolApplies(brush.tool, 'link');
          return (
            <g key={e.id} className={`lw-rec-edge level-${level}`}>
              {level === 'hidden' && <path className="hint" d={e.geom.d} strokeWidth={1.5 / k} />}
              {/* biome-ignore lint/a11y/useSemanticElements: an SVG click target over the stage */}
              <path
                className="hit"
                d={e.geom.d}
                strokeWidth={14 / k}
                role="button"
                tabIndex={onStage && applies ? 0 : -1}
                aria-disabled={applies ? undefined : true}
                aria-label={name}
                onClick={(event) => pick('link', e.id, event.shiftKey)}
                onKeyDown={(event) => press(event, 'link', e.id)}
              >
                <title>{name}</title>
              </path>
              {hops.has(e.id) && brush.tool === 'pulse' && (
                <text className="hop" x={e.geom.mid.x} y={e.geom.mid.y} fontSize={22 / k} strokeWidth={4 / k}>
                  {hops.get(e.id)}
                </text>
              )}
            </g>
          );
        })}
        {[...graph.nodes.values()].map((n) => {
          const level = levels.variables.get(n.id) ?? 'normal';
          const name = `${n.label.replace(/\n/g, ' ')} (variable, ${level})`;
          const onStage = circleOnStage(camera, n.x, n.y, n.r + 10 / k);
          const applies = toolApplies(brush.tool, 'variable');
          return (
            <g key={n.id} className={`lw-rec-node level-${level}`} transform={`translate(${n.x} ${n.y})`}>
              {level === 'hidden' && (
                <>
                  <circle className="hint" r={n.r + 4} strokeWidth={1.5 / k} />
                  <text className="hint-label" y={n.r + 4 + 18 / k} fontSize={15 / k}>
                    {n.label.replace(/\n/g, ' ')}
                  </text>
                </>
              )}
              {fit.has(n.id) && brush.tool === 'frame' && (
                <circle className="framed" r={n.r + 10 / k} strokeWidth={3 / k} />
              )}
              {/* biome-ignore lint/a11y/useSemanticElements: an SVG click target over the stage */}
              <circle
                className="hit"
                r={n.r + 10 / k}
                role="button"
                tabIndex={onStage && applies ? 0 : -1}
                aria-disabled={applies ? undefined : true}
                aria-label={name}
                onClick={(event) => pick('variable', n.id, event.shiftKey)}
                onKeyDown={(event) => press(event, 'variable', n.id)}
              >
                <title>{name}</title>
              </circle>
            </g>
          );
        })}
      </g>
    </svg>
  );
  return createPortal(layer, view.stage.layers.chrome);
}
