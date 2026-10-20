// @loopweft/render: draws a project's map and plays its story.
// - Pure (Node-safe): the drawable graph, its named loops, how a step's map state resolves, the choreography
//   of a forward step, the walks of a held step, the glyphs and the themes.
// - Browser: the map view on @loopweft/motion, its minimap, the overlays, the stage that holds them and the
//   story view. Styles: render.css, exported as "@loopweft/render/render.css".
export {
  AMBIENT_DEFAULTS,
  type AmbientSpec,
  type AmbientWalker,
  ambientWalker,
  seededRandom,
} from './ambient.ts';
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
export {
  type ColourCheck,
  type ColourItem,
  checkCategories,
  checkColourSet,
  checkPalette,
  MIN_CONTRAST,
} from './colour/checks.ts';
export { contrastRatio, relativeLuminance } from './colour/color.ts';
export {
  type ColorCollision,
  DISTINCT_DELTA_E,
  simulateVision,
  VISIONS,
  type Vision,
  type VisionCheck,
} from './colour/cvd.ts';
export { glyph, h, svg, typeset } from './dom.ts';
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
export { cardIcon, type Icon } from './icons.ts';
export { type NamedLoop, namedLoops } from './loops.ts';
export { MapView, type MapViewOptions } from './map-view.ts';
export { MINIMAP_BOX, Minimap } from './minimap.ts';
export { type CaptionState, CaptionView } from './overlays/caption.ts';
export { type CardsState, CardsView, citationLine } from './overlays/cards.ts';
export { type ImageState, ImageView } from './overlays/image.ts';
export { OverlayStage } from './overlays/index.ts';
export { LEGEND_LINKS, type LegendState, LegendView } from './overlays/legend.ts';
export { type StatementState, StatementView } from './overlays/statement.ts';
export { type TitleState, TitleView } from './overlays/title.ts';
export { HIDDEN_MAP, type ResolvedMap, type ResolveOptions, rank, resolveMap } from './resolve.ts';
export { Stage, type StageLayers } from './stage.ts';
export { FADE, Step, type StepTweenOptions, type Transition } from './step.ts';
export { type StoryPosition, StoryView, storyPositions } from './story-view.ts';
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
