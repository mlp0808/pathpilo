'use client'

/**
 * JobsTimelineChart — jobs or revenue over a year with a minimap brush.
 * Buckets: **weeks** (default) or **calendar days**. Two series: completed (green)
 * vs scheduled + subscription-projected (blue). For the current calendar year,
 * values are prognosis-style relative to today. Past years show both series across
 * the year. One fetch per year; brush drag is client-side.
 *
 * Avoid SSR for this module (e.g. `next/dynamic({ ssr: false })`): it uses the
 * viewer's local calendar midnight for "today", which can mismatch the server.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiUrl } from '@/app/utils/api'
import { formatMoney } from '@/app/config/countryRules'

// ─── helpers ────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000

function startOfYear(y: number) { return new Date(y, 0, 1) }
function endOfYear(y: number) { return new Date(y, 11, 31) }
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}
function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}
function isoDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function getMonday(input: Date) {
  const d = new Date(input.getFullYear(), input.getMonth(), input.getDate())
  const dow = d.getDay() // 0 = Sun … 6 = Sat
  const offset = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + offset)
  return d
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
function fmtShort(d: Date, locale = 'en-US') {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

function stripTime(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Parse yyyy-mm-dd to local Date at midnight. */
function parseISODateLocal(s: string): Date | null {
  const part = s.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return null
  return new Date(y, mo, day)
}

function isScheduledOrProjected(job: {
  status: string
  is_projected?: boolean | null
}) {
  if (job.status === 'cancelled' || job.status === 'completed') return false
  return job.status === 'scheduled' || job.status === 'in-progress' || job.is_projected === true
}

function num(v: unknown) {
  return (v != null && v !== '' ? parseFloat(String(v)) : 0) || 0
}

// ─── types ──────────────────────────────────────────────────────────────────

type PresetId = '30d' | '90d' | '180d' | 'ytd' | '1y'

interface PresetDef {
  id: PresetId
  label: string
  /** Length in days, or 'ytd' meaning "Jan 1 → today". */
  days: number | 'ytd'
}

const PRESETS: PresetDef[] = [
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: '180d', label: '180D', days: 180 },
  { id: 'ytd', label: 'YTD', days: 'ytd' },
  { id: '1y', label: '1Y', days: 365 },
]

type BucketGranularity = 'week' | 'day'

type ValueMetric = 'revenue' | 'jobs'

/** One chart bucket: either a calendar day or a Monday–Sunday week. */
interface TimelineBucket {
  periodStart: Date
  periodEnd: Date
  /** ISO yyyy-mm-dd of periodStart — stable id / map key. */
  key: string
  /** Days from Jan 1 of chart year to periodStart — numeric X for ReferenceLine alignment. */
  dayIndex: number
  label: string
  completedPast: number
  scheduledFuture: number
  completedRevenuePast: number
  scheduledRevenueFuture: number
  bucketIndex: number
}

type ChartRow = TimelineBucket & {
  completedDisplay: number | null
  scheduledDisplay: number | null
}

/** Row passed to Recharts (may use `plotDayIndex` for X when a week is split around today). */
type PlotRow = ChartRow & { plotDayIndex: number }

/** Visible brush window — drives dashboard-wide date range (employee stats, etc.). */
export interface DashboardTimelineRange {
  startDate: string
  endDate: string
}

export interface JobsTimelineChartProps {
  onRangeChange?: (range: DashboardTimelineRange) => void
}

// ─── component ──────────────────────────────────────────────────────────────

/** Vertical gradient connector (green = completed end, blue = scheduled end) drawn in pixel space. */
function StraddleBridgeLine(props: {
  x1: number
  y1: number
  x2: number
  y2: number
  gradientId: string
}) {
  const { x1, y1, x2, y2, gradientId } = props
  return (
    <g className="pointer-events-none">
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
        >
          <stop offset="0%" stopColor="#3DD57A" stopOpacity={0.95} />
          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.95} />
        </linearGradient>
      </defs>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={`url(#${gradientId})`}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </g>
  )
}

