// Changing where things are drawn: moving and pinning variables, label sides, link curves, the home view,
// and taking in an automatic layout. The layouts themselves are computed by @loopweft/layout, which hands
// its result to `applyLayout` here, so the Studio and the command line record the same change.
import {
  type Group,
  GroupSchema,
  type Layout,
  LayoutSchema,
  type Position,
  PositionSchema,
  type Project,
} from '../schema.ts';
import {
  listing,
  OpError,
  type OpOutput,
  parseElement,
  plural,
  resolveVariable,
  sameJson,
} from './support.ts';

type Side = NonNullable<Position['labelSide']>;

const SIDE_WORDS: Record<Side, string> = {
  above: 'above it',
  below: 'below it',
  left: 'to its left',
  right: 'to its right',
};
export type HomeView = NonNullable<Layout['home']>;

const finite = (n: number) => typeof n === 'number' && Number.isFinite(n);

/**
 * Moves variables (named by id or label) to new places, in map units. Their label sides and pins stay; a
 * variable without a position gets one.
 */
export function moveVariables(
  project: Project,
  moves: Readonly<Record<string, { x: number; y: number }>>,
): OpOutput<{ moved: string[] }> {
  const next = structuredClone(project);
  const moved: string[] = [];
  for (const [ref, to] of Object.entries(moves)) {
    const { variable } = resolveVariable(project, ref);
    if (!finite(to.x) || !finite(to.y)) {
      throw new OpError(
        `${variable.id} needs a position of two numbers, not ${JSON.stringify(to)}.`,
        'invalid',
      );
    }
    const old = next.layout.positions[variable.id];
    const position = parseElement(PositionSchema, { ...old, x: to.x, y: to.y }, [
      'layout',
      'positions',
      variable.id,
    ]);
    if (old && old.x === position.x && old.y === position.y) continue;
    next.layout.positions[variable.id] = position;
    moved.push(variable.id);
  }
  if (moved.length === 0) return { project, result: { moved }, summary: 'Nothing to move.' };
  return {
    project: next,
    result: { moved },
    summary: `Moved ${moved.length === 1 ? `variable ${moved[0]}` : plural(moved.length, 'variable')}.`,
  };
}

/** Pins variables, so automatic layouts leave them where they are, or unpins them. */
export function setPinned(
  project: Project,
  refs: readonly string[],
  pinned: boolean,
): OpOutput<{ changed: string[] }> {
  const next = structuredClone(project);
  const changed: string[] = [];
  for (const ref of refs) {
    const { variable } = resolveVariable(project, ref);
    const position = next.layout.positions[variable.id];
    if (!position) {
      if (!pinned) continue;
      throw new OpError(
        `${variable.id} has no position yet, so there is nowhere to pin it; place it first.`,
        'conflict',
      );
    }
    if ((position.pinned === true) === pinned) continue;
    if (pinned) position.pinned = true;
    else delete position.pinned;
    changed.push(variable.id);
  }
  const verb = pinned ? 'Pinned' : 'Unpinned';
  if (changed.length === 0) {
    return {
      project,
      result: { changed },
      summary: `Nothing to change: ${pinned ? 'already pinned' : 'not pinned'}.`,
    };
  }
  return { project: next, result: { changed }, summary: `${verb} ${listing(changed)}.` };
}

/** Sets the side a variable's label prefers, or `null` to let placement choose. */
export function setLabelSide(
  project: Project,
  ref: string,
  side: Side | null,
): OpOutput<{ id: string; side: Side | null }> {
  const { variable } = resolveVariable(project, ref);
  const position = project.layout.positions[variable.id];
  if (!position) {
    throw new OpError(
      `${variable.id} has no position yet, so its label has no side; place it first.`,
      'conflict',
    );
  }
  if ((position.labelSide ?? null) === side) {
    return {
      project,
      result: { id: variable.id, side },
      summary: `Nothing to change: the label of ${variable.id} is already ${side ? `${side}` : 'placed automatically'}.`,
    };
  }
  const updated = parseElement(PositionSchema, { ...position, labelSide: side ?? undefined }, [
    'layout',
    'positions',
    variable.id,
  ]);
  if (side === null) delete updated.labelSide;
  const next = structuredClone(project);
  next.layout.positions[variable.id] = updated;
  return {
    project: next,
    result: { id: variable.id, side },
    summary: side
      ? `The label of ${variable.id} now sits ${SIDE_WORDS[side]}.`
      : `The label of ${variable.id} is placed automatically again.`,
  };
}

