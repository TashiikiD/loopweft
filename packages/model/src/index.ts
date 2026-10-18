// @loopweft/model: the .loopweft file format and the operations on it. Everything here runs in Node
// and in the browser; nothing reads the clock or draws random numbers.

export {
  type DraftNote,
  initials,
  licenceName,
  type NoteLevel,
  type ReferenceDraft,
  referenceFromCrossref,
} from './doi/crossref.ts';
export {
  CROSSREF_WORKS,
  crossrefUrl,
  LOOKUP_TIMEOUT_MS,
  type LookupFailure,
  type LookupFailureKind,
  type LookupOptions,
  type LookupResult,
  lookupDoi,
} from './doi/lookup.ts';
export { DOI_PATTERN, readDoi } from './doi/read.ts';
export {
  type CitableKind,
  type CoverageCount,
  type EvidenceCoverage,
  evidenceCoverage,
  type SourceCoverage,
  type SourceUse,
  sourceUses,
} from './evidence.ts';
export { readFieldValue, resolveField } from './fields.ts';
export * from './importers/index.ts';
export {
  type Cleanup,
  type Conversion,
  convertPolycrisis,
  ONE_OFF_VISUALS,
  POLYCRISIS_CLEANUP,
  type PolycrisisDeck,
} from './importers/polycrisis.ts';
export { checkEvidence, checkProject, checkStory } from './integrity.ts';
export { errorsIn, formatPath, hasErrors, type Issue, issueLines } from './issues.ts';
export { projectJsonSchema, projectJsonSchemaText } from './json-schema.ts';
export {
  type CycleEdge,
  type CycleOptions,
  countCycles,
  cycleEdges,
  DEFAULT_LOOP_LIMIT,
  type FoundLoop,
  findLoops,
  type LoopStats,
  loopPolarity,
  loopStats,
  type Polarity,
  type ProjectLoopOptions,
} from './loops.ts';
export { type JsonObject, MIGRATIONS, type MigrateResult, type Migration, migrate } from './migrate.ts';
export * from './ops/index.ts';
export {
  DEFAULT_PALETTE_ID,
  findPalette,
  isPresetId,
  PALETTE_IDS,
  PALETTES,
  type PaletteId,
  type PalettePreset,
  paletteOf,
  type ThemePalette,
  themePalettes,
} from './palettes.ts';
export { createProject } from './project.ts';
export {
  citedIn,
  type Reference,
  referenceList,
  referenceSpans,
  type Span,
  sceneList,
} from './references.ts';
export { checkReferences, elementIds } from './refs.ts';
export {
  type RippleDirection,
  type RippleOptions,
  type RippleReach,
  type RippleResult,
  ripple,
} from './ripple.ts';
export * from './schema.ts';
export { canonicalize, serializeProject } from './serialize.ts';
export {
  applyShorthand,
  parseShorthand,
  type ShorthandCell,
  ShorthandError,
  type ShorthandForm,
  type ShorthandGroup,
  type ShorthandIssue,
  type ShorthandParse,
  type ShorthandRelation,
  type ShorthandResult,
  type ShorthandSign,
} from './shorthand.ts';
export { atLeast, type ResolvedLevels, resolveLevels, sceneSources, stepSources } from './story.ts';
export { ARCHETYPE_SOURCE, TEMPLATES, type Template, templateById } from './templates.ts';
export { compareStrings, ID_PATTERN, nextSequentialId, slugify, uniqueId } from './text/ids.ts';
export { closest, didYouMean, editDistanceRatio, typoDistanceRatio } from './text/similarity.ts';
export { cleanText, type Reading, readBoolean, readNumber } from './text/values.ts';
export {
  CONFIDENCE_VOCABULARY,
  normalizeToken,
  type ResolvedValue,
  resolveVocabularyValue,
  SIGN_VOCABULARY,
  type Vocabulary,
  type VocabularyValue,
} from './text/vocabulary.ts';
export { type ParseResult, parseProject, readProject, validateProject, zodIssues } from './validate.ts';
