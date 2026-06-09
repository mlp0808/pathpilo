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

// Shared timeline rail width
const RAIL_W = 30

/** Compact drive label for the narrow timeline rail, e.g. "34m" or "1h20". */
function fmtMinRail(minutes: number) {
  if (!minutes || minutes < 1) return ''
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h${m}` : `${h}h`
}

/** Drive-time segment living inside the timeline rail between two stops. */
function RailDriveConnector({ minutes }: { minutes: number }) {
  const label = fmtMinRail(minutes)
  if (!label) {
    return <div className="w-px flex-1 mt-1 bg-gray-200 min-h-[22px]" />
  }

  return (
    <div
      className="flex flex-col items-center flex-1 mt-1 w-full min-h-[28px]"
      title={fmtMin(minutes)}
    >
      <div className="w-px flex-1 bg-gray-200 min-h-[6px]" />
      <span
        className="inline-flex items-center justify-center rounded-md bg-gray-100 border border-gray-200/70 px-[3px] py-1.5 text-[9px] font-semibold text-gray-500 tabular-nums leading-none select-none shrink-0"
        style={{ writingMode: 'vertical-lr' }}
      >
        {label}
      </span>
      <div className="w-px flex-1 bg-gray-200 min-h-[6px]" />
    </div>
  )
}

function sumWorkMinutes(jobs: RouteJob[]) {
  return jobs.reduce((sum, j) => {
    if (j.is_cancelled || j.is_home) return sum
    return sum + (j.estimated_duration_minutes ?? 0)
  }, 0)
}

/** Text-only route summary line (drive, distance, delta). */
function RouteStatsLine({
  route,
  baselineMinutes,
  availableMinutes,
  className = '',
}: {
  route: UserRoute
  baselineMinutes?: number
  availableMinutes?: number
  className?: string
}) {
  const { t } = useAppI18n()
  const activeJobs = route.jobs.filter(j => !j.is_cancelled)
  const driveMinutes = route.totalMinutes ?? 0
  const workMinutes = sumWorkMinutes(activeJobs)
  const fullMinutes = driveMinutes + workMinutes
  const overMinutes =
    availableMinutes != null && availableMinutes > 0 ? fullMinutes - availableMinutes : null
  const driveVsBaselineDiff = (() => {
    const total = route.totalMinutes
    const baseline = baselineMinutes
    if (baseline == null || baseline <= 0 || total == null || !Number.isFinite(total)) return null
    const diff = total - baseline
    if (Math.abs(diff) < 0.5) return null
    return diff
  })()

  if (route.totalMinutes == null && route.totalKm == null && fullMinutes <= 0) {
    return (
      <p className={`text-[12px] text-gray-400 ${className}`}>
        {t('app.routePlanner.noRouteYet', 'No route yet')}
      </p>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 text-[12px] min-w-0 flex-wrap leading-tight ${className}`}>
      {route.totalMinutes != null && (
        <span className="font-semibold text-gray-600 tabular-nums">
          {fmtMin(route.totalMinutes)} {t('app.routePlanner.driveLower', 'drive')}
        </span>
      )}
      {route.totalKm != null && (
        <span className="text-gray-400 tabular-nums">· {route.totalKm.toFixed(1)} km</span>
      )}
      {driveVsBaselineDiff != null && (
        <span className={`font-semibold ${driveVsBaselineDiff < 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
          · {driveVsBaselineDiff < 0
            ? t('app.routePlanner.driveDeltaSavedShort', '{{amount}} saved').replace('{{amount}}', fmtDeltaMin(driveVsBaselineDiff))
            : t('app.routePlanner.driveDeltaExtraShort', '{{amount}} extra').replace('{{amount}}', fmtDeltaMin(driveVsBaselineDiff))}
        </span>
      )}
      {overMinutes != null && overMinutes > 0 && (
        <span className="font-semibold text-amber-600">
          · {t('app.routePlanner.overByShort', '+{{amount}}').replace('{{amount}}', fmtMin(overMinutes))}
        </span>
      )}
    </div>
  )
}

/** Dropdown menu for draw / auto-draw route tools. */
function RoutePlanMenu({
  label,
  actionsOpen,
  onToggle,
  onClose,
  canDraw,
  optimizing,
  hasCoords,
  onDrawStart,
  onOptimize,
  userId,
}: {
  label: string
  actionsOpen: boolean
  onToggle: () => void
  onClose: () => void
  canDraw: boolean
  optimizing: boolean
  hasCoords: boolean
  onDrawStart?: () => void
  onOptimize: (userId: number) => void
  userId: number
}) {
  const { t } = useAppI18n()

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-gray-100 text-gray-800 text-[14px] font-semibold hover:bg-gray-200/80 active:scale-[0.99] transition-all"
      >
        {label}
        <svg className={`w-4 h-4 text-gray-500 transition-transform ${actionsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {actionsOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.18)] border border-gray-100 p-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
            <button
              type="button"
              onClick={() => { onClose(); onDrawStart?.() }}
              disabled={!canDraw || optimizing || !onDrawStart}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center flex-shrink-0">
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 112.828 2.828L11.828 13.828A2 2 0 0110 14H8v-2a2 2 0 01.586-1.414L9 11zM3 21l4-1 9-9-3-3-9 9-1 4z" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-gray-900 leading-tight">{t('app.routePlanner.drawRoute', 'Draw route')}</span>
                <span className="block text-[11.5px] text-gray-500 leading-tight mt-0.5">{t('app.routePlanner.drawRouteSub', 'Tap stops in your own order')}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { onClose(); onOptimize(userId) }}
              disabled={optimizing || !hasCoords}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="w-9 h-9 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center flex-shrink-0">
                {optimizing ? (
                  <svg className="w-[18px] h-[18px] animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-gray-900 leading-tight">{t('app.routePlanner.autoDrawFull', 'Auto-draw route')}</span>
                <span className="block text-[11.5px] text-gray-500 leading-tight mt-0.5">{t('app.routePlanner.autoDrawSub', 'Let us find the fastest order')}</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
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
  const { t } = useAppI18n()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: job.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto' as const,
  }

  const hasDuration = job.estimated_duration_minutes != null && job.estimated_duration_minutes > 0

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex gap-3">
        {/* ── Rail: numbered node + connector ── */}
        <div className="flex flex-col items-center flex-shrink-0 pt-1" style={{ width: RAIL_W }}>
          <div
            className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0 transition-all duration-150"
            style={{
              width: 26,
              height: 26,
              fontSize: 12,
              background: color,
              boxShadow: isHighlighted ? `0 0 0 4px ${color}33, 0 2px 6px ${color}55` : `0 2px 5px ${color}45`,
              transform: isHighlighted ? 'scale(1.12)' : 'scale(1)',
            }}
          >
            {index + 1}
          </div>
          {!isLast && (
            nextLegMinutes != null && nextLegMinutes > 0 ? (
              <RailDriveConnector minutes={nextLegMinutes} />
            ) : (
              <div className="w-px flex-1 mt-1 bg-gray-200 min-h-[18px]" />
            )
          )}
        </div>

        {/* ── Card ── */}
        <div className="flex-1 min-w-0 pb-2.5">
          <div
            onClick={() => onOpen(job.id)}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className="rounded-2xl pl-4 pr-2 py-3 flex items-center gap-2 cursor-pointer transition-all duration-150 active:scale-[0.99]"
            style={{
              background: isHighlighted ? '#f0fdf4' : '#fff',
              border: `1.5px solid ${isHighlighted ? color : '#eef0ee'}`,
              boxShadow: isDragging
                ? '0 12px 30px rgba(0,0,0,0.14)'
                : isHighlighted
                ? `0 4px 16px ${color}22`
                : '0 1px 4px rgba(0,0,0,0.05)',
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-gray-900 truncate leading-tight">
                {job.label}
              </p>
              {job.address && (
                <p className="flex items-center gap-1 text-[12px] text-gray-400 truncate mt-1 leading-tight">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="truncate">{job.address}</span>
                </p>
              )}
              {(job.time || hasDuration) && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {job.time && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {job.time}
                    </span>
                  )}
                  {hasDuration && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      <svg className="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="13" r="8" />
                        <path d="M12 9v4l2.5 2.5M9 2h6" />
                      </svg>
                      {fmtMin(job.estimated_duration_minutes!)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Drag handle — clear grip affordance */}
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={e => e.stopPropagation()}
              className="flex-shrink-0 self-stretch flex items-center px-1.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none transition-colors"
              title={t('app.routePlanner.dragReorder', 'Drag to reorder')}
              aria-label={t('app.routePlanner.dragReorder', 'Drag to reorder')}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
              </svg>
            </button>
          </div>
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
  connectorDriveAbove,
  connectorDriveBelow,
}: {
  companySlug?: string
  userId?: number
  job: RouteJob
  color: string
  onMouseEnter: () => void
  onMouseLeave: () => void
  dimmed?: boolean
  showConnectorBelow?: boolean
  /** Drive time on the rail segment above this stop (e.g. last job → end). */
  connectorDriveAbove?: number | null
  /** Drive time on the rail segment below this stop (e.g. start → first job). */
  connectorDriveBelow?: number | null
}) {
  const { t } = useAppI18n()
  const isEmpty = !job.address || job.address.trim() === ''
  const settingsHref =
    companySlug && userId != null
      ? `/${companySlug}/settings/business?routeFor=${userId}`
      : companySlug
        ? `/${companySlug}/settings/business`
        : null
  // start node keeps the rail flowing below it; end node is the last item.
  const isStart = showConnectorBelow

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`flex gap-3 ${dimmed ? 'opacity-35 pointer-events-none' : ''}`}
    >
      {/* ── Rail: home node + connector ── */}
      <div className="flex flex-col items-center flex-shrink-0 pt-1" style={{ width: RAIL_W }}>
        {connectorDriveAbove != null && connectorDriveAbove > 0 && (
          <RailDriveConnector minutes={connectorDriveAbove} />
        )}
        <div
          className="flex items-center justify-center rounded-full bg-white flex-shrink-0"
          style={{ width: 26, height: 26, border: `2px solid ${color}` }}
          title={t('app.routePlanner.startEndFixed', 'Start/end - fixed')}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" style={{ color }}>
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </div>
        {showConnectorBelow && (
          connectorDriveBelow != null && connectorDriveBelow > 0 ? (
            <RailDriveConnector minutes={connectorDriveBelow} />
          ) : (
            <div className="w-px flex-1 mt-1 bg-gray-200 min-h-[18px]" />
          )
        )}
      </div>

      {/* ── Card ── */}
      <div className={`flex-1 min-w-0 pb-2.5 ${connectorDriveAbove ? 'flex flex-col justify-end' : ''}`}>
        <div className="rounded-2xl px-4 py-3 bg-gray-50 border border-gray-100 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-[0.12em] text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">
                {isStart ? t('app.routePlanner.start', 'Start') : t('app.routePlanner.end', 'End')}
              </span>
              <p className="text-[13px] font-semibold text-gray-700 truncate">{job.label}</p>
            </div>
            {isEmpty ? (
              settingsHref ? (
                <Link
                  href={settingsHref}
                  className="text-[12px] text-accent-600 hover:text-accent-700 hover:underline mt-1 inline-block"
                >
                  {t('app.routePlanner.selectStartEnd', 'Select start/end location')}
                </Link>
              ) : (
                <p className="text-[12px] text-gray-400 mt-1">{t('app.routePlanner.selectStartEnd', 'Select start/end location')}</p>
              )
            ) : (
              <p className="text-[12px] text-gray-400 truncate mt-1">{job.address}</p>
            )}
          </div>
          {/* Fixed (not draggable) indicator */}
          <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
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
  drawRouteComparison,
  onDrawStart,
  onDrawAssign,
  onDrawReset,
  onDrawExit,
  onAddJob,
  jobsFirst = false,
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
  drawRouteComparison?: { diffMinutes: number } | null
  onDrawStart?: () => void
  onDrawAssign?: (jobId: number | string) => void
  onDrawReset?: () => void
  onDrawExit?: () => void
  onAddJob?: () => void
  /** Mobile sheet: show the job timeline before stats / draw controls */
  jobsFirst?: boolean
}) {
  const { t } = useAppI18n()
  const [actionsOpen, setActionsOpen] = useState(false)
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
    <div className={`flex flex-col ${jobsFirst ? '' : 'gap-3'} ${drawMode ? 'is-draw-mode' : ''}`}>
      {/* Mobile: plan actions + stats before the job list */}
      {jobsFirst && !drawMode && (
        <div className="flex flex-col gap-2 mb-3 flex-shrink-0">
          <RoutePlanMenu
            label={t('app.routePlanner.actions', 'Actions')}
            actionsOpen={actionsOpen}
            onToggle={() => setActionsOpen(o => !o)}
            onClose={() => setActionsOpen(false)}
            canDraw={canDraw}
            optimizing={optimizing}
            hasCoords={hasCoords}
            onDrawStart={onDrawStart}
            onOptimize={onOptimize}
            userId={route.userId}
          />
          <RouteStatsLine
            route={route}
            baselineMinutes={baselineMinutes}
            availableMinutes={availableMinutes}
            className="px-0.5"
          />
        </div>
      )}

      {/* Desktop: plan route menu before the job list */}
      {!jobsFirst && !drawMode && (
        <div className="mb-3 flex-shrink-0">
          <RoutePlanMenu
            label={t('app.routePlanner.planRoute', 'Plan route')}
            actionsOpen={actionsOpen}
            onToggle={() => setActionsOpen(o => !o)}
            onClose={() => setActionsOpen(false)}
            canDraw={canDraw}
            optimizing={optimizing}
            hasCoords={hasCoords}
            onDrawStart={onDrawStart}
            onOptimize={onOptimize}
            userId={route.userId}
          />
        </div>
      )}

      {/* Desktop: draw-mode banner */}
      {!jobsFirst && drawMode && (
        <div className="mb-3 rounded-2xl border border-accent-200 bg-gradient-to-br from-accent-50 via-white to-accent-50/50 px-3 py-3 shadow-[0_4px_18px_rgba(61,213,122,0.18)]">
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
                {drawComplete ? (
                  drawRouteComparison != null &&
                  Math.abs(drawRouteComparison.diffMinutes) >= 0.5 ? (
                    drawRouteComparison.diffMinutes > 0 ? (
                      <span className="text-emerald-700 font-semibold">
                        {t(
                          'app.routePlanner.drawSavedVsPreviousShort',
                          'Saved {{time}} of driving vs your previous route order.',
                        ).replace('{{time}}', fmtDeltaMin(drawRouteComparison.diffMinutes))}
                      </span>
                    ) : (
                      <span className="text-amber-700 font-semibold">
                        {t(
                          'app.routePlanner.drawAddedVsPreviousShort',
                          'About {{time}} more driving than your previous route order.',
                        ).replace('{{time}}', fmtDeltaMin(drawRouteComparison.diffMinutes))}
                      </span>
                    )
                  ) : (
                    t('app.routePlanner.drawCompleteHint', 'Saving order…')
                  )
                ) : (
                  t('app.routePlanner.drawRouteHint', 'Click stops in the order you want to visit them.')
                )}
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

      {/* Mobile draw-mode banner — above jobs */}
      {jobsFirst && drawMode && (
        <div className="mb-3 flex-shrink-0 rounded-2xl border border-accent-200 bg-gradient-to-br from-accent-50 via-white to-accent-50/50 px-3 py-3 shadow-[0_4px_18px_rgba(61,213,122,0.18)]">
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
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-white/80 border border-gray-200 text-gray-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('app.routePlanner.drawReset', 'Reset')}
            </button>
            <button
              type="button"
              onClick={() => onDrawExit?.()}
              disabled={!onDrawExit}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-gray-900 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('app.routePlanner.drawExit', 'Exit')}
            </button>
          </div>
        </div>
      )}

      {/* Timeline job list */}
      <div>
      {!jobsFirst && <div className="h-px bg-gray-100 mb-3" />}

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
                <HomeStopRow
                  companySlug={companySlug}
                  userId={route.userId}
                  job={startJob}
                  color={route.color}
                  connectorDriveBelow={
                    middleJobs.length > 0 && middleJobs[0].legMinutes != null && middleJobs[0].legMinutes > 0
                      ? middleJobs[0].legMinutes!
                      : null
                  }
                  onMouseEnter={() => onJobCardHover?.(startJob.id)}
                  onMouseLeave={() => onJobCardHover?.(null)}
                />
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

              {onAddJob && (
                <div className="flex gap-3">
                  {/* Rail: dashed "add" node keeps the timeline flowing */}
                  <div className="flex flex-col items-center flex-shrink-0 pt-1" style={{ width: RAIL_W }}>
                    <div className="w-[26px] h-[26px] rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  </div>
                  {/* Button */}
                  <div className="flex-1 min-w-0 pb-2.5">
                    <button
                      type="button"
                      onClick={onAddJob}
                      className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-2xl py-3 text-[13px] font-semibold text-gray-500 hover:text-accent-600 hover:border-accent-400 hover:bg-accent-50/40 transition-colors"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      {t('app.jobsPage.addNewJob', 'Add new job')}
                    </button>
                  </div>
                </div>
              )}

              {/* Fixed end (home) row */}
              {endJob && (
                <>
                <HomeStopRow
                  companySlug={companySlug}
                  userId={route.userId}
                  job={endJob}
                  color={route.color}
                  showConnectorBelow={false}
                  connectorDriveAbove={
                    middleJobs.length > 0 && endJob.legMinutes != null && endJob.legMinutes > 0
                      ? endJob.legMinutes!
                      : null
                  }
                  onMouseEnter={() => onJobCardHover?.(endJob.id)}
                  onMouseLeave={() => onJobCardHover?.(null)}
                />
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
  /** Driving time delta after draw-route vs order before draw (+ = saved). */
  drawRouteComparison?: { diffMinutes: number } | null
  onDrawStart?: () => void
  onDrawAssign?: (jobId: number | string) => void
  onDrawReset?: () => void
  onDrawExit?: () => void
  onAddJob?: () => void
  /** Compact layout for the mobile bottom sheet (datepicker lives in sheet header) */
  mobileSheet?: boolean
  /** Mobile: lift save bar into the sheet toolbar so it stays visible above the day picker */
  wrapMobileSheet?: (parts: { body: React.ReactNode; toolbar: React.ReactNode }) => React.ReactNode
  /** Route order or assignees differ from last save — controls save bar visibility */
  hasUnsavedChanges?: boolean
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
  drawRouteComparison,
  onDrawStart,
  onDrawAssign,
  onDrawReset,
  onDrawExit,
  onAddJob,
  mobileSheet = false,
  wrapMobileSheet,
  hasUnsavedChanges = false,
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
  const saveBarVisible = hasUnsavedChanges || saving || saved

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    await onSave()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const saveToolbarInner = (
    <div
      className={`flex-shrink-0 ${mobileSheet ? 'px-4 pt-2 pb-2' : 'px-5 pt-3 pb-5 border-t border-gray-200'}`}
      style={{ opacity: !mobileSheet && drawMode ? 0.32 : 1 }}
    >
      {focusedRoute && !mobileSheet && (
        <RouteStatsLine
          route={focusedRoute}
          baselineMinutes={baselineMinutesByUser?.[focusedRoute.userId]}
          availableMinutes={availableMinutesByUser?.[focusedRoute.userId]}
          className="mb-3"
        />
      )}
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
          color: '#fff',
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
  )

  const saveToolbar = mobileSheet ? (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        saveBarVisible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
      }`}
      aria-hidden={!saveBarVisible}
    >
      <div className="overflow-hidden min-h-0">
        {saveToolbarInner}
      </div>
    </div>
  ) : (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        saveBarVisible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
      }`}
      aria-hidden={!saveBarVisible}
    >
      <div className="overflow-hidden min-h-0">
        {saveToolbarInner}
      </div>
    </div>
  )

  const panelBody = (
    <>
      {focusedRoute &&
        !mobileSheet &&
        drawRouteComparison != null &&
        Math.abs(drawRouteComparison.diffMinutes) >= 0.5 && (
          <div
            className={`mx-5 mb-3 rounded-xl px-3 py-2.5 text-[12px] leading-snug border ${
              drawRouteComparison.diffMinutes > 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            {drawRouteComparison.diffMinutes > 0 ? (
              <>
                <span className="font-bold">
                  {t('app.routePlanner.drawSavedHeadline', 'Time saved')}
                </span>
                <span className="font-medium">
                  {' '}
                  —{' '}
                  {t(
                    'app.routePlanner.drawSavedVsPreviousBanner',
                    'About {{time}} less driving than before you reordered.',
                  ).replace('{{time}}', fmtDeltaMin(drawRouteComparison.diffMinutes))}
                </span>
              </>
            ) : (
              <>
                <span className="font-bold">
                  {t('app.routePlanner.drawAddedHeadline', 'Longer drive')}
                </span>
                <span className="font-medium">
                  {' '}
                  —{' '}
                  {t(
                    'app.routePlanner.drawAddedVsPreviousBanner',
                    'About {{time}} more driving than your previous order.',
                  ).replace('{{time}}', fmtDeltaMin(drawRouteComparison.diffMinutes))}
                </span>
              </>
            )}
          </div>
        )}

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
          drawRouteComparison={drawRouteComparison}
          onDrawStart={onDrawStart}
          onDrawAssign={onDrawAssign}
          onDrawReset={onDrawReset}
          onDrawExit={onDrawExit}
          onAddJob={onAddJob}
          jobsFirst={mobileSheet}
        />
      ) : (
        <AllUsersPanel
          routes={routes}
          onSelectUser={onSelectUser}
          baselineMinutesByUser={baselineMinutesByUser}
        />
      )}
    </>
  )

  if (mobileSheet && wrapMobileSheet) {
    return wrapMobileSheet({
      body: (
        <div className={`bg-[#F8F9FB] ${mobileSheet ? 'px-4 pt-1 pb-3' : 'px-5 pb-4'}`}>
          {panelBody}
        </div>
      ),
      toolbar: saveToolbar,
    })
  }

  return (
    <div className={`h-full flex flex-col overflow-hidden bg-[#F8F9FB] ${mobileSheet ? '' : 'border-r border-gray-200'}`}>

      {/* ── Header (desktop sidebar only) ───────────────────────── */}
      {!mobileSheet && (
      <>
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
      </>
      )}

      {/* ── Scrollable body ─────────────────────────────────────── */}
      <div
        className={`flex-1 overflow-y-auto min-h-0 ${mobileSheet ? 'px-4 pt-1 pb-3' : 'px-5 pb-4'}`}
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {panelBody}
      </div>

      {saveToolbar}
    </div>
  )
}
