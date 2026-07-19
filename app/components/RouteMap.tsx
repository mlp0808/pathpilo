'use client'

// Re-export shim. The canonical implementation now lives in the shared package
// @pathpilo/route-planner-core so the app and the marketing free tool stay in
// sync. Do not add logic here — edit the package instead.
export { RouteMap as default, USER_COLORS } from '@pathpilo/route-planner-core'
export type { RouteJob, UserRoute, IsolatedRouteSeg } from '@pathpilo/route-planner-core'
