// Where the story and the layout mention map elements, so removing an element can either refuse (the
// story still uses it) or tidy every mention away.
import { LEVELS, type LevelLists, type MapState, type Project } from '../schema.ts';

export interface Removed {
  variables: ReadonlySet<string>;
  links: ReadonlySet<string>;
  loops: ReadonlySet<string>;
}

/** The step's map without any mention of the removed elements, or null when it mentions none. */
export function pruneMap(map: MapState, removed: Removed): MapState | null {
  let changed = false;
  const keeper = (gone: ReadonlySet<string>, alsoGone?: ReadonlySet<string>) => (id: string) => {
    const keep = !gone.has(id) && !alsoGone?.has(id);
    if (!keep) changed = true;
    return keep;
  };
  const keepVariable = keeper(removed.variables);
  const keepLink = keeper(removed.links);
  const keepElement = keeper(removed.variables, removed.links);
  const keepLoop = keeper(removed.loops);

  const out = structuredClone(map);
  const lists = (levels: LevelLists | undefined, keep: (id: string) => boolean) => {
    if (!levels) return;
    for (const level of LEVELS) {
      const kept = levels[level]?.filter(keep);
      if (kept === undefined) continue;
      if (kept.length) levels[level] = kept;
      else delete levels[level];
    }
  };
  lists(out.variables, keepVariable);
  lists(out.links, keepLink);

  if (out.camera?.fit) {
    const kept = out.camera.fit.filter(keepVariable);
    if (kept.length) out.camera.fit = kept;
    else delete out.camera.fit;
    if (Object.keys(out.camera).length === 0) delete out.camera;
  }
  for (const key of ['labelText', 'trends'] as const) {
    const record = out[key];
    if (!record) continue;
    for (const id of Object.keys(record)) if (!keepVariable(id)) delete record[id];
    if (Object.keys(record).length === 0) delete out[key];
  }
  for (const key of ['loops', 'loopNames'] as const) {
    const kept = out[key]?.filter(keepLoop);
    if (kept === undefined) continue;
    if (kept.length) out[key] = kept;
    else delete out[key];
  }
  if (out.reveal) {
    const from = out.reveal.from?.filter(keepVariable);
    if (from?.length) out.reveal.from = from;
    else delete out.reveal.from;
    const sequence = out.reveal.sequence?.filter(keepElement);
    if (sequence?.length) out.reveal.sequence = sequence;
    else delete out.reveal.sequence;
  }
  if (out.pulses) {
    const hops = out.pulses.hops.map((hop) => hop.filter(keepLink)).filter((hop) => hop.length > 0);
    if (hops.length) out.pulses.hops = hops;
    else delete out.pulses;
  }
  if (out.ambient) {
    const from = out.ambient.from.filter(keepVariable);
    if (from.length) out.ambient.from = from;
    else delete out.ambient;
  }
  return changed ? out : null;
}

/** "S05.3" for step 3 of scene S05. */
export const stepKey = (sceneId: string, stepId: string): string => `${sceneId}.${stepId}`;

/** Steps whose map mentions any removed element. */
export function stepsMentioning(project: Project, removed: Removed): string[] {
  return project.story.scenes.flatMap((scene) =>
    scene.steps
      .filter((step) => pruneMap(step.map, removed) !== null)
      .map((step) => stepKey(scene.id, step.id)),
  );
}

/**
 * Removes every mention of the removed elements from `project` (in place): their layout positions and
 * bends, and their mentions in story steps. Returns the steps that changed.
 */
export function pruneMentions(project: Project, removed: Removed): string[] {
  for (const id of removed.variables) delete project.layout.positions[id];
  for (const id of removed.links) delete project.layout.bends[id];
  const changed: string[] = [];
  for (const scene of project.story.scenes) {
    for (const step of scene.steps) {
      const pruned = pruneMap(step.map, removed);
      if (pruned) {
        step.map = pruned;
        changed.push(stepKey(scene.id, step.id));
      }
    }
  }
  return changed;
}
