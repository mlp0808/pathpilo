'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { HomeIcon, ArchiveBoxArrowDownIcon } from '@heroicons/react/24/outline'
import { UserRoute, RouteJob, IsolatedRouteSeg } from './RouteMap'
import { useAppI18n } from './I18nProvider'
import { SequentialPickListRow } from './sequentialPick/SequentialPickListRow'
import SaveAsRoundModal from './planner/SaveAsRoundModal'
import {
  EmployeeSwitcher,
  RouteActionIcons,
  RouteSaveStats,
  routeDrawMeta,
} from './planner/PlannerChrome'
import {
  PLANNER_ARCHIVED_JOBS_EVENT,
  archivePlannerJobId,
  getArchivedPlannerJobIds,
} from '@/app/utils/plannerArchivedJobs'
import {
  RoundNameField,
  RoundEmployeePicker,
  type PlacementUser,
  type RoundRecurrenceType,
  type RoundScheduleMode,
} from './planner/RoundPlacementBar'
import { RoundPlaceControls } from './planner/RoundPlaceControls'
import { apiUrl } from '@/app/utils/api'
import {
  arrivalEstimatesForRouteJobs,
  weekdayIndexFromDateStr,
  workDayStartFromHours,
} from '@/app/utils/estimateJobArrival'

