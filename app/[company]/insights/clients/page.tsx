'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { PhoneIcon, UserGroupIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import AppLayout from '../../../components/AppLayout'
import {
  HeroPanel,
  InsightsPage,
  InsightsSkeleton,
  useCompanyBase,
  useScrollToHash,
} from '../../../components/insights/InsightsPage'
import { formatShort, usePeriod } from '../../../components/insights/period'
import { useInsights, useMoneyFormatter, type ClientsData } from '../../../components/insights/useInsights'
import { ClientsChart, clientsLegend } from '../../../components/insights/charts'
import {
  BigNumber,
  ChartLegend,
  EmptyNote,
  ErrorNote,
  GhostChart,
  ListRow,
  Panel,
  TextAction,
  plural,
} from '../../../components/insights/ui'
import { requestGuidesRefresh } from '../../../config/guideEvents'

const AddClientModal = dynamic(() => import('../../../components/AddClientModal'), { ssr: false })

function BusinessBadge() {
  return <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">Business</span>
}

/** One share of the client book as a labelled bar. */
function Share({
  label,
  value,
  total,
  hint,
  bar,
  href,
}: {
  label: string
  value: number
  total: number
  hint: string
  bar: string
  href?: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        <span className="text-sm font-bold tabular-nums text-gray-900">
          {value.toLocaleString('en-GB')} <span className="text-xs font-medium text-gray-400">· {pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${bar} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{hint}</p>
    </>
  )
  return href ? (
    <Link href={href} className="-m-2 block rounded-xl p-2 transition-colors hover:bg-gray-50">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  )
}

export default function ClientsInsightsPage() {
  const base = useCompanyBase()
  const [period, setPeriod, ready] = usePeriod()
  const [adding, setAdding] = useState(false)
  const money = useMoneyFormatter()
  const { data, loading, error, reload } = useInsights<ClientsData>(
    '/insights/clients',
    { from: period.from, to: period.to },
    ready
  )
  useScrollToHash(Boolean(data))

  const maxPlace = data ? Math.max(1, ...data.places.map((p) => p.clients)) : 1
  const maxTop = data ? Math.max(1, ...data.topClients.map((c) => c.earned)) : 1

  return (
    <AppLayout>
      <InsightsPage
        section="clients"
        title="Clients"
        subtitle="How your client book grows, who matters most, and who has gone quiet."
        period={period}
        onPeriod={setPeriod}
        actions={
          <>
            <TextAction primary icon={UserPlusIcon} onClick={() => setAdding(true)}>
              New client
            </TextAction>
            <TextAction icon={UserGroupIcon} href={`${base}/clients`}>
              All clients
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
                eyebrow="Client book"
                figure={<BigNumber muted={data.total === 0}>{data.total.toLocaleString('en-GB')}</BigNumber>}
                sub={
                  data.total === 0 ? undefined : data.added > 0 ? (
                    <>
                      <span className="font-semibold text-teal-700">+{data.added}</span> new in {period.label}
                    </>
                  ) : (
                    `No new clients in ${period.label}`
                  )
                }
                legend={data.total > 0 ? <ChartLegend items={clientsLegend} /> : undefined}
              >
                {data.total === 0 ? (
                  <GhostChart
                    variant="area"
                    message="Add the people you work for, and watch your client book grow here."
                    action={
                      <TextAction primary icon={UserPlusIcon} onClick={() => setAdding(true)}>
                        Add your first client
                      </TextAction>
                    }
                  />
                ) : (
                  <ClientsChart series={data.series} unit={data.range.unit} detailed />
                )}
              </HeroPanel>

              <Panel title="Your book today" hint="Out of every client you have">
                {data.total === 0 ? (
                  <EmptyNote>No clients yet.</EmptyNote>
                ) : (
                  <div className="space-y-4">
                    <Share
                      label="Active"
                      value={data.activeLastYear}
                      total={data.total}
                      hint="Work done or booked in the last 12 months"
                      bar="bg-teal-500"
                    />
                    <Share
                      label="On a subscription"
                      value={data.withSubscription}
                      total={data.total}
                      hint="Visits that plan themselves"
                      bar="bg-sky-400"
                      href={`${base}/insights/subscriptions`}
                    />
                    <Share
                      label="Gone quiet"
                      value={data.goneQuiet.count}
                      total={data.total}
                      hint="Paid before, nothing for six months"
                      bar="bg-amber-400"
                      href={data.goneQuiet.count > 0 ? '#gone-quiet' : undefined}
                    />
                    <Share
                      label="Businesses"
                      value={data.companies}
                      total={data.total}
                      hint={`${plural(data.total - data.companies, 'private client')}`}
                      bar="bg-gray-400"
                    />
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              <Panel title="Biggest clients" hint={`By completed work in ${period.label}`} bodyClassName="py-2">
                {data.topClients.length === 0 ? (
                  <EmptyNote>No completed work in this period.</EmptyNote>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {data.topClients.map((c, i) => (
                      <li key={c.id}>
                        <Link
                          href={`${base}/clients/${c.id}`}
                          className="group/row flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-gray-50"
                        >
                          <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-gray-300">{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[13px] font-semibold text-gray-900">{c.name}</span>
                              {c.clientType === 'company' && <BusinessBadge />}
                            </span>
                            <span className="mt-1 block h-1 rounded-full bg-gray-100">
                              <span
                                className="block h-1 rounded-full bg-teal-400"
                                style={{ width: `${(c.earned / maxTop) * 100}%` }}
                              />
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[13px] font-semibold tabular-nums text-gray-900">{money(c.earned)}</span>
                            <span className="block text-[11px] text-gray-400">{plural(c.jobs, 'job')}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                id="gone-quiet"
                title="Gone quiet"
                hint="Paid work before, nothing in six months, nothing booked. Worth a call."
                bodyClassName="py-2"
              >
                {data.goneQuiet.list.length === 0 ? (
                  <EmptyNote>Nobody has gone quiet. Your regulars keep coming back.</EmptyNote>
                ) : (
                  <>
                    <ul className="divide-y divide-gray-50">
                      {data.goneQuiet.list.map((c) => (
                        <ListRow
                          key={c.id}
                          href={`${base}/clients/${c.id}`}
                          title={c.name}
                          detail={`${c.lastJob ? `Last visit ${formatShort(c.lastJob)}` : 'No recent visit'} · ${plural(c.jobs, 'job')}`}
                          value={money(c.lifetime)}
                          valueHint="all time"
                        />
                      ))}
                    </ul>
                    {data.goneQuiet.count > data.goneQuiet.list.length && (
                      <p className="flex items-center gap-1.5 px-5 pb-2 pt-3 text-xs text-gray-400">
                        <PhoneIcon className="h-3.5 w-3.5" />
                        {data.goneQuiet.count - data.goneQuiet.list.length} more not shown
                      </p>
                    )}
                  </>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              <Panel title="Newest clients" hint="The latest additions to your book" bodyClassName="py-2">
                {data.newest.length === 0 ? (
                  <EmptyNote>No clients yet.</EmptyNote>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {data.newest.map((c) => (
                      <ListRow
                        key={c.id}
                        href={`${base}/clients/${c.id}`}
                        title={c.name}
                        badge={c.clientType === 'company' ? <BusinessBadge /> : undefined}
                        detail={`Added ${formatShort(c.added)}`}
                      />
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Where they are" hint="Clients per town. Close together means tighter routes.">
                {data.places.length === 0 ? (
                  <EmptyNote>No addresses yet.</EmptyNote>
                ) : (
                  <ul className="space-y-2.5">
                    {data.places.map((p) => (
                      <li key={p.city} className="flex items-center gap-3 text-xs">
                        <span className="w-28 shrink-0 truncate font-semibold text-gray-600">{p.city}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <span
                            className="block h-full rounded-full bg-teal-400 transition-[width] duration-700"
                            style={{ width: `${(p.clients / maxPlace) * 100}%` }}
                          />
                        </span>
                        <span className="w-8 shrink-0 text-right tabular-nums text-gray-500">{p.clients}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        )}
      </InsightsPage>

      {adding && (
        <AddClientModal
          isOpen
          onClose={() => setAdding(false)}
          onClientAdded={() => {
            setAdding(false)
            requestGuidesRefresh()
            reload()
          }}
        />
      )}
    </AppLayout>
  )
}
