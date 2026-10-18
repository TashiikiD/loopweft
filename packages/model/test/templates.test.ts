// The templates: a blank map and the eight system archetypes, each the structure Kim and Anderson (1998)
// draw for it. A template invents no evidence: its links cite nothing, and its only source is that book,
// cited on its named loops with the figure.
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_SOURCE,
  findLoops,
  loopKey,
  loopPolarity,
  serializeProject,
  TEMPLATES,
  templateById,
  validateProject,
} from '../src/index.ts';

const archetypes = TEMPLATES.filter((t) => t.id !== 'blank');

describe('the templates', () => {
  it('are a blank map and the eight archetypes of the plan', () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual([
      'Blank map',
      'Fixes that fail',
      'Shifting the burden',
      'Limits to growth',
      'Tragedy of the commons',
      'Escalation',
      'Success to the successful',
      'Eroding goals',
      'Growth and underinvestment',
    ]);
    expect(templateById('escalation')?.name).toBe('Escalation');
    expect(templateById('nope')).toBeUndefined();
  });

  it('gives an empty project for a blank map', () => {
    const blank = (templateById('blank') as (typeof TEMPLATES)[number]).build();
    expect(blank.variables).toEqual([]);
    expect(validateProject(blank)).toEqual([]);
  });

  for (const template of archetypes) {
    describe(template.name, () => {
      const project = template.build();

      it('is valid, and flags only its links as uncited', () => {
        const issues = validateProject(project);
        expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
        expect([...new Set(issues.map((i) => i.code))]).toEqual(['uncitedLink']);
        expect(issues).toHaveLength(project.links.length);
      });

      it('names its loops by their polarity, and names every loop its links make', () => {
        for (const loop of project.loops) {
          expect(loopPolarity(project, loop), loop.id).toBe(loop.id[0]);
          expect(loop.archetype).toBe(template.name);
        }
        const found = findLoops(project).loops.map((l) => `${l.polarity} ${loopKey(l.links)}`);
        const named = project.loops.map((l) => `${loopPolarity(project, l)} ${loopKey(l.links)}`);
        expect(found.sort()).toEqual(named.sort());
      });

      it('cites only the book, on its loops, with the figure; its variables and links cite nothing', () => {
        expect(project.sources).toEqual([expect.objectContaining({ ...ARCHETYPE_SOURCE })]);
        for (const loop of project.loops) {
          expect(loop.citations).toEqual([
            { source: ARCHETYPE_SOURCE.id, note: expect.stringMatching(/^Figure \d\.\d$/) },
          ]);
        }
        expect([...project.variables, ...project.links].every((x) => x.citations.length === 0)).toBe(true);
        expect(project.variables.every((v) => v.definition === undefined)).toBe(true);
        expect(project.meta.description).toMatch(/as Kim and Anderson \(1998, Figure \d\.\d\) draw it/);
      });

      it('places every variable, on the stage, the same way every time', () => {
        expect(Object.keys(project.layout.positions).sort()).toEqual(
          project.variables.map((v) => v.id).sort(),
        );
        for (const p of Object.values(project.layout.positions)) {
          expect(p.x).toBeGreaterThan(100);
          expect(p.x).toBeLessThan(1820);
          expect(p.y).toBeGreaterThan(300);
          expect(p.y).toBeLessThan(1000);
        }
        expect(serializeProject(template.build())).toBe(serializeProject(project));
      });
    });
  }

  it('carry the archetypes’ delays where the book draws them', () => {
    const delays = Object.fromEntries(
      archetypes.map((t) => {
        const p = t.build();
        return [t.id, p.links.filter((l) => l.delay).map((l) => `${l.from}→${l.to}`)];
      }),
    );
    expect(delays).toEqual({
      'fixes-that-fail': ['fix→unintended_consequence'],
      'shifting-the-burden': ['fundamental_solution→problem_symptom'],
      'limits-to-growth': [],
      'tragedy-of-the-commons': ['total_activity→gain_per_activity'],
      escalation: [],
      'success-to-the-successful': [],
      'eroding-goals': ['corrective_action→actual'],
      'growth-and-underinvestment': ['perceived_need→investment', 'investment→capacity'],
    });
  });
});
