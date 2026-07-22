import type { BreadcrumbItem } from '../components/Breadcrumbs'
import type { MarketingLocale } from './i18n'

/** Breadcrumb trails for common marketing routes (visible UI + JSON-LD). */
export function breadcrumbsForRoute(lang: MarketingLocale, route: string): BreadcrumbItem[] {
  const da = lang === 'da'
  const home: BreadcrumbItem = { label: da ? 'Hjem' : 'Home', href: `/${lang}` }

  const map: Record<string, BreadcrumbItem[]> = {
    about: [home, { label: da ? 'Om os' : 'About' }],
    contact: [home, { label: da ? 'Kontakt' : 'Contact' }],
    faq: [home, { label: 'FAQ' }],
    pricing: [home, { label: da ? 'Priser' : 'Pricing' }],
    terms: [home, { label: da ? 'Servicevilkår' : 'Terms of Service' }],
    privacy: [home, { label: da ? 'Privatlivspolitik' : 'Privacy Policy' }],
    tools: [home, { label: da ? 'Værktøjer' : 'Tools' }],
    'tools/route-planner': [
      home,
      { label: da ? 'Værktøjer' : 'Tools', href: `/${lang}/tools` },
      { label: da ? 'Ruteplanlægger' : 'Route Planner' },
    ],
    'features/routeplanning': [
      home,
      { label: da ? 'Routeplanning' : 'Route Planning' },
    ],
    'features/subscriptions': [
      home,
      { label: da ? 'Abonnementsopgaver' : 'Recurring Jobs' },
    ],
    'features/team': [home, { label: da ? 'Teamstyring' : 'Team Management' }],
    'features/scheduling': [
      home,
      { label: da ? 'Opgaveplanlægning' : 'Job Scheduling' },
    ],
    'features/leads': [home, { label: da ? 'Leadformularer' : 'Lead Forms' }],
    'features/reminders': [
      home,
      { label: da ? 'Kundepåmindelser' : 'Client Reminders' },
    ],
    'features/analytics': [
      home,
      { label: da ? 'Dashboard & statistik' : 'Analytics' },
    ],
    'features/services': [home, { label: da ? 'Ydelser' : 'Service Catalog' }],
  }

  return map[route] ?? []
}

export function industryBreadcrumbs(
  lang: MarketingLocale,
  menuLabel: string,
): BreadcrumbItem[] {
  const da = lang === 'da'
  return [
    { label: da ? 'Hjem' : 'Home', href: `/${lang}` },
    { label: da ? 'Brancher' : 'Industries', href: `/${lang}/industries` },
    { label: menuLabel },
  ]
}

export function comparisonBreadcrumbs(
  lang: MarketingLocale,
  headline: string,
): BreadcrumbItem[] {
  const da = lang === 'da'
  return [
    { label: da ? 'Hjem' : 'Home', href: `/${lang}` },
    { label: da ? 'Sammenligninger' : 'Comparisons', href: `/${lang}/comparisons` },
    { label: headline },
  ]
}
