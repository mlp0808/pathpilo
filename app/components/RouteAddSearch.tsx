'use client'

// Re-export shim — canonical source is @pathpilo/route-planner-core.
export {
  RouteAddSearch as default,
  ROUTE_MAP_GLASS_PILL,
  ROUTE_MAP_GLASS_PANEL,
  ROUTE_MAP_GLASS_STYLE,
} from '@pathpilo/route-planner-core'
export type { RouteSearchClient, RouteLocationPick } from '@pathpilo/route-planner-core'