/** Returns Mapbox [lng, lat] for a job, or null if coords are missing. */
function jobCoord(job: Pick<RouteJob, 'lat' | 'lng'>): [number, number] | null {
  const parse = (v: unknown): number | null => {
    const n = v == null ? null : typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : null
    return n != null && isFinite(n) ? n : null
  }
  const lat = parse(job.lat); const lng = parse(job.lng)
  if (lat == null || lng == null) return null
  return [lng, lat]
}

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
function RailDriveConnector({
  minutes,
  onHover,
  onLeave,
}: {
  minutes: number
  /** Hovering the drive-time badge isolates this route on the map. */
  onHover?: () => void
  onLeave?: () => void
}) {
  const label = fmtMinRail(minutes)
  if (!label) {
    return <div className="w-px flex-1 mt-1 bg-gray-200 min-h-[22px]" />
  }

  const hoverable = !!onHover

  return (
    <div
      className="flex flex-col items-center flex-1 mt-1 w-full min-h-[28px]"
      title={fmtMin(minutes)}
    >
      <div className="w-px flex-1 bg-gray-200 min-h-[6px]" />
      <span
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        className={`inline-flex items-center justify-center rounded-md bg-gray-100 border border-gray-200/70 px-[3px] py-1.5 text-[9px] font-semibold text-gray-500 tabular-nums leading-none select-none shrink-0 transition-colors ${hoverable ? 'cursor-pointer hover:bg-gray-200 hover:text-gray-700 hover:border-gray-300' : ''}`}
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

/** Three compact stat chips shown directly under the Actions/Plan-route button. */
function RouteQuickStats({
  route,
  baselineMinutes,
}: {
  route: UserRoute
  baselineMinutes?: number
}) {
  const activeJobs = route.jobs.filter(j => !j.is_cancelled)
  const driveMin = route.totalMinutes ?? 0
  const workMin = sumWorkMinutes(activeJobs)
  const totalMin = driveMin + workMin

  const driveDelta = (() => {
    const t = route.totalMinutes; const b = baselineMinutes
    if (b == null || b <= 0 || t == null || !Number.isFinite(t)) return null
    const d = t - b; return Math.abs(d) < 0.5 ? null : d
  })()

  const fmtShort = (m: number) => {
    if (!m || m < 1) return '—'
    if (m < 60) return `${Math.round(m)}m`
    const h = Math.floor(m / 60); const rem = Math.round(m % 60)
    return rem > 0 ? `${h}h ${rem}m` : `${h}h`
  }

  const activeJobs2 = route.jobs.filter(j => !j.is_cancelled)
  const locatedStops = activeJobs2.filter(j => j.lat != null && j.lng != null).length
  const driveLoading = route.totalMinutes == null && locatedStops >= 2

  if (!driveLoading && driveMin === 0 && workMin === 0) return null

  const SpinVal = () => (
    <svg className="w-3 h-3 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )

  return (
    <div className="grid grid-cols-3 gap-1 mt-1.5">
      <div className="flex flex-col items-center rounded-lg bg-gray-50 border border-gray-100 px-1 py-1.5">
        <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 leading-none mb-0.5">Drive</span>
        {driveLoading ? <SpinVal /> : <span className="text-[11px] font-bold text-gray-700 tabular-nums leading-none">{fmtShort(driveMin)}</span>}
        {!driveLoading && driveDelta != null && (
          <span className={`text-[8px] font-semibold tabular-nums leading-none mt-0.5 ${driveDelta < 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
            {driveDelta < 0 ? `−${fmtShort(-driveDelta)}` : `+${fmtShort(driveDelta)}`}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center rounded-lg bg-gray-50 border border-gray-100 px-1 py-1.5">
        <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 leading-none mb-0.5">Work</span>
        <span className="text-[11px] font-bold text-gray-700 tabular-nums leading-none">{fmtShort(workMin)}</span>
      </div>
      <div className="flex flex-col items-center rounded-lg bg-gray-50 border border-gray-100 px-1 py-1.5">
        <span className="text-[8px] font-semibold uppercase tracking-wider text-gray-400 leading-none mb-0.5">Total</span>
        {driveLoading ? <SpinVal /> : <span className="text-[11px] font-bold text-gray-700 tabular-nums leading-none">{fmtShort(totalMin)}</span>}
      </div>
    </div>
  )
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

/** Compact icon actions live in PlannerChrome — kept here only as a thin mobile fallback wrapper. */
function MobileRouteChrome({
  route,
  canDraw,
  optimizing,
  hasCoords,
  onDrawStart,
  onOptimize,
  onSaveAsRound,
}: {
  route: UserRoute
  canDraw: boolean
  optimizing: boolean
  hasCoords: boolean
  onDrawStart?: () => void
  onOptimize: (userId: number) => void
  onSaveAsRound?: () => void
}) {
  return (
    <div className="flex items-center justify-end mb-2 flex-shrink-0">
      <RouteActionIcons
        canDraw={canDraw}
        optimizing={optimizing}
        hasCoords={hasCoords}
        onDrawStart={onDrawStart}
        onOptimize={onOptimize}
        onSaveAsRound={onSaveAsRound}
        userId={route.userId}
      />
    </div>
  )
}

// -- Timeline-style sortable job card -----------------------------------------

function SortableJobCard({
  job,
  index,
  isLast,
  color,
  nextLegMinutes,
  arrivalEst,
  onOpen,
  isHighlighted,
  onMouseEnter,
  onMouseLeave,
  onRailHover,
  onRailLeave,
}: {
  job: RouteJob
  index: number
  isLast: boolean
  color: string
  nextLegMinutes?: number | null
  /** Estimated clock arrival from route order + drive + prior work. */
  arrivalEst?: string | null
  onOpen: (id: number | string) => void
  isHighlighted?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  /** Hovering the drive-time badge below this stop isolates the route on the map. */
  onRailHover?: () => void
  onRailLeave?: () => void
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
  const numberTitle = arrivalEst
    ? t('app.routePlanner.estArrival', 'est. {{time}}').replace('{{time}}', arrivalEst)
    : undefined

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex gap-3">
        {/* ── Rail: numbered node + connector ── */}
        <div className="flex flex-col items-center flex-shrink-0 pt-1" style={{ width: RAIL_W }}>
          <div
            title={numberTitle}
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
              <RailDriveConnector minutes={nextLegMinutes} onHover={onRailHover} onLeave={onRailLeave} />
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
              background: isHighlighted ? `${color}14` : '#fff',
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
  onRailHover,
  onRailLeave,
  dimmed,
  isHighlighted,
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
  /** Hovering a drive-time badge on this row isolates the route on the map. */
  onRailHover?: () => void
  onRailLeave?: () => void
  dimmed?: boolean
  isHighlighted?: boolean
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
          <RailDriveConnector minutes={connectorDriveAbove} onHover={onRailHover} onLeave={onRailLeave} />
        )}
        <div
          className="flex items-center justify-center rounded-full flex-shrink-0 transition-all duration-150"
          style={{
            width: 26,
            height: 26,
            background: color,
            boxShadow: isHighlighted
              ? `0 0 0 4px ${color}33, 0 2px 6px ${color}55`
              : `0 2px 5px ${color}45`,
            transform: isHighlighted ? 'scale(1.12)' : 'scale(1)',
          }}
          title={t('app.routePlanner.startEndFixed', 'Start/end - fixed')}
        >
          <HomeIcon className="w-[13px] h-[13px] text-white" strokeWidth={2.25} aria-hidden />
        </div>
        {showConnectorBelow && (
          connectorDriveBelow != null && connectorDriveBelow > 0 ? (
            <RailDriveConnector minutes={connectorDriveBelow} onHover={onRailHover} onLeave={onRailLeave} />
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
  onIsolateRoute,
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
  isWizardMode = false,
  onCompleteSetup,
  date,
  onEnsureSaved,
  onRoundSaved,
  hideInlineChrome = false,
  routeStatsClean = false,
}: {
  companySlug?: string
  route: UserRoute
  onReorder: (userId: number, newJobs: RouteJob[]) => void
  onJobOpen: (id: number | string) => void
  onOptimize: (userId: number) => void
  optimizing: boolean
  highlightedJobId?: number | string | null
  /** Isolate a single drive leg on the map while its drive-time badge is hovered. */
  onIsolateRoute?: (seg: IsolatedRouteSeg | null) => void
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
  /** Setup wizard mode — show "Keep adding" + "Save and complete setup" CTAs */
  isWizardMode?: boolean
  onCompleteSetup?: () => void
  date?: string
  onEnsureSaved?: () => Promise<void>
  onRoundSaved?: () => void
  hideInlineChrome?: boolean
  /** When true, RouteSaveStats treats current values as the saved baseline. */
  routeStatsClean?: boolean
}) {
  const { t } = useAppI18n()
  const [saveAsRoundOpen, setSaveAsRoundOpen] = useState(false)
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => getArchivedPlannerJobIds())
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set())
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    const sync = () => setArchivedIds(getArchivedPlannerJobIds())
    sync()
    window.addEventListener(PLANNER_ARCHIVED_JOBS_EVENT, sync)
    return () => window.removeEventListener(PLANNER_ARCHIVED_JOBS_EVENT, sync)
  }, [])

  const dismissInactiveJob = useCallback((jobId: string | number) => {
    const key = String(jobId)
    setExitingIds(prev => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    window.setTimeout(() => {
      archivePlannerJobId(key)
      setExitingIds(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, 280)
  }, [])

  const activeJobs = route.jobs.filter(j => !j.is_cancelled)
  const cancelledJobs = route.jobs.filter(
    j => j.is_cancelled && !(j as any).is_deleted && !archivedIds.has(String(j.id)),
  )
  const deletedJobs = route.jobs.filter(
    j => (j as any).is_deleted && !archivedIds.has(String(j.id)),
  )
  const startJob = activeJobs.find(j => j.is_home && String(j.id).startsWith('start-'))
    ?? (activeJobs.length > 0 && activeJobs[0].is_home ? activeJobs[0] : null)
  const endJob = activeJobs.find(j => j.is_home && String(j.id).startsWith('end-'))
    ?? (activeJobs.length > 1 && activeJobs[activeJobs.length - 1].is_home
      ? activeJobs[activeJobs.length - 1]
      : null)
  const middleJobs = activeJobs.filter(j => {
    if (!j.is_home) return true
    if (startJob && String(j.id) === String(startJob.id)) return false
    if (endJob && String(j.id) === String(endJob.id)) return false
    return false
  })
  const hasCoords = middleJobs.filter(j => j.lat != null && j.lng != null).length >= 2
  const canDraw = middleJobs.length >= 2

  // Employee day-start clock → used for hover "est. arrival" on stop numbers.
  const [dayStartClock, setDayStartClock] = useState('08:00')
  useEffect(() => {
    if (!date || !route.userId) {
      setDayStartClock('08:00')
      return
    }
    let cancelled = false
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    fetch(apiUrl(`/work-hours/${route.userId}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        const dayIndex = weekdayIndexFromDateStr(date)
        setDayStartClock(workDayStartFromHours(data?.workHours, dayIndex))
      })
      .catch(() => {
        if (!cancelled) setDayStartClock('08:00')
      })
    return () => { cancelled = true }
  }, [date, route.userId])

  const arrivalByJobId = useMemo(
    () => arrivalEstimatesForRouteJobs(middleJobs, dayStartClock),
    // Recompute when order, drive legs, or durations change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dayStartClock,
      middleJobs.map((j) => `${j.id}:${j.legMinutes ?? ''}:${j.estimated_duration_minutes ?? ''}`).join('|'),
    ],
  )

  // -- Draw mode: derive numbered + remaining lists from drawOrder --------------
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
      const fullOrder = [...(startJob ? [startJob] : []), ...newMiddle, ...(endJob ? [endJob] : []), ...cancelledJobs, ...deletedJobs]
      onReorder(route.userId, fullOrder)
    },
    [middleJobs, startJob, endJob, cancelledJobs, deletedJobs, route.userId, onReorder]
  )

  return (
    <div className={`flex flex-col ${jobsFirst ? '' : 'gap-3'} ${drawMode ? 'is-draw-mode' : ''}`}>
      {/* Mobile: compact actions + stats before the job list */}
      {jobsFirst && !drawMode && !hideInlineChrome && (
        <MobileRouteChrome
          route={route}
          canDraw={canDraw}
          optimizing={optimizing}
          hasCoords={hasCoords}
          onDrawStart={onDrawStart}
          onOptimize={onOptimize}
          onSaveAsRound={date ? () => setSaveAsRoundOpen(true) : undefined}
        />
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
      {!drawMode ? (
        <RouteSaveStats
          route={route}
          baselineDriveMinutes={baselineMinutes}
          isClean={routeStatsClean}
        />
      ) : (
        !jobsFirst && <div className="h-px bg-gray-100 mb-3" />
      )}

      {activeJobs.length === 0 && cancelledJobs.length === 0 && deletedJobs.length === 0 ? (
        onAddJob ? (
          <div className="py-6 px-0.5">
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
            <p className="text-center text-[11px] text-gray-400 mt-2.5 leading-snug">
              {t('app.routePlanner.emptyRouteHint', 'Add the first stop to start building this route.')}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-10">{t('app.routePlanner.noJobsToday', 'No jobs today')}</p>
        )
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
                  onRailHover={() => {
                    const from = jobCoord(startJob); const to = jobCoord(middleJobs[0] ?? endJob ?? startJob)
                    if (from && to) onIsolateRoute?.({ userId: route.userId, fromCoord: from, toCoord: to })
                  }}
                  onRailLeave={() => onIsolateRoute?.(null)}
                  isHighlighted={highlightedJobId != null && String(startJob.id) === String(highlightedJobId)}
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
                        arrivalEst={arrivalByJobId[String(job.id)] ?? null}
                        onOpen={onJobOpen}
                        isHighlighted={highlightedJobId != null && String(job.id) === String(highlightedJobId)}
                        onMouseEnter={() => onJobCardHover?.(job.id)}
                        onMouseLeave={() => onJobCardHover?.(null)}
                        onRailHover={() => {
                          const nextJob = middleJobs[idx + 1] ?? endJob
                          const from = jobCoord(job); const to = nextJob ? jobCoord(nextJob) : null
                          if (from && to) onIsolateRoute?.({ userId: route.userId, fromCoord: from, toCoord: to })
                        }}
                        onRailLeave={() => onIsolateRoute?.(null)}
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
                  onRailHover={() => {
                    const prevJob = middleJobs.length > 0 ? middleJobs[middleJobs.length - 1] : startJob
                    const from = prevJob ? jobCoord(prevJob) : null; const to = jobCoord(endJob)
                    if (from && to) onIsolateRoute?.({ userId: route.userId, fromCoord: from, toCoord: to })
                  }}
                  onRailLeave={() => onIsolateRoute?.(null)}
                  isHighlighted={highlightedJobId != null && String(endJob.id) === String(highlightedJobId)}
                />
                </>
              )}
            </>
          )}

          {/* Cancelled jobs */}
          {cancelledJobs.length > 0 && (
            <div className="mt-5">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-2.5 text-gray-400">
                {t('app.jobsPage.cancelledSection', 'Cancelled')} ({cancelledJobs.length})
              </p>
              <div className="space-y-1.5 overflow-hidden">
                {cancelledJobs.map(job => {
                  const exiting = exitingIds.has(String(job.id))
                  return (
                    <div
                      key={job.id}
                      className={`rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 bg-gray-50 border border-gray-100 opacity-60 transition-all duration-300 ease-out ${
                        exiting
                          ? '-translate-x-[120%] opacity-0 max-h-0 !py-0 !my-0 border-transparent overflow-hidden'
                          : 'translate-x-0 max-h-24'
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-500 truncate line-through">{job.label}</p>
                        {job.address && <p className="text-[10px] text-gray-400 truncate">{job.address}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          dismissInactiveJob(job.id)
                        }}
                        className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/80 transition-colors"
                        title={t('app.jobsPage.archiveFromPlanner', 'Hide from planner')}
                        aria-label={t('app.jobsPage.archiveFromPlanner', 'Hide from planner')}
                      >
                        <ArchiveBoxArrowDownIcon className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[9px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                        {t('app.jobsPage.cancelled', 'Cancelled')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Soft-deleted jobs — still visible until archived from the planner */}
          {deletedJobs.length > 0 && (
            <div className="mt-5">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-2.5 text-gray-400">
                {t('app.jobsPage.deletedSection', 'Deleted')} ({deletedJobs.length})
              </p>
              <div className="space-y-1.5 overflow-hidden">
                {deletedJobs.map(job => {
                  const exiting = exitingIds.has(String(job.id))
                  return (
                    <div
                      key={job.id}
                      className={`rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 bg-gray-50 border border-gray-100 opacity-35 transition-all duration-300 ease-out ${
                        exiting
                          ? '-translate-x-[120%] opacity-0 max-h-0 !py-0 !my-0 border-transparent overflow-hidden'
                          : 'translate-x-0 max-h-24'
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full bg-gray-200 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-500 truncate">{job.label}</p>
                        {job.address && <p className="text-[10px] text-gray-400 truncate">{job.address}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          dismissInactiveJob(job.id)
                        }}
                        className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/80 transition-colors"
                        title={t('app.jobsPage.archiveFromPlanner', 'Hide from planner')}
                        aria-label={t('app.jobsPage.archiveFromPlanner', 'Hide from planner')}
                      >
                        <ArchiveBoxArrowDownIcon className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[9px] font-semibold text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">
                        {t('app.jobsPage.deleted', 'Deleted')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Setup wizard CTAs ───────────────────────────────────── */}
          {isWizardMode && (
            <div className="mt-6 pt-4 border-t border-gray-200 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onAddJob}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              >
                Keep adding a few more jobs
              </button>
              <button
                type="button"
                onClick={onCompleteSetup}
                className="wizard-complete-cta w-full rounded-xl bg-[#3DD57A] px-4 py-3 text-[13px] font-semibold text-white shadow-lg shadow-[#3DD57A]/30 hover:bg-[#2ec46a] transition-colors"
              >
                Save and complete setup →
              </button>
              <style>{`
                @keyframes wizard-pulse {
                  0%, 100% { box-shadow: 0 4px 14px rgba(61,213,122,0.3); }
                  50% { box-shadow: 0 4px 28px rgba(61,213,122,0.65), 0 0 0 6px rgba(61,213,122,0.15); transform: scale(1.02); }
                }
                .wizard-complete-cta {
                  animation: wizard-pulse 2.8s ease-in-out infinite;
                }
                .wizard-complete-cta:hover {
                  animation: none;
                }
              `}</style>
            </div>
          )}
        </div>
      )}
      </div>

      {date && (
        <SaveAsRoundModal
          isOpen={saveAsRoundOpen}
          onClose={() => setSaveAsRoundOpen(false)}
          route={route}
          date={date}
          onEnsureSaved={onEnsureSaved}
          onSaved={onRoundSaved}
        />
      )}
    </div>
  )
}

// -- All-users overview -------------------------------------------------------

export interface BulkOptimizeProgress {
  step: number
  total: number
  message: string
}

function AllUsersPanel({
  routes,
  onSelectUser,
  baselineMinutesByUser,
  unsavedUserIds = [],
  onSaveAll,
  onDiscardAll,
  onBulkOptimize,
  onHoverUser,
  onSelectionChange,
}: {
  routes: UserRoute[]
  onSelectUser: (userId: number) => void
  baselineMinutesByUser?: Record<number, number>
  unsavedUserIds?: number[]
  onSaveAll?: () => Promise<void>
  onDiscardAll?: () => void
  onBulkOptimize?: (
    userIds: number[],
    allowReassign: boolean,
    onProgress: (p: BulkOptimizeProgress) => void,
  ) => Promise<void>
  /** Called when the user hovers in/out of an employee row (map-only isolation). */
  onHoverUser?: (userId: number | null) => void
  /** Called whenever the checkbox selection changes. */
  onSelectionChange?: (ids: number[]) => void
}) {
  const { t } = useAppI18n()
  const [savingAll, setSavingAll] = useState(false)
  const [savedAll, setSavedAll] = useState(false)
  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null)
  const [allowReassign, setAllowReassign] = useState(false)
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkOptimizeProgress | null>(null)

  // If this panel unmounts mid-hover (navigate away / open one employee), clear
  // the map isolation so a single route can't stick forever.
  useEffect(() => {
    return () => {
      onHoverUser?.(null)
      onSelectionChange?.([])
    }
  }, [onHoverUser, onSelectionChange])

  const isSelectMode = selectedIds.length > 0

  const toggleSelect = (userId: number) => {
    setSelectedIds(prev => {
      const next = prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
      onSelectionChange?.(next)
      return next
    })
  }

  const handleBulkRun = async () => {
    if (!onBulkOptimize || selectedIds.length === 0) return
    setBulkRunning(true)
    setBulkProgress({ step: 0, total: selectedIds.length + 2, message: 'Starting…' })
    try {
      await onBulkOptimize(selectedIds, allowReassign, p => setBulkProgress(p))
    } finally {
      setBulkRunning(false)
      setTimeout(() => {
        setBulkProgress(null)
        setSelectedIds([])
      }, 1200)
    }
  }

  const totalDelta = routes.reduce((sum, route) => {
    const baseline = baselineMinutesByUser?.[route.userId]
    const total = route.totalMinutes
    if (baseline == null || baseline <= 0 || total == null) return sum
    return sum + (total - baseline)
  }, 0)
  const showTotalDelta = Math.abs(totalDelta) >= 0.5

  return (
    <div>
      {/* Header hint — hidden during bulk run */}
      {!bulkRunning && (
        <p className="text-[11px] text-gray-400 text-center mb-1">
          {isSelectMode
            ? `${selectedIds.length} selected — click avatar to deselect`
            : t('app.routePlanner.selectEmployeePlan', 'Select an employee to plan their route')}
        </p>
      )}

      {/* Total delta */}
      {showTotalDelta && !bulkRunning && (
        <p className="text-[11px] text-center mb-4">
          <span className={totalDelta < 0 ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
            {totalDelta < 0
              ? `${t('app.routePlanner.totalSaved', 'Total saved:')} ${fmtMin(Math.abs(totalDelta))}`
              : `${t('app.routePlanner.totalAdded', 'Total added:')} ${fmtMin(totalDelta)}`}
          </span>
        </p>
      )}
      {!showTotalDelta && !bulkRunning && <div className="mb-4" />}

      {/* ── Progress bar (bulk running) ── */}
      {bulkRunning && bulkProgress && (
        <div className="mb-4 rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <svg className="w-4 h-4 flex-shrink-0 animate-spin text-[#3DD57A]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-xs font-medium text-gray-700 truncate flex-1">{bulkProgress.message}</p>
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              {bulkProgress.step}/{bulkProgress.total}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#3DD57A] transition-all duration-500"
              style={{
                width: `${bulkProgress.total > 0
                  ? Math.round((bulkProgress.step / bulkProgress.total) * 100)
                  : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Employee rows */}
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
          const isSelected = selectedIds.includes(route.userId)
          const isRowHovered = hoveredRowId === route.userId
          const showCheckbox = isSelected || isRowHovered

          return (
            <div
              key={route.userId}
              data-reassign-userid={route.userId}
              onMouseEnter={() => {
                setHoveredRowId(route.userId)
                onHoverUser?.(route.userId)
              }}
              onMouseLeave={() => {
                setHoveredRowId(null)
                onHoverUser?.(null)
              }}
              className={`relative flex items-center gap-3.5 rounded-2xl px-4 py-3.5 bg-white border shadow-sm transition-all cursor-pointer ${
                isSelected
                  ? 'border-[#3DD57A]/40 shadow-[0_2px_12px_rgba(61,213,122,0.12)]'
                  : 'border-gray-100 hover:border-gray-200 hover:shadow-md'
              } ${bulkRunning ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {/* Avatar / Checkbox — click toggles selection */}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); toggleSelect(route.userId) }}
                aria-label={isSelected ? 'Deselect employee' : 'Select employee'}
                className="relative w-9 h-9 flex-shrink-0 focus:outline-none"
              >
                {/* Colored avatar (hidden when checkbox is shown) */}
                <div
                  className="absolute inset-0 rounded-full flex items-center justify-center text-white text-sm font-bold transition-all duration-150"
                  style={{
                    background: route.color,
                    boxShadow: `0 4px 10px ${route.color}40`,
                    opacity: showCheckbox ? 0 : 1,
                    transform: showCheckbox ? 'scale(0.7)' : 'scale(1)',
                  }}
                >
                  {route.userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>

                {/* Square checkbox (shown on row hover or when selected) */}
                <div
                  className="absolute inset-0 rounded-md flex items-center justify-center transition-all duration-150"
                  style={{
                    background: isSelected ? '#3DD57A' : '#fff',
                    border: `2px solid ${isSelected ? '#3DD57A' : '#9ca3af'}`,
                    opacity: showCheckbox ? 1 : 0,
                    transform: showCheckbox ? 'scale(1)' : 'scale(0.7)',
                  }}
                >
                  {isSelected && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Info + nav — clicking navigates (or in select mode also toggles) */}
              <button
                type="button"
                onClick={() => isSelectMode ? toggleSelect(route.userId) : onSelectUser(route.userId)}
                className="flex-1 flex items-center gap-3 min-w-0 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{route.userName}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {stops} {stops === 1 ? t('app.routePlanner.stop', 'stop') : t('app.routePlanner.stops', 'stops')}
                    {total != null && ` · ${fmtMin(total)} ${t('app.routePlanner.driving', 'driving')}`}
                    {timeDeltaLabel && (
                      <span className={timeDeltaSaved ? ' text-emerald-600 font-medium' : ' text-amber-600 font-medium'}>
                        {' · '}{timeDeltaLabel}
                      </span>
                    )}
                  </p>
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

                {/* Chevron (hidden in select mode) */}
                {!isSelectMode && (
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0 transition-all group-hover:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          )
        })}
        {routes.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">{t('app.routePlanner.noJobsScheduledToday', 'No jobs scheduled today')}</p>
        )}
      </div>

      {/* ── Bulk-action toolbar (shown when employees are selected) ── */}
      {isSelectMode && !bulkRunning && onBulkOptimize && (
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <span className="text-xs font-semibold text-gray-700">
              {selectedIds.length === routes.length
                ? 'All employees selected'
                : `${selectedIds.length} employee${selectedIds.length !== 1 ? 's' : ''} selected`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  selectedIds.length === routes.length
                    ? setSelectedIds([])
                    : setSelectedIds(routes.map(r => r.userId))
                }
                className="text-[11px] text-[#3DD57A] font-semibold hover:underline"
              >
                {selectedIds.length === routes.length ? 'Deselect all' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-[11px] text-gray-400 hover:text-gray-600 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Allow reassign toggle */}
          <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50">
            <div className="flex-shrink-0 mt-0.5 relative">
              <input
                type="checkbox"
                checked={allowReassign}
                onChange={e => setAllowReassign(e.target.checked)}
                className="sr-only"
              />
              <div
                className="w-9 h-5 rounded-full transition-colors duration-200"
                style={{ background: allowReassign ? '#3DD57A' : '#e5e7eb' }}
              >
                <div
                  className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200"
                  style={{ transform: allowReassign ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800">Allow employee reassign</p>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">
                Re-distributes all jobs by location so each employee gets a tight area near their home — minimising driving across the whole team.
              </p>
            </div>
          </label>

          {/* Run button */}
          <div className="px-4 py-3">
            <button
              type="button"
              disabled={bulkRunning}
              onClick={handleBulkRun}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
              style={{
                background: allowReassign
                  ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                  : '#3DD57A',
                color: '#fff',
                boxShadow: allowReassign
                  ? '0 4px 20px rgba(99,102,241,0.3)'
                  : '0 4px 20px rgba(61,213,122,0.28)',
              }}
            >
              {allowReassign ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reassign &amp; optimise {selectedIds.length} routes
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Auto-plan {selectedIds.length} route{selectedIds.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Save / Cancel all unsaved routes */}
      {(unsavedUserIds.length > 0 || savingAll || savedAll) && onSaveAll && !bulkRunning && (
        <div className="mt-4 flex gap-2">
          {/* Cancel all */}
          {onDiscardAll && !savingAll && !savedAll && (
            <button
              type="button"
              onClick={onDiscardAll}
              className="flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-2xl text-sm font-semibold text-gray-500 bg-white border border-gray-200 hover:border-gray-300 hover:text-gray-700 transition-all flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel all
            </button>
          )}

          {/* Save all */}
          <button
            type="button"
            disabled={savingAll}
            onClick={async () => {
              setSavingAll(true); setSavedAll(false)
              await onSaveAll()
              setSavingAll(false); setSavedAll(true)
              setTimeout(() => setSavedAll(false), 1600)
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all disabled:opacity-60"
            style={{
              background: savedAll ? '#10b981' : '#3DD57A',
              color: '#fff',
              boxShadow: savedAll ? '0 0 20px rgba(16,185,129,0.3)' : '0 4px 20px rgba(61,213,122,0.28)',
            }}
          >
            {savingAll ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('app.routePlanner.saving', 'Saving...')}
              </>
            ) : savedAll ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {t('app.routePlanner.allRoutesSaved', 'All routes saved!')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {t('app.routePlanner.saveAllRoutes', 'Save all routes')} ({unsavedUserIds.length})
              </>
            )}
          </button>
        </div>
      )}
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
  geocodingCount?: number
  /** Save a specific user's route (or all unsaved routes when called without argument). */
  onSave: (userId?: number) => Promise<void>
  /** Save all users' unsaved routes at once. */
  onSaveAll?: () => Promise<void>
  /** Discard unsaved changes for a specific user. */
  onDiscardUser?: (userId: number) => void
  /** Discard unsaved changes for ALL users at once. */
  onDiscardAll?: () => void
  onBackToWeek?: () => void
  dateLabel?: string
  highlightedJobId?: number | string | null
  onJobCardHover?: (jobId: number | string | null) => void
  /** Isolate a single drive leg on the map while its drive-time badge is hovered. */
  onIsolateRoute?: (seg: IsolatedRouteSeg | null) => void
  baselineMinutesByUser?: Record<number, number>
  availableMinutesByUser?: Record<number, number>
  /** Manual route-drawing mode (one click per stop). */
  drawMode?: boolean
  drawOrder?: (number | string)[]
  /** Driving time delta after draw-route vs order before draw (+ = saved). */
  drawRouteComparison?: { diffMinutes: number } | null
  /** Short-lived notice after auto-optimize (success hint or error). */
  optimizeNotice?: string | null
  onDrawStart?: () => void
  onDrawAssign?: (jobId: number | string) => void
  onDrawReset?: () => void
  onDrawExit?: () => void
  onAddJob?: () => void
  /** Setup wizard mode — shows "Keep adding" + pulsing "Save and complete setup" CTAs */
  isWizardMode?: boolean
  /** Called when the user clicks "Save and complete setup" in wizard mode */
  onCompleteSetup?: () => void
  /** Compact layout for the mobile bottom sheet (datepicker lives in sheet header) */
  mobileSheet?: boolean
  /** Mobile: lift save bar into the sheet toolbar so it stays visible above the day picker */
  wrapMobileSheet?: (parts: { body: React.ReactNode; toolbar: React.ReactNode }) => React.ReactNode
  /** IDs of users whose current route order differs from the last saved state. */
  unsavedUserIds?: number[]
  /** Route order or assignees differ from last save — controls save bar visibility */
  hasUnsavedChanges?: boolean
  /** Bulk optimize / reassign multiple employees at once. */
  onBulkOptimize?: (
    userIds: number[],
    allowReassign: boolean,
    onProgress: (p: BulkOptimizeProgress) => void,
  ) => Promise<void>
  /** AllEmployees panel: called when the user hovers in/out of an employee row. */
  onHoverUser?: (userId: number | null) => void
  /** AllEmployees panel: called when the checkbox selection changes. */
  onAllPanelSelectionChange?: (ids: number[]) => void
  /** Day being planned (YYYY-MM-DD) — enables Save as Round. */
  date?: string
  /** Planned-package metadata per user (from daily_routes). */
  plannedMetaByUser?: Record<number, { status?: string | null; name?: string | null }>
  /** Called after a round / planned package was saved from this panel. */
  onRoundSaved?: () => void
  /**
   * Round playground: title + go-to-rounds above the shared planner chrome.
   * Employee switcher / job list / homes match the day route planner.
   */
  panelKind?: 'day' | 'round'
  placementUsers?: PlacementUser[]
  placementUserId?: number | null
  placementDates?: string[]
  placementScheduleMode?: RoundScheduleMode
  placementDayOfWeek?: number
  placementIntervalWeeks?: number
  placementRecurrenceType?: RoundRecurrenceType
  placementDayOfMonth?: number
  placementIntervalMonths?: number
  placementStartingDate?: string
  onPlacementUserChange?: (userId: number | null) => void
  onPlacementDatesChange?: (dates: string[]) => void
  onPlacementScheduleModeChange?: (mode: RoundScheduleMode) => void
  onPlacementDayOfWeekChange?: (day: number) => void
  onPlacementIntervalWeeksChange?: (n: number) => void
  onPlacementRecurrenceTypeChange?: (t: RoundRecurrenceType) => void
  onPlacementDayOfMonthChange?: (d: number) => void
  onPlacementIntervalMonthsChange?: (n: number) => void
  onPlacementStartingDateChange?: (d: string) => void
  onApplyManualSchedule?: (dates: string[]) => void
  onApplyRecurringSchedule?: (next: {
    recurrenceType: RoundRecurrenceType
    dayOfWeek: number
    intervalWeeks: number
    dayOfMonth: number
    intervalMonths: number
    startingDate: string
  }) => void
  onRoundNameChange?: (name: string | null) => void
  /** Rebuild homes / directions after start-end settings change. */
  onRouteLocationsChanged?: () => void
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
  geocodingCount = 0,
  onSave,
  onSaveAll,
  onDiscardUser,
  onDiscardAll,
  unsavedUserIds = [],
  onBackToWeek,
  dateLabel,
  highlightedJobId,
  onJobCardHover,
  onIsolateRoute,
  baselineMinutesByUser,
  availableMinutesByUser,
  drawMode,
  drawOrder,
  drawRouteComparison,
  optimizeNotice,
  onDrawStart,
  onDrawAssign,
  onDrawReset,
  onDrawExit,
  onAddJob,
  isWizardMode = false,
  onCompleteSetup,
  mobileSheet = false,
  wrapMobileSheet,
  hasUnsavedChanges = false,
  onBulkOptimize,
  onHoverUser,
  onAllPanelSelectionChange,
  date,
  plannedMetaByUser,
  onRoundSaved,
  panelKind = 'day',
  placementUsers = [],
  placementUserId = null,
  placementDates = [],
  placementScheduleMode = null,
  placementDayOfWeek = 1,
  placementIntervalWeeks = 1,
  placementRecurrenceType = 'weekly',
  placementDayOfMonth = 1,
  placementIntervalMonths = 1,
  placementStartingDate = '',
  onPlacementUserChange,
  onPlacementDatesChange,
  onPlacementScheduleModeChange,
  onPlacementDayOfWeekChange,
  onPlacementIntervalWeeksChange,
  onPlacementRecurrenceTypeChange,
  onPlacementDayOfMonthChange,
  onPlacementIntervalMonthsChange,
  onPlacementStartingDateChange,
  onApplyManualSchedule,
  onApplyRecurringSchedule,
  onRoundNameChange,
  onRouteLocationsChanged,
}: DayRoutePanelProps) {
  const { t, locale } = useAppI18n()
  // Prefer explicit focus (URL ?focus=route) over solo-company auto-pick.
  const isSoloCompany = routes.length === 1
  const focusedRoute = focusUserId != null
    ? routes.find(r => r.userId === focusUserId) ?? null
    : isSoloCompany
      ? routes[0]
      : null
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [headerSaveAsRoundOpen, setHeaderSaveAsRoundOpen] = useState(false)
  const focusedUserUnsaved = focusedRoute != null && unsavedUserIds.includes(focusedRoute.userId)
  const focusedAlreadyPlanned = focusedRoute != null
    && plannedMetaByUser?.[focusedRoute.userId]?.status === 'planned'
  const saveBarVisible = focusedRoute != null || saving || saved
  const focusedDraw = focusedRoute ? routeDrawMeta(focusedRoute) : null

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    await onSave(focusedRoute?.userId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const saveToolbarInner = (
    <div
      className={`flex-shrink-0 ${mobileSheet ? 'px-4 pt-2 pb-2' : 'px-4 pt-2.5 pb-3.5 border-t border-gray-200'}`}
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
      {panelKind === 'round' && onPlacementScheduleModeChange && onPlacementDatesChange && onPlacementUserChange && (
        <RoundPlaceControls
          mode={placementScheduleMode ?? null}
          dates={placementDates || []}
          dayOfWeek={placementDayOfWeek ?? 1}
          intervalWeeks={placementIntervalWeeks ?? 1}
          recurrenceType={placementRecurrenceType || 'weekly'}
          dayOfMonth={placementDayOfMonth ?? 1}
          intervalMonths={placementIntervalMonths ?? 1}
          startingDate={placementStartingDate || ''}
          onModeChange={onPlacementScheduleModeChange}
          onDatesChange={onPlacementDatesChange}
          onDayOfWeekChange={onPlacementDayOfWeekChange || (() => {})}
          onIntervalWeeksChange={onPlacementIntervalWeeksChange || (() => {})}
          onRecurrenceTypeChange={onPlacementRecurrenceTypeChange}
          onDayOfMonthChange={onPlacementDayOfMonthChange}
          onIntervalMonthsChange={onPlacementIntervalMonthsChange}
          onStartingDateChange={onPlacementStartingDateChange}
          onApplyManual={onApplyManualSchedule}
          onApplyRecurring={onApplyRecurringSchedule}
          busy={saving}
        />
      )}
      <div
        className="flex gap-2"
        style={{ opacity: !mobileSheet && drawMode ? 0.32 : 1 }}
      >
        {onDiscardUser && focusedRoute && focusedUserUnsaved && !saved && !saving && (
          <button
            type="button"
            onClick={() => onDiscardUser(focusedRoute.userId)}
            className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-2xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all active:scale-[0.98] flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {t('app.routePlanner.cancel', 'Cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || drawMode || !focusedRoute}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all disabled:opacity-60"
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
              {focusedAlreadyPlanned
                ? t('app.routePlanner.saveApply', 'Save & apply route')
                : t('app.routePlanner.saveAsPlannedRound', 'Save as round')}
            </>
          )}
        </button>
      </div>
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
          onIsolateRoute={onIsolateRoute}
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
          isWizardMode={isWizardMode}
          onCompleteSetup={onCompleteSetup}
          date={date}
          onEnsureSaved={() => onSave(focusedRoute.userId)}
          onRoundSaved={onRoundSaved}
          hideInlineChrome={!mobileSheet}
          routeStatsClean={!focusedUserUnsaved}
        />
      ) : (
        <AllUsersPanel
          routes={routes}
          onSelectUser={onSelectUser}
          baselineMinutesByUser={baselineMinutesByUser}
          unsavedUserIds={unsavedUserIds}
          onSaveAll={onSaveAll}
          onDiscardAll={onDiscardAll}
          onBulkOptimize={onBulkOptimize}
          onHoverUser={onHoverUser}
          onSelectionChange={onAllPanelSelectionChange}
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

      {/* Compact control strip (desktop sidebar) */}
      {!mobileSheet && (
      <>
      {panelKind === 'round' && (
        <div className="flex-shrink-0 px-3 pt-2.5 pb-1.5 flex items-center gap-2">
          <RoundNameField
            name={dateLabel}
            placeholder={t('app.rounds.newRound', 'New round')}
            onChange={onRoundNameChange || (() => {})}
          />
          {companySlug && (
            <Link
              href={`/${companySlug}/recurring/rounds`}
              className="h-8 flex-shrink-0 inline-flex items-center px-2.5 rounded-xl text-[11px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 hover:text-gray-800 transition-colors"
              title={t('app.rounds.goToRounds', 'Go to rounds')}
            >
              {t('app.rounds.rounds', 'Rounds')}
            </Link>
          )}
        </div>
      )}
      <div className="flex-shrink-0 px-3 pt-2 pb-2">
        <div className="flex items-center gap-1.5">
          {onBackToWeek && (
            <button
              type="button"
              onClick={onBackToWeek}
              className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-all active:scale-95"
              title={t('app.routePlanner.back', 'Back')}
              aria-label={t('app.routePlanner.back', 'Back')}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {panelKind === 'round' && onPlacementUserChange && (placementUserId == null || placementUserId <= 0) ? (
            <RoundEmployeePicker
              users={placementUsers}
              userId={placementUserId}
              onUserChange={onPlacementUserChange}
              className="!flex-none flex-1 !h-9 !rounded-xl"
            />
          ) : (
            <EmployeeSwitcher
              routes={routes}
              focused={focusedRoute ?? null}
              onSelectUser={onSelectUser}
              onShowAll={panelKind === 'round' ? undefined : (!isSoloCompany ? onClearUser : undefined)}
            />
          )}

          {focusedRoute && !drawMode && focusedDraw && (
            <RouteActionIcons
              canDraw={focusedDraw.canDraw}
              optimizing={optimizing}
              hasCoords={focusedDraw.hasCoords}
              onDrawStart={onDrawStart}
              onOptimize={onOptimize}
              onSaveAsRound={date ? () => setHeaderSaveAsRoundOpen(true) : undefined}
              userId={focusedRoute.userId}
            />
          )}
        </div>
        {panelKind !== 'round' && !focusedRoute && dateLabel && (
          <p className="text-[10px] text-gray-400 mt-1 truncate px-0.5">{dateLabel}</p>
        )}
      </div>
      <div className="mx-3 mb-1.5 h-px bg-gray-200/80" />
      </>
      )}

      {/* Scrollable body */}
      <div
        className={`flex-1 overflow-y-auto min-h-0 ${mobileSheet ? 'px-4 pt-1 pb-3' : 'px-3 pb-3'}`}
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {panelBody}
      </div>

      {saveToolbar}

      {focusedRoute && date && (
        <SaveAsRoundModal
          isOpen={headerSaveAsRoundOpen}
          onClose={() => setHeaderSaveAsRoundOpen(false)}
          route={focusedRoute}
          date={date}
          onEnsureSaved={() => onSave(focusedRoute.userId)}
          onSaved={onRoundSaved}
        />
      )}
    </div>
  )
}
