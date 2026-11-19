'use client'

import { useMemo } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip, type LegendItem, type TooltipRow } from './ui'
import { bucketLabel, bucketTitle, spansYears, type BucketUnit } from './period'
import type { ClientsPoint, EarnedPoint, JobsPoint, SalesPoint, SubscriptionsPoint } from './useInsights'

export const COLORS = {
  earned: '#3DD57A',
  lastYear: '#94a3b8',
  done: '#6366f1',
  open: '#fbbf24',
  planned: '#c7d2fe',
  booked: '#10b981',
  clientsArea: '#ccfbf1',
  clientsLine: '#0d9488',
  clientsBar: '#14b8a6',
  subsArea: '#e0f2fe',
  subsLine: '#0284c7',
  subsCount: '#7dd3fc',
  sent: '#ddd6fe',
  accepted: '#8b5cf6',
  leads: '#f59e0b',
} as const

const TICK = { fontSize: 11, fill: '#94a3b8' }
const GRID = '#f1f5f9'
const MARGIN = { top: 8, right: 4, left: 4, bottom: 0 }
const MARGIN_AXIS = { top: 8, right: 8, left: -6, bottom: 0 }
const CURSOR = { fill: '#f8fafc' }

const compactFormat = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 })
export const compact = (n: number) => compactFormat.format(n)

function useXAxis(points: Array<{ bucket: string }>, unit: BucketUnit) {
  return useMemo(() => {
    const multiYear = spansYears(points)
    return {
      tickFormatter: (b: string) => bucketLabel(String(b), unit, multiYear),
      title: (p: Record<string, unknown>) => bucketTitle(String(p.bucket), unit),
    }
  }, [points, unit])
}

function hasAny<T extends object>(points: T[], key: keyof T): boolean {
  return points.some((p) => Number(p[key]) > 0)
}

export function seriesIsEmpty<T extends object>(points: T[], keys: Array<keyof T>): boolean {
  return !keys.some((k) => hasAny(points, k))
}

interface ChartProps<T> {
  series: T[]
  unit: BucketUnit
  detailed?: boolean
}

