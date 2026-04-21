'use client'

import Link from 'next/link'
import { clearClientLocaleStorage } from '@/app/i18n'

export default function SuspendedPage() {
  const handleLogout = () => {
    try {
      clearClientLocaleStorage()
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    } catch {
      // ignore — still navigate to login
    }
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <div className="max-w-lg w-full rounded-2xl border border-amber-200 bg-white p-8 shadow-sm text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-7 w-7 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-7.938 4h15.876c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L2.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-primary-900">This company has expired</h1>
        <p className="mt-3 text-gray-600">
          This workspace is currently on hold. Contact the company owner, or visit our support page for help.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="https://pathpilo.com/contact" className="btn-primary">
            Go to support
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
