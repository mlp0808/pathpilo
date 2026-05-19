'use client'

import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { UserRoute, RouteJob } from './RouteMap'
import { useAppI18n } from './I18nProvider'
import { SequentialPickListRow } from './sequentialPick/SequentialPickListRow'

function fmtMin(minutes: number) {
  if (!minutes || minutes < 1) return ''
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtDeltaMin(minutes: number) {
  const abs = Math.abs(minutes)
  if (abs < 1) return '1 min'
  return fmtMin(abs)
}

function initialsFromName(name: string) {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function RouteEmployeeAvatar({
  name,
  color,
  imageUrl,
  size = 40,
}: {
  name: string
  color: string
  imageUrl?: string | null
  size?: number
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="rounded-full flex-shrink-0 object-cover"
        style={{ width: size, height: size, boxShadow: `0 4px 12px ${color}40` }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: color,
        boxShadow: `0 4px 12px ${color}40`,
      }}
    >
      {initialsFromName(name)}
    </div>
  )
}

/** Drive-time pill aligned with the timeline column */
function TimelineDrivePill({ minutes }: { minutes: number }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 28 }}>
        <div className="w-px flex-1 bg-gray-200" style={{ minHeight: 8 }} />
      </div>
      <div className="flex-1 flex items-center gap-2 py-1.5 min-w-0">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-[10px] font-medium text-gray-400 flex items-center gap-1 flex-shrink-0">
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          {fmtMin(minutes)}
        </span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
    </div>
  )
}

function sumWorkMinutes(jobs: RouteJob[]) {
  return jobs.reduce((sum, j) => {
    if (j.is_cancelled || j.is_home) return sum
    return sum + (j.estimated_duration_minutes ?? 0)
  }, 0)
}

// ── Timeline-style sortable job card ─────────────────────────────────────────

