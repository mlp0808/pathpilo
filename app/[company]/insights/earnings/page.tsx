'use client'

import Link from 'next/link'
import { ArrowPathRoundedSquareIcon, CheckCircleIcon, DocumentPlusIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import AppLayout from '../../../components/AppLayout'
import {
  HeroPanel,
  InsightsPage,
  InsightsSkeleton,
  useCompanyBase,
  useScrollToHash,
} from '../../../components/insights/InsightsPage'
import { usePeriod, formatShort } from '../../../components/insights/period'
import { useInsights, useMoneyFormatter, type EarningsData } from '../../../components/insights/useInsights'
import { EarnedChart, earnedLegend } from '../../../components/insights/charts'
import {
  BigNumber,
  ChartLegend,
  Delta,
  EmptyNote,
  ErrorNote,
  Figure,
  GhostChart,
  ListRow,
  Panel,
  TextAction,
  plural,
} from '../../../components/insights/ui'

/**
 * Earned → invoiced → paid as bars that drain. Each stage is a slice of the
 * one before it, so the gaps are the point: money still sitting somewhere.
 */
function MoneyFlow({ data, base, money }: { data: EarningsData; base: string; money: (n: number) => string }) {
  const { earned, invoiced, paid } = data.funnel
  const max = Math.max(earned, 1)
  const stages = [
    {
      label: 'Earned',
      value: earned,
      bar: 'bg-accent-500',
      gap: null as null | { text: string; href: string },
    },
    {
      label: 'Invoiced',
      value: invoiced,
      bar: 'bg-sky-400',
      gap: earned - invoiced > 0 ? { text: `${money(earned - invoiced)} not invoiced yet`, href: '#not-invoiced' } : null,
    },
    {
      label: 'Paid',
      value: paid,
      bar: 'bg-violet-400',
      gap: invoiced - paid > 0 ? { text: `${money(invoiced - paid)} waiting for payment`, href: '#unpaid' } : null,
    },
  ]

  return (
    <div className="space-y-4">
      {stages.map((stage) => (
        <div key={stage.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-semibold text-gray-600">{stage.label}</span>
            <span className="text-sm font-bold tabular-nums text-gray-900">{money(stage.value)}</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${stage.bar} transition-[width] duration-700`}
              style={{ width: `${stage.value > 0 ? Math.max(2, (stage.value / max) * 100) : 0}%` }}
            />
          </div>
          {stage.gap && (
            <a href={stage.gap.href} className="mt-1 inline-block text-[11px] font-medium text-gray-400 hover:text-gray-700">
              {stage.gap.text} ↓
            </a>
          )}
        </div>
      ))}
      {earned === 0 && <p className="text-xs text-gray-400">Nothing completed in this period yet.</p>}
      <p className="border-t border-gray-100 pt-3 text-[11px] leading-relaxed text-gray-400">
        Work counts as earned the day it is marked done.{' '}
        <Link href={`${base}/invoices`} className="font-medium text-gray-500 hover:text-gray-800">
          Invoices
        </Link>{' '}
        and payments follow it.
      </p>
    </div>
  )
}

export default function EarningsInsightsPage() {
  const base = useCompanyBase()
  const [period, setPeriod, ready] = usePeriod()
  const money = useMoneyFormatter()
  const { data, loading, error, reload } = useInsights<EarningsData>(
    '/insights/earnings',
    { from: period.from, to: period.to },
    ready
  )
  useScrollToHash(Boolean(data))

  const totalOrigin = data ? data.origin.oneOffValue + data.origin.subscriptionValue : 0
  const subscriptionShare = data && totalOrigin > 0 ? data.origin.subscriptionValue / totalOrigin : 0
  const maxService = data ? Math.max(1, ...data.services.map((s) => s.total)) : 1

  return (
    <AppLayout>
      <InsightsPage
        section="earnings"
        title="Earnings"
        subtitle="What your completed work is worth, and where that money is now."
        period={period}
        onPeriod={setPeriod}
        actions={
          <>
            <TextAction primary icon={DocumentPlusIcon} href={`${base}/invoices/new`}>
              New invoice
            </TextAction>
            <TextAction icon={DocumentTextIcon} href={`${base}/invoices`}>
              All invoices
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
                eyebrow={`Earned · ${period.short}`}
                right={<Delta current={data.earned.total} previous={data.earned.lastYearTotal} />}
                figure={<BigNumber muted={data.earned.total === 0}>{money(data.earned.total)}</BigNumber>}
                sub={
                  data.earned.jobs > 0
                    ? `From ${plural(data.earned.jobs, 'job')} · ${money(data.earned.averageJob)} on average${
                        data.earned.lastYearTotal > 0 ? ` · ${money(data.earned.lastYearTotal)} the same time last year` : ''
                      }`
                    : undefined
                }
                legend={data.earned.total > 0 ? <ChartLegend items={earnedLegend(data.earned.series)} /> : undefined}
              >
                {data.earned.total === 0 && data.earned.lastYearTotal === 0 ? (
                  <GhostChart message={`Nothing completed in ${period.label}. Jobs count here the day they are marked done.`} />
                ) : (
                  <EarnedChart series={data.earned.series} unit={data.range.unit} money={money} detailed />
                )}
              </HeroPanel>

              <Panel title="Where the money is" hint={`Work completed in ${period.label}`}>
                <MoneyFlow data={data} base={base} money={money} />
              </Panel>
            </div>

            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              <Panel
                id="not-invoiced"
                title="Ready to invoice"
                hint={
                  data.notInvoiced.total > 0
                    ? `${money(data.notInvoiced.total)} of finished work for ${plural(data.notInvoiced.clients, 'client')} — all time`
                    : 'Finished work that has no invoice yet'
                }
                right={
                  data.notInvoiced.total > 0 ? (
                    <TextAction primary icon={DocumentPlusIcon} href={`${base}/invoices/new`}>
                      Invoice
                    </TextAction>
                  ) : undefined
                }
                bodyClassName="py-2"
              >
                {data.notInvoiced.byClient.length === 0 ? (
                  <EmptyNote>
                    <CheckCircleIcon className="mx-auto mb-1 block h-6 w-6 text-emerald-500" />
                    Everything you have finished is invoiced.
                  </EmptyNote>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {data.notInvoiced.byClient.map((row) => (
                      <ListRow
                        key={row.clientId}
                        href={`${base}/invoices/new?clientId=${row.clientId}`}
                        title={row.name}
                        detail={`${plural(row.jobs, 'job')}${row.oldest ? ` · oldest from ${formatShort(row.oldest)}` : ''}`}
                        value={money(row.total)}
                        valueHint="Create invoice"
                      />
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                id="unpaid"
                title="Waiting for payment"
                hint={
                  data.unpaid.invoices > 0
                    ? `${money(data.unpaid.total)} on ${plural(data.unpaid.invoices, 'invoice')}${
                        data.unpaid.overdue > 0 ? ` · ${money(data.unpaid.overdueTotal)} overdue` : ''
                      }`
                    : 'Sent invoices that are not paid yet'
                }
                right={
                  data.unpaid.invoices > 0 ? (
                    <TextAction icon={DocumentTextIcon} href={`${base}/invoices?status=overdue,sent`}>
                      All unpaid
                    </TextAction>
                  ) : undefined
                }
                bodyClassName="py-2"
              >
                {data.unpaid.list.length === 0 ? (
                  <EmptyNote>
                    <CheckCircleIcon className="mx-auto mb-1 block h-6 w-6 text-emerald-500" />
                    No unpaid invoices.
                  </EmptyNote>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {data.unpaid.list.map((inv) => (
                      <ListRow
                        key={inv.id}
                        href={`${base}/invoices/${inv.id}`}
                        title={inv.client}
                        badge={
                          inv.overdue ? (
                            <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              Overdue
                            </span>
                          ) : undefined
                        }
                        detail={`${inv.number ? `#${inv.number} · ` : ''}${inv.dueDate ? `due ${formatShort(inv.dueDate)}` : 'no due date'}`}
                        value={money(inv.remaining)}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
              <Panel
                className="lg:col-span-2"
                title="What you earn it with"
                hint={`Services by value in ${period.label}`}
                bodyClassName="pb-2 pt-3"
              >
                {data.services.length === 0 ? (
                  <EmptyNote>No completed services in this period.</EmptyNote>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[460px] text-sm">
                      <thead>
                        <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                          <th className="px-5 py-2">Service</th>
                          <th className="px-3 py-2 text-right">Times</th>
                          <th className="px-3 py-2 text-right">Average</th>
                          <th className="px-5 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.services.map((service) => (
                          <tr key={service.title} className="border-t border-gray-50">
                            <td className="px-5 py-2.5">
                              <span className="block max-w-[260px] truncate font-medium text-gray-900">{service.title}</span>
                              <span className="mt-1 block h-1 max-w-[260px] rounded-full bg-gray-100">
                                <span
                                  className="block h-1 rounded-full bg-accent-500"
                                  style={{ width: `${(service.total / maxService) * 100}%` }}
                                />
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{service.times}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{money(service.average)}</td>
                            <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                              {money(service.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              <Panel title="One-off or repeating" hint="How much of your work comes back by itself">
                {totalOrigin === 0 ? (
                  <EmptyNote>No completed work in this period.</EmptyNote>
                ) : (
                  <>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full bg-accent-500" style={{ width: `${(1 - subscriptionShare) * 100}%` }} />
                      <div className="h-full bg-sky-400" style={{ width: `${subscriptionShare * 100}%` }} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <Figure
                        label="One-off"
                        value={money(data.origin.oneOffValue)}
                        hint={plural(data.origin.oneOffJobs, 'job')}
                      />
                      <Figure
                        label="From subscriptions"
                        value={money(data.origin.subscriptionValue)}
                        hint={`${Math.round(subscriptionShare * 100)}% · ${plural(data.origin.subscriptionJobs, 'visit')}`}
                        accent="text-sky-700"
                      />
                    </div>
                  </>
                )}
                {(data.origin.feeValue > 0 || data.origin.cancelledJobs > 0) && (
                  <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
                    {plural(data.origin.cancelledJobs, 'cancellation')}
                    {data.origin.feeValue > 0 ? ` · ${money(data.origin.feeValue)} recovered in fees` : ''}
                  </p>
                )}
                <div className="mt-4">
                  <TextAction icon={ArrowPathRoundedSquareIcon} href={`${base}/insights/subscriptions`}>
                    Subscription stats
                  </TextAction>
                </div>
              </Panel>
            </div>
          </div>
        )}
      </InsightsPage>
    </AppLayout>
  )
}
