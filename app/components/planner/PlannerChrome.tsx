'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowPathIcon,
  BoltIcon,
  ChevronDownIcon,
  ClockIcon,
  PencilSquareIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import type { UserRoute, RouteJob } from '@/app/components/RouteMap'
import { useAppI18n } from '@/app/components/I18nProvider'
import { fmtMoney } from '@/app/utils/subscriptionHelpers'

function sumWorkMinutes(jobs: RouteJob[]) {
  return jobs.reduce((sum, j) => {
    if (j.is_cancelled || j.is_home) return sum
    return sum + (j.estimated_duration_minutes ?? 0)
  }, 0)
}

function sumJobValue(jobs: RouteJob[]) {
  return jobs.reduce((sum, j) => {
    if (j.is_cancelled || j.is_home) return sum
    const v = Number(j.estimated_price)
    return sum + (Number.isFinite(v) && v > 0 ? v : 0)
  }, 0)
}

function readCompanyCountryCode(): string {
  if (typeof window === 'undefined') return 'DK'
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return 'DK'
    const u = JSON.parse(raw) as Record<string, any>
    return (
      u?.activeCompany?.countryCode
      || u?.companies?.find((c: any) => c?.id === u?.companyId)?.countryCode
      || u?.companies?.[0]?.countryCode
      || 'DK'
    )
  } catch {
    return 'DK'
  }
}

function initialsFromName(name: string) {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function RouteEmployeeAvatar({
  name,
  color,
  size = 28,
}: {
  name: string
  color: string
  size?: number
}) {
  return (
    <div
      className="rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: color,
        boxShadow: `0 2px 8px ${color}40`,
      }}
    >
      {initialsFromName(name)}
    </div>
  )
}

function fmtShort(m: number) {
  if (!Number.isFinite(m) || m < 0.5) return '0m'
  if (m < 60) return `${Math.round(m)}m`
  const h = Math.floor(m / 60)
  const rem = Math.round(m % 60)
  return rem > 0 ? `${h}h${rem}m` : `${h}h`
}

function fmtDelta(d: number) {
  const abs = Math.abs(d)
  if (abs < 0.5) return null
  const sign = d > 0 ? '+' : '−'
  return `${sign}${fmtShort(abs)}`
}

/** Draw eligibility helpers for a focused route. */
export function routeDrawMeta(route: UserRoute) {
  const activeJobs = route.jobs.filter(j => !j.is_cancelled)
  const startJob = activeJobs.length > 0 && activeJobs[0].is_home ? activeJobs[0] : null
  const endJob = activeJobs.length > 1 && activeJobs[activeJobs.length - 1].is_home ? activeJobs[activeJobs.length - 1] : null
  const middleJobs = startJob && endJob
    ? activeJobs.slice(1, -1)
    : startJob
      ? activeJobs.slice(1)
      : endJob
        ? activeJobs.slice(0, -1)
        : activeJobs
  return {
    canDraw: middleJobs.length >= 2,
    hasCoords: middleJobs.filter(j => j.lat != null && j.lng != null).length >= 2,
  }
}

function PlannerIconButton({
  label,
  hint,
  onClick,
  disabled,
  children,
}: {
  label: string
  hint?: string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [tip, setTip] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!tip || !btnRef.current) {
      setPos(null)
      return
    }
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect()
      setPos({
        top: r.bottom + 6,
        left: r.left + r.width / 2,
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [tip])

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => !disabled && setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-black/[0.05] transition-colors duration-150 active:scale-95 disabled:opacity-30 disabled:pointer-events-none disabled:active:scale-100"
      >
        {children}
      </button>
      {tip && !disabled && pos && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          className="pointer-events-none fixed z-[9999] w-max max-w-[180px] -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-left shadow-lg animate-in fade-in zoom-in-95 duration-100"
          style={{ top: pos.top, left: pos.left }}
        >
          <span className="block text-[10px] font-semibold text-white leading-tight">{label}</span>
          {hint && (
            <span className="block text-[9px] text-gray-300 leading-snug mt-0.5">{hint}</span>
          )}
        </span>,
        document.body,
      )}
    </span>
  )
}

