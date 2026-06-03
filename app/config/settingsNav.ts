import type { ComponentType, SVGProps } from 'react'
import {
  UserIcon,
  BuildingOfficeIcon,
  CreditCardIcon,
  BellIcon,
  InboxIcon,
  PuzzlePieceIcon,
  DocumentTextIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'

export type SettingsNavItem = {
  name: string
  href: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  matchExtra?: string[]
}

export type SettingsNavSection = {
  label: string
  items: SettingsNavItem[]
}

type TranslateFn = (key: string, fallback: string) => string

export function getSettingsBasePath(companySlug: string): string {
  return companySlug ? `/${companySlug}/settings` : '/settings'
}

export function buildSettingsNavSections(
  t: TranslateFn,
  companySlug: string
): SettingsNavSection[] {
  const base = getSettingsBasePath(companySlug)

  return [
    {
      label: t('settings.sidebar.groupAccount', 'Account'),
      items: [
        { name: t('settings.sidebar.user', 'User'), href: `${base}/user`, icon: UserIcon },
      ],
    },
    {
      label: t('settings.sidebar.groupCompany', 'Company'),
      items: [
        { name: t('settings.sidebar.business', 'Business'), href: `${base}/business`, icon: BuildingOfficeIcon },
        { name: t('settings.sidebar.workHours', 'Work hours'), href: `${base}/work-hours`, icon: ClockIcon },
        { name: t('settings.sidebar.leadForm', 'Lead form'), href: `${base}/leads-form`, icon: InboxIcon },
        {
          name: t('settings.sidebar.invoices', 'Invoices'),
          href: `${base}/invoice-options`,
          icon: DocumentTextIcon,
          matchExtra: [
            `${base}/client-terms`,
            `${base}/clients`,
            `${base}/invoice-terms`,
            `${base}/invoices`,
          ],
        },
        {
          name: t('settings.sidebar.notifications', 'Notifications'),
          href: `${base}/notifications`,
          icon: BellIcon,
        },
        {
          name: t('settings.sidebar.planAndBilling', 'Plan & billing'),
          href: `${base}/billing`,
          icon: CreditCardIcon,
        },
      ],
    },
    {
      label: t('settings.sidebar.groupAddOns', 'Add-ons'),
      items: [
        {
          name: t('settings.sidebar.extensions', 'Extensions'),
          href: `${base}/extensions`,
          icon: PuzzlePieceIcon,
        },
      ],
    },
  ]
}

export function isSettingsNavItemActive(pathname: string, item: SettingsNavItem): boolean {
  const candidates = [item.href, ...(item.matchExtra ?? [])]
  return candidates.some((href) => pathname === href || pathname.startsWith(`${href}/`))
}
