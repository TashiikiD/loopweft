import { readFileSync } from 'node:fs';
import { type Project, readProject, type Step } from '@loopweft/model';

/** The polycrisis example, parsed. */
export function example(): Project {
  const result = readProject(
    readFileSync(new URL('../../../examples/polycrisis.loopweft', import.meta.url), 'utf8'),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.project;
}

/**
 * A step by its position, written like the deck's build keys: "S04.2" is the second step of scene S04 (whose
 * id is "2a"). The example has no fake title page, so its S00.1 is the deck's S00.2.
 */
export function stepAt(project: Project, key: string): Step {
  const dot = key.lastIndexOf('.');
  const scene = project.story.scenes.find((s) => s.id === key.slice(0, dot));
  const step = scene?.steps[Number(key.slice(dot + 1)) - 1];
  if (!step) throw new Error(`No step ${key}`);
  return step;
}
