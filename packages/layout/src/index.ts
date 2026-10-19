// @loopweft/layout: where things go. Automatic layouts (constellation, a seeded force layout, flow), link
// curvature with crossing and corridor scoring, label placement, and the camera maths they share.
export {
  type BendLink,
  type BendNode,
  type BendOptions,
  type BendReport,
  CANDIDATE_BENDS,
  chooseBend,
  chooseBends,
  controlPoint,
  DEFAULT_BEND,
  REFINEMENT_LIMITS,
} from './bends.ts';
export {
  type Camera,
  type CameraSpec,
  cameraTransform,
  circleOnStage,
  curveOnStage,
  FRAMES,
  type Frame,
  fitCamera,
  homeCamera,
  inView,
  MAP_FRAME,
  project,
  type Rect,
  STAGE,
  viewRect,
  wholeMapCamera,
  zoomFloor,
} from './camera.ts';
export {
  type ClusterHalo,
  type ConstellationInput,
  type ConstellationNode,
  type ConstellationResult,
  constellationLayout,
} from './constellation.ts';
export { type FlowInput, flowLayout } from './flow.ts';
export {
  type CldDefinition as ForceInput,
  type CldLayoutParams as ForceParams,
  computeForceLayout,
  DEFAULT_NODE_MARGIN,
} from './force.ts';
export {
  curveGeometry,
  type EdgeGeometry,
  edgeGeometry,
  type Pt,
  quad,
  quadLength,
  quadSegment,
  segmentsCross,
} from './geometry.ts';
export {
  type Box,
  boxFor,
  type LabelGraph,
  type LabelRequest,
  type LabelSide,
  type PlacementContext,
  placeLabels,
} from './labels.ts';
export {
  type AutoLayout,
  type AutoLayoutOptions,
  applyAutoLayout,
  autoLayout,
  type LayoutKind,
  type MapEdge,
  type MapGeometry,
  type MapNode,
  mapGeometry,
  variableRadius,
} from './project.ts';
export {
  crossingPoint,
  type DiagnosticRoute,
  type LinkRouteDiagnostics,
  measureRoutes,
  ROUTE_TOLERANCES,
  type RouteDiagnostics,
  routeLength,
  sharedSegmentLength,
} from './route-diagnostics.ts';
