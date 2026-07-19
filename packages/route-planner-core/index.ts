// @pathpilo/route-planner-core
// Shared, prop-driven route-planning UI used by BOTH the main app
// (app.pathpilo.com) and the marketing free tool (pathpilo.com).
// Keep everything here presentational and free of auth/API coupling so the two
// consumers stay in sync — app-specific behaviour belongs in each wrapper.

export { default as RouteMap, USER_COLORS } from './RouteMap'
export type { RouteJob, UserRoute, IsolatedRouteSeg } from './RouteMap'

export {
  default as RouteAddSearch,
  ROUTE_MAP_GLASS_PILL,
  ROUTE_MAP_GLASS_PANEL,
  ROUTE_MAP_GLASS_STYLE,
} from './RouteAddSearch'
export type {
  RouteSearchClient,
  RouteLocationPick,
  RouteAddSearchLabels,
  RouteAddSearchCountry,
} from './RouteAddSearch'

export { optimizeMiddleJobsClient } from './clientRouteOptimize'
export type { ClientOptimizeJob, ClientOptimizeResult } from './clientRouteOptimize'

export { default as MobileRouteSheet } from './MobileRouteSheet'

export type { SequentialPickId, SequentialPickMeta, SequentialPickState } from './sequentialPick/types'
export { SEQUENTIAL_PICK_THEME } from './sequentialPick/theme'
export { buildPickIndexMap, getSequentialPickMeta } from './sequentialPick/utils'
export { buildSequentialPickMapFeatures } from './sequentialPick/buildMapPinFeatures'
export type { MapPinJobInput } from './sequentialPick/buildMapPinFeatures'
export { useSequentialPick } from './sequentialPick/useSequentialPick'
export type { UseSequentialPickOptions } from './sequentialPick/useSequentialPick'
