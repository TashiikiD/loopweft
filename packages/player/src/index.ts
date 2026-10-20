// @loopweft/player: presenting a project's story. Plain DOM and TypeScript, so the same code runs in the
// Studio and in a one-file HTML export.
// - Pure (Node-safe): the deck a story makes, the show state and its commands, keys, the clock and pace.
// - Browser: the link between windows, the session each window keeps, and the saved state.
export {
  type ClockState,
  elapsedMs,
  fmt,
  newClock,
  PACE_AHEAD,
  PACE_LATE,
  PACE_ON,
  type Pace,
  type PaceStatus,
  pace,
  pauseClock,
  type SceneEntry,
  type SceneSchedule,
  sanitizeClock,
  startClock,
  toggleClock,
} from './clock.ts';
export {
  type Deck,
  type DeckScene,
  type DeckStep,
  deckOf,
  firstPos,
  flatIndex,
  isValidPos,
  lastPos,
  nextPos,
  nextScenePos,
  type Pos,
  parseKey,
  posKey,
  prevPos,
  prevScenePos,
  samePos,
  sceneAt,
  sceneStartPos,
  sceneTag,
  stepAt,
  totalSteps,
} from './deck.ts';
export {
  isTypingTarget,
  JumpBuffer,
  type KeyAction,
  type KeyInput,
  type LocalAction,
  mapKey,
  type Role,
} from './keys.ts';
export {
  ALIVE_MS,
  browserHost,
  type ChannelLike,
  type Envelope,
  isEnvelope,
  Link,
  type LinkHost,
  type LinkRole,
  type Payload,
  type Peer,
  PING_MS,
  type PostTarget,
} from './link.ts';
export {
  type Address,
  browserAddress,
  type ChangeReason,
  type SessionOptions,
  ShowSession,
} from './session.ts';
export {
  type Command,
  initialShowState,
  type NavKind,
  reduce,
  type ShowState,
  sanitizeShowState,
} from './show.ts';
export {
  browserStorage,
  type KeyValue,
  PresentationStore,
  presentationId,
  resetSession,
  type SavedSession,
  type StoreKey,
  savedSession,
} from './storage.ts';