export default function JobsTimelineChart({ onRangeChange }: JobsTimelineChartProps) {
  const chartUid = useId().replace(/:/g, '')
  const gradCompleted = `dashGradCompleted-${chartUid}`
  const gradScheduled = `dashGradScheduled-${chartUid}`
  const gradStraddleBridge = `dashStraddleBridge-${chartUid}`

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [year, setYear] = useState(today.getFullYear())
  const yearStart = useMemo(() => startOfYear(year), [year])
  const yearEnd = useMemo(() => endOfYear(year), [year])
  /** 365 or 366 depending on leap year. */
  const yearLen = useMemo(() => daysBetween(yearStart, yearEnd) + 1, [yearStart, yearEnd])

  /** Days from Jan 1 of this year up to and including "today" (or the whole year for past years). */
  const ytdLen = useMemo(() => (
    year === today.getFullYear() ? clamp(daysBetween(yearStart, today) + 1, 1, yearLen) : yearLen
  ), [year, today, yearStart, yearLen])

  // View window (driven by preset + brush position).
  const [preset, setPreset] = useState<PresetId>('ytd')
  const [windowStartOffset, setWindowStartOffset] = useState<number>(0)
  const [windowLen, setWindowLen] = useState<number>(ytdLen)

  /** Chart resolution: aggregate by week (default) or by calendar day. */
  const [bucketGranularity, setBucketGranularity] = useState<BucketGranularity>('week')

  /** Chart Y values: revenue (default) or job counts. */
  const [valueMetric, setValueMetric] = useState<ValueMetric>('revenue')

  const [companyCountryCode, setCompanyCountryCode] = useState('DK')

  useLayoutEffect(() => {
    try {
      const rawCompany = localStorage.getItem('company')
      if (rawCompany) {
        const c = JSON.parse(rawCompany)
        if (c?.countryCode) {
          setCompanyCountryCode(String(c.countryCode))
          return
        }
      }
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      const code =
        u.activeCompany?.countryCode ||
        (Array.isArray(u.companies)
          ? u.companies.find((co: { id?: number }) => co?.id === u.companyId)?.countryCode
          : undefined)
      if (code) setCompanyCountryCode(String(code))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(apiUrl('/companies/profile'), {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const code = data.company?.countryCode || 'DK'
        setCompanyCountryCode(String(code))
      } catch {
        /* keep cached */
      }
    }
    void load()
  }, [])

  // When preset or year changes, snap brush window to the new size.
  useEffect(() => {
    const p = PRESETS.find((p) => p.id === preset)
    if (!p) return
    if (p.days === 'ytd') {
      setWindowStartOffset(0)
      setWindowLen(ytdLen)
      return
    }
    const len = Math.min(p.days, yearLen)
    // Anchor window so it ends "now" on current year, or at year end on past years.
    const anchorEnd = year === today.getFullYear() ? daysBetween(yearStart, today) + 1 : yearLen
    const startOffset = clamp(anchorEnd - len, 0, yearLen - len)
    setWindowStartOffset(startOffset)
    setWindowLen(len)
  }, [preset, year, ytdLen, yearLen, yearStart, today])

  // ── data fetch ─────────────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<
    Array<{
      status: string
      scheduled_date: string | null
      is_projected?: boolean | null
      total_price?: number | string | null
    }>
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    const run = async () => {
      try {
        setLoading(true)
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await fetch(
          apiUrl(`/jobs?start_date=${isoDate(yearStart)}&end_date=${isoDate(yearEnd)}`),
          { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal },
        )
        if (!res.ok) return
        const data = await res.json()
        setJobs(Array.isArray(data.jobs) ? data.jobs : [])
      } catch (e) {
        if ((e as { name?: string }).name !== 'AbortError') {
          console.error('JobsTimelineChart fetch failed', e)
        }
      } finally {
        setLoading(false)
      }
    }
    void run()
    return () => ctrl.abort()
  }, [yearStart, yearEnd])

  const isCurrentChartYear = year === today.getFullYear()
  const todayDayIndex = useMemo(
    () => daysBetween(yearStart, today),
    [yearStart, today],
  )

  // ── buckets for the full year (by week or by day) ─────────────────────────
  const allBuckets = useMemo<TimelineBucket[]>(() => {
    const t0 = stripTime(today)
    const fillBucket = (b: TimelineBucket, job: (typeof jobs)[0], jd0: Date) => {
      const afterToday = jd0.getTime() > t0.getTime()
      const price = num(job.total_price)
      if (job.status === 'completed') {
        b.completedPast++
        b.completedRevenuePast += price
      }
      if (isScheduledOrProjected(job)) {
        if (!isCurrentChartYear) {
          b.scheduledFuture++
          b.scheduledRevenueFuture += price
        } else if (afterToday) {
          b.scheduledFuture++
          b.scheduledRevenueFuture += price
        }
      }
    }

    if (bucketGranularity === 'day') {
      const out: TimelineBucket[] = []
      let d = stripTime(yearStart)
      const yEnd = stripTime(yearEnd)
      let n = 1
      while (d <= yEnd) {
        const di = daysBetween(yearStart, d)
        out.push({
          periodStart: new Date(d),
          periodEnd: new Date(d),
          key: isoDate(d),
          dayIndex: di,
          label: fmtShort(d),
          completedPast: 0,
          scheduledFuture: 0,
          completedRevenuePast: 0,
          scheduledRevenueFuture: 0,
          bucketIndex: n++,
        })
        d = addDays(d, 1)
      }
      const map = new Map(out.map((b) => [b.key, b]))
      for (const job of jobs) {
        if (!job.scheduled_date) continue
        const jd = parseISODateLocal(job.scheduled_date)
        if (!jd) continue
        const jd0 = stripTime(jd)
        const b = map.get(isoDate(jd0))
        if (!b) continue
        fillBucket(b, job, jd0)
      }
      return out
    }

    const out: TimelineBucket[] = []
    let cur = getMonday(yearStart)
    let n = 1
    while (cur <= yearEnd) {
      const ws = new Date(cur)
      const we = addDays(cur, 6)
      out.push({
        periodStart: ws,
        periodEnd: we,
        key: isoDate(ws),
        dayIndex: daysBetween(yearStart, ws),
        label: fmtShort(ws),
        completedPast: 0,
        scheduledFuture: 0,
        completedRevenuePast: 0,
        scheduledRevenueFuture: 0,
        bucketIndex: n++,
      })
      cur = addDays(cur, 7)
    }
    const map = new Map(out.map((b) => [b.key, b]))
    for (const job of jobs) {
      if (!job.scheduled_date) continue
      const jd = parseISODateLocal(job.scheduled_date)
      if (!jd) continue
      const jd0 = stripTime(jd)
      const mon = getMonday(jd)
      const b = map.get(isoDate(mon))
      if (!b) continue
      fillBucket(b, job, jd0)
    }
    return out
  }, [jobs, yearStart, yearEnd, today, isCurrentChartYear, bucketGranularity])

  // Visible window slice for the line chart
  const visibleBuckets = useMemo<TimelineBucket[]>(() => {
    const winStart = addDays(yearStart, windowStartOffset)
    const winEnd = addDays(yearStart, windowStartOffset + windowLen - 1)
    return allBuckets.filter((b) => b.periodEnd >= winStart && b.periodStart <= winEnd)
  }, [allBuckets, yearStart, windowStartOffset, windowLen])

  /** Split visuals at "today" for current year: no green in future-only buckets, no blue in past-only buckets. */
  const chartRows = useMemo((): ChartRow[] => {
    const pickCompleted = (w: TimelineBucket) =>
      valueMetric === 'revenue' ? w.completedRevenuePast : w.completedPast
    const pickScheduled = (w: TimelineBucket) =>
      valueMetric === 'revenue' ? w.scheduledRevenueFuture : w.scheduledFuture

    if (!isCurrentChartYear) {
      return visibleBuckets.map((w) => ({
        ...w,
        completedDisplay: pickCompleted(w),
        scheduledDisplay: pickScheduled(w),
      }))
    }
    const t0 = stripTime(today)
    return visibleBuckets.map((w) => {
      const ws = stripTime(w.periodStart)
      const we = stripTime(w.periodEnd)
      let completedDisplay: number | null = pickCompleted(w)
      let scheduledDisplay: number | null = pickScheduled(w)
      if (we < t0) {
        scheduledDisplay = null
      } else if (ws > t0) {
        completedDisplay = null
      }
      return { ...w, completedDisplay, scheduledDisplay }
    })
  }, [visibleBuckets, isCurrentChartYear, today, valueMetric])

  const pickBucketCompleted = (w: TimelineBucket) =>
    valueMetric === 'revenue' ? w.completedRevenuePast : w.completedPast
  const pickBucketScheduled = (w: TimelineBucket) =>
    valueMetric === 'revenue' ? w.scheduledRevenueFuture : w.scheduledFuture

  const plotRows = useMemo((): PlotRow[] => {
    const t0 = stripTime(today)
    const tIdx = todayDayIndex
    const out: PlotRow[] = []

    for (const row of chartRows) {
      const expand =
        bucketGranularity === 'week' &&
        isCurrentChartYear &&
        stripTime(row.periodStart) <= t0 &&
        stripTime(row.periodEnd) >= t0

      if (!expand) {
        out.push({ ...row, plotDayIndex: row.dayIndex })
        continue
      }

      const mIdx = row.dayIndex
      const sunIdx = daysBetween(yearStart, stripTime(row.periodEnd))
      const C = row.completedDisplay
      const S = row.scheduledDisplay

      if (mIdx < tIdx) {
        out.push({ ...row, plotDayIndex: mIdx, completedDisplay: C, scheduledDisplay: null })
      }

      out.push({
        ...row,
        plotDayIndex: tIdx,
        completedDisplay: C,
        scheduledDisplay: S,
      })

      if (sunIdx > tIdx) {
        out.push({ ...row, plotDayIndex: sunIdx, completedDisplay: null, scheduledDisplay: S })
      }
    }
    return out
  }, [chartRows, bucketGranularity, isCurrentChartYear, today, todayDayIndex, yearStart])

  const straddleBridge = useMemo(() => {
    if (!isCurrentChartYear || bucketGranularity !== 'week') return null
    const t0 = stripTime(today)
    for (const row of chartRows) {
      if (stripTime(row.periodStart) > t0 || stripTime(row.periodEnd) < t0) continue
      const C = row.completedDisplay
      const S = row.scheduledDisplay
      if (C != null && S != null && C > 0 && S > 0) return { yCompleted: C, yScheduled: S }
    }
    return null
  }, [isCurrentChartYear, bucketGranularity, chartRows, today])

  const totalCompletedInWindow = useMemo(
    () => visibleBuckets.reduce((s, w) => s + pickBucketCompleted(w), 0),
    [visibleBuckets, valueMetric],
  )

  const totalScheduledInWindow = useMemo(
    () => visibleBuckets.reduce((s, w) => s + pickBucketScheduled(w), 0),
    [visibleBuckets, valueMetric],
  )

  const peakInWindow = useMemo(
    () => visibleBuckets.reduce(
      (m, w) => Math.max(m, pickBucketCompleted(w), pickBucketScheduled(w)),
      0,
    ),
    [visibleBuckets, valueMetric],
  )

  // ── brush drag ─────────────────────────────────────────────────────────────
  const draggable = preset !== 'ytd' && preset !== '1y'
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; origOffset: number } | null>(null)

  const onBrushPointerDown = (e: React.PointerEvent) => {
    if (!draggable || !trackRef.current) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, origOffset: windowStartOffset }
  }
  const onBrushPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !trackRef.current) return
    const fullWidth = trackRef.current.offsetWidth
    if (fullWidth <= 0) return
    const dxDays = Math.round(((e.clientX - dragRef.current.startX) / fullWidth) * yearLen)
    const next = clamp(dragRef.current.origOffset + dxDays, 0, yearLen - windowLen)
    setWindowStartOffset(next)
  }
  const onBrushPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    }
  }
  // Click on empty part of the track to recenter the brush.
  const onTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || !trackRef.current) return
    if ((e.target as HTMLElement).closest('[data-brush-handle]')) return
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    const center = Math.round(ratio * yearLen)
    const next = clamp(center - Math.floor(windowLen / 2), 0, yearLen - windowLen)
    setWindowStartOffset(next)
  }

  // ── derived values for rendering ───────────────────────────────────────────
  const brushLeftPct = (windowStartOffset / yearLen) * 100
  const brushWidthPct = (windowLen / yearLen) * 100

  const monthTicks = useMemo(() => {
    const out: { offsetPct: number; label: string }[] = []
    for (let m = 0; m < 12; m++) {
      const d = new Date(year, m, 1)
      const offset = daysBetween(yearStart, d)
      out.push({
        offsetPct: (offset / yearLen) * 100,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
      })
    }
    return out
  }, [year, yearStart, yearLen])

  const minimapBars = useMemo(() => {
    const totals = allBuckets.map((w) => pickBucketCompleted(w) + pickBucketScheduled(w))
    const max = Math.max(1, ...totals)
    const spanDays = bucketGranularity === 'week' ? 7 : 1
    return allBuckets.map((w) => {
      const t = pickBucketCompleted(w) + pickBucketScheduled(w)
      return {
        key: w.key,
        offsetPct: (daysBetween(yearStart, w.periodStart) / yearLen) * 100,
        widthPct: (spanDays / yearLen) * 100,
        heightPct: t === 0 ? 0 : Math.max(8, (t / max) * 100),
      }
    })
  }, [allBuckets, yearStart, yearLen, bucketGranularity, valueMetric])

  const todayOffsetPct = year === today.getFullYear()
    ? (daysBetween(yearStart, today) / yearLen) * 100
    : null

  const winStartDate = addDays(yearStart, windowStartOffset)
  const winEndDate = addDays(yearStart, Math.min(yearLen - 1, windowStartOffset + windowLen - 1))
  const winStartIso = isoDate(winStartDate)
  const winEndIso = isoDate(winEndDate)

  useEffect(() => {
    onRangeChange?.({ startDate: winStartIso, endDate: winEndIso })
  }, [onRangeChange, winStartIso, winEndIso])

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm w-full">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
            {valueMetric === 'revenue' ? 'Revenue' : 'Jobs'} per {bucketGranularity === 'week' ? 'week' : 'day'}
          </h3>
          <div className="text-xs sm:text-sm text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <span className="font-semibold text-accent-600">
                {valueMetric === 'revenue'
                  ? formatMoney(totalCompletedInWindow, companyCountryCode)
                  : totalCompletedInWindow}
              </span>{' '}
              completed
            </span>
            <span className="text-gray-300">·</span>
            <span>
              <span className="font-semibold text-blue-600">
                {valueMetric === 'revenue'
                  ? formatMoney(totalScheduledInWindow, companyCountryCode)
                  : totalScheduledInWindow}
              </span>{' '}
              scheduled
              {isCurrentChartYear ? ' (ahead)' : ''}
            </span>
            <span className="text-gray-300">·</span>
            <span>
              Peak{' '}
              <span className="font-semibold text-gray-900">
                {valueMetric === 'revenue'
                  ? formatMoney(peakInWindow, companyCountryCode)
                  : peakInWindow}
              </span>
              {' '}/ {bucketGranularity === 'week' ? 'week' : 'day'}
            </span>
            <span className="text-gray-300">·</span>
            <span>
              {fmtShort(winStartDate)} – {fmtShort(winEndDate)}, {year}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Year nav */}
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="w-7 h-7 grid place-items-center text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors"
              aria-label="Previous year"
            >
              ‹
            </button>
            <span className="px-2 text-xs font-semibold text-gray-900 tabular-nums">{year}</span>
            <button
              onClick={() => setYear((y) => y + 1)}
              disabled={year >= today.getFullYear()}
              className="w-7 h-7 grid place-items-center text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg transition-colors disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              aria-label="Next year"
            >
              ›
            </button>
          </div>

          {/* Preset pills */}
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                  preset === p.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block w-px h-8 bg-gray-200 self-center" aria-hidden />

          {/* Chart display only */}
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(['week', 'day'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setBucketGranularity(g)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg capitalize transition-all ${
                  bucketGranularity === g
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {g === 'week' ? 'Weeks' : 'Days'}
              </button>
            ))}
          </div>

          {/* Revenue vs job counts */}
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(['revenue', 'jobs'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setValueMetric(m)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg capitalize transition-all ${
                  valueMetric === m
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {m === 'revenue' ? 'Revenue' : 'Jobs'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Year minimap + draggable brush ────────────────────────────────── */}
      <div className="mt-5 sm:mt-6">
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          className={`relative h-16 select-none ${draggable ? '' : ''}`}
        >
          {/* Track */}
          <div className="absolute inset-x-0 top-1 bottom-6 bg-gray-50 rounded-lg border border-gray-100 overflow-hidden">
            {/* Sparkline (activity per bucket) */}
            {minimapBars.map((b) => b.heightPct === 0 ? null : (
              <div
                key={b.key}
                className="absolute bottom-0 bg-gradient-to-t from-blue-400/35 to-accent-500/40"
                style={{
                  left: `${b.offsetPct}%`,
                  width: `${b.widthPct}%`,
                  height: `${b.heightPct}%`,
                }}
              />
            ))}
            {/* Month dividers (skip Jan since that's the edge) */}
            {monthTicks.slice(1).map((t, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-l border-gray-300/60"
                style={{ left: `${t.offsetPct}%` }}
              />
            ))}
            {/* Today marker */}
            {todayOffsetPct !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                style={{ left: `${todayOffsetPct}%` }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-500 shadow" />
              </div>
            )}
          </div>

          {/* Month labels below */}
          <div className="absolute inset-x-0 bottom-0 h-5 pointer-events-none text-[10px] font-medium text-gray-500">
            {monthTicks.map((t, i) => (
              <span
                key={i}
                className="absolute uppercase tracking-wider"
                style={{ left: `${t.offsetPct}%`, transform: 'translateX(2px)' }}
              >
                {t.label.slice(0, 1)}
              </span>
            ))}
          </div>

          {/* Brush window */}
          <div
            data-brush-handle
            onPointerDown={onBrushPointerDown}
            onPointerMove={onBrushPointerMove}
            onPointerUp={onBrushPointerUp}
            onPointerCancel={onBrushPointerUp}
            className={`absolute top-1 bottom-6 rounded-lg border-2 border-accent-500 bg-accent-500/15 touch-none transition-shadow ${
              draggable
                ? 'cursor-grab active:cursor-grabbing shadow-[0_0_0_4px_rgba(61,213,122,0.12)]'
                : 'cursor-default opacity-90'
            }`}
            style={{
              left: `${brushLeftPct}%`,
              width: `${brushWidthPct}%`,
              minWidth: 24,
            }}
            aria-label="Visible date range"
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent-500 rounded-l-md" />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-accent-500 rounded-r-md" />
            {/* Grip dots */}
            {draggable && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex gap-0.5">
                  <span className="block w-0.5 h-3 bg-accent-700/60 rounded-full" />
                  <span className="block w-0.5 h-3 bg-accent-700/60 rounded-full" />
                  <span className="block w-0.5 h-3 bg-accent-700/60 rounded-full" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Helper text */}
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-400">
          <span>
            {draggable
              ? 'Drag the highlighted window to scroll the year.'
              : 'Pick 30D / 90D / 180D to scroll the year.'}
            {isCurrentChartYear && (
              <span className="hidden sm:inline">
                {' '}
                · Green = completed to date, blue = scheduled & subscription jobs ahead
                {bucketGranularity === 'week' ? ' (current week spans Mon → today → Sun).' : ''}
              </span>
            )}
          </span>
          <span className="hidden sm:inline">
            {windowLen} day{windowLen === 1 ? '' : 's'} shown
          </span>
        </div>
      </div>

      {/* ── Line chart ────────────────────────────────────────────────────── */}
      <div className="h-64 sm:h-80 w-full -ml-2 sm:ml-0 mt-4 sm:mt-5">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-accent-500 border-t-transparent" />
          </div>
        ) : plotRows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-500">
            No data in this date window.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={plotRows}
              margin={{ left: 4, right: 16, top: 12, bottom: 18 }}
            >
              <defs>
                <linearGradient id={gradCompleted} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3DD57A" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3DD57A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={gradScheduled} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e5e7eb" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="plotDayIndex"
                domain={['dataMin - 2', 'dataMax + 2']}
                tickFormatter={(plotIdx: number) => {
                  if (!plotRows.length) return ''
                  const row = plotRows.find((w) => w.plotDayIndex === plotIdx)
                  if (row) return fmtShort(row.periodStart)
                  const approx = plotRows.reduce((best, w) => {
                    const d = Math.abs(w.plotDayIndex - plotIdx)
                    return d < Math.abs(best.plotDayIndex - plotIdx) ? w : best
                  })
                  return fmtShort(approx.periodStart)
                }}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                interval="preserveStartEnd"
                minTickGap={bucketGranularity === 'day' ? 14 : 28}
                tickMargin={8}
              />
              <YAxis
                allowDecimals={valueMetric === 'revenue'}
                domain={[0, 'auto']}
                tickFormatter={(v) =>
                  valueMetric === 'revenue'
                    ? formatMoney(Number(v), companyCountryCode)
                    : String(v)
                }
                tick={{ fontSize: valueMetric === 'revenue' ? 10 : 12, fill: '#6b7280' }}
                width={valueMetric === 'revenue' ? 56 : 36}
              />
              <Tooltip
                cursor={{ stroke: '#9ca3af', strokeDasharray: '3 3' }}
                labelFormatter={(plotIdx: unknown) => {
                  if (typeof plotIdx !== 'number' || Number.isNaN(plotIdx)) return ''
                  const row = plotRows.find((w) => w.plotDayIndex === plotIdx)
                  if (!row) return ''
                  if (bucketGranularity === 'day') {
                    return fmtShort(row.periodStart)
                  }
                  return `Week of ${fmtShort(row.periodStart)} – ${fmtShort(row.periodEnd)}`
                }}
                formatter={(value: unknown, name: string) => {
                  const series =
                    name === 'completedDisplay' ? 'Completed' : 'Scheduled (incl. subscriptions)'
                  if (value == null) return ['—', series]
                  if (typeof value === 'number' && Number.isFinite(value)) {
                    if (valueMetric === 'revenue') {
                      return [formatMoney(value, companyCountryCode), series]
                    }
                    return [value, series]
                  }
                  if (typeof value === 'boolean') return [value ? '1' : '0', series]
                  return [String(value), series]
                }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                }}
              />
              {isCurrentChartYear && (
                <ReferenceLine
                  x={todayDayIndex}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeOpacity={0.75}
                  label={{
                    value: 'Today',
                    position: 'top',
                    fontSize: 10,
                    fill: '#ef4444',
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="completedDisplay"
                name="completedDisplay"
                stroke="#3DD57A"
                strokeWidth={2.5}
                fill={`url(#${gradCompleted})`}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 5, stroke: '#3DD57A', strokeWidth: 2, fill: '#fff' }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="scheduledDisplay"
                name="scheduledDisplay"
                stroke="#2563eb"
                strokeWidth={2.5}
                fill={`url(#${gradScheduled})`}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 5, stroke: '#2563eb', strokeWidth: 2, fill: '#fff' }}
                isAnimationActive={false}
              />
              {isCurrentChartYear && straddleBridge && (
                <ReferenceLine
                  segment={[
                    { x: todayDayIndex, y: straddleBridge.yCompleted },
                    { x: todayDayIndex, y: straddleBridge.yScheduled },
                  ]}
                  stroke="none"
                  ifOverflow="visible"
                  shape={(lineProps: { x1?: number; y1?: number; x2?: number; y2?: number }) => {
                    if (
                      lineProps.x1 == null ||
                      lineProps.y1 == null ||
                      lineProps.x2 == null ||
                      lineProps.y2 == null
                    ) {
                      return null
                    }
                    return (
                      <StraddleBridgeLine
                        x1={lineProps.x1}
                        y1={lineProps.y1}
                        x2={lineProps.x2}
                        y2={lineProps.y2}
                        gradientId={gradStraddleBridge}
                      />
                    )
                  }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
