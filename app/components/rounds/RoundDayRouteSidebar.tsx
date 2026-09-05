'use client'

/**
 * Day route overlay for a placed round day.
 * Covers the main workspace (not the app nav): full-height panel + light scrim.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon } from '@heroicons/react/24/outline'
import DayRoutePanel from '@/app/components/DayRoutePanel'
import { useRoutePlanner } from '@/app/components/planner/useRoutePlanner'
import { fmtDate } from '@/app/components/map/NearestRoutesList'
import JobViewSlideout from '@/app/components/JobViewSlideout'
import CreateJob from '@/app/components/CreateJob'
import { apiUrl } from '@/app/utils/api'

type Emp = { id: number; first_name: string; last_name: string }

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { Authorization: `Bearer ${token}` }
}

export default function RoundDayRouteSidebar({
  companySlug,
  date,
  focusUserId,
  roundName,
  onClose,
  onChanged,
  onManage,
}: {
  companySlug: string
  date: string
  focusUserId: number | null
  roundName?: string | null
  onClose: () => void
  onChanged?: () => void
  onManage?: () => void
}) {
  const [users, setUsers] = useState<Emp[]>([])
  const [viewingJob, setViewingJob] = useState<any | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(apiUrl('/users'), { headers: authHeaders() })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) {
          setUsers(Array.isArray(data.users) ? data.users : [])
        }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const planner = useRoutePlanner({
    date,
    users,
    companySlug,
    onSaved: () => onChanged?.(),
  })

  useEffect(() => {
    if (focusUserId != null) planner.setFocusUserId(focusUserId)
  }, [focusUserId, date]) // eslint-disable-line react-hooks/exhaustive-deps -- set once per open

  const dateLabel = fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' })

  const close = () => {
    planner.resetEphemeralUi()
    onClose()
  }

  const overlay = (
    <div
      className="fixed inset-y-0 left-0 right-0 lg:left-[200px] z-[45] flex"
      role="dialog"
      aria-modal="true"
      aria-label={`${roundName?.trim() || 'Round'} · ${dateLabel}`}
    >
      {/* Panel — full height, does not reflow the page */}
      <aside className="relative z-10 h-full w-full max-w-[400px] flex-shrink-0 bg-gray-50 border-r border-gray-200 shadow-[4px_0_24px_rgba(15,23,42,0.08)] flex flex-col min-h-0">
        <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 bg-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-700">
              {roundName?.trim() || 'Round'} · day
            </p>
            <h2 className="text-[15px] font-semibold text-gray-950 truncate mt-0.5">{dateLabel}</h2>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {onManage && (
              <button
                type="button"
                onClick={onManage}
                className="h-8 px-2.5 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-700 hover:bg-gray-50"
              >
                Move / cancel
              </button>
            )}
            <button
              type="button"
              onClick={close}
              className="h-8 w-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"
              aria-label="Close"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {planner.loading && users.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">Loading route…</div>
          ) : (
            <DayRoutePanel
              companySlug={companySlug}
              routes={planner.routes}
              focusUserId={planner.focusUserId}
              onSelectUser={uid => planner.setFocusUserId(uid)}
              onClearUser={() => planner.setFocusUserId(null)}
              onBackToWeek={close}
              dateLabel={dateLabel}
              onReorder={planner.reorder}
              onJobOpen={jobId => {
                const job = planner.jobsForDay.find((j: any) => String(j.id) === String(jobId))
                if (job) setViewingJob(job)
              }}
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
              drawMode={planner.drawMode}
              drawOrder={planner.drawOrder}
              drawRouteComparison={planner.drawRouteComparison}
              onDrawStart={planner.startDraw}
              onDrawAssign={planner.assignDraw}
              onDrawReset={planner.resetDraw}
              onDrawExit={planner.exitDraw}
              onAddJob={() => setCreateOpen(true)}
              date={date}
              plannedMetaByUser={planner.plannedMetaByUser}
              onRoundSaved={() => {
                planner.reload()
                onChanged?.()
              }}
              onRouteLocationsChanged={planner.reload}
            />
          )}
        </div>
      </aside>

      {/* Dim the rest of the workspace; click closes. App nav stays clear. */}
      <button
        type="button"
        className="flex-1 min-w-0 h-full border-0 cursor-default bg-slate-900/25"
        aria-label="Close day route"
        onClick={close}
      />
    </div>
  )

  return (
    <>
      {mounted ? createPortal(overlay, document.body) : null}

      {viewingJob && (
        <JobViewSlideout
          job={viewingJob}
          isOpen={!!viewingJob}
          onClose={() => setViewingJob(null)}
          onJobUpdated={() => {
            planner.reload()
            onChanged?.()
          }}
        />
      )}

      {createOpen && (
        <CreateJob
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          onJobCreated={() => {
            setCreateOpen(false)
            planner.reload()
            onChanged?.()
          }}
          initialDate={date}
          initialAssignedUserId={focusUserId ?? planner.focusUserId ?? undefined}
        />
      )}
    </>
  )
}
