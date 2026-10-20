'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { adminFetch, useAdminData } from '../_lib/api'
import { eventCategory, eventLabel } from '../_lib/events'
import type { ActivityEvent, EventPage } from '../_lib/types'
import { Card, ErrorBox, PageHeader, Spinner, Timeline } from '../_components/ui'

interface EventNames {
  events: Array<{ event: string; count: number; lastAt: string }>
}

const REFRESH_MS = 15000

export default function ActivityPage() {
  const names = useAdminData<EventNames>('/admin/insights/event-names')
  const [event, setEvent] = useState('')
  const [actionsOnly, setActionsOnly] = useState(false)
  const [pageViews, setPageViews] = useState(false)
  const [live, setLive] = useState(true)

  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const query = useMemo(() => {
    const q = new URLSearchParams({ limit: '100' })
    if (event) q.set('event', event)
    if (actionsOnly) q.set('actionsOnly', '1')
    if (pageViews) q.set('pageViews', '1')
    return q.toString()
  }, [event, actionsOnly, pageViews])

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const page = await adminFetch<EventPage>(`/admin/insights/events?${query}`)
      setEvents(page.events)
      setNextBefore(page.nextBefore)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!live) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, REFRESH_MS)
    return () => clearInterval(t)
  }, [live, load])

  const loadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    setLive(false)
    try {
      const page = await adminFetch<EventPage>(`/admin/insights/events?${query}&before=${encodeURIComponent(nextBefore)}`)
      setEvents((prev) => [...prev, ...page.events])
      setNextBefore(page.nextBefore)
    } finally {
      setLoadingMore(false)
    }
  }

  const groups = useMemo(() => {
    const byCategory = new Map<string, string[]>()
    for (const n of names.data?.events || []) {
      const cat = n.event.split('.')[0]
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat)!.push(n.event)
    }
    return Array.from(byCategory.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [names.data])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        subtitle="Every event as it happens, across all companies. Data imported from before tracking started is hidden here."
      />

      <Card
        title={
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-700"
            >
              <option value="">All events</option>
              {groups.map(([cat, list]) => (
                <optgroup key={cat} label={eventCategory(`${cat}.x`).label}>
                  <option value={`${cat}.*`}>All {eventCategory(`${cat}.x`).label.toLowerCase()}</option>
                  {list.map((ev) => <option key={ev} value={ev}>{eventLabel(ev)}</option>)}
                </optgroup>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-gray-600">
              <input type="checkbox" checked={actionsOnly} onChange={(e) => setActionsOnly(e.target.checked)} className="rounded border-gray-300" />
              Only real actions
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-gray-600">
              <input type="checkbox" checked={pageViews} onChange={(e) => setPageViews(e.target.checked)} className="rounded border-gray-300" />
              Page views
            </label>
          </div>
        }
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-gray-600">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="rounded border-gray-300" />
              Live
              {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
            </label>
            <button type="button" onClick={() => void load()} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" title="Refresh">
              <ArrowPathIcon className="h-4 w-4" />
            </button>
          </>
        }
      >
        {error && <ErrorBox message={error} />}
        {loading ? <Spinner /> : (
          <Timeline events={events} nextBefore={nextBefore} onLoadMore={loadMore} loadingMore={loadingMore} />
        )}
      </Card>
    </div>
  )
}
