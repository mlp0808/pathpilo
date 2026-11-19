'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowPathRoundedSquareIcon, CalendarDaysIcon, PauseCircleIcon, PlusIcon } from '@heroicons/react/24/outline'
import AppLayout from '../../../components/AppLayout'
import { HeroPanel, InsightsPage, InsightsSkeleton, useCompanyBase } from '../../../components/insights/InsightsPage'
import { formatShort, usePeriod } from '../../../components/insights/period'
import {
  useInsights,
  useMoneyFormatter,
  type SubscriptionsData,
} from '../../../components/insights/useInsights'
import { COLORS, SubscriptionsChart, seriesIsEmpty } from '../../../components/insights/charts'
import {
  BigNumber,
  ChartLegend,
  EmptyNote,
  ErrorNote,
  Figure,
  GhostChart,
  ListRow,
  Panel,
  TextAction,
  plural,
} from '../../../components/insights/ui'
import { requestGuidesRefresh } from '../../../config/guideEvents'

const CreateJob = dynamic(() => import('../../../components/CreateJob'), { ssr: false })

export default function SubscriptionsInsightsPage() {
  const base = useCompanyBase()
  const [period, setPeriod, ready] = usePeriod()
  const [creating, setCreating] = useState(false)
  const money = useMoneyFormatter()
  const { data, loading, error, reload } = useInsights<SubscriptionsData>(
    '/insights/subscriptions',
    { from: period.from, to: period.to },
    ready
  )

  const empty = data ? data.active === 0 && data.paused === 0 && seriesIsEmpty(data.series, ['value']) : true
  const maxMix = data ? Math.max(1, ...data.mix.map((m) => m.perMonth)) : 1
  const clientHref = (clientId: number | null) =>
    clientId ? `${base}/clients/${clientId}` : `${base}/recurring/subscriptions`

  return (
    <AppLayout>
      <InsightsPage
        section="subscriptions"
        title="Subscriptions"
        subtitle="Income that repeats by itself: what it is worth and what it is made of."
        period={period}
        onPeriod={setPeriod}
        actions={
          <>
            <TextAction primary icon={PlusIcon} onClick={() => setCreating(true)}>
              New subscription
            </TextAction>
            <TextAction icon={ArrowPathRoundedSquareIcon} href={`${base}/recurring/subscriptions`}>
              All subscriptions
            </TextAction>
            <TextAction icon={CalendarDaysIcon} href={`${base}/insights/jobs?tab=ahead`}>
              Planned visits
            </TextAction>
          </>
        }
      >
        {error && !data && <ErrorNote message={error} onRetry={reload} />}
        {!data ? (
          !error && <InsightsSkeleton />
        ) : (
          <div className={`space-y-4 transition-opacity sm:space-y-5 ${loading ? 'opacity-60' : ''}`}>
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
              <HeroPanel
                className="lg:col-span-2"
                eyebrow="Each month from subscriptions"
                figure={
                  <div className="flex items-baseline gap-1.5">
                    <BigNumber muted={empty}>{money(data.monthlyValue)}</BigNumber>
                    <span className="text-sm font-medium text-gray-400">/ month</span>
                  </div>
                }
                sub={
                  empty
                    ? undefined
                    : `About ${money(data.monthlyValue * 12)} a year from ${plural(data.active, 'running subscription')}`
                }
                legend={
                  empty ? undefined : (
                    <ChartLegend
                      items={[
                        { label: 'Value per month', color: COLORS.subsLine, kind: 'line' },
                        { label: 'Running', color: COLORS.subsCount },
                      ]}
                    />
                  )
                }
              >
                {empty ? (
                  <GhostChart
                    variant="area"
                    message="Regular customers? Put them on a subscription and their visits plan themselves. What they are worth each month shows up here."
                    action={
                      <TextAction primary icon={PlusIcon} onClick={() => setCreating(true)}>
                        Create a subscription
                      </TextAction>
                    }
                  />
                ) : (
                  <SubscriptionsChart series={data.series} unit={data.range.unit} money={money} detailed />
                )}
              </HeroPanel>

              <Panel title="In numbers" hint="Signed-up value. A visit counts as earned when it is done.">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <Figure label="Running" value={data.active} accent="text-sky-700" />
                  <Figure
                    label="Paused"
                    value={data.paused}
                    hint={data.paused > 0 ? 'See below' : undefined}
                    href={data.paused > 0 ? '#paused' : undefined}
                  />
                  <Figure label="Visits a month" value={data.visitsPerMonth.toLocaleString('en-GB')} hint="Across all running" />
                  <Figure label="Average" value={money(data.averagePerMonth)} hint="Per subscription a month" />
                  <Figure label="Started" value={data.started} hint={`In ${period.label}`} accent="text-emerald-700" />
                  <Figure label="Ended" value={data.ended} hint={`In ${period.label}`} accent={data.ended > 0 ? 'text-rose-600' : undefined} />
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
              <Panel
                className="lg:col-span-2"
                title="Your subscriptions"
                hint="Sorted by what they bring in each month"
                bodyClassName="pb-2 pt-3"
              >
                {data.list.length === 0 ? (
                  <EmptyNote
                    action={
                      <TextAction primary icon={PlusIcon} onClick={() => setCreating(true)}>
                        New subscription
                      </TextAction>
                    }
                  >
                    No running subscriptions.
                  </EmptyNote>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          <th className="px-5 py-2">Client</th>
                          <th className="px-3 py-2">How often</th>
                          <th className="px-3 py-2 text-right">Per visit</th>
                          <th className="px-5 py-2 text-right">Per month</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.list.map((s) => (
                          <tr key={s.id} className="border-t border-gray-50 transition-colors hover:bg-gray-50">
                            <td className="px-5 py-2.5">
                              <Link href={clientHref(s.clientId)} className="block min-w-0">
                                <span className="block max-w-[240px] truncate font-medium text-gray-900">{s.name}</span>
                                <span className="block max-w-[240px] truncate text-xs text-gray-500">
                                  {s.title || 'Subscription'}
                                  {s.since ? ` · since ${formatShort(s.since)}` : ''}
                                </span>
                              </Link>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-500">{s.frequency}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{money(s.perVisit)}</td>
                            <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-gray-900">{money(s.perMonth)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <div className="space-y-4 sm:space-y-5">
                <Panel title="How often" hint="Running subscriptions by frequency">
                  {data.mix.length === 0 ? (
                    <EmptyNote>Nothing running yet.</EmptyNote>
                  ) : (
                    <ul className="space-y-3.5">
                      {data.mix.map((m) => (
                        <li key={m.label}>
                          <div className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="font-semibold text-gray-600">{m.label}</span>
                            <span className="tabular-nums text-gray-500">
                              {m.count} · <span className="font-semibold text-gray-900">{money(m.perMonth)}</span>
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-sky-400 transition-[width] duration-700"
                              style={{ width: `${(m.perMonth / maxMix) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                {data.pausedList.length > 0 && (
                  <Panel id="paused" title="Paused" hint="Not counted in the monthly value" bodyClassName="py-2">
                    <ul className="divide-y divide-gray-50">
                      {data.pausedList.map((s) => (
                        <ListRow
                          key={s.id}
                          href={clientHref(s.clientId)}
                          title={s.name}
                          badge={<PauseCircleIcon className="h-4 w-4 shrink-0 text-gray-300" />}
                          detail={`${s.frequency}${s.pausedAt ? ` · paused ${formatShort(s.pausedAt)}` : ''}`}
                          value={money(s.perMonth)}
                          valueHint="a month"
                        />
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>
            </div>
          </div>
        )}
      </InsightsPage>

      {creating && (
        <CreateJob
          isOpen
          mode="subscription"
          onClose={() => setCreating(false)}
          onJobCreated={() => {
            setCreating(false)
            requestGuidesRefresh()
            reload()
          }}
        />
      )}
    </AppLayout>
  )
}
