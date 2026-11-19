'use client'

import { Suspense, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowPathRoundedSquareIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  MapIcon,
  PlusIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import AppLayout from '../../../components/AppLayout'
import {
  HeroPanel,
  InsightsPage,
  InsightsSkeleton,
  useCompanyBase,
  useScrollToHash,
} from '../../../components/insights/InsightsPage'
import { bucketLabel, bucketTitle, formatDay, todayISO, usePeriod, type Period } from '../../../components/insights/period'
import {
  useInsights,
  useMoneyFormatter,
  type AheadData,
  type JobsData,
} from '../../../components/insights/useInsights'
import { COLORS, JobsChart, compact, jobsLegend, seriesIsEmpty } from '../../../components/insights/charts'
import {
  BigNumber,
  ChartLegend,
  ChartTooltip,
  EmptyNote,
  ErrorNote,
  Figure,
  GhostChart,
  ListRow,
  Panel,
  Skeleton,
  TextAction,
  plural,
  type TooltipRow,
} from '../../../components/insights/ui'
import { requestGuidesRefresh } from '../../../config/guideEvents'

const CreateJob = dynamic(() => import('../../../components/CreateJob'), { ssr: false })

type Tab = 'past' | 'ahead'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function PastTab({ period, base, money }: { period: Period; base: string; money: (n: number) => string }) {
  const { data, loading, error, reload } = useInsights<JobsData>(
    '/insights/jobs',
    { from: period.from, to: period.to },
    true
  )
  useScrollToHash(Boolean(data))

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />
  if (!data) return <InsightsSkeleton />

  const empty = seriesIsEmpty(data.series, ['done', 'open', 'planned', 'booked'])
  const past = data.done + data.open
  const doneShare = past > 0 ? data.done / past : 0
  const maxDay = Math.max(1, ...data.weekdays.map((d) => d.jobs))
  const busiest = data.weekdays.reduce((a, b) => (b.jobs > a.jobs ? b : a), data.weekdays[0])
  const maxDone = Math.max(1, ...data.team.map((m) => m.done))

  return (
    <div className={`space-y-4 transition-opacity sm:space-y-5 ${loading ? 'opacity-60' : ''}`}>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <HeroPanel
          className="lg:col-span-2"
          eyebrow={`Visits done · ${period.short}`}
          figure={<BigNumber muted={data.done === 0}>{data.done.toLocaleString('en-GB')}</BigNumber>}
          sub={
            past > 0
              ? `${Math.round(doneShare * 100)}% of the visits dated in this period are marked done`
              : undefined
          }
          legend={empty ? undefined : <ChartLegend items={jobsLegend(data.series)} />}
        >
          {empty ? (
            <GhostChart message={`No visits in ${period.label}. Book jobs and mark them done to see your work here.`} />
          ) : (
            <JobsChart series={data.series} unit={data.range.unit} detailed />
          )}
        </HeroPanel>

        <Panel title="In numbers" hint={`Visits dated in ${period.label}`}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Figure label="Done" value={data.done.toLocaleString('en-GB')} accent="text-indigo-700" />
            <Figure
              label="Not marked done"
              value={data.open.toLocaleString('en-GB')}
              accent={data.open > 0 ? 'text-amber-600' : undefined}
              hint={data.stillOpen.jobs > 0 ? 'See the list below' : 'All closed'}
              href={data.stillOpen.jobs > 0 ? '#still-open' : undefined}
            />
            <Figure label="Still to come" value={data.planned.toLocaleString('en-GB')} hint="Later in this period" />
            <Figure label="Newly booked" value={data.booked.toLocaleString('en-GB')} hint="Created in this period" />
            <Figure
              label="Cancelled"
              value={data.cancelled.toLocaleString('en-GB')}
              hint={data.fees.value > 0 ? `${money(data.fees.value)} in fees` : 'No fees charged'}
            />
            <Figure
              label="Busiest day"
              value={busiest && busiest.jobs > 0 ? WEEKDAYS[busiest.dow - 1] : '—'}
              hint={busiest && busiest.jobs > 0 ? plural(busiest.jobs, 'visit') : undefined}
            />
          </div>
          {past > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-gray-600">Marked done</span>
                <span className="tabular-nums text-gray-500">
                  {data.done} of {past}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-amber-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${doneShare * 100}%` }} />
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Panel
          id="still-open"
          className="lg:col-span-2"
          title="Not marked done"
          hint={
            data.stillOpen.jobs > 0
              ? `${plural(data.stillOpen.jobs, 'past visit')} still open, worth ${money(data.stillOpen.total)}. Done? Mark it so it counts as earned.`
              : 'Past visits that were never marked done'
          }
          bodyClassName="py-2"
        >
          {data.stillOpen.list.length === 0 ? (
            <EmptyNote>
              <CheckCircleIcon className="mx-auto mb-1 block h-6 w-6 text-emerald-500" />
              Every past visit is marked done.
            </EmptyNote>
          ) : (
            <>
              <ul className="divide-y divide-gray-50">
                {data.stillOpen.list.map((job) => (
                  <ListRow
                    key={job.id}
                    href={`${base}/jobs?date=${job.date}&job=${job.id}`}
                    title={job.client || job.title || 'Job'}
                    detail={[formatDay(job.date), job.client && job.title ? job.title : '', job.employee]
                      .filter(Boolean)
                      .join(' · ')}
                    value={job.value > 0 ? money(job.value) : undefined}
                  />
                ))}
              </ul>
              {data.stillOpen.jobs > data.stillOpen.list.length && (
                <p className="px-5 pb-2 pt-3 text-xs text-gray-400">
                  Showing the latest {data.stillOpen.list.length} of {data.stillOpen.jobs}.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel title="Busiest days" hint={`Visits done per weekday in ${period.label}`}>
          {data.done === 0 ? (
            <EmptyNote>No visits done in this period.</EmptyNote>
          ) : (
            <ul className="space-y-2.5">
              {data.weekdays.map((d) => (
                <li key={d.dow} className="flex items-center gap-3 text-xs">
                  <span className="w-8 shrink-0 font-semibold text-gray-600">{WEEKDAYS[d.dow - 1]}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span
                      className="block h-full rounded-full bg-indigo-400 transition-[width] duration-700"
                      style={{ width: `${(d.jobs / maxDay) * 100}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums text-gray-500">{d.jobs}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {data.team.length > 0 && (
        <Panel
          id="team"
          title="Team"
          hint={`Who did the work in ${period.label}`}
          right={
            <TextAction icon={UsersIcon} href={`${base}/team`}>
              Manage team
            </TextAction>
          }
          bodyClassName="pb-2 pt-3"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  <th className="px-5 py-2">Person</th>
                  <th className="px-3 py-2 text-right">Done</th>
                  <th className="px-3 py-2 text-right">Not marked done</th>
                  <th className="px-5 py-2 text-right">Earned</th>
                </tr>
              </thead>
              <tbody>
                {data.team.map((m) => (
                  <tr key={m.userId} className="border-t border-gray-50">
                    <td className="px-5 py-2.5">
                      <span className="block font-medium text-gray-900">{m.name}</span>
                      <span className="mt-1 block h-1 max-w-[220px] rounded-full bg-gray-100">
                        <span className="block h-1 rounded-full bg-indigo-400" style={{ width: `${(m.done / maxDone) * 100}%` }} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{m.done}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${m.open > 0 ? 'font-semibold text-amber-600' : 'text-gray-400'}`}>
                      {m.open}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-gray-900">{money(m.earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}

function AheadChart({ data, money }: { data: AheadData; money: (n: number) => string }) {
  const points = useMemo(
    () =>
      data.byMonth.map((m) => ({
        bucket: `${m.month}-01`,
        bookedValue: m.bookedValue,
        projectedValue: m.projectedValue,
        visits: m.bookedJobs + m.projectedJobs,
      })),
    [data.byMonth]
  )
  const rows: TooltipRow[] = [
    { key: 'bookedValue', label: 'Booked', color: COLORS.done, format: money },
    { key: 'projectedValue', label: 'From subscriptions', color: COLORS.subsCount, format: money },
    { key: 'visits', label: 'Visits', color: '#94a3b8' },
  ]
  const multiYear = new Set(points.map((p) => p.bucket.slice(0, 4))).size > 1

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={points} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(b: string) => bucketLabel(String(b), 'month', multiYear)}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis yAxisId="value" tickFormatter={compact} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={40} />
        <YAxis yAxisId="visits" hide orientation="right" allowDecimals={false} domain={[0, (max: number) => Math.max(1, max * 1.25)]} />
        <Tooltip
          cursor={{ fill: '#f8fafc' }}
          content={<ChartTooltip title={(p) => bucketTitle(String(p.bucket), 'month')} rows={rows} />}
        />
        <Bar yAxisId="value" dataKey="bookedValue" stackId="v" fill={COLORS.done} maxBarSize={48} animationDuration={600} />
        <Bar yAxisId="value" dataKey="projectedValue" stackId="v" fill={COLORS.subsCount} radius={[5, 5, 0, 0]} maxBarSize={48} animationDuration={600} />
        <Line yAxisId="visits" type="monotone" dataKey="visits" stroke="#94a3b8" strokeWidth={1.5} dot={false} animationDuration={600} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function AheadTab({ base, money }: { base: string; money: (n: number) => string }) {
  const [months, setMonths] = useState(6)
  const { data, loading, error, reload } = useInsights<AheadData>('/insights/ahead', { months })

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />
  if (!data) return <InsightsSkeleton />

  const planned = data.booked.total + data.projected.total
  const visits = data.booked.jobs + data.projected.jobs
  const empty = visits === 0

  const windowPicker = (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
      {[3, 6, 12].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setMonths(n)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            months === n ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {n} mo
        </button>
      ))}
    </div>
  )

  return (
    <div className={`space-y-4 transition-opacity sm:space-y-5 ${loading ? 'opacity-60' : ''}`}>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <HeroPanel
          className="lg:col-span-2"
          eyebrow={`Planned work · next ${data.range.months} months`}
          right={windowPicker}
          figure={<BigNumber muted={empty}>{money(planned)}</BigNumber>}
          sub={empty ? undefined : `${plural(visits, 'visit')} on the calendar or due from subscriptions`}
          legend={
            empty ? undefined : (
              <ChartLegend
                items={[
                  { label: 'Booked', color: COLORS.done },
                  { label: 'From subscriptions', color: COLORS.subsCount },
                  { label: 'Visits', color: '#94a3b8', kind: 'line' },
                ]}
              />
            )
          }
        >
          {empty ? (
            <GhostChart message="Nothing planned yet. Booked jobs and subscription visits show up here month by month." />
          ) : (
            <AheadChart data={data} money={money} />
          )}
        </HeroPanel>

        <Panel title="What it is made of" hint="Planned work is not earnings until it is done">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Figure
              label="Booked jobs"
              value={money(data.booked.total)}
              hint={plural(data.booked.jobs, 'visit')}
              accent="text-indigo-700"
            />
            <Figure
              label="Subscription visits"
              value={money(data.projected.total)}
              hint={`${plural(data.projected.jobs, 'visit')} not scheduled yet`}
              accent="text-sky-700"
            />
            <Figure
              label="Each month from subscriptions"
              value={money(data.subscriptionsPerMonth)}
              hint="Signed-up value"
              href={`${base}/insights/subscriptions`}
            />
            <Figure
              label="Per month on average"
              value={money(planned / Math.max(1, data.range.months))}
              hint={`Over ${data.range.months} months`}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-gray-100 pt-4">
            <TextAction primary icon={CalendarDaysIcon} href={`${base}/jobs`}>
              Open schedule
            </TextAction>
            <TextAction icon={ArrowPathRoundedSquareIcon} href={`${base}/recurring/subscriptions`}>
              Subscriptions
            </TextAction>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function JobsInsightsContent() {
  const base = useCompanyBase()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab: Tab = searchParams.get('tab') === 'ahead' ? 'ahead' : 'past'
  const [period, setPeriod, ready] = usePeriod()
  const [creating, setCreating] = useState(false)
  const [version, setVersion] = useState(0)
  const money = useMoneyFormatter()

  const switchTab = (next: Tab) => {
    router.replace(`${base}/insights/jobs${next === 'ahead' ? '?tab=ahead' : ''}`, { scroll: false })
  }

  return (
    <>
      <InsightsPage
        section="jobs"
        title="Jobs"
        subtitle="The work itself: what got done, what was left open, and what is coming."
        period={tab === 'past' ? period : undefined}
        onPeriod={setPeriod}
        actions={
          <>
            <TextAction primary icon={PlusIcon} onClick={() => setCreating(true)}>
              New job
            </TextAction>
            <TextAction icon={CalendarDaysIcon} href={`${base}/jobs`}>
              Schedule
            </TextAction>
            <TextAction icon={MapIcon} href={`${base}/map?focus=day&date=${todayISO()}`}>
              Today&apos;s route
            </TextAction>
          </>
        }
      >
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          {(['past', 'ahead'] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => switchTab(id)}
              className={`rounded-[10px] px-3.5 py-1.5 text-xs font-semibold transition-all ${
                tab === id ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-900/5' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {id === 'past' ? 'What happened' : 'What is ahead'}
            </button>
          ))}
        </div>

        {tab === 'past' ? (
          ready ? (
            <PastTab key={version} period={period} base={base} money={money} />
          ) : (
            <InsightsSkeleton />
          )
        ) : (
          <AheadTab key={version} base={base} money={money} />
        )}
      </InsightsPage>

      {creating && (
        <CreateJob
          isOpen
          onClose={() => setCreating(false)}
          onJobCreated={() => {
            setCreating(false)
            requestGuidesRefresh()
            setVersion((v) => v + 1)
          }}
        />
      )}
    </>
  )
}

export default function JobsInsightsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<Skeleton className="h-[420px]" />}>
        <JobsInsightsContent />
      </Suspense>
    </AppLayout>
  )
}