export function RouteActionIcons({
  canDraw,
  optimizing,
  hasCoords,
  onDrawStart,
  onOptimize,
  onSaveAsRound,
  userId,
}: {
  canDraw: boolean
  optimizing: boolean
  hasCoords: boolean
  onDrawStart?: () => void
  onOptimize: (userId: number) => void
  onSaveAsRound?: () => void
  userId: number
}) {
  const { t } = useAppI18n()
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <PlannerIconButton
        label={t('app.routePlanner.drawRoute', 'Draw route')}
        hint={t('app.routePlanner.drawRouteSub', 'Tap stops in your own order')}
        onClick={onDrawStart}
        disabled={!canDraw || optimizing || !onDrawStart}
      >
        <PencilSquareIcon className="w-4 h-4" strokeWidth={1.75} />
      </PlannerIconButton>
      <PlannerIconButton
        label={t('app.routePlanner.autoDrawFull', 'Auto-draw route')}
        hint={t('app.routePlanner.autoDrawSub', 'Let us find the fastest order')}
        onClick={() => onOptimize(userId)}
        disabled={optimizing || !hasCoords}
      >
        {optimizing ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <BoltIcon className="w-4 h-4" strokeWidth={1.75} />
        )}
      </PlannerIconButton>
      {onSaveAsRound && (
        <PlannerIconButton
          label={t('app.rounds.saveAsRound', 'Save as round')}
          hint={t('app.rounds.saveAsRoundMenuSub', 'Repeat this route or keep it for the day')}
          onClick={onSaveAsRound}
          disabled={optimizing}
        >
          <ArrowPathIcon className="w-4 h-4" strokeWidth={1.75} />
        </PlannerIconButton>
      )}
    </div>
  )
}

/**
 * Drive / work / total row above the route start stop.
 * Click to expand — leads with route value and effective hourly (incl. drive).
 */
