'use client'

import Link from 'next/link'
import {
  AdjustmentsHorizontalIcon,
  CheckCircleIcon,
  FunnelIcon,
  InboxArrowDownIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import AppLayout from '../../../components/AppLayout'
import { HeroPanel, InsightsPage, InsightsSkeleton, useCompanyBase } from '../../../components/insights/InsightsPage'
import { formatShort, usePeriod } from '../../../components/insights/period'
import { useInsights, useMoneyFormatter, type SalesData } from '../../../components/insights/useInsights'
import { SalesChart, salesLegend, seriesIsEmpty } from '../../../components/insights/charts'
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

const SOURCE_LABELS: Record<string, string> = {
  form: 'Your website form',
  manual: 'Added by you',
}

function sourceLabel(source: string): string {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source]
  const words = source.replace(/[_-]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : 'Other'
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `on ${formatShort(iso.slice(0, 10))}`
}

function duration(hours: number | null): string {
  if (hours == null) return '—'
  if (hours < 1) return 'Under an hour'
  if (hours < 36) return plural(Math.round(hours), 'hour')
  return plural(Math.round(hours / 24), 'day')
}

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'gray' | 'rose'; children: string }) {
  const cls = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    gray: 'bg-gray-100 text-gray-500',
    rose: 'bg-rose-50 text-rose-700',
  }[tone]
  return <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>
}

