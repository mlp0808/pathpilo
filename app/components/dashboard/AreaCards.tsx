'use client'

import type { ReactNode } from 'react'
import {
  AdjustmentsHorizontalIcon,
  ArrowPathRoundedSquareIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  FunnelIcon,
  MegaphoneIcon,
  PaperAirplaneIcon,
  PlusIcon,
  UserGroupIcon,
  UserPlusIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import {
  BigNumber,
  Card,
  CardFooter,
  CardHeader,
  ChartLegend,
  GhostChart,
  TextAction,
  plural,
  type Icon,
  type LegendItem,
  type Tone,
} from '../insights/ui'
import {
  ClientsChart,
  JobsChart,
  SalesChart,
  SubscriptionsChart,
  clientsLegend,
  jobsLegend,
  salesLegend,
  seriesIsEmpty,
} from '../insights/charts'
import type { BucketUnit, Period } from '../insights/period'
import type {
  ClientsBlock,
  JobsBlock,
  SalesBlock,
  SubscriptionsBlock,
  TeamMember,
  TodayBlock,
} from '../insights/useInsights'

/** One area of the business: a headline number, its trend, and two ways in. */
function AreaCard({
  href,
  icon,
  tone,
  title,
  subtitle,
  figure,
  aside,
  chart,
  legend,
  actions,
}: {
  href: string
  icon: Icon
  tone: Tone
  title: string
  subtitle: string
  figure: ReactNode
  aside?: ReactNode
  chart: ReactNode
  legend?: LegendItem[]
  actions: ReactNode
}) {
  return (
    <Card href={href} label={`Open ${title.toLowerCase()} stats`} className="flex flex-col">
      <div className="px-5 pt-5">
        <CardHeader icon={icon} tone={tone} title={title} subtitle={subtitle} linked />
        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="min-w-0">{figure}</div>
          {aside && <div className="shrink-0 text-right">{aside}</div>}
        </div>
      </div>
      <div className="mt-3 h-36 px-3">{chart}</div>
      <div className="min-h-[28px] px-5 pb-3 pt-2">{legend && <ChartLegend items={legend} />}</div>
      <CardFooter>{actions}</CardFooter>
    </Card>
  )
}

function Aside({ value, label }: { value: ReactNode; label: string }) {
  return (
    <>
      <p className="text-[15px] font-semibold tabular-nums text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-400">{label}</p>
    </>
  )
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="mt-2 truncate text-xs text-gray-500">{children}</p>
}

export function JobsCard({
  jobs,
  today,
  unit,
  period,
  base,
  hasJobs,
  onNewJob,
}: {
  jobs: JobsBlock
  today: TodayBlock
  unit: BucketUnit
  period: Period
  base: string
  hasJobs: boolean
  onNewJob: () => void
}) {
  const empty = seriesIsEmpty(jobs.series, ['done', 'open', 'planned', 'booked'])
  return (
    <AreaCard
      href={`${base}/insights/jobs`}
      icon={ClipboardDocumentListIcon}
      tone="indigo"
      title="Jobs"
      subtitle={`Visits · ${period.short}`}
      figure={
        <>
          <BigNumber size="md" muted={!hasJobs}>
            {jobs.done.toLocaleString('en-GB')}
          </BigNumber>
          <Sub>
            {jobs.done === 1 ? 'visit done' : 'visits done'}
            {jobs.open > 0 && <span className="font-medium text-amber-600"> · {jobs.open} not marked done</span>}
          </Sub>
        </>
      }
      aside={hasJobs ? <Aside value={today.nextWeek} label="booked next 7 days" /> : undefined}
      chart={
        empty ? (
          <GhostChart
            message={
              hasJobs
                ? `No visits in ${period.label}.`
                : 'Book jobs and mark them done — your work shows up here, week by week.'
            }
          />
        ) : (
          <JobsChart series={jobs.series} unit={unit} />
        )
      }
      legend={empty ? undefined : jobsLegend(jobs.series)}
      actions={
        <>
          <TextAction primary icon={PlusIcon} onClick={onNewJob}>
            New job
          </TextAction>
          <TextAction icon={CalendarDaysIcon} href={`${base}/jobs`}>
            Schedule
          </TextAction>
        </>
      }
    />
  )
}

export function ClientsCard({
  clients,
  unit,
  period,
  base,
  onNewClient,
}: {
  clients: ClientsBlock
  unit: BucketUnit
  period: Period
  base: string
  onNewClient: () => void
}) {
  const empty = clients.total === 0
  return (
    <AreaCard
      href={`${base}/insights/clients`}
      icon={UserGroupIcon}
      tone="teal"
      title="Clients"
      subtitle="Your client book"
      figure={
        <>
          <BigNumber size="md" muted={empty}>
            {clients.total.toLocaleString('en-GB')}
          </BigNumber>
          <Sub>
            {clients.added > 0 ? (
              <>
                <span className="font-semibold text-teal-700">+{clients.added}</span> new in {period.label}
              </>
            ) : empty ? (
              'clients'
            ) : (
              `No new clients in ${period.label}`
            )}
          </Sub>
        </>
      }
      aside={
        clients.companies > 0 ? (
          <Aside value={clients.companies} label={clients.companies === 1 ? 'business' : 'businesses'} />
        ) : undefined
      }
      chart={
        empty ? (
          <GhostChart variant="area" message="Add the people you work for, and watch your client book grow here." />
        ) : (
          <ClientsChart series={clients.series} unit={unit} />
        )
      }
      legend={empty ? undefined : clientsLegend}
      actions={
        <>
          <TextAction primary icon={UserPlusIcon} onClick={onNewClient}>
            New client
          </TextAction>
          <TextAction icon={UserGroupIcon} href={`${base}/clients`}>
            All clients
          </TextAction>
        </>
      }
    />
  )
}

export function SubscriptionsCard({
  subscriptions,
  unit,
  base,
  money,
  onNewSubscription,
}: {
  subscriptions: SubscriptionsBlock
  unit: BucketUnit
  base: string
  money: (n: number) => string
  onNewSubscription: () => void
}) {
  const empty = subscriptions.active === 0 && subscriptions.paused === 0 && seriesIsEmpty(subscriptions.series, ['value'])
  return (
    <AreaCard
      href={`${base}/insights/subscriptions`}
      icon={ArrowPathRoundedSquareIcon}
      tone="sky"
      title="Subscriptions"
      subtitle="Income that repeats by itself"
      figure={
        <>
          <div className="flex items-baseline gap-1.5">
            <BigNumber size="md" muted={empty}>
              {money(subscriptions.monthlyValue)}
            </BigNumber>
            <span className="text-xs font-medium text-gray-400">/ month</span>
          </div>
          <Sub>
            {plural(subscriptions.active, 'subscription')} running
            {subscriptions.paused > 0 && ` · ${subscriptions.paused} paused`}
          </Sub>
        </>
      }
      aside={
        subscriptions.monthlyValue > 0 ? (
          <Aside value={money(subscriptions.monthlyValue * 12)} label="a year" />
        ) : undefined
      }
      chart={
        empty ? (
          <GhostChart
            variant="area"
            message="Regular customers? Put them on a subscription and their visits plan themselves."
          />
        ) : (
          <SubscriptionsChart series={subscriptions.series} unit={unit} money={money} />
        )
      }
      legend={empty ? undefined : [{ label: 'Value per month', color: '#0284c7', kind: 'line' }]}
      actions={
        <>
          <TextAction primary icon={PlusIcon} onClick={onNewSubscription}>
            New subscription
          </TextAction>
          <TextAction icon={ArrowPathRoundedSquareIcon} href={`${base}/recurring/subscriptions`}>
            Subscriptions
          </TextAction>
        </>
      }
    />
  )
}

export function SalesCard({
  sales,
  unit,
  period,
  base,
  money,
}: {
  sales: SalesBlock
  unit: BucketUnit
  period: Period
  base: string
  money: (n: number) => string
}) {
  const quiet = seriesIsEmpty(sales.series, ['leads', 'sent', 'accepted'])
  return (
    <AreaCard
      href={`${base}/insights/sales`}
      icon={MegaphoneIcon}
      tone="violet"
      title="Sales"
      subtitle={`Requests and offers · ${period.short}`}
      figure={
        <>
          <BigNumber size="md" muted={!sales.everUsed}>
            {sales.accepted}
          </BigNumber>
          <Sub>
            {sales.accepted === 1 ? 'offer won' : 'offers won'}
            {sales.acceptedValue > 0 && ` · ${money(sales.acceptedValue)}`}
          </Sub>
        </>
      }
      aside={sales.everUsed ? <Aside value={sales.leads} label={sales.leads === 1 ? 'new request' : 'new requests'} /> : undefined}
      chart={
        quiet ? (
          <GhostChart
            message={
              sales.everUsed
                ? `No requests or offers in ${period.label}.`
                : 'Win new work: send offers clients accept online, and collect requests from your website.'
            }
          />
        ) : (
          <SalesChart series={sales.series} unit={unit} />
        )
      }
      legend={quiet ? undefined : salesLegend}
      actions={
        <>
          <TextAction primary icon={PaperAirplaneIcon} href={`${base}/pipeline?new=1`}>
            New offer
          </TextAction>
          {sales.leadsEnabled || sales.everUsed ? (
            <TextAction icon={FunnelIcon} href={`${base}/pipeline`}>
              Pipeline
            </TextAction>
          ) : (
            <TextAction icon={AdjustmentsHorizontalIcon} href={`${base}/settings/leads-form`}>
              Set up lead form
            </TextAction>
          )}
        </>
      }
    />
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase() || '?'
}

export function TeamCard({
  members,
  period,
  base,
  money,
  className = '',
}: {
  members: TeamMember[]
  period: Period
  base: string
  money: (n: number) => string
  className?: string
}) {
  const max = Math.max(1, ...members.map((m) => m.done))
  return (
    <Card href={`${base}/insights/jobs#team`} label="Open team stats" className={`flex flex-col ${className}`}>
      <div className="px-5 pt-5">
        <CardHeader icon={UsersIcon} tone="amber" title="Team" subtitle={`Who did the work · ${period.short}`} linked />
      </div>
      <ul className="grid gap-x-8 gap-y-3 px-5 py-4 sm:grid-cols-2">
        {members.slice(0, 8).map((m) => (
          <li key={m.userId} className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-[11px] font-bold text-amber-700">
              {initials(m.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-semibold text-gray-900">{m.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-gray-500">
                  {m.done} done{m.earned > 0 ? ` · ${money(m.earned)}` : ''}
                </span>
              </span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-gray-100">
                <span
                  className="block h-full rounded-full bg-amber-400 transition-[width] duration-700"
                  style={{ width: `${(m.done / max) * 100}%` }}
                />
              </span>
            </span>
          </li>
        ))}
      </ul>
      <CardFooter>
        <TextAction primary icon={UsersIcon} href={`${base}/team`}>
          Manage team
        </TextAction>
        <TextAction icon={ChartBarIcon} href={`${base}/insights/jobs#team`}>
          Job stats
        </TextAction>
      </CardFooter>
    </Card>
  )
}