export function RouteSaveStats({
  route,
  baselineDriveMinutes,
  isClean = false,
}: {
  route: UserRoute
  /** Drive minutes at last save / first load (from planner). */
  baselineDriveMinutes?: number
  /** When true, current values become the new baseline (after save / discard). */
  isClean?: boolean
}) {
  const { t } = useAppI18n()
  const [expanded, setExpanded] = useState(false)
  const countryCode = readCompanyCountryCode()

  const activeJobs = route.jobs.filter(j => !j.is_cancelled)
  const workMin = sumWorkMinutes(activeJobs)
  const driveMin = route.totalMinutes ?? 0
  const totalMin = driveMin + workMin
  const totalValue = sumJobValue(activeJobs)
  const locatedStops = activeJobs.filter(j => j.lat != null && j.lng != null && !j.is_home).length
  const driveLoading = route.totalMinutes == null && locatedStops >= 2

  const baselineRef = useRef<{ drive: number; work: number; total: number } | null>(null)

  useEffect(() => {
    baselineRef.current = null
    setExpanded(false)
  }, [route.userId])

  useEffect(() => {
    if (driveLoading) return
    // Never lock in a zero baseline before directions/work minutes exist.
    const meaningful = driveMin >= 0.5 || workMin >= 0.5
    if (!meaningful) return

    const seeded = baselineRef.current
    const seededEmpty = seeded == null || (seeded.drive < 0.5 && seeded.work < 0.5)
    // Work can arrive before Mapbox drive time — refresh when drive fills in.
    const driveFilledIn = seeded != null && seeded.drive < 0.5 && driveMin >= 0.5
    if (isClean || seededEmpty || driveFilledIn) {
      baselineRef.current = {
        drive: driveMin,
        work: workMin,
        total: totalMin,
      }
    }
  }, [isClean, driveLoading, driveMin, workMin, totalMin, route.userId])

  // Planner drive baseline wins once directions have a real value.
  const baseDrive = (
    baselineDriveMinutes != null && baselineDriveMinutes >= 0.5
      ? baselineDriveMinutes
      : (baselineRef.current?.drive ?? driveMin)
  )
  const baseWork = baselineRef.current?.work ?? workMin
  const baseTotal = (
    baselineDriveMinutes != null && baselineDriveMinutes >= 0.5
      ? baselineDriveMinutes + baseWork
      : (baselineRef.current?.total ?? totalMin)
  )

  const driveDelta = !driveLoading && Math.abs(driveMin - baseDrive) >= 0.5
    ? driveMin - baseDrive
    : null
  const workDelta = Math.abs(workMin - baseWork) >= 0.5 ? workMin - baseWork : null
  const totalDelta = !driveLoading && Math.abs(totalMin - baseTotal) >= 0.5
    ? totalMin - baseTotal
    : null

  if (!driveLoading && driveMin === 0 && workMin === 0) return null

  const workHours = workMin / 60
  const dayHours = totalMin / 60
  const valuePerWorkHour = workHours > 0 && totalValue > 0 ? totalValue / workHours : null
  const valuePerDayHour = dayHours > 0 && totalValue > 0 ? totalValue / dayHours : null
  const driveShare = totalMin > 0.5 ? driveMin / totalMin : 0
  const workShare = totalMin > 0.5 ? workMin / totalMin : 0

  const efficiency = (() => {
    if (driveLoading || totalMin < 0.5) {
      return {
        tone: 'text-gray-500',
        barDrive: 'bg-gray-300',
        label: t('app.routePlanner.efficiencyPending', 'Calculating drive time…'),
      }
    }
    if (driveShare >= 0.55) {
      return {
        tone: 'text-orange-700',
        barDrive: 'bg-orange-400',
        label: t(
          'app.routePlanner.efficiencyHeavyDrive',
          'Heavy travel — over half the day is driving. Clustering stops could free capacity.',
        ),
      }
    }
    if (driveShare >= 0.4) {
      return {
        tone: 'text-amber-700',
        barDrive: 'bg-amber-400',
        label: t(
          'app.routePlanner.efficiencyElevatedDrive',
          'Elevated drive share — worth checking if nearby jobs can be grouped.',
        ),
      }
    }
    if (driveShare <= 0.25 && workMin > 0) {
      return {
        tone: 'text-emerald-700',
        barDrive: 'bg-emerald-400',
        label: t(
          'app.routePlanner.efficiencyGood',
          'Efficient mix — most of the day is on-site work.',
        ),
      }
    }
    return {
      tone: 'text-gray-600',
      barDrive: 'bg-sky-400',
      label: t(
        'app.routePlanner.efficiencyBalanced',
        'Balanced drive vs work for this route.',
      ),
    }
  })()

  const Stat = ({
    icon,
    value,
    delta,
    loading,
    title,
  }: {
    icon: React.ReactNode
    value: string
    delta: number | null
    loading?: boolean
    title: string
  }) => {
    const deltaLabel = delta != null ? fmtDelta(delta) : null
    return (
      <span className="inline-flex items-center gap-1 tabular-nums" title={title}>
        <span className="text-gray-400">{icon}</span>
        {loading ? (
          <svg className="w-3 h-3 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <span className="text-[12.5px] font-semibold text-gray-700 leading-none">{value}</span>
        )}
        {deltaLabel && (
          <span
            className={`text-[11px] font-bold leading-none ${
              delta! < 0 ? 'text-emerald-600' : 'text-orange-500'
            }`}
          >
            {deltaLabel}
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="mb-2.5">
      <div className="h-px bg-gray-200/90" />
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full py-2 text-center hover:bg-black/[0.02] transition-colors"
      >
        <div className="flex items-center justify-center gap-3.5">
          <Stat
            title={t('app.routePlanner.drive', 'Drive')}
            icon={<TruckIcon className="w-3.5 h-3.5" strokeWidth={2} />}
            value={fmtShort(driveMin)}
            delta={driveDelta}
            loading={driveLoading}
          />
          <Stat
            title={t('app.routePlanner.work', 'Work')}
            icon={<WrenchScrewdriverIcon className="w-3.5 h-3.5" strokeWidth={2} />}
            value={fmtShort(workMin)}
            delta={workDelta}
          />
          <Stat
            title={t('app.routePlanner.total', 'Total')}
            icon={<ClockIcon className="w-3.5 h-3.5" strokeWidth={2} />}
            value={fmtShort(totalMin)}
            delta={totalDelta}
            loading={driveLoading}
          />
          <ChevronDownIcon
            className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
            expanded ? 'grid-rows-[1fr] opacity-100 mt-2.5' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden min-h-0">
            <div className="space-y-2.5 text-center">
              <div className="grid grid-cols-2 gap-4 max-w-[280px] mx-auto">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {t('app.routePlanner.routeValue', 'Route value')}
                  </p>
                  <p className="mt-1 text-[17px] font-bold tracking-tight text-gray-900 tabular-nums leading-none">
                    {totalValue > 0 ? fmtMoney(totalValue, countryCode) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {t('app.routePlanner.valuePerHourInclDrive', 'Value / hour')}
                  </p>
                  <p className="mt-1 text-[17px] font-bold tracking-tight text-gray-900 tabular-nums leading-none">
                    {valuePerDayHour != null ? fmtMoney(valuePerDayHour, countryCode) : '—'}
                    {valuePerDayHour != null && (
                      <span className="text-[11px] font-semibold text-gray-400">/h</span>
                    )}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-400 leading-tight">
                    {t('app.routePlanner.inclDriveHint', 'incl. drive time')}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center text-[11px] text-gray-500">
                <span>
                  {t('app.routePlanner.valuePerWorkHourShort', 'On-site')}
                  {': '}
                  <span className="font-semibold text-gray-700 tabular-nums">
                    {valuePerWorkHour != null ? `${fmtMoney(valuePerWorkHour, countryCode)}/h` : '—'}
                  </span>
                </span>
              </div>

              <div className="max-w-[220px] mx-auto w-full">
                <div className="flex items-center justify-center gap-2 mb-1.5 text-[10px] font-semibold text-gray-500 tabular-nums">
                  <span>{Math.round(workShare * 100)}% {t('app.routePlanner.workLower', 'work')}</span>
                  <span className="text-gray-300">·</span>
                  <span>{Math.round(driveShare * 100)}% {t('app.routePlanner.driveLower', 'drive')}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden flex">
                  {workShare > 0 && (
                    <div
                      className="h-full bg-accent-500"
                      style={{ width: `${Math.max(2, workShare * 100)}%` }}
                    />
                  )}
                  {driveShare > 0 && (
                    <div
                      className={`h-full ${efficiency.barDrive}`}
                      style={{ width: `${Math.max(2, driveShare * 100)}%` }}
                    />
                  )}
                </div>
                <p className={`mt-1.5 text-[11px] leading-snug text-center ${efficiency.tone}`}>
                  {efficiency.label}
                </p>
              </div>
            </div>
          </div>
        </div>
      </button>
      <div className="h-px bg-gray-200/90" />
    </div>
  )
}

export function EmployeeSwitcher({
  routes,
  focused,
  onSelectUser,
  onShowAll,
}: {
  routes: UserRoute[]
  focused: UserRoute | null
  onSelectUser: (userId: number) => void
  onShowAll?: () => void
}) {
  const { t } = useAppI18n()
  const [open, setOpen] = useState(false)
  const canSwitch = routes.length > 1 || !!onShowAll

  if (!focused) {
    return (
      <p className="flex-1 min-w-0 text-[13px] font-bold text-gray-800 truncate">
        {t('app.routePlanner.allEmployees', 'All employees')}
      </p>
    )
  }

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => canSwitch && setOpen(v => !v)}
        disabled={!canSwitch}
        className={`w-full flex items-center gap-2 min-w-0 rounded-xl py-1 pr-1.5 pl-1 transition-colors ${
          canSwitch ? 'hover:bg-black/[0.04] cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <RouteEmployeeAvatar name={focused.userName} color={focused.color} size={28} />
        <span className="flex-1 min-w-0 text-left">
          <span className="block text-[13px] font-bold text-gray-900 truncate leading-tight">
            {focused.userName}
          </span>
          {canSwitch && (
            <span className="block text-[9px] font-medium text-gray-400 leading-tight mt-px">
              {t('app.routePlanner.switchEmployee', 'Switch')}
            </span>
          )}
        </span>
        {canSwitch && (
          <svg
            className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg shadow-black/10 animate-in fade-in slide-in-from-top-1 duration-150"
          >
            {routes.map(r => {
              const active = r.userId === focused.userId
              return (
                <button
                  key={r.userId}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false)
                    if (!active) onSelectUser(r.userId)
                  }}
                  className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    active ? 'bg-accent-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <RouteEmployeeAvatar name={r.userName} color={r.color} size={24} />
                  <span className={`flex-1 min-w-0 text-[12px] font-semibold truncate ${active ? 'text-accent-800' : 'text-gray-800'}`}>
                    {r.userName}
                  </span>
                  <span className="text-[10px] tabular-nums text-gray-400 flex-shrink-0">
                    {r.jobs.filter(j => !j.is_cancelled && !j.is_home).length}
                  </span>
                </button>
              )
            })}
            {onShowAll && (
              <>
                <div className="my-1 mx-1 h-px bg-gray-100" />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onShowAll()
                  }}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </span>
                  <span className="text-[12px] font-semibold text-gray-700">
                    {t('app.routePlanner.allEmployees', 'All employees')}
                  </span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
