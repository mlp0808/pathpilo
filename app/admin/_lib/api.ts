'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../../utils/api'

export function adminToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
      Authorization: `Bearer ${adminToken() || ''}`,
    },
  })
  if (res.status === 401 || res.status === 403) {
    if (typeof window !== 'undefined') window.location.href = '/admin'
    throw new Error('Admin session expired')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`)
  return data as T
}

/** Fetch on mount and whenever `path` changes. Pass `null` to skip. */
export function useAdminData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!path)

  const load = useCallback(async () => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      setData(await adminFetch<T>(path))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { void load() }, [load])

  return { data, error, loading, reload: load, setData }
}
