'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckIcon, ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { apiUrl } from '@/app/utils/api'
import { useAppI18n } from '@/app/components/I18nProvider'

/**
 * Optional activation checklist shown above the dashboard. Nothing here is
 * enforced — the API derives each tick from data the company already has, so
 * the list fills in as the owner works and can be dismissed at any time.
 */
const ACTIONS = [
  {
    id: 'client',
    titleKey: 'dashboard.gettingStarted.client.title',
    title: 'Create a client',
    descriptionKey: 'dashboard.gettingStarted.client.description',
    description: 'Add the people and businesses you work for.',
    href: (slug: string) => `/${slug}/clients`,
  },
  {
    id: 'services',
    titleKey: 'dashboard.gettingStarted.services.title',
    title: 'Set up your services',
    descriptionKey: 'dashboard.gettingStarted.services.description',
    description: 'Save your prices and durations so jobs fill themselves in.',
    href: (slug: string) => `/${slug}/services`,
  },
  {
    id: 'job',
    titleKey: 'dashboard.gettingStarted.job.title',
    title: 'Schedule your first job',
    descriptionKey: 'dashboard.gettingStarted.job.description',
    description: 'Put some work on the calendar.',
    href: (slug: string) => `/${slug}/jobs`,
  },
  {
    id: 'route',
    titleKey: 'dashboard.gettingStarted.route.title',
    title: 'Create your first route',
    descriptionKey: 'dashboard.gettingStarted.route.description',
    description: 'Let PathPilo order the day’s stops for you.',
    href: (slug: string) => `/${slug}/map?focus=day`,
  },
  {
    id: 'completed_job',
    titleKey: 'dashboard.gettingStarted.completedJob.title',
    title: 'Complete a job',
    descriptionKey: 'dashboard.gettingStarted.completedJob.description',
    description: 'Mark work as done to build up your history.',
    href: (slug: string) => `/${slug}/jobs`,
  },
  {
    id: 'invoice',
    titleKey: 'dashboard.gettingStarted.invoice.title',
    title: 'Invoice a client',
    descriptionKey: 'dashboard.gettingStarted.invoice.description',
    description: 'Turn finished work into money in the bank.',
    href: (slug: string) => `/${slug}/invoices`,
  },
] as const

export default function GettingStartedPanel({ companySlug }: { companySlug: string }) {
  const { t } = useAppI18n()
  const [actions, setActions] = useState<Record<string, boolean> | null>(null)
  const [hidden, setHidden] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) return
      const res = await fetch(apiUrl('/companies/getting-started'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setActions(data.actions || {})
      setHidden(data.dismissed === true)
    } catch {
      /* leave the panel hidden on failure — it is not critical */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dismiss = async () => {
    setHidden(true)
    try {
      const token = localStorage.getItem('token')
      await fetch(apiUrl('/companies/getting-started/dismissed'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissed: true }),
      })
    } catch {
      /* the local state already hid it */
    }
  }

  if (!actions || hidden) return null

  const doneCount = ACTIONS.filter((a) => actions[a.id]).length
  const allDone = doneCount === ACTIONS.length
  const progress = Math.round((doneCount / ACTIONS.length) * 100)

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">
            {allDone
              ? t('dashboard.gettingStarted.titleDone', 'You’re all set up')
              : t('dashboard.gettingStarted.title', 'Getting started')}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600">
            {allDone
              ? t(
                  'dashboard.gettingStarted.subtitleDone',
                  'Nice work — you’ve been through everything PathPilo needs to earn its keep.',
                )
              : t(
                  'dashboard.gettingStarted.subtitle',
                  'Optional, but these are the fastest way to get PathPilo working for you.',
                )}
          </p>
        </div>

        <div className="flex flex-none items-center gap-1">
          <span className="mr-1 hidden text-sm font-medium text-gray-500 sm:inline">
            {doneCount}/{ACTIONS.length}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={
              collapsed
                ? t('dashboard.gettingStarted.expand', 'Expand checklist')
                : t('dashboard.gettingStarted.collapse', 'Collapse checklist')
            }
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('dashboard.gettingStarted.dismiss', 'Hide checklist')}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-accent-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {!collapsed && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((action) => {
            const isDone = actions[action.id] === true
            return (
              <li key={action.id}>
                <Link
                  href={action.href(companySlug)}
                  className={[
                    'flex h-full items-start gap-3 rounded-xl border p-3 transition-all',
                    isDone
                      ? 'border-accent-200 bg-accent-50/40'
                      : 'border-gray-200 bg-white hover:border-accent-300 hover:bg-accent-50/30',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border',
                      isDone ? 'border-accent-500 bg-accent-500' : 'border-gray-300 bg-white',
                    ].join(' ')}
                  >
                    {isDone && <CheckIcon className="h-3 w-3 text-white" />}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={[
                        'block text-sm font-medium',
                        isDone ? 'text-gray-500 line-through' : 'text-gray-900',
                      ].join(' ')}
                    >
                      {t(action.titleKey, action.title)}
                    </span>
                    {!isDone && (
                      <span className="mt-0.5 block text-xs text-gray-500">
                        {t(action.descriptionKey, action.description)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
