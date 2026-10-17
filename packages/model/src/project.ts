import { FORMAT, FORMAT_VERSION, type Meta, type Project, ProjectSchema } from './schema.ts';

/** A new, empty project: the given meta and every collection empty. */
export function createProject(meta: Meta): Project {
  return ProjectSchema.parse({ format: FORMAT, version: FORMAT_VERSION, meta });
}
