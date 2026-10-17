// @loopweft/model: the .loopweft file format and the operations on it. Everything here runs in Node
// and in the browser; nothing reads the clock or draws random numbers.
export { errorsIn, formatPath, hasErrors, type Issue, issueLines } from './issues.ts';
export { projectJsonSchema, projectJsonSchemaText } from './json-schema.ts';
export { type JsonObject, MIGRATIONS, type MigrateResult, type Migration, migrate } from './migrate.ts';
export { createProject } from './project.ts';
export { checkReferences, elementIds } from './refs.ts';
export * from './schema.ts';
export { canonicalize, serializeProject } from './serialize.ts';
export { compareStrings, ID_PATTERN, nextSequentialId, slugify, uniqueId } from './text/ids.ts';
export { closest, didYouMean, editDistanceRatio, typoDistanceRatio } from './text/similarity.ts';
export { type ParseResult, parseProject, readProject, validateProject } from './validate.ts';