export default function SalesInsightsPage() {
  const base = useCompanyBase()
  const [period, setPeriod, ready] = usePeriod()
  const money = useMoneyFormatter()
  const { data, loading, error, reload } = useInsights<SalesData>(
    '/insights/sales',
    { from: period.from, to: period.to },
    ready
  )

  const quiet = data ? seriesIsEmpty(data.series, ['leads', 'sent', 'accepted']) : true
  const totalSources = data ? data.sources.reduce((sum, s) => sum + s.leads, 0) : 0
  const onYourDesk = data ? data.toVerify.length + data.newLeads.length : 0

  return (
    <AppLayout>
      <InsightsPage
        section="sales"
        title="Sales"
        subtitle="Requests coming in, offers going out, and the work you win."
        period={period}
        onPeriod={setPeriod}
        actions={
          <>
            <TextAction primary icon={PaperAirplaneIcon} href={`${base}/pipeline?new=1`}>
              New offer
            </TextAction>
            <TextAction icon={FunnelIcon} href={`${base}/pipeline`}>
              Pipeline
            </TextAction>
            <TextAction icon={AdjustmentsHorizontalIcon} href={`${base}/settings/leads-form`}>
              Lead form
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
                eyebrow={`Offers won · ${period.short}`}
                figure={
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <BigNumber muted={!data.everUsed}>{data.accepted}</BigNumber>
                    {data.acceptedValue > 0 && (
                      <span className="text-lg font-semibold tabular-nums text-violet-700">{money(data.acceptedValue)}</span>
                    )}
                  </div>
                }
                sub={
                  data.everUsed
                    ? `${plural(data.leads, 'request')} in · ${plural(data.sent, 'offer')} sent in ${period.label}`
                    : undefined
                }
                legend={quiet ? undefined : <ChartLegend items={salesLegend} />}
              >
                {quiet ? (
                  <GhostChart
                    message={
                      data.everUsed
                        ? `No requests or offers in ${period.label}.`
                        : 'Send offers clients can accept online, and collect requests straight from your website.'
                    }
                    action={
                      <TextAction primary icon={PaperAirplaneIcon} href={`${base}/pipeline?new=1`}>
                        Send your first offer
                      </TextAction>
                    }
                  />
                ) : (
                  <SalesChart series={data.series} unit={data.range.unit} detailed />
                )}
              </HeroPanel>

              <Panel title="In numbers" hint={`Offers sent in ${period.label}, and what became of them`}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <Figure
                    label="Win rate"
                    value={data.cohort.winRate != null ? `${Math.round(data.cohort.winRate * 100)}%` : '—'}
                    hint={
                      data.cohort.winRate != null
                        ? `${data.cohort.accepted} won · ${data.cohort.declined + data.cohort.expired} lost`
                        : 'No answers yet'
                    }
                    accent="text-violet-700"
                  />
                  <Figure label="Offers sent" value={data.cohort.sent} hint={`${data.cohort.open} still open`} />
                  <Figure label="Average offer" value={money(data.cohort.averageOffer)} />
                  <Figure label="Time to yes" value={duration(data.medianAnswerHours)} hint="Typical, sent to accepted" />
                  <Figure label="Requests in" value={data.leads} accent="text-amber-600" />
                  <Figure
                    label="Expired"
                    value={data.cohort.expired}
                    hint="Ran out without an answer"
                    accent={data.cohort.expired > 0 ? 'text-rose-600' : undefined}
                  />
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              <Panel
                title="Waiting on you"
                hint={
                  onYourDesk > 0
                    ? 'Accepted offers to confirm, and new requests to answer'
                    : 'Accepted offers and new requests land here'
                }
                bodyClassName="py-2"
              >
                {onYourDesk === 0 ? (
                  <EmptyNote>
                    <CheckCircleIcon className="mx-auto mb-1 block h-6 w-6 text-emerald-500" />
                    Nothing waiting on you.
                  </EmptyNote>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {data.toVerify.map((o) => (
                      <ListRow
                        key={`o${o.id}`}
                        href={`${base}/pipeline?offer=${o.id}`}
                        title={o.name}
                        badge={<Badge tone="green">Accepted</Badge>}
                        detail={`Accepted ${ago(o.at)}${o.date ? ` · wants ${formatShort(o.date)}` : ''}`}
                        value={o.value > 0 ? money(o.value) : undefined}
                      />
                    ))}
                    {data.newLeads.map((l) => (
                      <ListRow
                        key={`l${l.id}`}
                        href={`${base}/pipeline?lead=${l.id}`}
                        title={l.name}
                        badge={<Badge tone="amber">New request</Badge>}
                        detail={`${sourceLabel(l.source || 'manual')} · ${ago(l.at)}`}
                      />
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title="Waiting on the client"
                hint="Sent offers without an answer yet, oldest first"
                right={
                  data.waiting.length > 0 ? (
                    <TextAction icon={FunnelIcon} href={`${base}/offers`}>
                      All offers
                    </TextAction>
                  ) : undefined
                }
                bodyClassName="py-2"
              >
                {data.waiting.length === 0 ? (
                  <EmptyNote>No offers waiting for an answer.</EmptyNote>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {data.waiting.map((o) => (
                      <ListRow
                        key={o.id}
                        href={`${base}/pipeline?offer=${o.id}`}
                        title={o.name}
                        badge={o.expired ? <Badge tone="rose">Expired</Badge> : undefined}
                        detail={`Sent ${ago(o.sentAt)} · ${o.viewed ? 'Seen' : 'Not opened yet'}`}
                        value={o.value > 0 ? money(o.value) : undefined}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              <Panel title="Where requests come from" hint={`Requests in ${period.label}`}>
                {!data.leadsEnabled && (
                  <div className="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 p-3">
                    <InboxArrowDownIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-amber-900">Your lead form is off</p>
                      <p className="mt-0.5 text-xs text-amber-800">
                        Put it on your website and requests land straight in your pipeline.
                      </p>
                      <Link
                        href={`${base}/settings/leads-form`}
                        className="mt-1.5 inline-block text-xs font-semibold text-amber-900 underline-offset-2 hover:underline"
                      >
                        Set up the lead form
                      </Link>
                    </div>
                  </div>
                )}
                {data.sources.length === 0 ? (
                  <EmptyNote>No requests in this period.</EmptyNote>
                ) : (
                  <ul className="space-y-3.5">
                    {[...data.sources]
                      .sort((a, b) => b.leads - a.leads)
                      .map((s) => (
                        <li key={s.source}>
                          <div className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="font-semibold text-gray-600">{sourceLabel(s.source)}</span>
                            <span className="tabular-nums text-gray-500">
                              {s.leads} · {Math.round((s.leads / Math.max(1, totalSources)) * 100)}%
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-amber-400 transition-[width] duration-700"
                              style={{ width: `${(s.leads / Math.max(1, totalSources)) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Lost offers" hint={`Declined in ${period.label}, with the reason the client gave`} bodyClassName="py-2">
                {data.lost.length === 0 ? (
                  <EmptyNote>No declined offers in this period.</EmptyNote>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {data.lost.map((o) => (
                      <ListRow
                        key={o.id}
                        href={`${base}/pipeline?offer=${o.id}`}
                        title={o.name}
                        detail={
                          o.reason ? (
                            <span className="italic">&ldquo;{o.reason}&rdquo;</span>
                          ) : (
                            `Declined ${ago(o.at)} · no reason given`
                          )
                        }
                        value={o.value > 0 ? money(o.value) : undefined}
                      />
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        )}
      </InsightsPage>
    </AppLayout>
  )
}
