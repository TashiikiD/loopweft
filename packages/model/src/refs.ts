// Reference checks: every id a project names must exist, and ids must be unique. These are errors: a
// project that fails them cannot be drawn or presented. (integrity.ts adds the evidence and story checks.)
import { formatPath, type Issue } from './issues.ts';
import { isPresetId, PALETTE_IDS } from './palettes.ts';
import {
  type Citation,
  type FieldValue,
  LEVELS,
  type LevelLists,
  type MapState,
  type Overlay,
  type Project,
} from './schema.ts';
import { didYouMean } from './text/similarity.ts';

type Path = (string | number)[];

/** Ids of the map's variables, links and loops share one namespace, so `cite <id>` names one thing. */
export function elementIds(project: Project): Set<string> {
  return new Set([
    ...project.variables.map((v) => v.id),
    ...project.links.map((l) => l.id),
    ...project.loops.map((l) => l.id),
  ]);
}

export function checkReferences(project: Project): Issue[] {
  const issues: Issue[] = [];
  const error = (code: string, path: Path, message: string) =>
    issues.push({ severity: 'error', code, message, path });

  // ----- unique ids -----
  const unique = (entries: { id: string; path: Path }[], what: string) => {
    const first = new Map<string, Path>();
    for (const { id, path } of entries) {
      const seen = first.get(id);
      if (seen)
        error('duplicateId', [...path, 'id'], `${what} id "${id}" is already used at ${formatPath(seen)}.`);
      else first.set(id, path);
    }
  };
  const listed = <T extends { id: string }>(items: T[], path: Path) =>
    items.map((item, i) => ({ id: item.id, path: [...path, i] }));
  unique(
    [
      ...listed(project.variables, ['variables']),
      ...listed(project.links, ['links']),
      ...listed(project.loops, ['loops']),
    ],
    'Element',
  );
  unique(listed(project.types.categories, ['types', 'categories']), 'Category');
  unique(listed(project.types.roles, ['types', 'roles']), 'Role');
  unique(listed(project.types.linkTypes, ['types', 'linkTypes']), 'Link type');
  unique(listed(project.types.fields, ['types', 'fields']), 'Field');
  project.types.fields.forEach((f, i) => {
    unique(listed(f.options ?? [], ['types', 'fields', i, 'options']), `Field ${f.id} option`);
  });
  unique(listed(project.sources, ['sources']), 'Source');
  unique(listed(project.theme.palettes ?? [], ['theme', 'palettes']), 'Palette');
  unique(listed(project.layout.groups, ['layout', 'groups']), 'Group');
  unique(listed(project.story.scenes, ['story', 'scenes']), 'Scene');
  project.story.scenes.forEach((s, i) => {
    unique(listed(s.steps, ['story', 'scenes', i, 'steps']), `Scene ${s.id} step`);
  });

  // ----- lookups -----
  const variables = new Set(project.variables.map((v) => v.id));
  const links = new Map(project.links.map((l) => [l.id, l]));
  const loops = new Set(project.loops.map((l) => l.id));
  const sources = new Map(project.sources.map((s) => [s.id, s]));
  const categories = new Set(project.types.categories.map((c) => c.id));
  const roles = new Set(project.types.roles.map((r) => r.id));
  const linkTypes = new Set(project.types.linkTypes.map((t) => t.id));
  const fields = new Map(project.types.fields.map((f) => [f.id, f]));
  const assets = new Set(Object.keys(project.assets));

  const known = (what: string, pool: Set<string> | Map<string, unknown>, code: string) => {
    const names = [...pool.keys()];
    return (id: string, path: Path, who: string) => {
      if (!pool.has(id)) error(code, path, `${who}: no ${what} "${id}"${didYouMean(id, names)}.`);
    };
  };
  // ----- the theme's palettes: the presets, and the project's own (never under a preset's id) -----
  const own = project.theme.palettes ?? [];
  own.forEach((p, i) => {
    if (isPresetId(p.id)) {
      error(
        'presetPaletteId',
        ['theme', 'palettes', i, 'id'],
        `Palette id "${p.id}" is a preset's; give the project's own palette another id.`,
      );
    }
  });
  const chosen = project.theme.palette;
  if (chosen !== undefined && !isPresetId(chosen) && !own.some((p) => p.id === chosen)) {
    error(
      'unknownPalette',
      ['theme', 'palette'],
      `No palette "${chosen}"${didYouMean(chosen, [...PALETTE_IDS, ...own.map((p) => p.id)])}: name a preset (${PALETTE_IDS.join(', ')}) or one of the project's own palettes (theme.palettes), or add it there.`,
    );
  }

  const variable = known('variable', variables, 'unknownVariable');
  const link = known('link', links, 'unknownLink');
  const loop = known('loop', loops, 'unknownLoop');
  const source = known('source', sources, 'unknownSource');
  const category = known('category', categories, 'unknownCategory');
  const role = known('role', roles, 'unknownRole');
  const linkType = known('link type', linkTypes, 'unknownLinkType');
  const asset = known('asset', assets, 'unknownAsset');
  const element = (id: string, path: Path, who: string) => {
    if (!variables.has(id) && !links.has(id))
      error(
        'unknownElement',
        path,
        `${who}: no variable or link "${id}"${didYouMean(id, [...variables, ...links.keys()])}.`,
      );
  };

  const citations = (list: Citation[] | undefined, path: Path, who: string) => {
    list?.forEach((c, i) => {
      source(c.source, [...path, i, 'source'], who);
    });
  };

  const fieldValues = (
    values: Record<string, FieldValue> | undefined,
    kind: 'variables' | 'links',
    path: Path,
    who: string,
  ) => {
    for (const [key, value] of Object.entries(values ?? {})) {
      const at = [...path, key];
      const field = fields.get(key);
      if (!field) {
        error('unknownField', at, `${who}: no field "${key}"${didYouMean(key, [...fields.keys()])}.`);
        continue;
      }
      const appliesTo = field.appliesTo ?? 'both';
      if (appliesTo !== 'both' && appliesTo !== kind) {
        error('fieldNotApplicable', at, `${who}: field "${key}" is for ${appliesTo} only.`);
      }
      const expected = field.kind === 'choice' || field.kind === 'text' ? 'string' : field.kind;
      if (typeof value !== expected) {
        const wanted = { string: 'text', number: 'a number', boolean: 'true or false' }[expected];
        error(
          'invalidFieldValue',
          at,
          `${who}: field "${key}" holds ${wanted}, not ${JSON.stringify(value)}.`,
        );
        continue;
      }
      if (field.kind === 'choice') {
        const options = (field.options ?? []).map((o) => o.id);
        if (!options.includes(value as string)) {
          error(
            'invalidFieldValue',
            at,
            `${who}: field "${key}" is one of ${options.map((o) => `"${o}"`).join(', ')}, not ${JSON.stringify(value)}.`,
          );
        }
      }
    }
  };

  // ----- the map -----
  project.variables.forEach((v, i) => {
    const who = `Variable ${v.id}`;
    if (v.category !== undefined) category(v.category, ['variables', i, 'category'], who);
    if (v.role !== undefined) role(v.role, ['variables', i, 'role'], who);
    fieldValues(v.fields, 'variables', ['variables', i, 'fields'], who);
    citations(v.citations, ['variables', i, 'citations'], who);
  });

  project.links.forEach((l, i) => {
    const who = `Link ${l.id}`;
    variable(l.from, ['links', i, 'from'], who);
    variable(l.to, ['links', i, 'to'], who);
    if (l.type !== undefined) linkType(l.type, ['links', i, 'type'], who);
    fieldValues(l.fields, 'links', ['links', i, 'fields'], who);
    citations(l.citations, ['links', i, 'citations'], who);
  });

  project.loops.forEach((lp, i) => {
    const who = `Loop ${lp.id}`;
    lp.links.forEach((id, k) => {
      link(id, ['loops', i, 'links', k], who);
    });
    const chain = lp.links.map((id) => links.get(id));
    if (chain.every((l) => l !== undefined)) {
      chain.forEach((a, k) => {
        const b = chain[(k + 1) % chain.length];
        if (a && b && a.to !== b.from) {
          error(
            'brokenLoop',
            ['loops', i, 'links', (k + 1) % chain.length],
            `${who}: ${a.id} ends at ${a.to} but ${b.id} starts at ${b.from}; a loop's links must form a closed chain.`,
          );
        }
      });
    }
    citations(lp.citations, ['loops', i, 'citations'], who);
  });

  project.sources.forEach((s, i) => {
    if (s.partOf === undefined) return;
    const who = `Source ${s.id}`;
    if (s.partOf === s.id) {
      error('partOfCycle', ['sources', i, 'partOf'], `${who} cannot be part of itself.`);
      return;
    }
    source(s.partOf, ['sources', i, 'partOf'], who);
    // A chain of supplements must end at a work that is part of nothing.
    const seen = new Set([s.id]);
    for (let next = sources.get(s.partOf); next?.partOf !== undefined; next = sources.get(next.partOf)) {
      if (seen.has(next.id)) {
        error('partOfCycle', ['sources', i, 'partOf'], `${who}: its partOf chain goes round in a circle.`);
        break;
      }
      seen.add(next.id);
    }
  });

  // ----- layout -----
  for (const id of Object.keys(project.layout.positions)) {
    variable(id, ['layout', 'positions', id], 'Layout position');
  }
  for (const id of Object.keys(project.layout.bends)) link(id, ['layout', 'bends', id], 'Layout bend');
  project.layout.groups.forEach((g, i) => {
    if (g.category !== undefined) category(g.category, ['layout', 'groups', i, 'category'], `Group ${g.id}`);
  });

  // ----- the story -----
  const levelLists = (lists: LevelLists | undefined, check: typeof variable, path: Path, who: string) => {
    for (const level of LEVELS) {
      lists?.[level]?.forEach((id, k) => {
        check(id, [...path, level, k], who);
      });
    }
  };

  const mapState = (map: MapState, path: Path, who: string) => {
    levelLists(map.variables, variable, [...path, 'variables'], who);
    levelLists(map.links, link, [...path, 'links'], who);
    map.camera?.fit?.forEach((id, k) => {
      variable(id, [...path, 'camera', 'fit', k], who);
    });
    for (const id of Object.keys(map.labelText ?? {})) variable(id, [...path, 'labelText', id], who);
    for (const id of Object.keys(map.trends ?? {})) variable(id, [...path, 'trends', id], who);
    map.loops?.forEach((id, k) => {
      loop(id, [...path, 'loops', k], who);
    });
    map.loopNames?.forEach((id, k) => {
      loop(id, [...path, 'loopNames', k], who);
    });
    map.reveal?.from?.forEach((id, k) => {
      variable(id, [...path, 'reveal', 'from', k], who);
    });
    map.reveal?.sequence?.forEach((id, k) => {
      element(id, [...path, 'reveal', 'sequence', k], who);
    });
    map.pulses?.hops.forEach((hop, h) => {
      hop.forEach((id, k) => {
        link(id, [...path, 'pulses', 'hops', h, k], who);
      });
    });
    const ambient = map.ambient;
    if (ambient) {
      ambient.from.forEach((id, k) => {
        variable(id, [...path, 'ambient', 'from', k], who);
      });
      for (const key of ['every', 'hops'] as const) {
        const range = ambient[key];
        if (range && range[0] > range[1]) {
          error(
            'invalidRange',
            [...path, 'ambient', key],
            `${who}: ambient ${key} is [min, max], but ${range[0]} > ${range[1]}.`,
          );
        }
      }
    }
  };

  const overlay = (o: Overlay, path: Path, who: string) => {
    if (o.type === 'cards') {
      o.active?.forEach((index, k) => {
        if (index >= o.items.length) {
          error(
            'cardOutOfRange',
            [...path, 'active', k],
            `${who}: card ${index} does not exist (there are ${o.items.length}, from 0).`,
          );
        }
      });
    }
    if (o.type === 'image') asset(o.asset, [...path, 'asset'], who);
    if ('citations' in o) citations(o.citations, [...path, 'citations'], who);
  };

  project.story.scenes.forEach((scene, s) => {
    const scenePath: Path = ['story', 'scenes', s];
    scene.sources.forEach((id, k) => {
      source(id, [...scenePath, 'sources', k], `Scene ${scene.id}`);
    });
    scene.steps.forEach((step, t) => {
      const who = `Step ${scene.id}.${step.id}`;
      const stepPath: Path = [...scenePath, 'steps', t];
      mapState(step.map, [...stepPath, 'map'], who);
      let captions = 0;
      step.overlays.forEach((o, k) => {
        overlay(o, [...stepPath, 'overlays', k], who);
        // A step shows its scene's caption once; a second would be drawn as the same caption.
        if (o.type === 'caption' && ++captions > 1) {
          error(
            'duplicateCaption',
            [...stepPath, 'overlays', k],
            `${who}: the scene's caption is listed twice.`,
          );
        }
      });
    });
  });

  return issues;
}
