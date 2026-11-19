'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  BoldIcon,
  LinkIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { apiUrl } from '@/app/utils/api'
import GuideText from '@/app/components/guides/GuideText'
import { Card, ErrorBox, Spinner } from '../../_components/ui'
import TriggerPicker, { TriggerKindIcon } from '../../_components/TriggerPicker'

interface AdminGuide {
  id: number
  slug: string
  title: string
  description: string
  icon: string
  isPublished: boolean
}

interface AdminStep {
  id: number
  sortOrder: number
  title: string
  body: string
  mediaType: 'none' | 'image' | 'video'
  mediaPath: string | null
  mediaUrl: string | null
  ctaLabel: string | null
  ctaHref: string | null
  doneTrigger: string | null
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  }
}

export default function AdminGuideEditorPage() {
  const params = useParams<{ id: string }>()
  const guideId = Number(params?.id)

  const [guide, setGuide] = useState<AdminGuide | null>(null)
  const [steps, setSteps] = useState<AdminStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`/admin/guides/${guideId}`), { headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load guide')
      setGuide(data.guide)
      setSteps(data.steps || [])
      setSelectedId((current) =>
        current && (data.steps || []).some((s: AdminStep) => s.id === current)
          ? current
          : (data.steps || [])[0]?.id ?? null
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load guide')
    } finally {
      setLoading(false)
    }
  }, [guideId])

  useEffect(() => {
    if (Number.isFinite(guideId)) load()
  }, [guideId, load])

  const selected = useMemo(() => steps.find((s) => s.id === selectedId) || null, [steps, selectedId])

  const saveGuide = async (patch: Partial<AdminGuide>) => {
    if (!guide) return
    setGuide({ ...guide, ...patch })
    await fetch(apiUrl(`/admin/guides/${guideId}`), {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    }).catch(() => load())
  }

  const addStep = async () => {
    const res = await fetch(apiUrl(`/admin/guides/${guideId}/steps`), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title: `Step ${steps.length + 1}` }),
    })
    const data = await res.json()
    if (!res.ok) return setError(data.error || 'Failed to add step')
    setSteps((list) => [...list, data.step])
    setSelectedId(data.step.id)
  }

  const moveStep = async (index: number, delta: number) => {
    const next = [...steps]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setSteps(next)
    await fetch(apiUrl(`/admin/guides/${guideId}/steps/reorder`), {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ ids: next.map((s) => s.id) }),
    }).catch(() => load())
  }

  const deleteStep = async (step: AdminStep) => {
    if (!window.confirm(`Delete "${step.title}"?`)) return
    await fetch(apiUrl(`/admin/guides/${guideId}/steps/${step.id}`), {
      method: 'DELETE',
      headers: authHeaders(),
    })
    setSteps((list) => list.filter((s) => s.id !== step.id))
    if (selectedId === step.id) setSelectedId(null)
  }

  if (loading) return <Spinner />
  if (error && !guide) return <ErrorBox message={error} />
  if (!guide) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/guides"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          All guides
        </Link>
        <span className="text-xs text-gray-400">/{guide.slug}</span>
      </div>

      {error && <ErrorBox message={error} />}

      <Card title="Guide">
        <div className="grid gap-4 sm:grid-cols-[80px_1fr]">
          <label>
            <span className="mb-1 block text-xs font-semibold text-gray-600">Icon</span>
            <input
              value={guide.icon}
              onChange={(e) => setGuide({ ...guide, icon: e.target.value })}
              onBlur={(e) => saveGuide({ icon: e.target.value })}
              placeholder="🚀"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-center text-lg outline-none focus:border-emerald-400"
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-gray-600">Title</span>
            <input
              value={guide.title}
              onChange={(e) => setGuide({ ...guide, title: e.target.value })}
              onBlur={(e) => saveGuide({ title: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
          </label>
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Short description</span>
          <input
            value={guide.description}
            onChange={(e) => setGuide({ ...guide, description: e.target.value })}
            onBlur={(e) => saveGuide({ description: e.target.value })}
            placeholder="One line explaining what the user will be able to do."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={guide.isPublished}
            onChange={(e) => saveGuide({ isPublished: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          Published — visible to users
        </label>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card
          title="Steps"
          bodyClassName="p-0"
          actions={
            <button
              type="button"
              onClick={addStep}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add
            </button>
          }
        >
          {steps.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No steps yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {steps.map((step, index) => (
                <li
                  key={step.id}
                  className={`flex items-center gap-2 px-3 py-2.5 ${
                    step.id === selectedId ? 'bg-emerald-50/60' : ''
                  }`}
                >
                  <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-gray-400">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedId(step.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-800 hover:text-emerald-700"
                  >
                    {step.title || 'Untitled step'}
                  </button>
                  <span className="shrink-0 text-gray-300" title={step.doneTrigger || 'Reading step'}>
                    <TriggerKindIcon value={step.doneTrigger} />
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => moveStep(index, -1)}
                      disabled={index === 0}
                      className="rounded p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUpIcon className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveStep(index, 1)}
                      disabled={index === steps.length - 1}
                      className="rounded p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDownIcon className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteStep(step)}
                    className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete step"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <StepEditor
            key={selected.id}
            guideId={guideId}
            step={selected}
            onSaved={(saved) => setSteps((list) => list.map((s) => (s.id === saved.id ? saved : s)))}
          />
        ) : (
          <Card>
            <p className="py-10 text-center text-sm text-gray-400">
              Pick a step on the left, or add the first one.
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}

function StepEditor({
  guideId,
  step,
  onSaved,
}: {
  guideId: number
  step: AdminStep
  onSaved: (step: AdminStep) => void
}) {
  const [form, setForm] = useState({
    title: step.title,
    body: step.body,
    mediaType: step.mediaType,
    mediaPath: step.mediaPath,
    mediaUrl: step.mediaUrl,
    ctaLabel: step.ctaLabel || '',
    ctaHref: step.ctaHref || '',
    doneTrigger: step.doneTrigger || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  /** Wraps the current selection, e.g. **like this** or [like this](/{slug}/jobs). */
  const wrapSelection = (before: string, after: string, placeholder: string) => {
    const el = bodyRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = form.body.slice(start, end) || placeholder
    const next = form.body.slice(0, start) + before + selected + after + form.body.slice(end)
    set('body', next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const upload = async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch(apiUrl('/admin/guides/media'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setForm((f) => ({
        ...f,
        mediaType: data.mediaType,
        mediaPath: data.mediaPath,
        mediaUrl: data.mediaUrl,
      }))
      setSaved(false)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(apiUrl(`/admin/guides/${guideId}/steps/${step.id}`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save step')
      onSaved(data.step)
      setSaved(true)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Failed to save step')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title="Step"
      actions={
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
          <button
            type="button"
            onClick={save}
            disabled={saving || !form.title.trim()}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save step'}
          </button>
        </div>
      }
    >
      {uploadError && <div className="mb-4"><ErrorBox message={uploadError} /></div>}

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-gray-600">Title</span>
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Create your first client"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
        />
      </label>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-600">Text</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => wrapSelection('**', '**', 'bold text')}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
            >
              <BoldIcon className="h-3 w-3" />
              Bold
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('[', '](/{slug}/clients)', 'link text')}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50"
            >
              <LinkIcon className="h-3 w-3" />
              Link
            </button>
          </div>
        </div>
        <textarea
          ref={bodyRef}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          rows={6}
          placeholder="Open [Clients](/{slug}/clients) and click **+ New client**."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[12px] leading-relaxed outline-none focus:border-emerald-400"
        />
        <p className="mt-1 text-[11px] text-gray-400">
          <code>**bold**</code>, <code>[label](/&#123;slug&#125;/jobs)</code>, blank line for a new paragraph.
          <code> &#123;slug&#125;</code> becomes the user&apos;s company.
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Preview</p>
        <p className="text-sm font-semibold text-gray-900">{form.title || 'Untitled step'}</p>
        <GuideText text={form.body} companySlug="acme" className="mt-1.5" />
      </div>

      <div className="mt-5">
        <span className="mb-1 block text-xs font-semibold text-gray-600">Video or image</span>
        {form.mediaUrl ? (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-black">
              {form.mediaType === 'video' ? (
                <video src={form.mediaUrl} controls muted playsInline className="max-h-64 w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.mediaUrl} alt="" className="max-h-64 w-full object-contain" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, mediaType: 'none', mediaPath: null, mediaUrl: null }))}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Remove media
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm font-medium text-gray-500 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
          >
            <PhotoIcon className="h-5 w-5" />
            {uploading ? 'Uploading…' : 'Upload a short silent screen recording or an image'}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload(file)
            e.target.value = ''
          }}
        />
        <p className="mt-1 text-[11px] text-gray-400">
          MP4 or WebM up to 40 MB. Videos autoplay muted and loop; clicking one replays it full screen.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-xs font-semibold text-gray-600">Link text (optional)</span>
          <input
            value={form.ctaLabel}
            onChange={(e) => set('ctaLabel', e.target.value)}
            placeholder="Go to Clients"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-gray-600">Link goes to</span>
          <input
            value={form.ctaHref}
            onChange={(e) => set('ctaHref', e.target.value)}
            placeholder="/{slug}/clients"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-[12px] outline-none focus:border-emerald-400"
          />
        </label>
      </div>

      <div className="mt-5">
        <TriggerPicker value={form.doneTrigger} onChange={(value) => set('doneTrigger', value)} />
      </div>
    </Card>
  )
}
