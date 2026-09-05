'use client'

/**
 * Location trail for the global app header.
 * Derived from the URL so no page has to opt in: /acme/clients/42 → Clients › #42
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline'
import { useAppI18n } from './I18nProvider'

/** URL prefixes that are not a company slug. */
const NON_COMPANY_SEGMENTS = new Set([
  'setup',
  'login',
  'register',
  'invite',
  'select-company',
  'settings',
  'admin',
  'offer',
])

function humanize(segment: string): string {
  const spaced = segment.replace(/[-_]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export default function AppBreadcrumbs() {
  const { t } = useAppI18n()
  const pathname = usePathname() || '/'

  const segments = pathname.split('/').filter(Boolean)
  const hasCompany = segments.length > 0 && !NON_COMPANY_SEGMENTS.has(segments[0])
  const slug = hasCompany ? segments[0] : ''
  const rest = hasCompany ? segments.slice(1) : segments

  const labels: Record<string, string> = {
    dashboard: t('app.nav.dashboard', 'Dashboard'),
    jobs: t('app.nav.jobs', 'Jobs'),
    map: t('app.nav.map', 'Map'),
    clients: t('app.nav.clients', 'Clients'),
    invoices: t('app.nav.invoices', 'Invoices'),
    leads: t('app.nav.leads', 'Leads'),
    team: t('app.nav.team', 'Team'),
    services: t('app.nav.items', 'Items'),
    settings: t('app.sidebar.settings', 'Settings'),
    recurring: t('app.recurring.title', 'Recurring'),
    rounds: t('app.recurring.roundsTitle', 'Rounds'),
    subscriptions: t('app.recurring.subscriptionsTitle', 'Subscriptions'),
    new: t('app.breadcrumbs.new', 'New'),
  }

  const homeHref = slug ? `/${slug}/dashboard` : '/dashboard'

  const crumbs = rest.map((segment, idx) => {
    const isNumeric = /^\d+$/.test(segment)
    const href = `${slug ? `/${slug}` : ''}/${rest.slice(0, idx + 1).join('/')}`
    return {
      key: `${segment}-${idx}`,
      label: isNumeric ? `#${segment}` : labels[segment] || humanize(segment),
      href,
      // Detail ids are never linkable on their own.
      linkable: !isNumeric,
    }
  })

  if (crumbs.length === 0) return null

  const showHome = crumbs[0]?.href !== homeHref

  return (
    <nav
      aria-label={t('app.breadcrumbs.label', 'Breadcrumb')}
      className="min-w-0 flex items-center gap-1 text-[13px]"
    >
      {showHome && (
        <>
          <Link
            href={homeHref}
            className="hidden sm:flex flex-shrink-0 items-center rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-900/[0.05] hover:text-gray-700"
            aria-label={labels.dashboard}
          >
            <HomeIcon className="h-4 w-4" />
          </Link>
          <ChevronRightIcon className="hidden sm:block h-3.5 w-3.5 flex-shrink-0 text-gray-300" aria-hidden />
        </>
      )}

      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1
        return (
          <span
            key={crumb.key}
            // Only the current page survives on narrow screens.
            className={`min-w-0 flex items-center gap-1 ${isLast ? '' : 'hidden sm:flex'}`}
          >
            {isLast || !crumb.linkable ? (
              <span
                className={`truncate ${isLast ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
                aria-current={isLast ? 'page' : undefined}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate rounded-md px-1 py-0.5 text-gray-500 transition-colors hover:bg-gray-900/[0.05] hover:text-gray-900"
              >
                {crumb.label}
              </Link>
            )}
            {!isLast && (
              <ChevronRightIcon className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" aria-hidden />
            )}
          </span>
        )
      })}
    </nav>
  )
}
