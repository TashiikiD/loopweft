// @loopweft/render: draws a project's map and plays its story. This part is pure (Node-safe): the drawable
// graph, its named loops, how a step's map state resolves, the choreography of a forward step, the walks of a
// held step, the glyphs and the themes.
export { type AmbientSpec, ambientWalker, seededRandom } from './ambient.ts';
export {
  DRAW,
  HOP_GAP,
  MAX_DRAWS,
  type PulseBeat,
  type Schedule,
  schedule,
  type Tone,
  TRAVEL,
} from './choreo.ts';
export { FLAG_MARK, type GlyphPart, LOOP_ARROW, shapeGlyph, TREND_GLYPH } from './glyphs.ts';
export {
  buildGraph,
  type Graph,
  type GraphEdge,
  type GraphGroup,
  type GraphNode,
  type GraphOptions,
  type LabelSide,
  type LineStyle,
  moveNode,
  positionsOf,
  type Shape,
} from './graph.ts';
export { type NamedLoop, namedLoops } from './loops.ts';
export { HIDDEN_MAP, type ResolvedMap, rank, resolveMap } from './resolve.ts';
export {
  categoryColours,
  DEFAULT_PALETTE,
  fontStack,
  THEMES,
  type ThemeBase,
  type ThemeTokens,
  themeTokens,
  themeVariables,
} from './theme.ts';
