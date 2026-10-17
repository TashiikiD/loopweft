import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Project, readProject, type Step } from '@loopweft/model';

// A path, not a URL: under jsdom the global URL is jsdom's, which Node's file functions refuse.
const EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/polycrisis.loopweft');

/** The polycrisis example, parsed. */
export function example(): Project {
  const result = readProject(readFileSync(EXAMPLE, 'utf8'));
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
