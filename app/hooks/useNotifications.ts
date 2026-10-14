'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { apiUrl } from '../utils/api'

export type AppNotification = {
  id: number
  type: 'lead.new' | 'offer.viewed' | 'offer.accepted' | 'offer.declined' | string
  entity_type: 'lead' | 'offer' | null
  entity_id: number | null
  meta: {
    name?: string
    number?: string
    total?: number
    date?: string | null
    city?: string
    message?: string
    reason?: string | null
  }
  created_at: string
  read: boolean
}

export type Attention = { leads: number; offers: number; bookings: number }

type State = {
  items: AppNotification[]
  unread: number
  attention: Attention
  loaded: boolean
}

const POLL_MS = 30_000
const EMPTY: State = { items: [], unread: 0, attention: { leads: 0, offers: 0, bookings: 0 }, loaded: false }

// One poll per tab, shared by every bell, badge and toast.
let state: State = EMPTY
const listeners = new Set<() => void>()
let timer: number | null = null
let mounted = 0
let inflight: Promise<void> | null = null

function emit(next: State) {
  state = next
  listeners.forEach(l => l())
}

function authHeaders(json = false): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) }
}

export function refreshNotifications(): Promise<void> {
  if (typeof window === 'undefined' || !localStorage.getItem('token')) return Promise.resolve()
  if (inflight) return inflight
  inflight = fetch(apiUrl('/notifications?limit=40'), { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      if (!data) return
      emit({
        items: Array.isArray(data.notifications) ? data.notifications : [],
        unread: Number(data.unread) || 0,
        attention: data.attention || EMPTY.attention,
        loaded: true,
      })
    })
    .catch(() => {})
    .finally(() => {
      inflight = null
    })
  return inflight
}

export async function markNotificationRead(id: number) {
  const target = state.items.find(n => n.id === id)
  if (!target || target.read) return
  emit({
    ...state,
    items: state.items.map(n => (n.id === id ? { ...n, read: true } : n)),
    unread: Math.max(0, state.unread - 1),
  })
  await fetch(apiUrl(`/notifications/${id}/read`), { method: 'POST', headers: authHeaders(true) }).catch(() => {})
}

export async function markAllNotificationsRead() {
  emit({ ...state, items: state.items.map(n => ({ ...n, read: true })), unread: 0 })
  await fetch(apiUrl('/notifications/read-all'), { method: 'POST', headers: authHeaders(true) }).catch(() => {})
}

function onVisible() {
  if (document.visibilityState === 'visible') refreshNotifications()
}

function start() {
  mounted++
  if (mounted > 1) return
  refreshNotifications()
  timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') refreshNotifications()
  }, POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
}

function stop() {
  mounted = Math.max(0, mounted - 1)
  if (mounted > 0) return
  if (timer != null) window.clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisible)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useNotifications(): State {
  useEffect(() => {
    start()
    return stop
  }, [])
  return useSyncExternalStore(subscribe, () => state, () => EMPTY)
}
