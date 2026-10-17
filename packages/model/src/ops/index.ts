// The edits the Studio and the CLI share: one implementation of each. Every operation takes a project and
// returns { project, result, summary } without changing its input; an expected failure is an OpError.
export { addLink, flipSign, type LinkChanges, type LinkInput, removeLink, setLink } from './links.ts';
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
  addVariable,
  type RemoveOptions,
  removeVariable,
  setVariable,
  type VariableChanges,
  type VariableInput,
} from './variables.ts';
