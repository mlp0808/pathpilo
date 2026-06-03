'use client'

import Link from 'next/link'
import { UsersIcon } from '@heroicons/react/24/outline'
import { clearClientLocaleStorage } from '@/app/i18n'
import { useAppI18n } from './I18nProvider'

export interface WorkspaceOwner {
  firstName?: string
  lastName?: string
  email?: string
  name?: string | null
}

interface MultiUserAccessWallProps {
  companyName: string
  owner: WorkspaceOwner
  showSwitchCompany?: boolean
}

export default function MultiUserAccessWall({
  companyName,
  owner,
  showSwitchCompany = true,
}: MultiUserAccessWallProps) {
  const { t } = useAppI18n()

  const ownerName =
    owner.name ||
    `${owner.firstName || ''} ${owner.lastName || ''}`.trim() ||
    t('app.multiUserWall.ownerFallback', 'your company admin')

  const handleLogout = () => {
    clearClientLocaleStorage()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/60 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 ring-1 ring-violet-100">
          <UsersIcon className="h-7 w-7 text-violet-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900">
          {t('app.multiUserWall.title', 'This plan does not include team access')}
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {t(
            'app.multiUserWall.description',
            '{{company}} is not on a plan that supports multiple users. Ask the company admin to upgrade so you can access this account again.',
          ).replace('{{company}}', companyName)}
        </p>

        <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {t('app.multiUserWall.contactLabel', 'Company admin')}
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{ownerName}</p>
          {owner.email ? (
            <a
              href={`mailto:${owner.email}`}
              className="mt-0.5 inline-block text-sm text-accent-600 hover:underline"
            >
              {owner.email}
            </a>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {showSwitchCompany && (
            <Link
              href="/select-company"
              className="w-full rounded-xl bg-accent-500 px-4 py-3 text-sm font-bold text-primary-500 hover:bg-accent-600 transition-colors"
            >
              {t('app.multiUserWall.switchCompany', 'Switch to another company')}
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t('app.multiUserWall.signOut', 'Sign out')}
          </button>
        </div>
      </div>
    </div>
  )
}
