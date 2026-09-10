'use client'

/**
 * "+" menu in the global header — start the common create flows from any page.
 * The heavy create modals are loaded on demand so they never ship with the
 * initial bundle of every page.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  ArrowPathIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  PlusIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import { useAppI18n } from './I18nProvider'
import { requestMissionsRefresh } from '@/app/config/missions'

const CreateJob = dynamic(() => import('./CreateJob'), { ssr: false })
const AddClientModal = dynamic(() => import('./AddClientModal'), { ssr: false })

type Flow = 'job' | 'subscription' | 'client'

export default function QuickAddMenu({ companySlug }: { companySlug: string }) {
  const { t } = useAppI18n()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState<Flow | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const start = (next: Flow) => {
    setOpen(false)
    setFlow(next)
  }

  const closeFlow = () => setFlow(null)

  const finishFlow = () => {
    setFlow(null)
    requestMissionsRefresh()
    router.refresh()
  }

  const items: Array<{
    key: string
    label: string
    hint: string
    icon: React.ComponentType<{ className?: string }>
    onSelect: () => void
  }> = [
    {
      key: 'job',
      label: t('app.quickAdd.job', 'New job'),
      hint: t('app.quickAdd.jobHint', 'Schedule a one-off visit'),
      icon: ClipboardDocumentListIcon,
      onSelect: () => start('job'),
    },
    {
      key: 'subscription',
      label: t('app.quickAdd.subscription', 'New subscription'),
      hint: t('app.quickAdd.subscriptionHint', 'Recurring work on a schedule'),
      icon: ArrowPathIcon,
      onSelect: () => start('subscription'),
    },
    {
      key: 'client',
      label: t('app.quickAdd.client', 'New client'),
      hint: t('app.quickAdd.clientHint', 'Add someone to your book'),
      icon: UserPlusIcon,
      onSelect: () => start('client'),
    },
    {
      key: 'invoice',
      label: t('app.quickAdd.invoice', 'New invoice'),
      hint: t('app.quickAdd.invoiceHint', 'Bill completed work'),
      icon: DocumentTextIcon,
      onSelect: () => {
        setOpen(false)
        router.push(companySlug ? `/${companySlug}/invoices/new` : '/invoices/new')
      },
    },
  ]

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('app.quickAdd.label', 'Quick add')}
        className={`inline-flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-2 sm:pr-3 text-[13px] font-semibold transition-colors ${
          open
            ? 'bg-primary-500 text-white'
            : 'bg-gray-900/[0.05] text-gray-700 hover:bg-gray-900/[0.09] hover:text-gray-900'
        }`}
      >
        <PlusIcon className="h-4 w-4 flex-shrink-0" />
        <span className="hidden sm:inline">{t('app.quickAdd.add', 'Add')}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[70] mt-2 w-[16.5rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg shadow-gray-900/10"
        >
          {items.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={item.onSelect}
                className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-gray-50"
              >
                <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent-500/10">
                  <Icon className="h-4 w-4 text-accent-600" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-gray-900">
                    {item.label}
                  </span>
                  <span className="block truncate text-[11px] text-gray-500">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* The header is its own stacking context — portal the modals out of it. */}
      {flow && typeof document !== 'undefined'
        ? createPortal(
            flow === 'client' ? (
              <AddClientModal isOpen onClose={closeFlow} onClientAdded={finishFlow} />
            ) : (
              <CreateJob isOpen mode={flow} onClose={closeFlow} onJobCreated={finishFlow} />
            ),
            document.body,
          )
        : null}
    </div>
  )
}
