'use client'

/**
 * The route planner, living inside the map multitool's sidebar.
 *
 * This is the same `DayRoutePanel` the jobs page uses — drag to reorder, draw a
 * route by hand, optimise one employee or the whole day, Save & apply. The only
 * difference is where its state comes from (`useRoutePlanner`, held by the map
 * page) and that focus is driven by the URL, so leaving the planner is just
 * another map navigation: no reload, and unsaved edits survive the round trip.
 *
 * Date navigation reuses the same month calendar as the idle/client map views
 * so the chrome never jumps to a different design when you click a day.
 */

import { useRouter } from 'next/navigation'
import DayRoutePanel from '@/app/components/DayRoutePanel'
import type { RoutePlanner } from '@/app/components/planner/useRoutePlanner'
import MapMonthCalendar from './MapMonthCalendar'
import { resolvePlannerBack, type MapMode } from './mapMode'
import { fmtDate } from './NearestRoutesList'

export default function MapPlannerPanel({
  planner,
  mode,
  companySlug,
  navigate,
  onOpenJob,
  onAddJob,
  availableMinutesByUser,
}: {
  planner: RoutePlanner
  mode: Extract<MapMode, { kind: 'day' | 'route' }>
  companySlug: string
  navigate: (mode: MapMode, opts?: { replace?: boolean }) => void
  onOpenJob: (jobId: number | string) => void
  onAddJob: () => void
  availableMinutesByUser?: Record<number, number>
}) {
  const router = useRouter()
  const { date, returnTo } = mode
  const back = resolvePlannerBack(mode)

  /** Keep the return target while stepping days or switching employee. */
  const stay = (next: MapMode & { kind: 'day' | 'route' }) =>
    (returnTo ? { ...next, returnTo } : next) as MapMode

  const leavePlanner = () => {
    // Always drop sticky hover/selection before navigating away.
    planner.resetEphemeralUi()

    if (back?.kind === 'path') {
      const pathOnly = back.path.split('?')[0] || ''
      // Returning to this map's root should be a clean idle frame, not a history
      // push that keeps the previous camera / half-previewed route.
      if (
        pathOnly === `/${companySlug}/map`
        || pathOnly.endsWith('/map')
      ) {
        navigate({ kind: 'idle' })
        return
      }
      router.push(back.path)
      return
    }
    if (back?.kind === 'mode') {
      navigate(back.mode)
      return
    }
    navigate({ kind: 'idle' })
  }

  const goToDate = (nextDate: string) => {
    // Clicking the already-selected day again leaves the planner.
    if (nextDate === date) {
      leavePlanner()
      return
    }
    navigate(stay(
      mode.kind === 'route'
        ? { kind: 'route', date: nextDate, userId: mode.userId }
        : { kind: 'day', date: nextDate },
    ))
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 px-3 pt-2">
        <MapMonthCalendar
          selectedDate={date}
          selectionMode="navigate"
          onSelectDate={goToDate}
          defaultOpen={false}
        />
      </div>

      <div className="min-h-0 flex-1">
        <DayRoutePanel
          companySlug={companySlug}
          routes={planner.routes}
          focusUserId={planner.focusUserId}
          onSelectUser={userId => navigate(stay({ kind: 'route', date, userId }))}
          onClearUser={() => navigate(stay({ kind: 'day', date }))}
          onBackToWeek={leavePlanner}
          dateLabel={fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}
          onReorder={planner.reorder}
          onJobOpen={onOpenJob}
          onOptimize={planner.optimize}
          optimizing={planner.optimizing}
          optimizeNotice={planner.optimizeNotice}
          geocodingCount={planner.geocodingCount}
          onSave={planner.save}
          onSaveAll={planner.hasUnsavedChanges ? () => planner.save() : undefined}
          onDiscardUser={planner.discardUser}
          onDiscardAll={planner.hasUnsavedChanges ? planner.discardAll : undefined}
          unsavedUserIds={planner.unsavedUserIds}
          hasUnsavedChanges={planner.hasUnsavedChanges}
          onBulkOptimize={planner.bulkOptimize}
          onHoverUser={planner.setHoveredUserId}
          onAllPanelSelectionChange={planner.setSelectedUserIds}
          highlightedJobId={planner.hoveredJobId}
          onJobCardHover={planner.hoverJob}
          onIsolateRoute={planner.isolateLeg}
          baselineMinutesByUser={planner.baselineMinutesByUser}
          availableMinutesByUser={availableMinutesByUser}
          drawMode={planner.drawMode}
          drawOrder={planner.drawOrder}
          drawRouteComparison={planner.drawRouteComparison}
          onDrawStart={planner.startDraw}
          onDrawAssign={planner.assignDraw}
          onDrawReset={planner.resetDraw}
          onDrawExit={planner.exitDraw}
          onAddJob={onAddJob}
          date={date}
          plannedMetaByUser={planner.plannedMetaByUser}
          onRoundSaved={planner.reload}
          onRouteLocationsChanged={planner.reload}
        />
      </div>
    </div>
  )
}