/** Sets the curve of links by id (−1 to 1, positive bends left), or `null` to curve them automatically. */
export function setBends(
  project: Project,
  bends: Readonly<Record<string, number | null>>,
): OpOutput<{ set: string[]; cleared: string[] }> {
  const ids = new Set(project.links.map((l) => l.id));
  const next = structuredClone(project);
  const set: string[] = [];
  const cleared: string[] = [];
  for (const [id, bend] of Object.entries(bends)) {
    if (!ids.has(id)) throw new OpError(`No link "${id}".`, 'notFound');
    if (bend === null) {
      if (next.layout.bends[id] === undefined) continue;
      delete next.layout.bends[id];
      cleared.push(id);
      continue;
    }
    if (!finite(bend) || bend < -1 || bend > 1) {
      throw new OpError(`A bend is a number from -1 to 1; ${id} was given ${bend}.`, 'invalid');
    }
    if (next.layout.bends[id] === bend) continue;
    next.layout.bends[id] = bend;
    set.push(id);
  }
  if (set.length === 0 && cleared.length === 0) {
    return { project, result: { set, cleared }, summary: 'Nothing to change: the curves are as asked.' };
  }
  const parts = [
    set.length ? `set the curve of ${listing(set)}` : '',
    cleared.length ? `curve ${listing(cleared)} automatically again` : '',
  ].filter(Boolean);
  const text = parts.join('; ');
  return {
    project: next,
    result: { set, cleared },
    summary: `${text.charAt(0).toUpperCase()}${text.slice(1)}.`,
  };
}

/** Sets the whole-map view (a centre in map units and a zoom), or `null` to fit the map instead. */
export function setHome(project: Project, home: HomeView | null): OpOutput<{ home: HomeView | null }> {
  if (sameJson(project.layout.home ?? null, home)) {
    return {
      project,
      result: { home },
      summary: home
        ? 'Nothing to change: that is already the home view.'
        : 'Nothing to change: there is no home view.',
    };
  }
  const next = structuredClone(project);
  if (home === null) delete next.layout.home;
  else {
    const parsed = parseElement(LayoutSchema, { ...project.layout, home }, ['layout']);
    next.layout.home = parsed.home as HomeView;
  }
  return {
    project: next,
    result: { home },
    summary: home
      ? `Set the home view: centre (${home.x}, ${home.y}), zoom ${home.zoom}.`
      : 'Cleared the home view: the whole map is fitted to the stage.',
  };
}

/** The positions and groups an automatic layout gives (see @loopweft/layout `autoLayout`). */
export interface LayoutResult {
  positions: Record<string, Position>;
  groups: Group[];
}

/**
 * Takes in an automatic layout: every variable it places moves there (pinned ones stay, as the layout
 * keeps them), and its groups replace the old ones (a constellation's halos; other layouts draw none).
 * Curves set by hand stay.
 */
export function applyLayout(
  project: Project,
  layout: LayoutResult,
  description: string,
): OpOutput<{ moved: string[]; pinned: string[]; groups: { removed: string[]; added: string[] } }> {
  const next = structuredClone(project);
  const moved: string[] = [];
  const pinned: string[] = [];
  for (const v of project.variables) {
    const given = layout.positions[v.id];
    if (!given) continue;
    const old = project.layout.positions[v.id];
    if (old?.pinned) {
      pinned.push(v.id);
      continue;
    }
    const position = parseElement(
      PositionSchema,
      { ...(old?.labelSide ? { labelSide: old.labelSide } : {}), ...given, x: given.x, y: given.y },
      ['layout', 'positions', v.id],
    );
    delete position.pinned;
    if (!old || old.x !== position.x || old.y !== position.y) moved.push(v.id);
    next.layout.positions[v.id] = position;
  }
  const groups = layout.groups.map((g, i) => parseElement(GroupSchema, g, ['layout', 'groups', i]));
  const removed = project.layout.groups.map((g) => g.id).filter((id) => !groups.some((g) => g.id === id));
  const added = groups.map((g) => g.id).filter((id) => !project.layout.groups.some((g) => g.id === id));
  next.layout.groups = groups;
  if (moved.length === 0 && sameJson(project.layout.groups, groups)) {
    return {
      project,
      result: { moved, pinned, groups: { removed, added } },
      summary: `Nothing to change: the map is already laid out ${description}.`,
    };
  }
  const notes = [
    pinned.length ? `${plural(pinned.length, 'pinned variable')} stayed` : '',
    removed.length ? `removed ${plural(removed.length, 'group halo')}` : '',
    added.length ? `added ${plural(added.length, 'group halo')}` : '',
  ].filter(Boolean);
  return {
    project: next,
    result: { moved, pinned, groups: { removed, added } },
    summary: `Laid out the map ${description}: moved ${plural(moved.length, 'variable')}${notes.length ? `; ${listing(notes)}` : ''}.`,
  };
}
