'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/admin/overview',     label: 'Overview' },
  { href: '/admin/users',        label: 'Users' },
  { href: '/admin/funnel',       label: 'Lead Funnel' },
  { href: '/admin/emails',       label: 'Funnel Emails' },
  { href: '/admin/companies',    label: 'Companies' },
  { href: '/admin/video-guides', label: 'Video Guides' },
  { href: '/admin/trials',       label: 'Trials' },
  { href: '/admin/coupons',      label: 'Coupons' },
  { href: '/admin/activity',     label: 'Activity' },
]

export default function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()

  function signOut() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/admin')
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center justify-between px-6 py-3 max-w-screen-2xl mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-5 min-w-0">
          <span className="text-sm font-bold text-gray-900 tracking-tight whitespace-nowrap">
            PathPilo<span className="text-gray-400 font-medium"> Admin</span>
          </span>

          {/* Nav links */}
          <div className="flex items-center gap-0.5 flex-wrap">
            {NAV_ITEMS.map(({ href, label }) => {
              // Match /admin/companies/[id] → companies is active
              const active = pathname === href || (href !== '/admin/overview' && pathname.startsWith(href + '/'))
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={signOut}
          className="ml-4 text-[13px] text-gray-400 hover:text-gray-900 transition-colors whitespace-nowrap"
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
