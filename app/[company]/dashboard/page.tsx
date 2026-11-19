'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import AppLayout from '../../components/AppLayout'
import { useUser } from '../../hooks/useUser'
import PeriodSelector from '../../components/insights/PeriodSelector'
import { usePeriod } from '../../components/insights/period'
import { useInsights, useMoneyFormatter, type DashboardData } from '../../components/insights/useInsights'
import { ErrorNote, Skeleton } from '../../components/insights/ui'
import EarnedHero from '../../components/dashboard/EarnedHero'
import RightNow, { attentionItems } from '../../components/dashboard/RightNow'
import { ClientsCard, JobsCard, SalesCard, SubscriptionsCard, TeamCard } from '../../components/dashboard/AreaCards'
import { requestGuidesRefresh } from '../../config/guideEvents'

const AddClientModal = dynamic(() => import('../../components/AddClientModal'), { ssr: false })
const CreateJob = dynamic(() => import('../../components/CreateJob'), { ssr: false })

type Composer = 'client' | 'job' | 'subscription' | null

function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Skeleton className="h-[420px] lg:col-span-2" />
        <Skeleton className="h-[420px]" />
      </div>
      <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
        <Skeleton className="h-[330px]" />
        <Skeleton className="h-[330px]" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser()
  const params = useParams()
  const companySlug = (params?.company as string) || ''
  const base = `/${companySlug}`

  const [period, setPeriod, periodReady] = usePeriod()
  const [composer, setComposer] = useState<Composer>(null)
  const money = useMoneyFormatter()

  const { data, loading, error, reload } = useInsights<DashboardData>(
    '/insights/dashboard',
    { from: period.from, to: period.to },
    periodReady
  )

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    const name = user?.firstName ? `, ${user.firstName}` : ''
    if (hour < 5) return `Working late${name}?`
    if (hour < 11) return `Good morning${name}`
    if (hour < 18) return `Good afternoon${name}`
    return `Good evening${name}`
  }, [user?.firstName])

  if (userLoading) {
    return (
      <AppLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  if (!user) return null

  const companyName = (user.activeCompany as { name?: string } | null)?.name || 'your company'
  const fresh =
    data != null &&
    data.clients.total === 0 &&
    data.setup.jobs === 0 &&
    data.subscriptions.active === 0 &&
    !data.sales.everUsed
  const needsYouFirst =
    data != null && (data.today.jobs > 0 || attentionItems(data.attention, base, money).length > 0)

  const created = () => {
    setComposer(null)
    requestGuidesRefresh()
    reload()
  }

  return (
    <AppLayout>
      <div className="space-y-4 pb-8 sm:space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{greeting}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {fresh
                ? `Welcome to PathPilo. This is where ${companyName} comes together — it fills in as you work.`
                : `Here is how ${companyName} is doing.`}
            </p>
          </div>
          {!fresh && <PeriodSelector period={period} onChange={setPeriod} />}
        </header>

        {error && !data && <ErrorNote message={error} onRetry={reload} />}

        {!data ? (
          !error && <DashboardSkeleton />
        ) : (
          <div className={`space-y-4 transition-opacity duration-200 sm:space-y-5 ${loading ? 'opacity-60' : ''}`}>
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
              <EarnedHero
                className="lg:col-span-2"
                earned={data.earned}
                unit={data.range.unit}
                period={period}
                base={base}
                money={money}
                hasJobs={data.setup.jobs > 0}
                onNewJob={() => setComposer('job')}
              />
              <RightNow
                className={needsYouFirst ? 'order-first lg:order-none' : ''}
                today={data.today}
                attention={data.attention}
                base={base}
                fresh={fresh}
                money={money}
                onNewJob={() => setComposer('job')}
              />
            </div>

            <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
              <JobsCard
                jobs={data.jobs}
                today={data.today}
                unit={data.range.unit}
                period={period}
                base={base}
                hasJobs={data.setup.jobs > 0}
                onNewJob={() => setComposer('job')}
              />
              <ClientsCard
                clients={data.clients}
                unit={data.range.unit}
                period={period}
                base={base}
                onNewClient={() => setComposer('client')}
              />
              <SubscriptionsCard
                subscriptions={data.subscriptions}
                unit={data.range.unit}
                base={base}
                money={money}
                onNewSubscription={() => setComposer('subscription')}
              />
              <SalesCard sales={data.sales} unit={data.range.unit} period={period} base={base} money={money} />
              {data.team.size > 1 && (
                <TeamCard
                  className="md:col-span-2"
                  members={data.team.members}
                  period={period}
                  base={base}
                  money={money}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {composer === 'client' && (
        <AddClientModal isOpen onClose={() => setComposer(null)} onClientAdded={created} />
      )}

      {(composer === 'job' || composer === 'subscription') && (
        <CreateJob isOpen mode={composer} onClose={() => setComposer(null)} onJobCreated={created} />
      )}
    </AppLayout>
  )
}
