'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeftIcon, TrashIcon } from '@heroicons/react/24/outline'
import { adminFetch, useAdminData } from '../../_lib/api'
import { STAGES } from '../../_lib/events'
import type { ActivityEvent, DayCell, EventPage } from '../../_lib/types'
import {
  Card, Chip, DayCalendar, ErrorBox, HeatLegend, Kpi, PageHeader, Spinner, Timeline,
  formatDate, formatDateTime, timeAgo,
} from '../../_components/ui'

interface UserDetail extends EventPage {
  user: { id: number; name: string; email: string; languageCode: string; signedUpAt: string; lastLoginAt: string | null; lastActiveAt: string | null }
  companies: Array<{ id: number; name: string; slug: string; plan: string; role: string; onboardingCompleted: boolean; onboardingStep: string; createdAt: string; hasJob: boolean }>
  stats: { sessions: number; logins: number; actions: number; pageViews: number; activeDays: number; firstSeen: string | null; lastSeen: string | null }
  daily: DayCell[]
}

interface SignupDetail extends EventPage {
  signup: { id: number; name: string; email: string; step: string; stage: string; startedAt: string; lastActiveAt: string; userId: number | null }
}

function BackLink() {
  return (
    <Link href="/admin/people" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
      <ArrowLeftIcon className="h-4 w-4" /> People
    </Link>
  )
}

function UserView({ userId }: { userId: number }) {
  const router = useRouter()
  const [pageViews, setPageViews] = useState(false)
  const { data, loading, error } = useAdminData<UserDetail>(`/admin/insights/people/user/${userId}${pageViews ? '?pageViews=1' : ''}`)
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!data) return
    setEvents(data.events)
    setNextBefore(data.nextBefore)
  }, [data])

  const loadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    try {
      const more = await adminFetch<UserDetail>(
        `/admin/insights/people/user/${userId}?before=${encodeURIComponent(nextBefore)}${pageViews ? '&pageViews=1' : ''}`
      )
      setEvents((prev) => [...prev, ...more.events])
      setNextBefore(more.nextBefore)
    } finally {
      setLoadingMore(false)
    }
  }

  const deleteUser = async () => {
    if (!data) return
    const typed = window.prompt(
      `This permanently deletes ${data.user.email} and every company they own (with all clients, jobs and invoices).\n\nType the email to confirm:`
    )
    if (!typed || typed.trim().toLowerCase() !== data.user.email.toLowerCase()) return
    setDeleting(true)
    try {
      await adminFetch(`/admin/users/${userId}`, { method: 'DELETE' })
      router.push('/admin/people')
    } catch (err) {
      alert((err as Error).message)
      setDeleting(false)
    }
  }

  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null

  const { user, stats, companies } = data
  const owner = companies.find((c) => c.role === 'owner')
  let stage = 'no_company'
  if (owner) {
    if (!owner.onboardingCompleted) stage = owner.onboardingStep === 'goals' ? 'goals' : 'company'
    else stage = owner.hasJob ? 'activated' : 'onboarded'
  }
  else if (companies.length) stage = 'team'

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {user.name}
            {STAGES[stage] && <Chip className={STAGES[stage].chip}>{STAGES[stage].label}</Chip>}
          </span>
        }
        subtitle={<>{user.email} · signed up {formatDateTime(user.signedUpAt)} · last active {timeAgo(user.lastActiveAt)}</>}
        actions={
          <button
            type="button"
            onClick={deleteUser}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <TrashIcon className="h-4 w-4" /> {deleting ? 'Deleting…' : 'Delete user'}
          </button>
        }
      />

      {companies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <Link
              key={c.id}
              href={`/admin/companies/${c.id}`}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-gray-300"
            >
              <span className="font-semibold text-gray-900">{c.name}</span>
              <span className="text-xs capitalize text-gray-400">{c.role}</span>
              <Chip className={c.plan === 'pro' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-gray-50 text-gray-600 ring-gray-200'}>
                {c.plan === 'pro' ? 'Company' : 'Solo'}
              </Chip>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Sessions" value={stats.sessions} hint="visits 30+ min apart" />
        <Kpi label="Password logins" value={stats.logins} />
        <Kpi label="Actions" value={stats.actions} hint="database changes" accent="text-emerald-700" />
        <Kpi label="Active days" value={stats.activeDays} />
        <Kpi label="First seen" value={<span className="text-base">{formatDate(stats.firstSeen || user.signedUpAt)}</span>} />
        <Kpi label="Last seen" value={<span className="text-base">{timeAgo(stats.lastSeen || user.lastActiveAt)}</span>} />
      </div>

      <Card title="Last 90 days" subtitle="One square per day" actions={<HeatLegend />}>
        <DayCalendar daily={data.daily} />
      </Card>

      <Card
        title="Timeline"
        subtitle="Everything this person did, newest first: signup steps, sessions and every change they made"
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-600">
            <input type="checkbox" checked={pageViews} onChange={(e) => setPageViews(e.target.checked)} className="rounded border-gray-300" />
            Show page views
          </label>
        }
      >
        <Timeline events={events} showUser={false} nextBefore={nextBefore} onLoadMore={loadMore} loadingMore={loadingMore} />
      </Card>
    </div>
  )
}

function SignupView({ draftId }: { draftId: number }) {
  const { data, loading, error } = useAdminData<SignupDetail>(`/admin/insights/people/signup/${draftId}`)
  if (loading && !data) return <Spinner />
  if (error) return <ErrorBox message={error} />
  if (!data) return null
  const s = data.signup
  const st = STAGES[s.stage]
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{s.name}{st && <Chip className={st.chip}>{st.label}</Chip>}</span>}
        subtitle={<>{s.email} · started {formatDateTime(s.startedAt)} · last seen {timeAgo(s.lastActiveAt)} · no account yet</>}
      />
      <Card title="Timeline" subtitle="Signup steps from this browser. If they come back to the signup form it shows up here.">
        <Timeline events={data.events} showUser={false} showCompany={false} />
        {data.events.length === 0 && (
          <p className="mt-2 text-center text-xs text-gray-400">
            This signup started before step-by-step tracking existed. Last recorded step: {s.step.replace(/_/g, ' ')}.
          </p>
        )}
      </Card>
    </div>
  )
}

export default function PersonPage() {
  const params = useParams()
  const key = String(params?.key || '')
  const [kind, rawId] = [key.slice(0, 1), Number(key.slice(2))]
  if (!rawId) return <ErrorBox message="Unknown person" />
  return kind === 's' ? <SignupView draftId={rawId} /> : <UserView userId={rawId} />
}
