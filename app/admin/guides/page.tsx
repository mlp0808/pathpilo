'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '@/app/utils/api'
import { Card, Chip, Empty, ErrorBox, PageHeader, Spinner } from '../_components/ui'

interface AdminGuide {
  id: number
  slug: string
  title: string
  description: string
  icon: string
  sortOrder: number
  isPublished: boolean
  stepCount: number
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  }
}

export default function AdminGuidesPage() {
  const [guides, setGuides] = useState<AdminGuide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/admin/guides'), { headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load guides')
      setGuides(Array.isArray(data.guides) ? data.guides : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load guides')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    const title = newTitle.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      const res = await fetch(apiUrl('/admin/guides'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title, isPublished: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create guide')
      setNewTitle('')
      setCreating(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create guide')
    } finally {
      setBusy(false)
    }
  }

  const togglePublished = async (guide: AdminGuide) => {
    setGuides((list) =>
      list.map((g) => (g.id === guide.id ? { ...g, isPublished: !g.isPublished } : g))
    )
    await fetch(apiUrl(`/admin/guides/${guide.id}`), {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ isPublished: !guide.isPublished }),
    }).catch(() => load())
  }

  const move = async (index: number, delta: number) => {
    const next = [...guides]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setGuides(next)
    await fetch(apiUrl('/admin/guides/reorder'), {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ ids: next.map((g) => g.id) }),
    }).catch(() => load())
  }

  const remove = async (guide: AdminGuide) => {
    if (!window.confirm(`Delete "${guide.title}" and all of its steps?`)) return
    await fetch(apiUrl(`/admin/guides/${guide.id}`), { method: 'DELETE', headers: authHeaders() })
    load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guides"
        subtitle="The in-app guidebook. Users see the next unfinished step as a banner at the top of every page."
        actions={
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
          >
            <PlusIcon className="h-4 w-4" />
            New guide
          </button>
        }
      />

      {error && <ErrorBox message={error} />}

      {creating && (
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[240px] flex-1">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Guide title</span>
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
                placeholder="e.g. Get started"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </label>
            <button
              type="button"
              onClick={create}
              disabled={busy || !newTitle.trim()}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewTitle('') }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            New guides start unpublished so you can add steps before anyone sees them.
          </p>
        </Card>
      )}

      <Card bodyClassName="p-0">
        {loading ? (
          <Spinner />
        ) : guides.length === 0 ? (
          <Empty>No guides yet. Create one to get started.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100">
            {guides.map((guide, index) => (
              <li key={guide.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move up"
                  >
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === guides.length - 1}
                    className="rounded p-0.5 text-gray-300 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move down"
                  >
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-lg">
                  {guide.icon || '📘'}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/guides/${guide.id}`}
                    className="text-sm font-semibold text-gray-900 hover:text-emerald-700 hover:underline"
                  >
                    {guide.title}
                  </Link>
                  <p className="truncate text-xs text-gray-500">{guide.description || 'No description'}</p>
                </div>

                <span className="text-xs tabular-nums text-gray-400">
                  {guide.stepCount} {guide.stepCount === 1 ? 'step' : 'steps'}
                </span>

                <button type="button" onClick={() => togglePublished(guide)}>
                  {guide.isPublished ? (
                    <Chip className="bg-emerald-50 text-emerald-700 ring-emerald-200">Published</Chip>
                  ) : (
                    <Chip className="bg-gray-50 text-gray-500 ring-gray-200">Draft</Chip>
                  )}
                </button>

                <div className="flex items-center gap-1">
                  <Link
                    href={`/admin/guides/${guide.id}`}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Edit guide"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(guide)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete guide"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
