import { z } from 'zod';
import { FORMAT_VERSION, ProjectSchema, SCHEMA_URL } from './schema.ts';

/**
 * JSON Schema (draft 2020-12) for `.loopweft` files as written on disk: collections with defaults are
 * optional. Committed at `packages/model/schema/loopweft.v1.schema.json` (regenerate with `npm run schema`)
 * and published at SCHEMA_URL. It describes the structure; reference checks (ids that must exist) are
 * in the validator.
 */
export function projectJsonSchema(): Record<string, unknown> {
  const { $schema, description, ...rest } = z.toJSONSchema(ProjectSchema, {
    io: 'input',
    target: 'draft-2020-12',
  }) as Record<string, unknown>;
  return {
    $schema,
    $id: SCHEMA_URL,
    title: `Loopweft project (format version ${FORMAT_VERSION})`,
    description,
    ...rest,
  };
}

/** The text of the committed schema file. */
export const projectJsonSchemaText = (): string => `${JSON.stringify(projectJsonSchema(), null, 2)}\n`;
