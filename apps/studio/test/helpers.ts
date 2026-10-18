import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Project, readProject } from '@loopweft/model';

// A path, not a URL: under jsdom the global URL is jsdom's, which Node's file functions refuse.
const EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '../../../examples/polycrisis.loopweft');

/** The polycrisis example, parsed. */
export function example(): Project {
  const result = readProject(readFileSync(EXAMPLE, 'utf8'));
  if (!result.ok) throw new Error(JSON.stringify(result.issues, null, 2));
  return result.project;
}
