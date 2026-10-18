// A small picture of a map, for the template gallery and the import wizard: its links and variables in their
// colours on its theme's stage, without labels. Drawn from the same graph as the canvas.
import type { Project } from '@loopweft/model';
import { buildGraph, THEMES } from '@loopweft/render';
import { useMemo } from 'react';

export function MapThumbnail({
  project,
  width = 240,
  height = 135,
  label,
}: {
  project: Project;
  width?: number;
  height?: number;
  /** What the picture shows, for screen readers. */
  label: string;
}) {
  const graph = useMemo(() => buildGraph(project, { refineBends: false }), [project]);
  const theme = THEMES[project.theme.base];
  const nodes = [...graph.nodes.values()];
  const margin = 40;
  const box = nodes.length
    ? {
        x0: Math.min(...nodes.map((n) => n.x - n.r)) - margin,
        y0: Math.min(...nodes.map((n) => n.y - n.r)) - margin,
        x1: Math.max(...nodes.map((n) => n.x + n.r)) + margin,
        y1: Math.max(...nodes.map((n) => n.y + n.r)) + margin,
      }
    : { x0: 0, y0: 0, x1: 1920, y1: 1080 };
  // The stage's proportions, so every thumbnail is the same shape and the map sits in its middle.
  const w = Math.max(box.x1 - box.x0, ((box.y1 - box.y0) * width) / height);
  const h = (w * height) / width;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  return (
    <svg
      className="lw-thumbnail"
      width={width}
      height={height}
      viewBox={`${cx - w / 2} ${cy - h / 2} ${w} ${h}`}
      role="img"
      aria-label={label}
    >
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill={theme.bg} />
      {graph.groups.map((g) =>
        g.halo ? (
          <circle
            key={g.id}
            cx={g.halo.x}
            cy={g.halo.y}
            r={g.halo.r}
            fill={g.colour ?? theme.glow}
            opacity={0.08}
          />
        ) : null,
      )}
      {[...graph.edges.values()].map((e) => (
        <path
          key={e.id}
          d={e.geom.d}
          fill="none"
          stroke={e.colour}
          strokeWidth={Math.max(1.5, w / 400)}
          opacity={e.optional ? 0.25 : 0.55}
          strokeDasharray={e.conditional || e.style === 'dashed' ? `${w / 120} ${w / 160}` : undefined}
        />
      ))}
      {nodes.map((n) => (
        <circle key={n.id} cx={n.x} cy={n.y} r={Math.max(n.r, w / 110)} fill={n.colour} />
      ))}
    </svg>
  );
}