function SortableJobCard({
  job,
  index,
  isLast,
  color,
  nextLegMinutes,
  onOpen,
  isHighlighted,
  onMouseEnter,
  onMouseLeave,
}: {
  job: RouteJob
  index: number
  isLast: boolean
  color: string
  nextLegMinutes?: number | null
  onOpen: (id: number | string) => void
  isHighlighted?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const { t, locale } = useAppI18n()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: job.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto' as const,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex gap-3">
        {/* Timeline spine */}
        <div className="flex flex-col items-center flex-shrink-0" style={{ width: 28 }}>
          {/* Numbered stop badge — also the drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all duration-200 cursor-grab active:cursor-grabbing select-none"
            style={{
              background: isHighlighted ? color : '#f0f0f0',
              color: isHighlighted ? '#fff' : '#6b7280',
              boxShadow: isHighlighted
                ? `0 0 0 2px ${color}35, 0 2px 8px ${color}30`
                : '0 1px 2px rgba(0,0,0,0.06)',
              transform: isHighlighted ? 'scale(1.08)' : 'scale(1)',
            }}
            title={t('app.routePlanner.dragReorder', 'Drag to reorder')}
          >
            {index + 1}
          </div>
          {/* Connecting line */}
          {!isLast && (
            <div className="w-px flex-1 mt-1 bg-gray-200" style={{ minHeight: 12 }} />
          )}
        </div>

        {/* Card + drive pill column */}
        <div className="flex-1 min-w-0">
          {/* Job card */}
          <div
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className="rounded-2xl px-4 py-3 flex items-start gap-2 group cursor-default transition-all duration-150"
            style={{
              background: isHighlighted ? '#f0fdf4' : isDragging ? '#f9fafb' : '#ffffff',
              border: isHighlighted ? '1px solid #bbf7d0' : '1px solid #f0f0f0',
              boxShadow: isDragging
                ? '0 8px 30px rgba(0,0,0,0.12)'
                : isHighlighted
                ? '0 2px 12px rgba(61,213,122,0.12)'
                : '0 1px 4px rgba(0,0,0,0.05)',
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate leading-snug">
                {job.label}
              </p>
              {job.address && (
                <p className="text-[11px] text-gray-400 truncate mt-0.5 leading-tight">
                  {job.address}
                </p>
              )}
              <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                {job.time && (
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {job.time}
                  </span>
                )}
                {job.estimated_duration_minutes != null && job.estimated_duration_minutes > 0 && (
                  <span className="text-[11px] text-gray-500 flex items-center gap-1">
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    {fmtMin(job.estimated_duration_minutes)}
                  </span>
                )}
              </div>
            </div>

            {/* Actions (appear on hover) */}
            <div className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onOpen(job.id)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title={t('app.routePlanner.openJob', 'Open job')}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            </div>
          </div>

          {/* Drive time between stops */}
          {!isLast && (
            <div className="flex items-center gap-2 py-1.5 px-1">
              {nextLegMinutes != null && nextLegMinutes > 0 ? (
                <>
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[10px] font-medium text-gray-400 flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    {fmtMin(nextLegMinutes)}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                </>
              ) : (
                <div className="h-2" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fixed start/end (home) row ─────────────────────────────────────────────────

function HomeStopRow({
  companySlug,
  userId,
  job,
  color,
  onMouseEnter,
  onMouseLeave,
  dimmed,
  showConnectorBelow = true,
}: {
  companySlug?: string
  userId?: number
  job: RouteJob
  color: string
  onMouseEnter: () => void
  onMouseLeave: () => void
  dimmed?: boolean
  showConnectorBelow?: boolean
}) {
  const { t } = useAppI18n()
  const isEmpty = !job.address || job.address.trim() === ''
  const settingsHref = companySlug && userId != null ? `/${companySlug}/team/${userId}` : null

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`flex gap-3 ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}
    >
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 28 }}>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white"
          style={{ background: color, boxShadow: `0 1px 2px ${color}40` }}
          title={t('app.routePlanner.startEndFixed', 'Start/end - fixed')}
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </div>
        {showConnectorBelow && (
          <div className="w-px flex-1 mt-1 bg-gray-200" style={{ minHeight: 12 }} />
        )}
      </div>
      <div className="flex-1 min-w-0 rounded-2xl px-4 py-3 border border-gray-100 bg-gray-50/80">
        <p className="text-sm font-semibold text-gray-700 truncate">{job.label}</p>
        {isEmpty ? (
          settingsHref ? (
            <Link
              href={settingsHref}
              className="text-[11px] text-accent-600 hover:text-accent-700 hover:underline mt-0.5 inline-block"
            >
              {t('app.routePlanner.selectStartEnd', 'Select start/end location')}
            </Link>
          ) : (
            <p className="text-[11px] text-gray-400 mt-0.5">{t('app.routePlanner.selectStartEnd', 'Select start/end location')}</p>
          )
        ) : (
          <>
            <p className="text-[11px] text-gray-400 truncate mt-0.5">{job.address}</p>
            <p className="text-[10px] text-gray-400 mt-1">{t('app.routePlanner.fixedNotReorderable', 'Fixed location - not reorderable')}</p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Single user route panel ───────────────────────────────────────────────────

function UserRoutePanel({
  companySlug,
  route,
  onReorder,
  onJobOpen,
  onOptimize,
  optimizing,
  highlightedJobId,
  onJobCardHover,
  baselineMinutes,
  availableMinutes,
  drawMode,
  drawOrder,
  onDrawStart,
  onDrawAssign,
  onDrawReset,
  onDrawExit,
}: {
  companySlug?: string
  route: UserRoute
  onReorder: (userId: number, newJobs: RouteJob[]) => void
  onJobOpen: (id: number | string) => void
  onOptimize: (userId: number) => void
  optimizing: boolean
  highlightedJobId?: number | string | null
  onJobCardHover?: (jobId: number | string | null) => void
  baselineMinutes?: number
  availableMinutes?: number
  drawMode?: boolean
  drawOrder?: (number | string)[]
  onDrawStart?: () => void
  onDrawAssign?: (jobId: number | string) => void
  onDrawReset?: () => void
  onDrawExit?: () => void
}) {
  const { t } = useAppI18n()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const activeJobs = route.jobs.filter(j => !j.is_cancelled)
  const cancelledJobs = route.jobs.filter(j => j.is_cancelled)
  const startJob = activeJobs.length > 0 && activeJobs[0].is_home ? activeJobs[0] : null
  const endJob = activeJobs.length > 1 && activeJobs[activeJobs.length - 1].is_home ? activeJobs[activeJobs.length - 1] : null
  const middleJobs = startJob && endJob
    ? activeJobs.slice(1, -1)
    : startJob
      ? activeJobs.slice(1)
      : endJob
        ? activeJobs.slice(0, -1)
        : activeJobs
  const hasCoords = activeJobs.filter(j => j.lat && j.lng).length > 1
  const canDraw = middleJobs.length >= 2

  // ── Draw mode: derive numbered + remaining lists from drawOrder ──────────────
  const drawOrderSafe = drawMode ? (drawOrder ?? []) : []
  const drawNumberByJob = useMemo(() => {
    const m = new Map<string, number>()
    drawOrderSafe.forEach((id, i) => m.set(String(id), i + 1))
    return m
  }, [drawOrderSafe])
  const orderedDrawnJobs = useMemo(() => (
    drawOrderSafe
      .map(id => middleJobs.find(j => String(j.id) === String(id)))
      .filter((j): j is RouteJob => !!j)
  ), [drawOrderSafe, middleJobs])
  const remainingDrawJobs = useMemo(() => (
    middleJobs.filter(j => !drawNumberByJob.has(String(j.id)))
  ), [middleJobs, drawNumberByJob])
  const nextDrawNumber = drawOrderSafe.length + 1
  const drawComplete = drawMode && remainingDrawJobs.length === 0 && middleJobs.length > 0
  const driveMinutes = route.totalMinutes ?? 0
  const workMinutes = sumWorkMinutes(activeJobs)
  const fullMinutes = driveMinutes + workMinutes
  const overMinutes =
    availableMinutes != null && availableMinutes > 0 ? fullMinutes - availableMinutes : null

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIdx = middleJobs.findIndex(j => j.id === active.id)
      const newIdx = middleJobs.findIndex(j => j.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return
      const newMiddle = arrayMove(middleJobs, oldIdx, newIdx)
      const fullOrder = [...(startJob ? [startJob] : []), ...newMiddle, ...(endJob ? [endJob] : []), ...cancelledJobs]
      onReorder(route.userId, fullOrder)
    },
    [middleJobs, startJob, endJob, cancelledJobs, route.userId, onReorder]
  )

  return (
    <div className={`flex flex-col gap-3 ${drawMode ? 'is-draw-mode' : ''}`}>
      {/* Stats strip */}
      {(route.totalMinutes != null || route.totalKm != null || fullMinutes > 0) && (
        <div
          className="grid grid-cols-3 gap-1.5 transition-opacity duration-200"
          style={{ opacity: drawMode ? 0.32 : 1 }}
        >
          <div className="rounded-lg px-2.5 py-2 text-center bg-accent-50 border border-accent-100">
            <p className="text-[9px] uppercase tracking-widest font-bold mb-0.5 text-accent-500">{t('app.routePlanner.drive', 'Drive')}</p>
            <p className="text-[13px] font-bold text-accent-600 leading-tight">
              {route.totalMinutes != null ? fmtMin(route.totalMinutes) : '—'}
            </p>
          </div>
          <div className="rounded-lg px-2.5 py-2 text-center bg-gray-50 border border-gray-100">
            <p className="text-[9px] uppercase tracking-widest font-bold mb-0.5 text-gray-400">{t('app.routePlanner.distance', 'Dist.')}</p>
            <p className="text-[13px] font-bold text-gray-800 leading-tight">
              {route.totalKm != null ? `${route.totalKm.toFixed(1)} km` : '—'}
            </p>
          </div>
          <div
            className={`rounded-lg px-2.5 py-2 text-center border ${
              overMinutes != null && overMinutes > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'
            }`}
          >
            <p
              className={`text-[9px] uppercase tracking-widest font-bold mb-0.5 ${
                overMinutes != null && overMinutes > 0 ? 'text-amber-600' : 'text-gray-400'
              }`}
            >
              {t('app.routePlanner.fullTime', 'Full time')}
            </p>
            <p
              className={`text-[13px] font-bold leading-tight ${
                overMinutes != null && overMinutes > 0 ? 'text-amber-700' : 'text-gray-800'
              }`}
            >
              {fmtMin(fullMinutes)}
            </p>
            {availableMinutes != null && availableMinutes > 0 && (
              <p
                className={`mt-0.5 text-[9px] font-medium leading-tight ${
                  overMinutes != null && overMinutes > 0 ? 'text-amber-600' : 'text-gray-500'
                }`}
              >
                {overMinutes != null && overMinutes > 0
                  ? t('app.routePlanner.overAvailable', 'Over by {{amount}}').replace('{{amount}}', fmtMin(overMinutes))
                  : t('app.routePlanner.withinAvailable', '{{amount}} available').replace('{{amount}}', fmtMin(availableMinutes))}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Draw route (primary) + auto-draw (secondary) — or draw-mode controls */}
      {!drawMode ? (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => onDrawStart?.()}
            disabled={!canDraw || optimizing || !onDrawStart}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-[13px] font-bold bg-gray-900 text-white hover:bg-gray-800 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(0,0,0,0.12)]"
            title={t('app.routePlanner.drawRouteHint', 'Click stops in the order you want to visit them.')}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828A2 2 0 0110 14H8v-2a2 2 0 01.586-1.414L9 11zM3 21l4-1 9-9-3-3-9 9-1 4z" />
            </svg>
            {t('app.routePlanner.drawRoute', 'Draw route')}
          </button>
          <button
            type="button"
            onClick={() => onOptimize(route.userId)}
            disabled={optimizing || !hasCoords}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {optimizing ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('app.routePlanner.optimizing', 'Optimizing...')}
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('app.routePlanner.autoDraw', 'Auto-draw route')}
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-accent-200 bg-gradient-to-br from-accent-50 via-white to-accent-50/50 px-3 py-3 shadow-[0_4px_18px_rgba(61,213,122,0.18)]">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
              style={{ background: route.color, boxShadow: `0 2px 8px ${route.color}50` }}
            >
              {drawComplete ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                nextDrawNumber
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-gray-900 leading-tight truncate">
                {drawComplete
                  ? t('app.routePlanner.drawComplete', 'Route drawn!')
                  : t('app.routePlanner.drawNext', 'Pick stop #{{n}}').replace('{{n}}', String(nextDrawNumber))}
              </p>
              <p className="text-[10.5px] text-gray-500 mt-0.5 leading-tight">
                {drawComplete
                  ? t('app.routePlanner.drawCompleteHint', 'Saving order…')
                  : t('app.routePlanner.drawRouteHint', 'Click stops in the order you want to visit them.')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDrawReset?.()}
              disabled={drawOrderSafe.length === 0 || !onDrawReset}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-white/80 border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('app.routePlanner.drawReset', 'Reset')}
            </button>
            <button
              type="button"
              onClick={() => onDrawExit?.()}
              disabled={!onDrawExit}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {t('app.routePlanner.drawExit', 'Exit')}
            </button>
          </div>
          {middleJobs.length > 0 && (
            <div className="mt-2.5 h-1 w-full rounded-full bg-white/70 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(drawOrderSafe.length / middleJobs.length) * 100}%`,
                  background: route.color,
                  boxShadow: `0 0 8px ${route.color}80`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-gray-100" />

      {/* Timeline job list */}
      {activeJobs.length === 0 && cancelledJobs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">{t('app.routePlanner.noJobsToday', 'No jobs today')}</p>
      ) : drawMode ? (
        <div className="relative z-10">
          {startJob && (
            <HomeStopRow
              companySlug={companySlug}
              userId={route.userId}
              job={startJob}
              color={route.color}
              dimmed
              showConnectorBelow
              onMouseEnter={() => onJobCardHover?.(startJob.id)}
              onMouseLeave={() => onJobCardHover?.(null)}
            />
          )}

          {orderedDrawnJobs.map((job, idx) => (
            <SequentialPickListRow
              key={`picked-${job.id}`}
              id={job.id}
              label={job.label}
              address={job.address}
              accentColor={route.color}
              pickActive
              pickOrder={drawOrderSafe}
              highlightedId={highlightedJobId}
              isLast={idx === orderedDrawnJobs.length - 1 && remainingDrawJobs.length === 0}
              onAssign={onDrawAssign}
              onMouseEnter={() => onJobCardHover?.(job.id)}
              onMouseLeave={() => onJobCardHover?.(null)}
            />
          ))}

          {orderedDrawnJobs.length > 0 && remainingDrawJobs.length > 0 && (
            <div className="flex items-center gap-2 py-2 pl-7">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                {t('app.routePlanner.drawRemaining', 'Remaining stops')}
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
            </div>
          )}

          {remainingDrawJobs.map((job, idx) => (
            <SequentialPickListRow
              key={`pool-${job.id}`}
              id={job.id}
              label={job.label}
              address={job.address}
              accentColor={route.color}
              pickActive
              pickOrder={drawOrderSafe}
              highlightedId={highlightedJobId}
              isLast={idx === remainingDrawJobs.length - 1}
              onAssign={onDrawAssign}
              onMouseEnter={() => onJobCardHover?.(job.id)}
              onMouseLeave={() => onJobCardHover?.(null)}
            />
          ))}

          {endJob && (
            <HomeStopRow
              companySlug={companySlug}
              userId={route.userId}
              job={endJob}
              color={route.color}
              dimmed
              showConnectorBelow={false}
              onMouseEnter={() => onJobCardHover?.(endJob.id)}
              onMouseLeave={() => onJobCardHover?.(null)}
            />
          )}
        </div>
      ) : (
        <div>
          {activeJobs.length > 0 && (
            <>
              {/* Fixed start (home) row */}
              {startJob && (
                <HomeStopRow companySlug={companySlug} userId={route.userId} job={startJob} color={route.color} onMouseEnter={() => onJobCardHover?.(startJob.id)} onMouseLeave={() => onJobCardHover?.(null)} />
              )}

              {/* Drive time from start (home) to first stop */}
              {startJob && middleJobs.length > 0 && middleJobs[0].legMinutes != null && middleJobs[0].legMinutes > 0 && (
                <TimelineDrivePill minutes={middleJobs[0].legMinutes!} />
              )}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={middleJobs.map(j => j.id)} strategy={verticalListSortingStrategy}>
                  <div>
                    {middleJobs.map((job, idx) => (
                      <SortableJobCard
                        key={job.id}
                        job={job}
                        index={idx}
                        isLast={idx === middleJobs.length - 1}
                        color={route.color}
                        nextLegMinutes={middleJobs[idx + 1]?.legMinutes}
                        onOpen={onJobOpen}
                        isHighlighted={highlightedJobId != null && String(job.id) === String(highlightedJobId)}
                        onMouseEnter={() => onJobCardHover?.(job.id)}
                        onMouseLeave={() => onJobCardHover?.(null)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Fixed end (home) row */}
              {endJob && (
                <>
                  {/* Drive time from last stop back to end (home) */}
                  {middleJobs.length > 0 && endJob.legMinutes != null && endJob.legMinutes > 0 && (
                    <TimelineDrivePill minutes={endJob.legMinutes!} />
                  )}

                <HomeStopRow companySlug={companySlug} userId={route.userId} job={endJob} color={route.color} showConnectorBelow={false} onMouseEnter={() => onJobCardHover?.(endJob.id)} onMouseLeave={() => onJobCardHover?.(null)} />
                </>
              )}
            </>
          )}

          {/* Cancelled jobs */}
          {cancelledJobs.length > 0 && (
            <div className="mt-5">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-2.5 text-gray-400">
                Cancelled ({cancelledJobs.length})
              </p>
              <div className="space-y-1.5">
                {cancelledJobs.map(job => (
                  <div
                    key={job.id}
                    className="rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 bg-gray-50 border border-gray-100 opacity-60"
                  >
                    <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 truncate line-through">{job.label}</p>
                      {job.address && <p className="text-[10px] text-gray-400 truncate">{job.address}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── All-users overview ────────────────────────────────────────────────────────

function AllUsersPanel({
  routes,
  onSelectUser,
  baselineMinutesByUser,
}: {
  routes: UserRoute[]
  onSelectUser: (userId: number) => void
  baselineMinutesByUser?: Record<number, number>
}) {
  const { t } = useAppI18n()
  const totalDelta = routes.reduce((sum, route) => {
    const baseline = baselineMinutesByUser?.[route.userId]
    const total = route.totalMinutes
    if (baseline == null || baseline <= 0 || total == null) return sum
    return sum + (total - baseline)
  }, 0)
  const showTotalDelta = Math.abs(totalDelta) >= 0.5

  return (
    <div>
      <p className="text-[11px] text-gray-400 text-center mb-1">
        {t('app.routePlanner.selectEmployeePlan', 'Select an employee to plan their route')}
      </p>
      {showTotalDelta && (
        <p className="text-[11px] text-center mb-4">
          <span
            className={
              totalDelta < 0
                ? 'text-emerald-600 font-medium'
                : 'text-amber-600 font-medium'
            }
          >
            {totalDelta < 0
              ? `${t('app.routePlanner.totalSaved', 'Total saved:')} ${fmtMin(Math.abs(totalDelta))}`
              : `${t('app.routePlanner.totalAdded', 'Total added:')} ${fmtMin(totalDelta)}`}
          </span>
        </p>
      )}
      {!showTotalDelta && <div className="mb-4" />}
      <div className="space-y-2">
        {routes.map(route => {
          const stops = route.jobs.filter(j => !j.is_cancelled && !j.is_home).length
          const baseline = baselineMinutesByUser?.[route.userId]
          const total = route.totalMinutes
          const diff =
            baseline != null && baseline > 0 && total != null ? total - baseline : null
          const timeDeltaLabel =
            diff != null && Math.abs(diff) >= 0.5
              ? diff < 0
                ? `${t('app.routePlanner.saved', 'Saved')} ${fmtDeltaMin(diff)}`
                : `+${fmtDeltaMin(diff)}`
              : null
          const timeDeltaSaved = diff != null && diff < -0.5

          return (
            <button
              key={route.userId}
              type="button"
              onClick={() => onSelectUser(route.userId)}
              className="w-full text-left rounded-2xl px-4 py-3.5 flex items-center gap-3.5 bg-white border border-gray-100 shadow-sm hover:border-gray-200 hover:shadow-md transition-all group"
            >
              {/* Avatar */}
              <div
                className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
                style={{ background: route.color, boxShadow: `0 4px 10px ${route.color}40` }}
              >
                {route.userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{route.userName}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {stops} {stops === 1 ? t('app.routePlanner.stop', 'stop') : t('app.routePlanner.stops', 'stops')}
                  {total != null && ` · ${fmtMin(total)} ${t('app.routePlanner.driving', 'driving')}`}
                  {timeDeltaLabel && (
                    <span
                      className={
                        timeDeltaSaved
                          ? ' text-emerald-600 font-medium'
                          : ' text-amber-600 font-medium'
                      }
                    >
                      {' · '}
                      {timeDeltaLabel}
                    </span>
                  )}
                </p>
                {/* Stop progress dots */}
                {stops > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {Array.from({ length: Math.min(stops, 10) }).map((_, i) => (
                      <div
                        key={i}
                        className="h-1 rounded-full flex-1"
                        style={{
                          background: route.color,
                          opacity: 0.3 + 0.7 * (i / Math.max(stops - 1, 1)),
                          maxWidth: 20,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Chevron */}
              <svg
                className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-all group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )
        })}
        {routes.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">{t('app.routePlanner.noJobsScheduledToday', 'No jobs scheduled today')}</p>
        )}
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

interface DayRoutePanelProps {
  companySlug?: string
  routes: UserRoute[]
  focusUserId: number | null
  onSelectUser: (userId: number) => void
  onClearUser: () => void
  onReorder: (userId: number, newJobs: RouteJob[]) => void
  onJobOpen: (jobId: number) => void
  onOptimize: (userId: number) => void
  optimizing: boolean
  geocodingCount: number
  onSave: () => Promise<void>
  onBackToWeek?: () => void
  dateLabel?: string
  highlightedJobId?: number | string | null
  onJobCardHover?: (jobId: number | string | null) => void
  baselineMinutesByUser?: Record<number, number>
  availableMinutesByUser?: Record<number, number>
  /** Manual route-drawing mode (one click per stop). */
  drawMode?: boolean
  drawOrder?: (number | string)[]
  onDrawStart?: () => void
  onDrawAssign?: (jobId: number | string) => void
  onDrawReset?: () => void
  onDrawExit?: () => void
}

export default function DayRoutePanel({
  companySlug,
  routes,
  focusUserId,
  onSelectUser,
  onClearUser,
  onReorder,
  onJobOpen,
  onOptimize,
  optimizing,
  geocodingCount,
  onSave,
  onBackToWeek,
  dateLabel,
  highlightedJobId,
  onJobCardHover,
  baselineMinutesByUser,
  availableMinutesByUser,
  drawMode,
  drawOrder,
  onDrawStart,
  onDrawAssign,
  onDrawReset,
  onDrawExit,
}: DayRoutePanelProps) {
  const { t, locale } = useAppI18n()
  // Solo company: only one user has routes today → skip the "all employees" picker entirely
  // and render that user's route panel directly. The user can't (and shouldn't) navigate
  // back to a multi-employee overview.
  const isSoloCompany = routes.length === 1
  const focusedRoute = isSoloCompany
    ? routes[0]
    : focusUserId != null
      ? routes.find(r => r.userId === focusUserId)
      : null
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    await onSave()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F8F9FB] border-r border-gray-200">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          {focusedRoute && !isSoloCompany ? (
            <button
              type="button"
              onClick={onClearUser}
              className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-all"
              title={t('app.routePlanner.allEmployees', 'All employees')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : onBackToWeek ? (
            <button
              type="button"
              onClick={onBackToWeek}
              className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0 bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-all"
              title={t('app.routePlanner.backToWeek', 'Back to week view')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : null}
          {focusedRoute ? (
            <>
              <RouteEmployeeAvatar name={focusedRoute.userName} color={focusedRoute.color} size={36} />
              <p className="flex-1 min-w-0 text-base font-bold text-gray-900 truncate">{focusedRoute.userName}</p>
            </>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight">
                {t('app.routePlanner.selectEmployeePlan', 'Select an employee to plan their route')}
              </p>
              {dateLabel && (
                <p className="text-[11px] text-gray-400 mt-0.5 truncate">{dateLabel}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 mb-3 h-px bg-gray-200" />

      {/* ── Scrollable body ─────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-5 pb-4"
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {focusedRoute ? (
          <UserRoutePanel
            companySlug={companySlug}
            route={focusedRoute}
            onReorder={onReorder}
            onJobOpen={id => onJobOpen(id as number)}
            onOptimize={onOptimize}
            optimizing={optimizing}
            highlightedJobId={highlightedJobId}
            onJobCardHover={onJobCardHover}
            baselineMinutes={baselineMinutesByUser?.[focusedRoute.userId]}
            availableMinutes={availableMinutesByUser?.[focusedRoute.userId]}
            drawMode={drawMode}
            drawOrder={drawOrder}
            onDrawStart={onDrawStart}
            onDrawAssign={onDrawAssign}
            onDrawReset={onDrawReset}
            onDrawExit={onDrawExit}
          />
        ) : (
          <AllUsersPanel
            routes={routes}
            onSelectUser={onSelectUser}
            baselineMinutesByUser={baselineMinutesByUser}
          />
        )}
      </div>

      {/* ── Sticky footer: save button ──────────────────────────── */}
      <div
        className="flex-shrink-0 px-5 pt-3 pb-5 border-t border-gray-200 transition-opacity duration-200"
        style={{ opacity: drawMode ? 0.32 : 1 }}
      >
        {geocodingCount > 0 && (
          <p className="text-[11px] text-amber-500 mb-2 flex items-center gap-1.5 justify-center">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t('app.routePlanner.locatingAddresses', 'Locating {{count}} address{{suffix}}...')
              .replace('{{count}}', String(geocodingCount))
              .replace('{{suffix}}', geocodingCount !== 1 ? (locale === 'da' ? 'r' : 'es') : '')}
          </p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || drawMode}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all disabled:opacity-60"
          title={drawMode ? t('app.routePlanner.drawSaveBlocked', 'Finish drawing to save.') : undefined}
          style={{
            background: saved ? '#10b981' : '#3DD57A',
            color: saved ? '#fff' : '#0A1A0A',
            boxShadow: saved
              ? '0 0 20px rgba(16,185,129,0.3)'
              : '0 4px 20px rgba(61,213,122,0.28)',
            transform: saving ? 'scale(0.98)' : 'scale(1)',
          }}
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('app.routePlanner.saving', 'Saving...')}
            </>
          ) : saved ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {t('app.routePlanner.routeSaved', 'Route saved!')}
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {t('app.routePlanner.saveApply', 'Save & apply route')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
