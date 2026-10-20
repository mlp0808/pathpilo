'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  BoltIcon,
  BuildingOffice2Icon,
  ChartBarSquareIcon,
  PlayCircleIcon,
  TicketIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

const NAV = [
  { href: '/admin/overview', label: 'Overview', icon: ChartBarSquareIcon },
  { href: '/admin/people', label: 'People', icon: UsersIcon },
  { href: '/admin/companies', label: 'Companies', icon: BuildingOffice2Icon },
  { href: '/admin/activity', label: 'Activity', icon: BoltIcon },
]

const CONTENT_NAV = [
  { href: '/admin/video-guides', label: 'Video guides', icon: PlayCircleIcon },
  { href: '/admin/coupons', label: 'Coupons', icon: TicketIcon },
]

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const item = ({ href, label, icon: Icon }: (typeof NAV)[number]) => {
    const active = pathname === href || pathname.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
          active ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    )
  }
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(item)}
      <p className="mb-1 mt-5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Content &amp; billing</p>
      {CONTENT_NAV.map(item)}
    </nav>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/admin'
  const router = useRouter()
  const isLogin = pathname === '/admin'
  const [ready, setReady] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (isLogin) return
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null')
      if (!localStorage.getItem('token') || user?.role !== 'admin') {
        router.replace('/admin')
        return
      }
      setReady(true)
    } catch {
      router.replace('/admin')
    }
  }, [isLogin, router])

  if (isLogin) return <>{children}</>
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  const signOut = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/admin')
  }

  const brand = (
    <div className="flex items-center gap-2 px-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-white">P</span>
      <span className="text-sm font-bold text-white">PathPilo <span className="font-medium text-gray-400">Admin</span></span>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col bg-gray-950 px-3 py-5 lg:flex">
        {brand}
        <div className="mt-6 flex-1">
          <NavLinks pathname={pathname} />
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-gray-400 hover:bg-white/5 hover:text-white"
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4" />
          Sign out
        </button>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between bg-gray-950 px-4 py-3 lg:hidden">
        {brand}
        <button type="button" onClick={() => setMenuOpen((v) => !v)} className="rounded-lg p-1.5 text-gray-300 hover:bg-white/10">
          {menuOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
        </button>
      </header>
      {menuOpen && (
        <div className="fixed inset-x-0 top-[52px] z-40 border-t border-white/10 bg-gray-950 px-3 pb-4 pt-2 lg:hidden">
          <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          <button type="button" onClick={signOut} className="mt-3 w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-gray-400 hover:bg-white/5">
            Sign out
          </button>
        </div>
      )}

      <main className="lg:pl-56">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  )
}
