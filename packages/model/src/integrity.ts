// Evidence and story checks, generalized from the deck's integrity checks (PolycrisisPresentation
// src/core/integrity.ts, working copy of 2026-10-17 after 539bc8e) and the model-level parts of its
// choreography checks (src/map/check.ts @ 539bc8e), both private.
//
// They run once the references are sound (refs.ts) and report warnings: the project stays valid, but a
// person should look. The deck treated several of these as errors because it was one finished talk; in a
// project being edited they flag work still to do.
import { hasErrors, type Issue } from './issues.ts';
import { checkReferences } from './refs.ts';
import { type Citation, LEVELS, type Project } from './schema.ts';
import { atLeast, resolveLevels } from './story.ts';
import { normalizeToken } from './text/vocabulary.ts';

type Path = (string | number)[];

/** Every check: references (errors), then evidence and story (warnings). */
export function checkProject(project: Project): Issue[] {
  const references = checkReferences(project);
  if (hasErrors(references)) return references;
  return [...references, ...checkEvidence(project), ...checkStory(project)];
}

/** Uncited links, unknown signs, unused sources and other loose ends in the map and its evidence. */
export function checkEvidence(project: Project): Issue[] {
  const issues: Issue[] = [];
  const warn = (code: string, path: Path, message: string) =>
    issues.push({ severity: 'warning', code, message, path });

  const repeatedCitations = (citations: Citation[], path: Path, who: string) => {
    const seen = new Set<string>();
    citations.forEach((c, i) => {
      const key = `${c.source} ${c.pages ?? ''}`;
      if (seen.has(key)) {
        warn(
          'duplicateCitation',
          [...path, i],
          `${who} cites ${c.source}${c.pages ? ` p. ${c.pages}` : ''} twice.`,
        );
      }
      seen.add(key);
    });
  };

  const labels = new Map<string, string>();
  project.variables.forEach((v, i) => {
    const token = normalizeToken(v.label);
    const first = labels.get(token);
    if (first !== undefined) {
      warn(
        'duplicateLabel',
        ['variables', i, 'label'],
        `Variables ${first} and ${v.id} are both called "${v.label}"; names will not tell them apart.`,
      );
    } else labels.set(token, v.id);
    repeatedCitations(v.citations, ['variables', i, 'citations'], `Variable ${v.id}`);
  });

  const pairs = new Map<string, string>();
  project.links.forEach((l, i) => {
    const who = `Link ${l.id} (${l.from} → ${l.to})`;
    if (l.citations.length === 0) warn('uncitedLink', ['links', i, 'citations'], `${who} cites no source.`);
    if (l.sign === '?') {
      warn(
        'unknownSign',
        ['links', i, 'sign'],
        `${who}: its sign is unknown (?), so loops through it have no polarity and ripples stop there.`,
      );
    }
    if (l.from === l.to) warn('selfLink', ['links', i, 'to'], `${who} links ${l.from} to itself.`);
    const pair = `${l.from} ${l.to} ${l.type ?? ''}`;
    const twin = pairs.get(pair);
    if (twin !== undefined) {
      warn('duplicateLink', ['links', i], `${who} repeats ${twin}: same ends and type.`);
    } else pairs.set(pair, l.id);
    repeatedCitations(l.citations, ['links', i, 'citations'], `Link ${l.id}`);
  });

  const linkById = new Map(project.links.map((l) => [l.id, l]));
  project.loops.forEach((lp, i) => {
    const visited = lp.links.map((id) => linkById.get(id)?.from);
    const again = visited.find((v, k) => v !== undefined && visited.indexOf(v) !== k);
    if (again !== undefined) {
      warn(
        'loopRevisits',
        ['loops', i, 'links'],
        `Loop ${lp.id} passes through ${again} twice, so it is not a simple loop.`,
      );
    }
    repeatedCitations(lp.citations, ['loops', i, 'citations'], `Loop ${lp.id}`);
  });

  // A source is used when something cites it, a scene lists it, or one of its supplements is used.
  const used = new Set<string>([
    ...project.variables.flatMap((v) => v.citations.map((c) => c.source)),
    ...project.links.flatMap((l) => l.citations.map((c) => c.source)),
    ...project.loops.flatMap((l) => l.citations.map((c) => c.source)),
    ...project.story.scenes.flatMap((s) => [
      ...s.sources,
      ...s.steps.flatMap((step) =>
        step.overlays.flatMap((o) => ('citations' in o ? (o.citations ?? []).map((c) => c.source) : [])),
      ),
    ]),
  ]);
  const parentOf = new Map(project.sources.map((s) => [s.id, s.partOf]));
  for (const id of [...used]) {
    for (
      let parent = parentOf.get(id);
      parent !== undefined && !used.has(parent);
      parent = parentOf.get(parent)
    ) {
      used.add(parent);
    }
  }
  project.sources.forEach((s, i) => {
    if (!used.has(s.id)) warn('unusedSource', ['sources', i], `Source ${s.id} is not cited anywhere.`);
  });

  project.story.scenes.forEach((scene, i) => {
    if (scene.steps.length === 0)
      warn('emptyScene', ['story', 'scenes', i, 'steps'], `Scene ${scene.id} has no steps.`);
  });
  return issues;
}

