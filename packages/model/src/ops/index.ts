// The edits the Studio and the CLI share: one implementation of each. Every operation takes a project and
// returns { project, result, summary } without changing its input; an expected failure is an OpError.
export {
  applyLayout,
  type HomeView,
  type LayoutResult,
  moveVariables,
  setBends,
  setHome,
  setLabelSide,
  setPinned,
} from './layout.ts';
export { addLink, flipSign, type LinkChanges, type LinkInput, removeLink, setLink } from './links.ts';
export {
  addLoop,
  findLoop,
  type LoopChanges,
  type LoopInput,
  loopKey,
  removeLoop,
  setLoop,
} from './loops.ts';
export { type MetaChanges, setMeta, setTheme, type ThemeChanges } from './meta.ts';
export { addPalette, type PaletteChanges, type PaletteInput, removePalette, setPalette } from './palettes.ts';
export { pruneMap, pruneMentions, type Removed, stepKey, stepsMentioning } from './story-refs.ts';
export {
  ensureValid,
  findLink,
  listing,
  OpError,
  type OpErrorKind,
  type OpOutput,
  parseElement,
  plural,
  resolveVariable,
  sameJson,
  signText,
} from './support.ts';
export {
  addType,
  moveType,
  removeType,
  resolveType,
  setType,
  type TypeChanges,
  type TypeInput,
  type TypeKind,
  typeUses,
} from './types.ts';
export {
  addVariable,
  type RemoveOptions,
  removeVariable,
  setVariable,
  type VariableChanges,
  type VariableInput,
} from './variables.ts';