/** Earned per bucket as bars, last year's same buckets as a dashed line. */
export function EarnedChart({ series, unit, detailed = false, money }: ChartProps<EarnedPoint> & { money: (n: number) => string }) {
  const x = useXAxis(series, unit)
  const showLastYear = hasAny(series, 'lastYear')
  const rows: TooltipRow[] = [
    { key: 'earned', label: 'Earned', color: COLORS.earned, format: money },
    ...(showLastYear ? [{ key: 'lastYear', label: 'Same time last year', color: COLORS.lastYear, format: money }] : []),
    { key: 'jobs', label: 'Jobs done', color: '#cbd5e1' },
  ]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} margin={detailed ? MARGIN_AXIS : MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={x.tickFormatter} tick={TICK} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis hide={!detailed} tickFormatter={compact} tick={TICK} tickLine={false} axisLine={false} width={40} />
        <Tooltip cursor={CURSOR} content={<ChartTooltip title={x.title} rows={rows} />} />
        <Bar dataKey="earned" fill={COLORS.earned} radius={[5, 5, 0, 0]} maxBarSize={44} animationDuration={600} />
        {showLastYear && (
          <Line type="monotone" dataKey="lastYear" stroke={COLORS.lastYear} strokeDasharray="4 4" strokeWidth={1.5} dot={false} animationDuration={600} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function earnedLegend(series: EarnedPoint[]): LegendItem[] {
  return [
    { label: 'Earned', color: COLORS.earned },
    ...(hasAny(series, 'lastYear') ? [{ label: 'Last year', color: COLORS.lastYear, kind: 'dash' as const }] : []),
  ]
}

/** Visits per bucket: done and left open stacked, with new bookings as a line. */
export function JobsChart({ series, unit, detailed = false }: ChartProps<JobsPoint>) {
  const x = useXAxis(series, unit)
  const showPlanned = hasAny(series, 'planned')
  const rows: TooltipRow[] = [
    { key: 'done', label: 'Done', color: COLORS.done },
    { key: 'open', label: 'Not marked done', color: COLORS.open, hideZero: true },
    { key: 'planned', label: 'Planned', color: COLORS.planned, hideZero: true },
    { key: 'cancelled', label: 'Cancelled', color: '#fda4af', hideZero: true },
    { key: 'booked', label: 'Newly booked', color: COLORS.booked },
  ]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} margin={detailed ? MARGIN_AXIS : MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={x.tickFormatter} tick={TICK} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis hide={!detailed} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={32} />
        <Tooltip cursor={CURSOR} content={<ChartTooltip title={x.title} rows={rows} />} />
        <Bar dataKey="done" stackId="v" fill={COLORS.done} maxBarSize={40} animationDuration={600} />
        <Bar dataKey="open" stackId="v" fill={COLORS.open} maxBarSize={40} animationDuration={600} />
        {showPlanned && <Bar dataKey="planned" stackId="v" fill={COLORS.planned} maxBarSize={40} animationDuration={600} />}
        <Line type="monotone" dataKey="booked" stroke={COLORS.booked} strokeWidth={2} dot={false} animationDuration={600} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function jobsLegend(series: JobsPoint[]): LegendItem[] {
  return [
    { label: 'Done', color: COLORS.done },
    ...(hasAny(series, 'open') ? [{ label: 'Not marked done', color: COLORS.open }] : []),
    ...(hasAny(series, 'planned') ? [{ label: 'Planned', color: COLORS.planned }] : []),
    { label: 'Newly booked', color: COLORS.booked, kind: 'line' as const },
  ]
}

/**
 * The client book as a rising area, new clients as bars. Two hidden scales,
 * so a handful of new clients is still visible next to a book of hundreds.
 */
export function ClientsChart({ series, unit, detailed = false }: ChartProps<ClientsPoint>) {
  const x = useXAxis(series, unit)
  const rows: TooltipRow[] = [
    { key: 'total', label: 'Clients', color: COLORS.clientsLine },
    { key: 'added', label: 'New', color: COLORS.clientsBar },
  ]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} margin={detailed ? MARGIN_AXIS : MARGIN}>
        <defs>
          <linearGradient id="clientsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.clientsBar} stopOpacity={0.28} />
            <stop offset="100%" stopColor={COLORS.clientsBar} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={x.tickFormatter} tick={TICK} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis yAxisId="total" hide={!detailed} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={32} />
        <YAxis yAxisId="added" hide orientation="right" allowDecimals={false} domain={[0, (max: number) => Math.max(1, max * 2.2)]} />
        <Tooltip cursor={CURSOR} content={<ChartTooltip title={x.title} rows={rows} />} />
        <Bar yAxisId="added" dataKey="added" fill={COLORS.clientsBar} radius={[3, 3, 0, 0]} maxBarSize={22} animationDuration={600} />
        <Area
          yAxisId="total"
          type="monotone"
          dataKey="total"
          stroke={COLORS.clientsLine}
          strokeWidth={2}
          fill="url(#clientsFill)"
          animationDuration={600}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export const clientsLegend: LegendItem[] = [
  { label: 'All clients', color: COLORS.clientsLine, kind: 'line' },
  { label: 'New', color: COLORS.clientsBar },
]

/** What the running subscriptions are worth per month, over time. */
export function SubscriptionsChart({
  series,
  unit,
  detailed = false,
  money,
}: ChartProps<SubscriptionsPoint> & { money: (n: number) => string }) {
  const x = useXAxis(series, unit)
  const rows: TooltipRow[] = [
    { key: 'value', label: 'Per month', color: COLORS.subsLine, format: money },
    { key: 'active', label: 'Running', color: COLORS.subsCount },
  ]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} margin={detailed ? MARGIN_AXIS : MARGIN}>
        <defs>
          <linearGradient id="subsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.subsLine} stopOpacity={0.22} />
            <stop offset="100%" stopColor={COLORS.subsLine} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={x.tickFormatter} tick={TICK} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis yAxisId="value" hide={!detailed} tickFormatter={compact} tick={TICK} tickLine={false} axisLine={false} width={40} />
        <YAxis yAxisId="active" hide orientation="right" allowDecimals={false} domain={[0, (max: number) => Math.max(1, max * 1.4)]} />
        <Tooltip cursor={CURSOR} content={<ChartTooltip title={x.title} rows={rows} />} />
        {detailed && (
          <Bar yAxisId="active" dataKey="active" fill={COLORS.subsCount} fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={22} animationDuration={600} />
        )}
        <Area
          yAxisId="value"
          type="stepAfter"
          dataKey="value"
          stroke={COLORS.subsLine}
          strokeWidth={2}
          fill="url(#subsFill)"
          animationDuration={600}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** Requests coming in as a line, offers sent and won as bars. */
export function SalesChart({ series, unit, detailed = false }: ChartProps<SalesPoint>) {
  const x = useXAxis(series, unit)
  const rows: TooltipRow[] = [
    { key: 'leads', label: 'Requests', color: COLORS.leads },
    { key: 'sent', label: 'Offers sent', color: '#c4b5fd' },
    { key: 'accepted', label: 'Accepted', color: COLORS.accepted },
  ]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={series} margin={detailed ? MARGIN_AXIS : MARGIN} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={x.tickFormatter} tick={TICK} tickLine={false} axisLine={false} minTickGap={20} />
        <YAxis hide={!detailed} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={32} />
        <Tooltip cursor={CURSOR} content={<ChartTooltip title={x.title} rows={rows} />} />
        <Bar dataKey="sent" fill={COLORS.sent} radius={[3, 3, 0, 0]} maxBarSize={20} animationDuration={600} />
        <Bar dataKey="accepted" fill={COLORS.accepted} radius={[3, 3, 0, 0]} maxBarSize={20} animationDuration={600} />
        <Line type="monotone" dataKey="leads" stroke={COLORS.leads} strokeWidth={2} dot={false} animationDuration={600} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export const salesLegend: LegendItem[] = [
  { label: 'Requests', color: COLORS.leads, kind: 'line' },
  { label: 'Offers sent', color: COLORS.sent },
  { label: 'Accepted', color: COLORS.accepted },
]