/**
 * Story checks for every step: ▲/▼ trends must follow the signs of the lit links, pulses must travel
 * visible links in an order that follows them, loop names need their badges, and no id is listed twice.
 */
export function checkStory(project: Project): Issue[] {
  const issues: Issue[] = [];
  const linkById = new Map(project.links.map((l) => [l.id, l]));
  const responseRoles = new Set(project.types.roles.filter((r) => r.response).map((r) => r.id));
  const responses = new Set(
    project.variables.filter((v) => v.role !== undefined && responseRoles.has(v.role)).map((v) => v.id),
  );

  project.story.scenes.forEach((scene, s) => {
    scene.steps.forEach((step, t) => {
      const path: Path = ['story', 'scenes', s, 'steps', t, 'map'];
      const who = `Step ${scene.id}.${step.id}`;
      const warn = (code: string, at: Path, message: string) =>
        issues.push({ severity: 'warning', code, message: `${who}: ${message}`, path: [...path, ...at] });
      const map = step.map;
      const levels = resolveLevels(project, map);

      for (const kind of ['variables', 'links'] as const) {
        const seen = new Set<string>();
        for (const level of LEVELS) {
          for (const id of map[kind]?.[level] ?? []) {
            if (seen.has(id))
              warn('listedTwice', [kind, level], `${id} is listed more than once; the highest level counts.`);
            seen.add(id);
          }
        }
      }

      const trends = map.trends ?? {};
      for (const [id, trend] of Object.entries(trends)) {
        if (!atLeast(levels.variables.get(id), 'normal')) {
          warn('trendBarelyVisible', ['trends', id], `${id} is marked ${trend} but is barely visible.`);
        }
      }

      // Polarity: along a lit link, the target moves as the source does times the link's sign.
      // ± (mixed) marks a variable where opposing influences meet; the net is left open. A response at the
      // active level, with no trend of its own, counts as rising.
      for (const id of levels.litLinks) {
        const link = linkById.get(id);
        if (!link || link.sign === '?') continue;
        const given = trends[link.from];
        const rising = !given && responses.has(link.from) && levels.variables.get(link.from) === 'active';
        const source = given ?? (rising ? 'up' : undefined);
        const target = trends[link.to];
        if (!source || !target || source === 'mixed' || target === 'mixed') continue;
        const expected = (source === 'up') === (link.sign === '+') ? 'up' : 'down';
        if (target !== expected) {
          const from = rising ? `${link.from} (an active response, so up)` : `${link.from} (${source})`;
          warn(
            'trendContradictsSign',
            ['trends', link.to],
            `${link.to} is marked ${target}, but ${id} (${link.sign}) from ${from} implies ${expected}.`,
          );
        }
      }

      const reached = new Set<string>();
      map.pulses?.hops.forEach((hop, h) => {
        hop.forEach((id, k) => {
          const link = linkById.get(id);
          if (!link) return;
          if (!atLeast(levels.links.get(id), 'normal')) {
            warn(
              'pulseOnHiddenLink',
              ['pulses', 'hops', h, k],
              `a pulse runs along ${id}, which is not visible.`,
            );
          }
          if (h > 0 && !reached.has(link.from)) {
            warn(
              'pulseBeforeArrival',
              ['pulses', 'hops', h, k],
              `the pulse on ${id} leaves ${link.from} before any pulse reaches it.`,
            );
          }
        });
        for (const id of hop) {
          const link = linkById.get(id);
          if (link) reached.add(link.to);
        }
      });

      const badges = new Set(map.loops ?? []);
      map.loopNames?.forEach((id, k) => {
        if (!badges.has(id))
          warn('loopNameWithoutBadge', ['loopNames', k], `loop ${id} is named but its badge is not shown.`);
      });
    });
  });
  return issues;
}
