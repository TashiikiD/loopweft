// Regenerates packages/model/schema/loopweft.v1.schema.json. Run with `npm run schema`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectJsonSchemaText } from '../src/json-schema.ts';

const SCHEMA_FILE = new URL('../schema/loopweft.v1.schema.json', import.meta.url);

mkdirSync(new URL('.', SCHEMA_FILE), { recursive: true });
writeFileSync(SCHEMA_FILE, projectJsonSchemaText());
process.stdout.write(`wrote ${fileURLToPath(SCHEMA_FILE)}\n`);
